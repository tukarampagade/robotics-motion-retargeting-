/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RobotCommand } from '../../src/types/robot';

export class SafetyCommandWatchdog {
  private timeoutDurationMs: number;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private onTimeoutCallback: () => void;

  constructor(timeoutDurationMs: number = 750, onTimeout: () => void) {
    this.timeoutDurationMs = timeoutDurationMs;
    this.onTimeoutCallback = onTimeout;
  }

  public resetWatchdog(command: RobotCommand): void {
    this.clearWatchdog();

    // Only set a timeout if the command is an active movement (FORWARD, BACKWARD, LEFT, RIGHT).
    // If command is STOP, robot is already in safe state.
    if (command !== 'STOP') {
      this.timeoutTimer = setTimeout(() => {
        this.onTimeoutCallback();
      }, this.timeoutDurationMs);
    }
  }

  public clearWatchdog(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  public setTimeoutDuration(durationMs: number): void {
    this.timeoutDurationMs = Math.max(100, durationMs);
  }

  public getTimeoutDuration(): number {
    return this.timeoutDurationMs;
  }
}
