import type { EngineInterface, PluginOptions, Register, SessionContextUsage, Timer } from 'claude-code'

import { CAPTIONS, createWorld, DEATH, drain, setTarget, stageOf, update } from './engine/director'
import type { Event, World } from './engine/director'
import { encodeCells, encodeRgba, HUD_H, layout, paint } from './engine/render'

const PANE = 'kamehameha'
const TITLE = 'Kamehameha'
const KEY = 'scene'

type Renderer = 'cells' | 'pixels'
type Settings = { renderer: 'auto' | Renderer; fps: number; sound: boolean }

/** `/kamehameha demo`: the whole fight in about half a minute, by real seconds. */
const DEMO = { charge: 2.8, rise: 16, hold: 25, end: 31 } as const

const SOUNDS: Partial<Record<Event, string>> = {
  charge: 'sounds/charge.wav',
  fire: 'sounds/fire.wav',
  'stage-up': 'sounds/hit.wav',
  boom: 'sounds/boom.wav',
  heal: 'sounds/heal.wav',
  over9000: 'sounds/scouter.wav',
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const kilo = (n: number | undefined) =>
  n === undefined ? '0' : n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const readSettings = (options: PluginOptions): Settings => {
  const renderer = options.renderer
  const fps = options.fps
  return {
    renderer: renderer === 'cells' || renderer === 'pixels' ? renderer : 'auto',
    fps: typeof fps === 'number' && fps > 0 ? clamp(Math.round(fps), 10, 60) : 60,
    sound: options.sound === true,
  }
}

let settings: Settings = { renderer: 'auto', fps: 60, sound: false }
let detected: Renderer = 'cells'
let override: Renderer | undefined
let world: World = createWorld()
let live = 0
let tokens: number | undefined
let windowSize: number | undefined
let pinned: number | undefined
let demoAt: number | undefined
let now = 0
let last = 0
let busy = false
let timer: Timer | undefined
let mounted: { renderer: Renderer; W: number; H: number } | undefined
/** The world height the fight runs in: the pixel picture gives HUD_H rows to its gauge. */
const sceneHeight = (site: { renderer: Renderer; H: number }) => (site.renderer === 'pixels' ? site.H - HUD_H : site.H)
const hud = () => ({ percent: percent(), label: labelFor() })
/** When the pane was last redrawn whole, so refusals and first mounts redraw once. */
let settledAt = 0
/**
 * The picture's key. A redraw under a new key mounts a new picture instead of
 * swapping the old one's source, which a terminal may have dropped.
 */
let generation = 0
const pictureKey = () => `${KEY}-${generation}`
let label = ''
/** Real times of recent blits and how long each frame took to draw, for /kamehameha stats. */
const frameTimes: number[] = []
const drawTimes: number[] = []
let refused = 0
let lastRefusal = ''
let shownStage = ''

const renderer = (): Renderer => override ?? (settings.renderer === 'auto' ? detected : settings.renderer)

/**
 * Frames per second actually aimed for. A streamed image is replaced whole
 * each frame, and kitty shows the gap between two as a blank flash past about
 * 30 a second (measured: 60 fps blanked 13% of the time, 30 fps never).
 */
const PIXELS_MAX_FPS = 30
const targetFps = () => (renderer() === 'pixels' ? Math.min(settings.fps, PIXELS_MAX_FPS) : settings.fps)

/**
 * Pixels per world pixel in an Image: 3 for smooth glow, dropping to 2 when
 * this machine cannot draw that in time for the frame rate.
 */
let pixelScale = 3
let drawCost = 0

const adapt = (ms: number) => {
  drawCost = drawCost === 0 ? ms : drawCost * 0.9 + ms * 0.1
  if (pixelScale > 2 && drawCost > (1000 / targetFps()) * 0.6) {
    pixelScale = 2
    drawCost = 0
  }
}

const demoPercent = () => {
  const t = (now - (demoAt ?? now)) / 1000
  if (t < DEMO.charge) return 4
  if (t < DEMO.rise) return 4 + ((t - DEMO.charge) / (DEMO.rise - DEMO.charge)) * 96
  if (t < DEMO.hold) return 100
  return 22
}

const percent = () => (demoAt !== undefined ? demoPercent() : (pinned ?? live))

const take = (context: SessionContextUsage) => {
  tokens = context.tokens
  windowSize = context.window
  live =
    context.percent ??
    (context.tokens !== undefined && context.window > 0 ? Math.round((context.tokens / context.window) * 100) : 0)
}

const isReal = () => demoAt === undefined && pinned === undefined

const labelFor = () => {
  const p = Math.round(percent())
  if (demoAt !== undefined) return `demo ${p}%`
  if (pinned !== undefined) return `preview ${p}%`
  return `${p}%  ${kilo(tokens)} / ${kilo(windowSize)}`
}

const captionFor = (): { text: string; color: string } => {
  if (world.phase === 'charge') return { text: '"Ka... me... ha... me..."', color: 'cyan' }
  if (world.phase === 'over') return { text: '💀 GAME OVER. Please /compact', color: 'red' }
  if (world.phase === 'recover') return { text: '🫘 Senzu bean! "Fully healed. HA HA!"', color: 'green' }
  const stage = world.stage
  const color = stage === 'knee' ? 'red' : stage === 'strain' || stage === 'brace' ? 'yellow' : 'cyan'
  return { text: CAPTIONS[stage], color }
}

/** Toasts, status line and sounds for what the fight just did. */
function react($: EngineInterface, events: readonly Event[]) {
  for (const event of events) {
    if (settings.sound) {
      const asset = SOUNDS[event]
      if (asset !== undefined) void $.audio.play({ asset }, { gain: 0.7 }).catch(() => undefined)
    }
    if (!isReal()) continue
    if (event === 'gameover') $.ui.toast(`💀 GAME OVER: context at ${Math.round(percent())}%. Please /compact`)
    if (event === 'heal') $.ui.toast('🫘 Senzu bean! The hero is back up. Context compacted.')
    if (event === 'over9000') $.ui.toast("📟 Power level: IT'S OVER 9000!")
  }

  // The pixel picture carries its own gauge: redrawing its tree would place
  // the image again, which kitty shows as a blank flash, so only the cell
  // renderer's caption and gauge redraw.
  const streaming = mounted?.renderer === 'pixels'
  const stage = world.phase === 'over' ? 'dead' : world.stage
  if (stage !== shownStage) {
    shownStage = stage
    const p = Math.round(percent())
    $.ui.status(stage === 'dead' ? '💀 GAME OVER · /compact' : stage === 'knee' || stage === 'strain' ? `⚡ context ${p}%` : undefined)
    if (!streaming) $.ui.invalidate('ui.render')
  }
  const next = `${labelFor()}|${world.phase}`
  if (next !== label) {
    label = next
    if (!streaming) $.ui.invalidate('ui.render')
  }
}

async function tick($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    now = Date.now()
    const dt = last === 0 ? 0 : (now - last) / 1000
    last = now
    if (demoAt !== undefined && (now - demoAt) / 1000 > DEMO.end) demoAt = undefined

    const W = mounted?.W ?? 72
    const H = mounted === undefined ? 40 : sceneHeight(mounted)
    setTarget(world, percent(), tokens)
    update(world, dt, layout(world, W, H))
    react($, drain(world))

    if (mounted === undefined) return
    const site = mounted
    const t0 = Date.now()
    const picture = site.renderer === 'pixels' ? paint(world, site.W, site.H, pixelScale, hud()) : paint(world, site.W, site.H, 1)
    const sent =
      site.renderer === 'pixels'
        ? $.ui.blit({ requestId: PANE, key: pictureKey(), source: { rgba: encodeRgba(picture), width: picture.w, height: picture.h } })
        : $.ui.blit({ requestId: PANE, key: pictureKey(), cells: encodeCells(picture) })
    drawTimes.push(Date.now() - t0)
    if (site.renderer === 'pixels') adapt(Date.now() - t0)
    // Awaited: the terminal, not the drawing, is the bottleneck, so the next
    // frame waits until this one has been taken.
    const done = await sent
    if ('deny' in done && done.deny !== undefined) {
      refused += 1
      lastRefusal = String(done.deny)
      if (mounted === site) mounted = undefined
      // A refused frame (a resize, an image the terminal dropped): redraw the
      // tree, at most once a second, and the stream picks up from there.
      if (now - settledAt > 1000) {
        settledAt = now
        generation += 1
        $.ui.invalidate('ui.render')
      }
      return
    }
    frameTimes.push(now)
    if (frameTimes.length > 120) frameTimes.shift()
    if (drawTimes.length > 120) drawTimes.shift()
  } finally {
    busy = false
  }
}

