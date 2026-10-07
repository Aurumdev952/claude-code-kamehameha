import { drawBeam, drawChargeBall, drawClash } from './beam'
import { Canvas } from './canvas'
import { CHARGE_TIME, DEATH, heroFace, OVER, phaseTime, poseBlend, power, RECOVER } from './director'
import type { Layout, World } from './director'
import { drawCentered, drawText, GLYPH_H, textWidth } from './font'
import { bayer, C, mix } from './palette'
import { noise1 } from './rng'
import { drawGround, drawMountains, drawSky, flashOver } from './scenery'
import type { Weather } from './scenery'
import { blit, blitAura, blitBlend, FIGHTER_SIZE, fighterHands, fighterSprite, HERO_SIZE, heroAnchors, heroDownSprite, heroSprite } from './sprites'
import type { Light } from './sprites'

export const MIN_W = 52
export const MIN_H = 34

/** Where everything stands for a world of `W` by `H` world pixels, at the current power. */
export const layout = (w: World, W: number, H: number): Layout => {
  const ground = H - Math.max(3, Math.round(H * 0.1))
  const p = power(w)
  const pulse = w.phase === 'fight' ? Math.abs(Math.sin(w.time * 9)) * p * 1.2 : 0
  const fighterX = 3 - pulse
  const surge = w.phase === 'over' && phaseTime(w) < OVER.whiteOut ? 3 : 0
  const heroX = W - HERO_SIZE.w - 9 + p * 6 + surge
  const fy = ground - FIGHTER_SIZE.h + 1
  const hy = ground - HERO_SIZE.h + 1
  const pose = w.phase === 'charge' ? 'charge' : 'fire'
  const [fhx, fhy] = fighterHands(pose)
  const { hands } = heroAnchors(w.pose)
  return {
    W,
    H,
    ground,
    fighterX,
    heroX,
    from: [fighterX + fhx, fy + fhy],
    to: [heroX + hands[0] - 1, hy + hands[1]],
  }
}

const beamRadius = (w: World, H: number) => {
  const maxR = Math.max(3, Math.min(10, H * 0.12))
  let r = 0.8 + Math.pow(power(w), 1.25) * maxR
  if (w.phase === 'over') r *= 1 + Math.min(1, phaseTime(w) / OVER.surge) * 0.9
  return r
}

const shake = (w: World) => {
  // Only impacts shake the camera: a constant shake would repaint every
  // terminal cell every frame. The hero's tremble carries the strain instead.
  const k = w.trauma * w.trauma
  const amp = k * 2.2
  return {
    x: Math.round((noise1(w.time * 23, 41) - 0.5) * 2 * amp),
    y: Math.round((noise1(w.time * 19, 42) - 0.5) * 2 * amp * 0.6),
  }
}

/** Moves the picture by whole canvas pixels; the uncovered edge goes dark. */
const offset = (c: Canvas, dx: number, dy: number) => {
  if (dx === 0 && dy === 0) return
  const src = c.px.slice()
  c.px.fill(C.ink)
  for (let y = Math.max(0, dy); y < Math.min(c.h, c.h + dy); y++) {
    const from = (y - dy) * c.w
    const x0 = Math.max(0, dx)
    const x1 = Math.min(c.w, c.w + dx)
    c.px.set(src.subarray(from + x0 - dx, from + x1 - dx), y * c.w + x0)
  }
}

/** The darkened corners, as the pixel indices they touch: computed once per size. */
let vignetteCache: { w: number; h: number; at: Uint32Array } | undefined

const vignette = (c: Canvas) => {
  if (vignetteCache?.w !== c.w || vignetteCache.h !== c.h) {
    const at: number[] = []
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const dx = (x / c.w - 0.5) * 2
        const dy = (y / c.h - 0.5) * 2
        const d = dx * dx * 0.6 + dy * dy * 0.4
        if (d > 0.55 && Math.min(0.45, (d - 0.55) * 0.9) > bayer(x, y)) at.push(y * c.w + x)
      }
    vignetteCache = { w: c.w, h: c.h, at: Uint32Array.from(at) }
  }
  for (const i of vignetteCache.at) c.px[i] = mix(c.px[i]!, C.ink, 0.45)
}

/**
 * Sky, mountains and ground change slowly: they are drawn four times a second
 * at most, or when the light on them changes, and copied in between.
 */
let backdrop: { key: string; t: number; px: Uint32Array } | undefined

