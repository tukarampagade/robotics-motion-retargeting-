/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Low-pass filter helper
 */
class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(val: number, alpha: number): number {
    if (this.y === null) {
      this.s = val;
      this.y = val;
    } else {
      this.y = alpha * val + (1.0 - alpha) * this.s!;
      this.s = this.y;
    }
    return this.y;
  }

  public filterWithAlpha(val: number, alpha: number): number {
    return this.filter(val, alpha);
  }

  public hasLastRawValue(): boolean {
    return this.y !== null;
  }

  public last(): number {
    return this.y ?? 0;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

/**
 * One Euro Filter for 1D signals
 * Reference: Casiez, G., Roussel, N. and Vogel, D. (2012).
 * 1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems. CHI '12.
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  constructor(minCutoff: number = 0.75, beta: number = 4.2, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  public setParameters(minCutoff: number, beta: number, dCutoff: number = 1.0): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(val: number, timestamp: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(val, 1.0);
    }

    // Protect against non-monotonic or microsecond duplicate timestamps
    const dt = Math.max(0.001, Math.min(0.2, (timestamp - this.lastTime) / 1000.0));
    this.lastTime = timestamp;
    const rate = 1.0 / dt;

    // Estimate derivative
    const prevVal = this.xFilter.last();
    const dx = (val - prevVal) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // Compute adaptive cutoff frequency (smooth stationary hands, zero lag at speed)
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(val, this.alpha(rate, cutoff));
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

/**
 * 3D Landmark Point One Euro Filter
 */
export class OneEuroFilter3D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  private fz: OneEuroFilter;

  constructor(minCutoff: number = 0.75, beta: number = 4.2, dCutoff: number = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta * 0.85, dCutoff);
  }

  public setParameters(minCutoff: number, beta: number, dCutoff: number = 1.0): void {
    this.fx.setParameters(minCutoff, beta, dCutoff);
    this.fy.setParameters(minCutoff, beta, dCutoff);
    this.fz.setParameters(minCutoff, beta * 0.85, dCutoff);
  }

  public filter(
    pt: { x: number; y: number; z?: number; visibility?: number },
    timestamp: number
  ): { x: number; y: number; z?: number; visibility?: number } {
    return {
      x: this.fx.filter(pt.x, timestamp),
      y: this.fy.filter(pt.y, timestamp),
      z: pt.z !== undefined ? this.fz.filter(pt.z, timestamp) : undefined,
      visibility: pt.visibility,
    };
  }

  public reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/**
 * Filter set for an array of landmark points (e.g., 21 hand landmarks or 33 pose landmarks)
 */
export class LandmarkOneEuroFilterSet {
  private filters: Map<number, OneEuroFilter3D> = new Map();
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(minCutoff: number = 0.75, beta: number = 4.2, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public setParameters(minCutoff: number, beta: number, dCutoff: number = 1.0): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.filters.forEach(f => f.setParameters(minCutoff, beta, dCutoff));
  }

  public filterLandmarks<T extends { x: number; y: number; z?: number; visibility?: number }>(
    landmarks: T[],
    timestamp: number
  ): T[] {
    return landmarks.map((lm, idx) => {
      let f = this.filters.get(idx);
      if (!f) {
        f = new OneEuroFilter3D(this.minCutoff, this.beta, this.dCutoff);
        this.filters.set(idx, f);
      }
      return f.filter(lm, timestamp) as T;
    });
  }

  public reset(): void {
    this.filters.forEach(f => f.reset());
    this.filters.clear();
  }
}
