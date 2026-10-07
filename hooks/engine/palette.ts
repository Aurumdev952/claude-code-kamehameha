// One curated palette for the whole scene. Gradients step between its colors
// with ordered dithering instead of blending into mud, which keeps the retro
// look and keeps a frame well under the terminal's 1024 color pairs.

export const C = {
  ink: 0x0c0a14,
  black: 0x000000,
  white: 0xffffff,

  // Sky, calm night to storm to white-out.
  night0: 0x070818,
  night1: 0x0f1230,
  night2: 0x1b2150,
  night3: 0x2c3a78,
  storm0: 0x16081c,
  storm1: 0x3a0c2c,
  storm2: 0x6e1630,
  storm3: 0xa8282c,
  star: 0xdfe6ff,
  starDim: 0x6a76a8,

  // Mountains and ground.
  far0: 0x141838,
  far1: 0x1f2550,
  near0: 0x1a1426,
  near1: 0x2a1f36,
  soil0: 0x2a1c14,
  soil1: 0x3d2a1c,
  soil2: 0x5a3e26,
  soil3: 0x7c5734,
  crack: 0xffb347,

  // Beam: deep blue to white.
  beam0: 0x0e2a8a,
  beam1: 0x1a5cff,
  beam2: 0x3ccaff,
  beam3: 0x8ef0ff,
  beam4: 0xd6fbff,

  // Fire, ki and sparks.
  fire0: 0x7a1a12,
  fire1: 0xe0451f,
  fire2: 0xff9a2a,
  fire3: 0xffd23f,
  fire4: 0xfff4a8,

  // Smoke and dust.
  smoke0: 0x2a2433,
  smoke1: 0x4a4458,
  smoke2: 0x7a7488,

  // Healing.
  heal0: 0x1f7a3a,
  heal1: 0x4ee06a,
  heal2: 0xb8ffb0,

  // UI text.
  red: 0xff3b3b,
  gold: 0xffd23f,
  cyan: 0x9ff3ff,
} as const

export const BEAM_RAMP = [C.beam0, C.beam1, C.beam2, C.beam3, C.beam4, C.white] as const
export const FIRE_RAMP = [C.fire0, C.fire1, C.fire2, C.fire3, C.fire4, C.white] as const
export const SMOKE_RAMP = [C.smoke0, C.smoke1, C.smoke2] as const
export const HEAL_RAMP = [C.heal0, C.heal1, C.heal2, C.white] as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Linear blend of two 0xRRGGBB colors. */
export const mix = (a: number, b: number, k: number): number => {
  const t = clamp01(k)
  const r = ((a >> 16) & 0xff) + ((((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t)
  const g = ((a >> 8) & 0xff) + ((((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t)
  const bl = (a & 0xff) + (((b & 0xff) - (a & 0xff)) * t)
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const

/** The ordered-dither threshold of a pixel, in (0, 1). */
export const bayer = (x: number, y: number): number => (BAYER4[((y & 3) << 2) | (x & 3)]! + 0.5) / 16

/** `a` or `b`, dithered so that a fraction `k` of the pixels pick `b`. */
export const dither = (a: number, b: number, k: number, x: number, y: number): number =>
  k > bayer(x, y) ? b : a

/** A position `t` in [0, 1] along a ramp, dithered between its two nearest steps. */
export const ramp = (colors: readonly number[], t: number, x: number, y: number): number => {
  const f = clamp01(t) * (colors.length - 1)
  const i = Math.floor(f)
  if (i >= colors.length - 1) return colors[colors.length - 1]!
  return dither(colors[i]!, colors[i + 1]!, f - i, x, y)
}
