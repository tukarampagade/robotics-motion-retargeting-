/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface JointLimits {
  elbow: [number, number];
  neckYaw: [number, number];
  neckPitch: [number, number];
  neckRoll: [number, number];
  shoulderZ: [number, number];
  shoulderX: [number, number];
  shoulderY: [number, number];
  wristRoll: [number, number];
  wristPitch: [number, number];
  wristYaw: [number, number];
  fingerMcp: [number, number];
  fingerPip: [number, number];
  fingerDip: [number, number];
}

export interface RobotJointAngles {
  headYaw: number;
  headPitch: number;
  headRoll: number;
  eyeX: number; // -1 (left) to +1 (right)
  eyeY: number; // -1 (down) to +1 (up)
  mouthState: 'neutral' | 'smile' | 'speaking' | 'interacting';
  torsoYaw: number;
  torsoLean: number;
  lShoulderZ: number;
  lShoulderX: number;
  lShoulderY: number;
  lElbow: number;
  rShoulderZ: number;
  rShoulderX: number;
  rShoulderY: number;
  rElbow: number;
  lWristRoll: number;
  lWristPitch: number;
  lWristYaw: number;
  rWristRoll: number;
  rWristPitch: number;
  rWristYaw: number;
}

export interface FingerJoints {
  mcp: number;
  pip: number;
  dip: number;
}

export interface HandFingersState {
  thumb: FingerJoints;
  index: FingerJoints;
  middle: FingerJoints;
  ring: FingerJoints;
  pinky: FingerJoints;
}

export type GestureType =
  | '—'
  | 'OPEN_PALM'
  | 'FIST'
  | 'POINT'
  | 'VICTORY'
  | 'THUMBS_UP'
  | 'THUMBS_DOWN'
  | 'PINCH'
  | 'WAVE'
  | 'MIRRORING';

export interface HandTrackingState {
  detected: boolean;
  confidence: number;
  rawLabel: 'Left' | 'Right' | null;
  wristPos: { x: number; y: number; z: number };
  wristOrientation: { roll: number; pitch: number; yaw: number };
  fingers: HandFingersState;
  gesture: GestureType;
  pinchDistance: number;
  isGrip: boolean;
}

export interface PoseTrackingState {
  detected: boolean;
  confidence: number;
  head: { yaw: number; pitch: number; roll: number };
  gaze: { x: number; y: number };
  lArm: { shoulderZ: number; shoulderX: number; shoulderY: number; elbow: number };
  rArm: { shoulderZ: number; shoulderX: number; shoulderY: number; elbow: number };
  torso: { yaw: number; lean: number };
}

export interface TrackingMetrics {
  renderFps: number;
  visionFps: number;
  latencyMs: number;
  rawLandmarkLatencyMs?: number;
  inferenceLatencyMs?: number;
  kinematicsLatencyMs?: number;
  poseConfidence: number;
  leftHandConfidence: number;
  rightHandConfidence: number;
  faceConfidence: number;
  activeArmSource: {
    left: 'HAND' | 'POSE' | 'NONE';
    right: 'HAND' | 'POSE' | 'NONE';
  };
  boundaryDeflected?: {
    left: boolean;
    right: boolean;
    leftDist: number;
    rightDist: number;
  };
}

export interface PickableObject {
  id: string;
  name: string;
  type: 'box' | 'cylinder' | 'package';
  color: string;
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  isHeld: boolean;
  heldByHand: 'left' | 'right' | null;
  isPlaced: boolean;
}

export interface CalibrationData {
  isCalibrating: boolean;
  progress: number;
  shoulderWidthRef: number;
  armLengthRef: number;
  neutralHead: { yaw: number; pitch: number };
  samplesCount: number;
  isDone: boolean;
}

export interface AppSettings {
  smoothingTau: number; // seconds
  motionGain: number;
  mirrorView: boolean;
  showSkeleton: boolean;
  showFingers: boolean;
  poseModelQuality: 'full' | 'lite';
  cameraView: 'front' | '3q' | 'side' | 'top' | 'close';
  enablePickPlace: boolean;
  enableDebug: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  motionTrailsEnabled: boolean;
  showGestureGuide: boolean;
  enableSaccades: boolean;
  enableOneEuroFilter: boolean;
  studioLightingEnabled: boolean;
  bodyBoundaryEnabled: boolean;
  showBodyBoundaryShield: boolean;
  futuristicMode: boolean;
  responsePreset: 'ultra_fast' | 'balanced' | 'cinematic';
}
