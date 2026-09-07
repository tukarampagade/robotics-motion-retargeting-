/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FingerJoints,
  GestureType,
  HandFingersState,
  HandTrackingState,
  JointLimits,
  PoseTrackingState,
  RobotJointAngles,
} from '../types';
import { RobotArmIKSolver, Landmark3D } from '../robot/robotModel';

export const ROBOT_LIMITS: JointLimits = {
  elbow: [0, THREE_DEG(150)],
  neckYaw: [THREE_DEG(-65), THREE_DEG(65)],
  neckPitch: [THREE_DEG(-28), THREE_DEG(28)],
  neckRoll: [THREE_DEG(-20), THREE_DEG(20)],
  shoulderZ: [-2.6, 2.6],
  shoulderX: [-1.4, 0.45],
  shoulderY: [-0.95, 0.95],
  wristRoll: [-1.25, 1.25],
  wristPitch: [-0.95, 0.95],
  wristYaw: [-1.05, 1.05],
  fingerMcp: [0, THREE_DEG(95)],
  fingerPip: [0, THREE_DEG(105)],
  fingerDip: [0, THREE_DEG(90)],
};

// Global retargeting IK solvers with persistent state for temporal stability
const retargetIKSolverLeft = new RobotArmIKSolver('left');
const retargetIKSolverRight = new RobotArmIKSolver('right');

function THREE_DEG(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function freshFingerJoints(): FingerJoints {
  return { mcp: 0, pip: 0, dip: 0 };
}

export function freshHandFingers(): HandFingersState {
  return {
    thumb: freshFingerJoints(),
    index: freshFingerJoints(),
    middle: freshFingerJoints(),
    ring: freshFingerJoints(),
    pinky: freshFingerJoints(),
  };
}

export function freshRobotJointAngles(): RobotJointAngles {
  return {
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    eyeX: 0,
    eyeY: 0,
    mouthState: 'neutral',
    torsoYaw: 0,
    torsoLean: 0,
    lShoulderZ: 0.12,
    lShoulderX: 0,
    lShoulderY: 0,
    lElbow: 0.15,
    rShoulderZ: -0.12,
    rShoulderX: 0,
    rShoulderY: 0,
    rElbow: 0.15,
    lWristRoll: 0,
    lWristPitch: 0,
    lWristYaw: 0,
    rWristRoll: 0,
    rWristPitch: 0,
    rWristYaw: 0,
  };
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

// Landmark 3D vector angle helper
export function angleBetweenPoints(
  a: LandmarkPoint,
  b: LandmarkPoint,
  c: LandmarkPoint
): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m1 = Math.hypot(v1.x, v1.y, v1.z);
  const m2 = Math.hypot(v2.x, v2.y, v2.z);
  if (m1 < 1e-6 || m2 < 1e-6) return Math.PI;
  // Crucial clamp to prevent NaN
  const cosine = clamp(dot / (m1 * m2), -1.0, 1.0);
  return Math.acos(cosine);
}

/**
 * Computes individual finger curls for a given landmark chain with full dynamic range
 */
function computeChainCurls(
  landmarks: LandmarkPoint[],
  indices: [number, number, number, number], // [mcp, pip, dip, tip]
  isThumb: boolean = false
): FingerJoints {
  const [a, b, c, d] = indices;
  const wrist = landmarks[0];

  const lmA = landmarks[a];
  const lmB = landmarks[b];
  const lmC = landmarks[c];
  const lmD = landmarks[d];

  // Euclidean distances along the kinematic chain
  const dist = (p1: LandmarkPoint, p2: LandmarkPoint) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z ?? 0) - (p2.z ?? 0));

  const dAB = dist(lmA, lmB) || 1e-4;
  const dBC = dist(lmB, lmC) || 1e-4;
  const dCD = dist(lmC, lmD) || 1e-4;
  const chainLen = dAB + dBC + dCD;
  const tipSpan = dist(lmA, lmD);

  if (isThumb) {
    // Thumb anatomical kinematics
    const mcpAngle = angleBetweenPoints(wrist, lmA, lmB);
    const ipAngle = angleBetweenPoints(lmA, lmB, lmC);
    const tipAngle = angleBetweenPoints(lmB, lmC, lmD);

    const spanRatio = tipSpan / chainLen;
    const curlNorm = clamp((0.88 - spanRatio) / 0.52, 0.0, 1.0);

    const mcpFlex = Math.max(0, (Math.PI - mcpAngle) * 1.3);
    const ipFlex = Math.max(0, (Math.PI - ipAngle) * 1.45);
    const tipFlex = Math.max(0, (Math.PI - tipAngle) * 1.35);

    const mcpCurl = clamp(
      Math.max(mcpFlex, curlNorm * ROBOT_LIMITS.fingerMcp[1] * 0.95),
      ROBOT_LIMITS.fingerMcp[0],
      ROBOT_LIMITS.fingerMcp[1]
    );
    const pipCurl = clamp(
      Math.max(ipFlex, curlNorm * ROBOT_LIMITS.fingerPip[1] * 0.95),
      ROBOT_LIMITS.fingerPip[0],
      ROBOT_LIMITS.fingerPip[1]
    );
    const dipCurl = clamp(
      Math.max(tipFlex, curlNorm * ROBOT_LIMITS.fingerDip[1] * 0.85),
      ROBOT_LIMITS.fingerDip[0],
      ROBOT_LIMITS.fingerDip[1]
    );

    return { mcp: mcpCurl, pip: pipCurl, dip: dipCurl };
  }

  // Fingers (Index, Middle, Ring, Pinky)
  // Distance from MCP to TIP: 1.0 when straight, ~0.28 when curled in fist
  const spanRatio = tipSpan / chainLen;
  const curlNorm = clamp((0.94 - spanRatio) / 0.65, 0.0, 1.0);

  // Joint flexion angles
  const mcpAngle = angleBetweenPoints(wrist, lmA, lmB);
  const pipAngle = angleBetweenPoints(lmA, lmB, lmC);
  const dipAngle = angleBetweenPoints(lmB, lmC, lmD);

  const mcpFlex = Math.max(0, (Math.PI - mcpAngle) * 1.4);
  const pipFlex = Math.max(0, (Math.PI - pipAngle) * 1.45);
  const dipFlex = Math.max(0, (Math.PI - dipAngle) * 1.35);

  // Fuse 3D joint angle with normalized segment contraction for 100% full-response curl
  const mcpCurl = clamp(
    Math.max(mcpFlex * 0.7 + curlNorm * ROBOT_LIMITS.fingerMcp[1] * 0.3, curlNorm * ROBOT_LIMITS.fingerMcp[1] * 0.92),
    ROBOT_LIMITS.fingerMcp[0],
    ROBOT_LIMITS.fingerMcp[1]
  );
  const pipCurl = clamp(
    Math.max(pipFlex * 0.7 + curlNorm * ROBOT_LIMITS.fingerPip[1] * 0.3, curlNorm * ROBOT_LIMITS.fingerPip[1] * 0.95),
    ROBOT_LIMITS.fingerPip[0],
    ROBOT_LIMITS.fingerPip[1]
  );
  const dipCurl = clamp(
    Math.max(dipFlex * 0.7 + curlNorm * ROBOT_LIMITS.fingerDip[1] * 0.3, curlNorm * ROBOT_LIMITS.fingerDip[1] * 0.92),
    ROBOT_LIMITS.fingerDip[0],
    ROBOT_LIMITS.fingerDip[1]
  );

  return { mcp: mcpCurl, pip: pipCurl, dip: dipCurl };
}

