// The showdown, drawn as pixels: two pixels per terminal cell ('▀' with the
// top pixel as foreground and the bottom one as background).

export type Stage = 'laugh' | 'relaxed' | 'brace' | 'strain' | 'knee' | 'dead'

export const DEATH = 95

export const stageOf = (percent: number): Stage =>
  percent >= DEATH
    ? 'dead'
    : percent >= 90
      ? 'knee'
      : percent >= 75
        ? 'strain'
        : percent >= 50
          ? 'brace'
          : percent >= 25
            ? 'relaxed'
            : 'laugh'

export const CAPTIONS: Record<Stage, string> = {
  laugh: '"HA HA HA! Is that all you\'ve got?"',
  relaxed: '"Meh. Barely warm."',
  brace: '"Ngh... okay, that\'s getting strong!"',
  strain: '"AAARGH! Can\'t... hold... much longer!"',
  knee: '"/compact... NOW...!"',
  dead: 'GAME OVER. Please /compact',
}

export type Scene = {
  columns: number
  rows: number
  percent: number
  /** Frames since the scene began; drives every animation. */
  t: number
  /** Frames since the hero fell, for the explosion. */
  deadFor: number
}

export class Canvas {
  readonly px: Uint32Array

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint32Array(w * h)
  }

  set(x: number, y: number, color: number) {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return
    this.px[iy * this.w + ix] = color
  }

  get(x: number, y: number): number {
    const ix = Math.min(this.w - 1, Math.max(0, Math.floor(x)))
    const iy = Math.min(this.h - 1, Math.max(0, Math.floor(y)))
    return this.px[iy * this.w + ix] ?? 0
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const mix = (a: number, b: number, k: number) => {
  const t = clamp01(k)
  const ch = (shift: number) => {
    const ca = (a >> shift) & 0xff
    const cb = (b >> shift) & 0xff
    return Math.round(ca + (cb - ca) * t) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

const noise = (a: number, b: number) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ── sprites ────────────────────────────────────────────────────────────────

type Sprite = readonly string[]

const HERO_COLORS: Record<string, number> = {
  H: 0x8a3cff,
  F: 0x8fd0ff,
  E: 0x101018,
  X: 0x101018,
  M: 0x7a1020,
  T: 0xffffff,
  A: 0xf2f2f8,
  D: 0xb8b8d0,
  P: 0x5a2a9a,
  B: 0x2a1a3a,
}

const FIGHTER_COLORS: Record<string, number> = {
  K: 0x141414,
  S: 0xf2c08a,
  O: 0xf07a1a,
  B: 0x2a4fbf,
}

const FIGHTER: Sprite = [
  '..K.K.....',
  '.KKKKK....',
  'KKKKKKK...',
  '.KSSSK....',
  '..SSS.....',
  '.OOOOO....',
  'OOOBOOSSS.',
  '.OOOOOSSS.',
  '..BBBB....',
  '..OOOO....',
  '.OO..OO...',
  'OO....OO..',
  'BB.....BB.',
]

const HERO: Record<Exclude<Stage, 'dead'> | 'laugh2' | 'dead', Sprite> = {
  laugh: [
    '....HHHH....',
    '...HHHHHH...',
    '...FFFFFF...',
    '...EFFEFF...',
    '...MMMFFF...',
    '...MMMFF....',
    '....FFFF....',
    '..DAAAAAAD..',
    '.F.AAAAAA.F.',
    '.F.AAAAAA.F.',
    '..FPPPPPPF..',
    '...PP..PP...',
    '...PP..PP...',
    '..BBB..BBB..',
  ],
  laugh2: [
    '....HHHH....',
    '...HHHHHH...',
    '...FFFFFF...',
    '...EFFEFF...',
    '...FMMFFF...',
    '...FFFFF....',
    '....FFFF....',
    '..DAAAAAAD..',
    '.F.AAAAAA.F.',
    '.F.AAAAAA.F.',
    '..FPPPPPPF..',
    '...PP..PP...',
    '...PP..PP...',
    '..BBB..BBB..',
  ],
  relaxed: [
    '....HHHH....',
    '...HHHHHH...',
    '...FFFFFF...',
    '...EFFEFF...',
    '...FTTFFF...',
    '....FFFF....',
    '..DAAAAAAD..',
    '..AAAAAAAA..',
    '..FFFFFFFF..',
    '..AFFFFFFA..',
    '...PPPPPP...',
    '...PP..PP...',
    '...PP..PP...',
    '..BBB..BBB..',
  ],
  brace: [
    '....HHHH....',
    '...HHHHHH...',
    '...FFFFFF...',
    '...EFFEFF...',
    '...FMMFFF...',
    '....FFFF....',
    'FFFAAAAAAD..',
    'FFFFAAAAAA..',
    '...AAAAAAA..',
    '...PPPPPP...',
    '..PP....PP..',
    '.PP......PP.',
    '.PP......PP.',
    'BBB......BBB',
  ],
  strain: [
    '............',
    '............',
    '...HHHHHH...',
    '..HHHHHHH...',
    '..FFFFFF....',
    '..EFFEFF....',
    '..TTTTFF....',
    'FFFAAAAAAD..',
    'FFFFAAAAAAA.',
    '...AAAAAAAA.',
    '..PPPPPPPP..',
    '.PP.....PP..',
    'PP.......PP.',
    'BB.......BBB',
  ],
  knee: [
    '............',
    '............',
    '............',
    '....HHHHHH..',
    '...HHHHHHH..',
    '...FFFFFF...',
    '...EFFEFF...',
    '...TTTFFF...',
    'FFFAAAAAAD..',
    'FFFFAAAAAA..',
    '...AAAAAAAF.',
    '...PPPPPPPF.',
    '..PPPPP.PP..',
    '.BBBBBB.BBB.',
  ],
  dead: [
    '..............',
    '....DDD.......',
    'HHFXFXAAAAPPBB',
    'HHFFMFAAAAPPBB',
    '.....DDD......',
  ],
}

/** Draws `sprite` with its bottom row on `bottom`; `tint` paints a silhouette. */
const drawSprite = (
  c: Canvas,
  sprite: Sprite,
  colors: Record<string, number>,
  x0: number,
  bottom: number,
  tint?: number,
) => {
  const top = bottom - sprite.length + 1
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x] ?? '.']
      if (color === undefined) continue
      c.set(x0 + x, top + y, tint ?? color)
    }
  })
}

