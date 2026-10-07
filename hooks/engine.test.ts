import { describe, expect, test } from 'claude-code/testing'

import { CHARGE_TIME, createWorld, DEATH, drain, OVER, RECOVER, setTarget, stageOf, update } from './engine/director'
import type { Event, World } from './engine/director'
import { C } from './engine/palette'
import { encodeCells, encodeRgba, layout, paint } from './engine/render'

const W = 72
const H = 44

/** Runs the world for `seconds` at `fps`, collecting every event it raised. */
const run = (w: World, seconds: number, percent: number, opts: { fps?: number; tokens?: number } = {}) => {
  const fps = opts.fps ?? 60
  const events: Event[] = []
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    setTarget(w, percent, opts.tokens)
    update(w, 1 / fps, layout(w, W, H))
    events.push(...drain(w))
  }
  return events
}

const countInk = (w: World, inks: readonly number[], rows: [number, number]) => {
  const c = paint(w, W, H)
  let n = 0
  for (let y = rows[0]; y < rows[1]; y++) for (let x = 0; x < c.w; x++) if (inks.includes(c.px[y * c.w + x]!)) n++
  return n
}

describe('stages', () => {
  test('the hero laughs, braces, strains and falls as context fills', () => {
    expect(stageOf(0)).toBe('laugh')
    expect(stageOf(30)).toBe('relaxed')
    expect(stageOf(60)).toBe('brace')
    expect(stageOf(80)).toBe('strain')
    expect(stageOf(92)).toBe('knee')
    expect(stageOf(DEATH)).toBe('dead')
  })
})

describe('feel', () => {
  test('the beam eases toward a new size and overshoots a little', () => {
    const w = createWorld({ percent: 10, charge: false })
    let peak = 0
    for (let i = 0; i < 120; i++) {
      run(w, 1 / 60, 60)
      peak = Math.max(peak, w.shown)
    }
    expect(Math.abs(w.shown - 60)).toBeLessThan(1)
    expect(peak).toBeGreaterThan(60.5)
  })

  test('motion depends on time, not frame rate', () => {
    const fast = createWorld({ percent: 10, charge: false })
    const slow = createWorld({ percent: 10, charge: false })
    run(fast, 0.5, 70, { fps: 60 })
    run(slow, 0.5, 70, { fps: 20 })
    expect(Math.abs(fast.shown - slow.shown)).toBeLessThan(4)
    expect(Math.abs(fast.time - slow.time)).toBeLessThan(0.1)
  })

  test('a new stage lands with hit-stop, shake, a flash and a shout', () => {
    const w = createWorld({ percent: 45, charge: false })
    run(w, 0.2, 45)
    const events = run(w, 0.6, 62)
    expect(events).toContain('stage-up')
    expect(w.trauma).toBeGreaterThan(0)
    expect(w.callouts.some(c => c.text === 'NGH!')).toBe(true)
  })
})

describe('story', () => {
  test('the fighter charges, then fires', () => {
    const w = createWorld({ percent: 30 })
    expect(w.phase).toBe('charge')
    const events = run(w, CHARGE_TIME + 0.3, 30)
    expect(events).toContain('fire')
    expect(w.phase).toBe('fight')
  })

  test('at 95% the hero falls and the pixel GAME OVER types in', () => {
    const w = createWorld({ percent: 90, charge: false })
    run(w, 0.3, 90)
    expect(countInk(w, [C.red], [0, 20])).toBeLessThan(10)
    const events = run(w, 0.6, 100)
    expect(events).toContain('gameover')
    expect(w.phase).toBe('over')
    run(w, OVER.title + 3, 100)
    expect(countInk(w, [C.red], [0, 20])).toBeGreaterThan(40)
  })

  test('/compact feeds the hero a senzu bean and the fight starts over', () => {
    const w = createWorld({ percent: 100, charge: false })
    run(w, 4, 100)
    const events = run(w, RECOVER.done + 0.2, 25)
    expect(events).toContain('heal')
    expect(w.phase).toBe('charge')
    expect(w.stage).toBe('relaxed')
  })

  test("past 90k tokens the scouter reads OVER 9000", () => {
    const w = createWorld({ percent: 50, charge: false })
    const events = run(w, 0.5, 50, { tokens: 95_000 })
    expect(events).toContain('over9000')
    expect(w.callouts.some(c => c.text.includes('9000'))).toBe(true)
  })
})

describe('rendering', () => {
  test('the beam gets thicker as context fills', () => {
    const thickness = (percent: number) => {
      const w = createWorld({ percent, charge: false })
      run(w, 1.5, percent)
      const c = paint(w, W, H)
      const x = Math.floor(W * 0.42)
      let n = 0
      for (let y = 0; y < c.h; y++) if ([C.white, C.beam4, C.beam3].includes(c.px[y * c.w + x] as never)) n++
      return n
    }
    expect(thickness(15)).toBeLessThan(thickness(55))
    expect(thickness(55)).toBeLessThan(thickness(88))
  })

  test('cells pack one half-block triplet per cell; images four bytes a pixel', () => {
    const w = createWorld({ percent: 40, charge: false })
    expect(encodeCells(paint(w, W, H)).length).toBe(Math.ceil((W * (H / 2) * 12) / 3) * 4)
    const big = paint(w, W, H, 3)
    expect(encodeRgba(big).length).toBe(Math.ceil((big.w * big.h * 4) / 3) * 4)
  })

  test('a frame stays within budget for 60 fps', () => {
    const w = createWorld({ percent: 85, charge: false })
    run(w, 1, 85)
    const t0 = Date.now()
    for (let i = 0; i < 60; i++) {
      run(w, 1 / 60, 85)
      encodeCells(paint(w, 90, 64))
    }
    const ms = (Date.now() - t0) / 60
    expect(ms).toBeLessThan(10)
  })

  test('a frame stays under the terminal palette of 1024 color pairs', () => {
    const w = createWorld({ percent: 88, charge: false })
    run(w, 1, 88)
    const c = paint(w, 90, 64)
    const pairs = new Set<number>()
    for (let r = 0; r < c.h / 2; r++) for (let x = 0; x < c.w; x++) pairs.add(c.px[2 * r * c.w + x]! * 16777216 + c.px[(2 * r + 1) * c.w + x]!)
    expect(pairs.size).toBeLessThan(1024)
  })
})
