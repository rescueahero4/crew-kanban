// The session's crew as plain data, and the pure steps that change it. The hooks module feeds these
// from tool calls, model requests and the agent roster; the views only read.
import type { Agent, Change, Crew, Entry, Git, GitPlace, Lane, LogKind, Status, Task } from '../types'
import { DEFAULT_LANES, GIT, laneOf } from './theme'

export const MAIN = 'main'
// The kanban tool this mod registers, as the model calls it
export const BOARD_TOOL = 'mcp__crew-kanban__kanban'
const LOG_CAP = 2000

export const emptyCrew = (): Crew => ({
  agents: {},
  tasks: [],
  lanes: DEFAULT_LANES,
  boardSeq: 0,
  log: [],
  editing: {},
  tools: 0,
  seq: 0,
  root: '',
  costUsd: 0,
  startedAt: 0,
})

export function newAgent(id: string, type: string, description: string, at: number, order: number): Agent {
  return {
    id,
    type,
    description,
    raw: 'pending',
    status: 'planning',
    tokens: 0,
    weight: 0,
    ctxTokens: 0,
    ctxWindow: 200_000,
    startedAt: at,
    edits: [],
    order,
  }
}

// The engine's AgentStatus folded into the mockup's three groups
export function groupOf(raw: string): Status {
  if (raw === 'running') return 'in_progress'
  if (raw === 'completed' || raw === 'failed' || raw === 'killed') return 'done'
  return 'planning'
}

// A path inside the project, as rel() leaves it; one outside stays absolute and the Edits tree leaves it out
export const isInProject = (path: string) => !/^([a-zA-Z]:|\/|~|\.\.\/)/.test(path)

// A path as the Edits tree keys it: forward slashes, relative to the session's root
export function rel(root: string, path: string): string {
  const p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/').replace(/\/$/, '')
  if (r && p.toLowerCase().startsWith(r.toLowerCase() + '/')) return p.slice(r.length + 1)
  return p
}

const clip = (s: string, n = 72) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

const lines = (s: unknown) => (typeof s === 'string' && s.length ? s.split('\n').length : 0)

export type Described = { kind: LogKind; text: string; path?: string; change?: Change }

