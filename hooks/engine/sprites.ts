import { CLEAR } from './canvas'
import type { Canvas } from './canvas'
import { bayer, C, mix } from './palette'

// Characters are drawn as flat-color maps; `bake` adds the polish: a 1px ink
// outline, a rim light on the side the beam's glow falls on, and a shadow on
// the far side. Faces are overlays, so every pose can wear every expression.

export type Sprite = { w: number; h: number; px: Uint32Array }

type Legend = Record<string, number>

const HERO_LEGEND: Legend = {
  H: 0x8a3cff,
  h: 0x5a1fb0,
  G: 0xc49aff,
  K: 0x8fd0ff,
  k: 0x5aa0d8,
  L: 0xd6f4ff,
  W: 0xf2f2f8,
  w: 0xb0b0cc,
  P: 0x5a2a9a,
  p: 0x3a1a6a,
  b: 0x24163a,
  B: 0x4a3a6a,
  y: 0xffd23f,
}

const FIGHTER_LEGEND: Legend = {
  H: 0x16121e,
  h: 0x3a3450,
  S: 0xf2c08a,
  s: 0xc8905a,
  O: 0xf07a1a,
  o: 0xb8501a,
  U: 0x2a4fbf,
  u: 0x1a2f80,
  B: 0x2a4fbf,
  b: 0x16205a,
}

const FACE_LEGEND: Legend = {
  i: C.ink,
  w: 0xffffff,
  r: 0xa0142a,
  t: 0xffffff,
}

/** Pads every row to `w` so maps can be written without counting dots. */
const norm = (rows: readonly string[], w: number) => rows.map(r => r.padEnd(w, '.').slice(0, w))

// ── hero (faces left, toward the beam) ─────────────────────────────────────

const HW = 18
const HH = 26

const HERO_HEAD = norm(
  [
    '......HHG.HH.H',
    '.....HHHHHHHHHHH',
    '....HHGHHHHHHHHHHH',
    '....HHHHHHHHHHhh',
    '....KKKKKKHHHhh',
    '...KKKKKKKKHhh',
    '...KKKKKKKKKh',
    '....KKKKKKKK',
    '.....kKKKKk',
    '......kKKk',
  ],
  HW,
)

const LEGS_STAND = [
  '.....PPPPPPPP',
  '.....PPp..pPP',
  '....PPp....pPP',
  '....PP......PP',
  '....PP......PP',
  '....pP......Pp',
  '...bBBb....bBBb',
  '..bbbbb....bbbbb',
]

export type HeroPose = 'laugh' | 'smug' | 'brace' | 'strain' | 'knee'

type PoseDef = {
  head: { dx: number; dy: number }
  body: readonly string[]
  /** Where the scarf ties on, in the sprite's own pixels. */
  neck: [number, number]
  /** Where the beam meets the hero. */
  hands: [number, number]
}

