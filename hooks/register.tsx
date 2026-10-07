import type { EngineInterface, Register, SessionContextUsage, Timer } from 'claude-code'

import { CAPTIONS, DEATH, frame, stageOf } from './scene'
import type { Stage } from './scene'

const PANE = 'kamehameha'
const TITLE = 'Kamehameha'
const KEY = 'scene'
const TICK_MS = 100
/** Frames a `/kamehameha demo` takes to go from 0% to 100%, then holds. */
const DEMO_RISE = 200
const DEMO_HOLD = 60

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const kilo = (n: number | undefined) =>
  n === undefined ? '?' : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const meter = (percent: number, width: number) => {
  const full = Math.round((clamp(percent, 0, 100) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

let live = 0
let tokens: number | undefined
let window: number | undefined
let pinned: number | undefined
let demoFrom: number | undefined
let t = 0
let diedAt = 0
let stage: Stage | undefined
let label = ''
let mounted: { columns: number; rows: number } | undefined
let timer: Timer | undefined

const percent = () => {
  if (demoFrom !== undefined) return clamp(Math.round(((t - demoFrom) / DEMO_RISE) * 100), 0, 100)
  return pinned ?? live
}

const take = (context: SessionContextUsage) => {
  tokens = context.tokens
  window = context.window
  live =
    context.percent ??
    (context.tokens !== undefined && context.window > 0
      ? Math.round((context.tokens / context.window) * 100)
      : 0)
}

const labelFor = (p: number) =>
  demoFrom !== undefined
    ? `demo ${p}%`
    : pinned !== undefined
      ? `preview ${p}%`
      : `${p}%  ${kilo(tokens)} / ${kilo(window)}`

/** Keeps the caption, status line and toasts in step with the percent. */
function observe($: EngineInterface) {
  const p = percent()
  const next = stageOf(p)
  const isReal = demoFrom === undefined && pinned === undefined

  if (next !== stage) {
    if (next === 'dead') {
      diedAt = t
      if (isReal) $.ui.toast(`💀 GAME OVER: context at ${p}%. Please /compact`)
    } else if (stage === 'dead' && isReal) {
      $.ui.toast('⚡ The hero is back up. Context compacted!')
    }
    stage = next
    $.ui.status(
      next === 'dead' ? '💀 GAME OVER · /compact' : next === 'knee' || next === 'strain' ? `⚡ context ${p}%` : undefined,
    )
  }

  const nextLabel = labelFor(p)
  if (nextLabel !== label) {
    label = nextLabel
    $.ui.invalidate('ui.render')
  }
}

async function tick($: EngineInterface) {
  t += 1
  if (demoFrom !== undefined && t - demoFrom > DEMO_RISE + DEMO_HOLD) demoFrom = undefined
  observe($)
  if (mounted === undefined) return

  const cells = frame({ ...mounted, percent: percent(), t, deadFor: t - diedAt })
  const done = await $.ui.blit({ requestId: PANE, key: KEY, cells })
  if ('deny' in done && done.deny !== undefined) mounted = undefined
}

function open($: EngineInterface) {
  return $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    take((await $.session.usage()).context)
    await $.command.register({
      name: 'kamehameha',
      description: 'Show the context-window showdown (args: demo, live, or a percent to preview)',
    })
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => void tick($))
    void open($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    take(e.context)
    observe($)

    return next(e)
  })

  on('command.run', { command: 'kamehameha' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'demo') {
      demoFrom = t
      pinned = undefined
    } else if (arg === 'live') {
      demoFrom = undefined
      pinned = undefined
    } else if (/^\d+%?$/.test(arg)) {
      demoFrom = undefined
      pinned = clamp(parseInt(arg, 10), 0, 100)
    } else if (arg !== '') {
      return { text: 'Usage: /kamehameha [demo | live | <percent>]' }
    }

    await open($)
    observe($)
    const p = percent()

    return {
      text:
        arg === 'demo'
          ? 'Demo: watch the beam grow from 0% to GAME OVER (about 20s). /kamehameha live to stop.'
          : `Context ${p}%: ${CAPTIONS[stageOf(p)]}`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const p = percent()
    const now = stageOf(p)
    const columns = clamp(e.props.bodyColumns, 24, 80)
    const rows = clamp(e.props.scroll.bodyRows - 3, 8, 18)
    const danger = p >= DEATH ? 'red' : p >= 75 ? 'yellow' : 'cyan'
    const bar = meter(p, Math.max(8, columns - 24))

    const caption = (
      <Text color={danger} bold={now === 'dead' || now === 'knee'} wrap="truncate-end">
        {now === 'dead' ? '💀 ' : ''}
        {CAPTIONS[now]}
      </Text>
    )
    const gauge = (
      <Text wrap="truncate-end">
        <Text color={danger}>{bar}</Text> <Text dimColor>{labelFor(p)}</Text>
      </Text>
    )

    if (!('Raster' in table)) {
      mounted = undefined
      return (
        <Box flexDirection="column">
          {caption}
          {gauge}
        </Box>
      )
    }

    const { Raster } = table
    mounted = { columns, rows }
    const cells = frame({ columns, rows, percent: p, t, deadFor: t - diedAt })

    return (
      <Box flexDirection="column">
        <Raster key={KEY} columns={columns} rows={rows} cells={cells} />
        {caption}
        {gauge}
      </Box>
    )
  })
}
