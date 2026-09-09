/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FilesetResolver, PoseLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  GestureType,
  HandCalibrationProfile,
  HandDebugTelemetry,
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
import {
  analyzeHandKinematics,
  createDefaultCalibration,
  FingerOcclusionTracker,
  PinchDetector,
} from './handKinematics';
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
  onModelStatusChange?: (status: 'loading' | 'ready' | 'error', message?: string) => void;
  onCalibrationProgress?: (progress: number) => void;
  onCalibrationComplete?: (left: HandCalibrationProfile, right: HandCalibrationProfile) => void;
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
    palmSize: 0.08,
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
    palmSize: 0.08,
    pinchDistance: 1,
    isGrip: false,
  };

  // Independent Kinematics Processors
  private leftPinchDetector: PinchDetector = new PinchDetector();
  private rightPinchDetector: PinchDetector = new PinchDetector();
  private leftOcclusionTracker: FingerOcclusionTracker = new FingerOcclusionTracker();
  private rightOcclusionTracker: FingerOcclusionTracker = new FingerOcclusionTracker();

  // Calibration Profiles
  private leftCalibration: HandCalibrationProfile = createDefaultCalibration();
  private rightCalibration: HandCalibrationProfile = createDefaultCalibration();

  // Active calibration sampling state
  private isCalibratingHand: boolean = false;
  private calibrationSide: 'left' | 'right' | 'both' = 'both';
  private calibrationSamples: Array<{
    left?: HandFingersState;
    right?: HandFingersState;
    leftWidth?: number;
    rightWidth?: number;
  }> = [];

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
  private poseConfidenceThreshold: number = 0.25;

  constructor(callbacks: VisionCallbacks) {
    this.callbacks = callbacks;
  }

  public startHandCalibration(side: 'left' | 'right' | 'both' = 'both') {
    this.isCalibratingHand = true;
    this.calibrationSide = side;
    this.calibrationSamples = [];
  }

  public cancelHandCalibration() {
    this.isCalibratingHand = false;
    this.calibrationSamples = [];
  }

  public resetHandCalibration() {
    this.leftCalibration = createDefaultCalibration();
    this.rightCalibration = createDefaultCalibration();
  }

  public getHandCalibration(): { left: HandCalibrationProfile; right: HandCalibrationProfile } {
    return { left: this.leftCalibration, right: this.rightCalibration };
  }

  public setHandCalibration(left: HandCalibrationProfile, right: HandCalibrationProfile) {
    this.leftCalibration = left;
    this.rightCalibration = right;
  }

  public setPoseConfidenceThreshold(th: number) {
    this.poseConfidenceThreshold = Math.max(0.05, Math.min(0.95, th));
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

  public isInitialized(): boolean {
    return this.poseLandmarker !== null && this.handLandmarker !== null;
  }

  public resetTimestamps(): void {
    this.lastTimestampMs = 0;
    this.lastVideoTime = -1;
    this.poseFilter.reset();
    this.leftHandFilter.reset();
    this.rightHandFilter.reset();
  }

  public async initialize(quality: 'full' | 'lite' = 'lite'): Promise<void> {
    if (this.poseLandmarker && this.handLandmarker && this.poseQuality === quality) {
      return;
    }

    this.poseQuality = quality;
    if (this.callbacks.onModelStatusChange) {
      this.callbacks.onModelStatusChange('loading', 'Loading MediaPipe vision tasks & models...');
    }

    try {
      if (!this.visionResolver) {
        try {
          this.visionResolver = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
          );
        } catch (wasmErr) {
          console.warn('WASM 1.0.1 load failed, using fallback:', wasmErr);
          this.visionResolver = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
          );
        }
      }

      const poseModelPath =
        quality === 'lite'
          ? 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
          : 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

      // Attempt GPU delegate first, gracefully fallback to CPU if unavailable
      try {
        this.poseLandmarker = await PoseLandmarker.createFromOptions(this.visionResolver, {
          baseOptions: {
            modelAssetPath: poseModelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
      } catch (gpuErr) {
        console.warn('GPU acceleration unavailable for PoseLandmarker, falling back to CPU:', gpuErr);
        this.poseLandmarker = await PoseLandmarker.createFromOptions(this.visionResolver, {
          baseOptions: {
            modelAssetPath: poseModelPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
      }

      // Attempt GPU delegate for HandLandmarker, fallback to CPU
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(this.visionResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.25,
          minHandPresenceConfidence: 0.25,
          minTrackingConfidence: 0.25,
        });
      } catch (gpuErr) {
        console.warn('GPU acceleration unavailable for HandLandmarker, falling back to CPU:', gpuErr);
        this.handLandmarker = await HandLandmarker.createFromOptions(this.visionResolver, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.25,
          minHandPresenceConfidence: 0.25,
          minTrackingConfidence: 0.25,
        });
      }

      if (this.callbacks.onModelStatusChange) {
        this.callbacks.onModelStatusChange('ready', 'MediaPipe vision models loaded');
      }
    } catch (err: any) {
      console.error('Failed to initialize MediaPipe models:', err);
      if (this.callbacks.onModelStatusChange) {
        this.callbacks.onModelStatusChange('error', err.message || 'Failed to download or initialize vision models');
      }
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

    let lastRunTime = 0;

    const executeFrame = async (timestamp: number) => {
      if (!this.isRunning) return;

      const elapsed = timestamp - lastRunTime;
      const targetInterval = this.targetIntervalMs;

      if (!this.isProcessing && videoElement.readyState >= 2 && !videoElement.paused && elapsed >= targetInterval) {
        lastRunTime = timestamp;
        this.isProcessing = true;
        try {
          await this.processVideoFrame(videoElement);
        } catch (err) {
          console.warn('Vision frame processing glitch caught safely:', err);
        } finally {
          this.isProcessing = false;
        }
      }

      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(executeFrame);
      }
    };

    this.animationFrameId = requestAnimationFrame(executeFrame);
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
      this.lastTimestampMs + 4,
      videoTimeMs > 0 ? videoTimeMs : Math.round(currentPerf)
    );
    const handTimestamp = monotonicTimestamp + 1;
    const poseTimestamp = monotonicTimestamp + 2;
    this.lastTimestampMs = poseTimestamp;

    const startTime = performance.now();

    // 1. Detect Hand Landmarks
    // HandLandmarker is processed first so hand wrist landmarks can be fused with pose
    let handResults: any = null;
    try {
      handResults = this.handLandmarker.detectForVideo(video, handTimestamp);
    } catch (e) {
      // Guard against momentary buffer loss during fast motion scenes
    }

    // 2. Detect Pose Landmarks
    let poseResults: any = null;
    try {
      poseResults = this.poseLandmarker.detectForVideo(video, poseTimestamp);
    } catch (e) {
      // Guard against momentary frame drop
    }

    const inferenceLatencyMs = performance.now() - startTime;
    this.lastLatencyMs = inferenceLatencyMs;

    // Measure real vision FPS
    this.visionFrameCount++;
    const now = performance.now();
    if (now - this.lastFpsCalcTime >= 1000) {
      this.currentVisionFps = Math.round((this.visionFrameCount * 1000) / (now - this.lastFpsCalcTime));
      this.visionFrameCount = 0;
      this.lastFpsCalcTime = now;
    }

    const kinematicsStartTime = performance.now();
    let poseLandmarks: LandmarkPoint[] | null = null;
    let handLandmarksList: LandmarkPoint[][] | null = null;

    let leftFusedWrist: LandmarkPoint | null = null;
    let rightFusedWrist: LandmarkPoint | null = null;

    let lHandDetected = false;
    let rHandDetected = false;
    let lConf = 0;
    let rConf = 0;
    let detectedGesture: GestureType = 'MIRRORING';

    // Parse Hands with robust handedness resolution
    if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
      const filteredHands: LandmarkPoint[][] = [];

      // -------------------------------------------------------------
      // EXPLICIT LEFT / RIGHT INPUT STREAM DISAMBIGUATION
      // -------------------------------------------------------------
      // Bypasses naive horizontal sorting to prevent cross-body mirroring errors.
      // Evaluates 3D proximity to the pose arm kinematic chain (wrist, elbow, shoulder).
      const pLm = (poseResults && poseResults.landmarks && poseResults.landmarks[0]) || null;
      const assignedLabels: ('Left' | 'Right')[] = [];

      const calcArmProximityCost = (handWrist: LandmarkPoint, armSide: 'Left' | 'Right'): number => {
        // Temporal tracking: distance from previous frame's hand position to prevent swapping during hand crossing
        const prevHand = armSide === 'Left' ? this.leftHandState : this.rightHandState;
        const distPrev = prevHand.detected
          ? Math.hypot(handWrist.x - prevHand.wristPos.x, handWrist.y - prevHand.wristPos.y)
          : 0.5;

        if (!pLm) {
          // Camera frame fallback without pose: user's Left is on right side of image (x > 0.5)
          const sideCost = armSide === 'Left' ? (handWrist.x > 0.5 ? 0.1 : 0.9) : (handWrist.x <= 0.5 ? 0.1 : 0.9);
          return sideCost * 1.5 + distPrev * 2.0;
        }
        const shoulder = armSide === 'Left' ? pLm[11] : pLm[12];
        const elbow = armSide === 'Left' ? pLm[13] : pLm[14];
        const poseWrist = armSide === 'Left' ? pLm[15] : pLm[16];

        const distWrist = poseWrist && (poseWrist.visibility ?? 0) > 0.25
          ? Math.hypot(handWrist.x - poseWrist.x, handWrist.y - poseWrist.y)
          : 0.5;
        const distElbow = elbow && (elbow.visibility ?? 0) > 0.25
          ? Math.hypot(handWrist.x - elbow.x, handWrist.y - elbow.y)
          : 0.7;
        const distShoulder = shoulder && (shoulder.visibility ?? 0) > 0.25
          ? Math.hypot(handWrist.x - shoulder.x, handWrist.y - shoulder.y)
          : 0.9;

        // Weight wrist proximity highest, temporal continuity, then elbow chain continuity
        return distWrist * 2.2 + distPrev * 1.5 + distElbow * 0.8 + distShoulder * 0.3;
      };

      if (handResults.landmarks.length === 1) {
        const wrist0 = handResults.landmarks[0][0];
        const rawLabel0 = handResults.handednesses?.[0]?.[0]?.categoryName;
        const costLeft = calcArmProximityCost(wrist0, 'Left') + (rawLabel0 === 'Right' ? 0.3 : 0.0);
        const costRight = calcArmProximityCost(wrist0, 'Right') + (rawLabel0 === 'Left' ? 0.3 : 0.0);
        assignedLabels.push(costLeft <= costRight ? 'Left' : 'Right');
      } else if (handResults.landmarks.length >= 2) {
        const wrist0 = handResults.landmarks[0][0];
        const wrist1 = handResults.landmarks[1][0];
        const rawLabel0 = handResults.handednesses?.[0]?.[0]?.categoryName;
        const rawLabel1 = handResults.handednesses?.[1]?.[0]?.categoryName;

        // Pairwise Hungarian assignment to find global optimal arm stream mapping
        const cost0L = calcArmProximityCost(wrist0, 'Left') + (rawLabel0 === 'Right' ? 0.3 : 0.0);
        const cost1R = calcArmProximityCost(wrist1, 'Right') + (rawLabel1 === 'Left' ? 0.3 : 0.0);

        const cost0R = calcArmProximityCost(wrist0, 'Right') + (rawLabel0 === 'Left' ? 0.3 : 0.0);
        const cost1L = calcArmProximityCost(wrist1, 'Left') + (rawLabel1 === 'Right' ? 0.3 : 0.0);

        if (cost0L + cost1R <= cost0R + cost1L) {
          assignedLabels[0] = 'Left';
          assignedLabels[1] = 'Right';
        } else {
          assignedLabels[0] = 'Right';
          assignedLabels[1] = 'Left';
        }
      }

      handResults.landmarks.forEach((rawLm: LandmarkPoint[], idx: number) => {
        const rawLabel = handResults.handednesses?.[idx]?.[0]?.categoryName || 'Left';
        const score = handResults.handednesses?.[idx]?.[0]?.score ?? 0.8;
        const label: 'Left' | 'Right' = assignedLabels[idx] || (rawLabel === 'Right' ? 'Right' : 'Left');

        // Apply Adaptive One Euro Filter to hand landmarks to suppress tracking tremor
        const lm = this.useOneEuroFilter
          ? label === 'Left'
            ? this.leftHandFilter.filterLandmarks(rawLm, monotonicTimestamp)
            : this.rightHandFilter.filterLandmarks(rawLm, monotonicTimestamp)
          : rawLm;

        filteredHands.push(lm);

        const sign = label === 'Left' ? -1 : 1;
        const pinchDet = label === 'Left' ? this.leftPinchDetector : this.rightPinchDetector;
        const occlTracker = label === 'Left' ? this.leftOcclusionTracker : this.rightOcclusionTracker;
        const calProfile = label === 'Left' ? this.leftCalibration : this.rightCalibration;

        const analysis = analyzeHandKinematics(
          lm,
          sign,
          pinchDet,
          occlTracker,
          calProfile,
          0.033
        );

        if (label === 'Left') {
          lHandDetected = true;
          lConf = score;
          leftFusedWrist = {
            x: lm[0].x,
            y: lm[0].y,
            z: pLm?.[15]?.z ?? lm[0].z ?? 0,
          };
          this.leftHandState = {
            detected: true,
            confidence: score,
            rawLabel: rawLabel as any,
            wristPos: { x: lm[0].x, y: lm[0].y, z: lm[0].z ?? 0 },
            wristOrientation: analysis.wristOri,
            fingers: analysis.robotFingers,
            gesture: analysis.gesture,
            palmSize: analysis.palmSize,
            pinchDistance: analysis.pinchDistance,
            isGrip: analysis.isPinch || analysis.gesture === 'FIST',
            debugTelemetry: analysis.debugTelemetry,
            landmarks: lm,
          };
          if (analysis.gesture !== 'MIRRORING') {
            detectedGesture = analysis.gesture;
          }
        } else {
          rHandDetected = true;
          rConf = score;
          rightFusedWrist = {
            x: lm[0].x,
            y: lm[0].y,
            z: pLm?.[16]?.z ?? lm[0].z ?? 0,
          };
          this.rightHandState = {
            detected: true,
            confidence: score,
            rawLabel: rawLabel as any,
            wristPos: { x: lm[0].x, y: lm[0].y, z: lm[0].z ?? 0 },
            wristOrientation: analysis.wristOri,
            fingers: analysis.robotFingers,
            gesture: analysis.gesture,
            palmSize: analysis.palmSize,
            pinchDistance: analysis.pinchDistance,
            isGrip: analysis.isPinch || analysis.gesture === 'FIST',
            debugTelemetry: analysis.debugTelemetry,
            landmarks: lm,
          };
          if (analysis.gesture !== 'MIRRORING') {
            detectedGesture = analysis.gesture;
          }
        }
      });

      handLandmarksList = filteredHands;
    }

    // Active hand calibration frame accumulator
    if (this.isCalibratingHand) {
      if (
        (this.calibrationSide === 'left' && lHandDetected) ||
        (this.calibrationSide === 'right' && rHandDetected) ||
        (this.calibrationSide === 'both' && (lHandDetected || rHandDetected))
      ) {
        this.calibrationSamples.push({
          left: this.leftHandState.debugTelemetry?.fingers
            ? {
                thumb: this.leftHandState.debugTelemetry.fingers.thumb.raw,
                index: this.leftHandState.debugTelemetry.fingers.index.raw,
                middle: this.leftHandState.debugTelemetry.fingers.middle.raw,
                ring: this.leftHandState.debugTelemetry.fingers.ring.raw,
                pinky: this.leftHandState.debugTelemetry.fingers.pinky.raw,
              }
            : undefined,
          right: this.rightHandState.debugTelemetry?.fingers
            ? {
                thumb: this.rightHandState.debugTelemetry.fingers.thumb.raw,
                index: this.rightHandState.debugTelemetry.fingers.index.raw,
                middle: this.rightHandState.debugTelemetry.fingers.middle.raw,
                ring: this.rightHandState.debugTelemetry.fingers.ring.raw,
                pinky: this.rightHandState.debugTelemetry.fingers.pinky.raw,
              }
            : undefined,
          leftWidth: this.leftHandState.palmSize,
          rightWidth: this.rightHandState.palmSize,
        });

        const progress = Math.min(100, Math.round((this.calibrationSamples.length / 25) * 100));
        this.callbacks.onCalibrationProgress?.(progress);

        if (this.calibrationSamples.length >= 25) {
          const avgJoint = (
            samples: Array<HandFingersState | undefined>,
            f: keyof HandFingersState,
            j: 'mcp' | 'pip' | 'dip'
          ) => {
            const vals = samples
              .map(s => s?.[f]?.[j])
              .filter((v): v is number => typeof v === 'number');
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          };

          if (this.calibrationSide === 'left' || this.calibrationSide === 'both') {
            const lSamples = this.calibrationSamples.map(s => s.left);
            const lWidths = this.calibrationSamples
              .map(s => s.leftWidth)
              .filter((w): w is number => typeof w === 'number');
            if (lSamples.some(s => !!s)) {
              this.leftCalibration = {
                ...this.leftCalibration,
                isCalibrated: true,
                palmWidthRef:
                  lWidths.length > 0 ? lWidths.reduce((a, b) => a + b, 0) / lWidths.length : 0.08,
                neutralAngles: {
                  thumb: {
                    mcp: avgJoint(lSamples, 'thumb', 'mcp'),
                    pip: avgJoint(lSamples, 'thumb', 'pip'),
                    dip: avgJoint(lSamples, 'thumb', 'dip'),
                  },
                  index: {
                    mcp: avgJoint(lSamples, 'index', 'mcp'),
                    pip: avgJoint(lSamples, 'index', 'pip'),
                    dip: avgJoint(lSamples, 'index', 'dip'),
                  },
                  middle: {
                    mcp: avgJoint(lSamples, 'middle', 'mcp'),
                    pip: avgJoint(lSamples, 'middle', 'pip'),
                    dip: avgJoint(lSamples, 'middle', 'dip'),
                  },
                  ring: {
                    mcp: avgJoint(lSamples, 'ring', 'mcp'),
                    pip: avgJoint(lSamples, 'ring', 'pip'),
                    dip: avgJoint(lSamples, 'ring', 'dip'),
                  },
                  pinky: {
                    mcp: avgJoint(lSamples, 'pinky', 'mcp'),
                    pip: avgJoint(lSamples, 'pinky', 'pip'),
                    dip: avgJoint(lSamples, 'pinky', 'dip'),
                  },
                },
              };
            }
          }

          if (this.calibrationSide === 'right' || this.calibrationSide === 'both') {
            const rSamples = this.calibrationSamples.map(s => s.right);
            const rWidths = this.calibrationSamples
              .map(s => s.rightWidth)
              .filter((w): w is number => typeof w === 'number');
            if (rSamples.some(s => !!s)) {
              this.rightCalibration = {
                ...this.rightCalibration,
                isCalibrated: true,
                palmWidthRef:
                  rWidths.length > 0 ? rWidths.reduce((a, b) => a + b, 0) / rWidths.length : 0.08,
                neutralAngles: {
                  thumb: {
                    mcp: avgJoint(rSamples, 'thumb', 'mcp'),
                    pip: avgJoint(rSamples, 'thumb', 'pip'),
                    dip: avgJoint(rSamples, 'thumb', 'dip'),
                  },
                  index: {
                    mcp: avgJoint(rSamples, 'index', 'mcp'),
                    pip: avgJoint(rSamples, 'index', 'pip'),
                    dip: avgJoint(rSamples, 'index', 'dip'),
                  },
                  middle: {
                    mcp: avgJoint(rSamples, 'middle', 'mcp'),
                    pip: avgJoint(rSamples, 'middle', 'pip'),
                    dip: avgJoint(rSamples, 'middle', 'dip'),
                  },
                  ring: {
                    mcp: avgJoint(rSamples, 'ring', 'mcp'),
                    pip: avgJoint(rSamples, 'ring', 'pip'),
                    dip: avgJoint(rSamples, 'ring', 'dip'),
                  },
                  pinky: {
                    mcp: avgJoint(rSamples, 'pinky', 'mcp'),
                    pip: avgJoint(rSamples, 'pinky', 'pip'),
                    dip: avgJoint(rSamples, 'pinky', 'dip'),
                  },
                },
              };
            }
          }

          this.isCalibratingHand = false;
          this.callbacks.onCalibrationComplete?.(this.leftCalibration, this.rightCalibration);
        }
      }
    }

    // Decay hand states smoothly when tracking is lost during fast motion blur
    if (!lHandDetected) {
      this.leftHandState.confidence *= 0.88;
      if (this.leftHandState.confidence < 0.20) {
        this.leftHandState.detected = false;
        this.leftHandFilter.reset();
        (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).forEach(f => {
          this.leftHandState.fingers[f].mcp *= 0.85;
          this.leftHandState.fingers[f].pip *= 0.85;
          this.leftHandState.fingers[f].dip *= 0.85;
        });
      }
    }
    if (!rHandDetected) {
      this.rightHandState.confidence *= 0.88;
      if (this.rightHandState.confidence < 0.20) {
        this.rightHandState.detected = false;
        this.rightHandFilter.reset();
        (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).forEach(f => {
          this.rightHandState.fingers[f].mcp *= 0.85;
          this.rightHandState.fingers[f].pip *= 0.85;
          this.rightHandState.fingers[f].dip *= 0.85;
        });
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
    let latestKinematicDebug = undefined;

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
        worldPoseLandmarks,
        monotonicTimestamp
      );

      Object.assign(robotAngles, retargeted);
      armSources = retargeted.activeArmSource;
      latestKinematicDebug = retargeted.kinematicDebug;
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

    const kinematicsLatencyMs = performance.now() - kinematicsStartTime;
    const rawLandmarkLatencyMs = performance.now() - startTime;

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
        rawLandmarkLatencyMs,
        inferenceLatencyMs,
        kinematicsLatencyMs,
        poseConfidence: poseConf,
        leftHandConfidence: lConf,
        rightHandConfidence: rConf,
        faceConfidence: poseConf > 0.3 ? 0.9 : 0,
        activeArmSource: armSources,
        boundaryDeflected: boundaryDeflectedInfo,
        kinematicDebug: latestKinematicDebug,
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
    const lWrist = poseLm[15];
    const rShoulder = poseLm[12];
    const lShoulder = poseLm[11];

    // Detect if either wrist is raised up (y < shoulder.y)
    const rRaised = rWrist && rShoulder && rWrist.y < rShoulder.y + 0.05;
    const lRaised = lWrist && lShoulder && lWrist.y < lShoulder.y + 0.05;

    let activeWrist: LandmarkPoint | null = null;
    if (rRaised && !lRaised) {
      activeWrist = rWrist;
    } else if (lRaised && !rRaised) {
      activeWrist = lWrist;
    } else if (rRaised && lRaised) {
      // Pick higher wrist
      activeWrist = rWrist.y < lWrist.y ? rWrist : lWrist;
    }

    if (!activeWrist) {
      this.waveHistory = [];
      return;
    }

    this.waveHistory.push({ time: now, x: activeWrist.x });
    while (this.waveHistory.length > 0 && now - this.waveHistory[0].time > 1200) {
      this.waveHistory.shift();
    }

    if (this.waveHistory.length >= 5) {
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

      if (reversals >= 2 && maxX - minX > 0.05) {
        this.waveCooldown = 35; // ~1s cooldown
        this.waveHistory = [];
      }
    }
  }
}
