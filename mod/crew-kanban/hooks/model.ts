// The session's crew as plain data, and the pure steps that change it. The hooks module feeds these
// from tool calls, model requests and the agent roster; the views only read.
import type { Agent, Change, Crew, Entry, LogKind, Status, Task } from '../types'

export const MAIN = 'main'
const LOG_CAP = 2000

export const emptyCrew = (): Crew => ({
  agents: {},
  tasks: [],
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

const TASK_STATUS: Record<string, Status> = {
  pending: 'planning',
  open: 'planning',
  in_progress: 'in_progress',
  completed: 'done',
  done: 'done',
}

const pad = (n: string) => (/^\d+$/.test(n) ? 'T-' + n.padStart(2, '0') : n)

// The task list as Claude keeps it (TaskCreate / TaskUpdate, or TodoWrite), with who is working what
export function applyTaskTool(crew: Crew, tool: string, input: Record<string, unknown>, result: unknown, agentId: string): Crew {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const assign = (c: Crew, task: Task, status: Status): Crew => {
    const agent = c.agents[agentId]
    if (!agent) return c
    // The agent that starts a task is working it: its entries are tagged until it finishes
    if (status === 'in_progress') return { ...c, agents: { ...c.agents, [agentId]: { ...agent, taskId: task.id } } }
    if (agent.taskId === task.id) return { ...c, agents: { ...c.agents, [agentId]: { ...agent, taskId: undefined } } }
    return c
  }

  if (tool === 'TaskCreate') {
    const text = typeof result === 'string' ? result : JSON.stringify(result ?? '')
    const found = text.match(/"(?:id|taskId)"\s*:\s*"?(\d+)/) ?? text.match(/#(\d+)/)
    const id = pad(found?.[1] ?? String(crew.tasks.length + 1))
    if (crew.tasks.some(t => t.id === id)) return crew
    const task: Task = { id, title: str('subject') || str('title') || str('description'), status: 'planning' }
    return { ...crew, tasks: [...crew.tasks, task] }
  }

  if (tool === 'TaskUpdate') {
    const id = pad(str('taskId') || str('id'))
    const raw = str('status')
    if (raw === 'deleted') return { ...crew, tasks: crew.tasks.filter(t => t.id !== id) }
    let task = crew.tasks.find(t => t.id === id)
    if (!task) return crew
    const status = TASK_STATUS[raw] ?? task.status
    const owner = str('owner')
    const ownerId = owner ? Object.values(crew.agents).find(a => a.name === owner || a.id === owner)?.id : undefined
    task = {
      ...task,
      title: str('subject') || task.title,
      status,
      assignee: ownerId ?? (status === 'in_progress' && !task.assignee ? agentId : task.assignee),
    }
    const next = { ...crew, tasks: crew.tasks.map(t => (t.id === id ? task! : t)) }
    return raw ? assign(next, task, status) : next
  }

  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    let next: Crew = crew
    const tasks = (input.todos as Record<string, unknown>[]).map((todo, i) => {
      const title = String(todo.content ?? todo.subject ?? '')
      const prior = crew.tasks.find(t => t.title === title)
      const status = TASK_STATUS[String(todo.status)] ?? 'planning'
      const task: Task = {
        id: prior?.id ?? pad(String(i + 1)),
        title,
        status,
        assignee: prior?.assignee ?? (status !== 'planning' ? agentId : undefined),
      }
      if (status === 'in_progress') next = assign(next, task, status)
      return task
    })
    return { ...next, tasks }
  }

  return crew
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
  return Math.round((mine.filter(t => t.status === 'done').length / mine.length) * 100)
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
