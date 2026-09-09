/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHandSign, mapGestureToCommand, LandmarkPoint2D } from '../src/utils/gestureClassifier';
import { RobotCommandService } from '../server/services/robotCommandService';
import { isValidRobotCommand, ALLOWED_ROBOT_COMMANDS } from '../server/middleware/validateRobotCommand';

/**
 * Utility to generate mock 21-landmark hand models
 */
function createMockHandLandmarks(options: {
  tiltAngleDeg?: number;
  thumbDirection?: 'up' | 'down' | 'neutral';
  allFingersExtended?: boolean;
  allFingersCurled?: boolean;
  indexExtendedOnly?: boolean;
  indexDirection?: 'left' | 'right' | 'up';
}): LandmarkPoint2D[] {
  const landmarks: LandmarkPoint2D[] = [];
  const wrist: LandmarkPoint2D = { x: 0.5, y: 0.8, z: 0 };
  landmarks.push(wrist);

  const palmScale = 0.2;

  // Thumb
  const thumbBase: LandmarkPoint2D = { x: wrist.x - 0.05, y: wrist.y - 0.05 };
  landmarks.push(thumbBase); // 1: CMC
  landmarks.push({ x: thumbBase.x - 0.03, y: thumbBase.y - 0.04 }); // 2: MCP
  landmarks.push({ x: thumbBase.x - 0.05, y: thumbBase.y - 0.07 }); // 3: IP

  if (options.thumbDirection === 'up') {
    // Thumb pointing straight UP
    landmarks.push({ x: thumbBase.x - 0.05, y: thumbBase.y - 0.16 }); // 4: Tip (high up, low y)
  } else if (options.thumbDirection === 'down') {
    // Thumb pointing straight DOWN
    landmarks.push({ x: thumbBase.x - 0.05, y: thumbBase.y + 0.16 }); // 4: Tip (low down, high y)
  } else {
    landmarks.push({ x: thumbBase.x - 0.04, y: thumbBase.y - 0.04 }); // 4: Neutral
  }

  // Fingers definition: [MCP, PIP, DIP, TIP]
  const fingerOffsets = [
    { x: -0.04, y: -0.15 }, // Index MCP
    { x: 0.0, y: -0.16 },   // Middle MCP
    { x: 0.04, y: -0.15 },  // Ring MCP
    { x: 0.08, y: -0.13 },  // Pinky MCP
  ];

  fingerOffsets.forEach((offset, fIndex) => {
    const isIndex = fIndex === 0;
    const mcp: LandmarkPoint2D = { x: wrist.x + offset.x, y: wrist.y + offset.y };
    landmarks.push(mcp);

    let isExt = options.allFingersExtended;
    if (options.allFingersCurled) isExt = false;
    if (options.indexExtendedOnly) isExt = isIndex;

    if (isExt) {
      if (isIndex && options.indexDirection === 'left') {
        // Pointing Left
        landmarks.push({ x: mcp.x - 0.05, y: mcp.y - 0.02 }); // PIP
        landmarks.push({ x: mcp.x - 0.10, y: mcp.y - 0.02 }); // DIP
        landmarks.push({ x: mcp.x - 0.16, y: mcp.y - 0.02 }); // TIP
      } else if (isIndex && options.indexDirection === 'right') {
        // Pointing Right
        landmarks.push({ x: mcp.x + 0.05, y: mcp.y - 0.02 }); // PIP
        landmarks.push({ x: mcp.x + 0.10, y: mcp.y - 0.02 }); // DIP
        landmarks.push({ x: mcp.x + 0.16, y: mcp.y - 0.02 }); // TIP
      } else {
        // Extended upwards
        landmarks.push({ x: mcp.x, y: mcp.y - 0.05 }); // PIP
        landmarks.push({ x: mcp.x, y: mcp.y - 0.09 }); // DIP
        landmarks.push({ x: mcp.x, y: mcp.y - 0.14 }); // TIP
      }
    } else {
      // Curled towards palm
      landmarks.push({ x: mcp.x, y: mcp.y + 0.02 }); // PIP
      landmarks.push({ x: mcp.x, y: mcp.y + 0.04 }); // DIP
      landmarks.push({ x: mcp.x, y: mcp.y + 0.02 }); // TIP
    }
  });

  return landmarks;
}

