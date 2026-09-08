/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AppSettings,
  CalibrationData,
  GestureType,
  HandFingersState,
  HandTrackingState,
  PickableObject,
  RobotJointAngles,
  TrackingMetrics,
} from './types';
import {
  createHumanoidRobot,
  HumanoidRobotRig,
} from './robot/robotModel';
import {
  CAMERA_PRESETS,
  LabEnvironment,
  setupLabEnvironment,
} from './robot/environment';
import {
  createPickAndPlaceStation,
  PickPlaceStation,
} from './robot/pickAndPlace';
import { VisionManager } from './vision/visionManager';
import {
  clamp,
  freshHandFingers,
  freshRobotJointAngles,
  LandmarkPoint,
  lerp,
  setRetargeterBodyBoundary,
} from './vision/motionRetargeter';
import { DemoFrame, generateDemoSequence } from './vision/demoPlayer';
import { MotionTrailsManager } from './robot/motionTrails';
import { SaccadeEngine } from './robot/saccadeEngine';
import { Header } from './components/Header';
import { CameraView } from './components/CameraView';
import { RobotViewport } from './components/RobotViewport';
import { PickPlacePanel } from './components/PickPlacePanel';
import { DebugDrawer } from './components/DebugDrawer';
import { CalibrationModal } from './components/CalibrationModal';
import { SettingsModal } from './components/SettingsModal';

// Shortest angular difference interpolation to prevent 360-degree Euler wrapping and flipping through zero
function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

// MediaPipe Connection lines for video overlay
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
];

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

