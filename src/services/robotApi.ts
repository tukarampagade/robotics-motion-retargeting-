/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RobotCommand, RobotStatusResponse } from '../types/robot';

export class RobotApiService {
  private static baseUrl = '/api/robot';

  /**
   * Send a validated robot command to the controller
   */
  public static async sendCommand(
    command: RobotCommand,
    source: string = 'hand_gesture',
    confidence: number = 1.0,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; command: RobotCommand; emergencyStopped?: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command, source, confidence }),
        signal,
      });

      if (!response.ok) {
        console.warn(`[ROBOT API] Server returned status ${response.status}`);
        return { ok: false, command: 'STOP' };
      }

      const data = await response.json();
      return {
        ok: data.ok ?? true,
        command: data.command || command,
        emergencyStopped: data.emergencyStopped,
      };
    } catch (err: unknown) {
      // Network error or abort -> fail-safe STOP
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[ROBOT API] Command dispatch network error:', err);
      }
      return { ok: false, command: 'STOP' };
    }
  }

  /**
   * Immediate emergency stop
   * Uses keepalive so that if called on page unload/close or route change,
   * the request successfully delivers to the server.
   */
  public static async emergencyStop(
    reason: string = 'manual_e_stop'
  ): Promise<{ ok: boolean; command: RobotCommand }> {
    try {
      const response = await fetch(`${this.baseUrl}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
        keepalive: true,
      });

      const data = await response.json().catch(() => ({}));
      return {
        ok: data.ok ?? true,
        command: 'STOP',
      };
    } catch (err) {
      console.warn('[ROBOT API] Emergency stop dispatch fallback:', err);
      return { ok: false, command: 'STOP' };
    }
  }

  /**
   * Reset emergency stop latch
   */
  public static async resetEmergencyStop(): Promise<{ ok: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/reset-stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json().catch(() => ({ ok: false }));
      return { ok: data.ok ?? true };
    } catch (err) {
      console.warn('[ROBOT API] Reset emergency stop failed:', err);
      return { ok: false };
    }
  }

  /**
   * Fetch current robot telemetry status
   */
  public static async getStatus(signal?: AbortSignal): Promise<RobotStatusResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, { signal });
      if (!response.ok) return null;
      return await response.json();
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('[ROBOT API] Failed to fetch robot status:', err);
      }
      return null;
    }
  }
}
