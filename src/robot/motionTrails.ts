/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

interface TrailPoint {
  position: THREE.Vector3;
  timestamp: number;
  speed: number;
}

interface HandTrail {
  points: TrailPoint[];
  lastPosition: THREE.Vector3;
  lastVelocity: number;
  line: THREE.Line;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  tipGlow: THREE.Mesh;
}

const MAX_TRAIL_POINTS = 50;
const TRAIL_LIFETIME_MS = 480; // duration in ms for trail to completely fade
const MIN_SPEED_THRESHOLD = 0.28; // meters per second to start trailing

export class MotionTrailsManager {
  private scene: THREE.Scene;
  private leftHandTrail: HandTrail;
  private rightHandTrail: HandTrail;
  private isEnabled: boolean = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.leftHandTrail = this.createHandTrail('#00e5ff');
    this.rightHandTrail = this.createHandTrail('#00d2ff');
  }

  private createHandTrail(baseHex: string): HandTrail {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const colors = new Float32Array(MAX_TRAIL_POINTS * 3);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Dynamic line with additive blending for an electric luminous neon streak
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      linewidth: 3,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    this.scene.add(line);

    // Tip glow beacon (spherical lens flare that lights up on rapid hand velocity)
    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 12, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(baseHex),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(tipGlow);

    return {
      points: [],
      lastPosition: new THREE.Vector3(0, 0, 0),
      lastVelocity: 0,
      line,
      geometry,
      positions,
      colors,
      tipGlow,
    };
  }

  /**
   * Updates trails based on instantaneous hand positions and frame delta time.
   */
  public update(
    dt: number,
    leftHandPos: THREE.Vector3,
    rightHandPos: THREE.Vector3,
    enabled: boolean = true
  ): { leftVelocity: number; rightVelocity: number } {
    this.isEnabled = enabled;
    const now = performance.now();
    const safeDt = Math.max(0.001, dt);

    const leftVel = this.updateSingleHand(this.leftHandTrail, leftHandPos, safeDt, now);
    const rightVel = this.updateSingleHand(this.rightHandTrail, rightHandPos, safeDt, now);

    return {
      leftVelocity: leftVel,
      rightVelocity: rightVel,
    };
  }

  private updateSingleHand(
    trail: HandTrail,
    currentPos: THREE.Vector3,
    dt: number,
    now: number
  ): number {
    if (!this.isEnabled) {
      trail.line.visible = false;
      trail.tipGlow.visible = false;
      trail.points = [];
      return 0;
    }

    // Measure instantaneous linear velocity in m/s
    const distMoved = currentPos.distanceTo(trail.lastPosition);
    // Ignore first jump when hand suddenly appears
    const rawVel = distMoved > 1.2 ? 0 : distMoved / dt;
    // Low-pass filter velocity
    const speed = trail.lastVelocity + (rawVel - trail.lastVelocity) * 0.45;
    trail.lastVelocity = speed;
    trail.lastPosition.copy(currentPos);

    // Update Tip Glow positioning and brightness
    trail.tipGlow.position.copy(currentPos);
    const tipMat = trail.tipGlow.material as THREE.MeshBasicMaterial;

    if (speed > MIN_SPEED_THRESHOLD) {
      // Glow scales with speed
      const glowStrength = Math.min(1.0, (speed - MIN_SPEED_THRESHOLD) * 1.6);
      tipMat.opacity = glowStrength * 0.8;
      trail.tipGlow.scale.setScalar(0.8 + glowStrength * 0.9);
      trail.tipGlow.visible = true;

      // Add new trail point
      trail.points.unshift({
        position: currentPos.clone(),
        timestamp: now,
        speed,
      });

      if (trail.points.length > MAX_TRAIL_POINTS) {
        trail.points.pop();
      }
    } else {
      // Fade out tip glow
      tipMat.opacity = Math.max(0, tipMat.opacity - dt * 4.0);
      if (tipMat.opacity <= 0.01) {
        trail.tipGlow.visible = false;
      }
    }

    // Age and prune expired trail points
    trail.points = trail.points.filter(p => now - p.timestamp < TRAIL_LIFETIME_MS);

    // If we have at least 2 points, render the trail streak
    if (trail.points.length >= 2) {
      trail.line.visible = true;
      const count = trail.points.length;

      for (let i = 0; i < count; i++) {
        const pt = trail.points[i];
        const age = now - pt.timestamp;
        const normalizedAge = age / TRAIL_LIFETIME_MS; // 0 (newest) to 1 (oldest)
        const alpha = Math.max(0, 1 - normalizedAge);

        // Position
        trail.positions[i * 3] = pt.position.x;
        trail.positions[i * 3 + 1] = pt.position.y;
        trail.positions[i * 3 + 2] = pt.position.z;

        // Color gradient: Head is bright electric white-cyan, tail fades to deep aqua
        const r = 0.3 * alpha * alpha;
        const g = 0.92 * alpha;
        const b = 1.0 * alpha;

        trail.colors[i * 3] = r;
        trail.colors[i * 3 + 1] = g;
        trail.colors[i * 3 + 2] = b;
      }

      const posAttr = trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = trail.geometry.getAttribute('color') as THREE.BufferAttribute;

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      trail.geometry.setDrawRange(0, count);
    } else {
      trail.line.visible = false;
      trail.geometry.setDrawRange(0, 0);
    }

    return speed;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.leftHandTrail.line.visible = false;
      this.leftHandTrail.tipGlow.visible = false;
      this.rightHandTrail.line.visible = false;
      this.rightHandTrail.tipGlow.visible = false;
      this.leftHandTrail.points = [];
      this.rightHandTrail.points = [];
    }
  }

  public dispose(): void {
    this.scene.remove(this.leftHandTrail.line);
    this.scene.remove(this.leftHandTrail.tipGlow);
    this.scene.remove(this.rightHandTrail.line);
    this.scene.remove(this.rightHandTrail.tipGlow);

    this.leftHandTrail.geometry.dispose();
    (this.leftHandTrail.line.material as THREE.Material).dispose();
    this.leftHandTrail.tipGlow.geometry.dispose();
    (this.leftHandTrail.tipGlow.material as THREE.Material).dispose();

    this.rightHandTrail.geometry.dispose();
    (this.rightHandTrail.line.material as THREE.Material).dispose();
    this.rightHandTrail.tipGlow.geometry.dispose();
    (this.rightHandTrail.tipGlow.material as THREE.Material).dispose();
  }
}