// One tool call as an activity entry, in the mockup's words ("Read src/hooks.js", "Edited x (+18 −4)")
export function describe(tool: string, input: Record<string, unknown>, root: string, isNew = false): Described | null {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const path = str('file_path') || str('notebook_path') || str('path')
  const where = path ? rel(root, path) : ''
  switch (tool) {
    case 'Read':
      return { kind: 'read', text: 'Read ' + where }
    case 'Grep':
      return { kind: 'search', text: `Searched for "${clip(str('pattern'), 40)}"` + (where ? ' in ' + where : '') }
    case 'Glob':
      return { kind: 'search', text: 'Listed ' + clip(str('pattern'), 50) + (where ? ' in ' + where : '') }
    case 'WebSearch':
      return { kind: 'search', text: `Searched the web for "${clip(str('query'), 50)}"` }
    case 'WebFetch':
      return { kind: 'read', text: 'Fetched ' + clip(str('url'), 60) }
    case 'Edit': {
      const added = lines(input.new_string)
      const removed = lines(input.old_string)
      return { kind: 'edit', text: `Edited ${where} (+${added} −${removed})`, path: where, change: 'modified' }
    }
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : []
      const added = edits.reduce((n, e) => n + lines(e.new_string), 0)
      const removed = edits.reduce((n, e) => n + lines(e.old_string), 0)
      return { kind: 'edit', text: `Edited ${where} (+${added} −${removed})`, path: where, change: 'modified' }
    }
    case 'Write':
      return isNew
        ? { kind: 'edit', text: 'Created ' + where, path: where, change: 'added' }
        : { kind: 'edit', text: `Rewrote ${where} (${lines(input.content)} lines)`, path: where, change: 'modified' }
    case 'NotebookEdit':
      return { kind: 'edit', text: 'Edited ' + where, path: where, change: 'modified' }
    case 'Bash':
    case 'PowerShell':
      // A call's own description already reads as an action ("Run npm test"); a bare command reads "Ran …"
      return { kind: 'run', text: str('description') ? clip(str('description'), 72) : 'Ran ' + clip(str('command'), 64) }
    case 'Agent':
    case 'Task':
      return { kind: 'message', text: 'Started agent: ' + clip(str('description') || str('subagent_type'), 60) }
    case 'SendMessage':
      return { kind: 'message', text: 'Messaged ' + clip(str('to') || str('recipient') || 'an agent', 40) }
    case 'TaskCreate':
      return { kind: 'message', text: 'Added task: ' + clip(str('subject') || str('title'), 60) }
    case 'TaskUpdate': {
      const status = str('status')
      return { kind: 'message', text: `Task #${str('taskId') || str('id')} → ${status ? status.replace('_', ' ') : 'updated'}` }
    }
    case 'TodoWrite':
      return { kind: 'message', text: 'Updated the task list' }
    case 'Skill':
      return { kind: 'message', text: 'Used skill ' + str('skill') }
    case 'AskUserQuestion':
      return { kind: 'message', text: 'Asked the user a question' }
    case BOARD_TOOL: {
      const action = str('action') || 'list'
      if (action === 'list') return { kind: 'read', text: 'Read the board' }
      if (action === 'add') return { kind: 'message', text: 'Added task: ' + clip(str('title'), 60) + (str('lane') ? ' → ' + str('lane') : '') }
      if (action === 'update') return { kind: 'message', text: `Task ${str('task')} ${str('lane') ? '→ ' + str('lane').replace(/_/g, ' ') : 'updated'}` }
      if (action === 'remove') return { kind: 'message', text: `Removed task ${str('task')}` }
      if (action === 'add_lane') return { kind: 'message', text: 'Added lane ' + clip(str('label') || str('lane'), 40) }
      return { kind: 'message', text: 'Removed lane ' + clip(str('lane'), 40) }
    }
    default:
      if (tool.startsWith('mcp__')) return { kind: 'run', text: 'Called ' + tool.split('__').slice(1).join(' · ') }
      return { kind: 'run', text: 'Used ' + tool }
  }
}

