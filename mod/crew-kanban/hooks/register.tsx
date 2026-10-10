// Crew Kanban: a live view of this session's agents, tasks, file edits and activity.
// The band above the prompt sums the crew up and opens the Crew pane; /crew opens it too.
// Everything is kept in $.state, so it lasts for the session and nothing outlives it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Crew, Layout, Look, Nav, Part } from '../types'
import { LIBRARY, isValidPart } from './mascot'
import {
  MAIN,
  addEdit,
  addEntry,
  applyTaskTool,
  deletedBy,
  describe,
  emptyCrew,
  groupOf,
  newAgent,
  rel,
  setEditing,
  weightOf,
  windowOf,
} from './model'
import { ROLES, provisionalLook, roleOf } from './theme'
import { band, crewPane, isFolderOpen, mascotCells, type Ctx, type Tree } from './views'

const PANE = 'crew'

const crewAtom = atom({ plugin: 'crew-kanban', key: 'crew' } as const, emptyCrew())
const navAtom = atom({ plugin: 'crew-kanban', key: 'nav' } as const, { view: 'crew', from: 'crew' } as Nav)
const layoutAtom = atom({ plugin: 'crew-kanban', key: 'layout' } as const, { collapsed: {}, folders: {}, split: 50, logBack: 0 } as Layout)
const openAtom = atom({ plugin: 'crew-kanban', key: 'isOpen' } as const, false)
const generatedAtom = atom({ plugin: 'crew-kanban', key: 'generated' } as const, {} as Record<string, Part>)
const looksAtom = atom({ plugin: 'crew-kanban', key: 'looks' } as const, {} as Record<string, Look>)

// How long a written file keeps its editing state after the write lands, so the eye can catch it
const LINGER_MS = 2500
const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite'])
const SKIP_DIRS = new Set(['.git', 'node_modules'])

// Set from the mod's options when it loads
let isReduced = false
// CSS pixels per column on the Desktop app
let cellPx = 8
let tick = 0
let isTurnRunning = false
// Rasters the last drawing of the pane holds, for the animation timer to repaint
let drawn: Ctx['drawn'] = []
// Writes that landed: when each file stops showing as being written
const lingers = new Map<string, { path: string; agentId: string; until: number }>()
const listings = new Map<string, { at: number; entries: Tree }>()
const drawing = new Set<string>()

const ensureAgent = (crew: Crew, id: string, at: number): Crew => {
  if (crew.agents[id]) return crew
  const order = Object.keys(crew.agents).length
  const agent = id === MAIN ? { ...newAgent(MAIN, 'main', 'Main session', at, order), raw: 'idle' } : newAgent(id, 'general-purpose', 'Subagent', at, order)
  return { ...crew, agents: { ...crew.agents, [id]: agent } }
}

const lookFor = (looks: Record<string, Look>) => (agent: Agent): Look => {
  const role = roleOf(agent.type)
  return (role ? ROLES[role] : looks[agent.type]) ?? provisionalLook(agent.type)
}
const partsFor = (generated: Record<string, Part>) => (look: Look): Part[] =>
  look.parts.map(id => LIBRARY[id] ?? generated[id]).filter((p): p is Part => !!p)

// Keeps an open log where the person scrolled it as entries arrive for it
async function holdScroll($: EngineInterface, agentId: string, taskId?: string) {
  const nav = await read($, navAtom)
  const isShown = (nav.view === 'agent' && nav.id === agentId) || (nav.view === 'task' && !!taskId && nav.id === taskId)
  if (isShown) await update($, layoutAtom, l => (l.logBack > 0 ? { ...l, logBack: l.logBack + 1 } : l))
}

// ── The roster, the session's totals and the clock ────────────────────────────────

