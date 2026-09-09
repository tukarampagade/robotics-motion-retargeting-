/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SaccadeTarget {
  x: number; // -1 (left) to +1 (right)
  y: number; // -1 (down) to +1 (up)
  duration: number; // ms to reach
  dwellTime: number; // ms to remain at fixation point
  label?: string;
}

export class SaccadeEngine {
  private isEnabled: boolean = true;

  // Eye position state
  private currentEyeX: number = 0;
  private currentEyeY: number = 0;
  private targetEyeX: number = 0;
  private targetEyeY: number = 0;
  private startEyeX: number = 0;
  private startEyeY: number = 0;

  // Timing & state machine
  private saccadeProgress: number = 1.0;
  private saccadeDurationSec: number = 0.06; // 60ms rapid ballistic saccade
  private dwellTimerSec: number = 1.2; // seconds remaining in current fixation
  private inactivityTimerSec: number = 0; // seconds user has been still
  private isAutonomous: boolean = false;
  private autonomousBlend: number = 0; // 0.0 = user tracking, 1.0 = autonomous saccade

  // Blink generation
  private blinkTimerSec: number = 4.0;
  private isBlinking: boolean = false;
  private blinkProgress: number = 0;
  private blinkScaleY: number = 1.0;

  // Predefined realistic environmental gaze fixation targets in the robotics lab
  private readonly labFixationTargets: SaccadeTarget[] = [
    { x: 0.0, y: 0.02, duration: 55, dwellTime: 1800, label: 'FORWARD PATH' },
    { x: 0.45, y: -0.22, duration: 65, dwellTime: 1400, label: 'RIGHT NAVIGATION WAYPOINT' },
    { x: -0.52, y: 0.08, duration: 70, dwellTime: 1600, label: 'LEFT INSTRUMENT RACK' },
    { x: 0.12, y: 0.35, duration: 60, dwellTime: 1200, label: 'OVERHEAD GANTRY' },
    { x: -0.28, y: -0.15, duration: 50, dwellTime: 1500, label: 'ROBOT CHASSIS / DRIVE' },
    { x: 0.65, y: 0.1, duration: 75, dwellTime: 1300, label: 'RIGHT TELEMETRY SCREEN' },
    { x: 0.0, y: -0.4, duration: 60, dwellTime: 1600, label: 'FORWARD OBSTACLE SCAN' },
    { x: -0.4, y: 0.3, duration: 65, dwellTime: 1100, label: 'LEFT SENSOR POD' },
    { x: 0.05, y: 0.05, duration: 45, dwellTime: 2000, label: 'CENTER CALIBRATION' },
  ];

  private currentTargetIndex: number = 0;