/**
 * Computes full hand kinematics from 21 MediaPipe hand landmarks
 */
export function analyzeHandLandmarks(
  landmarks: LandmarkPoint[],
  worldLandmarks: LandmarkPoint[] | undefined,
  sign: number // -1 for left, +1 for right
): {
  fingers: HandFingersState;
  wristOri: { roll: number; pitch: number; yaw: number };
  gesture: GestureType;
  pinchDist: number;
  isGrip: boolean;
} {
  const fingers: HandFingersState = {
    thumb: computeChainCurls(landmarks, [1, 2, 3, 4], true),
    index: computeChainCurls(landmarks, [5, 6, 7, 8], false),
    middle: computeChainCurls(landmarks, [9, 10, 11, 12], false),
    ring: computeChainCurls(landmarks, [13, 14, 15, 16], false),
    pinky: computeChainCurls(landmarks, [17, 18, 19, 20], false),
  };

  // Palm Orientation & Wrist Euler Angles
  // Using landmarks: 0 (wrist), 5 (index mcp), 17 (pinky mcp), 9 (middle mcp)
  const pts = worldLandmarks || landmarks;
  const wrist = pts[0];
  const idxMcp = pts[5];
  const pinkyMcp = pts[17];
  const midMcp = pts[9];

  // Vector across knuckles
  const across = {
    x: idxMcp.x - pinkyMcp.x,
    y: idxMcp.y - pinkyMcp.y,
    z: (idxMcp.z ?? 0) - (pinkyMcp.z ?? 0),
  };
  const acrossMag = Math.hypot(across.x, across.y, across.z) || 1e-5;
  const acrossNorm = { x: across.x / acrossMag, y: across.y / acrossMag, z: across.z / acrossMag };

  // Vector along palm from wrist to middle knuckle
  const along = {
    x: midMcp.x - wrist.x,
    y: midMcp.y - wrist.y,
    z: (midMcp.z ?? 0) - (wrist.z ?? 0),
  };
  const alongMag = Math.hypot(along.x, along.y, along.z) || 1e-5;
  const alongNorm = { x: along.x / alongMag, y: along.y / alongMag, z: along.z / alongMag };

  const roll = clamp(
    Math.atan2(acrossNorm.y, acrossNorm.x) * sign,
    ROBOT_LIMITS.wristRoll[0],
    ROBOT_LIMITS.wristRoll[1]
  );
  const yaw = clamp(
    Math.atan2(alongNorm.x, alongNorm.z) * sign,
    ROBOT_LIMITS.wristYaw[0],
    ROBOT_LIMITS.wristYaw[1]
  );
  const pitch = clamp(
    Math.asin(clamp(alongNorm.y, -1, 1)),
    ROBOT_LIMITS.wristPitch[0],
    ROBOT_LIMITS.wristPitch[1]
  );

  // Gesture classification
  const palmSize = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y) || 0.001;
  const pinchDist = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y) / palmSize;

  const isExtended = (f: keyof HandFingersState) => fingers[f].mcp < 0.38;
  const isCurled = (f: keyof HandFingersState) => fingers[f].mcp > 0.72;

  const thumbUp = landmarks[4].y < landmarks[2].y - palmSize * 0.35;
  const thumbDown = landmarks[4].y > landmarks[2].y + palmSize * 0.35;

  let gesture: GestureType = 'MIRRORING';
  let isGrip = false;

  if (isCurled('index') && isCurled('middle') && isCurled('ring') && isCurled('pinky')) {
    if (thumbUp) {
      gesture = 'THUMBS_UP';
    } else if (thumbDown) {
      gesture = 'THUMBS_DOWN';
    } else {
      gesture = 'FIST';
      isGrip = true;
    }
  } else if (pinchDist < 0.38) {
    gesture = 'PINCH';
    isGrip = true;
  } else if (isExtended('index') && isCurled('middle') && isCurled('ring') && isCurled('pinky')) {
    gesture = 'POINT';
  } else if (isExtended('index') && isExtended('middle') && isCurled('ring') && isCurled('pinky')) {
    gesture = 'VICTORY';
  } else if (
    isExtended('index') &&
    isExtended('middle') &&
    isExtended('ring') &&
    isExtended('pinky') &&
    isExtended('thumb')
  ) {
    gesture = 'OPEN_PALM';
  }

  return {
    fingers,
    wristOri: { roll, pitch, yaw },
    gesture,
    pinchDist,
    isGrip,
  };
}