const background = (c: Canvas, ground: number, weather: Weather, beamX0: number, beamX1: number) => {
  const key = [c.w, c.h, weather.scale, ground, Math.round(weather.storm * 10), Math.round(weather.power * 10), Math.round(weather.cracks * 10), weather.crater, Math.round(weather.heroX / 2), Math.round(beamX0 / 2), Math.round(beamX1 / 2)].join('|')
  if (backdrop !== undefined && backdrop.key === key && weather.t >= backdrop.t && weather.t - backdrop.t < 0.25) {
    c.px.set(backdrop.px)
    return
  }
  drawSky(c, ground, weather)
  drawMountains(c, ground, weather)
  drawGround(c, ground, weather, beamX0, beamX1)
  backdrop = { key, t: weather.t, px: c.px.slice() }
}

const drawScarf = (c: Canvas, x: number, y: number, p: number, t: number, s: number) => {
  const len = 6 + p * 8
  const amp = 0.5 + p * 1.6
  for (let i = 0; i < len; i++) {
    const wx = x + i * 0.9
    const wy = y + Math.sin(t * (6 + p * 8) - i * 0.7) * amp * (i / len) + i * 0.08
    const color = i < len * 0.5 ? 0xd8283c : 0xa01830
    c.rect(wx * s, wy * s, s, s * (i < len * 0.4 ? 2 : 1), color)
    c.set(wx * s, (wy - 0.5) * s, C.ink)
  }
}

const drawCallouts = (c: Canvas, w: World, L: Layout, s: number) => {
  for (const call of w.callouts) {
    const age = w.time - call.at
    const pop = Math.min(1, age / 0.12)
    const fade = age > call.dur - 0.15 && Math.floor(age * 20) % 2 === 0
    if (fade) continue
    const scale = (textWidth(call.text, call.scale * s) <= c.w - 4 * s ? call.scale : 1) * s
    const lift = Math.round((1 - pop) * 4 + age * 3) * s
    const cx = call.anchor === 'hero' ? (L.heroX + HERO_SIZE.w / 2 - 2) * s : call.anchor === 'fighter' ? (L.fighterX + 10) * s : (c.w / 2)
    const top = call.anchor === 'center' ? Math.round(c.h * 0.22) : Math.round((L.ground - HERO_SIZE.h - GLYPH_H * call.scale - 3) * s)
    const half = textWidth(call.text, scale) / 2
    const x = Math.max(half + s, Math.min(c.w - half - s, cx))
    drawCentered(c, call.text, x, Math.max(s, top - lift), { color: call.color, outline: C.ink, scale })
  }
}

const drawTitles = (c: Canvas, w: World, s: number) => {
  const t = phaseTime(w)
  if (t < OVER.title) return
  const big = c.w >= textWidth('GAME OVER', 2 * s) + 6 * s && c.h >= 50 * s ? 2 : 1
  const scale = big * s
  const shown = Math.floor((t - OVER.title) * 12)
  const blink = shown > 9 && Math.floor(t * 3) % 2 === 0
  const roomy = c.h >= 56 * s
  const top = roomy ? Math.round(c.h * 0.12) : 3 * s
  const gap = roomy ? 4 : 2
  drawCentered(c, 'GAME OVER', c.w / 2, top, {
    color: C.red,
    outline: C.ink,
    shadow: C.storm0,
    scale,
    shown,
    lift: i => -Math.round(Math.max(0, 1 - (t - OVER.title - i / 12) / 0.25) * 8 * s),
    ink: i => (blink ? (i % 2 ? C.gold : C.red) : C.red),
  })
  let y = top + (GLYPH_H + gap) * scale
  if (t >= OVER.please) {
    const lines = textWidth('PLEASE /COMPACT', s) <= c.w - 4 * s ? ['PLEASE /COMPACT'] : ['PLEASE', '/COMPACT']
    for (const line of lines) {
      drawCentered(c, line, c.w / 2, y, { color: C.cyan, outline: C.ink, scale: s, shown: Math.floor((t - OVER.please) * 20) })
      y += (GLYPH_H + gap) * s
    }
  }
  if (t >= OVER.countdown) {
    const left = 9 - Math.floor(t - OVER.countdown)
    const text = left >= 0 ? `CONTINUE? ${left}` : 'INSERT /COMPACT'
    if (left >= 0 || Math.floor(t * 2) % 2 === 0) drawCentered(c, text, c.w / 2, y + s, { color: C.gold, outline: C.ink, scale: s })
  }
}

/** The gauge drawn into the picture itself, for the pixel renderer. */
export type Hud = { percent: number; label: string }

/** World pixels the in-picture gauge takes at the bottom. */
export const HUD_H = 9

