/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RobotMaterialSet, createRobotMaterials } from './materials';
import { FingerJoints, HandFingersState, RobotJointAngles } from '../types';

export interface ArticulatedFinger {
  mcp: THREE.Group;
  pip: THREE.Group;
  dip: THREE.Group;
  tipMesh: THREE.Mesh;
}

export interface ArticulatedHand {
  group: THREE.Group;
  palmMesh: THREE.Mesh;
  fingers: {
    thumb: ArticulatedFinger;
    index: ArticulatedFinger;
    middle: ArticulatedFinger;
    ring: ArticulatedFinger;
    pinky: ArticulatedFinger;
  };
}

export interface Landmark3D {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface ArmIKSolution {
  shoulderZ: number;
  shoulderX: number;
  shoulderY: number;
  elbow: number;
  solvedWristPos: THREE.Vector3;
  solvedElbowPos: THREE.Vector3;
  reachRatio: number;
  isNearSingularity: boolean;
  swivelConfidence: number;
  isDeflected: boolean;
  deflectionDistance: number;
}

export interface BodyBoundaryResult {
  position: THREE.Vector3;
  deflected: boolean;
  penetration: number;
}

/**
 * Body Boundary Collision Envelope & Deflection System.
 * Strictly prevents robot arms, wrists, forearms, and hands from penetrating
 * into the robot's own chest, torso, abdomen, pelvis, or head.
 */
export function enforceBodyBoundary(
  posInShoulderFrame: THREE.Vector3,
  side: 'left' | 'right',
  enabled: boolean = true
): BodyBoundaryResult {
  if (!enabled) {
    return {
      position: posInShoulderFrame.clone(),
      deflected: false,
      penetration: 0,
    };
  }

  const sign = side === 'left' ? -1 : 1;
  // Convert from shoulder-relative frame (+X: right, +Y: up, +Z: forward)
  // to torso-relative reference frame
  let tx = posInShoulderFrame.x + sign * 0.255;
  let ty = posInShoulderFrame.y + 0.54;
  let tz = posInShoulderFrame.z + 0.01;

  let deflected = false;
  let maxPenetration = 0;

  // 1. Head & Neck Collision Volume:
  // Center: (0, 0.82, 0.04), safe radius including hand thickness = 0.24m
  if (ty > 0.62) {
    const headCenter = new THREE.Vector3(0, 0.82, 0.04);
    const toHead = new THREE.Vector3(tx, ty, tz).sub(headCenter);
    const distHead = toHead.length();
    const rHeadSafe = 0.24;
    if (distHead < rHeadSafe) {
      const pen = rHeadSafe - distHead;
      maxPenetration = Math.max(maxPenetration, pen);
      deflected = true;
      if (distHead > 1e-4) {
        toHead.multiplyScalar(rHeadSafe / distHead);
      } else {
        toHead.set(0, 0, rHeadSafe);
      }
      tx = headCenter.x + toHead.x;
      ty = headCenter.y + toHead.y;
      tz = headCenter.z + toHead.z;
    }
  }

  // 2. Thorax, Ribs & Sculpted Chest Armor Collision Envelope (ty between -0.42 and 0.65)
  if (ty >= -0.42 && ty <= 0.65) {
    // Elliptical cross-section: Rx ~0.265m (chest) down to ~0.23m (waist)
    const tH = Math.max(0, Math.min(1, (ty + 0.42) / 1.07));
    const rx = 0.24 + 0.035 * Math.sin(tH * Math.PI);
    const rz = 0.195;
    const zCenter = 0.02;

    const qx = tx / rx;
    const qz = (tz - zCenter) / rz;
    const distEllipse = Math.hypot(qx, qz);

    if (distEllipse < 1.0) {
      const pen = (1.0 - distEllipse) * Math.max(rx, rz);
      maxPenetration = Math.max(maxPenetration, pen);
      deflected = true;

      const factor = 1.0 / Math.max(distEllipse, 1e-4);
      let outX = qx * factor * rx;
      let outZ = zCenter + qz * factor * rz;

      // When in front of torso, glide smoothly across front chest armor (z >= 0.21m)
      if (tz >= -0.04) {
        if (outZ < 0.21) {
          outZ = 0.21;
        }
      } else {
        if (outZ > -0.17) {
          outZ = -0.17;
        }
      }
      tx = outX;
      tz = outZ;
    }
  }

  // 3. Pelvis & Mount Base Collision Envelope (for ty < -0.42)
  if (ty < -0.42) {
    const rPelvis = 0.24;
    const distP = Math.hypot(tx, tz);
    if (distP < rPelvis) {
      maxPenetration = Math.max(maxPenetration, rPelvis - distP);
      deflected = true;
      const s = rPelvis / Math.max(distP, 1e-4);
      tx *= s;
      tz *= s;
    }
  }

  // Convert back to shoulder-relative frame
  const outPos = new THREE.Vector3(
    tx - sign * 0.255,
    ty - 0.54,
    tz - 0.01
  );

  return {
    position: outPos,
    deflected,
    penetration: maxPenetration,
  };
}

/**
 * Refined Analytical 2-Bone Inverse Kinematics (IK) Solver for Robot Arms.
 * Features:
 *  1. C^2 smooth nonlinear singularity damping / soft-saturation (prevents velocity spikes as d -> Ltotal)
 *  2. Swivel vector regularization with anatomical pole vector blending (eliminates 360-deg elbow wandering at full extension)
 *  3. Co-planar law-of-cosines analytical solve with well-conditioned micro-angle preservation
 *  4. High-fidelity ZXY Glenohumeral Euler frame derivation with axial humeral twist damping
 */
export class RobotArmIKSolver {
  public readonly side: 'left' | 'right';
  public readonly upperArmLength: number;
  public readonly forearmLength: number;
  public readonly totalReach: number;
  public bodyBoundaryEnabled: boolean = true;
  public lastDeflectionAmount: number = 0;
  public isDeflected: boolean = false;

  // Temporal state for smooth swivel pole vector and anti-wandering stabilization
  private prevSwivelDir: THREE.Vector3;
  private naturalPoleRef: THREE.Vector3;
  private prevShoulderAngles: { z: number; x: number; y: number };
  private prevElbowAngle: number;
  private isInitialized: boolean = false;

  constructor(side: 'left' | 'right', upperArmLen = 0.32, forearmLen = 0.28) {
    this.side = side;
    this.upperArmLength = upperArmLen;
    this.forearmLength = forearmLen;
    this.totalReach = upperArmLen + forearmLen;

    const sign = side === 'left' ? -1 : 1;
    // Anatomical natural elbow flare (elbow flares outward and slightly backward/down)
    this.naturalPoleRef = new THREE.Vector3(sign * 0.86, -0.28, -0.42).normalize();
    this.prevSwivelDir = this.naturalPoleRef.clone();
    this.prevShoulderAngles = { z: sign * 0.12, x: 0, y: 0 };
    this.prevElbowAngle = 0.15;
  }

