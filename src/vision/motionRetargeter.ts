/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import {
  FingerJoints,
  GestureType,
  HandFingersState,
  JointLimits,
  RobotJointAngles,
} from '../types';
import { RobotArmIKSolver } from '../robot/robotModel';

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

/**
 * 3D vector angle helper between two vectors with magnitude safeguards.
 */
export function angleBetweenVectors(
  v1: { x: number; y: number; z: number },
  v2: { x: number; y: number; z: number }
): number {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m1 = Math.hypot(v1.x, v1.y, v1.z);
  const m2 = Math.hypot(v2.x, v2.y, v2.z);
  if (m1 < 1e-6 || m2 < 1e-6) return 0;
  const cosine = clamp(dot / (m1 * m2), -1.0, 1.0);
  return Math.acos(cosine);
}

/**
 * Landmark 3D vector angle helper: angle at vertex B formed by rays BA and BC.
 */
export function angleBetweenPoints(
  a: LandmarkPoint,
  b: LandmarkPoint,
  c: LandmarkPoint
): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  return angleBetweenVectors(v1, v2);
}

// --------------------------------------------------------------------------
// BODY BOUNDARY SYSTEM: SOFT-CLAMPING THRESHOLD ZONE
// --------------------------------------------------------------------------

export interface SoftClampBoundaryResult {
  position: THREE.Vector3;
  isDeflected: boolean;
  penetrationDistance: number;
  dampingFactor: number; // 1.0 = outside zone (full free speed), < 1.0 = smoothly decelerating towards boundary
}

/**
 * Soft-clamping threshold at the body-boundary zone.
 * Instead of abrupt stopping when the hand hits the boundary,
 * smoothly slows down the robot arm movement as it approaches the limit.
 *
 * @param posInShoulderFrame Target 3D point in shoulder local frame
 * @param side Arm side ('left' | 'right')
 * @param softThresholdMargin Width of the deceleration cushion zone in meters (default 0.08m = 8cm)
 * @param enabled Whether boundary checking is active
 */
