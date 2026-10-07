// Deterministic randomness: every frame is a pure function of its inputs, so
// tests and the README recorder see exactly what the pane shows.

/** A stable pseudo-random value in [0, 1) for up to three integer keys. */
export const hash = (a: number, b = 0, c = 0): number => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** mulberry32: a small, fast seeded generator for particle spawns. */
export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }

  chance(p: number): boolean {
    return this.next() < p
  }
}

const smooth = (f: number) => f * f * (3 - 2 * f)

/** Smooth 1D value noise in [0, 1). */
export const noise1 = (x: number, seed = 0): number => {
  const i = Math.floor(x)
  const u = smooth(x - i)
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u
}

/** Smooth 2D value noise in [0, 1). */
export const noise2 = (x: number, y: number, seed = 0): number => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const u = smooth(x - ix)
  const v = smooth(y - iy)
  const a = hash(ix, iy, seed)
  const b = hash(ix + 1, iy, seed)
  const c = hash(ix, iy + 1, seed)
  const d = hash(ix + 1, iy + 1, seed)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

/** Two octaves of noise1, for ridgelines and flicker. */
export const fbm1 = (x: number, seed = 0): number => noise1(x, seed) * 0.65 + noise1(x * 2.3, seed + 7) * 0.35
