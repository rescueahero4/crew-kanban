// Colour tokens and labels, carried over from the mockup's styles.css and mock-data.js
import type { Change, Lane, Look, LogKind, Status } from '../types'

export const C = {
  text: '#ffffff',
  muted: '#8d8d8d',
  dim: '#777777',
  border: '#303030',
  track: '#363636',
  rule: '#2e2e2d',
  guide: '#333332',
  accent: '#6eb2ff',
  frame: '#1a1a19',
}

export const STATUSES: { id: Status; label: string; color: string }[] = [
  { id: 'planning', label: 'Planning', color: '#9e978e' },
  { id: 'in_progress', label: 'In Progress', color: '#e57a00' },
  { id: 'done', label: 'Done', color: '#2e9310' },
]

export const statusOf = (id: Status) => STATUSES.find(s => s.id === id) ?? STATUSES[0]!

// The Kanban tab's lists before any agent adds one; review, blocked and backlog take the colours the
// claude-kanban board gave its columns
export const DEFAULT_LANES: Lane[] = [
  { id: 'planning', label: 'Planning', color: '#9e978e', hint: 'being scoped or designed; not ready to start' },
  { id: 'backlog', label: 'Backlog', color: '#7a7a7a', hint: 'ready to start, nobody on it yet' },
  { id: 'in_progress', label: 'In Progress', color: '#e57a00', hint: 'an agent is working on it now' },
  { id: 'in_review', label: 'In Review', color: '#b49ae6', hint: 'built; being reviewed, tested or awaiting sign-off' },
  { id: 'blocked', label: 'Blocked', color: '#6cc3d1', hint: 'cannot move until something else happens; say what in the note' },
  { id: 'done', label: 'Done', color: '#2e9310', hint: 'finished and accepted' },
]

// Colours for lanes an agent adds without naming one, taken in turn
export const LANE_COLORS = ['#ec7f6d', '#d8aa52', '#8ea6f2', '#2fbf9b', '#b9509f', '#43aff3']

const UNKNOWN_LANE: Lane = { id: '', label: 'Unsorted', color: '#777777' }
export const laneOf = (lanes: Lane[], id: string): Lane => lanes.find(l => l.id === id) ?? { ...UNKNOWN_LANE, id, label: id }

// A finer word than the group's, shown on the label where the engine says more (Waiting, Failed, ...)
export const RAW_LABEL: Partial<Record<string, { label: string; color?: string }>> & { waiting: { label: string; color: string } } = {
  waiting: { label: 'Waiting', color: '#e5a800' },
  idle: { label: 'Idle' },
  failed: { label: 'Failed', color: '#e5534b' },
  killed: { label: 'Stopped', color: '#e5534b' },
}

export const CHANGE: Record<Change, { badge: string; color: string }> = {
  added: { badge: 'A', color: '#57b33a' },
  modified: { badge: 'M', color: '#e5a800' },
  deleted: { badge: 'D', color: '#e5534b' },
}

export const KIND: Record<LogKind, string> = {
  read: '#8d8d8d',
  search: '#8d8d8d',
  edit: '#e5a800',
  run: '#6eb2ff',
  message: '#e8e8e7',
}

// The four library roles (mockup: MOCK.roles)
export const ROLES: Record<string, Look> = {
  lead: { label: 'Lead Agent', color: '#6b4fc8', parts: ['wizard-hat', 'staff'] },
  review: { label: 'Review Agents', color: '#43aff3', parts: ['detective-hat', 'magnifier'] },
  implementation: { label: 'Implementation Agent', color: '#b9509f', parts: ['hard-hat', 'wrench'] },
  designer: { label: 'Designer Agent', color: '#2fbf9b', parts: ['beret', 'paintbrush'] },
}

// Agent types that are plain workers: they wear the implementation kit, never a generated one
const GENERIC = /^(general-purpose|fork|claude|teammate|statusline-setup)$/i

// Which library role an agent type wears, or undefined for a type Claude should draw accessories for
export function roleOf(type: string): string | undefined {
  const name = type.replace(/^.*:/, '')
  if (type === 'main' || /^plan$|lead|orchestrat|architect/i.test(name)) return 'lead'
  if (/review|critique|qa|test|audit|verif|hunter|walker|explore|security/i.test(name)) return 'review'
  if (/design|ux|ui\b|impeccable|visual|brand/i.test(name)) return 'designer'
  if (GENERIC.test(name) || /implement|build|code|engineer|fix|dev/i.test(name)) return 'implementation'
  return undefined
}

const SPARE = ['#d77757', '#e5a800', '#57b33a', '#6eb2ff', '#b48ead', '#f2b84b', '#43c6c6']

// A look for a type with no library role, until Claude has drawn its accessories
export function provisionalLook(type: string): Look {
  const name = type.replace(/^.*:/, '')
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const label = name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return { label: label + ' Agent', color: SPARE[Math.abs(hash) % SPARE.length] ?? C.accent, parts: ['hard-hat', 'wrench'] }
}

// Mixes a colour toward the frame colour: the row tint behind a file being written
export function tint(hex: string, amount = 0.18): string {
  const parse = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
  const [r, g, b] = parse(hex)
  const [fr, fg, fb] = parse(C.frame)
  const mix = (a: number, f: number) => Math.round(f + (a - f) * amount)
  return '#' + [mix(r, fr), mix(g, fg), mix(b, fb)].map(n => n.toString(16).padStart(2, '0')).join('')
}

export const fmtTokens = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n)

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60))
  const ss = String(s % 60).padStart(2, '0')
  return h ? h + ':' + mm.padStart(2, '0') + ':' + ss : mm + ':' + ss
}

// The viewer's local time, hh:mm:ss
export const fmtClock = (ms: number) => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

export const fmtModel = (model?: string) => {
  if (!model) return '—'
  const m = model.match(/(opus|sonnet|haiku|fable)[-_ ]?(\d+)(?:[-_.](\d+))?/i)
  if (!m) return model
  const [, name = '', major = '', minor] = m
  const family = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  return family + ' ' + major + (minor && minor.length < 3 ? '.' + minor : '')
}

export const fmtEffort = (effort?: string) => (effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : '')
