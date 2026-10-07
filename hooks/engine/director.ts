import { C } from './palette'
import { emitDebris, emitDust, emitEmbers, emitHeal, emitMote, emitSmoke, emitSparks, emitSweat, Particles } from './particles'
import { Rng } from './rng'
import type { Face, HeroPose } from './sprites'

// The fight as a simulation over real time. `update` advances it by the
// seconds since the last frame; `paint` (render.ts) draws whatever it holds.
// Nothing here knows about terminals, so tests and the recorder drive it too.

export type Stage = 'laugh' | 'relaxed' | 'brace' | 'strain' | 'knee' | 'dead'
export const DEATH = 95
export const STAGES: readonly Stage[] = ['laugh', 'relaxed', 'brace', 'strain', 'knee', 'dead']

export const stageOf = (percent: number): Stage =>
  percent >= DEATH ? 'dead' : percent >= 90 ? 'knee' : percent >= 75 ? 'strain' : percent >= 50 ? 'brace' : percent >= 25 ? 'relaxed' : 'laugh'

export const CAPTIONS: Record<Stage, string> = {
  laugh: '"HA HA HA! Is that all you\'ve got?"',
  relaxed: '"Meh. Barely warm."',
  brace: '"Ngh... okay, that\'s getting strong!"',
  strain: '"AAARGH! Can\'t... hold... much longer!"',
  knee: '"/compact... NOW...!"',
  dead: 'GAME OVER. Please /compact',
}

const SHOUTS: Partial<Record<Stage, string>> = {
  relaxed: 'HMPH.',
  brace: 'NGH!',
  strain: 'AAARGH!',
  knee: 'NOOO!',
}

export type Phase = 'charge' | 'fight' | 'over' | 'recover'

/** Something worth a sound, a toast or a status line. */
export type Event = 'charge' | 'fire' | 'stage-up' | 'gameover' | 'boom' | 'heal' | 'over9000'

export type Callout = {
  text: string
  at: number
  dur: number
  color: number
  anchor: 'hero' | 'fighter' | 'center'
  scale: number
}

export type World = {
  /** Simulation seconds: frozen by hit-stop, slowed in slow-motion. */
  time: number
  phase: Phase
  phaseAt: number
  /** The real context percent, and the one on screen (a spring chasing it). */
  target: number
  shown: number
  vel: number
  tokens?: number
  stage: Stage
  pose: HeroPose
  prevPose: HeroPose
  poseAt: number
  trauma: number
  hitStop: number
  flash: number
  slow: number
  particles: Particles
  rng: Rng
  callouts: Callout[]
  over9000: boolean
  nextLaugh: number
  /** Fractional spawns carried between frames, per emitter. */
  carry: Record<string, number>
  /** Raised by `update`, kept until `drain` takes them. */
  events: Event[]
}

export const POSE_OF: Record<Exclude<Stage, 'dead'>, HeroPose> = {
  laugh: 'laugh',
  relaxed: 'smug',
  brace: 'brace',
  strain: 'strain',
  knee: 'knee',
}

export const CHARGE_TIME = 2.4
const POSE_BLEND = 0.18

export const createWorld = (opts: { seed?: number; percent?: number; charge?: boolean } = {}): World => {
  const percent = opts.percent ?? 0
  const stage = stageOf(Math.min(percent, DEATH - 0.01))
  const pose = POSE_OF[stage === 'dead' ? 'knee' : stage]
  const charge = opts.charge ?? true
  return {
    time: 0,
    phase: charge ? 'charge' : 'fight',
    phaseAt: 0,
    target: percent,
    shown: charge ? 0 : percent,
    vel: 0,
    stage: charge ? 'laugh' : stage,
    pose: charge ? 'laugh' : pose,
    prevPose: charge ? 'laugh' : pose,
    poseAt: -1,
    trauma: 0,
    hitStop: 0,
    flash: 0,
    slow: 1,
    particles: new Particles(),
    rng: new Rng(opts.seed ?? 7),
    callouts: [],
    over9000: false,
    nextLaugh: 0.6,
    carry: {},
    events: charge ? ['charge'] : [],
  }
}

export const setTarget = (w: World, percent: number, tokens?: number) => {
  w.target = Math.max(0, Math.min(100, percent))
  if (tokens !== undefined) w.tokens = tokens
}

/** The scene's fixed points, in world pixels, for a world of `W` by `H`. */
export type Layout = {
  W: number
  H: number
  ground: number
  fighterX: number
  heroX: number
  /** The fighter's hands and the hero's, where the beam starts and ends. */
  from: [number, number]
  to: [number, number]
}

