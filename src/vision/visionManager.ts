/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FilesetResolver, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  GestureType,
  HandFingersState,
  HandTrackingState,
  TrackingMetrics,
} from '../types';
import {
  analyzeHandLandmarks,
  freshHandFingers,
  freshRobotJointAngles,
  LandmarkPoint,
  retargetHumanPose,
} from './motionRetargeter';
import { LandmarkOneEuroFilterSet } from './oneEuroFilter';

export interface VisionCallbacks {
  onPoseUpdate: (data: {
    angles: ReturnType<typeof freshRobotJointAngles>;
    leftHand: HandTrackingState;
    rightHand: HandTrackingState;
    gesture: GestureType;
    metrics: TrackingMetrics;
  }) => void;
  onOverlayDraw: (
    poseLandmarks: LandmarkPoint[] | null,
    handLandmarks: LandmarkPoint[][] | null
  ) => void;
  onError?: (err: Error) => void;
}

export class VisionManager {
  private poseLandmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private visionResolver: any = null;

  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private lastTimestampMs: number = 0;
  private lastVideoTime: number = -1;

  private animationFrameId: number | null = null;
  private visionIntervalId: number | null = null;

  // Wave detection tracking
  private waveHistory: { time: number; x: number }[] = [];
  private waveCooldown: number = 0;

  // Measured FPS & latency
  private visionFrameCount: number = 0;
  private lastFpsCalcTime: number = performance.now();
  private currentVisionFps: number = 0;
  private lastLatencyMs: number = 0;

  // Hand state holding & smoothing
  private leftHandState: HandTrackingState = {
    detected: false,
    confidence: 0,
    rawLabel: null,
    wristPos: { x: 0, y: 0, z: 0 },
    wristOrientation: { roll: 0, pitch: 0, yaw: 0 },
    fingers: freshHandFingers(),
    gesture: '—',
    pinchDistance: 1,
    isGrip: false,
  };

  private rightHandState: HandTrackingState = {
    detected: false,
    confidence: 0,
    rawLabel: null,
    wristPos: { x: 0, y: 0, z: 0 },
    wristOrientation: { roll: 0, pitch: 0, yaw: 0 },
    fingers: freshHandFingers(),
    gesture: '—',
    pinchDistance: 1,
    isGrip: false,
  };

  private callbacks: VisionCallbacks;
  private poseQuality: 'full' | 'lite' = 'full';
  private motionGain: number = 1.0;
  private correctHandedness: boolean = true;
  private useOneEuroFilter: boolean = true;
  private targetIntervalMs: number = 0; // 0 = hardware frame-rate synchronized

  // Adaptive One Euro Filter banks for landmark jitter suppression with zero high-speed lag
  private poseFilter: LandmarkOneEuroFilterSet = new LandmarkOneEuroFilterSet(1.3, 0.065);
  private leftHandFilter: LandmarkOneEuroFilterSet = new LandmarkOneEuroFilterSet(1.5, 0.075);
  private rightHandFilter: LandmarkOneEuroFilterSet = new LandmarkOneEuroFilterSet(1.5, 0.075);

  constructor(callbacks: VisionCallbacks) {
    this.callbacks = callbacks;
  }

  public setUseOneEuroFilter(enable: boolean) {
    this.useOneEuroFilter = enable;
  }

  public setResponsePreset(preset: 'ultra_fast' | 'balanced' | 'cinematic') {
    if (preset === 'ultra_fast') {
      this.poseFilter = new LandmarkOneEuroFilterSet(1.4, 0.075);
      this.leftHandFilter = new LandmarkOneEuroFilterSet(1.6, 0.085);
      this.rightHandFilter = new LandmarkOneEuroFilterSet(1.6, 0.085);
      this.targetIntervalMs = 0;
    } else if (preset === 'balanced') {
      this.poseFilter = new LandmarkOneEuroFilterSet(1.2, 0.045);
      this.leftHandFilter = new LandmarkOneEuroFilterSet(1.3, 0.055);
      this.rightHandFilter = new LandmarkOneEuroFilterSet(1.3, 0.055);
      this.targetIntervalMs = 18;
    } else {
      this.poseFilter = new LandmarkOneEuroFilterSet(0.9, 0.018);
      this.leftHandFilter = new LandmarkOneEuroFilterSet(1.0, 0.020);
      this.rightHandFilter = new LandmarkOneEuroFilterSet(1.0, 0.020);
      this.targetIntervalMs = 33;
    }
  }