// A file deleted with rm / del / Remove-Item, as far as the command line says
export function deletedBy(command: string, root: string): string[] {
  const m = command.match(/^\s*(?:rm|del|Remove-Item|git\s+rm)\s+(.+)$/i)
  const args = m?.[1]
  if (!args || /[|;&><`$]/.test(args)) return []
  return args
    .split(/\s+/)
    .filter(arg => arg && !arg.startsWith('-'))
    .map(arg => rel(root, arg.replace(/^["']|["']$/g, '')))
}

export function addEntry(crew: Crew, agentId: string, at: number, d: { kind: LogKind; text: string }): Crew {
  const agent = crew.agents[agentId]
  const entry: Entry = { seq: crew.seq + 1, at, agentId, kind: d.kind, text: d.text, taskId: agent?.taskId }
  return { ...crew, seq: crew.seq + 1, log: [...crew.log, entry].slice(-LOG_CAP) }
}

export function addEdit(crew: Crew, agentId: string, path: string, change: Change): Crew {
  const agent = crew.agents[agentId]
  if (!agent) return crew
  const prior = agent.edits.find(e => e.path === path)
  // A file the agent created stays added however often it rewrites it
  const next = prior ? (prior.change === 'added' && change !== 'deleted' ? 'added' : change) : change
  const edits = [...agent.edits.filter(e => e.path !== path), { path, change: next }]
  return { ...crew, agents: { ...crew.agents, [agentId]: { ...agent, edits } } }
}

export function setEditing(crew: Crew, path: string, agentId: string, isOn: boolean): Crew {
  const writers = (crew.editing[path] ?? []).filter(id => id !== agentId)
  const editing = { ...crew.editing }
  if (isOn) editing[path] = [agentId, ...writers]
  else if (writers.length) editing[path] = writers
  else delete editing[path]
  return { ...crew, editing }
}

// Claude's task statuses as lanes: a task its tools list but nobody has started waits in the Backlog
const TOOL_LANE: Record<string, string> = {
  pending: 'backlog',
  open: 'backlog',
  in_progress: 'in_progress',
  completed: 'done',
  done: 'done',
}

const pad = (n: string, prefix = 'T-') => (/^\d+$/.test(n) ? prefix + n.padStart(2, '0') : n)

// The agent that starts a task is working it: its entries are tagged until it moves the task on
function tagAgent(crew: Crew, agentId: string | undefined, task: Task): Crew {
  const agent = agentId ? crew.agents[agentId] : undefined
  if (!agent) return crew
  if (task.lane === 'in_progress') return { ...crew, agents: { ...crew.agents, [agent.id]: { ...agent, taskId: task.id } } }
  if (agent.taskId === task.id) return { ...crew, agents: { ...crew.agents, [agent.id]: { ...agent, taskId: undefined } } }
  return crew
}

// An agent named as the model would name it: its name, id or type, or "me" for the caller
function agentNamed(crew: Crew, who: string, caller: string): string | undefined {
  const w = who.trim().toLowerCase()
  if (!w) return undefined
  if (w === 'me' || w === 'self') return caller
  if (w === 'lead' || w === 'main') return MAIN
  const all = Object.values(crew.agents)
  return (all.find(a => a.id.toLowerCase() === w || a.name?.toLowerCase() === w) ?? all.find(a => a.type.toLowerCase() === w))?.id
}

// The task list as Claude keeps it (TaskCreate / TaskUpdate, or TodoWrite), with who is working what
export function applyTaskTool(crew: Crew, tool: string, input: Record<string, unknown>, result: unknown, agentId: string, at = 0): Crew {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')

  if (tool === 'TaskCreate') {
    const text = typeof result === 'string' ? result : JSON.stringify(result ?? '')
    const found = text.match(/"(?:id|taskId)"\s*:\s*"?(\d+)/) ?? text.match(/#(\d+)/)
    const id = pad(found?.[1] ?? String(crew.tasks.length + 1))
    if (crew.tasks.some(t => t.id === id)) return crew
    const task: Task = { id, title: str('subject') || str('title') || str('description'), lane: 'backlog', source: 'task', toolStatus: 'pending' }
    return { ...crew, tasks: [...crew.tasks, task] }
  }

  if (tool === 'TaskUpdate') {
    const id = pad(str('taskId') || str('id'))
    const raw = str('status')
    if (raw === 'deleted') return { ...crew, tasks: crew.tasks.filter(t => t.id !== id) }
    let task = crew.tasks.find(t => t.id === id)
    if (!task) return crew
    // A status the tool names is a move; an update without one leaves the task where the board has it
    const lane = TOOL_LANE[raw] ?? task.lane
    const ownerId = str('owner') ? agentNamed(crew, str('owner'), agentId) : undefined
    task = {
      ...task,
      title: str('subject') || task.title,
      lane,
      toolStatus: raw || task.toolStatus,
      assignee: ownerId ?? (lane === 'in_progress' && !task.assignee ? agentId : task.assignee),
      ...(raw && lane !== task.lane ? { movedBy: agentId, movedAt: at, note: undefined } : {}),
    }
    const next = { ...crew, tasks: crew.tasks.map(t => (t.id === id ? task! : t)) }
    return raw ? tagAgent(next, agentId, task) : next
  }

  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    let next: Crew = crew
    // The list replaces the todos it wrote before; tasks from TaskCreate or the board stay
    const kept = crew.tasks.filter(t => t.source !== 'todo')
    const taken = new Set(kept.map(t => t.id))
    let n = 0
    const todos = (input.todos as Record<string, unknown>[]).map(todo => {
      const title = String(todo.content ?? todo.subject ?? '')
      const raw = String(todo.status ?? 'pending')
      const prior = crew.tasks.find(t => t.source === 'todo' && t.title === title)
      // The same status as last time is no move: a lane an agent gave it on the board holds
      const lane = prior && prior.toolStatus === raw ? prior.lane : (TOOL_LANE[raw] ?? 'backlog')
      let id = prior?.id
      while (!id || taken.has(id)) id = pad(String(++n))
      taken.add(id)
      const task: Task = {
        ...prior,
        id,
        title,
        lane,
        source: 'todo',
        toolStatus: raw,
        assignee: prior?.assignee ?? (lane === 'in_progress' ? agentId : undefined),
      }
      if (lane === 'in_progress' && prior?.lane !== 'in_progress') next = tagAgent(next, agentId, task)
      return task
    })
    return { ...next, tasks: [...kept, ...todos] }
  }

  return crew
}

// ── The kanban tool: how an agent reads the board and moves work across it ──────────

export type BoardReply = { crew: Crew; text: string; isError?: true }

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// A lane named as the model would name it: its id, its label, or either loosely spelt ("In review", "in-review")
export function laneNamed(lanes: Lane[], name: string): Lane | undefined {
  const s = slug(name)
  return s ? lanes.find(l => l.id === s || slug(l.label) === s) : undefined
}

// A task named by its id ("T-03", "3", "#3", "k-1") or its exact title
export function taskNamed(tasks: Task[], name: string): Task | undefined {
  const n = name.trim().replace(/^#/, '')
  if (!n) return undefined
  const up = n.toUpperCase()
  const num = up.match(/^(?:([A-Z])-?)?0*(\d+)$/)
  const sameNumber = (t: Task) => {
    const m = t.id.match(/^([A-Z])-0*(\d+)$/)
    return !!num && !!m && m[2] === num[2] && (!num[1] || m[1] === num[1])
  }
  return tasks.find(t => t.id.toUpperCase() === up) ?? tasks.find(sameNumber) ?? tasks.find(t => t.title.trim().toLowerCase() === n.toLowerCase())
}

// The board as the model reads it: each lane, then its tasks with who has them and why they sit there
export function boardText(crew: Crew): string {
  const who = (id?: string) => {
    const a = id ? crew.agents[id] : undefined
    return a ? ` @${a.name ?? (a.id === MAIN ? 'lead' : a.type)}` : ''
  }
  const out = crew.lanes.map(lane => {
    const tasks = crew.tasks.filter(t => t.lane === lane.id)
    const head = `## ${lane.label} [${lane.id}] (${tasks.length})${lane.hint ? ' — ' + lane.hint : ''}`
    return [head, ...tasks.map(t => `- ${t.id} ${t.title}${who(t.assignee)}${t.note ? ' — ' + t.note : ''}`)].join('\n')
  })
  const stray = crew.tasks.filter(t => !crew.lanes.some(l => l.id === t.lane))
  if (stray.length) out.push(['## Unsorted', ...stray.map(t => `- ${t.id} ${t.title} [${t.lane}]`)].join('\n'))
  return out.join('\n\n')
}