  public reset(): void {
    const sign = this.side === 'left' ? -1 : 1;
    this.prevSwivelDir.copy(this.naturalPoleRef);
    this.prevShoulderAngles = { z: sign * 0.12, x: 0, y: 0 };
    this.prevElbowAngle = 0.15;
    this.isInitialized = false;
    this.lastDeflectionAmount = 0;
    this.isDeflected = false;
  }

  /**
   * Solves 2-bone analytical arm IK for target wrist position and optional elbow hint.
   * Coordinates are in the shoulder's local frame: +X: right, +Y: up, +Z: forward towards camera.
   */
  public solve(targetWrist: THREE.Vector3, targetElbowHint?: THREE.Vector3): ArmIKSolution {
    const L1 = this.upperArmLength;
    const L2 = this.forearmLength;
    const Ltotal = this.totalReach;

    // 0. Body Collision Boundary Enforcement
    // Strictly bounds the target wrist position so it never penetrates the torso, chest, or head
    let boundedWrist = targetWrist.clone();
    let isDeflected = false;
    let deflectionDistance = 0;

    if (this.bodyBoundaryEnabled) {
      const bRes = enforceBodyBoundary(boundedWrist, this.side, true);
      boundedWrist.copy(bRes.position);
      isDeflected = bRes.deflected;
      deflectionDistance = bRes.penetration;
    }
    this.isDeflected = isDeflected;
    this.lastDeflectionAmount = deflectionDistance;

    let D = boundedWrist.length();
    if (D < 1e-4) {
      boundedWrist = new THREE.Vector3(0, -Ltotal * 0.95, 0);
      D = Ltotal * 0.95;
    }

    // Unit vector along arm axis from shoulder to wrist
    const u = boundedWrist.clone().multiplyScalar(1 / D);

    // -------------------------------------------------------------
    // 1. Nonlinear Singularity Damping / Soft Reach Saturation
    // -------------------------------------------------------------
    // Prevents mathematical singularity explosion when arm reaches full extension.
    // Smoothly saturates effective distance to 0.993 * Ltotal via C^2 continuous tanh.
    const reachRatio = D / Ltotal;
    const isNearSingularity = reachRatio > 0.88;

    const softThreshold = Ltotal * 0.91;
    const maxHardLimit = Ltotal * 0.993;
    let dEff = D;

    if (D > softThreshold) {
      const excess = D - softThreshold;
      const headroom = maxHardLimit - softThreshold;
      dEff = softThreshold + headroom * Math.tanh(excess / headroom);
    }
    dEff = Math.max(0.04, Math.min(maxHardLimit, dEff));

    // -------------------------------------------------------------
    // 2. Anatomical Pole Vector & Swivel Regularization (Anti-Wandering)
    // -------------------------------------------------------------
    // When the arm is fully extended, the elbow landmark lies directly on the
    // line between shoulder and wrist. Projecting it yields near-zero magnitude,
    // causing standard solvers to spin 360 degrees randomly (the "wandering" effect).
    // We compute perpendicular projection and blend it with stabilized anatomical pole.
    let pPerp = new THREE.Vector3();
    let mPerp = 0;

    let boundedElbowHint = targetElbowHint ? targetElbowHint.clone() : undefined;
    if (boundedElbowHint && this.bodyBoundaryEnabled) {
      const eRes = enforceBodyBoundary(boundedElbowHint, this.side, true);
      boundedElbowHint.copy(eRes.position);
    }

    if (boundedElbowHint && boundedElbowHint.lengthSq() > 1e-4) {
      pPerp.copy(boundedElbowHint).addScaledVector(u, -boundedElbowHint.dot(u));
      mPerp = pPerp.length();
    }

    // Confidence decays to zero when arm is straight or elbow projection is tiny (< 3cm)
    const distFactor = Math.max(0, Math.min(1, (mPerp - 0.025) / 0.065));
    const extensionFactor = Math.max(0, Math.min(1, (0.95 - reachRatio) / 0.12));
    const swivelConfidence = distFactor * extensionFactor;

    const targetPole = new THREE.Vector3();
    if (swivelConfidence > 0.005) {
      const normalizedRaw = pPerp.clone().multiplyScalar(1 / Math.max(mPerp, 1e-4));
      targetPole.copy(normalizedRaw).multiplyScalar(swivelConfidence);

      const stableRef = this.prevSwivelDir.clone().lerp(this.naturalPoleRef, 0.35).normalize();
      targetPole.addScaledVector(stableRef, 1.0 - swivelConfidence);
    } else {
      // Under full extension: firmly lock to temporal previous & natural anatomical pole
      targetPole.copy(this.prevSwivelDir).lerp(this.naturalPoleRef, 0.45).normalize();
    }

    // Anti-penetration clamp for elbow swivel pole:
    // Prevent the elbow from pointing inwards towards the ribcage
    const sign = this.side === 'left' ? -1 : 1;
    if (this.bodyBoundaryEnabled) {
      if (sign === -1 && targetPole.x > 0.06) {
        targetPole.x = 0.06;
      } else if (sign === 1 && targetPole.x < -0.06) {
        targetPole.x = -0.06;
      }
    }

    // Strict orthogonality to arm axis u
    targetPole.addScaledVector(u, -targetPole.dot(u));
    if (targetPole.lengthSq() < 1e-5) {
      targetPole.copy(this.naturalPoleRef).addScaledVector(u, -this.naturalPoleRef.dot(u));
    }
    targetPole.normalize();

    // Temporal damping: heavier smoothing near singularity eliminates high-frequency wander
    const swivelAlpha = !this.isInitialized ? 1.0 : isNearSingularity ? 0.14 : 0.32;
    this.prevSwivelDir.lerp(targetPole, swivelAlpha).normalize();
    const stabilizedSwivel = this.prevSwivelDir.clone();

    // -------------------------------------------------------------
    // 3. Analytical Two-Bone Law of Cosines
    // -------------------------------------------------------------
    const cosAlpha = Math.max(-1, Math.min(1, (L1 * L1 + dEff * dEff - L2 * L2) / (2 * L1 * dEff)));
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

    const cosBeta = Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - dEff * dEff) / (2 * L1 * L2)));
    const rawElbowAngle = Math.PI - Math.acos(cosBeta);
    const elbowAngle = Math.max(0.03, Math.min((150 * Math.PI) / 180, rawElbowAngle));

    // Solved 3D position of elbow and wrist in shoulder frame
    let solvedElbow = new THREE.Vector3()
      .copy(u)
      .multiplyScalar(cosAlpha)
      .addScaledVector(stabilizedSwivel, sinAlpha)
      .multiplyScalar(L1);

    if (this.bodyBoundaryEnabled) {
      const eRes = enforceBodyBoundary(solvedElbow, this.side, true);
      if (eRes.deflected) {
        solvedElbow.copy(eRes.position);
      }
    }

    const solvedWrist = u.clone().multiplyScalar(dEff);

    // Direction unit vectors
    const vUpper = solvedElbow.clone().multiplyScalar(1 / L1);
    const vForearm = new THREE.Vector3().subVectors(solvedWrist, solvedElbow).multiplyScalar(1 / L2);

    // -------------------------------------------------------------
    // 4. Derivation of Robot Arm Joint Angles (ZXY Euler Order)
    // -------------------------------------------------------------
    // In robot upperArmPivot, rest orientation extends along -Y.
    // Elbow flexes around local +X, bending forearm towards local +Z.
    // Therefore:
    // local +Y = -vUpper
    // local +Z = flexion direction dFlex
    // local +X = local +Y x local +Z
    let dFlex = new THREE.Vector3().subVectors(vForearm, vUpper.clone().multiplyScalar(vForearm.dot(vUpper)));
    if (dFlex.lengthSq() < 1e-4) {
      dFlex.copy(stabilizedSwivel);
    }
    dFlex.normalize();

    const localY = vUpper.clone().negate().normalize();
    const localZ = dFlex.clone().normalize();
    const localX = new THREE.Vector3().crossVectors(localY, localZ).normalize();
    localZ.crossVectors(localX, localY).normalize();

    const basisMatrix = new THREE.Matrix4().makeBasis(localX, localY, localZ);
    const euler = new THREE.Euler().setFromRotationMatrix(basisMatrix, 'ZXY');

    // Singularity twist lock: near full extension, pull axial humeral twist (shoulderY)
    // toward resting center to eliminate rotational wandering
    if (isNearSingularity) {
      const twistDamp = Math.max(0, Math.min(1, (reachRatio - 0.88) / 0.10));
      euler.y = THREE.MathUtils.lerp(euler.y, this.prevShoulderAngles.y, twistDamp * 0.75);
    }

    // Temporal smoothing on joint angles
    const angleAlpha = !this.isInitialized ? 1.0 : 0.42;
    this.prevShoulderAngles.z = THREE.MathUtils.lerp(this.prevShoulderAngles.z, euler.z, angleAlpha);
    this.prevShoulderAngles.x = THREE.MathUtils.lerp(this.prevShoulderAngles.x, euler.x, angleAlpha);
    this.prevShoulderAngles.y = THREE.MathUtils.lerp(this.prevShoulderAngles.y, euler.y, angleAlpha);
    this.prevElbowAngle = THREE.MathUtils.lerp(this.prevElbowAngle, elbowAngle, angleAlpha);

    this.isInitialized = true;

    // Joint limit clamping
    const limitsZ: [number, number] = this.side === 'left' ? [-2.6, 0.5] : [-0.5, 2.6];
    const limitsX: [number, number] = [-1.4, 0.45];
    const limitsY: [number, number] = [-0.95, 0.95];

    return {
      shoulderZ: Math.max(limitsZ[0], Math.min(limitsZ[1], this.prevShoulderAngles.z)),
      shoulderX: Math.max(limitsX[0], Math.min(limitsX[1], this.prevShoulderAngles.x)),
      shoulderY: Math.max(limitsY[0], Math.min(limitsY[1], this.prevShoulderAngles.y)),
      elbow: this.prevElbowAngle,
      solvedWristPos: solvedWrist,
      solvedElbowPos: solvedElbow,
      reachRatio,
      isNearSingularity,
      swivelConfidence,
      isDeflected,
      deflectionDistance,
    };
  }

  /**
   * Solves arm IK directly from 3D world landmarks (e.g. MediaPipe PoseLandmarker).
   * Automatically normalizes scale and converts coordinate frames.
   */
  public solveFromLandmarks(
    shoulderLm: Landmark3D,
    elbowLm: Landmark3D,
    wristLm: Landmark3D,
    motionGain: number = 1.0,
    isMetricWorldLandmark: boolean = false
  ): ArmIKSolution {
    const dxW = wristLm.x - shoulderLm.x;
    const dyW = wristLm.y - shoulderLm.y;
    const dzW = (wristLm.z ?? 0) - (shoulderLm.z ?? 0);

    const dxE = elbowLm.x - shoulderLm.x;
    const dyE = elbowLm.y - shoulderLm.y;
    const dzE = (elbowLm.z ?? 0) - (shoulderLm.z ?? 0);

    const humanUpperLen = Math.hypot(dxE, dyE, dzE) || 0.16;
    const humanForearmLen = Math.hypot(dxW - dxE, dyW - dyE, dzW - dzE) || 0.14;
    const humanTotalReach = humanUpperLen + humanForearmLen;

    const baseScale = (this.totalReach / Math.max(0.08, humanTotalReach)) * motionGain;
    const depthScale = isMetricWorldLandmark ? baseScale : baseScale * 1.35;

    // Convert from MediaPipe frame (X: right, Y: down, Z: away from camera)
    // to Robot local frame (+X: right, +Y: up, +Z: forward towards camera)
    const targetWrist = new THREE.Vector3(
      dxW * baseScale,
      -dyW * baseScale,
      -dzW * depthScale
    );

    const targetElbow = new THREE.Vector3(
      dxE * baseScale,
      -dyE * baseScale,
      -dzE * depthScale
    );

    return this.solve(targetWrist, targetElbow);
  }
}