export function softClampBodyBoundary(
  posInShoulderFrame: THREE.Vector3,
  side: 'left' | 'right',
  softThresholdMargin: number = 0.08,
  enabled: boolean = true
): SoftClampBoundaryResult {
  if (!enabled) {
    return {
      position: posInShoulderFrame.clone(),
      isDeflected: false,
      penetrationDistance: 0,
      dampingFactor: 1.0,
    };
  }

  const sign = side === 'left' ? -1 : 1;
  const resultPos = posInShoulderFrame.clone();

  // Shoulder origin in robot torso frame: x = sign * 0.255, y = 0.54, z = 0.01
  const torsoX = resultPos.x + sign * 0.255;
  const torsoY = resultPos.y + 0.54;
  const torsoZ = resultPos.z + 0.01;

  let isDeflected = false;
  let maxPenetration = 0;
  let minDamping = 1.0;

  // 1. Head & Neck Collision Volume (ty > 0.60):
  // Center: (0, 0.82, 0.04), safe hard radius = 0.23m
  if (torsoY > 0.60) {
    const headCenter = new THREE.Vector3(0, 0.82, 0.04);
    const toHead = new THREE.Vector3(torsoX, torsoY, torsoZ).sub(headCenter);
    const distHead = toHead.length();
    const rHeadHard = 0.23;
    const rHeadSoft = rHeadHard + softThresholdMargin;

    if (distHead < rHeadSoft) {
      const norm = distHead > 1e-4 ? toHead.clone().normalize() : new THREE.Vector3(0, 0, 1);

      if (distHead < rHeadHard) {
        // Hand reached or penetrated hard boundary: softly cushion and project outward
        const pen = rHeadHard - distHead;
        maxPenetration = Math.max(maxPenetration, pen);
        isDeflected = true;
        minDamping = Math.min(minDamping, 0.05);

        const clampedR = rHeadHard + 0.008 * Math.tanh(-pen / 0.008);
        const clampedTorso = headCenter.clone().addScaledVector(norm, clampedR);
        resultPos.x = clampedTorso.x - sign * 0.255;
        resultPos.y = clampedTorso.y - 0.54;
        resultPos.z = clampedTorso.z - 0.01;
      } else {
        // In Soft-Clamping Threshold Zone [rHeadHard, rHeadSoft]:
        // Smoothly slow down the arm movement as it approaches the limit.
        const u = (distHead - rHeadHard) / softThresholdMargin; // 1.0 (outer) down to 0.0 (limit)
        // Cubic Hermite deceleration: S(u) = 3u^2 - 2u^3
        const smoothDecel = u * u * (3 - 2 * u);
        const damp = Math.max(0.12, smoothDecel);
        minDamping = Math.min(minDamping, damp);

        // Smoothly compress inward radial displacement towards the boundary
        const softClampedR = rHeadHard + softThresholdMargin * Math.pow(u, 1.45);
        const clampedTorso = headCenter.clone().addScaledVector(norm, softClampedR);
        resultPos.x = clampedTorso.x - sign * 0.255;
        resultPos.y = clampedTorso.y - 0.54;
        resultPos.z = clampedTorso.z - 0.01;
        isDeflected = true;
      }
    }
  }

  // 2. Thorax, Ribs & Sculpted Chest Armor Collision Envelope (torsoY between -0.42 and 0.65)
  const curTorsoY = resultPos.y + 0.54;
  if (curTorsoY >= -0.42 && curTorsoY <= 0.65) {
    const curTorsoX = resultPos.x + sign * 0.255;
    const curTorsoZ = resultPos.z + 0.01;

    // Elliptical cross-section: Rx ~0.265m (chest) down to ~0.23m (waist)
    const tH = Math.max(0, Math.min(1, (curTorsoY + 0.42) / 1.07));
    const rx = 0.24 + 0.035 * Math.sin(tH * Math.PI);
    const rz = 0.195;
    const zCenter = 0.02;

    const qx = curTorsoX / rx;
    const qz = (curTorsoZ - zCenter) / rz;
    const distEllipse = Math.hypot(qx, qz);

    const avgR = (rx + rz) * 0.5;
    const deltaQSoft = softThresholdMargin / avgR; // ~0.37 normalized margin

    if (distEllipse < 1.0 + deltaQSoft) {
      if (distEllipse < 1.0) {
        // Penetrated inside hard limit
        const pen = (1.0 - distEllipse) * avgR;
        maxPenetration = Math.max(maxPenetration, pen);
        isDeflected = true;
        minDamping = Math.min(minDamping, 0.05);

        const clampedQ = 1.0 + 0.015 * Math.tanh((distEllipse - 1.0) / 0.015);
        const safeQx = distEllipse > 1e-4 ? (qx / distEllipse) * clampedQ : (sign === -1 ? 1 : -1);
        const safeQz = distEllipse > 1e-4 ? (qz / distEllipse) * clampedQ : 1;

        let outX = safeQx * rx;
        let outZ = zCenter + safeQz * rz;

        if (curTorsoZ >= -0.04) {
          if (outZ < 0.21) outZ = 0.21;
        } else {
          if (outZ > -0.17) outZ = -0.17;
        }

        resultPos.x = outX - sign * 0.255;
        resultPos.z = outZ - 0.01;
      } else {
        // In Soft-Clamping Threshold Zone:
        // Hand approaches the chest shield. Smoothly slow down movement.
        const u = (distEllipse - 1.0) / deltaQSoft; // 1.0 (outer) -> 0.0 (boundary)
        const smoothDecel = u * u * (3 - 2 * u);
        const damp = Math.max(0.15, smoothDecel);
        minDamping = Math.min(minDamping, damp);

        const clampedQ = 1.0 + deltaQSoft * Math.pow(u, 1.45);
        const safeQx = (qx / distEllipse) * clampedQ;
        const safeQz = (qz / distEllipse) * clampedQ;

        let outX = safeQx * rx;
        let outZ = zCenter + safeQz * rz;

        if (curTorsoZ >= -0.04) {
          if (outZ < 0.21) outZ = THREE.MathUtils.lerp(0.21, outZ, u);
        }

        resultPos.x = outX - sign * 0.255;
        resultPos.z = outZ - 0.01;
        isDeflected = true;
      }
    }
  }

  // 3. Pelvis & Mount Base Collision Envelope (for torsoY < -0.42)
  const curTorsoY2 = resultPos.y + 0.54;
  if (curTorsoY2 < -0.42) {
    const curTorsoX2 = resultPos.x + sign * 0.255;
    const curTorsoZ2 = resultPos.z + 0.01;
    const rPelvisHard = 0.24;
    const rPelvisSoft = rPelvisHard + softThresholdMargin;
    const distP = Math.hypot(curTorsoX2, curTorsoZ2);

    if (distP < rPelvisSoft) {
      if (distP < rPelvisHard) {
        const pen = rPelvisHard - distP;
        maxPenetration = Math.max(maxPenetration, pen);
        isDeflected = true;
        minDamping = Math.min(minDamping, 0.05);

        const clampedR = rPelvisHard + 0.01 * Math.tanh(-pen / 0.01);
        const s = clampedR / Math.max(distP, 1e-4);
        resultPos.x = curTorsoX2 * s - sign * 0.255;
        resultPos.z = curTorsoZ2 * s - 0.01;
      } else {
        const u = (distP - rPelvisHard) / softThresholdMargin;
        const smoothDecel = u * u * (3 - 2 * u);
        minDamping = Math.min(minDamping, Math.max(0.15, smoothDecel));

        const clampedR = rPelvisHard + softThresholdMargin * Math.pow(u, 1.45);
        const s = clampedR / Math.max(distP, 1e-4);
        resultPos.x = curTorsoX2 * s - sign * 0.255;
        resultPos.z = curTorsoZ2 * s - 0.01;
        isDeflected = true;
      }
    }
  }

  return {
    position: resultPos,
    isDeflected,
    penetrationDistance: maxPenetration,
    dampingFactor: minDamping,
  };
}

