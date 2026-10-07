import type { Canvas } from './canvas'
import { BEAM_RAMP, C, FIRE_RAMP, ramp } from './palette'
import { hash, noise1, noise2 } from './rng'

/** Energy texture, precomputed: a 256x64 tile of smooth noise the beam scrolls through. */
const TEX_W = 256
const TEX_H = 64
const TEX = (() => {
  const t = new Float32Array(TEX_W * TEX_H)
  for (let y = 0; y < TEX_H; y++)
    for (let x = 0; x < TEX_W; x++) {
      // Wraps horizontally: blend the tile's end into its start.
      const a = noise2(x * 0.35, y * 0.6, 3)
      const b = noise2((x - TEX_W) * 0.35, y * 0.6, 3)
      const k = x / TEX_W
      t[y * TEX_W + x] = a * (1 - k) + b * k
    }
  return t
})()

export type BeamSpec = {
  /** From the fighter's hands to the clash point, in world pixels. */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Half-height of the beam's body. */
  r: number
  power: number
  t: number
  scale: number
}

/**
 * The kamehameha: a body textured with scrolling energy, rings of light
 * racing toward the hero, a flickering white core and a soft blue glow.
 */
export const drawBeam = (c: Canvas, b: BeamSpec) => {
  const s = b.scale
  const span = Math.max(1, b.x1 - b.x0)
  for (let X = Math.floor(b.x0 * s); X <= b.x1 * s; X++) {
    const wx = X / s
    const u = wx - b.x0
    const cy = b.y0 + ((b.y1 - b.y0) * u) / span
    const taper = Math.min(1, (u + 1.5) / 5)
    const phase = (u - b.t * 38) / 11
    const f = phase - Math.floor(phase)
    const bulge = f < 0.2 ? (1 - f / 0.2) * 0.3 : 0
    const wobble = (noise1(u * 0.18 - b.t * 7, 2) - 0.5) * 0.24
    const rx = Math.max(0.6, b.r * taper * (1 + wobble + bulge))
    const reach = rx * 2
    const flicker = noise1(b.t * 30, 4) * 0.15
    for (let Y = Math.floor((cy - reach) * s); Y <= (cy + reach) * s; Y++) {
      const wy = Y / s
      const d = Math.abs(wy - cy) / rx
      if (d < 1) {
        const tx = ((Math.floor(u - b.t * 40) % TEX_W) + TEX_W) % TEX_W
        const ty = Math.min(TEX_H - 1, Math.max(0, Math.floor(wy - cy + TEX_H / 2)))
        const tex = TEX[ty * TEX_W + tx]!
        const k = 1 - d * d * 0.9 + (tex - 0.5) * 0.45 + bulge * 0.9 + flicker
        c.set(X, Y, ramp(BEAM_RAMP, k, X, Y))
      } else if (d < 2) {
        const g = (1 - (d - 1)) ** 2
        c.glow(X, Y, d < 1.4 ? C.beam2 : C.beam1, g * (0.35 + 0.4 * b.power))
      }
    }
  }
}

/** The ball of ki between the fighter's hands, swirling. */
export const drawChargeBall = (c: Canvas, x: number, y: number, r: number, t: number, scale: number) => {
  if (r <= 0) return
  const s = scale
  c.halo(x * s, y * s, (r * 1.8 + 1) * s, C.beam1, 0.55)
  for (let Y = Math.floor((y - r - 1) * s); Y <= (y + r + 1) * s; Y++)
    for (let X = Math.floor((x - r - 1) * s); X <= (x + r + 1) * s; X++) {
      const dx = X / s - x
      const dy = Y / s - y
      const d = Math.hypot(dx, dy) / r
      if (d >= 1) continue
      const swirl = noise2(Math.atan2(dy, dx) * 1.6 + t * 9, d * 3 - t * 4, 6)
      c.set(X, Y, ramp(BEAM_RAMP, 1.05 - d * 0.9 + (swirl - 0.5) * 0.6, X, Y))
    }
}

/** Where the beam meets the hero's ki: a hot core, a shield and flying rays. */
export const drawClash = (c: Canvas, x: number, y: number, r: number, power: number, t: number, scale: number) => {
  const s = scale
  const X = x * s
  const Y = y * s
  c.halo(X, Y, (r * 1.2 + 2.5) * s, C.fire3, 0.3 + power * 0.3)
  // The hero's shield: an arc of gold in front of their hands.
  if (power > 0.45) {
    const sr = (r * 1.25 + 1.5) * s
    for (let a = -1.25; a <= 1.25; a += 0.04 / Math.max(1, sr / 8)) {
      const wob = noise1(a * 4 + t * 10, 12) * 1.2 * s
      c.set(X - Math.cos(a) * (sr + wob) * 0.45, Y + Math.sin(a) * (sr + wob), hash(Math.floor(a * 50), Math.floor(t * 30)) < 0.5 ? C.fire3 : C.fire4)
    }
  }
  const core = (r * 0.5 + 1 + noise1(t * 25, 13) * 0.9) * s
  c.disc(X, Y, core, [C.white, C.white, C.fire4, C.fire3, C.fire2])
  const rays = 5 + Math.floor(power * 10)
  const tick = Math.floor(t * 24)
  for (let i = 0; i < rays; i++) {
    const a = Math.PI + (hash(i, tick) - 0.5) * Math.PI * 1.1 - 0.25
    const len = core + (1.5 + hash(i, tick, 1) * (2 + r * 0.8)) * s
    const x1 = X + Math.cos(a) * len
    const y1 = Y + Math.sin(a) * len
    c.line(X + Math.cos(a) * core * 0.8, Y + Math.sin(a) * core * 0.8, x1, y1, ramp(FIRE_RAMP, 0.6 + hash(i, tick, 2) * 0.4, Math.floor(x1), Math.floor(y1)))
  }
}
