import type { Canvas } from './canvas'
import { C, dither, mix, ramp } from './palette'
import { fbm1, hash, noise1, noise2 } from './rng'

// The world behind the fight. Everything is computed per canvas pixel from
// world coordinates (pixel / scale), so pixel mode gets finer gradients and
// ridgelines for free while sprites stay crisp at their own scale.

export type Weather = {
  /** 0..1: how hard the beam is pushing. */
  power: number
  /** 0..1: calm night to blood-red storm. */
  storm: number
  /** 0..1: lightning or explosion flash. */
  flash: number
  t: number
  /** The canvas scale: canvas pixels per world pixel. */
  scale: number
  /** World x of the hero, where cracks and the crater center. */
  heroX: number
  /** 0..1: how far the ground has split. */
  cracks: number
  crater: boolean
  /** World-pixel camera offset, for parallax. */
  camX: number
}

const CALM = [C.night0, C.night1, C.night2, C.night3] as const
const STORM = [C.storm0, C.storm1, C.storm2, C.storm3] as const

export const drawSky = (c: Canvas, groundY: number, w: Weather) => {
  const gy = groundY * w.scale
  // One ramp blended from calm to storm, with in-between steps, so the
  // dither only ever steps between neighbouring shades.
  const steps: number[] = []
  for (let i = 0; i < CALM.length; i++) {
    const here = mix(CALM[i]!, STORM[i]!, w.storm)
    if (i > 0) steps.push(mix(steps[steps.length - 1]!, here, 0.5))
    steps.push(here)
  }
  for (let y = 0; y < Math.min(c.h, gy); y++) {
    const v = y / gy
    for (let x = 0; x < c.w; x++) c.px[y * c.w + x] = ramp(steps, v, x, y)
  }

  // Stars fade out as the storm comes in.
  const stars = Math.floor((c.w / w.scale) * groundY * 0.03)
  for (let i = 0; i < stars; i++) {
    const sx = hash(i, 11) * c.w
    const sy = hash(i, 12) * gy * 0.8
    const tw = noise1(w.t * 2.5 + i * 7.3, 5)
    if (hash(i, 13) < w.storm * 1.2) continue
    c.set(sx - w.camX * 0.1 * w.scale, sy, tw > 0.6 ? C.star : C.starDim)
  }

  // Two cloud bands drifting at different speeds.
  for (const [layer, speed, top, depth] of [[0, 2, 0.08, 0.18], [1, 5, 0.22, 0.16]] as const) {
    const y0 = Math.floor(gy * top)
    const y1 = Math.floor(gy * (top + depth))
    for (let y = y0; y < y1; y++) {
      const band = 1 - Math.abs((y - y0) / (y1 - y0) - 0.5) * 2
      for (let x = 0; x < c.w; x++) {
        const n = noise2((x / w.scale + w.t * speed - w.camX * (0.2 + layer * 0.2)) * 0.05, (y / w.scale) * 0.25, 20 + layer)
        const k = (n - 0.55) * 3 * band
        if (k <= 0) continue
        const ink = dither(layer === 0 ? C.night2 : C.night3, layer === 0 ? C.storm1 : C.storm2, w.storm, x, y)
        c.glow(x, y, ink, Math.min(0.8, k))
      }
    }
  }
}

const ridge = (wx: number, seed: number, base: number, amp: number) => base - fbm1(wx * 0.045, seed) * amp

export const drawMountains = (c: Canvas, groundY: number, w: Weather) => {
  const s = w.scale
  const H = groundY
  for (let x = 0; x < c.w; x++) {
    const wx = x / s
    const far = ridge(wx + w.camX * 0.3, 31, H - H * 0.3, H * 0.35)
    const near = ridge(wx * 1.4 + 40 + w.camX * 0.6, 47, H - H * 0.1, H * 0.25)
    for (let y = Math.max(0, Math.floor(far * s)); y < groundY * s; y++) {
      const wy = y / s
      const isNear = wy >= near
      const edge = isNear ? wy - near : wy - far
      let color = isNear ? dither(C.near0, C.near1, edge < 2 ? 0.7 : 0.15, x, y) : dither(C.far0, C.far1, edge < 1.5 ? 0.8 : 0.2, x, y)
      // The beam lights the ridges.
      if (edge < 1.2) color = mix(color, C.beam2, w.power * 0.45)
      if (w.storm > 0) color = mix(color, C.storm1, w.storm * 0.3)
      c.px[y * c.w + x] = color
    }
  }
}

export const drawGround = (c: Canvas, groundY: number, w: Weather, beamX0: number, beamX1: number) => {
  const s = w.scale
  const gy = groundY * s
  for (let y = gy; y < c.h; y++) {
    const depth = (y - gy) / Math.max(1, c.h - gy)
    for (let x = 0; x < c.w; x++) {
      const n = noise2(x / s / 3, y / s / 2, 9)
      let color = y < gy + s ? C.soil3 : ramp([C.soil2, C.soil1, C.soil0], depth + (n - 0.5) * 0.5, x, y)
      if (n > 0.78 && y > gy + s) color = C.soil2
      const wx = x / s
      if (wx > beamX0 && wx < beamX1) color = mix(color, C.beam2, w.power * 0.35 * (1 - depth))
      c.px[y * c.w + x] = color
    }
  }

  if (w.cracks > 0) drawCracks(c, groundY, w)
  if (w.crater) drawCrater(c, groundY, w)
}

const drawCracks = (c: Canvas, groundY: number, w: Weather) => {
  const s = w.scale
  for (let k = 0; k < 6; k++) {
    let x = w.heroX + (hash(k, 3) - 0.5) * 8
    let y = groundY + 0.5
    const dir = k % 2 === 0 ? -1 : 1
    const len = 6 + hash(k, 4) * 16
    const reach = len * w.cracks
    for (let i = 0; i < reach; i++) {
      x += dir * (0.8 + hash(k, i) * 0.6)
      y += (hash(k, i, 2) - 0.35) * 0.9
      if (y < groundY) y = groundY + 0.3
      const glow = 0.5 + 0.5 * noise1(w.t * 6 + k * 3 + i * 0.2, 8)
      c.rect(x * s, y * s, Math.max(1, s), Math.max(1, s), mix(C.soil0, C.crack, glow * Math.min(1, w.cracks * 1.5)))
    }
  }
}

const drawCrater = (c: Canvas, groundY: number, w: Weather) => {
  const s = w.scale
  const cx = w.heroX * s
  const rx = 13 * s
  const ry = 2.5 * s
  for (let y = Math.floor(groundY * s - ry * 0.4); y < groundY * s + ry; y++)
    for (let x = Math.floor(cx - rx - s); x < cx + rx + s; x++) {
      const d = Math.hypot((x - cx) / rx, (y - groundY * s) / ry)
      if (d < 1) c.set(x, y, d > 0.82 ? C.soil3 : dither(C.soil0, C.ink, 0.6 - d * 0.4, x, y))
    }
}

/** The whole screen washed toward white: lightning, impacts, the white-out. */
export const flashOver = (c: Canvas, k: number, color: number = C.white) => {
  if (k <= 0.02) return
  if (k >= 0.98) {
    c.px.fill(color)
    return
  }
  // A smooth wash, not a dither: flashes are brief and a pattern reads as noise.
  const q = Math.round(k * 12) / 12
  for (let i = 0; i < c.px.length; i++) c.px[i] = mix(c.px[i]!, color, q)
}
