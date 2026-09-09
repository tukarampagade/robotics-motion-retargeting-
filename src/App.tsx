/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AppSettings,
  CalibrationData,
  DEFAULT_ROBOT_CONFIG,
  GestureType,
  HandFingersState,
  HandTrackingState,
  InputSource,
  RobotCommand,
  RobotControlConfig,
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
import { StreamlinedHeader, WorkspaceLayout } from './components/StreamlinedHeader';
import { Sidebar, ActiveNavTab } from './components/Sidebar';
import { Footer } from './components/Footer';
import { KinematicsPanel } from './components/KinematicsPanel';
import { GestureCommandCenter } from './components/GestureCommandCenter';
import { CustomizationPanel, AccentColorTheme } from './components/CustomizationPanel';
import { CameraView } from './components/CameraView';
import { RobotViewport } from './components/RobotViewport';
import { HandSignController } from './components/HandSignController';
import { GestureStatus } from './components/GestureStatus';
import { CalibrationModal } from './components/CalibrationModal';
import { SettingsModal } from './components/SettingsModal';
import { HandDebugPanel } from './components/HandDebugPanel';
import { useRobotCommand } from './hooks/useRobotCommand';
import { useHandGestureRecognition } from './hooks/useHandGestureRecognition';

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
  const visionManagerRef = useRef<VisionManager | null>(null);
  const motionTrailsRef = useRef<MotionTrailsManager | null>(null);

  // High-performance throttling refs (prevents UI re-renders on every camera frame)
  const lastGestureRef = useRef<GestureType>('—');
  const lastResponseRef = useRef<string>('IDLE');
  const lastUiStateUpdateTimeRef = useRef<number>(0);

  // Application State
  const [mode, setMode] = useState<'LIVE' | 'DEMO' | 'CALIBRATING'>('LIVE');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [isVideoSource, setIsVideoSource] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visionModelStatus, setVisionModelStatus] = useState<'unloaded' | 'loading' | 'ready' | 'error'>('ready');
  const [visionModelMessage, setVisionModelMessage] = useState<string>('');

  // Settings State
  const [settings, setSettings] = useState<AppSettings>({
    smoothingTau: 0.02, // Ultra-fast, immediate motion tracking response
    motionGain: 1.0,
    mirrorView: true,
    showSkeleton: true,
    showFingers: true,
    poseModelQuality: 'lite', // Ultra-fast 30+ FPS pose tracking
    cameraView: 'front',
    enableHandSignControl: true,
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

  // Robot Control Configuration State
  const [robotConfig, setRobotConfig] = useState<RobotControlConfig>(DEFAULT_ROBOT_CONFIG);

  // Robot Hand-Sign Control Hook & Watchdog Safety System
  const {
    activeCommand,
    setCommand,
    triggerEmergencyStop,
    resetEmergencyStop,
    isEmergencyStopped,
    connectionStatus,
    lastCommandLatencyMs,
    driveState,
    driveStateRef,
  } = useRobotCommand({
    config: robotConfig,
    enabled: settings.enableHandSignControl,
  });

  // MediaPipe Hand Gesture Recognition Hook (3 consecutive frames stability filter)
  const {
    stableGesture,
    isHandDetected,
    processFrame,
    resetGestureState,
    candidateCount,
  } = useHandGestureRecognition({
    config: robotConfig,
  });

  const processFrameRef = useRef(processFrame);
  useEffect(() => {
    processFrameRef.current = processFrame;
  }, [processFrame]);

  // Connect stable recognized hand signs to robot command engine
  useEffect(() => {
    if (stableGesture && settings.enableHandSignControl && mode === 'LIVE') {
      setCommand(stableGesture.command, 'hand_gesture', stableGesture.confidence);
    }
  }, [stableGesture, setCommand, mode]);

  const [robotResponseState, setRobotResponseState] = useState<string>('IDLE');
  const [currentGesture, setCurrentGesture] = useState<GestureType>('—');

  // Modals & Panels
  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Desktop UI Navigation, Layout & Appearance
  const [activeNavTab, setActiveNavTab] = useState<ActiveNavTab>('studio');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>('split');
  const [accentColor, setAccentColor] = useState<AccentColorTheme>('cyan');
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

  // Hand Neutral Calibration State
  const [handCalibration, setHandCalibration] = useState<{
    isCalibrating: boolean;
    progress: number;
  }>({
    isCalibrating: false,
    progress: 0,
  });

  const handleCalibrateHand = async (side: 'left' | 'right' | 'both' = 'both') => {
    if (!isCameraActive) {
      await handleStartCamera();
    }
    if (!visionManagerRef.current) return;
    setHandCalibration({ isCalibrating: true, progress: 0 });
    visionManagerRef.current.startHandCalibration(side);
  };

  const handleResetHandCalibration = () => {
    if (!visionManagerRef.current) return;
    visionManagerRef.current.resetHandCalibration();
    setHandCalibration({ isCalibrating: false, progress: 0 });
  };

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

        // Mobile Robot Locomotion & Physics Simulation (driven by hand sign commands)
        if (robotRigRef.current && currentSettings.enableHandSignControl) {
          robotRigRef.current.root.position.x = driveStateRef.current.x;
          robotRigRef.current.root.position.z = driveStateRef.current.z;
          robotRigRef.current.root.rotation.y = driveStateRef.current.rotationY;
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

        // Feed dominant hand landmarks to Hand-Sign Robot Control
        const dominantHand =
          data.rightHand.detected && data.rightHand.landmarks
            ? data.rightHand
            : data.leftHand.detected && data.leftHand.landmarks
            ? data.leftHand
            : null;

        if (dominantHand && dominantHand.landmarks) {
          processFrameRef.current?.(
            dominantHand.landmarks,
            dominantHand.confidence,
            settingsRef.current.mirrorView
          );
        } else {
          processFrameRef.current?.(null, 0, settingsRef.current.mirrorView);
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
            kinematicDebug: data.metrics.kinematicDebug,
            handCalibration: data.metrics.handCalibration,
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
      onCalibrationProgress: progress => {
        setHandCalibration(c => ({ ...c, progress }));
      },
      onCalibrationComplete: () => {
        setHandCalibration({ isCalibrating: false, progress: 100 });
      },
      onModelStatusChange: (status, message) => {
        setVisionModelStatus(status);
        if (message) setVisionModelMessage(message);
      },
    });

    visionManagerRef.current = vision;
    vision.setMotionGain(settingsRef.current.motionGain);
  }, []);

  // -------------------------------------------------------------
  // 4. Start Webcam Feed & Video Media Handler
  // -------------------------------------------------------------
  const handleStartCamera = async () => {
    if (!videoRef.current || !visionManagerRef.current) return;

    try {
      setIsCameraLoading(true);
      setCameraError(null);

      const video = videoRef.current;
      // Clean up previous blob URL if exists
      if (video.src && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
        video.src = '';
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Webcam access is not supported or is restricted in this browser frame. Please try opening the app in a new browser tab, or use the Video Upload / Simulated Motion Demo modes below.'
        );
      }

      // Request stream first so user is prompted immediately
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: 'user',
          },
          audio: false,
        });
      } catch (constraintErr) {
        console.warn('Ideal constraints failed, attempting fallback to basic video:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve) => {
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          resolve();
        };
        if (video.readyState >= 2 && video.videoWidth > 0) {
          resolve();
        } else {
          video.addEventListener('loadeddata', onLoaded);
          setTimeout(resolve, 800);
        }
      });

      await video.play().catch(e => console.warn('Video play warning:', e));

      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = video.videoWidth || 640;
        overlayCanvasRef.current.height = video.videoHeight || 480;
      }

      // Initialize vision models (Full or Lite)
      await visionManagerRef.current.initialize(settings.poseModelQuality);

      setIsCameraActive(true);
      setIsVideoSource(false);
      setIsVideoPlaying(true);
      setMode('LIVE');
      setIsCameraLoading(false);

      // Start asynchronous, non-blocking vision loop
      visionManagerRef.current.start(video);
    } catch (err: any) {
      console.error('Error starting camera:', err);
      setIsCameraLoading(false);
      const msg =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings (look for the lock icon in the address bar).'
          : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
          ? 'No camera found. Please attach a webcam or use the Video Upload / Demo modes.'
          : err.name === 'NotReadableError' || err.name === 'TrackStartError'
          ? 'Camera is in use by another application or browser tab.'
          : err.message || 'Could not access webcam.';
      setCameraError(msg);
    }
  };

  const handleToggleVideoPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => {
        setIsVideoPlaying(true);
        if (visionManagerRef.current) {
          visionManagerRef.current.start(video);
        }
      });
    } else {
      video.pause();
      setIsVideoPlaying(false);
    }
  };

  const handleRestartVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().then(() => {
      setIsVideoPlaying(true);
      if (visionManagerRef.current) {
        visionManagerRef.current.start(video);
      }
    });
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

  // Stop or restart camera stream
  const handleToggleCamera = async () => {
    if (isCameraActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      visionManagerRef.current?.stop();
      setIsCameraActive(false);
      if (mode === 'LIVE') setMode('DEMO');
    } else {
      await handleStartCamera();
    }
  };

  // Reset robot posture to upright home position
  const handleResetPose = () => {
    targetAnglesRef.current = freshRobotJointAngles();
    currentAnglesRef.current = freshRobotJointAngles();
    prevAnglesRef.current = freshRobotJointAngles();
    targetLeftFingersRef.current = freshHandFingers();
    targetRightFingersRef.current = freshHandFingers();
    leftFingersRef.current = freshHandFingers();
    rightFingersRef.current = freshHandFingers();
  };

  // Keyboard shortcut navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === '[') {
        setIsSidebarCollapsed(v => !v);
      } else if (e.key === 'd' || e.key === 'D') {
        handleToggleDemo();
      } else if (e.key === 'c' || e.key === 'C') {
        handleStartCalibration();
      } else if (e.key === '1') {
        setWorkspaceLayout('split');
      } else if (e.key === '2') {
        setWorkspaceLayout('3d-solo');
      } else if (e.key === '3') {
        setWorkspaceLayout('cam-solo');
      } else if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        if (activeNavTab !== 'studio') {
          setActiveNavTab('studio');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeNavTab]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-50 font-sans antialiased text-slate-800 select-none">
      {/* Top Streamlined Header with essential controls */}
      <StreamlinedHeader
        mode={mode}
        isCameraActive={isCameraActive}
        workspaceLayout={workspaceLayout}
        onSetWorkspaceLayout={setWorkspaceLayout}
        onToggleCamera={handleToggleCamera}
        onToggleDemo={handleToggleDemo}
        onResetPose={handleResetPose}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDebugOpen={isDebugOpen || activeNavTab === 'debug'}
        onToggleDebug={() => {
          if (activeNavTab === 'debug') {
            setActiveNavTab('studio');
            setIsDebugOpen(false);
          } else {
            setActiveNavTab('debug');
            setIsDebugOpen(true);
          }
        }}
        activeRobotCommand={activeCommand}
        onEmergencyStop={triggerEmergencyStop}
        isEmergencyStopped={isEmergencyStopped}
        soundEnabled={settings.soundEnabled}
        onToggleSound={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
        accentColor={accentColor}
        metrics={metrics}
      />

      {/* Main Workspace: Collapsible Sidebar + Spacious Content Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Collapsible Main Navigation Sidebar */}
        <Sidebar
          activeTab={activeNavTab}
          onSelectTab={tab => {
            setActiveNavTab(tab);
            if (tab === 'calibration') {
              handleStartCalibration();
            }
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(v => !v)}
          isCameraActive={isCameraActive}
          mode={mode}
          currentGesture={currentGesture}
          activeRobotCommand={activeCommand}
          accentColor={accentColor}
        />

        {/* Spacious Content Area with Clear Visual Hierarchy */}
        <main className="flex-1 flex min-h-0 min-w-0 relative bg-slate-100 overflow-hidden">
          {/* Primary Viewports Container */}
          <div className="flex-1 flex h-full min-h-0 min-w-0 relative">
            {/* Left: Human Vision Feed (Adjusts smoothly based on layout) */}
            <div
              className={`${
                workspaceLayout === '3d-solo'
                  ? 'hidden'
                  : workspaceLayout === 'cam-solo'
                  ? 'flex-1 h-full'
                  : 'w-[35%] min-w-[280px] max-w-[500px] h-full shrink-0 border-r border-slate-200'
              } transition-all duration-150 relative`}
            >
              <CameraView
                videoRef={videoRef}
                overlayCanvasRef={overlayCanvasRef}
                isCameraActive={isCameraActive}
                isCameraLoading={isCameraLoading}
                isMirrorMode={settings.mirrorView}
                gesture={currentGesture}
                leftHand={leftHandState}
                rightHand={rightHandState}
                metrics={metrics}
                poseConfidenceThreshold={settings.poseConfidenceThreshold}
                onToggleMirror={handleToggleMirror}
                onStartCamera={handleStartCamera}
                onStartDemoMode={handleToggleDemo}
                isVideoSource={isVideoSource}
                isVideoPlaying={isVideoPlaying}
                onToggleVideoPlay={handleToggleVideoPlay}
                onRestartVideo={handleRestartVideo}
                isCalibrating={handCalibration.isCalibrating}
                calibrationProgress={handCalibration.progress}
                onStartCalibration={() => handleCalibrateHand('both')}
                onCancelCalibration={handleResetHandCalibration}
                cameraError={cameraError}
                onDismissCameraError={() => setCameraError(null)}
                visionModelStatus={visionModelStatus}
                visionModelMessage={visionModelMessage}
              />
            </div>

            {/* Right: 3D Robot Simulation Canvas */}
            <div
              className={`${
                workspaceLayout === 'cam-solo' ? 'hidden' : 'flex-1 h-full min-w-0 relative'
              } transition-all duration-150`}
            >
              <RobotViewport
                canvasRef={robotCanvasRef}
                robotResponseState={robotResponseState}
                gesture={currentGesture}
                cameraPreset={settings.cameraView}
                activeRobotCommand={activeCommand}
                isEmergencyStopped={isEmergencyStopped}
                driveSpeed={driveState.speed}
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
                onEmergencyStop={triggerEmergencyStop}
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

              {/* Floating Hand-Sign Teleoperation HUD in Viewport */}
              <div className="absolute top-3 left-3 z-20 pointer-events-auto">
                <GestureStatus
                  gestureResult={stableGesture}
                  isHandDetected={isHandDetected}
                  minConfidence={robotConfig.minGestureConfidence}
                  candidateCount={candidateCount}
                  requiredFrames={robotConfig.stabilityFrames}
                />
              </div>

              {/* Floating Picture-in-Picture Mini Camera View when 3D is Solo */}
              {workspaceLayout === '3d-solo' && isCameraActive && (
                <div className="absolute bottom-4 left-4 w-48 h-36 rounded-2xl bg-white border border-slate-300 shadow-xl overflow-hidden z-30 transition-all hover:scale-105">
                  <video
                    playsInline
                    muted
                    autoPlay
                    ref={el => {
                      if (el && videoRef.current?.srcObject && el.srcObject !== videoRef.current.srcObject) {
                        el.srcObject = videoRef.current.srcObject;
                      }
                    }}
                    className="w-full h-full object-cover"
                    style={{ transform: settings.mirrorView ? 'scaleX(-1)' : 'none' }}
                  />
                  <div className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded bg-slate-900/80 text-white font-mono text-[9px] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>LIVE CAM</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Contextual Hand-Sign Robot Control Workspace when tab selected */}
          {activeNavTab === 'handsign' && (
            <div className="w-[440px] max-w-[90vw] h-full shrink-0 z-20 shadow-xl border-l border-slate-200 bg-white">
              <HandSignController
                gestureResult={stableGesture}
                isHandDetected={isHandDetected}
                activeCommand={activeCommand}
                driveState={driveState}
                connectionStatus={connectionStatus}
                latencyMs={lastCommandLatencyMs}
                config={robotConfig}
                onUpdateConfig={newConfig => setRobotConfig(c => ({ ...c, ...newConfig }))}
                onSetCommand={(cmd, src) => setCommand(cmd, src, 1.0)}
                onEmergencyStop={triggerEmergencyStop}
                onResetEmergencyStop={resetEmergencyStop}
                isEmergencyStopped={isEmergencyStopped}
                onClose={() => setActiveNavTab('studio')}
              />
            </div>
          )}

          {activeNavTab === 'kinematics' && (
            <div className="w-96 h-full shrink-0 z-10">
              <KinematicsPanel
                angles={currentAnglesRef.current}
                leftHand={leftHandState}
                rightHand={rightHandState}
                metrics={metrics}
                onClose={() => setActiveNavTab('studio')}
                accentColor={accentColor}
              />
            </div>
          )}

          {activeNavTab === 'gestures' && (
            <div className="w-96 h-full shrink-0 z-10">
              <GestureCommandCenter
                currentGesture={currentGesture}
                leftHand={leftHandState}
                rightHand={rightHandState}
                onClose={() => setActiveNavTab('studio')}
                accentColor={accentColor}
              />
            </div>
          )}

          {activeNavTab === 'customization' && (
            <div className="w-96 h-full shrink-0 z-10">
              <CustomizationPanel
                settings={settings}
                onUpdateSettings={updates => {
                  setSettings(s => ({ ...s, ...updates }));
                  if (updates.cameraView && envRef.current) {
                    envRef.current.setCameraPreset(updates.cameraView);
                  }
                }}
                accentColor={accentColor}
                onSetAccentColor={setAccentColor}
                onClose={() => setActiveNavTab('studio')}
              />
            </div>
          )}

          {(activeNavTab === 'debug' || isDebugOpen) && (
            <div className="w-[440px] max-w-[90vw] h-full shrink-0 z-20 shadow-xl border-l border-slate-200 bg-white">
              <HandDebugPanel
                leftHand={leftHandState}
                rightHand={rightHandState}
                metrics={metrics}
                onCalibrate={handleCalibrateHand}
                onResetCalibration={handleResetHandCalibration}
                isCalibrating={handCalibration.isCalibrating}
                calibrationProgress={handCalibration.progress}
                onClose={() => {
                  setIsDebugOpen(false);
                  if (activeNavTab === 'debug') {
                    setActiveNavTab('studio');
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>

      {/* Minimal Footer with critical telemetry & status */}
      <Footer
        metrics={metrics}
        mode={mode}
        isCameraActive={isCameraActive}
        currentGesture={currentGesture}
        robotResponseState={robotResponseState}
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
