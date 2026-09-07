/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web Audio API spatial synthesizer for realistic cobot servo-whirring acoustics.
 * Maps joint velocities smoothly to spatialized motor pitch and acoustic resonance.
 */

interface ServoVoice {
  panNode: StereoPannerNode;
  gainNode: GainNode;
  filterNode: BiquadFilterNode;
  oscCarrier: OscillatorNode;
  oscHarmonic: OscillatorNode;
  harmonicGain: GainNode;
  baseCarrierFreq: number;
  baseHarmonicFreq: number;
  currentVelocity: number;
}

export class ServoAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private voices: {
    leftArm: ServoVoice | null;
    rightArm: ServoVoice | null;
    head: ServoVoice | null;
  } = {
    leftArm: null,
    rightArm: null,
    head: null,
  };

  private isEnabled: boolean = true;
  private volume: number = 0.55;
  private isInitialized: boolean = false;
  private lastUpdateMs: number = performance.now();

  constructor() {
    // AudioContext will be lazily initialized upon first user interaction
  }

  /**
   * Initializes the AudioContext and spatial synthesizers on first user gesture.
   */
  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        console.warn('Web Audio API is not supported in this browser.');
        return;
      }

      this.ctx = new AudioCtxClass();
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isEnabled ? this.volume : 0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Create Spatial Voices
      // Left Arm: Panned Left (-0.72)
      this.voices.leftArm = this.createVoice(-0.72, 160, 950);
      // Right Arm: Panned Right (+0.72)
      this.voices.rightArm = this.createVoice(0.72, 160, 950);
      // Head/Torso: Center (0.0)
      this.voices.head = this.createVoice(0.0, 190, 1100);

      this.isInitialized = true;
    } catch (e) {
      console.warn('Could not initialize Web Audio servo engine:', e);
    }
  }

  private createVoice(
    pan: number,
    baseCarrierFreq: number,
    baseHarmonicFreq: number
  ): ServoVoice | null {
    if (!this.ctx || !this.masterGain) return null;

    // Stereo Panner
    let panNode: StereoPannerNode;
    try {
      panNode = this.ctx.createStereoPanner();
      panNode.pan.setValueAtTime(pan, this.ctx.currentTime);
    } catch {
      // Fallback if StereoPannerNode is not supported
      panNode = this.ctx.createGain() as unknown as StereoPannerNode;
    }

    // Voice Gain
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    // Bandpass Filter (Simulates metallic actuator gearbox resonance)
    const filterNode = this.ctx.createBiquadFilter();
    filterNode.type = 'bandpass';
    filterNode.frequency.setValueAtTime(1200, this.ctx.currentTime);
    filterNode.Q.setValueAtTime(2.6, this.ctx.currentTime);

    // Carrier Oscillator (Low/Mid servo motor hum)
    const oscCarrier = this.ctx.createOscillator();
    oscCarrier.type = 'triangle';
    oscCarrier.frequency.setValueAtTime(baseCarrierFreq, this.ctx.currentTime);

    // Harmonic Oscillator (High-frequency brushless electric whine)
    const oscHarmonic = this.ctx.createOscillator();
    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(baseHarmonicFreq, this.ctx.currentTime);

    const harmonicGain = this.ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

    // Wire up voice routing
    oscHarmonic.connect(harmonicGain);
    harmonicGain.connect(filterNode);
    oscCarrier.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(this.masterGain);

    oscCarrier.start();
    oscHarmonic.start();

    return {
      panNode,
      gainNode,
      filterNode,
      oscCarrier,
      oscHarmonic,
      harmonicGain,
      baseCarrierFreq,
      baseHarmonicFreq,
      currentVelocity: 0,
    };
  }

  /**
   * Update joint angular velocities (rad/s or normalized units) to drive servo sound.
   */
  public updateVelocities(velocities: {
    leftArm: number;
    rightArm: number;
    head: number;
  }): void {
    if (!this.isInitialized || !this.ctx || !this.isEnabled) return;

    const now = this.ctx.currentTime;
    const voiceEntries: [ServoVoice | null, number][] = [
      [this.voices.leftArm, velocities.leftArm],
      [this.voices.rightArm, velocities.rightArm],
      [this.voices.head, velocities.head],
    ];

    voiceEntries.forEach(([voice, vel]) => {
      if (!voice) return;

      // Smooth velocity interpolation to avoid abrupt sound changes
      const clampedVel = Math.min(6.0, Math.max(0, vel));
      voice.currentVelocity += (clampedVel - voice.currentVelocity) * 0.35;
      const v = voice.currentVelocity;

      // Threshold: below 0.08 rad/s, mechanical servos are static/silent
      if (v < 0.08) {
        voice.gainNode.gain.setTargetAtTime(0.0001, now, 0.05);
      } else {
        // Target amplitude scales smoothly with velocity (subtle, non-intrusive)
        // Normalized gain: ~0.02 at low motion, up to ~0.22 at vigorous movement
        const targetGain = Math.min(0.24, 0.02 + (v / 4.0) * 0.2);
        voice.gainNode.gain.setTargetAtTime(targetGain, now, 0.035);

        // Pitch spooling: motor carrier rises with RPM
        const carrierFreq = voice.baseCarrierFreq + Math.min(320, v * 70);
        const harmonicFreq = voice.baseHarmonicFreq + Math.min(1100, v * 240);
        const filterFreq = 1000 + Math.min(1400, v * 300);

        voice.oscCarrier.frequency.setTargetAtTime(carrierFreq, now, 0.04);
        voice.oscHarmonic.frequency.setTargetAtTime(harmonicFreq, now, 0.04);
        voice.filterNode.frequency.setTargetAtTime(filterFreq, now, 0.04);
      }
    });
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(enabled ? this.volume : 0.0001, now, 0.05);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && this.isEnabled) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public getVolume(): number {
    return this.volume;
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public destroy(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.isInitialized = false;
  }
}
