/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GestureName, GestureResult, RobotCommand } from '../types/robot';

export interface LandmarkPoint2D {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/**
 * Geometric helper calculating 2D Euclidean distance
 */
function dist(p1: LandmarkPoint2D, p2: LandmarkPoint2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Classifies 21 MediaPipe hand landmarks into standardized robot teleoperation hand signs.
 *
 * Requirements:
 * - THUMB_UP -> FORWARD
 * - THUMB_DOWN -> BACKWARD
 * - POINT_LEFT or hand tilted left -> LEFT
 * - POINT_RIGHT or hand tilted right -> RIGHT
 * - OPEN_PALM -> STOP
 * - CLOSED_FIST -> STOP
 * - UNKNOWN -> STOP
 * - NO_HAND -> STOP
 */
export function classifyHandSign(
  landmarks?: LandmarkPoint2D[] | null,
  minConfidence: number = 0.75,
  overallConfidence: number = 1.0,
  isMirrored: boolean = true
): GestureResult {
  const timestamp = Date.now();

  // Safety Case 1: No hand detected -> Immediate STOP
  if (!landmarks || landmarks.length < 21) {
    return {
      gesture: 'NO_HAND',
      command: 'STOP',
      confidence: 0,
      timestamp,
    };
  }

  // Safety Case 2: Hand confidence below required threshold -> Fail-safe STOP
  const baseConfidence = Math.min(1.0, Math.max(0.0, overallConfidence));
  if (baseConfidence < minConfidence) {
    return {
      gesture: 'UNKNOWN',
      command: 'STOP',
      confidence: baseConfidence,
      timestamp,
    };
  }

  const wrist = landmarks[0];
  const thumbCmc = landmarks[1];
  const thumbMcp = landmarks[2];
  const thumbIp = landmarks[3];
  const thumbTip = landmarks[4];

  const indexMcp = landmarks[5];
  const indexPip = landmarks[6];
  const indexDip = landmarks[7];
  const indexTip = landmarks[8];

  const middleMcp = landmarks[9];
  const middlePip = landmarks[10];
  const middleDip = landmarks[11];
  const middleTip = landmarks[12];

  const ringMcp = landmarks[13];
  const ringPip = landmarks[14];
  const ringDip = landmarks[15];
  const ringTip = landmarks[16];

  const pinkyMcp = landmarks[17];
  const pinkyPip = landmarks[18];
  const pinkyDip = landmarks[19];
  const pinkyTip = landmarks[20];

  // Palm scale reference based on wrist to middle MCP
  const palmScale = Math.max(0.04, dist(wrist, middleMcp));

  // Determine extension of each non-thumb finger
  // A finger is extended if its tip is further from the wrist than its PIP joint
  // and tip is beyond the MCP joint by a reasonable ratio
  const isExtended = (tip: LandmarkPoint2D, pip: LandmarkPoint2D, mcp: LandmarkPoint2D) => {
    const dTipWrist = dist(tip, wrist);
    const dPipWrist = dist(pip, wrist);
    const dTipMcp = dist(tip, mcp);
    return dTipWrist > dPipWrist * 1.15 && dTipMcp > palmScale * 0.65;
  };

  const isCurled = (tip: LandmarkPoint2D, pip: LandmarkPoint2D, mcp: LandmarkPoint2D) => {
    const dTipWrist = dist(tip, wrist);
    const dPipWrist = dist(pip, wrist);
    const dTipMcp = dist(tip, mcp);
    return dTipWrist < dPipWrist * 1.05 || dTipMcp < palmScale * 0.55;
  };

  const indexExtended = isExtended(indexTip, indexPip, indexMcp);
  const middleExtended = isExtended(middleTip, middlePip, middleMcp);
  const ringExtended = isExtended(ringTip, ringPip, ringMcp);
  const pinkyExtended = isExtended(pinkyTip, pinkyPip, pinkyMcp);

  const indexCurled = isCurled(indexTip, indexPip, indexMcp);
  const middleCurled = isCurled(middleTip, middlePip, middleMcp);
  const ringCurled = isCurled(ringTip, ringPip, ringMcp);
  const pinkyCurled = isCurled(pinkyTip, pinkyPip, pinkyMcp);

  const otherThreeCurled = middleCurled && ringCurled && pinkyCurled;
  const allFourExtended = indexExtended && middleExtended && ringExtended && pinkyExtended;
  const allFourCurled = indexCurled && middleCurled && ringCurled && pinkyCurled;

  // Thumb analysis
  // In screen coordinates: Y decreases going upwards, increases going downwards
  const thumbVectorY = thumbTip.y - thumbMcp.y;
  const thumbVectorX = thumbTip.x - thumbMcp.x;
  const thumbDistFromPalm = dist(thumbTip, indexMcp);

  // Hand tilt angle (wrist to middle MCP vector)
  // 0° = straight up, positive = tilted right, negative = tilted left
  const dxHand = middleMcp.x - wrist.x;
  const dyHand = wrist.y - middleMcp.y; // positive upwards
  const tiltAngleRad = Math.atan2(dxHand, dyHand);
  const tiltAngleDeg = (tiltAngleRad * 180) / Math.PI;

  // 1. OPEN PALM -> STOP
  if (allFourExtended) {
    return {
      gesture: 'OPEN_PALM',
      command: 'STOP',
      confidence: baseConfidence,
      timestamp,
      tiltAngleDeg,
    };
  }

  // 2. THUMB UP -> FORWARD
  // 4 fingers curled, thumb pointing straight UP (thumbVectorY < -0.35 * palmScale)
  // and thumb tip is above thumb MCP and wrist
  if (
    allFourCurled &&
    thumbVectorY < -palmScale * 0.35 &&
    Math.abs(thumbVectorX) < Math.abs(thumbVectorY) * 1.5
  ) {
    return {
      gesture: 'THUMB_UP',
      command: 'FORWARD',
      confidence: baseConfidence,
      timestamp,
      tiltAngleDeg,
    };
  }

  // 3. THUMB DOWN -> BACKWARD
  // 4 fingers curled, thumb pointing straight DOWN (thumbVectorY > 0.35 * palmScale)
  if (
    allFourCurled &&
    thumbVectorY > palmScale * 0.35 &&
    Math.abs(thumbVectorX) < Math.abs(thumbVectorY) * 1.5
  ) {
    return {
      gesture: 'THUMB_DOWN',
      command: 'BACKWARD',
      confidence: baseConfidence,
      timestamp,
      tiltAngleDeg,
    };
  }

  // 4. CLOSED FIST -> STOP
  if (allFourCurled) {
    return {
      gesture: 'CLOSED_FIST',
      command: 'STOP',
      confidence: baseConfidence,
      timestamp,
      tiltAngleDeg,
    };
  }

  // 5. POINTING OR HAND TILTED LEFT / RIGHT
  // Direction vector from index MCP to index tip
  const indexDirX = indexTip.x - indexMcp.x;
  const indexDirY = indexTip.y - indexMcp.y;
  const indexAngleRad = Math.atan2(indexDirX, -indexDirY);
  const pointingAngleDeg = (indexAngleRad * 180) / Math.PI;

  // Pointing Left:
  // In mirrored view (what the user sees), pointing to user's left means dx < 0.
  // We also accept when index finger points left and middle/ring/pinky are curled.
  if (indexExtended && otherThreeCurled) {
    // Check horizontal dominance: indexDirX has larger magnitude than indexDirY * 0.4
    if (indexDirX < -palmScale * 0.3) {
      return {
        gesture: 'POINT_LEFT',
        command: 'LEFT',
        confidence: baseConfidence,
        timestamp,
        pointingAngleDeg,
        tiltAngleDeg,
      };
    }
    if (indexDirX > palmScale * 0.3) {
      return {
        gesture: 'POINT_RIGHT',
        command: 'RIGHT',
        confidence: baseConfidence,
        timestamp,
        pointingAngleDeg,
        tiltAngleDeg,
      };
    }
  }

  // Tilt Left / Tilt Right support (hand tilted strongly left or right)
  // Hand tilted left: tiltAngleDeg < -26°
  // Hand tilted right: tiltAngleDeg > 26°
  if (tiltAngleDeg < -26 && (indexExtended || middleExtended)) {
    return {
      gesture: 'POINT_LEFT',
      command: 'LEFT',
      confidence: baseConfidence,
      timestamp,
      pointingAngleDeg,
      tiltAngleDeg,
    };
  }

  if (tiltAngleDeg > 26 && (indexExtended || middleExtended)) {
    return {
      gesture: 'POINT_RIGHT',
      command: 'RIGHT',
      confidence: baseConfidence,
      timestamp,
      pointingAngleDeg,
      tiltAngleDeg,
    };
  }

  // Default: Unknown gesture -> Safe STOP
  return {
    gesture: 'UNKNOWN',
    command: 'STOP',
    confidence: baseConfidence,
    timestamp,
    tiltAngleDeg,
  };
}

/**
 * Pure mapping from GestureName to RobotCommand
 */
export function mapGestureToCommand(gesture: GestureName): RobotCommand {
  switch (gesture) {
    case 'THUMB_UP':
      return 'FORWARD';
    case 'THUMB_DOWN':
      return 'BACKWARD';
    case 'POINT_LEFT':
      return 'LEFT';
    case 'POINT_RIGHT':
      return 'RIGHT';
    case 'OPEN_PALM':
    case 'CLOSED_FIST':
    case 'NO_HAND':
    case 'UNKNOWN':
    default:
      return 'STOP';
  }
}