// One call of the kanban tool, applied to the crew; the reply is what the model reads back
export function applyBoard(crew: Crew, input: Record<string, unknown>, agentId: string, at: number, colors: string[]): BoardReply {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : '')
  const fail = (text: string): BoardReply => ({ crew, text, isError: true })
  const lanesList = () => crew.lanes.map(l => l.id).join(', ')
  const action = str('action') || 'list'

  if (action === 'list') return { crew, text: boardText(crew) }

  if (action === 'add' || action === 'update') {
    const laneName = str('lane')
    const lane = laneName ? laneNamed(crew.lanes, laneName) : undefined
    if (laneName && !lane) return fail(`No lane "${laneName}". Lanes: ${lanesList()}. Add one with action "add_lane" first.`)
    const whoName = str('assignee')
    const isUnassigning = ['none', 'nobody', 'unassigned'].includes(whoName.toLowerCase())
    const assignee = whoName && !isUnassigning ? agentNamed(crew, whoName, agentId) : undefined
    if (whoName && !isUnassigning && !assignee) return fail(`No agent "${whoName}". Name an agent by its name or type, "me", or "none".`)
    const hasNote = typeof input.note === 'string'
    const note = hasNote ? str('note') || undefined : undefined

    if (action === 'add') {
      const title = str('title')
      if (!title) return fail('"add" needs a title.')
      const seq = crew.boardSeq + 1
      const target = lane?.id ?? (crew.lanes.some(l => l.id === 'backlog') ? 'backlog' : crew.lanes[0]!.id)
      const task: Task = {
        id: pad(String(seq), 'K-'),
        title,
        lane: target,
        assignee: assignee ?? (target === 'in_progress' && !isUnassigning ? agentId : undefined),
        note,
        source: 'board',
        movedBy: agentId,
        movedAt: at,
      }
      const next = tagAgent({ ...crew, boardSeq: seq, tasks: [...crew.tasks, task] }, task.assignee, task)
      return { crew: next, text: `Added ${task.id} "${task.title}" to ${laneOf(next.lanes, task.lane).label}.` }
    }

    const task = taskNamed(crew.tasks, str('task'))
    if (!task) return fail(`No task "${str('task')}". Call with action "list" to see the board.`)
    const isMoved = !!lane && lane.id !== task.lane
    const updated: Task = {
      ...task,
      title: str('title') || task.title,
      lane: lane?.id ?? task.lane,
      // A move without a note drops the old one: "waiting for CI" means nothing once it's in review
      note: hasNote ? note : isMoved ? undefined : task.note,
      assignee: isUnassigning ? undefined : (assignee ?? (lane?.id === 'in_progress' && !task.assignee ? agentId : task.assignee)),
      ...(isMoved ? { movedBy: agentId, movedAt: at } : {}),
    }
    let next: Crew = { ...crew, tasks: crew.tasks.map(t => (t.id === task.id ? updated : t)) }
    if (isMoved) next = tagAgent(next, updated.assignee ?? agentId, updated)
    const what = isMoved ? `Moved ${task.id} to ${laneOf(next.lanes, updated.lane).label}` : `Updated ${task.id}`
    return { crew: next, text: `${what}${updated.note ? ` (${updated.note})` : ''}.` }
  }

  if (action === 'remove') {
    const task = taskNamed(crew.tasks, str('task'))
    if (!task) return fail(`No task "${str('task')}". Call with action "list" to see the board.`)
    const agents = Object.fromEntries(Object.entries(crew.agents).map(([id, a]) => [id, a.taskId === task.id ? { ...a, taskId: undefined } : a]))
    return { crew: { ...crew, agents, tasks: crew.tasks.filter(t => t.id !== task.id) }, text: `Removed ${task.id} "${task.title}".` }
  }

  if (action === 'add_lane') {
    const label = str('label') || str('lane')
    if (!label) return fail('"add_lane" needs a label.')
    const id = slug(label)
    if (!id) return fail(`"${label}" has no letters or digits to name a lane by.`)
    const prior = laneNamed(crew.lanes, label)
    if (prior) return { crew, text: `Lane ${prior.label} [${prior.id}] is already on the board.` }
    const color = /^#[0-9a-f]{6}$/i.test(str('color')) ? str('color') : colors[crew.lanes.filter(l => l.isCustom).length % colors.length]!
    const lane: Lane = { id, label, color, hint: str('hint') || undefined, isCustom: true }
    // After the lane it names; else just before Done, where most workflow steps belong
    const after = str('after') ? laneNamed(crew.lanes, str('after')) : undefined
    const done = crew.lanes.findIndex(l => l.id === 'done')
    const index = after ? crew.lanes.indexOf(after) + 1 : done >= 0 ? done : crew.lanes.length
    const lanes = [...crew.lanes.slice(0, index), lane, ...crew.lanes.slice(index)]
    return { crew: { ...crew, lanes }, text: `Added lane ${label} [${id}].` }
  }

  if (action === 'remove_lane') {
    const lane = laneNamed(crew.lanes, str('lane'))
    if (!lane) return fail(`No lane "${str('lane')}". Lanes: ${lanesList()}.`)
    if (crew.lanes.length === 1) return fail('The board needs at least one lane.')
    const rest = crew.lanes.filter(l => l !== lane)
    const into = str('into') ? laneNamed(rest, str('into')) : (rest.find(l => l.id === 'backlog') ?? rest[0])
    if (!into) return fail(`No lane "${str('into')}" to move its tasks into. Lanes: ${rest.map(l => l.id).join(', ')}.`)
    const n = crew.tasks.filter(t => t.lane === lane.id).length
    const tasks = crew.tasks.map(t => (t.lane === lane.id ? { ...t, lane: into.id } : t))
    return { crew: { ...crew, lanes: rest, tasks }, text: `Removed lane ${lane.label}${n ? `; its ${n} task${n === 1 ? '' : 's'} moved to ${into.label}` : ''}.` }
  }

  return fail(`Unknown action "${action}". Use list, add, update, remove, add_lane or remove_lane.`)
}