const POSES: Record<HeroPose, PoseDef> = {
  laugh: {
    head: { dx: 0, dy: 0 },
    body: [
      '....wWWWWWWWWw',
      '...wWWWWWWWWWWw',
      '...KwWWWWWWWWwK',
      '..KK.wWWWWWWw.KK',
      '..KK.WWWWWWWW.KK',
      '...KKwWWWWWWwKK',
      '....KyyyyyyyyK',
      '.....PPPPPPPP',
      ...LEGS_STAND,
    ],
    neck: [9, 9],
    hands: [2, 14],
  },
  smug: {
    head: { dx: 0, dy: 0 },
    body: [
      '....wWWWWWWWWw',
      '...wWWWWWWWWWWw',
      '...wWWWWWWWWWWw',
      '...kKKKKKKKKKKw',
      '...wKKKKKKKKKkw',
      '....wWWWWWWWWw',
      '....yyyyyyyyyy',
      '.....PPPPPPPP',
      ...LEGS_STAND,
    ],
    neck: [9, 9],
    hands: [3, 14],
  },
  brace: {
    head: { dx: -1, dy: 0 },
    body: [
      '....wWWWWWWWWw',
      'KKKKwWWWWWWWWWw',
      'LKKKKKWWWWWWWWw',
      'KK..kwWWWWWWWw',
      '.....wWWWWWWWw',
      '.....wWWWWWWw',
      '.....yyyyyyyy',
      '....PPPPPPPPPP',
      '...PPPp....pPPP',
      '..PPp.......pPP',
      '..PP.........PP',
      '.PP...........PP',
      '.PP...........PP',
      '.pP...........Pp',
      'bBBb.........bBBb',
      'bbbbb.......bbbbbb',
    ],
    neck: [8, 9],
    hands: [0, 12],
  },
  strain: {
    head: { dx: -2, dy: 3 },
    body: [
      'KKKwWWWWWWWWWw',
      'LKKKKWWWWWWWWWw',
      'KK..wWWWWWWWWWw',
      '....wWWWWWWWWw',
      '....yyyyyyyyyy',
      '...PPPPPPPPPPPP',
      '..PPPp......pPPP',
      '.PPp..........pPP',
      '.PP............PP',
      'PPp............pP',
      'pP..............Pp',
      'bBBb..........bBBb',
      'bbbbb.........bbbb',
    ],
    neck: [7, 12],
    hands: [0, 14],
  },
  knee: {
    head: { dx: -1, dy: 6 },
    body: [
      'KKKwWWWWWWWWw',
      'LKKKWWWWWWWWWw',
      '....wWWWWWWWWw',
      '....wWWWWWWWwK',
      '....yyyyyyyyyK',
      '...PPPPPPPPPPK',
      '..PPPp...PPPPPP',
      '.PPp.....PPPPPPPP',
      'bBBb......ppppbbb',
      'bbbbb.....pppppbbb',
    ],
    neck: [8, 15],
    hands: [0, 17],
  },
}

export type Face = 'normal' | 'laugh' | 'smug' | 'grit' | 'pain'

/** 7x5 overlays at the head's (3, 4): brows, eyes, then the mouth. */
const FACES: Record<Face, readonly string[]> = {
  normal: ['.......', '.wi.wi.', '.......', '..iii..', '.......'],
  laugh: ['.......', '.ii.ii.', '.......', 'rrrr...', 'rttr...'],
  smug: ['ii.....', '.wi.wi.', '.......', '...ii..', '..i....'],
  grit: ['.ii.ii.', '.wi.wi.', '.......', 'twtw...', '.......'],
  pain: ['i.i.i..', '.ii.ii.', '.......', 'rrrr...', 'twtw...'],
}

const HERO_DOWN = norm(
  [
    '.HHG.....wWWWw',
    'HHHHKKKKwWWWWWWyPPPPPPPbb',
    'HHHKKKKKWWWWWWWyPPPPPPPbbB',
    '.HhKKKkwwWWWWwwyppp.pppbb',
    '..h..kk..www.....pp..pp',
  ],
  26,
)
const DEAD_EYES = ['i.i.i.i', '.i...i.', 'i.i.i.i']

// ── fighter (faces right, toward the hero) ─────────────────────────────────

const FW = 16
const FIGHTER_HEAD = [
  '.H..H.H',
  'HHHHHHHH',
  '.HHHHHHHHH',
  'HHHHHhHHHH',
  '.HHHSSSSSS',
  '..HHSSSSSS',
  '...HSSSSS',
  '....sSSs',
]

const FIGHTER_LEGS = [
  '..oOOO..OOO',
  '..oOO....OOO',
  '.oOO......OOO',
  '.oO........OO',
  '.oO........oO',
  '.UU........UU',
  '.BBb.......BBb',
  'BBBb.......BBBb',
  'bbbb.......bbbb',
]

export type FighterPose = 'charge' | 'fire'