// ── pixel font ─────────────────────────────────────────────────────────────

const GLYPHS: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  E: ['###', '#..', '##.', '#..', '###'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  '!': ['#', '#', '#', '.', '#'],
  ' ': ['..', '..', '..', '..', '..'],
}

export const textWidth = (text: string, scale = 1) =>
  [...text].reduce((w, ch) => w + ((GLYPHS[ch]?.[0]?.length ?? 3) + 1) * scale, 0) - scale

const drawText = (
  c: Canvas,
  text: string,
  x0: number,
  y0: number,
  scale: number,
  color: number,
  shadow: number,
) => {
  const paint = (ox: number, oy: number, ink: number) => {
    let x = x0 + ox
    for (const ch of text) {
      const glyph = GLYPHS[ch] ?? GLYPHS[' ']!
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] !== '#') continue
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++)
              c.set(x + gx * scale + sx, y0 + oy + gy * scale + sy, ink)
        }
      })
      x += ((glyph[0]?.length ?? 3) + 1) * scale
    }
  }
  paint(1, 1, shadow)
  paint(0, 0, color)
}

const centeredText = (
  c: Canvas,
  text: string,
  y: number,
  scale: number,
  color: number,
) => drawText(c, text, Math.floor((c.w - textWidth(text, scale)) / 2), y, scale, color, 0x000000)

// ── the scene ──────────────────────────────────────────────────────────────

