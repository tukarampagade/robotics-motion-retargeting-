/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RobotCommand, RobotStatusResponse } from '../../src/types/robot';
import { SafetyCommandWatchdog } from '../safety/commandTimeout';

export interface CommandLogEntry {
  command: RobotCommand;
  timestamp: number;
  source?: string;
  sourceConfidence?: number;
  safetyReason?: string;
}

export class RobotCommandService {
  private currentCommand: RobotCommand = 'STOP';
  private lastCommandTimestamp: number = Date.now();
  private watchdog: SafetyCommandWatchdog;
  private commandHistory: CommandLogEntry[] = [];
  private emergencyStopped: boolean = false;
  private timeoutDurationMs: number = 750;

  constructor(timeoutDurationMs: number = 750) {
    this.timeoutDurationMs = timeoutDurationMs;
    this.watchdog = new SafetyCommandWatchdog(this.timeoutDurationMs, () => {
      this.handleWatchdogTimeout();
    });
  }

  private handleWatchdogTimeout(): void {
    if (this.currentCommand !== 'STOP') {
      const prevCommand = this.currentCommand;
      this.currentCommand = 'STOP';
      this.lastCommandTimestamp = Date.now();
      this.logCommand('STOP', 'watchdog_timeout', 1.0, `Timeout elapsed without heartbeat (prev: ${prevCommand})`);
      console.warn(`[SAFETY WATCHDOG] No command heartbeat received within ${this.timeoutDurationMs}ms. Robot command reset to STOP.`);
    }
  }

  public executeCommand(
    command: RobotCommand,
    source: string = 'client_gesture',
    confidence: number = 1.0
  ): { ok: boolean; command: RobotCommand; emergencyStopped: boolean } {
    if (this.emergencyStopped && command !== 'STOP') {
      return {
        ok: false,
        command: 'STOP',
        emergencyStopped: true,
      };
    }

    if (command === 'STOP' && this.emergencyStopped) {
      // Releasing or acknowledging stop
      this.emergencyStopped = false;
    }

    this.currentCommand = command;
    this.lastCommandTimestamp = Date.now();

    // Reset safety watchdog timer
    this.watchdog.resetWatchdog(command);

    this.logCommand(command, source, confidence);

    return {
      ok: true,
      command: this.currentCommand,
      emergencyStopped: this.emergencyStopped,
    };
  }

  public emergencyStop(reason: string = 'manual_e_stop'): void {
    this.emergencyStopped = true;
    this.currentCommand = 'STOP';
    this.lastCommandTimestamp = Date.now();
    this.watchdog.clearWatchdog();
    this.logCommand('STOP', 'emergency_stop', 1.0, reason);
    console.warn(`[SAFETY EMERGENCY STOP] ${reason}`);
  }

  public resetEmergencyStop(): void {
    this.emergencyStopped = false;
    this.currentCommand = 'STOP';
    this.lastCommandTimestamp = Date.now();
    this.watchdog.clearWatchdog();
  }

  public getStatus(): RobotStatusResponse & { emergencyStopped: boolean; history: CommandLogEntry[] } {
    const isMoving = this.currentCommand !== 'STOP';
    return {
      ok: true,
      command: this.currentCommand,
      lastCommandTime: this.lastCommandTimestamp,
      isMoving,
      safetyTimeoutMs: this.timeoutDurationMs,
      activeTransport: 'http_json',
      emergencyStopped: this.emergencyStopped,
      history: this.commandHistory.slice(-10),
    };
  }

  public getCurrentCommand(): RobotCommand {
    return this.currentCommand;
  }

  public setTimeoutDuration(durationMs: number): void {
    this.timeoutDurationMs = durationMs;
    this.watchdog.setTimeoutDuration(durationMs);
  }

  private logCommand(
    command: RobotCommand,
    source?: string,
    sourceConfidence?: number,
    safetyReason?: string
  ): void {
    this.commandHistory.push({
      command,
      timestamp: Date.now(),
      source,
      sourceConfidence,
      safetyReason,
    });
    if (this.commandHistory.length > 50) {
      this.commandHistory.shift();
    }
  }

  public destroy(): void {
    this.watchdog.clearWatchdog();
  }
}

// Global singleton instance for the server process
export const robotCommandService = new RobotCommandService(750);