async function poll($: EngineInterface) {
  const now = await $.clock.now()
  const [agents, usage] = await Promise.all([$.agent.list(), $.session.usage()])
  let root = (await read($, crewAtom)).root
  if (!root) root = (await $.session.cwd()).replace(/\\/g, '/')
  const before = await read($, crewAtom)
  const after = await update($, crewAtom, crew => {
    let c: Crew = crew.startedAt ? crew : { ...crew, startedAt: usage.startedAt, root }
    c = ensureAgent(c, MAIN, usage.startedAt)
    const all = { ...c.agents }
    const main = all[MAIN]!
    const raw = isTurnRunning ? 'running' : 'idle'
    all[MAIN] = {
      ...main,
      raw,
      status: groupOf(raw),
      ctxTokens: usage.context.tokens ?? main.ctxTokens,
      ctxWindow: usage.context.window || main.ctxWindow,
    }
    for (const info of agents) {
      const known = all[info.id] ?? newAgent(info.id, info.type, info.description, now, Object.keys(all).length)
      const parent = all[info.parentId ?? MAIN]
      const status = groupOf(info.status)
      all[info.id] = {
        ...known,
        type: info.type,
        name: info.name,
        description: info.description || known.description,
        raw: info.status,
        status,
        // A subagent works for the task its parent had in hand when it started it
        taskId: all[info.id] ? known.taskId : (known.taskId ?? parent?.taskId),
        endedAt: status === 'done' ? (known.endedAt ?? now) : undefined,
      }
    }
    return { ...c, agents: all, costUsd: usage.cost?.usd ?? c.costUsd }
  })
  // Types with no library role get accessories drawn by Claude, once per type
  for (const agent of Object.values(after.agents)) if (!roleOf(agent.type)) void drawLook($, agent.type)
  // The clock and usage figures move every second: redraw while there is something to watch
  const isOpen = await read($, openAtom)
  if (isOpen || before.costUsd !== after.costUsd || Object.values(after.agents).some(a => a.status === 'in_progress')) {
    $.ui.invalidate('ui.render')
  }
}

// Accessories for an agent type the library has none for, drawn by Claude from the session's context
async function drawLook($: EngineInterface, type: string) {
  if (drawing.has(type) || (await read($, looksAtom))[type]) return
  drawing.add(type)
  const name = type.replace(/^.*:/, '')
  const prompt = [
    `Draw pixel-art accessories for "${name}", a kind of AI agent, worn by a 20x16 pixel mascot.`,
    'Reply with JSON only: {"hat": PART, "prop": PART}. PART = {"slot":"hat"|"prop","y":number,"rows":[strings],"palette":{"<char>":"#rrggbb"}}.',
    'Every row is exactly 20 characters; "." is transparent; any other character must be a palette key.',
    'The hat sits on the head: its rows end by y=7 (head starts at y=8, x 5-14). The prop is held at the right: x 15-19, rows within y 2-14.',
    'Use 2-3 colours that suit the agent\'s job. Example hat (wizard): {"slot":"hat","y":1,"palette":{"P":"#6b4fc8","Y":"#f2c94c"},"rows":[',
    '"..........P.........",".........PP.........",".........PPP........","........PPYPP.......",".......PPPPPPP......","......PPPPPPPPP.....","....PPPPPPPPPPPPP..."]}',
  ].join('\n')
  const r = await $.model.complete({ model: 'haiku', prompt, maxTokens: 1500 })
  if (!r.isAnswered) return
  try {
    const json = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1))
    const ids: string[] = []
    const parts: Record<string, Part> = {}
    for (const slot of ['hat', 'prop'] as const) {
      const part = { ...json[slot], slot, source: 'generated', prompt: `${name} agent: ${slot}` }
      if (!isValidPart(part)) continue
      const id = `gen-${name}-${slot}`
      parts[id] = part
      ids.push(id)
    }
    if (!ids.length) return
    await update($, generatedAtom, g => ({ ...g, ...parts }))
    await update($, looksAtom, l => ({ ...l, [type]: { ...provisionalLook(type), parts: ids } }))
  } catch {
    // A reply that isn't the JSON asked for leaves the type in the provisional look
  }
}

