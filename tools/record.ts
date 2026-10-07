// Renders the showdown headlessly, frame by frame, with the mod's own engine.
//
//   bun tools/record.ts <out-dir> [--w 72] [--h 40] [--scale 1] [--fps 30] [--script demo|stills]
//
// Writes <out-dir>/frames.rgb (raw RGB, frame after frame) and meta.json;
// tools/gif.py turns them into the README's GIF and contact sheet.
import { mkdirSync, writeFileSync } from 'node:fs'

import { createWorld, setTarget, update } from '../hooks/engine/director'
import type { World } from '../hooks/engine/director'
import { layout, paint } from '../hooks/engine/render'

const args = process.argv.slice(2)
const out = args[0] ?? 'out'
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const script = args.includes('--script') ? args[args.indexOf('--script') + 1]! : 'demo'
const W = flag('w', 72)
const H = flag('h', 40)
const S = flag('scale', 1)
const FPS = flag('fps', 30)

type Shot = { label: string; percent: number; tokens?: number }
const frames: Buffer[] = []
const labels: string[] = []

const grab = (w: World, label: string) => {
  const c = paint(w, W, H, S)
  const buf = Buffer.alloc(c.w * c.h * 3)
  for (let i = 0; i < c.px.length; i++) {
    const v = c.px[i]!
    buf[i * 3] = (v >> 16) & 0xff
    buf[i * 3 + 1] = (v >> 8) & 0xff
    buf[i * 3 + 2] = v & 0xff
  }
  frames.push(buf)
  labels.push(label)
}

const run = (w: World, seconds: number, target: (t: number) => Shot, record = true) => {
  const dt = 1 / FPS
  for (let i = 0; i < seconds * FPS; i++) {
    const shot = target(i * dt)
    setTarget(w, shot.percent, shot.tokens)
    update(w, dt, layout(w, W, H))
    if (record) grab(w, shot.label)
  }
}

if (script === 'demo') {
  const w = createWorld({ seed: 3, percent: 0 })
  run(w, 2.8, () => ({ label: '0', percent: 4 }))
  run(w, 14, t => {
    const p = Math.min(100, 4 + (t / 13) * 96)
    return { label: `${Math.round(p)}`, percent: p, tokens: p * 2000 }
  })
  run(w, 8.5, () => ({ label: '100', percent: 100 }))
  run(w, 5, () => ({ label: '22', percent: 22 }))
} else {
  const stills: Array<[string, number]> = [
    ['laugh', 10],
    ['relaxed', 35],
    ['brace', 62],
    ['strain', 82],
    ['knee', 92],
  ]
  for (const [label, percent] of stills) {
    const w = createWorld({ seed: 5, percent, charge: false })
    run(w, 1.4, () => ({ label, percent }), false)
    grab(w, label)
  }
  const charge = createWorld({ seed: 5 })
  run(charge, 1.6, () => ({ label: 'charge', percent: 10 }), false)
  grab(charge, 'charge')
  const dead = createWorld({ seed: 5, percent: 92, charge: false })
  run(dead, 1, () => ({ label: 'x', percent: 92 }), false)
  run(dead, 0.6, () => ({ label: 'x', percent: 100 }), false)
  grab(dead, 'surge')
  run(dead, 6.5, () => ({ label: 'x', percent: 100 }), false)
  grab(dead, 'gameover')
  run(dead, 1.3, () => ({ label: 'x', percent: 20 }), false)
  grab(dead, 'recover')
}

mkdirSync(out, { recursive: true })
writeFileSync(`${out}/frames.rgb`, Buffer.concat(frames))
writeFileSync(`${out}/meta.json`, JSON.stringify({ w: W * S, h: H * S, fps: FPS, count: frames.length, labels }))
console.log(`wrote ${frames.length} frames of ${W * S}x${H * S} to ${out}`)
