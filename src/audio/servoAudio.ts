/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Audio has been completely disabled and removed per project specifications.
 * Zero audio context, zero oscillators, zero audio generation.
 */
export class ServoAudioEngine {
  public async init(): Promise<void> {
    // No-op: Audio completely removed
  }

  public setEnabled(_enabled: boolean): void {
    // No-op: Audio completely removed
  }

  public setVolume(_volume: number): void {
    // No-op: Audio completely removed
  }

  public getEnabled(): boolean {
    return false;
  }

  public getVolume(): number {
    return 0;
  }

  public resume(): void {
    // No-op
  }

  public updateVelocities(
    _leftArmVel: number,
    _rightArmVel: number,
    _headVel: number
  ): void {
    // No-op: Audio completely removed
  }

  public destroy(): void {
    // No-op: Audio completely removed
  }
}