export interface RobotArm {
  side: 'left' | 'right';
  shoulderPivot: THREE.Group;
  upperArmPivot: THREE.Group;
  elbowPivot: THREE.Group;
  forearmPivot: THREE.Group;
  wristPivot: THREE.Group;
  hand: ArticulatedHand;
  shoulderMesh: THREE.Mesh;
  upperArmMesh: THREE.Mesh;
  elbowMesh: THREE.Mesh;
  forearmMesh: THREE.Mesh;
}

export interface HumanoidRobotRig {
  root: THREE.Group;
  pedestal: THREE.Group;
  waist: THREE.Group;
  torso: THREE.Group;
  neckPivot: THREE.Group;
  headPivot: THREE.Group;
  eyeLeft: THREE.Mesh;
  eyeRight: THREE.Mesh;
  mouthDisplay: THREE.Mesh;
  mouthScaleTarget: number;
  chestCore: THREE.Mesh;
  leftArm: RobotArm;
  rightArm: RobotArm;
  materials: RobotMaterialSet;
  ikSolver: {
    left: RobotArmIKSolver;
    right: RobotArmIKSolver;
    solve: (
      side: 'left' | 'right',
      targetWrist: THREE.Vector3,
      targetElbowHint?: THREE.Vector3
    ) => ArmIKSolution;
    solveFromLandmarks: (
      side: 'left' | 'right',
      shoulderLm: Landmark3D,
      elbowLm: Landmark3D,
      wristLm: Landmark3D,
      motionGain?: number,
      isMetricWorldLandmark?: boolean
    ) => ArmIKSolution;
  };
  updatePose: (
    angles: RobotJointAngles,
    lFingers: HandFingersState,
    rFingers: HandFingersState,
    blinkScaleY?: number
  ) => void;
  updatePoseWithIK: (
    angles: RobotJointAngles,
    lFingers: HandFingersState,
    rFingers: HandFingersState,
    ikTargets?: {
      leftWrist?: THREE.Vector3;
      leftElbow?: THREE.Vector3;
      rightWrist?: THREE.Vector3;
      rightElbow?: THREE.Vector3;
    },
    blinkScaleY?: number
  ) => void;
  getHandWorldPosition: (side: 'left' | 'right') => THREE.Vector3;
  boundaryShieldGroup: THREE.Group;
  setBoundaryShieldVisible: (visible: boolean) => void;
  setBodyBoundaryEnabled: (enabled: boolean) => void;
  updateFuturisticEffects: (
    dt: number,
    isDeflectingLeft: boolean,
    isDeflectingRight: boolean,
    futuristicMode: boolean
  ) => void;
  getBoundaryStatus: () => {
    leftDeflected: boolean;
    rightDeflected: boolean;
    leftPenetration: number;
    rightPenetration: number;
  };
}