// What share of the session's cost one agent's requests came to. The ratios hold across Claude models
// (cache reads a tenth of input, cache writes 1.25x, output 5x), so this is an estimate, shown as ≈.
export function weightOf(usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }) {
  return usage.input_tokens + usage.cache_creation_input_tokens * 1.25 + usage.cache_read_input_tokens * 0.1 + usage.output_tokens * 5
}

export const windowOf = (model: string) => (/\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000)

// The agent's progress, 0-100, or null when nothing says how far along it is
export function progressOf(crew: Crew, agent: Agent): number | null {
  if (agent.status === 'done') return 100
  const mine = crew.tasks.filter(t => t.assignee === agent.id)
  if (!mine.length) return null
  return Math.round((mine.filter(t => t.lane === 'done').length / mine.length) * 100)
}

// What the card says the agent is doing: its newest entry while working, else what it was asked
export function activityOf(crew: Crew, agent: Agent): string {
  if (agent.status !== 'done') {
    const mine = crew.log.findLast(entry => entry.agentId === agent.id)
    if (mine) return mine.text
  }
  return agent.description
}

export const agentsIn = (crew: Crew) => Object.values(crew.agents).sort((a, b) => a.order - b.order)

// ── Git: where the session's folder stands ────────────────────────────────────────

// A checkout from `git rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel`,
// `git branch --show-current` (empty when HEAD is detached) and, then, the short commit
export function gitPlaceOf(revParse: string, branch: string, commit = ''): GitPlace | undefined {
  const [gitDir, repo, root] = revParse.trim().split(/\r?\n/).map(line => line.trim().replace(/\\/g, '/').replace(/\/$/, ''))
  if (!gitDir || !repo || !root) return undefined
  const name = branch.trim()
  return {
    branch: name || commit.trim() || 'HEAD',
    isDetached: !name,
    // A linked worktree keeps its own git folder under the repository's .git/worktrees
    isWorktree: gitDir.toLowerCase() !== repo.toLowerCase(),
    root,
    repo,
  }
}