const drawHud = (c: Canvas, hud: Hud, top: number, s: number) => {
  c.rect(0, top, c.w, c.h - top, 0x10131f)
  const label = hud.label.toUpperCase()
  // The label at finer pixels than the scene, so the bar keeps the room.
  const ls = Math.max(1, s - 1)
  const labelW = textWidth(label, ls)
  const x0 = 3 * s
  const x1 = Math.max(x0 + 8 * s, c.w - labelW - 6 * s)
  const y = top + 3 * s
  const full = Math.round(((x1 - x0) * Math.min(100, Math.max(0, hud.percent))) / 100)
  for (let x = x0; x < x1; x++) {
    const at = (x - x0) / (x1 - x0)
    const ink = x - x0 >= full ? 0x2a2f45 : at < 0.5 ? 0x3ccaff : at < 0.75 ? C.gold : C.red
    c.rect(x, y, 1, 3 * s, ink)
  }
  drawText(c, label, x1 + 3 * s, Math.round(top + (HUD_H * s - GLYPH_H * ls) / 2), { color: hud.percent >= DEATH ? C.red : 0xc8d0e8, scale: ls })
}

/**
 * Draws the world at `W` by `H` world pixels, `scale` canvas pixels each:
 * 1 for terminal cells, 2 or more for a real-pixel image. With `hud`, the
 * bottom HUD_H rows hold the gauge instead of the scene.
 */
export const paint = (w: World, W: number, H: number, scale = 1, hud?: Hud): Canvas => {
  if (hud === undefined) return paintScene(w, W, H, scale)
  const scene = paintScene(w, W, H - HUD_H, scale)
  const c = new Canvas(W * scale, H * scale)
  c.px.set(scene.px)
  drawHud(c, hud, (H - HUD_H) * scale, scale)
  return c
}

const paintScene = (w: World, W: number, H: number, scale: number): Canvas => {
  const s = scale
  const c = new Canvas(W * s, H * s)
  const L = layout(w, W, H)
  const p = power(w)
  const t = w.time
  const phase = w.phase
  const ot = phaseTime(w)
  const aftermath = phase === 'over' && ot >= OVER.whiteOut
  const heroDown = aftermath || (phase === 'recover' && ot < RECOVER.knee)
  const beamOn = phase === 'fight' || (phase === 'over' && ot < OVER.whiteOut)

  const weather: Weather = {
    power: beamOn ? p : 0,
    storm: aftermath || heroDown ? 1 : Math.max(0, Math.min(1, (w.shown - 45) / 45)),
    flash: w.flash,
    t,
    scale: s,
    heroX: L.heroX + HERO_SIZE.w / 2,
    cracks: aftermath || heroDown ? 1 : Math.max(0, (p - 0.5) / 0.45),
    crater: heroDown,
    camX: 0,
  }
  background(c, L.ground, weather, beamOn ? Math.round(L.from[0]) : 0, beamOn ? Math.round(L.to[0]) : 0)

  // Shockwave after the blast.
  if (phase === 'over' && ot >= OVER.whiteOut && ot < OVER.whiteOut + 1.2) {
    const k = (ot - OVER.whiteOut) / 1.2
    c.ring(weather.heroX * s, (L.ground - 6) * s, k * W * 0.9 * s, (3 - k * 2) * s, C.fire4, 1 - k)
  }

  w.particles.draw(c, L.ground, s, 'back')

  // The fighter.
  const fighterPose = phase === 'charge' || !beamOn ? 'charge' : 'fire'
  const fLight: Light = { from: 'right', color: C.beam3, k: phase === 'charge' ? Math.min(1, ot / CHARGE_TIME) * 0.6 : beamOn ? 0.2 + p * 0.5 : 0.1 }
  const fy = L.ground - FIGHTER_SIZE.h + 1
  blit(c, fighterSprite(fighterPose, beamOn || (phase === 'charge' && ot > CHARGE_TIME - 0.5), fLight), L.fighterX * s, fy * s, s)

  // The hero.
  const hy = L.ground - HERO_SIZE.h + 1
  const hLight: Light = { from: 'left', color: C.beam3, k: beamOn ? 0.15 + p * 0.75 : 0.1 }
  if (heroDown) {
    const down = heroDownSprite({ ...hLight, k: 0.1 })
    blit(c, down, (L.heroX - 2) * s, (L.ground - down.h + 2) * s, s)
  } else {
    const { neck } = heroAnchors(w.pose)
    drawScarf(c, L.heroX + neck[0], hy + neck[1], beamOn ? p : 0.15, t, s)
    const look = heroFace(w)
    const now = heroSprite({ pose: w.pose, face: look.face, headLift: look.lift }, hLight)
    const before = heroSprite({ pose: w.prevPose, face: look.face, headLift: 0 }, hLight)
    const tremble = w.stage === 'strain' || w.stage === 'knee' ? Math.round((noise1(t * 40, 3) - 0.5) * 1.6) : 0
    if (beamOn && p > 0.45) blitAura(c, now, (L.heroX + tremble) * s, hy * s, C.fire3, 0.35 + 0.25 * Math.sin(t * 28), s)
    if (phase === 'recover') blitAura(c, now, L.heroX * s, hy * s, C.heal1, 0.6, s)
    blitBlend(c, before, now, poseBlend(w), (L.heroX + tremble) * s, hy * s, s)
  }

  // The beam, its charge and the clash.
  const r = beamRadius(w, H)
  if (beamOn) {
    drawBeam(c, { x0: L.from[0], y0: L.from[1], x1: L.to[0], y1: L.to[1], r, power: p, t, scale: s })
    drawChargeBall(c, L.from[0], L.from[1], 1.5 + r * 0.55, t, s)
    drawClash(c, L.to[0], L.to[1], r, p, t, s)
  } else if (phase === 'charge') {
    drawChargeBall(c, L.from[0], L.from[1], Math.min(1, ot / CHARGE_TIME) * 3.5, t, s)
  }

  w.particles.draw(c, L.ground, s, 'front')

  // The senzu bean falls on the fallen hero.
  if (phase === 'recover' && ot < RECOVER.bean) {
    const by = (L.ground - 3) * (ot / RECOVER.bean) ** 2
    c.disc((weather.heroX + 1) * s, by * s, 1.4 * s, [C.heal2, C.heal1, C.heal0])
  }
  if (phase === 'recover' && ot >= RECOVER.bean && ot < RECOVER.stand + 0.5) {
    const k = (ot - RECOVER.bean) / (RECOVER.stand + 0.5 - RECOVER.bean)
    c.ring(weather.heroX * s, (L.ground - 10) * s, (4 + k * 22) * s, 2 * s, C.heal2, 1 - k)
  }

  drawCallouts(c, w, L, s)
  if (aftermath) drawTitles(c, w, s)

  vignette(c)
  const sh = shake(w)
  offset(c, sh.x * s, sh.y * s)
  flashOver(c, w.flash, phase === 'recover' ? C.heal2 : C.white)
  return c
}