export default function App() {
  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const robotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Three.js & Vision instances
  const envRef = useRef<LabEnvironment | null>(null);
  const robotRigRef = useRef<HumanoidRobotRig | null>(null);
  const pickPlaceStationRef = useRef<PickPlaceStation | null>(null);
  const visionManagerRef = useRef<VisionManager | null>(null);
  const motionTrailsRef = useRef<MotionTrailsManager | null>(null);

  // High-performance throttling refs (prevents UI re-renders on every camera frame)
  const lastGestureRef = useRef<GestureType>('—');
  const lastResponseRef = useRef<string>('IDLE');
  const lastUiStateUpdateTimeRef = useRef<number>(0);
  const lastPickPlaceStatusRef = useRef<string>('STATION READY');
  const lastHeldObjectRef = useRef<PickableObject | null>(null);

  // Application State
  const [mode, setMode] = useState<'LIVE' | 'DEMO' | 'CALIBRATING'>('LIVE');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [robotResponseState, setRobotResponseState] = useState<string>('IDLE');
  const [currentGesture, setCurrentGesture] = useState<GestureType>('—');
  const [pickPlaceStatus, setPickPlaceStatus] = useState<string>('STATION READY');
  const [heldObject, setHeldObject] = useState<PickableObject | null>(null);
  const [placedCount, setPlacedCount] = useState<number>(0);

  // Modals & Panels
  const [isPickPlacePanelOpen, setIsPickPlacePanelOpen] = useState<boolean>(false);
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Calibration State
  const [calibration, setCalibration] = useState<CalibrationData>({
    isCalibrating: false,
    progress: 0,
    shoulderWidthRef: 0.25,
    armLengthRef: 0.55,
    neutralHead: { yaw: 0, pitch: 0 },
    samplesCount: 0,
    isDone: false,
  });
  const calibrationSamplesRef = useRef<number[]>([]);
  const isCalibratingRef = useRef(calibration.isCalibrating);
  useEffect(() => {
    isCalibratingRef.current = calibration.isCalibrating;
  }, [calibration.isCalibrating]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Settings State
  const [settings, setSettings] = useState<AppSettings>({
    smoothingTau: 0.02, // Ultra-fast, immediate motion tracking response
    motionGain: 1.0,
    mirrorView: true,
    showSkeleton: true,
    showFingers: true,
    poseModelQuality: 'lite', // Ultra-fast 30+ FPS pose tracking
    cameraView: 'front',
    enablePickPlace: true,
    enableDebug: false,
    soundEnabled: true,
    soundVolume: 0.55,
    motionTrailsEnabled: true,
    showGestureGuide: true,
    enableSaccades: true,
    enableOneEuroFilter: true,
    studioLightingEnabled: true,
    bodyBoundaryEnabled: true,
    showBodyBoundaryShield: false,
    futuristicMode: false,
    responsePreset: 'ultra_fast',
    poseConfidenceThreshold: 0.25,
    showLatencyDiagnostics: true,
  });

  const [boundaryDeflection, setBoundaryDeflection] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const settingsRef = useRef<AppSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
    setRetargeterBodyBoundary(settings.bodyBoundaryEnabled);
    if (visionManagerRef.current) {
      visionManagerRef.current.setResponsePreset(settings.responsePreset);
      visionManagerRef.current.setPoseConfidenceThreshold(settings.poseConfidenceThreshold);
      visionManagerRef.current.setMotionGain(settings.motionGain);
      visionManagerRef.current.setUseOneEuroFilter(settings.enableOneEuroFilter);
    }
  }, [settings]);

  // Autonomous Saccade Engine ref & active scanning indicator
  const saccadeEngineRef = useRef<SaccadeEngine>(new SaccadeEngine(true));
  const [isSaccadingActive, setIsSaccadingActive] = useState<boolean>(false);

  // Current Live Kinematics (smoothed for display & rendering)
  const currentAnglesRef = useRef<RobotJointAngles>(freshRobotJointAngles());
  const prevAnglesRef = useRef<RobotJointAngles>(freshRobotJointAngles());
  const targetAnglesRef = useRef<RobotJointAngles>(freshRobotJointAngles());
  const leftFingersRef = useRef<HandFingersState>(freshHandFingers());
  const targetLeftFingersRef = useRef<HandFingersState>(freshHandFingers());
  const rightFingersRef = useRef<HandFingersState>(freshHandFingers());
  const targetRightFingersRef = useRef<HandFingersState>(freshHandFingers());

  // Tracking state for UI
  const [leftHandState, setLeftHandState] = useState<HandTrackingState>({
    detected: false,
    confidence: 0,
    rawLabel: null,
    wristPos: { x: 0, y: 0, z: 0 },
    wristOrientation: { roll: 0, pitch: 0, yaw: 0 },
    fingers: freshHandFingers(),
    gesture: '—',
    pinchDistance: 1,
    isGrip: false,
  });

  const [rightHandState, setRightHandState] = useState<HandTrackingState>({
    detected: false,
    confidence: 0,
    rawLabel: null,
    wristPos: { x: 0, y: 0, z: 0 },
    wristOrientation: { roll: 0, pitch: 0, yaw: 0 },
    fingers: freshHandFingers(),
    gesture: '—',
    pinchDistance: 1,
    isGrip: false,
  });

  const [metrics, setMetrics] = useState<TrackingMetrics>({
    renderFps: 0,
    visionFps: 0,
    latencyMs: 0,
    poseConfidence: 0,
    leftHandConfidence: 0,
    rightHandConfidence: 0,
    faceConfidence: 0,
    activeArmSource: { left: 'NONE', right: 'NONE' },
  });

  // FPS measurement
  const renderFpsBufferRef = useRef<number[]>([]);
  const lastRenderTimeRef = useRef<number>(performance.now());

  // Demo playback ref
  const demoSequenceRef = useRef<DemoFrame[]>([]);
  const demoStartTimeRef = useRef<number>(0);

  // -------------------------------------------------------------
  // 1. Initialize Three.js Robotics Laboratory & Models
  // -------------------------------------------------------------
  useEffect(() => {
    if (!robotCanvasRef.current) return;

    // Build light robotics lab environment
    const env = setupLabEnvironment(robotCanvasRef.current);
    envRef.current = env;

    // Build realistic articulated half-body humanoid robot
    const robotRig = createHumanoidRobot();
    robotRigRef.current = robotRig;
    env.scene.add(robotRig.root);

    // Build pick and place virtual table & objects
    const station = createPickAndPlaceStation(env.scene);
    pickPlaceStationRef.current = station;

    // Build 3D hand motion trails manager
    const motionTrails = new MotionTrailsManager(env.scene);
    motionTrailsRef.current = motionTrails;

    // Pre-generate demo sequence
    demoSequenceRef.current = generateDemoSequence();

    // Resize observer for responsive 3D canvas
    const handleResize = () => {
      if (!robotCanvasRef.current || !envRef.current) return;
      const rect = robotCanvasRef.current.getBoundingClientRect();
      envRef.current.resize(rect.width, rect.height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (robotCanvasRef.current.parentElement) {
      resizeObserver.observe(robotCanvasRef.current.parentElement);
    }
    handleResize();

    // -----------------------------------------------------------
    // 2. Continuous 60-120 FPS High-Performance Render Loop
    // (Decoupled completely from Vision so it NEVER freezes!)
    // -----------------------------------------------------------
    let animId: number;

    const renderLoop = (time: number) => {
      animId = requestAnimationFrame(renderLoop);

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastRenderTimeRef.current) / 1000);
      lastRenderTimeRef.current = now;

      // Measure instantaneous render FPS
      const instFps = 1 / Math.max(0.001, dt);
      renderFpsBufferRef.current.push(instFps);
      if (renderFpsBufferRef.current.length > 30) {
        renderFpsBufferRef.current.shift();
      }

      // Handle Demo Mode animation playback
      if (mode === 'DEMO' && demoSequenceRef.current.length > 0) {
        const elapsed = (now - demoStartTimeRef.current) % 14000;
        let kfIndex = 0;
        for (let i = 0; i < demoSequenceRef.current.length - 1; i++) {
          if (demoSequenceRef.current[i + 1].timeMs > elapsed) {
            kfIndex = i;
            break;
          }
        }
        const curKf = demoSequenceRef.current[kfIndex];
        const nextKf = demoSequenceRef.current[kfIndex + 1] || curKf;
        const span = Math.max(1, nextKf.timeMs - curKf.timeMs);
        const t = (elapsed - curKf.timeMs) / span;

        // Interpolate joint targets
        Object.keys(curKf.angles).forEach(k => {
          const key = k as keyof RobotJointAngles;
          if (typeof curKf.angles[key] === 'number') {
            (targetAnglesRef.current as any)[key] = lerp(
              (curKf.angles as any)[key],
              (nextKf.angles as any)[key],
              t
            );
          }
        });
        targetLeftFingersRef.current = curKf.leftFingers;
        targetRightFingersRef.current = curKf.rightFingers;
        setRobotResponseState(curKf.response);
        setCurrentGesture(curKf.gesture as GestureType);
      }

      // Velocity-Adaptive Kinematic Responsiveness:
      // Bypasses redundant intermediate-frame delay during human movement,
      // eliminating camera-to-robot lag while retaining rock-solid stability at rest.
      const currentSettings = settingsRef.current;
      const tau = currentSettings.smoothingTau;
      const baseAlpha = 1 - Math.exp(-dt / Math.max(0.001, tau));

      const curAngles = currentAnglesRef.current;
      const tgtAngles = targetAnglesRef.current;

      // Calculate instantaneous motion delta across arms and head
      const dL = Math.hypot(
        tgtAngles.lShoulderZ - curAngles.lShoulderZ,
        tgtAngles.lShoulderX - curAngles.lShoulderX,
        tgtAngles.lElbow - curAngles.lElbow
      );
      const dR = Math.hypot(
        tgtAngles.rShoulderZ - curAngles.rShoulderZ,
        tgtAngles.rShoulderX - curAngles.rShoulderX,
        tgtAngles.rElbow - curAngles.rElbow
      );
      const dHead = Math.hypot(
        tgtAngles.headYaw - curAngles.headYaw,
        tgtAngles.headPitch - curAngles.headPitch,
        tgtAngles.headRoll - curAngles.headRoll
      );
      const maxMotion = Math.max(dL, dR, dHead);

      // When moving rapidly, boost tracking alpha up to 0.94 to cancel latency
      const dynamicAlpha = THREE.MathUtils.clamp(
        baseAlpha + (maxMotion > 0.03 ? 0.65 * Math.min(1.0, maxMotion / 0.22) : 0),
        baseAlpha,
        0.95
      );

      Object.keys(curAngles).forEach(k => {
        const key = k as keyof RobotJointAngles;
        if (typeof curAngles[key] === 'number') {
          if (key === 'eyeX' || key === 'eyeY') {
            (curAngles as any)[key] = lerp((curAngles as any)[key], (tgtAngles as any)[key], dynamicAlpha);
          } else {
            (curAngles as any)[key] = lerpAngle((curAngles as any)[key], (tgtAngles as any)[key], dynamicAlpha);
          }
        } else {
          (curAngles as any)[key] = (tgtAngles as any)[key];
        }
      });

      // Finger responsiveness: instantaneous gesture articulation with zero lag
      const fingerAlpha = Math.max(dynamicAlpha, 0.88);
      (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).forEach(f => {
        leftFingersRef.current[f].mcp = lerp(
          leftFingersRef.current[f].mcp,
          targetLeftFingersRef.current[f].mcp,
          fingerAlpha
        );
        leftFingersRef.current[f].pip = lerp(
          leftFingersRef.current[f].pip,
          targetLeftFingersRef.current[f].pip,
          fingerAlpha
        );
        leftFingersRef.current[f].dip = lerp(
          leftFingersRef.current[f].dip,
          targetLeftFingersRef.current[f].dip,
          fingerAlpha
        );

        rightFingersRef.current[f].mcp = lerp(
          rightFingersRef.current[f].mcp,
          targetRightFingersRef.current[f].mcp,
          fingerAlpha
        );
        rightFingersRef.current[f].pip = lerp(
          rightFingersRef.current[f].pip,
          targetRightFingersRef.current[f].pip,
          fingerAlpha
        );
        rightFingersRef.current[f].dip = lerp(
          rightFingersRef.current[f].dip,
          targetRightFingersRef.current[f].dip,
          fingerAlpha
        );
      });

      // Compute joint velocities & drive Spatial Servo Audio Engine
      const cur = currentAnglesRef.current;
      const prev = prevAnglesRef.current;
      const safeDt = Math.max(0.001, dt);

      // Left arm joint rotational velocity
      const dlZ = cur.lShoulderZ - prev.lShoulderZ;
      const dlX = cur.lShoulderX - prev.lShoulderX;
      const dlElbow = cur.lElbow - prev.lElbow;
      const lArmVel = Math.sqrt(dlZ * dlZ + dlX * dlX + dlElbow * dlElbow) / safeDt;

      // Right arm joint rotational velocity
      const drZ = cur.rShoulderZ - prev.rShoulderZ;
      const drX = cur.rShoulderX - prev.rShoulderX;
      const drElbow = cur.rElbow - prev.rElbow;
      const rArmVel = Math.sqrt(drZ * drZ + drX * drX + drElbow * drElbow) / safeDt;

      // Head / neck rotational velocity
      const dHeadYaw = cur.headYaw - prev.headYaw;
      const dHeadPitch = cur.headPitch - prev.headPitch;
      const headVel = Math.sqrt(dHeadYaw * dHeadYaw + dHeadPitch * dHeadPitch) / safeDt;

      // Compute total user activity to trigger autonomous saccades when stationary
      const totalUserActivity = (headVel * 0.4) + ((lArmVel + rArmVel) * 0.15);

      // Autonomous Saccade & Blink Engine update
      const saccadeResult = saccadeEngineRef.current.update(
        dt,
        cur.eyeX,
        cur.eyeY,
        totalUserActivity
      );

      // Apply gaze targets & blinks
      cur.eyeX = saccadeResult.eyeX;
      cur.eyeY = saccadeResult.eyeY;

      // Update Three.js Robot Model Joints & Eyelid Blink
      if (robotRigRef.current) {
        robotRigRef.current.updatePose(
          cur,
          leftFingersRef.current,
          rightFingersRef.current,
          saccadeResult.blinkScaleY
        );
      }

      // Sync autonomous saccade state to UI (throttled)
      if (now % 300 < 30) {
        setIsSaccadingActive(saccadeResult.isAutonomous);
      }

      // Copy current angles to prevAnglesRef
      Object.keys(cur).forEach(k => {
        const key = k as keyof RobotJointAngles;
        if (typeof cur[key] === 'number') {
          (prev as any)[key] = (cur as any)[key];
        }
      });

      // Update Hand-Tracking Studio Spotlights, Motion Trails, and Pick & Place
      if (robotRigRef.current) {
        const leftHandPos = robotRigRef.current.getHandWorldPosition('left');
        const rightHandPos = robotRigRef.current.getHandWorldPosition('right');

        // Dynamic Futuristic Cyber-Core, Glowing Conduits & Boundary Forcefield
        const boundaryStatus = robotRigRef.current.getBoundaryStatus();
        robotRigRef.current.setBodyBoundaryEnabled(currentSettings.bodyBoundaryEnabled);
        robotRigRef.current.setBoundaryShieldVisible(currentSettings.showBodyBoundaryShield);
        robotRigRef.current.updateFuturisticEffects(
          dt,
          boundaryStatus.leftDeflected,
          boundaryStatus.rightDeflected,
          currentSettings.futuristicMode
        );

        // Sync boundary deflection state to UI (throttled)
        if (now % 120 < 20) {
          setBoundaryDeflection(prevDef => {
            if (
              prevDef.left !== boundaryStatus.leftDeflected ||
              prevDef.right !== boundaryStatus.rightDeflected
            ) {
              return {
                left: boundaryStatus.leftDeflected,
                right: boundaryStatus.rightDeflected,
              };
            }
            return prevDef;
          });
        }

        // Dynamic Studio Lighting (twin hand-tracking key spotlights)
        if (envRef.current) {
          envRef.current.setStudioLightingEnabled(currentSettings.studioLightingEnabled);
          envRef.current.updateStudioLights(dt, leftHandPos, rightHandPos);
        }

        // 3D Hand Motion Trails
        if (motionTrailsRef.current) {
          motionTrailsRef.current.update(
            dt,
            leftHandPos,
            rightHandPos,
            currentSettings.motionTrailsEnabled
          );
        }

        // Pick & Place Physics & Station
        if (pickPlaceStationRef.current && currentSettings.enablePickPlace) {
          const isLeftGrip =
            leftFingersRef.current.index.mcp > 0.8 && leftFingersRef.current.middle.mcp > 0.8;
          const isRightGrip =
            rightFingersRef.current.index.mcp > 0.8 && rightFingersRef.current.middle.mcp > 0.8;

          const res = pickPlaceStationRef.current.update(
            leftHandPos,
            rightHandPos,
            isLeftGrip,
            isRightGrip
          );

          if (lastPickPlaceStatusRef.current !== res.statusText) {
            lastPickPlaceStatusRef.current = res.statusText;
            setPickPlaceStatus(res.statusText);
          }
          if (lastHeldObjectRef.current !== res.heldObject) {
            lastHeldObjectRef.current = res.heldObject;
            setHeldObject(res.heldObject);
          }
          if (res.justPlaced) {
            setPlacedCount(c => c + 1);
          }
        }
      }

      // Update Environment Camera Lerp & Render Scene
      if (envRef.current) {
        envRef.current.updateCamera(dt);
        envRef.current.renderer.render(envRef.current.scene, envRef.current.camera);
      }
    };

    animId = requestAnimationFrame(renderLoop);

    // Periodic state meter sync (1 Hz)
    const fpsMeterInterval = setInterval(() => {
      if (renderFpsBufferRef.current.length > 0) {
        const avgRenderFps =
          renderFpsBufferRef.current.reduce((a, b) => a + b, 0) /
          renderFpsBufferRef.current.length;
        setMetrics(m => ({
          ...m,
          renderFps: avgRenderFps,
        }));
      }
    }, 500);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(fpsMeterInterval);
      resizeObserver.disconnect();
      motionTrails.dispose();
    };
  }, [mode]);

  // -------------------------------------------------------------
  // 3. Initialize Vision Manager
  // -------------------------------------------------------------
  useEffect(() => {
    const vision = new VisionManager({
      onPoseUpdate: data => {
        if (modeRef.current === 'DEMO') return;

        // Check user-configured pose confidence threshold or active hand tracking
        const threshold = settingsRef.current.poseConfidenceThreshold ?? 0.25;
        const hasHand = data.leftHand.detected || data.rightHand.detected;
        const meetsThreshold = data.metrics.poseConfidence >= threshold || hasHand;

        if (meetsThreshold) {
          // Apply new target joint angles directly to mutable refs (zero React lag)
          targetAnglesRef.current = data.angles;
          targetLeftFingersRef.current = data.leftHand.fingers;
          targetRightFingersRef.current = data.rightHand.fingers;
        }

        // Determine state label
        let nextResponse = 'STANDBY';
        if (data.gesture === 'WAVE') {
          nextResponse = 'WAVING GREETING';
        } else if (data.gesture === 'THUMBS_UP') {
          nextResponse = 'ACKNOWLEDGING';
        } else if (data.gesture === 'PINCH' || data.gesture === 'FIST') {
          nextResponse = 'PRECISION GRIP';
        } else if (data.gesture === 'VICTORY') {
          nextResponse = 'VICTORY SIGN';
        } else if (meetsThreshold) {
          nextResponse = 'MIRRORING';
        }

        // Only trigger React state updates when state/gesture actually changes
        if (lastGestureRef.current !== data.gesture) {
          lastGestureRef.current = data.gesture;
          setCurrentGesture(data.gesture);
        }
        if (lastResponseRef.current !== nextResponse) {
          lastResponseRef.current = nextResponse;
          setRobotResponseState(nextResponse);
        }

        // Throttle UI metrics and hand tracking state updates to 10 Hz (every 100ms)
        const now = performance.now();
        if (now - lastUiStateUpdateTimeRef.current >= 100) {
          lastUiStateUpdateTimeRef.current = now;
          setLeftHandState(data.leftHand);
          setRightHandState(data.rightHand);
          setMetrics(prev => ({
            ...prev,
            visionFps: data.metrics.visionFps,
            latencyMs: data.metrics.latencyMs,
            rawLandmarkLatencyMs: data.metrics.rawLandmarkLatencyMs,
            inferenceLatencyMs: data.metrics.inferenceLatencyMs,
            kinematicsLatencyMs: data.metrics.kinematicsLatencyMs,
            poseConfidence: data.metrics.poseConfidence,
            leftHandConfidence: data.metrics.leftHandConfidence,
            rightHandConfidence: data.metrics.rightHandConfidence,
            faceConfidence: data.metrics.faceConfidence,
            activeArmSource: data.metrics.activeArmSource,
            boundaryDeflected: data.metrics.boundaryDeflected,
          }));
        }

        // Handle calibration sampling
        if (isCalibratingRef.current) {
          if (data.metrics.poseConfidence >= (settingsRef.current.poseConfidenceThreshold ?? 0.20) * 0.7 || hasHand) {
            calibrationSamplesRef.current.push(1);
            const count = calibrationSamplesRef.current.length;
            const targetSamples = 20;
            const prog = Math.min(100, Math.round((count / targetSamples) * 100));
            setCalibration(c => ({
              ...c,
              progress: prog,
              samplesCount: count,
            }));

            if (count >= targetSamples) {
              setTimeout(() => {
                setCalibration(c => ({
                  ...c,
                  progress: 100,
                  isCalibrating: false,
                  isDone: true,
                }));
                setMode('LIVE');
              }, 400);
            }
          }
        }
      },
      onOverlayDraw: (poseLm, handsLm) => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const w = canvas.width;
        const h = canvas.height;

        // Draw Pose Skeleton
        if (settingsRef.current.showSkeleton && poseLm) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#00b4d8';
          ctx.beginPath();
          POSE_CONNECTIONS.forEach(([a, b]) => {
            if (poseLm[a] && poseLm[b]) {
              ctx.moveTo(poseLm[a].x * w, poseLm[a].y * h);
              ctx.lineTo(poseLm[b].x * w, poseLm[b].y * h);
            }
          });
          ctx.stroke();

          // Key landmark joints
          [0, 11, 12, 13, 14, 15, 16].forEach(idx => {
            const p = poseLm[idx];
            if (!p) return;
            ctx.beginPath();
            ctx.fillStyle = idx === 0 ? '#10b981' : '#ffffff';
            ctx.arc(p.x * w, p.y * h, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#0077b6';
            ctx.stroke();
          });
        }

        // Draw Hands Knuckles and 21 Finger Landmarks
        if (settingsRef.current.showFingers && handsLm) {
          handsLm.forEach(hand => {
            ctx.lineWidth = 1.8;
            ctx.strokeStyle = 'rgba(0, 210, 255, 0.85)';
            ctx.beginPath();
            HAND_CONNECTIONS.forEach(([a, b]) => {
              if (hand[a] && hand[b]) {
                ctx.moveTo(hand[a].x * w, hand[a].y * h);
                ctx.lineTo(hand[b].x * w, hand[b].y * h);
              }
            });
            ctx.stroke();

            // 21 knuckle dots
            hand.forEach((p, pIdx) => {
              ctx.beginPath();
              ctx.fillStyle = pIdx === 0 ? '#f59e0b' : pIdx % 4 === 0 ? '#00e5ff' : '#ffffff';
              ctx.arc(p.x * w, p.y * h, pIdx === 0 ? 3.5 : 2.2, 0, Math.PI * 2);
              ctx.fill();
            });
          });
        }
      },
    });

    visionManagerRef.current = vision;
    vision.setMotionGain(settingsRef.current.motionGain);
  }, []);

  // -------------------------------------------------------------
  // 4. Start Webcam Feed
  // -------------------------------------------------------------
  const handleStartCamera = async () => {
    if (!videoRef.current || !visionManagerRef.current) return;

    try {
      // Initialize vision models (Full or Lite)
      await visionManagerRef.current.initialize(settings.poseModelQuality);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        },
        audio: false,
      });

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = video.videoWidth || 640;
        overlayCanvasRef.current.height = video.videoHeight || 480;
      }

      setIsCameraActive(true);
      setMode('LIVE');

      // Start asynchronous, non-blocking vision loop
      visionManagerRef.current.start(video);
    } catch (err: any) {
      console.error('Error starting camera:', err);
      alert(
        'Could not access webcam: ' +
          (err.message || 'Please check browser camera permissions and try again.')
      );
    }
  };

  // Toggle Mirror View
  const handleToggleMirror = () => {
    setSettings(s => ({ ...s, mirrorView: !s.mirrorView }));
  };

  // Switch to Demo Mode
  const handleToggleDemo = () => {
    if (mode === 'DEMO') {
      setMode('LIVE');
    } else {
      setMode('DEMO');
      demoStartTimeRef.current = performance.now();
    }
  };

  // Toggle 3D Hand Motion Trails
  const handleToggleMotionTrails = () => {
    setSettings(s => ({ ...s, motionTrailsEnabled: !s.motionTrailsEnabled }));
  };

  // Toggle Gesture Guide Helper Overlay
  const handleToggleGestureGuide = () => {
    setSettings(s => ({ ...s, showGestureGuide: !s.showGestureGuide }));
  };

  // Start Calibration
  const handleStartCalibration = async () => {
    calibrationSamplesRef.current = [];
    setCalibration({
      isCalibrating: true,
      progress: 0,
      shoulderWidthRef: 0.25,
      armLengthRef: 0.55,
      neutralHead: { yaw: 0, pitch: 0 },
      samplesCount: 0,
      isDone: false,
    });
    // If in demo mode, switch to LIVE so camera feeds real user calibration
    if (mode === 'DEMO') {
      setMode('LIVE');
    }
    // If camera is not yet running, start it immediately
    if (!isCameraActive) {
      await handleStartCamera();
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#f4f7fa] font-sans antialiased text-slate-800 select-none">
      {/* Top Application Header */}
      <Header
        metrics={metrics}
        mode={mode}
        isCameraActive={isCameraActive}
        hasPose={metrics.poseConfidence > 0.4}
        hasLeftHand={leftHandState.detected}
        hasRightHand={rightHandState.detected}
        enablePickPlace={settings.enablePickPlace}
        enableDebug={isDebugOpen}
        motionTrailsEnabled={settings.motionTrailsEnabled}
        showGestureGuide={settings.showGestureGuide}
        onToggleMotionTrails={handleToggleMotionTrails}
        onToggleGestureGuide={handleToggleGestureGuide}
        onTogglePickPlace={() => setIsPickPlacePanelOpen(v => !v)}
        onToggleDebug={() => setIsDebugOpen(v => !v)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onStartCalibration={handleStartCalibration}
        onToggleDemo={handleToggleDemo}
      />

      {/* Main Split Layout: Left Camera | Right 3D Robot Viewport */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Side: Human Vision Panel (35% width on desktop, collapsible) */}
        <div className="w-[36%] min-w-[280px] max-w-[500px] h-full shrink-0 hidden sm:block">
          <CameraView
            videoRef={videoRef}
            overlayCanvasRef={overlayCanvasRef}
            isCameraActive={isCameraActive}
            isMirrorMode={settings.mirrorView}
            gesture={currentGesture}
            leftHand={leftHandState}
            rightHand={rightHandState}
            metrics={metrics}
            poseConfidenceThreshold={settings.poseConfidenceThreshold}
            onToggleMirror={handleToggleMirror}
            onStartCamera={handleStartCamera}
          />
        </div>

        {/* Right Side: Large 3D Robot Viewport */}
        <div className="flex-1 h-full min-w-0 relative">
          <RobotViewport
            canvasRef={robotCanvasRef}
            robotResponseState={robotResponseState}
            gesture={currentGesture}
            cameraPreset={settings.cameraView}
            enablePickPlace={settings.enablePickPlace}
            pickPlaceStatus={pickPlaceStatus}
            heldObject={heldObject}
            placedCount={placedCount}
            showGestureGuide={settings.showGestureGuide}
            motionTrailsEnabled={settings.motionTrailsEnabled}
            studioLightingEnabled={settings.studioLightingEnabled}
            bodyBoundaryEnabled={settings.bodyBoundaryEnabled}
            showBodyBoundaryShield={settings.showBodyBoundaryShield}
            futuristicMode={settings.futuristicMode}
            isDeflectedLeft={boundaryDeflection.left}
            isDeflectedRight={boundaryDeflection.right}
            isSaccading={isSaccadingActive}
            onSetCameraPreset={preset => {
              setSettings(s => ({ ...s, cameraView: preset }));
              envRef.current?.setCameraPreset(preset);
            }}
            onResetPickPlace={() => pickPlaceStationRef.current?.resetObjects()}
            onToggleGestureGuide={handleToggleGestureGuide}
            onToggleMotionTrails={handleToggleMotionTrails}
            onToggleStudioLighting={() =>
              setSettings(s => ({ ...s, studioLightingEnabled: !s.studioLightingEnabled }))
            }
            onToggleBodyBoundary={() =>
              setSettings(s => ({ ...s, bodyBoundaryEnabled: !s.bodyBoundaryEnabled }))
            }
            onToggleShield={() =>
              setSettings(s => ({ ...s, showBodyBoundaryShield: !s.showBodyBoundaryShield }))
            }
            onToggleFuturistic={() =>
              setSettings(s => ({ ...s, futuristicMode: !s.futuristicMode }))
            }
          />
        </div>

        {/* Mobile floating camera button if screen is small */}
        <div className="sm:hidden absolute top-3 left-3 z-30">
          {!isCameraActive ? (
            <button
              onClick={handleStartCamera}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold shadow-md"
            >
              Start Camera
            </button>
          ) : (
            <span className="px-2 py-1 rounded bg-slate-900/80 text-white font-mono text-[10px]">
              CAM ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Pick & Place Floating Control Panel */}
      <PickPlacePanel
        isOpen={isPickPlacePanelOpen}
        objects={pickPlaceStationRef.current?.objects || []}
        activeObjectId={pickPlaceStationRef.current?.activeObjectId || 'box-01'}
        pickPlaceStatus={pickPlaceStatus}
        placedCount={placedCount}
        onSelectObject={id => pickPlaceStationRef.current?.selectObject(id)}
        onResetObjects={() => pickPlaceStationRef.current?.resetObjects()}
        onClose={() => setIsPickPlacePanelOpen(false)}
      />

      {/* Live Telemetry Debug Inspector Drawer */}
      <DebugDrawer
        isOpen={isDebugOpen}
        angles={currentAnglesRef.current}
        leftHand={leftHandState}
        rightHand={rightHandState}
        metrics={metrics}
        onClose={() => setIsDebugOpen(false)}
      />

      {/* Calibration Wizard Modal */}
      <CalibrationModal
        calibration={calibration}
        isCameraActive={isCameraActive}
        onCancel={() =>
          setCalibration(c => ({
            ...c,
            isCalibrating: false,
          }))
        }
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onUpdateSettings={updates => {
          setSettings(s => {
            const next = { ...s, ...updates };
            if (updates.enableSaccades !== undefined) {
              saccadeEngineRef.current.setEnabled(updates.enableSaccades);
            }
            if (updates.enableOneEuroFilter !== undefined && visionManagerRef.current) {
              visionManagerRef.current.setUseOneEuroFilter(updates.enableOneEuroFilter);
            }
            return next;
          });
          if (updates.cameraView && envRef.current) {
            envRef.current.setCameraPreset(updates.cameraView);
          }
          if (updates.motionGain !== undefined && visionManagerRef.current) {
            visionManagerRef.current.setMotionGain(updates.motionGain);
          }
        }}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