/**
 * Builds an articulated mechanical finger with MCP, PIP, DIP joints
 */
function buildFinger(
  materials: RobotMaterialSet,
  length: number,
  thickness: number,
  isThumb: boolean = false
): ArticulatedFinger {
  const mcp = new THREE.Group();

  // Proximal phalanx (MCP)
  const pSegLength = length * (isThumb ? 0.45 : 0.42);
  const pGeom = new THREE.CylinderGeometry(thickness, thickness * 0.9, pSegLength, 8);
  const pMesh = new THREE.Mesh(pGeom, materials.armorWhite);
  pMesh.position.y = -pSegLength / 2;
  pMesh.castShadow = true;
  mcp.add(pMesh);

  // MCP Joint Ring
  const mcpKnuckle = new THREE.Mesh(
    new THREE.SphereGeometry(thickness * 1.15, 8, 8),
    materials.jointBearing
  );
  mcp.add(mcpKnuckle);

  // PIP Joint Pivot
  const pip = new THREE.Group();
  pip.position.y = -pSegLength;
  mcp.add(pip);

  const mSegLength = length * (isThumb ? 0.35 : 0.34);
  const mGeom = new THREE.CylinderGeometry(thickness * 0.88, thickness * 0.78, mSegLength, 8);
  const mMesh = new THREE.Mesh(mGeom, materials.titaniumSilver);
  mMesh.position.y = -mSegLength / 2;
  mMesh.castShadow = true;
  pip.add(mMesh);

  const pipKnuckle = new THREE.Mesh(
    new THREE.SphereGeometry(thickness * 0.95, 8, 8),
    materials.jointBearing
  );
  pip.add(pipKnuckle);

  // DIP Joint Pivot
  const dip = new THREE.Group();
  dip.position.y = -mSegLength;
  pip.add(dip);

  const dSegLength = length * (isThumb ? 0.28 : 0.24);
  const dGeom = new THREE.CylinderGeometry(thickness * 0.75, thickness * 0.62, dSegLength, 8);
  const dMesh = new THREE.Mesh(dGeom, materials.armorWhite);
  dMesh.position.y = -dSegLength / 2;
  dMesh.castShadow = true;
  dip.add(dMesh);

  // Fingertip rubber / sensor cap
  const tipMesh = new THREE.Mesh(
    new THREE.SphereGeometry(thickness * 0.65, 8, 8),
    materials.darkMechanism
  );
  tipMesh.position.y = -dSegLength;
  dip.add(tipMesh);

  return { mcp, pip, dip, tipMesh };
}

/**
 * Builds complete robotic hand with 5 articulated fingers
 */
function buildHand(materials: RobotMaterialSet, sign: number): ArticulatedHand {
  const handGroup = new THREE.Group();

  // Anatomical Palm Chassis
  const palmGeom = new THREE.BoxGeometry(0.095, 0.1, 0.038);
  const palmMesh = new THREE.Mesh(palmGeom, materials.armorWhite);
  palmMesh.castShadow = true;
  palmMesh.position.y = -0.05;
  handGroup.add(palmMesh);

  // Dorsal hand armor plate (sculpted silver insert)
  const plateGeom = new THREE.BoxGeometry(0.082, 0.08, 0.012);
  const plate = new THREE.Mesh(plateGeom, materials.titaniumSilver);
  plate.position.set(0, -0.05, -0.018);
  handGroup.add(plate);

  // Cyan status beacon on back of hand
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.005, 8),
    materials.cyanAccent
  );
  beacon.rotation.x = Math.PI / 2;
  beacon.position.set(0, -0.05, -0.024);
  handGroup.add(beacon);

  // Finger definitions
  // sign: -1 for left hand, +1 for right hand
  const fingerConfigs = [
    { name: 'pinky', x: sign * 0.036, y: -0.1, len: 0.068, thick: 0.011 },
    { name: 'ring', x: sign * 0.012, y: -0.103, len: 0.08, thick: 0.012 },
    { name: 'middle', x: -sign * 0.012, y: -0.105, len: 0.088, thick: 0.013 },
    { name: 'index', x: -sign * 0.035, y: -0.101, len: 0.082, thick: 0.0125 },
  ] as const;

  const fingers: Record<string, ArticulatedFinger> = {};

  fingerConfigs.forEach(cfg => {
    const f = buildFinger(materials, cfg.len, cfg.thick, false);
    f.mcp.position.set(cfg.x, cfg.y, 0);
    handGroup.add(f.mcp);
    fingers[cfg.name] = f;
  });

  // Opposable thumb
  const thumb = buildFinger(materials, 0.07, 0.014, true);
  thumb.mcp.position.set(sign * 0.052, -0.045, 0.018);
  thumb.mcp.rotation.z = sign * 0.75;
  thumb.mcp.rotation.x = -0.35;
  handGroup.add(thumb.mcp);
  fingers.thumb = thumb;

  return {
    group: handGroup,
    palmMesh,
    fingers: fingers as ArticulatedHand['fingers'],
  };
}