/**
 * Retargets human pose landmarks to robot upper body joints
 */
export function retargetHumanPose(
  poseLandmarks: LandmarkPoint[],
  leftFusedWrist: LandmarkPoint | null,
  rightFusedWrist: LandmarkPoint | null,
  motionGain: number = 1.0,
  worldLandmarks?: LandmarkPoint[]
): Partial<RobotJointAngles> & {
  activeArmSource: { left: 'HAND' | 'POSE' | 'NONE'; right: 'HAND' | 'POSE' | 'NONE' };
  ikMetrics?: {
    leftReachRatio: number;
    rightReachRatio: number;
    leftNearSingularity: boolean;
    rightNearSingularity: boolean;
  };
  boundaryMetrics?: {
    leftDeflected: boolean;
    rightDeflected: boolean;
    leftPenetration: number;
    rightPenetration: number;
  };
} {
  // MediaPipe Pose landmarks:
  // 0: nose, 1: left eye inner, 2: left eye, 3: left eye outer
  // 4: right eye inner, 5: right eye, 6: right eye outer
  // 7: left ear, 8: right ear
  // 11: left shoulder, 12: right shoulder
  // 13: left elbow, 14: right elbow
  // 15: left wrist, 16: right wrist
  // 23: left hip, 24: right hip
  const nose = poseLandmarks[0];
  const lShoulder = poseLandmarks[11];
  const rShoulder = poseLandmarks[12];
  const lElbow = poseLandmarks[13];
  const rElbow = poseLandmarks[14];
  const lWrist = poseLandmarks[15];
  const rWrist = poseLandmarks[16];
  const lHip = poseLandmarks[23];
  const rHip = poseLandmarks[24];

  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
  const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
  const hipMidX = lHip && rHip ? (lHip.x + rHip.x) / 2 : shoulderMidX;
  const shoulderWidth = Math.hypot(lShoulder.x - rShoulder.x, lShoulder.y - rShoulder.y) || 0.2;

  // Head tracking: Yaw, Pitch, Roll
  const headYaw = clamp(
    ((nose.x - shoulderMidX) / (shoulderWidth * 0.85)) * motionGain,
    ROBOT_LIMITS.neckYaw[0],
    ROBOT_LIMITS.neckYaw[1]
  );
  const headPitch = clamp(
    (nose.y - shoulderMidY + 0.12) * 1.8 * motionGain,
    ROBOT_LIMITS.neckPitch[0],
    ROBOT_LIMITS.neckPitch[1]
  );
  const eyeL = poseLandmarks[2] || poseLandmarks[0];
  const eyeR = poseLandmarks[5] || poseLandmarks[0];
  const headRoll = clamp(
    Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x),
    ROBOT_LIMITS.neckRoll[0],
    ROBOT_LIMITS.neckRoll[1]
  );

  // Directional Eye Gaze: -1 to +1
  const eyeX = clamp(headYaw / ROBOT_LIMITS.neckYaw[1], -1.0, 1.0);
  const eyeY = clamp(-headPitch / ROBOT_LIMITS.neckPitch[1], -1.0, 1.0);

  // Torso Yaw & Lean
  const depthDiff = (rShoulder.z ?? 0) - (lShoulder.z ?? 0);
  const torsoYaw = clamp(depthDiff * 2.8 * motionGain, -0.65, 0.65);
  const torsoLean = clamp((shoulderMidX - hipMidX) * 2.0 * motionGain, -0.25, 0.25);

  // Arm Kinematics calculation with Refined Inverse Kinematics (IK)
  const hasWorldLandmarks = Boolean(worldLandmarks && worldLandmarks.length >= 25);

  // Left arm landmark selection
  const lShoulderPt = (hasWorldLandmarks ? worldLandmarks![11] : lShoulder) || lShoulder;
  const lElbowPt = (hasWorldLandmarks ? worldLandmarks![13] : lElbow) || lElbow;
  const lWristPt = leftFusedWrist || ((hasWorldLandmarks ? worldLandmarks![15] : lWrist) || lWrist);
  const lSource: 'HAND' | 'POSE' | 'NONE' = leftFusedWrist ? 'HAND' : lWristPt ? 'POSE' : 'NONE';

  const lIK = retargetIKSolverLeft.solveFromLandmarks(
    lShoulderPt,
    lElbowPt,
    lWristPt,
    motionGain,
    hasWorldLandmarks
  );

  // Right arm landmark selection
  const rShoulderPt = (hasWorldLandmarks ? worldLandmarks![12] : rShoulder) || rShoulder;
  const rElbowPt = (hasWorldLandmarks ? worldLandmarks![14] : rElbow) || rElbow;
  const rWristPt = rightFusedWrist || ((hasWorldLandmarks ? worldLandmarks![16] : rWrist) || rWrist);
  const rSource: 'HAND' | 'POSE' | 'NONE' = rightFusedWrist ? 'HAND' : rWristPt ? 'POSE' : 'NONE';

  const rIK = retargetIKSolverRight.solveFromLandmarks(
    rShoulderPt,
    rElbowPt,
    rWristPt,
    motionGain,
    hasWorldLandmarks
  );

  return {
    headYaw,
    headPitch,
    headRoll,
    eyeX,
    eyeY,
    torsoYaw,
    torsoLean,
    lShoulderZ: lIK.shoulderZ,
    lShoulderX: lIK.shoulderX,
    lShoulderY: lIK.shoulderY,
    lElbow: lIK.elbow,
    rShoulderZ: rIK.shoulderZ,
    rShoulderX: rIK.shoulderX,
    rShoulderY: rIK.shoulderY,
    rElbow: rIK.elbow,
    activeArmSource: {
      left: lSource,
      right: rSource,
    },
    ikMetrics: {
      leftReachRatio: lIK.reachRatio,
      rightReachRatio: rIK.reachRatio,
      leftNearSingularity: lIK.isNearSingularity,
      rightNearSingularity: rIK.isNearSingularity,
    },
    boundaryMetrics: {
      leftDeflected: lIK.isDeflected,
      rightDeflected: rIK.isDeflected,
      leftPenetration: lIK.deflectionDistance,
      rightPenetration: rIK.deflectionDistance,
    },
  };
}

export function setRetargeterBodyBoundary(enabled: boolean): void {
  retargetIKSolverLeft.bodyBoundaryEnabled = enabled;
  retargetIKSolverRight.bodyBoundaryEnabled = enabled;
}

