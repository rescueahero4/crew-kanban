import { expect, mock, test } from 'claude-code/testing'

import { BOARD_TOOL, applyBoard, applyTaskTool, describe as said, emptyCrew, newAgent } from './model'
import { LANE_COLORS } from './theme'
import type { Crew } from '../types'

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
  expect(crew.tasks[0]).toMatchObject({ id: 'T-03', lane: 'in_progress', assignee: 'a1' })
  expect(crew.agents.a1?.taskId).toBe('T-03')
})

test('an agent moves tasks across lanes, adds lanes, and is told what it got wrong', async () => {
  let crew: Crew = { ...emptyCrew(), agents: { a1: { ...newAgent('a1', 'reviewer', 'check', 0, 0), name: 'rev' } } }
  const call = (input: Record<string, unknown>) => {
    const r = applyBoard(crew, input, 'a1', 5, LANE_COLORS)
    crew = r.crew
    return r
  }
  expect(call({ action: 'add', title: 'Write the spec', lane: 'Planning' }).text).toBe('Added K-01 "Write the spec" to Planning.')
  expect(call({ action: 'update', task: '1', lane: 'in-progress' }).text).toBe('Moved K-01 to In Progress.')
  // Starting it assigns the caller and tags its entries with it
  expect(crew.tasks[0]).toMatchObject({ lane: 'in_progress', assignee: 'a1', movedBy: 'a1' })
  expect(crew.agents.a1?.taskId).toBe('K-01')
  call({ action: 'update', task: 'K-01', lane: 'blocked', note: 'waiting for CI' })
  expect(crew.tasks[0]).toMatchObject({ lane: 'blocked', note: 'waiting for CI' })
  expect(crew.agents.a1?.taskId).toBeUndefined()

  // A lane the defaults lack is added before Done, and a move to it drops the old note
  expect(call({ action: 'update', task: 'K-01', lane: 'qa' }).isError).toBe(true)
  call({ action: 'add_lane', label: 'QA', hint: 'tested by a person' })
  expect(crew.lanes.map(l => l.id).slice(-2)).toEqual(['qa', 'done'])
  call({ action: 'update', task: 'K-01', lane: 'QA' })
  expect(crew.tasks[0]).toMatchObject({ lane: 'qa', note: undefined })
  expect(call({ action: 'list' }).text).toContain('## QA [qa] (1)')

  // Removing a lane moves its tasks rather than losing them
  expect(call({ action: 'remove_lane', lane: 'qa', into: 'in_review' }).text).toBe('Removed lane QA; its 1 task moved to In Review.')
  expect(crew.tasks[0]?.lane).toBe('in_review')
  expect(call({ action: 'update', task: 'K-09' }).isError).toBe(true)
  expect(call({ action: 'update', task: 'K-01', assignee: 'nobody-by-this-name' }).isError).toBe(true)
  call({ action: 'update', task: 'K-01', assignee: 'none' })
  expect(crew.tasks[0]?.assignee).toBeUndefined()
})

test('a TodoWrite that repeats a status keeps the lane an agent gave it, and the board tasks', async () => {
  let crew: Crew = { ...emptyCrew(), agents: { main: newAgent('main', 'main', 'lead', 0, 0) } }
  const todos = (status: string) => ({ todos: [{ content: 'Build it', status }] })
  crew = applyTaskTool(crew, 'TodoWrite', todos('in_progress'), '', 'main')
  crew = applyBoard(crew, { action: 'update', task: 'T-01', lane: 'in_review' }, 'main', 1, LANE_COLORS).crew
  crew = applyBoard(crew, { action: 'add', title: 'Docs' }, 'main', 2, LANE_COLORS).crew
  crew = applyTaskTool(crew, 'TodoWrite', todos('in_progress'), '', 'main')
  expect(crew.tasks.map(t => [t.id, t.lane])).toEqual([['K-01', 'backlog'], ['T-01', 'in_review']])
  crew = applyTaskTool(crew, 'TodoWrite', todos('completed'), '', 'main')
  expect(crew.tasks.find(t => t.id === 'T-01')?.lane).toBe('done')
})

test('the kanban tool is answered from the board, and the board draws its lanes', async ($, on) => {
  mock.clock(on)
  on('tool.call', async () => ({ result: 'Task #1 created', text: 'ok' }))
  on('ui.render', async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
  const added = await $.tool.call({ tool: BOARD_TOOL, action: 'add', title: 'Review the PR', lane: 'in_review', note: 'needs a second pair of eyes' } as never)
  expect(added.result).toBe('Added K-01 "Review the PR" to In Review.')
  const wrong = await $.tool.call({ tool: BOARD_TOOL, action: 'update', task: 'K-01', lane: 'nowhere' } as never)
  expect(wrong.isError).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'crew-kanban', surface, component: 'Pane', props: PANE, requestId: 'crew' })
    await ui.press({ key: 'tab-kanban' })
    expect(await shows(ui, /In Review/)).toBe(true)
    expect(await shows(ui, /Backlog/)).toBe(true)
    expect(await ui.find({ key: 'open-K-01' })).toBeDefined()
    expect(await shows(ui, /needs a second pair of eyes/)).toBe(true)
    await ui.press({ key: 'open-K-01' })
    expect(await shows(ui, /Review the PR/)).toBe(true)
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
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