  public async initialize(quality: 'full' | 'lite' = 'full'): Promise<void> {
    this.poseQuality = quality;
    try {
      this.visionResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      const poseModelPath =
        quality === 'lite'
          ? 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
          : 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

      this.poseLandmarker = await PoseLandmarker.createFromOptions(this.visionResolver, {
        baseOptions: {
          modelAssetPath: poseModelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.handLandmarker = await HandLandmarker.createFromOptions(this.visionResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err: any) {
      console.error('Failed to initialize MediaPipe models:', err);
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }
      throw err;
    }
  }

  public setMotionGain(gain: number) {
    this.motionGain = gain;
  }

  public setHandednessFix(enable: boolean) {
    this.correctHandedness = enable;
  }

  /**
   * Starts non-blocking asynchronous vision processing loop
   */
  public start(videoElement: HTMLVideoElement): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isProcessing = false;
    this.lastTimestampMs = 0;
    this.lastVideoTime = -1;

    const executeFrame = async () => {
      if (!this.isRunning) return;

      if (!this.isProcessing && videoElement.readyState >= 2 && !videoElement.paused) {
        if (videoElement.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = videoElement.currentTime;
          this.isProcessing = true;
          try {
            await this.processVideoFrame(videoElement);
          } catch (err) {
            console.warn('Vision frame processing glitch caught safely:', err);
          } finally {
            this.isProcessing = false;
          }
        }
      }

      if (this.isRunning) {
        if (this.targetIntervalMs === 0 && 'requestVideoFrameCallback' in videoElement) {
          (videoElement as any).requestVideoFrameCallback(executeFrame);
        } else if (this.targetIntervalMs > 0) {
          this.visionIntervalId = window.setTimeout(executeFrame, this.targetIntervalMs);
        } else {
          this.animationFrameId = requestAnimationFrame(executeFrame);
        }
      }
    };

    if (this.targetIntervalMs === 0 && 'requestVideoFrameCallback' in videoElement) {
      (videoElement as any).requestVideoFrameCallback(executeFrame);
    } else if (this.targetIntervalMs > 0) {
      this.visionIntervalId = window.setTimeout(executeFrame, this.targetIntervalMs);
    } else {
      this.animationFrameId = requestAnimationFrame(executeFrame);
    }
  }

  public stop(): void {
    this.isRunning = false;
    this.isProcessing = false;
    this.poseFilter.reset();
    this.leftHandFilter.reset();
    this.rightHandFilter.reset();
    if (this.visionIntervalId !== null) {
      clearTimeout(this.visionIntervalId);
      this.visionIntervalId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Non-blocking single video frame processing
   */
  private async processVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.poseLandmarker || !this.handLandmarker) return;

    // Strict monotonic timestamp generation to eliminate MediaPipe freeze / crash
    const currentPerf = performance.now();
    const videoTimeMs = Math.round(video.currentTime * 1000);
    const monotonicTimestamp = Math.max(
      this.lastTimestampMs + 1,
      videoTimeMs > 0 ? videoTimeMs : Math.round(currentPerf)
    );
    this.lastTimestampMs = monotonicTimestamp;

    const startTime = performance.now();

    // 1. Detect Hand Landmarks
    // HandLandmarker is processed first so hand wrist landmarks can be fused with pose
    let handResults: any = null;
    try {
      handResults = this.handLandmarker.detectForVideo(video, monotonicTimestamp);
    } catch (e) {
      // Guard against momentary buffer loss during fast motion scenes
    }

    // 2. Detect Pose Landmarks
    let poseResults: any = null;
    try {
      poseResults = this.poseLandmarker.detectForVideo(video, monotonicTimestamp + 0.001);
    } catch (e) {
      // Guard against momentary frame drop
    }

    this.lastLatencyMs = performance.now() - startTime;

    // Measure real vision FPS
    this.visionFrameCount++;
    const now = performance.now();
    if (now - this.lastFpsCalcTime >= 1000) {
      this.currentVisionFps = Math.round((this.visionFrameCount * 1000) / (now - this.lastFpsCalcTime));
      this.visionFrameCount = 0;
      this.lastFpsCalcTime = now;
    }

    let poseLandmarks: LandmarkPoint[] | null = null;
    let handLandmarksList: LandmarkPoint[][] | null = null;

    let leftFusedWrist: LandmarkPoint | null = null;
    let rightFusedWrist: LandmarkPoint | null = null;

    let lHandDetected = false;
    let rHandDetected = false;
    let lConf = 0;
    let rConf = 0;
    let detectedGesture: GestureType = 'MIRRORING';

    // Parse Hands
    if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
      const filteredHands: LandmarkPoint[][] = [];

      handResults.landmarks.forEach((rawLm: LandmarkPoint[], idx: number) => {
        const rawLabel = handResults.handednesses?.[idx]?.[0]?.categoryName || 'Left';
        const score = handResults.handednesses?.[idx]?.[0]?.score ?? 0.8;

        // MediaPipe HandLandmarker categoryName assumes selfie/mirrored webcam input.
        // If raw unmirrored video is supplied to the model, we flip it so anatomical Left/Right is 100% correct.
        const label: 'Left' | 'Right' = this.correctHandedness
          ? rawLabel === 'Left'
            ? 'Right'
            : 'Left'
          : (rawLabel as 'Left' | 'Right');

        // Apply Adaptive One Euro Filter to hand landmarks to suppress tracking tremor
        const lm = this.useOneEuroFilter
          ? label === 'Left'
            ? this.leftHandFilter.filterLandmarks(rawLm, monotonicTimestamp)
            : this.rightHandFilter.filterLandmarks(rawLm, monotonicTimestamp)
          : rawLm;

        filteredHands.push(lm);

        const sign = label === 'Left' ? -1 : 1;
        const worldLm = handResults.worldLandmarks?.[idx];
        const analysis = analyzeHandLandmarks(lm, worldLm, sign);

        if (label === 'Left') {
          lHandDetected = true;
          lConf = score;
          leftFusedWrist = lm[0];
          this.leftHandState = {
            detected: true,
            confidence: score,
            rawLabel: rawLabel as any,
            wristPos: { x: lm[0].x, y: lm[0].y, z: lm[0].z ?? 0 },
            wristOrientation: analysis.wristOri,
            fingers: analysis.fingers,
            gesture: analysis.gesture,
            pinchDistance: analysis.pinchDist,
            isGrip: analysis.isGrip,
          };
          if (analysis.gesture !== 'MIRRORING') {
            detectedGesture = analysis.gesture;
          }
        } else {
          rHandDetected = true;
          rConf = score;
          rightFusedWrist = lm[0];
          this.rightHandState = {
            detected: true,
            confidence: score,
            rawLabel: rawLabel as any,
            wristPos: { x: lm[0].x, y: lm[0].y, z: lm[0].z ?? 0 },
            wristOrientation: analysis.wristOri,
            fingers: analysis.fingers,
            gesture: analysis.gesture,
            pinchDistance: analysis.pinchDist,
            isGrip: analysis.isGrip,
          };
          if (analysis.gesture !== 'MIRRORING') {
            detectedGesture = analysis.gesture;
          }
        }
      });

      handLandmarksList = filteredHands;
    }

    // Decay hand states smoothly when tracking is lost during fast motion blur
    if (!lHandDetected) {
      this.leftHandState.confidence *= 0.85;
      if (this.leftHandState.confidence < 0.15) {
        this.leftHandState.detected = false;
        this.leftHandFilter.reset();
      }
    }
    if (!rHandDetected) {
      this.rightHandState.confidence *= 0.85;
      if (this.rightHandState.confidence < 0.15) {
        this.rightHandState.detected = false;
        this.rightHandFilter.reset();
      }
    }

    // Parse Pose
    let poseConf = 0;
    const robotAngles = freshRobotJointAngles();
    let armSources = {
      left: 'NONE' as 'HAND' | 'POSE' | 'NONE',
      right: 'NONE' as 'HAND' | 'POSE' | 'NONE',
    };

    let boundaryDeflectedInfo = undefined;

    if (poseResults && poseResults.landmarks && poseResults.landmarks.length > 0) {
      const rawPoseLandmarks = poseResults.landmarks[0];
      // Filter pose landmarks using One Euro Filter
      poseLandmarks = this.useOneEuroFilter
        ? this.poseFilter.filterLandmarks(rawPoseLandmarks, monotonicTimestamp)
        : rawPoseLandmarks;

      const keyPoints = [11, 12, 13, 14, 15, 16, 23, 24];
      const sumVis = keyPoints.reduce((acc, i) => acc + (poseLandmarks![i]?.visibility ?? 0.5), 0);
      poseConf = sumVis / keyPoints.length;

      const worldPoseLandmarks = poseResults.worldLandmarks?.[0];
      const retargeted = retargetHumanPose(
        poseLandmarks,
        leftFusedWrist,
        rightFusedWrist,
        this.motionGain,
        worldPoseLandmarks
      );

      Object.assign(robotAngles, retargeted);
      armSources = retargeted.activeArmSource;
      if (retargeted.boundaryMetrics) {
        boundaryDeflectedInfo = {
          left: retargeted.boundaryMetrics.leftDeflected,
          right: retargeted.boundaryMetrics.rightDeflected,
          leftDist: retargeted.boundaryMetrics.leftPenetration,
          rightDist: retargeted.boundaryMetrics.rightPenetration,
        };
      }

      // Check wave gesture
      this.detectWaveGesture(poseLandmarks, now);
      if (this.waveCooldown > 0) {
        detectedGesture = 'WAVE';
      }
    }

    // Apply wrist rotations from hand states
    robotAngles.lWristRoll = this.leftHandState.wristOrientation.roll;
    robotAngles.lWristPitch = this.leftHandState.wristOrientation.pitch;
    robotAngles.lWristYaw = this.leftHandState.wristOrientation.yaw;

    robotAngles.rWristRoll = this.rightHandState.wristOrientation.roll;
    robotAngles.rWristPitch = this.rightHandState.wristOrientation.pitch;
    robotAngles.rWristYaw = this.rightHandState.wristOrientation.yaw;

    // Fire callbacks
    this.callbacks.onPoseUpdate({
      angles: robotAngles,
      leftHand: this.leftHandState,
      rightHand: this.rightHandState,
      gesture: detectedGesture,
      metrics: {
        renderFps: 0, // Filled by render loop
        visionFps: this.currentVisionFps,
        latencyMs: this.lastLatencyMs,
        poseConfidence: poseConf,
        leftHandConfidence: lConf,
        rightHandConfidence: rConf,
        faceConfidence: poseConf > 0.3 ? 0.9 : 0,
        activeArmSource: armSources,
        boundaryDeflected: boundaryDeflectedInfo,
      },
    });

    // Draw video overlays
    this.callbacks.onOverlayDraw(poseLandmarks, handLandmarksList);
  }

  private detectWaveGesture(poseLm: LandmarkPoint[], now: number): void {
    if (this.waveCooldown > 0) {
      this.waveCooldown--;
      return;
    }
    const rWrist = poseLm[16];
    if (!rWrist) return;

    this.waveHistory.push({ time: now, x: rWrist.x });
    while (this.waveHistory.length > 0 && now - this.waveHistory[0].time > 1200) {
      this.waveHistory.shift();
    }

    if (this.waveHistory.length >= 7) {
      let reversals = 0;
      let dir = 0;
      let minX = 1;
      let maxX = 0;

      for (let i = 1; i < this.waveHistory.length; i++) {
        const dx = this.waveHistory[i].x - this.waveHistory[i - 1].x;
        minX = Math.min(minX, this.waveHistory[i].x);
        maxX = Math.max(maxX, this.waveHistory[i].x);
        const nd = dx > 0.003 ? 1 : dx < -0.003 ? -1 : dir;
        if (nd !== dir && nd !== 0) {
          reversals++;
          dir = nd;
        }
      }

      if (reversals >= 4 && maxX - minX > 0.08) {
        this.waveCooldown = 45; // ~1.5s cooldown
        this.waveHistory = [];
      }
    }
  }
}