export const power = (w: World) => Math.max(0, Math.min(1, w.shown / DEATH))

const say = (w: World, text: string, anchor: Callout['anchor'], color: number, dur = 1.1, scale = 1) => {
  w.callouts.push({ text, at: w.time, dur, color, anchor, scale })
}

const kick = (w: World, trauma: number, hitStop: number, flash: number) => {
  w.trauma = Math.min(1, w.trauma + trauma)
  w.hitStop = Math.max(w.hitStop, hitStop)
  w.flash = Math.max(w.flash, flash)
}

const setPose = (w: World, pose: HeroPose) => {
  if (pose === w.pose) return
  w.prevPose = w.pose
  w.pose = pose
  w.poseAt = w.time
}

/** How far the new pose has dissolved in, 0..1. */
export const poseBlend = (w: World) => Math.min(1, (w.time - w.poseAt) / POSE_BLEND)

/** Calls `spawn` `rate` times a second on average, smoothly across frames. */
const every = (w: World, key: string, rate: number, dt: number, spawn: () => void) => {
  let n = (w.carry[key] ?? 0) + rate * dt
  while (n >= 1) {
    spawn()
    n -= 1
  }
  w.carry[key] = n
}

export const phaseTime = (w: World) => w.time - w.phaseAt

const enter = (w: World, phase: Phase) => {
  w.phase = phase
  w.phaseAt = w.time
}

/** The events raised since the last call, taken off the world. */
export const drain = (w: World): Event[] => {
  const events = w.events
  w.events = []
  return events
}

export const update = (w: World, dtReal: number, L: Layout) => {
  const dt = Math.min(0.1, Math.max(0, dtReal))
  w.flash = Math.max(0, w.flash - dt * 2.2)
  w.trauma = Math.max(0, w.trauma - dt * 1.1)
  if (w.hitStop > 0) {
    w.hitStop -= dt
    return
  }
  const sdt = dt * w.slow
  w.time += sdt
  w.callouts = w.callouts.filter(c => w.time - c.at < c.dur)

  if (w.phase === 'charge') charge(w, sdt, L)
  else if (w.phase === 'fight') fight(w, sdt, L)
  else if (w.phase === 'over') over(w, sdt, L)
  else recover(w, sdt, L)

  w.particles.update(sdt)
}

const charge = (w: World, dt: number, L: Layout) => {
  const t = phaseTime(w)
  w.shown = 0
  w.vel = 0
  const words = ['KA...', 'ME...', 'HA...', 'ME...']
  words.forEach((word, i) => {
    const at = 0.1 + i * 0.45
    if (t >= at && t - dt < at) say(w, word, 'fighter', C.cyan, 0.7)
  })
  every(w, 'mote', 40, dt, () => emitMote(w.particles, w.rng, L.from[0], L.from[1]))
  setPose(w, 'laugh')
  if (t >= CHARGE_TIME) {
    say(w, 'HAAAA!!', 'fighter', C.white, 0.9, 2)
    kick(w, 0.7, 0.12, 0.7)
    w.events.push('fire')
    w.nextLaugh = w.time + 1.4
    w.shown = Math.min(w.target, 8)
    enter(w, 'fight')
  }
}

const fight = (w: World, dt: number, L: Layout) => {
  // A slightly underdamped spring: the beam surges past the new size and settles.
  const k = 22
  const damping = 2 * Math.sqrt(k) * 0.55
  w.vel += (k * (w.target - w.shown) - damping * w.vel) * dt
  w.shown = Math.max(0, Math.min(100, w.shown + w.vel * dt))

  const isDead = w.shown >= DEATH && w.target >= DEATH
  const next = isDead ? 'dead' : stageOf(Math.min(w.shown, DEATH - 0.01))
  const rank = (s: Stage) => STAGES.indexOf(s)
  if (next !== w.stage) {
    if (rank(next) > rank(w.stage) && next !== 'dead') {
      kick(w, 0.45, 0.08, 0.18)
      const shout = SHOUTS[next]
      if (shout !== undefined) say(w, shout, 'hero', next === 'relaxed' ? C.cyan : C.gold, 1.1)
      emitSparks(w.particles, w.rng, L.to[0], L.to[1], 18, power(w))
      w.events.push('stage-up')
    }
    w.stage = next
  }
  if (next === 'dead') {
    w.events.push('gameover')
    kick(w, 1, 0.15, 0.5)
    enter(w, 'over')
    return
  }
  setPose(w, POSE_OF[next])

  if ((w.tokens ?? 0) >= 90_000 && !w.over9000) {
    w.over9000 = true
    say(w, "IT'S OVER 9000!!", 'center', C.red, 2.4, 2)
    kick(w, 0.3, 0.1, 0.15)
    w.events.push('over9000')
  }

  if (w.stage === 'laugh' && w.time >= w.nextLaugh) {
    say(w, 'HA HA!', 'hero', C.gold, 0.9)
    w.nextLaugh = w.time + 2.4
  }

  const p = power(w)
  every(w, 'spark', 6 + p * 70, dt, () => emitSparks(w.particles, w.rng, L.to[0], L.to[1], 1, p))
  if (p > 0.5) every(w, 'debris', (p - 0.5) * 34, dt, () => emitDebris(w.particles, w.rng, L.heroX - 26, L.heroX + 10, L.ground))
  if (p > 0.4) every(w, 'dust', p * 14, dt, () => emitDust(w.particles, w.rng, L.heroX + 6, L.ground, 1))
  if (p > 0.5) every(w, 'sweat', 1.5 + p * 2, dt, () => emitSweat(w.particles, w.rng, L.heroX + 10, L.ground - 22 * (w.pose === 'knee' ? 0.7 : 1)))
  if (p > 0.75) every(w, 'ember', (p - 0.75) * 30, dt, () => emitEmbers(w.particles, w.rng, L.W, 1))
}