/**
 * Builds complete robotic arm hierarchy with real mechanical joints
 */
function buildArm(
  materials: RobotMaterialSet,
  side: 'left' | 'right',
  torso: THREE.Group
): RobotArm {
  const sign = side === 'left' ? -1 : 1;

  // 1. Shoulder Base Pivot on Torso (clavicle joint)
  const shoulderPivot = new THREE.Group();
  shoulderPivot.position.set(sign * 0.255, 0.54, 0.01);
  torso.add(shoulderPivot);

  // Shoulder Spherical Joint Housing
  const sHousingGeom = new THREE.SphereGeometry(0.075, 16, 16);
  const shoulderMesh = new THREE.Mesh(sHousingGeom, materials.armorWhite);
  shoulderMesh.castShadow = true;
  shoulderPivot.add(shoulderMesh);

  // Shoulder Bearing Ring (metallic concentric rim)
  const sBearingGeom = new THREE.TorusGeometry(0.078, 0.015, 8, 24);
  const sBearing = new THREE.Mesh(sBearingGeom, materials.jointBearing);
  sBearing.rotation.y = Math.PI / 2;
  shoulderPivot.add(sBearing);

  // Shoulder cyan ring accent
  const sCyanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.082, 0.005, 6, 24),
    materials.cyanAccent
  );
  sCyanRing.rotation.y = Math.PI / 2;
  shoulderPivot.add(sCyanRing);

  // 2. Upper Arm Pivot (Z/X/Y Rotation with Glenohumeral ZXY Euler order)
  const upperArmPivot = new THREE.Group();
  upperArmPivot.rotation.order = 'ZXY';
  shoulderPivot.add(upperArmPivot);

  // Upper Arm Linkage (bicep composite shell)
  const uaLength = 0.32;
  const uaGeom = new THREE.CylinderGeometry(0.052, 0.044, uaLength, 12);
  const upperArmMesh = new THREE.Mesh(uaGeom, materials.armorWhite);
  upperArmMesh.position.y = -uaLength / 2;
  upperArmMesh.castShadow = true;
  upperArmPivot.add(upperArmMesh);

  // Metallic accent trim on upper arm
  const uaTrim = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, uaLength * 0.75, 0.02),
    materials.titaniumSilver
  );
  uaTrim.position.set(0, -uaLength / 2, 0.042);
  upperArmPivot.add(uaTrim);

  // 3. Elbow Joint Pivot (Forearm pitch bend)
  const elbowPivot = new THREE.Group();
  elbowPivot.position.y = -uaLength;
  upperArmPivot.add(elbowPivot);

  // Elbow Actuator Cylinder
  const elbowGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.09, 16);
  const elbowMesh = new THREE.Mesh(elbowGeom, materials.darkMechanism);
  elbowMesh.rotation.z = Math.PI / 2;
  elbowPivot.add(elbowMesh);

  // Elbow outer protective cap
  const elbowCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 12),
    materials.titaniumSilver
  );
  elbowCap.position.x = sign * 0.048;
  elbowPivot.add(elbowCap);

  // 4. Forearm Pivot
  const forearmPivot = new THREE.Group();
  elbowPivot.add(forearmPivot);

  // Forearm sculpted shell
  const faLength = 0.28;
  const faGeom = new THREE.CylinderGeometry(0.043, 0.038, faLength, 12);
  const forearmMesh = new THREE.Mesh(faGeom, materials.armorWhite);
  forearmMesh.position.y = -faLength / 2;
  forearmMesh.castShadow = true;
  forearmPivot.add(forearmMesh);

  // Forearm titanium sensor rib
  const faRib = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, faLength * 0.8, 0.015),
    materials.titaniumSilver
  );
  faRib.position.set(0, -faLength / 2, sign * 0.038);
  forearmPivot.add(faRib);

  // 5. Multi-axis Wrist Joint
  const wristPivot = new THREE.Group();
  wristPivot.position.y = -faLength;
  forearmPivot.add(wristPivot);

  // Wrist spherical bearing
  const wristBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 12, 12),
    materials.jointBearing
  );
  wristPivot.add(wristBall);

  // 6. Articulated Hand
  const hand = buildHand(materials, sign);
  hand.group.position.y = -0.035;
  wristPivot.add(hand.group);

  return {
    side,
    shoulderPivot,
    upperArmPivot,
    elbowPivot,
    forearmPivot,
    wristPivot,
    hand,
    shoulderMesh,
    upperArmMesh,
    elbowMesh,
    forearmMesh,
  };
}

/**
 * Creates the complete Half-Body Humanoid Robot Model
 */
