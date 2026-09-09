/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import {
  FingerJoints,
  FingerJointsDebug,
  GestureType,
  HandCalibrationProfile,
  HandDebugTelemetry,
  HandFingersState,
  JointLimits,
} from '../types';

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PalmCoordinateFrame {
  origin: THREE.Vector3;
  x: THREE.Vector3; // Index MCP (5) - Pinky MCP (17)
  y: THREE.Vector3; // Middle MCP (9) - Wrist (0)
  z: THREE.Vector3; // Normal to palm (cross(X, Y))
  palmWidth: number;
  palmLength: number;
}

export const ROBOT_FINGER_LIMITS: JointLimits = {
  elbow: [0, (150 * Math.PI) / 180],
  neckYaw: [(-65 * Math.PI) / 180, (65 * Math.PI) / 180],
  neckPitch: [(-28 * Math.PI) / 180, (28 * Math.PI) / 180],
  neckRoll: [(-20 * Math.PI) / 180, (20 * Math.PI) / 180],
  shoulderZ: [-2.6, 2.6],
  shoulderX: [-1.4, 0.45],
  shoulderY: [-0.95, 0.95],
  wristRoll: [-1.25, 1.25],
  wristPitch: [-0.95, 0.95],
  wristYaw: [-1.05, 1.05],
  fingerMcp: [0, (95 * Math.PI) / 180], // 0 to ~1.65 rad
  fingerPip: [0, (105 * Math.PI) / 180], // 0 to ~1.83 rad
  fingerDip: [0, (90 * Math.PI) / 180], // 0 to ~1.57 rad
};

/**
 * Default calibration profile (neutral open palm = 0 rad, unit gain)
 */
export function createDefaultCalibration(): HandCalibrationProfile {
  const zeroJoints = (): FingerJoints => ({ mcp: 0.05, pip: 0.05, dip: 0.05 });
  const unitScales = (): FingerJoints => ({ mcp: 1.25, pip: 1.2, dip: 1.15 });

  return {
    isCalibrated: false,
    palmWidthRef: 0.085,
    neutralAngles: {
      thumb: { mcp: 0.08, pip: 0.08, dip: 0.05 },
      index: zeroJoints(),
      middle: zeroJoints(),
      ring: zeroJoints(),
      pinky: zeroJoints(),
    },
    neutralThumbPos: { x: 0.04, y: 0.02, z: 0.01 },
    neutralWristOri: { roll: 0, pitch: 0, yaw: 0 },
    jointScales: {
      thumb: { mcp: 1.3, pip: 1.25, dip: 1.1 },
      index: unitScales(),
      middle: unitScales(),
      ring: unitScales(),
      pinky: unitScales(),
    },
  };
}

/**
 * Vector magnitude with epsilon guard
 */
function vecLength(v: { x: number; y: number; z?: number }): number {
  return Math.hypot(v.x, v.y, v.z ?? 0);
}

/**
 * 3D vector dot product
 */