const backdrop = (c: Canvas, ground: number, sky: (y: number) => number, t: number) => {
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      if (y < ground) {
        c.set(x, y, sky(y))
      } else {
        const speck = noise(x, y) < 0.18
        c.set(x, y, y === ground ? 0x6b4a2b : speck ? 0x4a3522 : 0x3b2a1a)
      }
    }
  const stars = Math.floor((c.w * ground) / 45)
  for (let i = 0; i < stars; i++) {
    const twinkle = noise(i, t >> 2) < 0.15
    c.set(noise(i, 1) * c.w, noise(i, 2) * (ground - 2), twinkle ? 0x6070a0 : 0xd8e0ff)
  }
}

const disc = (c: Canvas, cx: number, cy: number, r: number, inks: readonly number[]) => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / Math.max(0.5, r)
      if (d >= 1) continue
      c.set(x, y, inks[Math.min(inks.length - 1, Math.floor(d * inks.length))]!)
    }
}

const BEAM_INKS = [0xffffff, 0xffffff, 0x9ff3ff, 0x9ff3ff, 0x2fa8ff] as const
const FLARE_INKS = [0xffffff, 0xfff6a0, 0xffd23f, 0xff9a2a] as const

const fight = (c: Canvas, s: Scene) => {
  const stage = stageOf(s.percent)
  const heat = clamp01((s.percent - 50) / 45)
  const ground = c.h - 4
  const flash = s.percent >= 75 && s.t % 6 === 0 ? 0.25 : 0
  backdrop(
    c,
    ground,
    y => mix(mix(mix(0x0b1026, 0x24306a, y / ground), 0x5a0f1a, heat * 0.6), 0xffffff, flash),
    s.t,
  )

  // The fighter, hands forward, on the left.
  drawSprite(c, FIGHTER, FIGHTER_COLORS, 1, ground - 1)
  const cy = ground - 7
  const bx0 = 10

  // The hero, pushed back as the beam grows.
  const push = Math.round((Math.min(s.percent, DEATH) / DEATH) * 3)
  const hx = c.w - 16 + push
  const bob = stage === 'laugh' ? (s.t >> 2) & 1 : 0
  const pose =
    stage === 'laugh' ? ((s.t >> 2) & 1 ? HERO.laugh2 : HERO.laugh) : HERO[stage === 'dead' ? 'knee' : stage]

  const drawHero = () => {
    if (stage === 'brace' || stage === 'strain' || stage === 'knee') {
      const aura = s.t & 1 ? 0xffd23f : 0xfff6a0
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1]] as const)
        drawSprite(c, pose, HERO_COLORS, hx + ox, ground - 1 + oy, aura)
    }
    drawSprite(c, pose, HERO_COLORS, hx, ground - 1 - bob)

    if (stage !== 'laugh' && stage !== 'relaxed') {
      const drip = (s.t >> 1) % 4
      c.set(hx + 9, ground - 12 + drip, 0xbfe8ff)
    }
    if (stage === 'laugh' && (s.t >> 3) % 2 === 0 && ground - 22 >= 0) {
      drawText(c, 'HA HA', hx - 6, ground - 21, 1, 0xfff6a0, 0x000000)
    }
  }

  // The beam: thin at first, swelling with the context window.
  const r = 0.6 + Math.pow(Math.min(s.percent, DEATH) / DEATH, 1.4) * c.h * 0.22
  const bx1 = hx + 1
  for (let x = bx0; x <= bx1; x++) {
    const grow = Math.min(1, (x - bx0 + 2) / 4)
    const wobble = Math.sin(x * 0.55 - s.t * 0.9) * Math.min(1, r * 0.25)
    const rx = Math.max(0.5, (r + wobble) * grow)
    for (let y = Math.floor(cy - rx * 1.3) - 1; y <= cy + rx * 1.3 + 1; y++) {
      const d = Math.abs(y + 0.5 - cy) / rx
      if (d < 1) c.set(x, y, BEAM_INKS[Math.min(4, Math.floor(d * 5))]!)
      else if (d < 1.3) c.set(x, y, mix(c.get(x, y), 0x1a5cff, 0.55))
    }
  }
  disc(c, bx0, cy, 1 + r * 0.45, BEAM_INKS)
  disc(c, bx1 - 1, cy, r * 0.55 + 1 + noise(s.t, 3) * 1.2, FLARE_INKS)

  // The hero holds the beam off in front of everything else.
  drawHero()

  // Sparks thrown back off the impact.
  if (s.percent >= 50) {
    const count = Math.floor(s.percent / 8)
    for (let i = 0; i < count; i++) {
      const phase = (s.t + i * 7) % 12
      const x = bx1 - phase * 1.2 - noise(i, 5) * 3
      const y = cy + (noise(i, 6) - 0.5) * r * 2.6 - phase * 0.4
      c.set(x, y, mix(0xfff6a0, 0xff5a2a, phase / 12))
    }
  }
}