// --------------------------------------------------------------------------
// INDEPENDENT 21-LANDMARK HAND & FINGER KINEMATICS
// --------------------------------------------------------------------------

/**
 * Calculates independent finger joint bend angles using 3D bone vectors:
 * - MCP -> PIP vector vs PIP -> DIP vector = PIP rotation angle
 * - PIP -> DIP vector vs DIP -> TIP vector = DIP rotation angle
 * - Wrist -> MCP vector vs MCP -> PIP vector = MCP rotation angle
 */
function computeIndependentFingerCurls(
  landmarks: LandmarkPoint[],
  mcpIdx: number,
  pipIdx: number,
  dipIdx: number,
  tipIdx: number
): FingerJoints {
  const w = landmarks[0]; // Wrist
  const m = landmarks[mcpIdx];
  const p = landmarks[pipIdx];
  const d = landmarks[dipIdx];
  const t = landmarks[tipIdx];

  // 3D Bone segment vectors
  const vWristMcp = { x: m.x - w.x, y: m.y - w.y, z: (m.z ?? 0) - (w.z ?? 0) };
  const vMcpPip = { x: p.x - m.x, y: p.y - m.y, z: (p.z ?? 0) - (m.z ?? 0) };
  const vPipDip = { x: d.x - p.x, y: d.y - p.y, z: (d.z ?? 0) - (p.z ?? 0) };
  const vDipTip = { x: t.x - d.x, y: t.y - d.y, z: (t.z ?? 0) - (d.z ?? 0) };

  // Calculate bend angles directly using vectors:
  // Angle between bone segments: straight = 0 rad, bent 90 deg = 1.57 rad
  const mcpAngle = angleBetweenVectors(vWristMcp, vMcpPip);
  const pipAngle = angleBetweenVectors(vMcpPip, vPipDip);
  const dipAngle = angleBetweenVectors(vPipDip, vDipTip);

  // Tip-to-knuckle contraction ratio as foreshortening compensator
  const tipSpan = Math.hypot(t.x - m.x, t.y - m.y, (t.z ?? 0) - (m.z ?? 0));
  const l1 = Math.hypot(vMcpPip.x, vMcpPip.y, vMcpPip.z);
  const l2 = Math.hypot(vPipDip.x, vPipDip.y, vPipDip.z);
  const l3 = Math.hypot(vDipTip.x, vDipTip.y, vDipTip.z);
  const totalLen = Math.max(1e-4, l1 + l2 + l3);
  const contraction = clamp((0.92 - tipSpan / totalLen) / 0.58, 0.0, 1.0);

  // Blend direct vector angles with contraction for maximum responsiveness
  const mcpCurl = clamp(
    Math.max(mcpAngle * 1.15, contraction * ROBOT_LIMITS.fingerMcp[1] * 0.92),
    ROBOT_LIMITS.fingerMcp[0],
    ROBOT_LIMITS.fingerMcp[1]
  );
  const pipCurl = clamp(
    Math.max(pipAngle * 1.2, contraction * ROBOT_LIMITS.fingerPip[1] * 0.95),
    ROBOT_LIMITS.fingerPip[0],
    ROBOT_LIMITS.fingerPip[1]
  );
  const dipCurl = clamp(
    Math.max(dipAngle * 1.15, contraction * ROBOT_LIMITS.fingerDip[1] * 0.88),
    ROBOT_LIMITS.fingerDip[0],
    ROBOT_LIMITS.fingerDip[1]
  );

  return { mcp: mcpCurl, pip: pipCurl, dip: dipCurl };
}