/** The game-over cinematic, in seconds since the hero fell. */
export const OVER = {
  surge: 0.9,
  whiteOut: 1.4,
  title: 2.2,
  please: 3.1,
  countdown: 4.0,
} as const

const over = (w: World, dt: number, L: Layout) => {
  const t = phaseTime(w)
  w.shown = Math.max(w.shown, 100)
  if (t < OVER.surge) {
    w.slow = 0.4
    w.trauma = 1
    every(w, 'spark', 160, dt, () => emitSparks(w.particles, w.rng, L.to[0], L.to[1], 1, 1))
  } else if (t < OVER.whiteOut) {
    if (w.slow !== 1) {
      w.events.push('boom')
      w.particles.clear()
    }
    w.slow = 1
    w.flash = 1
    w.trauma = 1
  } else {
    w.slow = 1
    every(w, 'smoke', 7, dt, () => emitSmoke(w.particles, w.rng, L.heroX + 9, L.ground - 2))
    every(w, 'ember', 6, dt, () => emitEmbers(w.particles, w.rng, L.W, 1))
  }
  if (w.target < DEATH) {
    w.events.push('heal')
    w.slow = 1
    enter(w, 'recover')
  }
}

/** The recovery after /compact, in seconds. */
export const RECOVER = {
  bean: 0.9,
  knee: 1.25,
  stand: 1.6,
  done: 3.0,
} as const

const recover = (w: World, dt: number, L: Layout) => {
  const t = phaseTime(w)
  if (t < RECOVER.bean) {
    every(w, 'heal', 30, dt, () => emitHeal(w.particles, w.rng, L.heroX + 10, (L.ground - 4) * (t / RECOVER.bean)))
  } else {
    if (t - dt < RECOVER.bean) {
      kick(w, 0.2, 0.06, 0.6)
      say(w, 'SENZU BEAN!', 'center', C.cyan, 1.3, 1)
    }
    if (t < RECOVER.stand + 0.4) every(w, 'heal', 50, dt, () => emitHeal(w.particles, w.rng, L.heroX + 10, L.ground - 10))
  }
  if (t >= RECOVER.knee) setPose(w, t >= RECOVER.stand ? 'laugh' : 'knee')
  if (t >= RECOVER.stand && t - dt < RECOVER.stand) {
    w.shown = w.target
    w.vel = 0
    w.stage = stageOf(w.target)
    say(w, 'FULLY HEALED! HA HA!', 'hero', C.gold, 1.4)
  }
  if (t >= RECOVER.done) {
    w.events.push('charge')
    enter(w, 'charge')
  }
}

/** The hero's face for this moment. */
export const heroFace = (w: World): { face: Face; lift: number } => {
  const t = w.time
  if (w.phase === 'charge') return { face: 'smug', lift: 0 }
  if (w.phase === 'recover') return { face: phaseTime(w) > RECOVER.stand ? 'laugh' : 'pain', lift: 0 }
  switch (w.stage) {
    case 'laugh':
      return { face: 'laugh', lift: Math.floor(t * 7) % 2 }
    case 'relaxed':
      return { face: 'smug', lift: Math.floor(t * 1.5) % 2 }
    case 'brace':
      return { face: 'grit', lift: 0 }
    case 'strain':
      return { face: Math.floor(t * 3) % 2 === 0 ? 'grit' : 'pain', lift: 0 }
    default:
      return { face: 'pain', lift: 0 }
  }
}
