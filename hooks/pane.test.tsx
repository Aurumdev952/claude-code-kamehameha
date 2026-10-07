import { describe, expect, test } from 'claude-code/testing'

const pane = (bodyColumns: number, bodyRows: number) => ({
  plugin: 'kamehameha',
  component: 'Pane' as const,
  requestId: 'kamehameha',
  props: { title: 'Kamehameha', isFocused: false, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows } },
})

describe('the pane', () => {
  test('the terminal gets the pixel scene, every surface gets the caption and gauge', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ surface, ...pane(70, 26) } as never)
      const raster = await ui.find({ type: 'Raster' } as never)
      if (surface === 'terminal') expect(raster).toBeDefined()
      else expect(raster).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /%/ } as never)).toBeDefined()
      await ui.unmount()
    }
  })

  test('/kamehameha 80 previews a percentage', async ($, on) => {
    on('ui.open', () => ({ value: {} }) as never)
    const done = await $.command.run({ command: 'kamehameha', args: '80' } as never)
    expect(JSON.stringify(done)).toContain('80%')
  })
})