const samePlace = (a: GitPlace, b: GitPlace) => a.branch === b.branch && a.root === b.root && a.isDetached === b.isDetached

// The session's git as it now reads; the start holds until the session moves to another repository
export function nextGit(git: Git, now: GitPlace | undefined): Git {
  if (!now) return git.now ? { start: git.start } : git
  if (git.now && samePlace(git.now, now)) return git
  const start = git.start && git.start.repo === now.repo ? git.start : now
  return { start, now }
}

export type GitLabel = { isWorktree: boolean; from?: GitPlace; to: GitPlace }

// What the label shows: the branch now, and the one the session started on when it has moved since
export function gitLabelOf(git: Git): GitLabel | undefined {
  const { start, now } = git
  if (!now) return undefined
  const hasMoved = !!start && !samePlace(start, now)
  return { isWorktree: now.isWorktree, from: hasMoved ? start : undefined, to: now }
}

// The label as text, for the status line: "◆ main", "◆ main › ⎇ new-feat", "[wt] ◆ main › ⎇ fix"
export function gitText(git: Git): string | undefined {
  const label = gitLabelOf(git)
  if (!label) return undefined
  const wt = label.isWorktree ? GIT.worktree + ' ' : ''
  return label.from ? `${wt}${GIT.icon} ${label.from.branch} › ${GIT.branch} ${label.to.branch}` : `${wt}${GIT.icon} ${label.to.branch}`
}
