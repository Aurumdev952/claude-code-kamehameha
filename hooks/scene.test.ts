import { describe, expect, test } from 'claude-code/testing'

import { DEATH, encode, paint, stageOf } from './scene'

const scene = (percent: number, extra: { deadFor?: number; t?: number } = {}) => ({
  columns: 60,
  rows: 16,
  percent,
  t: extra.t ?? 20,
  deadFor: extra.deadFor ?? 40,
})

/** Pixels in the band where GAME OVER is written that carry its blinking ink. */
const gameOverInk = (percent: number) => {
  const c = paint(scene(percent))
  let hits = 0
  for (let y = 2; y < 8; y++)
    for (let x = 0; x < c.w; x++) {
      const px = c.px[y * c.w + x]
      if (px === 0xff3b3b || px === 0xffd23f) hits++
    }
  return hits
}

/** How many rows of the beam column, midway between the fighters, are beam-white. */
const beamCore = (percent: number) => {
  const c = paint(scene(percent))
  let rows = 0
  for (let y = 0; y < c.h; y++) if (c.px[y * c.w + 26] === 0xffffff) rows++
  return rows
}

describe('the showdown', () => {
  test('the hero laughs, braces, strains and falls as context fills', () => {
    expect(stageOf(0)).toBe('laugh')
    expect(stageOf(30)).toBe('relaxed')
    expect(stageOf(60)).toBe('brace')
    expect(stageOf(80)).toBe('strain')
    expect(stageOf(92)).toBe('knee')
    expect(stageOf(DEATH)).toBe('dead')
    expect(stageOf(100)).toBe('dead')
  })

  test('the beam grows with the context window', () => {
    expect(beamCore(10)).toBeLessThan(beamCore(50))
    expect(beamCore(50)).toBeLessThan(beamCore(90))
  })

  test('GAME OVER is written in pixels only once the hero falls', () => {
    expect(gameOverInk(94)).toBe(0)
    expect(gameOverInk(DEATH)).toBeGreaterThan(20)
  })

  test('cells pack one half-block triplet per cell', () => {
    const cells = encode(paint(scene(50)))
    expect(cells.length).toBe(Math.ceil((60 * 16 * 12) / 3) * 4)
  })
})
