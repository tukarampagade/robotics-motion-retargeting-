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
    return dTipWrist > dPipWrist * 1.10 && dTipMcp > palmScale * 0.60;
  };

  const isCurled = (tip: LandmarkPoint2D, pip: LandmarkPoint2D, mcp: LandmarkPoint2D) => {
    const dTipWrist = dist(tip, wrist);
    const dPipWrist = dist(pip, wrist);
    const dTipMcp = dist(tip, mcp);
    return dTipWrist < dPipWrist * 1.08 || dTipMcp < palmScale * 0.58;
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

  // 1. OPEN PALM -> STOP (all fingers extended and spread)
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
  // 4 fingers curled (or other 3 curled), thumb pointing straight UP in real world
  // In screen Y: smaller Y is UP. Check that thumb tip is higher than thumb MCP and index MCP
  if (
    (allFourCurled || (otherThreeCurled && !indexExtended)) &&
    thumbVectorY < -palmScale * 0.22 &&
    thumbTip.y < thumbMcp.y &&
    thumbTip.y < indexMcp.y &&
    Math.abs(thumbVectorX) < Math.abs(thumbVectorY) * 2.0
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
  // 4 fingers curled (or other 3 curled), thumb pointing straight DOWN in real world
  // In screen Y: larger Y is DOWN. Check that thumb tip is lower than thumb MCP and wrist
  if (
    (allFourCurled || (otherThreeCurled && !indexExtended)) &&
    thumbVectorY > palmScale * 0.22 &&
    thumbTip.y > thumbMcp.y &&
    thumbTip.y > wrist.y &&
    Math.abs(thumbVectorX) < Math.abs(thumbVectorY) * 2.0
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
  // All 4 fingers curled, thumb tucked or resting
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

  // Correct for camera mirroring:
  // When mirrored (webcam mirror preview), pointing to the user's left appears on the left
  // of the screen, which corresponds to positive delta X in the raw camera sensor.
  const effectiveIndexDirX = isMirrored ? -indexDirX : indexDirX;
  const effectiveTiltDeg = isMirrored ? -tiltAngleDeg : tiltAngleDeg;

  // Pointing Left / Right with index finger extended while others are curled
  if (indexExtended && otherThreeCurled) {
    if (effectiveIndexDirX < -palmScale * 0.22) {
      return {
        gesture: 'POINT_LEFT',
        command: 'LEFT',
        confidence: baseConfidence,
        timestamp,
        pointingAngleDeg,
        tiltAngleDeg: effectiveTiltDeg,
      };
    }
    if (effectiveIndexDirX > palmScale * 0.22) {
      return {
        gesture: 'POINT_RIGHT',
        command: 'RIGHT',
        confidence: baseConfidence,
        timestamp,
        pointingAngleDeg,
        tiltAngleDeg: effectiveTiltDeg,
      };
    }
  }

  // Hand tilt Left / Right support (hand tilted strongly)
  if (effectiveTiltDeg < -24 && (indexExtended || middleExtended)) {
    return {
      gesture: 'POINT_LEFT',
      command: 'LEFT',
      confidence: baseConfidence,
      timestamp,
      pointingAngleDeg,
      tiltAngleDeg: effectiveTiltDeg,
    };
  }

  if (effectiveTiltDeg > 24 && (indexExtended || middleExtended)) {
    return {
      gesture: 'POINT_RIGHT',
      command: 'RIGHT',
      confidence: baseConfidence,
      timestamp,
      pointingAngleDeg,
      tiltAngleDeg: effectiveTiltDeg,
    };
  }

  // Active hand present but in neutral / mirroring motion
  return {
    gesture: 'MIRRORING',
    command: 'STOP',
    confidence: baseConfidence,
    timestamp,
    tiltAngleDeg: effectiveTiltDeg,
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
    case 'MIRRORING':
    case 'NO_HAND':
    case 'UNKNOWN':
    default:
      return 'STOP';
  }
}
