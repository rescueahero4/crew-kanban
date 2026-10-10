import { expect, mock, test } from 'claude-code/testing'

import { applyTaskTool, describe as said, emptyCrew, newAgent } from './model'

const PANE = {
  title: 'Crew',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}
// Text the drawing shows: in a Text or Button, or (on the desktop) in a pixel-drawn Svg's alt
async function shows(ui: { find: Function; findAll: Function }, re: RegExp) {
  if (await ui.find({ text: re })) return true
  const svgs: { props: Record<string, unknown> }[] = await ui.findAll({ type: 'Svg' })
  return svgs.some(s => re.test(String(s.props.alt ?? '')))
}

const BAND = { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }

test('tool calls read as the mockup words them', async () => {
  expect(said('Read', { file_path: '/w/src/a.ts' }, '/w')?.text).toBe('Read src/a.ts')
  const windows = ['C:', 'w', 'src', 'a.ts'].join(String.fromCharCode(92))
  expect(said('Edit', { file_path: windows, old_string: 'a', new_string: 'a\nb' }, 'C:/w')).toMatchObject({
    kind: 'edit',
    text: 'Edited src/a.ts (+2 −1)',
    path: 'src/a.ts',
  })
  expect(said('Write', { file_path: '/w/new.ts', content: 'x' }, '/w', true)?.change).toBe('added')
})

test('a task started by an agent is assigned to it and tags its entries', async () => {
  let crew = emptyCrew()
  crew = { ...crew, agents: { a1: newAgent('a1', 'Explore', 'look', 0, 0) } }
  crew = applyTaskTool(crew, 'TaskCreate', { subject: 'Plan checks' }, 'Task #3 created', 'a1')
  crew = applyTaskTool(crew, 'TaskUpdate', { taskId: '3', status: 'in_progress' }, '', 'a1')
  expect(crew.tasks[0]).toMatchObject({ id: 'T-03', status: 'in_progress', assignee: 'a1' })
  expect(crew.agents.a1?.taskId).toBe('T-03')
})

test('the band and every screen of the pane draw on terminal and desktop', async ($, on) => {
  mock.clock(on)
  // Beneath the plugins: tools answer, and the band's other mods draw nothing
  on('tool.call', async () => ({ result: 'Task #1 created', text: 'ok' }))
  on('ui.render', async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Fix escape-model edge cases', description: 'x' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'src/hooks.js' } as never)
  await $.tool.call({ tool: 'Edit', file_path: 'src/hooks.js', old_string: 'a', new_string: 'b' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'crew-kanban', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ key: 'crew-toggle' })).toBeDefined()
    await band.unmount()

    const ui = await $.ui.mount({ plugin: 'crew-kanban', surface, component: 'Pane', props: PANE, requestId: 'crew' })
    expect(await shows(ui, /In Progress|Planning/)).toBe(true)
    expect(await ui.find({ key: 'open-main' })).toBeDefined()

    // Agent detail: the project folder as the Edits tree's root, and the Activity Log
    await ui.press({ key: 'open-main' })
    expect(await ui.find({ key: 'back' })).toBeDefined()
    // The terminal draws the project folder as the tree's root; the desktop, as the mockup, its entries
    if (surface === 'terminal') expect(await ui.find({ key: 'dir-.' })).toBeDefined()
    expect(await shows(ui, /Activity Log/)).toBe(true)
    expect(await shows(ui, /Edited src\/hooks\.js/)).toBe(true)
    // The file just written still shows as being edited: its name shimmers on the surface's own clock
    expect(await ui.find({ key: 'sh-src/hooks.js' })).toBeDefined()
    await ui.press({ key: 'split-more' })
    await ui.press({ key: 'back' })

    // Kanban, then the task's detail
    await ui.press({ key: 'tab-kanban' })
    expect(await ui.find({ key: 'open-T-01' })).toBeDefined()
    await ui.press({ key: 'toggle-done' })
    await ui.press({ key: 'open-T-01' })
    expect(await shows(ui, /Fix escape-model edge cases/)).toBe(true)
    expect(await shows(ui, /Live|Activity/)).toBe(true)
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'open-T-01' })).toBeDefined()
    await ui.press({ key: 'tab-crew' })
    await ui.unmount()
  }
})
