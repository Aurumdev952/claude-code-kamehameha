import type { Canvas } from './canvas'

// A 5x7 bitmap font: titles, callouts and the countdown.
const GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
}

export const GLYPH_H = 7

const glyph = (ch: string) => GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS['?']!

export const textWidth = (text: string, scale = 1): number =>
  [...text].reduce((w, ch) => w + (glyph(ch)[0]!.length + 1) * scale, 0) - scale

export type TextStyle = {
  color: number
  /** The 1px outline drawn all around each stroke. */
  outline?: number
  /** A drop shadow below and right. */
  shadow?: number
  scale?: number
  /** How many characters show, for typewriter wipes; all when absent. */
  shown?: number
  /** Per-character vertical offset, for bounces and waves. */
  lift?: (index: number) => number
  /** Per-character color, overriding `color`. */
  ink?: (index: number) => number
}

const stamp = (c: Canvas, text: string, x0: number, y0: number, s: number, style: TextStyle, pass: 'shadow' | 'outline' | 'fill') => {
  let x = x0
  const shown = style.shown ?? Infinity
  ;[...text].forEach((ch, i) => {
    const g = glyph(ch)
    if (i < shown) {
      const lift = style.lift?.(i) ?? 0
      const color = pass === 'fill' ? (style.ink?.(i) ?? style.color) : pass === 'shadow' ? style.shadow! : style.outline!
      g.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] !== '#') continue
          const px = x + gx * s
          const py = y0 + gy * s + lift
          if (pass === 'fill') c.rect(px, py, s, s, color)
          else if (pass === 'shadow') c.rect(px + s, py + s, s, s, color)
          else for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]] as const) c.rect(px + dx, py + dy, s, s, color)
        }
      })
    }
    x += (g[0]!.length + 1) * s
  })
}

export const drawText = (c: Canvas, text: string, x: number, y: number, style: TextStyle) => {
  const s = style.scale ?? 1
  if (style.shadow !== undefined) stamp(c, text, x, y, s, style, 'shadow')
  if (style.outline !== undefined) stamp(c, text, x, y, s, style, 'outline')
  stamp(c, text, x, y, s, style, 'fill')
}

export const drawCentered = (c: Canvas, text: string, cx: number, y: number, style: TextStyle) =>
  drawText(c, text, Math.round(cx - textWidth(text, style.scale ?? 1) / 2), y, style)