/**
 * Handles the thumb independently using:
 * Wrist (0), Thumb CMC (1), Thumb MCP (2), Thumb IP (3), Thumb TIP (4)
 */
function computeIndependentThumb(
  landmarks: LandmarkPoint[]
): FingerJoints {
  const w = landmarks[0]; // Wrist
  const cmc = landmarks[1];
  const mcp = landmarks[2];
  const ip = landmarks[3];
  const tip = landmarks[4];

  // Vectors
  const vCmcMcp = { x: mcp.x - cmc.x, y: mcp.y - cmc.y, z: (mcp.z ?? 0) - (cmc.z ?? 0) };
  const vMcpIp = { x: ip.x - mcp.x, y: ip.y - mcp.y, z: (ip.z ?? 0) - (mcp.z ?? 0) };
  const vIpTip = { x: tip.x - ip.x, y: tip.y - ip.y, z: (tip.z ?? 0) - (ip.z ?? 0) };

  // Thumb MCP bend: angle between CMC->MCP and MCP->IP
  const mcpBend = angleBetweenVectors(vCmcMcp, vMcpIp);
  // Thumb IP bend: angle between MCP->IP and IP->TIP
  const ipBend = angleBetweenVectors(vMcpIp, vIpTip);

  // Distance from thumb tip to base of index finger (MCP 5) measures opposition/curl
  const idxMcp = landmarks[5];
  const palmScale = Math.hypot(landmarks[9].x - w.x, landmarks[9].y - w.y) || 0.1;
  const oppDist = Math.hypot(tip.x - idxMcp.x, tip.y - idxMcp.y) / palmScale;
  const oppCurl = clamp((1.35 - oppDist) / 0.85, 0.0, 1.0);

  const mcpCurl = clamp(
    Math.max(mcpBend * 1.25, oppCurl * ROBOT_LIMITS.fingerMcp[1] * 0.90),
    ROBOT_LIMITS.fingerMcp[0],
    ROBOT_LIMITS.fingerMcp[1]
  );
  const pipCurl = clamp(
    Math.max(ipBend * 1.3, oppCurl * ROBOT_LIMITS.fingerPip[1] * 0.92),
    ROBOT_LIMITS.fingerPip[0],
    ROBOT_LIMITS.fingerPip[1]
  );
  const dipCurl = clamp(
    Math.max(ipBend * 0.85, oppCurl * ROBOT_LIMITS.fingerDip[1] * 0.82),
    ROBOT_LIMITS.fingerDip[0],
    ROBOT_LIMITS.fingerDip[1]
  );

  return { mcp: mcpCurl, pip: pipCurl, dip: dipCurl };
}