const gameOver = (c: Canvas, s: Scene) => {
  const ground = c.h - 4
  if (s.deadFor < 12) {
    // The blast takes him: a white-out that fades to the aftermath.
    fight(c, { ...s, percent: DEATH - 1 })
    const k = 1 - s.deadFor / 12
    for (let i = 0; i < c.px.length; i++) c.px[i] = mix(c.px[i]!, 0xffffff, k)
    disc(c, c.w - 10, ground - 7, 4 + s.deadFor * 1.5, FLARE_INKS)
    return
  }
  backdrop(c, ground, y => mix(0x200608, 0x4a0c14, y / ground), s.t)
  drawSprite(c, FIGHTER, FIGHTER_COLORS, 1, ground - 1)
  const hx = c.w - 16
  drawSprite(c, HERO.dead, HERO_COLORS, hx, ground - 1)
  for (let i = 0; i < 6; i++) {
    const rise = (s.t + i * 5) % 14
    c.set(hx + 5 + noise(i, 8) * 4 + Math.sin((s.t + i) * 0.4), ground - 4 - rise, mix(0x9a9aa8, 0x2a0a10, rise / 14))
  }

  const big = c.w >= textWidth('GAME OVER', 2) + 4 && c.h >= 30 ? 2 : 1
  const blink = (s.t >> 2) & 1 ? 0xff3b3b : 0xffd23f
  centeredText(c, 'GAME OVER', 2, big, blink)
  const lines = textWidth('PLEASE COMPACT') <= c.w - 2 ? ['PLEASE COMPACT'] : ['PLEASE', 'COMPACT']
  lines.forEach((line, i) => centeredText(c, line, 4 + 5 * big + i * 7, 1, 0x9ff3ff))
}

export const paint = (s: Scene): Canvas => {
  const c = new Canvas(s.columns, s.rows * 2)
  if (stageOf(s.percent) === 'dead') gameOver(c, s)
  else fight(c, s)
  return c
}

// ── encoding for Raster ────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array) => {
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const d = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (d ?? 0)
    out.push(
      B64[(n >> 18) & 63]! +
        B64[(n >> 12) & 63]! +
        (b === undefined ? '=' : B64[(n >> 6) & 63]!) +
        (d === undefined ? '=' : B64[n & 63]!),
    )
  }
  return out.join('')
}

const HALF_BLOCK = 0x2580

/** The Raster's `cells`: each cell the pixel pair above and below, shaken by `shake`. */
export const encode = (c: Canvas, shake = 0): string => {
  const rows = c.h >> 1
  const view = new DataView(new ArrayBuffer(c.w * rows * 12))
  let at = 0
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < c.w; x++) {
      view.setUint32(at, HALF_BLOCK, true)
      view.setUint32(at + 4, c.get(x + shake, r * 2), true)
      view.setUint32(at + 8, c.get(x + shake, r * 2 + 1), true)
      at += 12
    }
  return base64(new Uint8Array(view.buffer))
}

export const frame = (s: Scene): string => {
  const stage = stageOf(s.percent)
  const shake = stage === 'strain' || stage === 'knee' ? (noise(s.t, 9) < 0.5 ? -1 : 1) : 0
  return encode(paint(s), shake)
}