const FIGHTER: Record<FighterPose, { rows: readonly string[]; hands: [number, number] }> = {
  fire: {
    rows: norm(
      [
        ...FIGHTER_HEAD,
        '...UoOOOOU',
        '..oOOOOOOOSSSSS',
        '..oOOOUOOUSSSSSS',
        '..oOOOOOOO.SSSS',
        '...oOOOOOO',
        '...UUUUUUU',
        '...oOOOOOO',
        ...FIGHTER_LEGS,
      ],
      FW,
    ),
    hands: [15, 10],
  },
  charge: {
    rows: norm(
      [
        ...FIGHTER_HEAD,
        '....UoOOOOU',
        '.SSSoOOOOOOo',
        'SSSSUOOOOOOo',
        '.SS.OOOOOOOo',
        '....oOOOOOo',
        '....UUUUUUU',
        '....oOOOOOo',
        ...FIGHTER_LEGS.map(r => `.${r}`),
      ],
      FW,
    ),
    hands: [0, 10],
  },
}

const FIGHTER_FACES = {
  charge: ['.....', '.i.i.', '..ii.'],
  fire: ['.ii.i', '.i.i.', '.rrr.'],
} as const

// ── baking ─────────────────────────────────────────────────────────────────

const paintMap = (out: Uint32Array, w: number, rows: readonly string[], legend: Legend, ox: number, oy: number) => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = legend[row[x]!]
      if (color === undefined) continue
      const tx = ox + x
      const ty = oy + y
      if (tx < 0 || tx >= w || ty < 0) continue
      out[ty * w + tx] = color
    }
  })
}

export type Light = {
  /** Which side the glow comes from. */
  from: 'left' | 'right'
  color: number
  /** 0 (none) to 1 (blown out). */
  k: number
}

/** Outline, rim light and shadow around a flat map: the sprite grows by 1px each side. */
const bake = (flat: Uint32Array, w: number, h: number, light: Light): Sprite => {
  const W = w + 2
  const H = h + 2
  const out = new Uint32Array(W * H).fill(CLEAR)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? CLEAR : flat[y * w + x]!)
  const toward = light.from === 'left' ? -1 : 1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const base = at(x, y)
      if (base === CLEAR) continue
      let color = base
      const lit = at(x + toward, y) === CLEAR || at(x + toward, y - 1) === CLEAR
      const dark = at(x - toward, y) === CLEAR
      if (lit) color = mix(color, light.color, 0.25 + light.k * 0.5)
      else if (dark) color = mix(color, C.ink, 0.35)
      if (at(x, y - 1) === CLEAR && !lit) color = mix(color, 0xffffff, 0.12)
      out[(y + 1) * W + x + 1] = color
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (out[y * W + x] !== CLEAR) continue
      const near = (dx: number, dy: number) => {
        const v = at(x - 1 + dx, y - 1 + dy)
        return v !== CLEAR
      }
      if (near(-1, 0) || near(1, 0) || near(0, -1) || near(0, 1)) out[y * W + x] = C.ink
    }
  return { w: W, h: H, px: out }
}

const cache = new Map<string, Sprite>()
const cached = (key: string, make: () => Sprite) => {
  let s = cache.get(key)
  if (s === undefined) {
    if (cache.size > 400) cache.clear()
    s = make()
    cache.set(key, s)
  }
  return s
}

const lightKey = (l: Light) => `${l.from}${l.color}${Math.round(l.k * 8)}`

export type HeroLook = {
  pose: HeroPose
  face: Face
  /** Head bob in pixels (laughing, breathing). */
  headLift: number
}

export const heroSprite = (look: HeroLook, light: Light): Sprite =>
  cached(`h${look.pose}${look.face}${look.headLift}${lightKey(light)}`, () => {
    const def = POSES[look.pose]
    const flat = new Uint32Array(HW * HH).fill(CLEAR)
    const bodyY = HH - def.body.length
    paintMap(flat, HW, norm(def.body, HW), HERO_LEGEND, 0, bodyY)
    const hx = def.head.dx
    const hy = def.head.dy - look.headLift
    paintMap(flat, HW, HERO_HEAD, HERO_LEGEND, hx, hy)
    paintMap(flat, HW, FACES[look.face], FACE_LEGEND, hx + 3, hy + 4)
    return bake(flat, HW, HH, light)
  })

export const heroDownSprite = (light: Light): Sprite =>
  cached(`hd${lightKey(light)}`, () => {
    const flat = new Uint32Array(26 * 5).fill(CLEAR)
    paintMap(flat, 26, HERO_DOWN, HERO_LEGEND, 0, 0)
    paintMap(flat, 26, DEAD_EYES, FACE_LEGEND, 1, 1)
    return bake(flat, 26, 5, light)
  })