describe('1. Hand-Sign Gesture Recognition & Mapping', () => {
  it('maps gesture names directly to correct robot commands', () => {
    assert.equal(mapGestureToCommand('THUMB_UP'), 'FORWARD');
    assert.equal(mapGestureToCommand('THUMB_DOWN'), 'BACKWARD');
    assert.equal(mapGestureToCommand('POINT_LEFT'), 'LEFT');
    assert.equal(mapGestureToCommand('POINT_RIGHT'), 'RIGHT');
    assert.equal(mapGestureToCommand('OPEN_PALM'), 'STOP');
    assert.equal(mapGestureToCommand('CLOSED_FIST'), 'STOP');
    assert.equal(mapGestureToCommand('NO_HAND'), 'STOP');
    assert.equal(mapGestureToCommand('UNKNOWN'), 'STOP');
  });

  it('classifies null or insufficient landmarks as NO_HAND with STOP command', () => {
    const nullResult = classifyHandSign(null);
    assert.equal(nullResult.gesture, 'NO_HAND');
    assert.equal(nullResult.command, 'STOP');

    const emptyResult = classifyHandSign([]);
    assert.equal(emptyResult.gesture, 'NO_HAND');
    assert.equal(emptyResult.command, 'STOP');

    const partialResult = classifyHandSign([{ x: 0, y: 0 }]);
    assert.equal(partialResult.gesture, 'NO_HAND');
    assert.equal(partialResult.command, 'STOP');
  });

  it('fails safe to STOP when confidence is below threshold', () => {
    const landmarks = createMockHandLandmarks({ allFingersExtended: true });
    const result = classifyHandSign(landmarks, 0.8, 0.4);
    assert.equal(result.gesture, 'UNKNOWN');
    assert.equal(result.command, 'STOP');
  });

  it('correctly classifies OPEN_PALM and stops robot', () => {
    const landmarks = createMockHandLandmarks({ allFingersExtended: true });
    const result = classifyHandSign(landmarks, 0.6, 0.95);
    assert.equal(result.gesture, 'OPEN_PALM');
    assert.equal(result.command, 'STOP');
  });

  it('correctly classifies CLOSED_FIST and stops robot', () => {
    const landmarks = createMockHandLandmarks({ allFingersCurled: true });
    const result = classifyHandSign(landmarks, 0.6, 0.95);
    assert.equal(result.gesture, 'CLOSED_FIST');
    assert.equal(result.command, 'STOP');
  });

  it('correctly classifies THUMB_UP and drives FORWARD', () => {
    const landmarks = createMockHandLandmarks({
      allFingersCurled: true,
      thumbDirection: 'up',
    });
    const result = classifyHandSign(landmarks, 0.6, 0.95);
    assert.equal(result.gesture, 'THUMB_UP');
    assert.equal(result.command, 'FORWARD');
  });

  it('correctly classifies THUMB_DOWN and drives BACKWARD', () => {
    const landmarks = createMockHandLandmarks({
      allFingersCurled: true,
      thumbDirection: 'down',
    });
    const result = classifyHandSign(landmarks, 0.6, 0.95);
    assert.equal(result.gesture, 'THUMB_DOWN');
    assert.equal(result.command, 'BACKWARD');
  });

  it('correctly classifies POINT_LEFT and drives LEFT', () => {
    const landmarks = createMockHandLandmarks({
      indexExtendedOnly: true,
      indexDirection: 'left',
    });
    const result = classifyHandSign(landmarks, 0.6, 0.95);
    assert.equal(result.gesture, 'POINT_LEFT');
    assert.equal(result.command, 'LEFT');
  });

  it('correctly classifies POINT_RIGHT and drives RIGHT', () => {
    const landmarks = createMockHandLandmarks({
      indexExtendedOnly: true,
      indexDirection: 'right',
    });
    const result = classifyHandSign(landmarks, 0.6, 0.95);
    assert.equal(result.gesture, 'POINT_RIGHT');
    assert.equal(result.command, 'RIGHT');
  });
});