function vecDot(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number }
): number {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

/**
 * Angle between two vectors using dot product:
 * angle = acos(clamp(dot(V1, V2) / (length(V1) * length(V2)), -1, 1))
 */
export function angleBetweenVectors(
  v1: { x: number; y: number; z?: number },
  v2: { x: number; y: number; z?: number }
): number {
  const l1 = vecLength(v1);
  const l2 = vecLength(v2);
  if (l1 < 1e-6 || l2 < 1e-6) return 0;
  const cosine = Math.max(-1.0, Math.min(1.0, vecDot(v1, v2) / (l1 * l2)));
  return Math.acos(cosine);
}

/**
 * Soft clamping near joint boundaries with smooth cubic Hermite deceleration
 */
export function softClamp(val: number, min: number, max: number, margin: number = 0.08): number {
  if (val < min) return min;
  if (val > max) return max;

  if (val < min + margin) {
    const u = (val - min) / margin;
    const smooth = u * u * (3 - 2 * u);
    return min + margin * smooth;
  }
  if (val > max - margin) {
    const u = (max - val) / margin;
    const smooth = u * u * (3 - 2 * u);
    return max - margin * smooth;
  }
  return val;
}

/**
 * Constructs an orthonormal Palm Coordinate Frame using 21 MediaPipe hand landmarks:
 * Wrist = 0
 * Index MCP = 5
 * Middle MCP = 9
 * Pinky MCP = 17
 *
 * X = normalize(IndexMCP - PinkyMCP)
 * Y = normalize(MiddleMCP - Wrist)
 * Z = normalize(cross(X, Y))
 * Then re-orthogonalize:
 * X = normalize(cross(Y, Z))
 * Y = normalize(cross(Z, X))
 */
export function buildPalmCoordinateFrame(
  landmarks: LandmarkPoint[],
  sign: number = 1
): PalmCoordinateFrame {
  const w = landmarks[0];
  const idxMcp = landmarks[5];
  const midMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  const origin = new THREE.Vector3(w.x, w.y, w.z ?? 0);

  // Raw X across palm from pinky knuckle to index knuckle
  const rawX = new THREE.Vector3(
    idxMcp.x - pinkyMcp.x,
    idxMcp.y - pinkyMcp.y,
    (idxMcp.z ?? 0) - (pinkyMcp.z ?? 0)
  );
  const palmWidth = Math.max(1e-4, rawX.length());

  // Raw Y along palm from wrist to middle knuckle
  const rawY = new THREE.Vector3(
    midMcp.x - w.x,
    midMcp.y - w.y,
    (midMcp.z ?? 0) - (w.z ?? 0)
  );
  const palmLength = Math.max(1e-4, rawY.length());

  const normX = rawX.clone().normalize();
  const normY = rawY.clone().normalize();

  // Consistent Palmar Normal Z:
  // In camera screen coords (+X right, +Y down, +Z into screen):
  // When an open hand faces the camera, palmar normal points toward the camera (-Z).
  // Cross(X, Y) produces opposite Z signs for left vs right hand due to knuckle arrangement.
  // Multiplying by -sign ensures normZ consistently points out of the palmar surface for both hands.
  const normZ = new THREE.Vector3()
    .crossVectors(normX, normY)
    .multiplyScalar(-sign)
    .normalize();

  // Re-orthogonalize to guarantee an exact orthonormal right-handed frame
  normX.crossVectors(normY, normZ).multiplyScalar(sign).normalize();
  normY.crossVectors(normZ, normX).multiplyScalar(sign).normalize();

  return {
    origin,
    x: normX,
    y: normY,
    z: normZ,
    palmWidth,
    palmLength,
  };
}

/**
 * Derives stable wrist orientation (roll, pitch, yaw) from the palm coordinate frame.
 * Roll = pronation/supination around forearm long axis (Y)
 * Pitch = flexion/extension around transverse palm axis (X)
 * Yaw = radial/ulnar deviation around normal axis (Z)
 */
export function deriveWristOrientation(
  frame: PalmCoordinateFrame,
  sign: number // -1 for left, +1 for right
): { roll: number; pitch: number; yaw: number } {
  // 1. Pitch: flexion / extension (bending palm forward / backward)
  // When hand tilts forward towards camera, frame.y.z becomes negative
  const pitchRaw = -Math.atan2(frame.y.z, Math.hypot(frame.y.x, frame.y.y));
  const pitch = softClamp(
    pitchRaw * 1.1,
    ROBOT_FINGER_LIMITS.wristPitch[0],
    ROBOT_FINGER_LIMITS.wristPitch[1]
  );

  // 2. Roll: forearm pronation / supination twist
  // Palmar normal frame.z tilts across the coronal/transverse plane
  const rollRaw = Math.atan2(frame.z.x, -frame.z.z) * sign;
  const roll = softClamp(
    rollRaw * 1.15,
    ROBOT_FINGER_LIMITS.wristRoll[0],
    ROBOT_FINGER_LIMITS.wristRoll[1]
  );

  // 3. Yaw: radial / ulnar deviation
  // Transverse tilt of longitudinal palm axis frame.y
  const yawRaw = Math.atan2(frame.y.x, -frame.y.y) * sign;
  const yaw = softClamp(
    yawRaw * 0.95,
    ROBOT_FINGER_LIMITS.wristYaw[0],
    ROBOT_FINGER_LIMITS.wristYaw[1]
  );

  return { roll, pitch, yaw };
}

/**
 * Calculates independent finger joint bend angles using 3D bone vectors:
 * V1 = PIP - MCP
 * V2 = DIP - PIP
 * V3 = TIP - DIP
 *
 * angle = acos(clamp(dot(V1, V2) / (length(V1) * length(V2)), -1, 1))
 *
 * PIP and DIP are calculated completely independently.
 * No global curl coupling is applied.
 */
export function computeIndependentFingerKinematics(
  landmarks: LandmarkPoint[],
  mcpIdx: number,
  pipIdx: number,
  dipIdx: number,
  tipIdx: number,
  palmFrame: PalmCoordinateFrame
): FingerJoints {
  const mcp = landmarks[mcpIdx];
  const pip = landmarks[pipIdx];
  const dip = landmarks[dipIdx];
  const tip = landmarks[tipIdx];

  // 3D Bone segment vectors
  const v0 = {
    x: mcp.x - landmarks[0].x,
    y: mcp.y - landmarks[0].y,
    z: (mcp.z ?? 0) - (landmarks[0].z ?? 0),
  };
  const v1 = {
    x: pip.x - mcp.x,
    y: pip.y - mcp.y,
    z: (pip.z ?? 0) - (mcp.z ?? 0),
  };
  const v2 = {
    x: dip.x - pip.x,
    y: dip.y - pip.y,
    z: (dip.z ?? 0) - (pip.z ?? 0),
  };
  const v3 = {
    x: tip.x - dip.x,
    y: tip.y - dip.y,
    z: (tip.z ?? 0) - (dip.z ?? 0),
  };

  // Measured joint angles using dot product
  // Baseline knuckle offset is ~0.15 rad in neutral flat palm
  const rawMcp = Math.max(0, angleBetweenVectors(v0, v1) - 0.15);
  const rawPip = angleBetweenVectors(v1, v2);
  const rawDip = angleBetweenVectors(v2, v3);

  // Normalized distance from fingertip to MCP base scaled by palm width
  const tipToMcpDist = Math.hypot(
    tip.x - mcp.x,
    tip.y - mcp.y,
    (tip.z ?? 0) - (mcp.z ?? 0)
  );
  const normalizedTipDist = tipToMcpDist / Math.max(1e-4, palmFrame.palmWidth);

  // Subtle foreshortening compensation ONLY if landmarks are compressed along line of sight
  // (strictly preserves independent PIP vs DIP measurement)
  let foreshortenGain = 1.0;
  if (normalizedTipDist < 0.45 && rawPip < 0.4 && rawDip < 0.4) {
    foreshortenGain = 1.0 + (0.45 - normalizedTipDist) * 0.8;
  }

  const mcpAngle = softClamp(
    rawMcp * 1.15 * foreshortenGain,
    ROBOT_FINGER_LIMITS.fingerMcp[0],
    ROBOT_FINGER_LIMITS.fingerMcp[1]
  );
  const pipAngle = softClamp(
    rawPip * 1.18 * foreshortenGain,
    ROBOT_FINGER_LIMITS.fingerPip[0],
    ROBOT_FINGER_LIMITS.fingerPip[1]
  );
  const dipAngle = softClamp(
    rawDip * 1.12 * foreshortenGain,
    ROBOT_FINGER_LIMITS.fingerDip[0],
    ROBOT_FINGER_LIMITS.fingerDip[1]
  );

  return {
    mcp: mcpAngle,
    pip: pipAngle,
    dip: dipAngle,
  };
}

/**
 * Handles the thumb independently using landmarks:
 * 0 Wrist, 1 Thumb CMC, 2 Thumb MCP, 3 Thumb IP, 4 Thumb TIP.
 * Calculates thumb flexion and opposition independently.
 */
export function computeIndependentThumbKinematics(
  landmarks: LandmarkPoint[],
  palmFrame: PalmCoordinateFrame,
  sign: number // -1 for left, +1 for right
): {
  angles: FingerJoints;
  opposition: number;
  thumbTipInPalmFrame: { x: number; y: number; z: number };
} {
  const w = landmarks[0];
  const cmc = landmarks[1];
  const mcp = landmarks[2];
  const ip = landmarks[3];
  const tip = landmarks[4];

  // Vectors
  const vWristCmc = {
    x: cmc.x - w.x,
    y: cmc.y - w.y,
    z: (cmc.z ?? 0) - (w.z ?? 0),
  };
  const vCmcMcp = {
    x: mcp.x - cmc.x,
    y: mcp.y - cmc.y,
    z: (mcp.z ?? 0) - (cmc.z ?? 0),
  };
  const vMcpIp = {
    x: ip.x - mcp.x,
    y: ip.y - mcp.y,
    z: (ip.z ?? 0) - (mcp.z ?? 0),
  };
  const vIpTip = {
    x: tip.x - ip.x,
    y: tip.y - ip.y,
    z: (tip.z ?? 0) - (ip.z ?? 0),
  };

  // Thumb MCP flexion (angle between CMC->MCP and MCP->IP)
  const rawMcp = Math.max(0, angleBetweenVectors(vCmcMcp, vMcpIp) - 0.12);
  // Thumb IP flexion (angle between MCP->IP and IP->TIP)
  const rawIp = angleBetweenVectors(vMcpIp, vIpTip);
  // Thumb distal flexion
  const rawDip = Math.max(0, angleBetweenVectors(vWristCmc, vIpTip) * 0.55);

  // Project thumb tip into palm coordinate frame {origin: wrist, x: across, y: along, z: normal}
  const toTip = new THREE.Vector3(
    tip.x - palmFrame.origin.x,
    tip.y - palmFrame.origin.y,
    (tip.z ?? 0) - palmFrame.origin.z
  );

  const thumbX = toTip.dot(palmFrame.x) / Math.max(1e-4, palmFrame.palmWidth);
  const thumbY = toTip.dot(palmFrame.y) / Math.max(1e-4, palmFrame.palmLength);
  const thumbZ = toTip.dot(palmFrame.z) / Math.max(1e-4, palmFrame.palmWidth);

  // Opposition: displacement across palm toward index/middle MCP
  // When thumb sweeps across the palm, thumbX changes sign and moves toward pinky side
  const oppositionNorm = Math.max(
    0,
    Math.min(1, (0.85 - thumbX * sign) / 0.7)
  );

  // Thumb MCP flexion and sweep
  const mcpCurl = softClamp(
    rawMcp * 1.25 + oppositionNorm * 0.35,
    ROBOT_FINGER_LIMITS.fingerMcp[0],
    ROBOT_FINGER_LIMITS.fingerMcp[1]
  );
  // Thumb IP flexion
  const ipCurl = softClamp(
    rawIp * 1.25,
    ROBOT_FINGER_LIMITS.fingerPip[0],
    ROBOT_FINGER_LIMITS.fingerPip[1]
  );
  const dipCurl = softClamp(
    rawDip * 1.1,
    ROBOT_FINGER_LIMITS.fingerDip[0],
    ROBOT_FINGER_LIMITS.fingerDip[1]
  );

  return {
    angles: { mcp: mcpCurl, pip: ipCurl, dip: dipCurl },
    opposition: oppositionNorm,
    thumbTipInPalmFrame: { x: thumbX, y: thumbY, z: thumbZ },
  };
}

/**
 * Pinch detector with hysteresis to prevent state flickering
 */
export class PinchDetector {
  private isPinching: boolean = false;
  // Hysteresis thresholds: Enter pinch at <0.28, exit pinch at >0.40
  public readonly enterThreshold: number = 0.28;
  public readonly exitThreshold: number = 0.40;

  public update(
    thumbTip: LandmarkPoint,
    indexTip: LandmarkPoint,
    palmWidth: number
  ): { isPinch: boolean; normalizedDistance: number } {
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = (thumbTip.z ?? 0) - (indexTip.z ?? 0);
    const distance3D = Math.hypot(dx, dy, dz);
    const normalizedDistance = distance3D / Math.max(1e-4, palmWidth);

    if (this.isPinching) {
      if (normalizedDistance > this.exitThreshold) {
        this.isPinching = false;
      }
    } else {
      if (normalizedDistance < this.enterThreshold) {
        this.isPinching = true;
      }
    }

    return {
      isPinch: this.isPinching,
      normalizedDistance,
    };
  }

  public reset(): void {
    this.isPinching = false;
  }
}

/**
 * Finger Occlusion Tracker:
 * Holds previous valid position briefly, dampens velocity during loss,
 * and recovers smoothly when landmarks return without resetting to zero.
 */
export class FingerOcclusionTracker {
  private prevAngles: HandFingersState;
  private velocities: HandFingersState;
  private lostFrameCounts: Record<keyof HandFingersState, number>;
  private maxHoldFrames: number = 18; // ~300ms hold during occlusion

  constructor() {
    const zero = (): FingerJoints => ({ mcp: 0, pip: 0, dip: 0 });
    this.prevAngles = {
      thumb: zero(),
      index: zero(),
      middle: zero(),
      ring: zero(),
      pinky: zero(),
    };
    this.velocities = {
      thumb: zero(),
      index: zero(),
      middle: zero(),
      ring: zero(),
      pinky: zero(),
    };
    this.lostFrameCounts = {
      thumb: 0,
      index: 0,
      middle: 0,
      ring: 0,
      pinky: 0,
    };
  }

  public updateFinger(
    finger: keyof HandFingersState,
    measured: FingerJoints,
    isDetected: boolean,
    dt: number = 0.033
  ): FingerJoints {
    if (isDetected) {
      this.lostFrameCounts[finger] = 0;
      const prev = this.prevAngles[finger];

      // Instantaneous angular velocities
      const safeDt = Math.max(0.005, Math.min(0.1, dt));
      this.velocities[finger] = {
        mcp: (measured.mcp - prev.mcp) / safeDt,
        pip: (measured.pip - prev.pip) / safeDt,
        dip: (measured.dip - prev.dip) / safeDt,
      };

      this.prevAngles[finger] = { ...measured };
      return measured;
    }

    // Finger is temporarily occluded: hold position with damped velocity
    this.lostFrameCounts[finger]++;
    const count = this.lostFrameCounts[finger];

    if (count <= this.maxHoldFrames) {
      // Extrapolate with heavy velocity damping (0.85 decay per frame)
      const vel = this.velocities[finger];
      vel.mcp *= 0.85;
      vel.pip *= 0.85;
      vel.dip *= 0.85;

      const heldMcp = softClamp(
        this.prevAngles[finger].mcp + vel.mcp * dt * 0.5,
        ROBOT_FINGER_LIMITS.fingerMcp[0],
        ROBOT_FINGER_LIMITS.fingerMcp[1]
      );
      const heldPip = softClamp(
        this.prevAngles[finger].pip + vel.pip * dt * 0.5,
        ROBOT_FINGER_LIMITS.fingerPip[0],
        ROBOT_FINGER_LIMITS.fingerPip[1]
      );
      const heldDip = softClamp(
        this.prevAngles[finger].dip + vel.dip * dt * 0.5,
        ROBOT_FINGER_LIMITS.fingerDip[0],
        ROBOT_FINGER_LIMITS.fingerDip[1]
      );

      this.prevAngles[finger] = { mcp: heldMcp, pip: heldPip, dip: heldDip };
      return this.prevAngles[finger];
    }

    // Extended loss (> 300ms): slowly relax toward neutral resting pose (0 rad)
    const decay = 0.94;
    this.prevAngles[finger] = {
      mcp: this.prevAngles[finger].mcp * decay,
      pip: this.prevAngles[finger].pip * decay,
      dip: this.prevAngles[finger].dip * decay,
    };
    return this.prevAngles[finger];
  }

  public reset(): void {
    const zero = (): FingerJoints => ({ mcp: 0, pip: 0, dip: 0 });
    this.prevAngles = {
      thumb: zero(),
      index: zero(),
      middle: zero(),
      ring: zero(),
      pinky: zero(),
    };
    this.velocities = {
      thumb: zero(),
      index: zero(),
      middle: zero(),
      ring: zero(),
      pinky: zero(),
    };
    this.lostFrameCounts = {
      thumb: 0,
      index: 0,
      middle: 0,
      ring: 0,
      pinky: 0,
    };
  }
}

/**
 * Calibrates human angles into robot angles according to:
 * robotAngle = robotNeutral + scale * (humanAngle - humanNeutral)
 * Clamped smoothly to robot physical joint limits.
 */
export function applyHandCalibration(
  measured: FingerJoints,
  neutral: FingerJoints,
  scale: FingerJoints,
  limits: { mcp: [number, number]; pip: [number, number]; dip: [number, number] }
): { calibrated: FingerJoints; robot: FingerJoints } {
  // Human calibrated delta
  const calMcp = Math.max(0, measured.mcp - neutral.mcp);
  const calPip = Math.max(0, measured.pip - neutral.pip);
  const calDip = Math.max(0, measured.dip - neutral.dip);

  // Scaled robot joint angle
  const rMcp = softClamp(calMcp * scale.mcp, limits.mcp[0], limits.mcp[1]);
  const rPip = softClamp(calPip * scale.pip, limits.pip[0], limits.pip[1]);
  const rDip = softClamp(calDip * scale.dip, limits.dip[0], limits.dip[1]);

  return {
    calibrated: { mcp: calMcp, pip: calPip, dip: calDip },
    robot: { mcp: rMcp, pip: rPip, dip: rDip },
  };
}

/**
 * Layer 1: Gesture Classifier
 * Identifies high-level action (Open Palm, Fist, Point, Victory, Pinch, Thumbs Up, Thumbs Down).
 * NEVER overwrites the mathematical finger kinematics angles.
 */
export function classifyHandGesture(
  fingers: HandFingersState,
  pinchInfo: { isPinch: boolean; normalizedDistance: number },
  landmarks: LandmarkPoint[],
  palmFrame: PalmCoordinateFrame,
  wristOri?: { roll: number; pitch: number; yaw: number }
): GestureType {
  const isExtended = (f: keyof HandFingersState) =>
    fingers[f].mcp < 0.45 && fingers[f].pip < 0.48;
  const isCurled = (f: keyof HandFingersState) =>
    fingers[f].mcp > 0.58 || fingers[f].pip > 0.68;
  const isGripFinger = (f: keyof HandFingersState) =>
    fingers[f].mcp >= 0.28 && fingers[f].mcp <= 0.85 && fingers[f].pip >= 0.32 && fingers[f].pip <= 1.15;

  const idxExt = isExtended('index');
  const midExt = isExtended('middle');
  const ringExt = isExtended('ring');
  const pinkyExt = isExtended('pinky');
  const thumbExt = isExtended('thumb');

  const idxCurl = isCurled('index');
  const midCurl = isCurled('middle');
  const ringCurl = isCurled('ring');
  const pinkyCurl = isCurled('pinky');

  // Vector from thumb base to tip relative to palm coordinate frame
  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const dyThumb = thumbTip.y - thumbMcp.y; // screen Y: smaller is up, larger is down

  // 1. PINCH (Thumb-to-index proximity)
  if (pinchInfo.isPinch) {
    return 'PINCH';
  }

  // 2. THUMBS UP / THUMBS DOWN (4 fingers curled, thumb extended vertically)
  if (idxCurl && midCurl && ringCurl && pinkyCurl) {
    if (dyThumb < -palmFrame.palmWidth * 0.25) {
      return 'THUMBS_UP';
    }
    if (dyThumb > palmFrame.palmWidth * 0.25) {
      return 'THUMBS_DOWN';
    }
    return 'FIST';
  }

  // 3. POINT (Index extended, others curled)
  if (idxExt && midCurl && ringCurl && pinkyCurl) {
    return 'POINT';
  }

  // 4. VICTORY / PEACE SIGN (Index & Middle extended, others curled)
  if (idxExt && midExt && ringCurl && pinkyCurl) {
    return 'VICTORY';
  }

  // 5. ROTATING WRIST (Active pronation/supination while hand is open/active)
  if (wristOri && Math.abs(wristOri.roll) > 0.65 && !idxCurl) {
    return 'WRIST_ROTATE';
  }

  // 6. GRAB (All 5 fingers partially curled in a grip/claw posture)
  if (
    isGripFinger('index') &&
    isGripFinger('middle') &&
    isGripFinger('ring') &&
    isGripFinger('pinky') &&
    fingers.thumb.mcp > 0.22 &&
    !idxCurl && !midCurl
  ) {
    return 'GRAB';
  }

  // 7. OPEN PALM (All fingers extended)
  if (idxExt && midExt && ringExt && pinkyExt && fingers.thumb.mcp < 0.65) {
    return 'OPEN_PALM';
  }

  // 8. FIST (All 5 curled)
  if (idxCurl && midCurl && ringCurl && pinkyCurl) {
    return 'FIST';
  }

  return 'MIRRORING';
}

/**
 * Main Orchestrator:
 * Executes 2-layer processing:
 * 1. Mathematical Kinematics (Layer 2)
 * 2. Gesture Classification (Layer 1)
 * 3. Calibration Mapping
 * 4. Rich Debug Telemetry Generation
 */
export function analyzeHandKinematics(
  landmarks: LandmarkPoint[],
  sign: number, // -1 for left, +1 for right
  pinchDetector: PinchDetector,
  occlusionTracker: FingerOcclusionTracker,
  calibration: HandCalibrationProfile,
  dt: number = 0.033
): {
  fingers: HandFingersState;
  robotFingers: HandFingersState;
  wristOri: { roll: number; pitch: number; yaw: number };
  gesture: GestureType;
  palmSize: number;
  pinchDistance: number;
  isPinch: boolean;
  debugTelemetry: HandDebugTelemetry;
} {
  // 1. Build Orthonormal Palm Coordinate Frame with handedness
  const palmFrame = buildPalmCoordinateFrame(landmarks, sign);
  const wristOri = deriveWristOrientation(palmFrame, sign);

  // 2. Independent 3D Finger Kinematics (Layer 2)
  const rawThumb = computeIndependentThumbKinematics(landmarks, palmFrame, sign);
  const rawIndex = computeIndependentFingerKinematics(landmarks, 5, 6, 7, 8, palmFrame);
  const rawMiddle = computeIndependentFingerKinematics(landmarks, 9, 10, 11, 12, palmFrame);
  const rawRing = computeIndependentFingerKinematics(landmarks, 13, 14, 15, 16, palmFrame);
  const rawPinky = computeIndependentFingerKinematics(landmarks, 17, 18, 19, 20, palmFrame);

  // 3. Occlusion-Resistant Independent Finger Filtering
  const fingers: HandFingersState = {
    thumb: occlusionTracker.updateFinger('thumb', rawThumb.angles, true, dt),
    index: occlusionTracker.updateFinger('index', rawIndex, true, dt),
    middle: occlusionTracker.updateFinger('middle', rawMiddle, true, dt),
    ring: occlusionTracker.updateFinger('ring', rawRing, true, dt),
    pinky: occlusionTracker.updateFinger('pinky', rawPinky, true, dt),
  };

  // 4. Normalized Pinch Detection with Hysteresis
  const pinch = pinchDetector.update(landmarks[4], landmarks[8], palmFrame.palmWidth);

  // 5. Calibration Mapping (Neutral subtraction & scaling)
  const limits = {
    mcp: ROBOT_FINGER_LIMITS.fingerMcp,
    pip: ROBOT_FINGER_LIMITS.fingerPip,
    dip: ROBOT_FINGER_LIMITS.fingerDip,
  };

  const calThumb = applyHandCalibration(
    fingers.thumb,
    calibration.neutralAngles.thumb,
    calibration.jointScales.thumb,
    limits
  );
  const calIndex = applyHandCalibration(
    fingers.index,
    calibration.neutralAngles.index,
    calibration.jointScales.index,
    limits
  );
  const calMiddle = applyHandCalibration(
    fingers.middle,
    calibration.neutralAngles.middle,
    calibration.jointScales.middle,
    limits
  );
  const calRing = applyHandCalibration(
    fingers.ring,
    calibration.neutralAngles.ring,
    calibration.jointScales.ring,
    limits
  );
  const calPinky = applyHandCalibration(
    fingers.pinky,
    calibration.neutralAngles.pinky,
    calibration.jointScales.pinky,
    limits
  );

  const robotFingers: HandFingersState = {
    thumb: calThumb.robot,
    index: calIndex.robot,
    middle: calMiddle.robot,
    ring: calRing.robot,
    pinky: calPinky.robot,
  };

  // 6. Layer 1: Gesture Recognition (Does NOT overwrite kinematic angles)
  const gesture = classifyHandGesture(fingers, pinch, landmarks, palmFrame, wristOri);

  // 7. Complete Per-Joint Debug Telemetry
  const debugTelemetry: HandDebugTelemetry = {
    gesture,
    confidence: landmarks[0].visibility ?? 0.9,
    handLabel: sign === -1 ? 'Left' : 'Right',
    palmSize: palmFrame.palmWidth,
    pinchDistance: pinch.normalizedDistance,
    isPinching: pinch.isPinch,
    fingers: {
      thumb: {
        raw: fingers.thumb,
        calibrated: calThumb.calibrated,
        robot: calThumb.robot,
      },
      index: {
        raw: fingers.index,
        calibrated: calIndex.calibrated,
        robot: calIndex.robot,
      },
      middle: {
        raw: fingers.middle,
        calibrated: calMiddle.calibrated,
        robot: calMiddle.robot,
      },
      ring: {
        raw: fingers.ring,
        calibrated: calRing.calibrated,
        robot: calRing.robot,
      },
      pinky: {
        raw: fingers.pinky,
        calibrated: calPinky.calibrated,
        robot: calPinky.robot,
      },
    },
  };

  return {
    fingers,
    robotFingers,
    wristOri,
    gesture,
    palmSize: palmFrame.palmWidth,
    pinchDistance: pinch.normalizedDistance,
    isPinch: pinch.isPinch,
    debugTelemetry,
  };
}
