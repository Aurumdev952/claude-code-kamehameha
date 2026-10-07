import type { Canvas } from './canvas'
import { BEAM_RAMP, C, FIRE_RAMP, HEAL_RAMP, mix, SMOKE_RAMP } from './palette'
import type { Rng } from './rng'

export type Kind = 'spark' | 'debris' | 'mote' | 'dust' | 'smoke' | 'ember' | 'heal' | 'sweat'

export type Particle = {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds lived and seconds to live. */
  age: number
  life: number
  size: number
  /** For motes: the point they are pulled toward. */
  tx?: number
  ty?: number
}

const MAX = 420

const GRAVITY: Record<Kind, number> = {
  spark: 60,
  debris: -18,
  mote: 0,
  dust: -6,
  smoke: -10,
  ember: 22,
  heal: -14,
  sweat: 90,
}

const DRAG: Record<Kind, number> = {
  spark: 1.6,
  debris: 0.4,
  mote: 0,
  dust: 2.2,
  smoke: 1.2,
  ember: 0.8,
  heal: 1.5,
  sweat: 0.2,
}

export class Particles {
  readonly list: Particle[] = []

  add(p: Omit<Particle, 'age'>) {
    if (this.list.length >= MAX) this.list.shift()
    this.list.push({ ...p, age: 0 })
  }

  clear() {
    this.list.length = 0
  }

  update(dt: number) {
    for (const p of this.list) {
      p.age += dt
      if (p.kind === 'mote' && p.tx !== undefined && p.ty !== undefined) {
        // Spiral in toward the charge.
        const dx = p.tx - p.x
        const dy = p.ty - p.y
        const d = Math.max(1, Math.hypot(dx, dy))
        p.vx += ((dx / d) * 160 - (dy / d) * 40) * dt
        p.vy += ((dy / d) * 160 + (dx / d) * 40) * dt
        if (d < 2) p.age = p.life
      }
      p.vy += GRAVITY[p.kind] * dt
      const drag = Math.max(0, 1 - DRAG[p.kind] * dt)
      p.vx *= drag
      p.vy *= drag
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    let w = 0
    for (const p of this.list) if (p.age < p.life) this.list[w++] = p
    this.list.length = w
  }

  /** `back`: dust, smoke and debris behind the beam; `front`: the light. */
  draw(c: Canvas, ground: number, scale = 1, layer: 'back' | 'front' = 'front') {
    for (const p of this.list) {
      const isBack = p.kind === 'debris' || p.kind === 'dust' || p.kind === 'smoke'
      if (isBack !== (layer === 'back')) continue
      const t = p.age / p.life
      const x = p.x * scale
      const y = p.y * scale
      if (p.kind === 'smoke' || p.kind === 'dust') {
        const r = (p.size * (0.6 + t)) * scale
        const color = p.kind === 'smoke' ? SMOKE_RAMP[Math.min(2, Math.floor((1 - t) * 3))]! : C.soil3
        c.halo(x, y, r + 0.5, color, (1 - t) * (p.kind === 'smoke' ? 0.9 : 0.6))
        continue
      }
      if (p.kind === 'debris') {
        const color = t < 0.5 ? C.soil2 : C.soil1
        c.rect(x, y, p.size * scale, p.size * scale, color)
        c.set(x, y, C.soil3)
        continue
      }
      const ramp = p.kind === 'heal' ? HEAL_RAMP : p.kind === 'mote' ? BEAM_RAMP : p.kind === 'sweat' ? [0x5ab8ff, 0xbfe8ff] : FIRE_RAMP
      const color = ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((1 - t) * ramp.length)))]!
      if (y / scale > ground && p.kind !== 'ember') continue
      // A short streak along the velocity, so fast sparks read as motion.
      const len = p.kind === 'spark' ? Math.min(3, Math.hypot(p.vx, p.vy) / 40) : 0
      c.set(x, y, color)
      if (len > 0.5) {
        const n = Math.hypot(p.vx, p.vy)
        c.set(x - (p.vx / n) * len * scale, y - (p.vy / n) * len * scale, mix(color, C.fire1, 0.5))
      }
      if (scale > 1) c.rect(x, y, scale, scale, color)
    }
  }
}

// ── emitters ───────────────────────────────────────────────────────────────

export const emitSparks = (ps: Particles, rng: Rng, x: number, y: number, count: number, power: number) => {
  for (let i = 0; i < count; i++) {
    const a = Math.PI + rng.range(-1.2, 1.2)
    const speed = rng.range(30, 90) * (0.6 + power)
    ps.add({ kind: 'spark', x, y: y + rng.range(-2, 2), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 20, life: rng.range(0.25, 0.7), size: 1 })
  }
}

export const emitDebris = (ps: Particles, rng: Rng, x0: number, x1: number, ground: number) => {
  ps.add({ kind: 'debris', x: rng.range(x0, x1), y: ground - 1, vx: rng.range(-4, 4), vy: rng.range(-14, -4), life: rng.range(1.5, 3), size: rng.chance(0.3) ? 2 : 1 })
}

export const emitMote = (ps: Particles, rng: Rng, tx: number, ty: number) => {
  const a = rng.range(0, Math.PI * 2)
  const r = rng.range(8, 16)
  ps.add({ kind: 'mote', x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, vx: 0, vy: 0, life: 1.2, size: 1, tx, ty })
}

export const emitDust = (ps: Particles, rng: Rng, x: number, ground: number, dir: number) => {
  ps.add({ kind: 'dust', x: x + rng.range(-2, 2), y: ground - 1, vx: dir * rng.range(8, 24), vy: rng.range(-6, -1), life: rng.range(0.4, 0.9), size: rng.range(0.8, 1.6) })
}

export const emitSmoke = (ps: Particles, rng: Rng, x: number, y: number) => {
  ps.add({ kind: 'smoke', x: x + rng.range(-3, 3), y, vx: rng.range(-3, 3), vy: rng.range(-10, -4), life: rng.range(1.2, 2.4), size: rng.range(1, 2.2) })
}

export const emitEmbers = (ps: Particles, rng: Rng, w: number, count: number) => {
  for (let i = 0; i < count; i++)
    ps.add({ kind: 'ember', x: rng.range(0, w), y: rng.range(-4, 0), vx: rng.range(-6, 6), vy: rng.range(4, 14), life: rng.range(1.5, 3), size: 1 })
}

export const emitHeal = (ps: Particles, rng: Rng, x: number, y: number) => {
  const a = rng.range(0, Math.PI * 2)
  ps.add({ kind: 'heal', x: x + Math.cos(a) * rng.range(2, 9), y: y + Math.sin(a) * rng.range(1, 6), vx: 0, vy: rng.range(-12, -4), life: rng.range(0.5, 1.1), size: 1 })
}

export const emitSweat = (ps: Particles, rng: Rng, x: number, y: number) => {
  ps.add({ kind: 'sweat', x, y, vx: rng.range(4, 14), vy: rng.range(-14, -6), life: 0.6, size: 1 })
}