// Paints the mascots' next frame in place, and ends the editing state of writes that have landed
async function animate($: EngineInterface) {
  tick += 1
  const now = await $.clock.now()
  const expired = [...lingers.entries()].filter(([, l]) => l.until <= now)
  if (expired.length) {
    for (const [key] of expired) lingers.delete(key)
    await update($, crewAtom, crew => expired.reduce((c, [, l]) => setEditing(c, l.path, l.agentId, false), crew))
  }
  if (isReduced || !drawn.length || !(await read($, openAtom))) return
  const crew = await read($, crewAtom)
  const ctx = { lookOf: lookFor(await read($, looksAtom)), partsOf: partsFor(await read($, generatedAtom)) }
  for (const d of drawn) {
    const agent = crew.agents[d.agentId]
    if (!agent || agent.status === 'done') continue
    const cells = mascotCells(ctx, agent, tick, d.isSmall, false)
    void $.ui.blit({ requestId: PANE, key: d.key, ...cells }).catch(() => undefined)
  }
}

async function open($: EngineInterface) {
  await update($, openAtom, () => true)
  const opened = await $.ui.open({ id: PANE, title: 'Crew', focus: true })
  // Say why when the pane waits undrawn, rather than nothing appearing
  if (!opened.isPlaced) $.ui.toast(`Crew: ${opened.reason}`)
}

// The folders the Edits tree shows open, read from disk; a listing is reused for a few seconds
async function listDirs($: EngineInterface, crew: Crew, layout: Layout, agent: Agent | undefined, now: number) {
  const dirs: Record<string, Tree> = {}
  if (!agent || !crew.root) return dirs
  const queue = ['']
  while (queue.length && Object.keys(dirs).length < 60) {
    const dir = queue.shift()!
    let listing = listings.get(dir)
    if (!listing || now - listing.at > 4000) {
      const entries = await $.fs.list(crew.root + (dir ? '/' + dir : '')).catch(() => [])
      listing = {
        at: now,
        entries: entries
          .filter(f => f.kind !== 'other' && !SKIP_DIRS.has(f.name))
          .map(f => ({ name: f.name, kind: f.kind === 'dir' ? ('dir' as const) : ('file' as const), path: dir ? dir + '/' + f.name : f.name })),
      }
      listings.set(dir, listing)
    }
    dirs[dir] = listing.entries
    for (const entry of listing.entries) if (entry.kind === 'dir' && isFolderOpen(layout, crew, agent, entry.path)) queue.push(entry.path)
  }
  return dirs
}

async function togglePane($: EngineInterface) {
  if (await read($, openAtom)) {
    await update($, openAtom, () => false)
    await $.ui.close({ id: PANE })
  } else {
    await open($)
  }
}