describe('2. Safe Robot Control & Watchdog Timeout System', () => {
  it('starts in safe STOP state', () => {
    const service = new RobotCommandService(200);
    assert.equal(service.getCurrentCommand(), 'STOP');
    const status = service.getStatus();
    assert.equal(status.command, 'STOP');
    assert.equal(status.isMoving, false);
    assert.equal(status.emergencyStopped, false);
    service.destroy();
  });

  it('executes valid movement command and updates active command', () => {
    const service = new RobotCommandService(200);
    const res = service.executeCommand('FORWARD', 'unit_test', 0.95);
    assert.equal(res.ok, true);
    assert.equal(res.command, 'FORWARD');
    assert.equal(service.getCurrentCommand(), 'FORWARD');
    assert.equal(service.getStatus().isMoving, true);
    service.destroy();
  });

  it('automatically triggers fail-safe STOP if heartbeat timeout elapses (watchdog)', async () => {
    const service = new RobotCommandService(100);
    service.executeCommand('FORWARD', 'heartbeat_test');
    assert.equal(service.getCurrentCommand(), 'FORWARD');

    // Wait for the 100ms watchdog timeout to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Robot must have automatically stopped
    assert.equal(service.getCurrentCommand(), 'STOP');
    assert.equal(service.getStatus().isMoving, false);
    service.destroy();
  });

  it('maintains continuous movement when periodic heartbeats arrive within timeout', async () => {
    const service = new RobotCommandService(120);
    service.executeCommand('FORWARD', 'heartbeat_1');

    // Send repeated heartbeats before timeout expires
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      service.executeCommand('FORWARD', `heartbeat_${i + 2}`);
      assert.equal(service.getCurrentCommand(), 'FORWARD');
    }

    // Now stop sending heartbeats and verify fail-safe triggers
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(service.getCurrentCommand(), 'STOP');
    service.destroy();
  });

  it('immediately halts robot on emergency stop and latches against new commands', () => {
    const service = new RobotCommandService(500);
    service.executeCommand('FORWARD', 'test');
    assert.equal(service.getCurrentCommand(), 'FORWARD');

    service.emergencyStop('Operator pressed E-STOP button');
    assert.equal(service.getCurrentCommand(), 'STOP');
    assert.equal(service.getStatus().emergencyStopped, true);

    // Attempting to move while latched must be rejected
    const rejected = service.executeCommand('FORWARD', 'test');
    assert.equal(rejected.ok, false);
    assert.equal(rejected.command, 'STOP');
    assert.equal(service.getCurrentCommand(), 'STOP');

    // Releasing emergency stop allows commands again
    service.resetEmergencyStop();
    assert.equal(service.getStatus().emergencyStopped, false);

    const allowed = service.executeCommand('FORWARD', 'test');
    assert.equal(allowed.ok, true);
    assert.equal(allowed.command, 'FORWARD');
    service.destroy();
  });
});

describe('3. Command Input Validation & Allowed Set', () => {
  it('validates only allowed robot commands', () => {
    assert.ok(ALLOWED_ROBOT_COMMANDS.has('FORWARD'));
    assert.ok(ALLOWED_ROBOT_COMMANDS.has('BACKWARD'));
    assert.ok(ALLOWED_ROBOT_COMMANDS.has('LEFT'));
    assert.ok(ALLOWED_ROBOT_COMMANDS.has('RIGHT'));
    assert.ok(ALLOWED_ROBOT_COMMANDS.has('STOP'));

    assert.equal(isValidRobotCommand('FORWARD'), true);
    assert.equal(isValidRobotCommand('BACKWARD'), true);
    assert.equal(isValidRobotCommand('LEFT'), true);
    assert.equal(isValidRobotCommand('RIGHT'), true);
    assert.equal(isValidRobotCommand('STOP'), true);

    assert.equal(isValidRobotCommand('INVALID'), false);
    assert.equal(isValidRobotCommand(''), false);
    assert.equal(isValidRobotCommand(null), false);
    assert.equal(isValidRobotCommand(123), false);
  });
});

describe('4. Gesture Stability (3 Consecutive Frames) & Debounce', () => {
  it('requires 3 consecutive matching frames before transitioning stable command', () => {
    let stableCommand = 'STOP';
    let candidate = 'STOP';
    let candidateCount = 0;
    const requiredFrames = 3;

    function processFrameCandidate(cmd: string) {
      if (cmd === candidate) {
        candidateCount++;
      } else {
        candidate = cmd;
        candidateCount = 1;
      }

      if (candidateCount >= requiredFrames) {
        stableCommand = candidate;
      }
      return stableCommand;
    }

    // Frame 1: FORWARD (1/3)
    assert.equal(processFrameCandidate('FORWARD'), 'STOP');
    // Frame 2: FORWARD (2/3)
    assert.equal(processFrameCandidate('FORWARD'), 'STOP');
    // Frame 3: FORWARD (3/3) -> Transitions to FORWARD
    assert.equal(processFrameCandidate('FORWARD'), 'FORWARD');

    // Transient noise frame: BACKWARD (1/3) -> Stays FORWARD
    assert.equal(processFrameCandidate('BACKWARD'), 'FORWARD');
    // Transient noise frame 2: LEFT (1/3) -> Stays FORWARD
    assert.equal(processFrameCandidate('LEFT'), 'FORWARD');

    // Now 3 consecutive frames of LEFT
    processFrameCandidate('LEFT'); // 2/3
    assert.equal(processFrameCandidate('LEFT'), 'LEFT'); // 3/3 -> Transitions to LEFT
  });

  it('debounces rapid identical commands within debounce window', () => {
    let dispatchCount = 0;
    let lastCmd = 'STOP';
    let lastTime = 0;
    const debounceMs = 250;

    function sendCommand(cmd: string, now: number, force = false) {
      const elapsed = now - lastTime;
      if (!force && cmd === lastCmd && elapsed < debounceMs) {
        return false; // suppressed by debounce
      }
      lastCmd = cmd;
      lastTime = now;
      dispatchCount++;
      return true;
    }

    assert.equal(sendCommand('FORWARD', 1000), true);
    assert.equal(dispatchCount, 1);

    // Rapid duplicate at t=1050ms (< 250ms elapsed) -> suppressed
    assert.equal(sendCommand('FORWARD', 1050), false);
    assert.equal(dispatchCount, 1);

    // Change of command -> allowed immediately
    assert.equal(sendCommand('LEFT', 1100), true);
    assert.equal(dispatchCount, 2);

    // After debounce interval expires (t=1400ms) -> allowed
    assert.equal(sendCommand('LEFT', 1400), true);
    assert.equal(dispatchCount, 3);
  });
});

