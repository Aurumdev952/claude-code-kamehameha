import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

/** Answers everything the mod asks of the engine, recording what it did. */
const engine = (on: On, percent: number) => {
  const seen = { opened: [] as string[], played: [] as string[], commands: [] as string[] }
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: percent * 2000, window: 200_000, percent }, rateLimits: [] } }) as never)
  on('command.register', (_$, e) => {
    seen.commands.push((e as { name: string }).name)
    return { value: {} } as never
  })
  on('ui.open', (_$, e) => {
    seen.opened.push((e as { id: string }).id)
    return { value: {} } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  on('ui.status', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: {} }) as never)
  on('audio.play', (_$, e) => {
    seen.played.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  return seen
}

describe('a session', () => {
  test('starts the showdown: command, pane, and the charge sound when sound is on', { options: { sound: true } }, async ($, on) => {
    const clock = mock.clock(on)
    mock.env(on, { TERM_PROGRAM: 'WezTerm' })
    const seen = engine(on, 30)
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
    await clock.advance(200)
    expect(seen.commands).toContain('kamehameha')
    expect(seen.opened).toContain('kamehameha')
    expect(seen.played.join()).toContain('sounds/charge.wav')
  })

  test('stays silent by default', async ($, on) => {
    const clock = mock.clock(on)
    mock.env(on, {})
    const seen = engine(on, 30)
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
    await clock.advance(200)
    expect(seen.played).toEqual([])
  })
})
