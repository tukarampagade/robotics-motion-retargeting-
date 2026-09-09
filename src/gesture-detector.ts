/**
 * Standalone hand-gesture recognizer.
 * Supported: OPEN_PALM, FIST, POINT, VICTORY, THUMBS_UP, THUMBS_DOWN, PINCH, WAVE.
 */

export interface Vec3 { x: number; y: number; z: number }
export type Side = 'left' | 'right'
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
export type GestureType =
  | 'NONE' | 'OPEN_PALM' | 'FIST' | 'POINT' | 'VICTORY'
  | 'THUMBS_UP' | 'THUMBS_DOWN' | 'PINCH' | 'WAVE'

export interface FingerAngles {
  mcp: number; pip: number; dip: number   // radians
  flexion: number                          // 0 = straight, 1 = fully curled
  extended: boolean
}
export type HandFingerAngles = Record<FingerName, FingerAngles>

export interface GestureResult {
  gesture: GestureType      // debounced, safe to display
  raw: GestureType          // instantaneous
  heldMs: number
  pinchDistance: number     // normalised by hand size
  pinching: boolean
  extended: Record<FingerName, boolean>
  fingers: HandFingerAngles
}

export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const

export const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']

const CHAINS: Record<FingerName, [number, number, number, number, number]> = {
  thumb:  [HAND.WRIST, HAND.THUMB_CMC,  HAND.THUMB_MCP,  HAND.THUMB_IP,   HAND.THUMB_TIP],
  index:  [HAND.WRIST, HAND.INDEX_MCP,  HAND.INDEX_PIP,  HAND.INDEX_DIP,  HAND.INDEX_TIP],
  middle: [HAND.WRIST, HAND.MIDDLE_MCP, HAND.MIDDLE_PIP, HAND.MIDDLE_DIP, HAND.MIDDLE_TIP],
  ring:   [HAND.WRIST, HAND.RING_MCP,   HAND.RING_PIP,   HAND.RING_DIP,   HAND.RING_TIP],
  pinky:  [HAND.WRIST, HAND.PINKY_MCP,  HAND.PINKY_PIP,  HAND.PINKY_DIP,  HAND.PINKY_TIP],
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const len = (v: Vec3) => Math.sqrt(dot(v, v))
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const dist = (a: Vec3, b: Vec3) => len(sub(a, b))
const norm = (v: Vec3): Vec3 => {
  const l = len(v) || 1e-6
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

/** THE core formula: interior angle at B for the chain A-B-C. */
export function angleAtPoint(a: Vec3, b: Vec3, c: Vec3): number {
  const v1 = sub(a, b), v2 = sub(c, b)
  const d = len(v1) * len(v2)
  if (d < 1e-9) return Math.PI
  return Math.acos(clamp(dot(v1, v2) / d, -1, 1))
}

/** Per-finger MCP / PIP / DIP angles, flexion and extension from 21 landmarks. */
export function computeFingerAngles(hand: Vec3[]): HandFingerAngles {
  const out = {} as HandFingerAngles
  for (const name of FINGER_NAMES) {
    const [base, mcp, pip, dip, tip] = CHAINS[name]
    const aMcp = angleAtPoint(hand[base], hand[mcp], hand[pip])
    const aPip = angleAtPoint(hand[mcp], hand[pip], hand[dip])
    const aDip = angleAtPoint(hand[pip], hand[dip], hand[tip])
    // straight joint ≈ PI, fully curled ≈ PI/2 or less
    const curl = (j: number) => clamp((Math.PI - j) / (Math.PI * 0.62), 0, 1)
    const flexion = clamp(curl(aMcp) * 0.3 + curl(aPip) * 0.45 + curl(aDip) * 0.25, 0, 1)
    // geometric cross-check: tip further from wrist than pip ⇒ extended
    const tipReach = dist(hand[tip], hand[HAND.WRIST])
    const pipReach = dist(hand[pip], hand[HAND.WRIST])
    const reaching = tipReach > pipReach * (name === 'thumb' ? 1.02 : 1.12)
    out[name] = {
      mcp: aMcp, pip: aPip, dip: aDip, flexion,
      extended: flexion < (name === 'thumb' ? 0.45 : 0.4) && reaching,
    }
  }
  return out
}

const STABILITY_MS = 130  // candidate must survive this long before publishing
const PINCH_ON = 0.42     // normalised thumb-index distance to engage
const PINCH_OFF = 0.58    // ...and to release (hysteresis)

export class HandGestureDetector {
  private current: GestureType = 'NONE'
  private candidate: GestureType = 'NONE'
  private candidateSince = 0
  private stableSince = 0
  private pinching = false
  private waveHistory: Array<{ t: number; x: number }> = []
  private waveUntil = 0

  constructor(readonly side: Side) {}

  reset(): void {
    this.current = 'NONE'; this.candidate = 'NONE'; this.candidateSince = 0
    this.pinching = false; this.waveHistory = []; this.waveUntil = 0
  }

  isPinching(): boolean { return this.pinching }

  /**
   * @param hand      21 landmarks (MediaPipe order). Pass `null` when no hand.
   * @param now       timestamp in ms (performance.now())
   * @param yIsDown   true for MediaPipe image/world space (+Y down), false if
   *                  you already flipped to a Y-up frame. Only affects
   *                  THUMBS_UP vs THUMBS_DOWN.
   */
  detect(hand: Vec3[] | null, now: number, yIsDown = true): GestureResult {
    const empty: Record<FingerName, boolean> =
      { thumb: false, index: false, middle: false, ring: false, pinky: false }

    if (!hand || hand.length < 21) {
      this.pinching = false
      this.publish('NONE', now)
      const zero: FingerAngles = { mcp: Math.PI, pip: Math.PI, dip: Math.PI, flexion: 0, extended: false }
      return {
        gesture: this.current, raw: 'NONE', heldMs: now - this.stableSince,
        pinchDistance: 1, pinching: false, extended: empty,
        fingers: { thumb: zero, index: zero, middle: zero, ring: zero, pinky: zero },
      }
    }

    const wrist = hand[HAND.WRIST]
    const middleMcp = hand[HAND.MIDDLE_MCP]
    const handScale = Math.max(1e-5, dist(wrist, middleMcp))   // scale invariance

    const fingers = computeFingerAngles(hand)
    const pinchDistance = dist(hand[HAND.THUMB_TIP], hand[HAND.INDEX_TIP]) / handScale

    if (this.pinching) { if (pinchDistance > PINCH_OFF) this.pinching = false }
    else if (pinchDistance < PINCH_ON) { this.pinching = true }

    const extended: Record<FingerName, boolean> = {
      thumb: fingers.thumb.extended, index: fingers.index.extended,
      middle: fingers.middle.extended, ring: fingers.ring.extended,
      pinky: fingers.pinky.extended,
    }
    const count = FINGER_NAMES.reduce((n, f) => n + (extended[f] ? 1 : 0), 0)

    const thumbDir = norm(sub(hand[HAND.THUMB_TIP], hand[HAND.THUMB_MCP]))
    const thumbUpAxis = yIsDown ? -thumbDir.y : thumbDir.y

    let raw: GestureType = 'NONE'
    if (this.pinching && !extended.index && count <= 2) {
      raw = 'PINCH'
    } else if (extended.thumb && !extended.index && !extended.middle && !extended.ring && !extended.pinky) {
      raw = thumbUpAxis > 0.45 ? 'THUMBS_UP' : thumbUpAxis < -0.45 ? 'THUMBS_DOWN' : 'FIST'
    } else if (extended.index && extended.middle && !extended.ring && !extended.pinky) {
      raw = 'VICTORY'
    } else if (extended.index && !extended.middle && !extended.ring && !extended.pinky) {
      raw = 'POINT'
    } else if (count >= 4) {
      raw = 'OPEN_PALM'
    } else if (count === 0) {
      raw = this.pinching ? 'PINCH' : 'FIST'
    } else if (this.pinching) {
      raw = 'PINCH'
    }

    // WAVE: open palm oscillating horizontally ≥2 reversals within 1.2 s
    if (raw === 'OPEN_PALM' || now < this.waveUntil) {
      if (this.detectWave(wrist.x / handScale, now)) this.waveUntil = now + 900
    } else {
      this.waveHistory.length = 0
    }
    if (now < this.waveUntil && (raw === 'OPEN_PALM' || raw === 'NONE')) raw = 'WAVE'

    this.publish(raw, now)
    return {
      gesture: this.current, raw, heldMs: now - this.stableSince,
      pinchDistance, pinching: this.pinching, extended, fingers,
    }
  }

  private publish(raw: GestureType, now: number): void {
    if (raw !== this.candidate) { this.candidate = raw; this.candidateSince = now; return }
    if (raw !== this.current && now - this.candidateSince >= STABILITY_MS) {
      this.current = raw; this.stableSince = now
    }
  }

  private detectWave(x: number, now: number): boolean {
    this.waveHistory.push({ t: now, x })
    while (this.waveHistory.length && now - this.waveHistory[0].t > 1200) this.waveHistory.shift()
    if (this.waveHistory.length < 8) return false
    let direction = 0, reversals = 0, min = Infinity, max = -Infinity
    for (let i = 1; i < this.waveHistory.length; i++) {
      const dx = this.waveHistory[i].x - this.waveHistory[i - 1].x
      min = Math.min(min, this.waveHistory[i].x)
      max = Math.max(max, this.waveHistory[i].x)
      if (Math.abs(dx) < 0.01) continue
      const dir = Math.sign(dx)
      if (direction !== 0 && dir !== direction) reversals++
      direction = dir
    }
    return reversals >= 2 && max - min > 0.35
  }
}

export const GESTURE_LABELS: Record<GestureType, string> = {
  NONE: '—', OPEN_PALM: 'OPEN PALM', FIST: 'FIST', POINT: 'POINT',
  VICTORY: 'VICTORY', THUMBS_UP: 'THUMBS UP', THUMBS_DOWN: 'THUMBS DOWN',
  PINCH: 'PINCH', WAVE: 'WAVE',
}

export const GESTURE_ICONS: Record<GestureType, string> = {
  NONE: '·', OPEN_PALM: '🖐', FIST: '✊', POINT: '☝', VICTORY: '✌',
  THUMBS_UP: '👍', THUMBS_DOWN: '👎', PINCH: '🤏', WAVE: '👋',
}