/**
 * Computes full hand kinematics from 21 MediaPipe hand landmarks.
 * Every finger moves independently based on 3D bone vectors.
 * Wrist orientation is derived from palm coordinate frame (wrist=0, index MCP=5, pinky MCP=17).
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
  // Independent joint angles for all 5 fingers
  const fingers: HandFingersState = {
    thumb: computeIndependentThumb(landmarks),
    index: computeIndependentFingerCurls(landmarks, 5, 6, 7, 8),
    middle: computeIndependentFingerCurls(landmarks, 9, 10, 11, 12),
    ring: computeIndependentFingerCurls(landmarks, 13, 14, 15, 16),
    pinky: computeIndependentFingerCurls(landmarks, 17, 18, 19, 20),
  };

  // ------------------------------------------------------------------------
  // PALM COORDINATE FRAME & WRIST ORIENTATION (Wrist = 0, Index MCP = 5, Pinky MCP = 17)
  // ------------------------------------------------------------------------
  const pts = worldLandmarks || landmarks;
  const wrist = pts[0];
  const idxMcp = pts[5];
  const pinkyMcp = pts[17];
  const midMcp = pts[9];

  // Vector across palm (from pinky knuckle to index knuckle)
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

  // Wrist roll: rotation around forearm axis (tilt of transverse knuckle line)
  const roll = clamp(
    Math.atan2(acrossNorm.y, acrossNorm.x) * sign,
    ROBOT_LIMITS.wristRoll[0],
    ROBOT_LIMITS.wristRoll[1]
  );
  // Wrist yaw: radial / ulnar deviation (tilt of palm left/right)
  const yaw = clamp(
    Math.atan2(alongNorm.x, alongNorm.z) * sign,
    ROBOT_LIMITS.wristYaw[0],
    ROBOT_LIMITS.wristYaw[1]
  );
  // Wrist pitch: flexion / extension (bending hand forward/backward)
  const pitch = clamp(
    Math.asin(clamp(alongNorm.y, -1, 1)),
    ROBOT_LIMITS.wristPitch[0],
    ROBOT_LIMITS.wristPitch[1]
  );

  // Gesture classification
  const palmSize = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y) || 0.001;
  const pinchDist = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y) / palmSize;

  const isExtended = (f: keyof HandFingersState) => fingers[f].mcp < 0.42;
  const isCurled = (f: keyof HandFingersState) => fingers[f].mcp > 0.68;

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
 * Retargets human pose landmarks to robot upper body joints.
 * Continuously responds to human arm movements and coordinates.
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

  // Head Yaw, Pitch & Roll
  const headYaw = clamp(
    (shoulderMidX - nose.x) * 2.2 * motionGain,
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

  // ------------------------------------------------------------------------
  // ARM KINEMATICS WITH COORDINATE-CONSISTENT INVERSE KINEMATICS
  // ------------------------------------------------------------------------
  // If fused hand wrist is provided (normalized screen space), we MUST use
  // normalized pose shoulder & elbow to ensure 100% consistent coordinate space.
  const hasWorldLandmarks = Boolean(worldLandmarks && worldLandmarks.length >= 25);

  const useWorldL = Boolean(hasWorldLandmarks && !leftFusedWrist && worldLandmarks);
  const lShoulderPt = (useWorldL ? worldLandmarks![11] : lShoulder) || lShoulder;
  const lElbowPt = (useWorldL ? worldLandmarks![13] : lElbow) || lElbow;
  const lWristPt = leftFusedWrist || (useWorldL ? worldLandmarks![15] : lWrist) || lWrist;
  const lSource: 'HAND' | 'POSE' | 'NONE' = leftFusedWrist ? 'HAND' : lWristPt ? 'POSE' : 'NONE';

  const lIK = retargetIKSolverLeft.solveFromLandmarks(
    lShoulderPt,
    lElbowPt,
    lWristPt,
    motionGain,
    useWorldL
  );

  const useWorldR = Boolean(hasWorldLandmarks && !rightFusedWrist && worldLandmarks);
  const rShoulderPt = (useWorldR ? worldLandmarks![12] : rShoulder) || rShoulder;
  const rElbowPt = (useWorldR ? worldLandmarks![14] : rElbow) || rElbow;
  const rWristPt = rightFusedWrist || (useWorldR ? worldLandmarks![16] : rWrist) || rWrist;
  const rSource: 'HAND' | 'POSE' | 'NONE' = rightFusedWrist ? 'HAND' : rWristPt ? 'POSE' : 'NONE';

  const rIK = retargetIKSolverRight.solveFromLandmarks(
    rShoulderPt,
    rElbowPt,
    rWristPt,
    motionGain,
    useWorldR
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
