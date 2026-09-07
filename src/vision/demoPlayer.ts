/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HandFingersState, RobotJointAngles } from '../types';
import { freshHandFingers, freshRobotJointAngles } from './motionRetargeter';

export interface DemoFrame {
  timeMs: number;
  angles: RobotJointAngles;
  leftFingers: HandFingersState;
  rightFingers: HandFingersState;
  gesture: string;
  response: string;
}

export function generateDemoSequence(): DemoFrame[] {
  const frames: DemoFrame[] = [];

  const addFrame = (
    timeMs: number,
    partialAngles: Partial<RobotJointAngles>,
    partialLFingers?: Partial<HandFingersState>,
    partialRFingers?: Partial<HandFingersState>,
    gesture: string = 'MIRRORING',
    response: string = 'ACTIVE'
  ) => {
    const angles = freshRobotJointAngles();
    Object.assign(angles, partialAngles);

    const leftFingers = freshHandFingers();
    if (partialLFingers) Object.assign(leftFingers, partialLFingers);

    const rightFingers = freshHandFingers();
    if (partialRFingers) Object.assign(rightFingers, partialRFingers);

    frames.push({
      timeMs,
      angles,
      leftFingers,
      rightFingers,
      gesture,
      response,
    });
  };

  const curlVal = (v: number) => ({ mcp: v, pip: v * 0.95, dip: v * 0.85 });
  const openFingers = freshHandFingers();
  const fistFingers = {
    thumb: curlVal(1.1),
    index: curlVal(1.5),
    middle: curlVal(1.5),
    ring: curlVal(1.5),
    pinky: curlVal(1.5),
  };
  const victoryFingers = {
    thumb: curlVal(1.1),
    index: curlVal(0.05),
    middle: curlVal(0.05),
    ring: curlVal(1.5),
    pinky: curlVal(1.5),
  };
  const pointFingers = {
    thumb: curlVal(1.1),
    index: curlVal(0.05),
    middle: curlVal(1.5),
    ring: curlVal(1.5),
    pinky: curlVal(1.5),
  };

  // 0s: Neutral stance
  addFrame(0, {}, openFingers, openFingers, 'MIRRORING', 'STANDBY');

  // 1s: Head turns left, eyes look left
  addFrame(1000, { headYaw: -0.45, eyeX: -0.85, eyeY: 0.1 }, openFingers, openFingers, 'MIRRORING', 'HEAD TRACKING');

  // 2s: Head turns right, eyes look right
  addFrame(2200, { headYaw: 0.45, eyeX: 0.85, eyeY: -0.1 }, openFingers, openFingers, 'MIRRORING', 'EYE GAZE');

  // 3s: Return head to center, nod down
  addFrame(3200, { headPitch: 0.25, eyeY: -0.6 }, openFingers, openFingers, 'MIRRORING', 'PITCH CHECK');

  // 4s: Right arm raises into wave
  addFrame(
    4200,
    { rShoulderZ: -1.75, rElbow: 0.85, rWristPitch: 0.2, headYaw: -0.15 },
    openFingers,
    openFingers,
    'WAVE',
    'WAVING GREETING'
  );

  // 4.6s: Wave oscillation 1
  addFrame(
    4800,
    { rShoulderZ: -1.85, rElbow: 0.55, rWristYaw: 0.45 },
    openFingers,
    openFingers,
    'WAVE',
    'WAVING GREETING'
  );

  // 5.2s: Wave oscillation 2
  addFrame(
    5400,
    { rShoulderZ: -1.75, rElbow: 0.95, rWristYaw: -0.35 },
    openFingers,
    openFingers,
    'WAVE',
    'WAVING GREETING'
  );

  // 6.2s: Both arms raise forward with victory signs
  addFrame(
    6500,
    {
      lShoulderZ: -1.35,
      rShoulderZ: 1.35,
      lShoulderX: -0.65,
      rShoulderX: -0.65,
      lElbow: 0.7,
      rElbow: 0.7,
      headPitch: -0.15,
      mouthState: 'smile',
    },
    victoryFingers,
    victoryFingers,
    'VICTORY',
    'VICTORY SIGN'
  );

  // 7.8s: Point gesture with left hand, fist with right
  addFrame(
    7800,
    {
      lShoulderZ: -1.45,
      lShoulderX: -0.85,
      lElbow: 0.25,
      rShoulderZ: 0.45,
      rElbow: 0.8,
      headYaw: 0.35,
    },
    pointFingers,
    fistFingers,
    'POINT',
    'PRECISION POINTING'
  );

  // 9.2s: Pick and place arm reach to virtual table
  addFrame(
    9200,
    {
      rShoulderZ: -0.85,
      rShoulderX: -0.45,
      rShoulderY: 0.35,
      rElbow: 0.95,
      headYaw: -0.3,
      headPitch: 0.2,
    },
    openFingers,
    openFingers,
    'MIRRORING',
    'REACHING TABLE'
  );

  // 10.4s: Fist grasp object on table
  addFrame(
    10400,
    {
      rShoulderZ: -0.82,
      rShoulderX: -0.45,
      rShoulderY: 0.35,
      rElbow: 0.95,
      headYaw: -0.3,
    },
    openFingers,
    fistFingers,
    'FIST',
    'PICKING UP BOX'
  );

  // 11.6s: Transport object across to place zone
  addFrame(
    11600,
    {
      rShoulderZ: -1.15,
      rShoulderX: -0.55,
      rShoulderY: 0.65,
      rElbow: 0.85,
      headYaw: -0.4,
    },
    openFingers,
    fistFingers,
    'FIST',
    'TRANSPORTING'
  );

  // 12.8s: Release object into Place Zone
  addFrame(
    12800,
    {
      rShoulderZ: -1.05,
      rShoulderX: -0.45,
      rShoulderY: 0.65,
      rElbow: 0.9,
      mouthState: 'smile',
    },
    openFingers,
    openFingers,
    'OPEN_PALM',
    'PLACED ✓'
  );

  // 14.0s: Reset back to neutral
  addFrame(14000, {}, openFingers, openFingers, 'MIRRORING', 'STANDBY');

  return frames;
}