  constructor(enabled: boolean = true) {
    this.isEnabled = enabled;
    this.scheduleNextTarget();
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.autonomousBlend = 0;
      this.isAutonomous = false;
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public getIsAutonomous(): boolean {
    return this.isAutonomous && this.autonomousBlend > 0.4;
  }

  private scheduleNextTarget(): void {
    // Pick a new target distinct from the previous
    let nextIdx = Math.floor(Math.random() * this.labFixationTargets.length);
    if (nextIdx === this.currentTargetIndex) {
      nextIdx = (nextIdx + 1) % this.labFixationTargets.length;
    }
    this.currentTargetIndex = nextIdx;
    const target = this.labFixationTargets[nextIdx];

    // Add tiny randomized variation so fixation positions aren't robotic grids
    const jitterX = (Math.random() - 0.5) * 0.12;
    const jitterY = (Math.random() - 0.5) * 0.08;

    this.startEyeX = this.currentEyeX;
    this.startEyeY = this.currentEyeY;
    this.targetEyeX = Math.max(-0.95, Math.min(0.95, target.x + jitterX));
    this.targetEyeY = Math.max(-0.85, Math.min(0.85, target.y + jitterY));

    this.saccadeDurationSec = Math.max(0.04, target.duration / 1000);
    this.saccadeProgress = 0;
    this.dwellTimerSec = (target.dwellTime / 1000) * (0.8 + Math.random() * 0.5);

    // High probability of triggering an eyelid blink during a large saccade (saccadic suppression)
    const distance = Math.hypot(this.targetEyeX - this.startEyeX, this.targetEyeY - this.startEyeY);
    if (distance > 0.45 && Math.random() < 0.65 && !this.isBlinking) {
      this.triggerBlink();
    }
  }

  private triggerBlink(): void {
    this.isBlinking = true;
    this.blinkProgress = 0;
    this.blinkTimerSec = 3.5 + Math.random() * 4.0;
  }

  /**
   * Main per-frame update loop
   * @param dt delta time in seconds
   * @param userEyeX user tracking eye gaze X (-1 to +1)
   * @param userEyeY user tracking eye gaze Y (-1 to +1)
   * @param userMotionMagnitude normalized motion velocity of user head and limbs
   */
  public update(
    dt: number,
    userEyeX: number,
    userEyeY: number,
    userMotionMagnitude: number
  ): {
    eyeX: number;
    eyeY: number;
    blinkScaleY: number;
    isAutonomous: boolean;
  } {
    if (!this.isEnabled) {
      return {
        eyeX: userEyeX,
        eyeY: userEyeY,
        blinkScaleY: 1.0,
        isAutonomous: false,
      };
    }

    // 1. Detect user stillness / inactivity threshold
    // If user motion is above threshold (active head movement, waving, reaching), user gaze takes precedence
    const motionThreshold = 0.065;
    if (userMotionMagnitude > motionThreshold) {
      this.inactivityTimerSec = Math.max(0, this.inactivityTimerSec - dt * 2.5);
    } else {
      this.inactivityTimerSec += dt;
    }

    // Activate autonomous saccades when user has been idle/still for > 1.2 seconds
    const shouldBeAutonomous = this.inactivityTimerSec > 1.2;
    this.isAutonomous = shouldBeAutonomous;

    // Smooth blending between user tracking (0) and autonomous saccades (1)
    const blendSpeed = shouldBeAutonomous ? 1.8 : 4.0;
    this.autonomousBlend += (shouldBeAutonomous ? 1 : -1) * dt * blendSpeed;
    this.autonomousBlend = Math.max(0, Math.min(1, this.autonomousBlend));

    // 2. Progress Autonomous Saccade State Machine
    if (this.autonomousBlend > 0) {
      if (this.saccadeProgress < 1.0) {
        // Active rapid saccade motion (ballistic jump)
        this.saccadeProgress += dt / this.saccadeDurationSec;
        if (this.saccadeProgress >= 1.0) {
          this.saccadeProgress = 1.0;
        }

        // Cubic ease-out curve matching biological human saccades
        const t = this.saccadeProgress;
        const easeOut = 1 - Math.pow(1 - t, 3);
        this.currentEyeX = this.startEyeX + (this.targetEyeX - this.startEyeX) * easeOut;
        this.currentEyeY = this.startEyeY + (this.targetEyeY - this.startEyeY) * easeOut;
      } else {
        // Fixation dwell: hold gaze on target with micro-saccadic ocular tremors
        this.dwellTimerSec -= dt;

        // Subtle biological micro-tremors (physiological nystagmus / drift)
        const microTime = performance.now() * 0.007;
        const microX = Math.sin(microTime * 1.3) * 0.015 + Math.cos(microTime * 2.7) * 0.01;
        const microY = Math.cos(microTime * 1.1) * 0.015 + Math.sin(microTime * 2.1) * 0.008;

        this.currentEyeX = this.targetEyeX + microX;
        this.currentEyeY = this.targetEyeY + microY;

        if (this.dwellTimerSec <= 0) {
          this.scheduleNextTarget();
        }
      }
    }

    // 3. Periodic Blink State Machine
    this.blinkTimerSec -= dt;
    if (this.blinkTimerSec <= 0 && !this.isBlinking) {
      this.triggerBlink();
    }

    if (this.isBlinking) {
      // 120ms total blink duration (quick, natural)
      const blinkDuration = 0.12;
      this.blinkProgress += dt / blinkDuration;
      if (this.blinkProgress >= 1.0) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.blinkScaleY = 1.0;
      } else {
        // Eyelid closes to 0.1 and reopens with sinusoidal curve
        const blinkCurve = Math.sin(this.blinkProgress * Math.PI);
        this.blinkScaleY = Math.max(0.08, 1.0 - blinkCurve * 0.92);
      }
    } else {
      this.blinkScaleY = 1.0;
    }

    // 4. Blend user eye gaze with autonomous saccade
    const finalEyeX = userEyeX * (1 - this.autonomousBlend) + this.currentEyeX * this.autonomousBlend;
    const finalEyeY = userEyeY * (1 - this.autonomousBlend) + this.currentEyeY * this.autonomousBlend;

    return {
      eyeX: Math.max(-1.0, Math.min(1.0, finalEyeX)),
      eyeY: Math.max(-1.0, Math.min(1.0, finalEyeY)),
      blinkScaleY: this.blinkScaleY,
      isAutonomous: this.autonomousBlend > 0.4,
    };
  }
}
