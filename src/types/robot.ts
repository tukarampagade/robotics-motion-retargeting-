/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RobotCommand =
  | 'FORWARD'
  | 'BACKWARD'
  | 'LEFT'
  | 'RIGHT'
  | 'STOP';

export type GestureName =
  | 'THUMB_UP'
  | 'THUMB_DOWN'
  | 'POINT_LEFT'
  | 'POINT_RIGHT'
  | 'OPEN_PALM'
  | 'CLOSED_FIST'
  | 'UNKNOWN'
  | 'NO_HAND';

export interface GestureResult {
  gesture: GestureName;
  command: RobotCommand;
  confidence: number;
  timestamp: number;
  pointingAngleDeg?: number;
  tiltAngleDeg?: number;
}

export interface RobotControlConfig {
  processingFps: number;
  minHandConfidence: number;
  gestureStabilityFrames: number;
  commandDebounceMs: number;
  noHandStopTimeoutMs: number;
  commandHeartbeatMs: number;
  robotCommandTimeoutMs: number;
}

export const DEFAULT_ROBOT_CONFIG: RobotControlConfig = {
  processingFps: 12,
  minHandConfidence: 0.75,
  gestureStabilityFrames: 3,
  commandDebounceMs: 250,
  noHandStopTimeoutMs: 500,
  commandHeartbeatMs: 300,
  robotCommandTimeoutMs: 750,
};

export type RobotConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface RobotStatusResponse {
  ok: boolean;
  command: RobotCommand;
  lastCommandTime: number;
  isMoving: boolean;
  safetyTimeoutMs: number;
  activeTransport: string;
}

export interface RobotDriveState {
  x: number;
  z: number;
  rotationY: number;
  command: RobotCommand;
  speed: number;
  isEmergencyStopped: boolean;
}