// ── encoders ───────────────────────────────────────────────────────────────

const B64 = new TextEncoder().encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')
const PAD = 61
const ascii = new TextDecoder()

const base64js = (bytes: Uint8Array): string => {
  const n = bytes.length
  const out = new Uint8Array(Math.ceil(n / 3) * 4)
  let o = 0
  let i = 0
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out[o++] = B64[(v >> 18) & 63]!
    out[o++] = B64[(v >> 12) & 63]!
    out[o++] = B64[(v >> 6) & 63]!
    out[o++] = B64[v & 63]!
  }
  if (i < n) {
    const a = bytes[i]!
    const b = i + 1 < n ? bytes[i + 1]! : 0
    const v = (a << 16) | (b << 8)
    out[o++] = B64[(v >> 18) & 63]!
    out[o++] = B64[(v >> 12) & 63]!
    out[o++] = i + 1 < n ? B64[(v >> 6) & 63]! : PAD
    out[o++] = PAD
  }
  return ascii.decode(out)
}

type Native = Uint8Array & { toBase64?: () => string }

/** Base64 of `bytes`: the runtime's own encoder where it has one. */
export const base64 = (bytes: Uint8Array): string => {
  const native = (bytes as Native).toBase64
  return typeof native === 'function' ? native.call(bytes) : base64js(bytes)
}

const HALF_BLOCK = 0x2580

/** A Raster's `cells`: '▀' per cell, the upper pixel as foreground, the lower as background. */
export const encodeCells = (c: Canvas): string => {
  const rows = c.h >> 1
  const view = new DataView(new ArrayBuffer(c.w * rows * 12))
  let at = 0
  for (let r = 0; r < rows; r++)
    for (let x = 0; x < c.w; x++) {
      view.setUint32(at, HALF_BLOCK, true)
      view.setUint32(at + 4, c.px[2 * r * c.w + x]!, true)
      view.setUint32(at + 8, c.px[(2 * r + 1) * c.w + x]!, true)
      at += 12
    }
  return base64(new Uint8Array(view.buffer))
}

/** An Image's `rgba` source. */
export const encodeRgba = (c: Canvas): string => {
  const bytes = new Uint8Array(c.w * c.h * 4)
  for (let i = 0; i < c.px.length; i++) {
    const v = c.px[i]!
    bytes[i * 4] = (v >> 16) & 0xff
    bytes[i * 4 + 1] = (v >> 8) & 0xff
    bytes[i * 4 + 2] = v & 0xff
    bytes[i * 4 + 3] = 0xff
  }
  return base64(bytes)
}

export { DEATH }