/**
 * The frame loop: draw, hand the frame over, then wait out whatever is left
 * of the frame's time. Each frame schedules the next, so a slow terminal
 * slows the loop down instead of piling frames up.
 */
let loopId = 0

function start($: EngineInterface) {
  timer?.cancel()
  last = 0
  const id = ++loopId
  const frame = () => {
    if (id !== loopId) return
    const began = Date.now()
    void tick($).finally(() => {
      if (id !== loopId) return
      // With nothing on screen the fight still runs, ten times a second.
      const period = mounted === undefined ? 100 : 1000 / targetFps()
      // The engine takes a few ms to deliver a timer; ask that much early.
      const wait = Math.max(1, Math.round(period - (Date.now() - began) - 3))
      timer = $.clock.after(wait, frame)
    })
  }
  frame()
}

async function detect($: EngineInterface): Promise<Renderer> {
  const program = ((await $.env.get('TERM_PROGRAM')) ?? '').toLowerCase()
  const kitty = await $.env.get('KITTY_WINDOW_ID')
  return program === 'ghostty' || program === 'kitty' || kitty !== undefined ? 'pixels' : 'cells'
}

function open($: EngineInterface) {
  return $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = (on, options) => {
  settings = readSettings(options)

  on('session.start', async ($, e, next) => {
    take((await $.session.usage()).context)
    detected = await detect($)
    world = createWorld({ seed: Math.floor((await $.clock.now()) % 100000), percent: live })
    await $.command.register({
      name: 'kamehameha',
      description: 'The context showdown: demo, live, <percent>, cells or pixels',
    })
    start($)
    void open($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    take(e.context)

    return next(e)
  })

  on('command.run', { command: 'kamehameha' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo') {
      demoAt = Date.now()
      pinned = undefined
      world = createWorld({ seed: 11, percent: 4 })
    } else if (arg === 'live') {
      demoAt = undefined
      pinned = undefined
    } else if (arg === 'stats') {
      const span = frameTimes.length > 1 ? (frameTimes[frameTimes.length - 1]! - frameTimes[0]!) / 1000 : 0
      const fps = span > 0 ? (frameTimes.length - 1) / span : 0
      const avg = drawTimes.length > 0 ? drawTimes.reduce((a, b) => a + b, 0) / drawTimes.length : 0
      const size = mounted === undefined ? 'not shown' : `${mounted.W}x${mounted.H} world px${mounted.renderer === 'pixels' ? ` at ${pixelScale}x` : ''}`
      return { text: `Kamehameha: ${fps.toFixed(1)} fps (target ${targetFps()}), ${avg.toFixed(1)} ms per frame, ${renderer()} renderer, ${size}, phase ${world.phase}, ${refused} frames refused${lastRefusal === '' ? '' : ` (last: ${lastRefusal})`}` }
    } else if (/^fps \d+$/.test(arg)) {
      settings = { ...settings, fps: clamp(parseInt(arg.slice(4), 10), 10, 60) }
      start($)
      return { text: `Kamehameha now aims for ${targetFps()} fps this session.` }
    } else if (arg === 'cells' || arg === 'pixels') {
      override = arg
      $.ui.invalidate('ui.render')
      return { text: `Kamehameha now draws with ${arg === 'pixels' ? 'real pixels (kitty, Ghostty)' : 'terminal cells'}.` }
    } else if (/^\d+%?$/.test(arg)) {
      demoAt = undefined
      pinned = clamp(parseInt(arg, 10), 0, 100)
    } else if (arg !== '') {
      return { text: 'Usage: /kamehameha [demo | live | <percent> | cells | pixels | fps <n> | stats]' }
    }

    await open($)
    const p = Math.round(percent())

    return {
      text:
        arg === 'demo'
          ? 'Demo: charge, the beam grows to GAME OVER, then a senzu bean (about 30s). /kamehameha live to stop.'
          : `Context ${p}%: ${CAPTIONS[stageOf(p)]}`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const columns = clamp(e.props.bodyColumns, 20, 160)
    const rows = clamp(e.props.scroll.bodyRows - 2, 8, 34)
    const W = columns
    const H = rows * 2
    const p = percent()
    const caption = captionFor()

    const barWidth = Math.max(8, columns - 26)
    const full = Math.round((clamp(p, 0, 100) / 100) * barWidth)
    const cut = (at: number) => Math.min(full, Math.round(barWidth * at))
    const calm = cut(0.5)
    const warm = cut(0.75) - calm
    const hot = full - calm - warm
    const gauge = (
      <Text wrap="truncate-end">
        <Text color="cyan">{'█'.repeat(calm)}</Text>
        <Text color="yellow">{'█'.repeat(Math.max(0, warm))}</Text>
        <Text color="red">{'█'.repeat(Math.max(0, hot))}</Text>
        <Text dimColor>{'░'.repeat(barWidth - full)}</Text> <Text bold={p >= DEATH}>{labelFor()}</Text>
      </Text>
    )
    const line = (
      <Text color={caption.color} bold={world.phase !== 'fight'} wrap="truncate-end">
        {caption.text}
      </Text>
    )

    const want = renderer()
    // The terminal's graphics support is probed as the session starts; a pane
    // drawn before that settles is drawn once more a moment later.
    if (settledAt === 0) {
      settledAt = Date.now()
      $.clock.after(1500, () => {
        generation += 1
        $.ui.invalidate('ui.render')
      })
    }
    if (want === 'pixels' && 'Image' in table) {
      const { Image } = table
      const imageRows = rows + 2
      mounted = { renderer: 'pixels', W, H: imageRows * 2 }
      const picture = paint(world, W, imageRows * 2, pixelScale, hud())
      return <Image key={pictureKey()} source={{ rgba: encodeRgba(picture), width: picture.w, height: picture.h }} columns={columns} rows={imageRows} alt={caption.text} />
    }
    if ('Raster' in table) {
      const { Raster } = table
      mounted = { renderer: 'cells', W, H }
      return (
        <Box flexDirection="column">
          <Raster key={pictureKey()} columns={columns} rows={rows} cells={encodeCells(paint(world, W, H, 1))} />
          {line}
          {gauge}
        </Box>
      )
    }

    mounted = undefined
    return (
      <Box flexDirection="column">
        {line}
        {gauge}
      </Box>
    )
  })
}