export function createHumanoidRobot(): HumanoidRobotRig {
  const materials = createRobotMaterials();
  const root = new THREE.Group();

  // -------------------------------------------------------------
  // 1. Sleek Industrial Research Pedestal / Grounding Base
  // (Waist-down mount for professional half-body humanoid cobot)
  // -------------------------------------------------------------
  const pedestal = new THREE.Group();
  root.add(pedestal);

  // Circular floor base plate
  const baseFlange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.42, 0.05, 32),
    materials.pedestalBase
  );
  baseFlange.position.y = 0.025;
  baseFlange.receiveShadow = true;
  baseFlange.castShadow = true;
  pedestal.add(baseFlange);

  // Cyan status ring on base
  const baseCyanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.008, 8, 32),
    materials.cyanAccent
  );
  baseCyanRing.rotation.x = Math.PI / 2;
  baseCyanRing.position.y = 0.052;
  pedestal.add(baseCyanRing);

  // Heavy-duty central mounting column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.72, 24),
    materials.pedestalColumn
  );
  column.position.y = 0.41;
  column.castShadow = true;
  pedestal.add(column);

  // Decorative mechanical ribbing on column
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.155 - i * 0.008, 0.012, 8, 24),
      materials.jointBearing
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25 + i * 0.16;
    pedestal.add(ring);
  }

  // -------------------------------------------------------------
  // 2. Waist & Pelvis (Yaw / Lean articulation)
  // -------------------------------------------------------------
  const waist = new THREE.Group();
  waist.position.y = 0.78;
  root.add(waist);

  // Pelvic Chassis
  const pelvisGeom = new THREE.CylinderGeometry(0.22, 0.18, 0.16, 16);
  const pelvis = new THREE.Mesh(pelvisGeom, materials.armorWhite);
  pelvis.castShadow = true;
  waist.add(pelvis);

  // Waist mechanical actuator ring
  const waistRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.02, 10, 24),
    materials.jointBearing
  );
  waistRing.rotation.x = Math.PI / 2;
  waist.add(waistRing);

  // -------------------------------------------------------------
  // 3. Torso & Sculpted Chest Armor (Inspired by Reference)
  // -------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  waist.add(torso);

  // Spine multi-segment column
  const spineGeom = new THREE.CylinderGeometry(0.12, 0.15, 0.46, 16);
  const spine = new THREE.Mesh(spineGeom, materials.darkMechanism);
  spine.position.y = 0.25;
  spine.castShadow = true;
  torso.add(spine);

  // White composite chest armor (curved ergonomic thoracic plate)
  const chestArmorGeom = new THREE.BoxGeometry(0.44, 0.42, 0.24);
  const chestArmor = new THREE.Mesh(chestArmorGeom, materials.armorWhite);
  chestArmor.position.set(0, 0.38, 0.02);
  chestArmor.castShadow = true;
  torso.add(chestArmor);

  // Bilateral chest ventilation cavities (matching reference image)
  const ventL = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.07, 0.04),
    materials.darkMechanism
  );
  ventL.position.set(-0.11, 0.38, 0.13);
  torso.add(ventL);

  const ventR = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.07, 0.04),
    materials.darkMechanism
  );
  ventR.position.set(0.11, 0.38, 0.13);
  torso.add(ventR);

  // Sternum central glow reactor / status light
  const chestCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.02, 16),
    materials.chestReactor
  );
  chestCore.rotation.x = Math.PI / 2;
  chestCore.position.set(0, 0.44, 0.135);
  torso.add(chestCore);

  // Futuristic Quantum Reactor Outer Ring & Conduit Core
  const reactorRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.048, 0.005, 8, 24),
    materials.energyConduit
  );
  reactorRing.position.set(0, 0.44, 0.138);
  torso.add(reactorRing);

  // Futuristic Rotating Spoke Turbine inside reactor
  const reactorTurbine = new THREE.Group();
  reactorTurbine.position.set(0, 0.44, 0.14);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.032, 0.003),
      materials.reactorCoreGlow
    );
    spoke.rotation.z = (i * Math.PI) / 3;
    reactorTurbine.add(spoke);
  }
  torso.add(reactorTurbine);

  // Upper clavicle armor plates
  const clavicleArmor = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.08, 0.18),
    materials.titaniumSilver
  );
  clavicleArmor.position.set(0, 0.56, 0.01);
  torso.add(clavicleArmor);

  // Futuristic Glowing Energy Conduits across Clavicle
  const conduitL = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.008, 0.008),
    materials.energyConduit
  );
  conduitL.position.set(-0.12, 0.56, 0.102);
  torso.add(conduitL);

  const conduitR = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.008, 0.008),
    materials.energyConduit
  );
  conduitR.position.set(0.12, 0.56, 0.102);
  torso.add(conduitR);

  // Holographic Body Boundary Collision Envelope Shield (Visual Shield Mesh & Wireframe)
  const boundaryShieldGroup = new THREE.Group();
  boundaryShieldGroup.visible = false;
  torso.add(boundaryShieldGroup);

  // Torso and Ribcage Boundary Shield
  const torsoShieldGeom = new THREE.CylinderGeometry(0.30, 0.27, 0.78, 20, 4);
  const torsoShieldMesh = new THREE.Mesh(torsoShieldGeom, materials.boundaryShield);
  torsoShieldMesh.position.set(0, 0.32, 0.02);
  boundaryShieldGroup.add(torsoShieldMesh);

  const torsoShieldWire = new THREE.Mesh(torsoShieldGeom, materials.boundaryShieldWire);
  torsoShieldWire.position.set(0, 0.32, 0.02);
  boundaryShieldGroup.add(torsoShieldWire);

  // Cranial & Visor Boundary Shield Dome
  const headDomeGeom = new THREE.SphereGeometry(0.24, 18, 12);
  const headDomeMesh = new THREE.Mesh(headDomeGeom, materials.boundaryShield);
  headDomeMesh.position.set(0, 0.82, 0.04);
  boundaryShieldGroup.add(headDomeMesh);

  const headDomeWire = new THREE.Mesh(headDomeGeom, materials.boundaryShieldWire);
  headDomeWire.position.set(0, 0.82, 0.04);
  boundaryShieldGroup.add(headDomeWire);


  // -------------------------------------------------------------
  // 4. Neck Mechanism (Articulated 2-axis)
  // -------------------------------------------------------------
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.62, 0.02);
  torso.add(neckPivot);

  // Hydraulic cervical column
  const neckCylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.08, 0.14, 12),
    materials.darkMechanism
  );
  neckCylinder.position.y = 0.07;
  neckPivot.add(neckCylinder);

  // Dual side hydraulic actuators
  [-0.045, 0.045].forEach(x => {
    const piston = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8),
      materials.titaniumSilver
    );
    piston.position.set(x, 0.07, 0);
    neckPivot.add(piston);
  });

  // -------------------------------------------------------------
  // 5. Realistic Humanoid Head & Faceplate (Inspired by Reference)
  // -------------------------------------------------------------
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.15, 0);
  neckPivot.add(headPivot);

  // Cranial Shell (White composite)
  const skullGeom = new THREE.BoxGeometry(0.24, 0.28, 0.26);
  const skull = new THREE.Mesh(skullGeom, materials.armorWhite);
  skull.position.set(0, 0.08, -0.02);
  skull.castShadow = true;
  headPivot.add(skull);

  // Ear telemetry caps
  [-0.13, 0.13].forEach(x => {
    const ear = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16),
      materials.jointBearing
    );
    ear.rotation.z = Math.PI / 2;
    ear.position.set(x, 0.08, -0.02);
    headPivot.add(ear);
  });

  // Faceplate Visor Frame (Sculpted Titanium)
  const faceplateGeom = new THREE.BoxGeometry(0.2, 0.22, 0.06);
  const faceplate = new THREE.Mesh(faceplateGeom, materials.titaniumSilver);
  faceplate.position.set(0, 0.07, 0.11);
  headPivot.add(faceplate);

  // Realistic Eye Sockets & Directional Pupils
  const eyeLGroup = new THREE.Group();
  eyeLGroup.position.set(-0.052, 0.09, 0.142);
  headPivot.add(eyeLGroup);

  const eyeRGroup = new THREE.Group();
  eyeRGroup.position.set(0.052, 0.09, 0.142);
  headPivot.add(eyeRGroup);

  // Eye Sclera (dark lenses)
  const scleraGeom = new THREE.CylinderGeometry(0.024, 0.024, 0.005, 16);
  scleraGeom.rotateX(Math.PI / 2);
  const scleraL = new THREE.Mesh(scleraGeom, materials.eyeSclera);
  eyeLGroup.add(scleraL);
  const scleraR = new THREE.Mesh(scleraGeom, materials.eyeSclera);
  eyeRGroup.add(scleraR);

  // Eye Pupils (Cyan luminous dots that shift with gaze!)
  const pupilGeom = new THREE.CircleGeometry(0.011, 16);
  const eyeLeft = new THREE.Mesh(pupilGeom, materials.eyePupil);
  eyeLeft.position.set(0, 0, 0.004);
  eyeLGroup.add(eyeLeft);

  const eyeRight = new THREE.Mesh(pupilGeom, materials.eyePupil);
  eyeRight.position.set(0, 0, 0.004);
  eyeRGroup.add(eyeRight);

  // Expressive Mechanical Mouth Display
  const mouthBarGeom = new THREE.BoxGeometry(0.08, 0.012, 0.006);
  const mouthDisplay = new THREE.Mesh(mouthBarGeom, materials.mouthDisplay);
  mouthDisplay.position.set(0, 0.005, 0.143);
  headPivot.add(mouthDisplay);

  // -------------------------------------------------------------
  // 6. Left and Right Arms
  // -------------------------------------------------------------
  const leftArm = buildArm(materials, 'left', torso);
  const rightArm = buildArm(materials, 'right', torso);

  // Set rest default rotations
  leftArm.upperArmPivot.rotation.z = 0.12;
  rightArm.upperArmPivot.rotation.z = -0.12;
  leftArm.elbowPivot.rotation.x = -0.15;
  rightArm.elbowPivot.rotation.x = -0.15;

  // -------------------------------------------------------------
  // Kinematics Update Method
  // -------------------------------------------------------------
  const updatePose = (
    angles: RobotJointAngles,
    lFingers: HandFingersState,
    rFingers: HandFingersState,
    blinkScaleY: number = 1.0
  ) => {
    // Torso / Waist
    waist.rotation.y = angles.torsoYaw;
    waist.rotation.z = angles.torsoLean;

    // Neck & Head
    neckPivot.rotation.y = angles.headYaw * 0.4;
    neckPivot.rotation.x = angles.headPitch * 0.4;
    neckPivot.rotation.z = angles.headRoll * 0.4;

    headPivot.rotation.y = angles.headYaw * 0.6;
    headPivot.rotation.x = angles.headPitch * 0.6;
    headPivot.rotation.z = angles.headRoll * 0.6;

    // Eye Gaze Tracking (subtle directional translation of pupils inside sockets + blink scale)
    const pupilRange = 0.009;
    eyeLeft.position.x = angles.eyeX * pupilRange;
    eyeLeft.position.y = angles.eyeY * pupilRange;
    eyeLeft.scale.set(1.0, Math.max(0.08, blinkScaleY), 1.0);

    eyeRight.position.x = angles.eyeX * pupilRange;
    eyeRight.position.y = angles.eyeY * pupilRange;
    eyeRight.scale.set(1.0, Math.max(0.08, blinkScaleY), 1.0);

    // Mouth Expression Animation
    let mScaleX = 1.0;
    let mScaleY = 1.0;
    if (angles.mouthState === 'smile') {
      mScaleX = 1.35;
      mScaleY = 1.2;
    } else if (angles.mouthState === 'speaking') {
      mScaleX = 1.1;
      mScaleY = 1.8 + Math.sin(performance.now() * 0.02) * 0.6;
    } else if (angles.mouthState === 'interacting') {
      mScaleX = 1.25;
      mScaleY = 1.4;
    }
    mouthDisplay.scale.set(mScaleX, mScaleY, 1);

    // Left Arm Articulation
    leftArm.upperArmPivot.rotation.z = angles.lShoulderZ;
    leftArm.upperArmPivot.rotation.x = angles.lShoulderX;
    leftArm.upperArmPivot.rotation.y = angles.lShoulderY;
    leftArm.elbowPivot.rotation.x = -angles.lElbow;
    leftArm.wristPivot.rotation.set(
      angles.lWristPitch,
      angles.lWristYaw,
      angles.lWristRoll
    );

    // Right Arm Articulation
    rightArm.upperArmPivot.rotation.z = angles.rShoulderZ;
    rightArm.upperArmPivot.rotation.x = angles.rShoulderX;
    rightArm.upperArmPivot.rotation.y = angles.rShoulderY;
    rightArm.elbowPivot.rotation.x = -angles.rElbow;
    rightArm.wristPivot.rotation.set(
      angles.rWristPitch,
      angles.rWristYaw,
      angles.rWristRoll
    );

    // Left Hand Finger Joints (Full range articulation, forward palmar curl & anatomical thumb opposition)
    const lHand = leftArm.hand;
    (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).forEach(name => {
      const fRig = lHand.fingers[name];
      const fTarget: FingerJoints = lFingers[name];
      if (fRig && fTarget) {
        if (name === 'thumb') {
          // Anatomical opposable thumb: sweeps across palm (+X, +Z) and flexes
          fRig.mcp.rotation.x = -0.35 - fTarget.mcp * 0.45;
          fRig.mcp.rotation.y = 0.25 - fTarget.mcp * 0.65;
          fRig.mcp.rotation.z = -0.75 + fTarget.mcp * 0.45;
          fRig.pip.rotation.x = -fTarget.pip * 1.15;
          fRig.dip.rotation.x = -fTarget.dip * 1.15;
        } else {
          // Palmar curl (flexing forward into palm (+Z))
          fRig.mcp.rotation.x = -fTarget.mcp;
          fRig.pip.rotation.x = -fTarget.pip;
          fRig.dip.rotation.x = -fTarget.dip;

          // Natural finger abduction splay when hand is extended, converging in a fist
          const splayNorm = Math.max(0, 1 - fTarget.mcp);
          if (name === 'index') {
            fRig.mcp.rotation.z = splayNorm * 0.09;
          } else if (name === 'ring') {
            fRig.mcp.rotation.z = -splayNorm * 0.06;
          } else if (name === 'pinky') {
            fRig.mcp.rotation.z = -splayNorm * 0.13;
          } else {
            fRig.mcp.rotation.z = 0;
          }
        }
      }
    });

    // Right Hand Finger Joints (Full range articulation, forward palmar curl & anatomical thumb opposition)
    const rHand = rightArm.hand;
    (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).forEach(name => {
      const fRig = rHand.fingers[name];
      const fTarget: FingerJoints = rFingers[name];
      if (fRig && fTarget) {
        if (name === 'thumb') {
          // Anatomical opposable thumb: sweeps across palm (-X, +Z) and flexes
          fRig.mcp.rotation.x = -0.35 - fTarget.mcp * 0.45;
          fRig.mcp.rotation.y = -0.25 + fTarget.mcp * 0.65;
          fRig.mcp.rotation.z = 0.75 - fTarget.mcp * 0.45;
          fRig.pip.rotation.x = -fTarget.pip * 1.15;
          fRig.dip.rotation.x = -fTarget.dip * 1.15;
        } else {
          // Palmar curl (flexing forward into palm (+Z))
          fRig.mcp.rotation.x = -fTarget.mcp;
          fRig.pip.rotation.x = -fTarget.pip;
          fRig.dip.rotation.x = -fTarget.dip;

          // Natural finger abduction splay when hand is extended, converging in a fist
          const splayNorm = Math.max(0, 1 - fTarget.mcp);
          if (name === 'index') {
            fRig.mcp.rotation.z = -splayNorm * 0.09;
          } else if (name === 'ring') {
            fRig.mcp.rotation.z = splayNorm * 0.06;
          } else if (name === 'pinky') {
            fRig.mcp.rotation.z = splayNorm * 0.13;
          } else {
            fRig.mcp.rotation.z = 0;
          }
        }
      }
    });
  };

  const leftIKSolver = new RobotArmIKSolver('left');
  const rightIKSolver = new RobotArmIKSolver('right');

  const updatePoseWithIK = (
    angles: RobotJointAngles,
    lFingers: HandFingersState,
    rFingers: HandFingersState,
    ikTargets?: {
      leftWrist?: THREE.Vector3;
      leftElbow?: THREE.Vector3;
      rightWrist?: THREE.Vector3;
      rightElbow?: THREE.Vector3;
    },
    blinkScaleY: number = 1.0
  ) => {
    const updatedAngles: RobotJointAngles = { ...angles };
    if (ikTargets?.leftWrist) {
      const sol = leftIKSolver.solve(ikTargets.leftWrist, ikTargets.leftElbow);
      updatedAngles.lShoulderZ = sol.shoulderZ;
      updatedAngles.lShoulderX = sol.shoulderX;
      updatedAngles.lShoulderY = sol.shoulderY;
      updatedAngles.lElbow = sol.elbow;
    }
    if (ikTargets?.rightWrist) {
      const sol = rightIKSolver.solve(ikTargets.rightWrist, ikTargets.rightElbow);
      updatedAngles.rShoulderZ = sol.shoulderZ;
      updatedAngles.rShoulderX = sol.shoulderX;
      updatedAngles.rShoulderY = sol.shoulderY;
      updatedAngles.rElbow = sol.elbow;
    }
    updatePose(updatedAngles, lFingers, rFingers, blinkScaleY);
  };

  const getHandWorldPosition = (side: 'left' | 'right'): THREE.Vector3 => {
    const arm = side === 'left' ? leftArm : rightArm;
    const worldPos = new THREE.Vector3();
    arm.hand.palmMesh.getWorldPosition(worldPos);
    return worldPos;
  };

  // Configure comprehensive shadow casting and receiving across all robot shells and joints
  root.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    root,
    pedestal,
    waist,
    torso,
    neckPivot,
    headPivot,
    eyeLeft,
    eyeRight,
    mouthDisplay,
    mouthScaleTarget: 1.0,
    chestCore,
    leftArm,
    rightArm,
    materials,
    ikSolver: {
      left: leftIKSolver,
      right: rightIKSolver,
      solve: (
        side: 'left' | 'right',
        targetWrist: THREE.Vector3,
        targetElbowHint?: THREE.Vector3
      ) => {
        const solver = side === 'left' ? leftIKSolver : rightIKSolver;
        return solver.solve(targetWrist, targetElbowHint);
      },
      solveFromLandmarks: (
        side: 'left' | 'right',
        shoulderLm: Landmark3D,
        elbowLm: Landmark3D,
        wristLm: Landmark3D,
        motionGain: number = 1.0,
        isMetricWorldLandmark: boolean = false
      ) => {
        const solver = side === 'left' ? leftIKSolver : rightIKSolver;
        return solver.solveFromLandmarks(
          shoulderLm,
          elbowLm,
          wristLm,
          motionGain,
          isMetricWorldLandmark
        );
      },
    },
    updatePose,
    updatePoseWithIK,
    getHandWorldPosition,
    boundaryShieldGroup,
    setBoundaryShieldVisible: (visible: boolean) => {
      boundaryShieldGroup.visible = visible;
    },
    setBodyBoundaryEnabled: (enabled: boolean) => {
      leftIKSolver.bodyBoundaryEnabled = enabled;
      rightIKSolver.bodyBoundaryEnabled = enabled;
    },
    getBoundaryStatus: () => ({
      leftDeflected: leftIKSolver.isDeflected,
      rightDeflected: rightIKSolver.isDeflected,
      leftPenetration: leftIKSolver.lastDeflectionAmount,
      rightPenetration: rightIKSolver.lastDeflectionAmount,
    }),
    updateFuturisticEffects: (
      dt: number,
      isDeflectingLeft: boolean,
      isDeflectingRight: boolean,
      futuristicMode: boolean
    ) => {
      const isDeflecting = isDeflectingLeft || isDeflectingRight;
      // High-tech quantum arc-reactor spin
      const spinSpeed = isDeflecting ? 8.5 : 3.0;
      reactorTurbine.rotation.z += dt * spinSpeed;

      // Real-time emissive pulse across cyan reactor core and conduits
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.0035);
      materials.chestReactor.emissiveIntensity = futuristicMode
        ? 0.95 + 0.55 * pulse
        : 0.65 + 0.25 * pulse;
      materials.energyConduit.emissiveIntensity = futuristicMode
        ? 1.35 + 0.65 * pulse
        : 0.85;

      // Dynamic reactive boundary shield glow
      if (boundaryShieldGroup.visible) {
        if (isDeflecting) {
          const flash = Math.sin(Date.now() * 0.02);
          materials.boundaryShield.opacity = 0.38 + 0.14 * flash;
          materials.boundaryShield.emissiveIntensity = 1.6 + 0.5 * flash;
          materials.boundaryShieldWire.opacity = 0.68;
        } else {
          const shimmer = Math.sin(Date.now() * 0.002);
          materials.boundaryShield.opacity = 0.16 + 0.05 * shimmer;
          materials.boundaryShield.emissiveIntensity = 0.55 + 0.2 * shimmer;
          materials.boundaryShieldWire.opacity = 0.28;
        }
      }
    },
  };
}