export const heroAnchors = (pose: HeroPose) => {
  const def = POSES[pose]
  // +1 for the outline the bake adds.
  return { neck: [def.neck[0] + 1, def.neck[1] + 1] as const, hands: [def.hands[0] + 1, def.hands[1] + 1] as const }
}

export const fighterSprite = (pose: FighterPose, shouting: boolean, light: Light): Sprite =>
  cached(`f${pose}${shouting}${lightKey(light)}`, () => {
    const def = FIGHTER[pose]
    const h = def.rows.length
    const flat = new Uint32Array(FW * h).fill(CLEAR)
    paintMap(flat, FW, def.rows, FIGHTER_LEGEND, 0, 0)
    paintMap(flat, FW, FIGHTER_FACES[shouting ? 'fire' : 'charge'], FACE_LEGEND, 5, 4)
    return bake(flat, FW, h, light)
  })

export const fighterHands = (pose: FighterPose) => {
  const [x, y] = FIGHTER[pose].hands
  return [x + 1, y + 1] as const
}

export const HERO_SIZE = { w: HW + 2, h: HH + 2 }
export const FIGHTER_SIZE = { w: FW + 2, h: 24 + 2 }

// ── drawing ────────────────────────────────────────────────────────────────

/** Draws `s` with its top-left at (x, y), scaled by `scale`. */
export const blit = (c: Canvas, s: Sprite, x: number, y: number, scale = 1, tint?: number) => {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  for (let sy = 0; sy < s.h; sy++)
    for (let sx = 0; sx < s.w; sx++) {
      const v = s.px[sy * s.w + sx]!
      if (v === CLEAR) continue
      const color = tint ?? v
      if (scale === 1) c.set(x0 + sx, y0 + sy, color)
      else c.rect(x0 + sx * scale, y0 + sy * scale, scale, scale, color)
    }
}

/** Dissolves from sprite `a` to `b` (same size) with an ordered-dither mask. */
export const blitBlend = (c: Canvas, a: Sprite, b: Sprite, k: number, x: number, y: number, scale = 1) => {
  if (k >= 1 || a.w !== b.w || a.h !== b.h) return blit(c, b, x, y, scale)
  if (k <= 0) return blit(c, a, x, y, scale)
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  for (let sy = 0; sy < b.h; sy++)
    for (let sx = 0; sx < b.w; sx++) {
      const pick = k > bayer(sx, sy) ? b : a
      const v = pick.px[sy * pick.w + sx]!
      if (v === CLEAR) continue
      if (scale === 1) c.set(x0 + sx, y0 + sy, v)
      else c.rect(x0 + sx * scale, y0 + sy * scale, scale, scale, v)
    }
}

/** The pixels just outside a sprite's silhouette, worked out once per sprite. */
const auraCache = new WeakMap<Sprite, Uint32Array>()

const auraOf = (s: Sprite) => {
  let ring = auraCache.get(s)
  if (ring === undefined) {
    const at: number[] = []
    const W = s.w + 2
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.px[y * s.w + x] !== CLEAR
    for (let y = -1; y <= s.h; y++)
      for (let x = -1; x <= s.w; x++) {
        if (solid(x, y)) continue
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1))
          at.push((y + 1) * W + x + 1)
      }
    ring = Uint32Array.from(at)
    auraCache.set(s, ring)
  }
  return ring
}

/** A glowing ring hugging the silhouette: the ki aura. */
export const blitAura = (c: Canvas, s: Sprite, x: number, y: number, color: number, k: number, scale = 1) => {
  const W = s.w + 2
  const x0 = Math.round(x) - scale
  const y0 = Math.round(y) - scale
  for (const i of auraOf(s)) {
    const px = x0 + (i % W) * scale
    const py = y0 + Math.floor(i / W) * scale
    if (scale === 1) c.glow(px, py, color, k)
    else for (let iy = 0; iy < scale; iy++) for (let ix = 0; ix < scale; ix++) c.glow(px + ix, py + iy, color, k)
  }
}