export const register: Register = (on, options) => {
  isReduced = options.reducedMotion === true
  cellPx = typeof options.desktopCellWidth === 'number' && options.desktopCellWidth > 0 ? options.desktopCellWidth : 8

  // ── Session ───────────────────────────────────────────────────────────────────────

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'crew', description: 'Open the Crew pane: agents, tasks, edits and activity', immediate: true })
    // A reload starts with no write in flight
    await update($, crewAtom, c => ({ ...c, editing: {} }))
    await poll($).catch(() => undefined)
    $.clock.every(1000, () => void poll($).catch(() => undefined))
    $.clock.every(250, () => void animate($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await open($)
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, openAtom, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Turns are the main loop's: it's working from a prompt to its answer
  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isTurnRunning = false
    return next(e)
  })

  // Each model request: the model and effort an agent runs on, and the tokens it spends
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const id = e.agentId ?? MAIN
    const usage = result.usage
    const at = await $.clock.now()
    await update($, crewAtom, crew => {
      const c = ensureAgent(crew, id, at)
      const agent = c.agents[id]!
      const context = usage ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : 0
      return {
        ...c,
        agents: {
          ...c.agents,
          [id]: {
            ...agent,
            model: e.model,
            effort: e.effort === undefined ? agent.effort : String(e.effort),
            tokens: agent.tokens + (usage ? context + usage.output_tokens : 0),
            weight: agent.weight + (usage ? weightOf(usage) : 0),
            ctxTokens: id === MAIN || !usage ? agent.ctxTokens : context,
            ctxWindow: windowOf(e.model),
          },
        },
      }
    })
    return result
  })

  // ── Tool calls: the activity log, the edits, the files being written, the tasks ──

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = e.tool
    const agentId = e.agentId ?? MAIN
    const at = await $.clock.now()
    const root = (await read($, crewAtom)).root
    const filePath = typeof input.file_path === 'string' ? input.file_path : ''
    const isNew = tool === 'Write' && filePath ? !(await $.fs.exists(filePath)) : false
    const said = describe(tool, input, root, isNew)

    const written = await update($, crewAtom, crew => {
      let c = ensureAgent(crew, agentId, at)
      c = { ...c, tools: c.tools + 1 }
      if (said) c = addEntry(c, agentId, at, said)
      if (said?.path) c = setEditing(c, said.path, agentId, true)
      return c
    })
    await holdScroll($, agentId, written.agents[agentId]?.taskId)

    const ran = await next(e)

    const isOk = ran.deny === undefined && ran.isError !== true
    const done = await $.clock.now()
    await update($, crewAtom, crew => {
      let c = crew
      if (said?.path && said.change && isOk) c = addEdit(c, agentId, said.path, said.change)
      if (TASK_TOOLS.has(tool) && isOk) c = applyTaskTool(c, tool, input, ran.result ?? ran.text, agentId)
      if ((tool === 'Bash' || tool === 'PowerShell') && isOk && typeof input.command === 'string') {
        for (const path of deletedBy(input.command, c.root)) c = addEdit(c, agentId, path, 'deleted')
      }
      if (!isOk && said) c = addEntry(c, agentId, done, { kind: said.kind, text: said.text + (ran.deny !== undefined ? ' — denied' : ' — failed') })
      return c
    })
    if (said?.path) {
      lingers.set(said.path + '\n' + agentId, { path: said.path, agentId, until: done + LINGER_MS })
      listings.delete(said.path.includes('/') ? said.path.slice(0, said.path.lastIndexOf('/')) : '')
    }
    return ran
  }).catch(($, e, next) => next(e)) // Bookkeeping that fails never holds a tool call up

  // ── Drawing ───────────────────────────────────────────────────────────────────────

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const [crew, nav, layout, looks, generated] = await Promise.all([
      read($, crewAtom),
      read($, navAtom),
      read($, layoutAtom),
      read($, looksAtom),
      read($, generatedAtom),
    ])
    const now = await $.clock.now()
    const agent = nav.view === 'agent' ? crew.agents[nav.id ?? ''] : undefined
    drawn = []
    const ctx: Ctx = {
      els,
      surface: e.surface,
      cols: Math.max(30, e.props.bodyColumns),
      cellPx,
      rows: e.props.scroll.bodyRows,
      now,
      tick,
      isReduced,
      crew,
      nav,
      layout,
      lookOf: lookFor(looks),
      partsOf: partsFor(generated),
      dirs: await listDirs($, crew, layout, agent, now),
      drawn,
      act: {
        go: next => {
          void update($, navAtom, () => next)
          void update($, layoutAtom, l => ({ ...l, logBack: 0 }))
        },
        back: () => {
          void update($, navAtom, n => ({ view: n.from, from: n.from }))
          void update($, layoutAtom, l => ({ ...l, logBack: 0 }))
        },
        toggleGroup: status => void update($, layoutAtom, l => ({ ...l, collapsed: { ...l.collapsed, [status]: !l.collapsed[status] } })),
        toggleFolder: (path, isOpen) => void update($, layoutAtom, l => ({ ...l, folders: { ...l.folders, [path]: isOpen } })),
        split: delta =>
          void update($, layoutAtom, l => ({ ...l, split: delta === 'reset' ? 50 : Math.min(80, Math.max(20, l.split + delta)) })),
        scrollLog: delta => void update($, layoutAtom, l => ({ ...l, logBack: delta === 'latest' ? 0 : l.logBack + delta })),
        togglePane: () => void togglePane($),
      },
    }
    return crewPane(ctx)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const crew = await read($, crewAtom)
    const hasCrew = crew.tools > 0 || Object.keys(crew.agents).length > 1
    if (e.props.hasSurvey || !hasCrew) return next(e)
    const isOpen = await read($, openAtom)
    const els = $.ui.resolve(e)
    const theirs = await next(e)
    const { Box } = els
    return (
      <Box flexDirection="column">
        {theirs}
        {band({ els, cols: e.props.bodyColumns, crew, isOpen, toggle: () => void togglePane($) })}
      </Box>
    )
  })
}