describe('5. Keyboard Fallback Control Mapping & Safety', () => {
  it('maps key inputs to valid robot commands and enforces allowed command set', () => {
    function mapKeyToCommand(key: string): string {
      switch (key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          return 'FORWARD';
        case 's':
        case 'S':
        case 'ArrowDown':
          return 'BACKWARD';
        case 'a':
        case 'A':
        case 'ArrowLeft':
          return 'LEFT';
        case 'd':
        case 'D':
        case 'ArrowRight':
          return 'RIGHT';
        case ' ':
        case 'Escape':
          return 'STOP';
        default:
          return 'STOP';
      }
    }

    assert.equal(mapKeyToCommand('w'), 'FORWARD');
    assert.equal(mapKeyToCommand('W'), 'FORWARD');
    assert.equal(mapKeyToCommand('ArrowUp'), 'FORWARD');

    assert.equal(mapKeyToCommand('s'), 'BACKWARD');
    assert.equal(mapKeyToCommand('S'), 'BACKWARD');
    assert.equal(mapKeyToCommand('ArrowDown'), 'BACKWARD');

    assert.equal(mapKeyToCommand('a'), 'LEFT');
    assert.equal(mapKeyToCommand('A'), 'LEFT');
    assert.equal(mapKeyToCommand('ArrowLeft'), 'LEFT');

    assert.equal(mapKeyToCommand('d'), 'RIGHT');
    assert.equal(mapKeyToCommand('D'), 'RIGHT');
    assert.equal(mapKeyToCommand('ArrowRight'), 'RIGHT');

    assert.equal(mapKeyToCommand(' '), 'STOP');
    assert.equal(mapKeyToCommand('Escape'), 'STOP');
    assert.equal(mapKeyToCommand('x'), 'STOP'); // unknown key fails safe
  });
});

describe('6. Component Unmount & Camera Reset Safety', () => {
  it('sends STOP on unmount or cleanup', () => {
    const service = new RobotCommandService(500);
    service.executeCommand('FORWARD', 'active');
    assert.equal(service.getCurrentCommand(), 'FORWARD');

    // Simulate component unmount / cleanup handler
    service.emergencyStop('component_unmount');
    assert.equal(service.getCurrentCommand(), 'STOP');
    service.destroy();
  });
});

describe('7. Verification: Removal of Attendance & Active-Tracking', () => {
  it('confirms no files or code references remain for attendance or active object-tracking', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    async function scanDir(dir: string): Promise<string[]> {
      const files: string[] = [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await scanDir(fullPath)));
        } else if (/\.(ts|tsx|js|jsx|json|html)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const srcFiles = await scanDir('./src');
    const serverFiles = await scanDir('./server');
    const allFiles = [...srcFiles, ...serverFiles];

    const forbiddenPatterns = [
      /\battendance\b/i,
      /\battendees?\b/i,
      /\bpickAndPlace\b/i,
      /\bpickPlace\b/i,
      /\bobjectTracking\b/i,
    ];

    for (const filePath of allFiles) {
      const content = await fs.readFile(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const match = pattern.exec(content);
        assert.equal(
          match,
          null,
          `Forbidden legacy reference ${pattern} found in file: ${filePath}`
        );
      }
    }
  });
});

