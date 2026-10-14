// The groups agents are in on the Crew tab (mockup: MOCK.statuses)
export type Status = 'planning' | 'in_progress' | 'done'

// One list on the Kanban tab. The defaults are Planning, Backlog, In Progress, In Review, Blocked and
// Done; an agent can add its own with the kanban tool when the work calls for one.
export type Lane = {
  id: string
  label: string
  color: string
  // What a task in this lane means, for the agents reading the board
  hint?: string
  // Added by an agent rather than one of the defaults
  isCustom?: boolean
}

// Drives the dot colour of an activity entry
export type LogKind = 'read' | 'search' | 'edit' | 'run' | 'message'

export type Change = 'added' | 'modified' | 'deleted'

export type Edit = { path: string; change: Change }

export type Entry = {
  seq: number
  at: number
  agentId: string
  kind: LogKind
  text: string
  // Ties the entry to a task, so a task's detail is the merged stream of its entries
  taskId?: string
}

export type Agent = {
  id: string
  // The agent type it was spawned as; `main` for the session's own loop
  type: string
  name?: string
  description: string
  // The engine's word for where the loop stands (running, waiting, failed, ...)
  raw: string
  status: Status
  model?: string
  effort?: string
  // Every token the agent's requests counted, cache included
  tokens: number
  // Token cost weighted by kind, used to share the session's cost out
  weight: number
  ctxTokens: number
  ctxWindow: number
  startedAt: number
  endedAt?: number
  edits: Edit[]
  // The task this agent is working now; its entries are tagged with it
  taskId?: string
  order: number
}

export type Task = {
  id: string
  title: string
  // The lane's id; an agent moves it with the kanban tool, Claude's task tools move it too
  lane: string
  assignee?: string
  // Why it sits where it is ("waiting for CI", "needs tests"), as the agent that moved it said
  note?: string
  // Where the task came from: Claude's TaskCreate / TodoWrite lists, or the kanban tool
  source: 'task' | 'todo' | 'board'
  // The status Claude's task tool last gave it, so a TodoWrite that repeats it leaves a board move be
  toolStatus?: string
  // The agent that moved it last, and when
  movedBy?: string
  movedAt?: number
}

export type Crew = {
  agents: Record<string, Agent>
  tasks: Task[]
  // The Kanban tab's lists, in order
  lanes: Lane[]
  // The last number given a task the kanban tool added (K-01, K-02, ...)
  boardSeq: number
  log: Entry[]
  // Files being written right now: path -> agent ids, newest writer first
  editing: Record<string, string[]>
  tools: number
  seq: number
  root: string
  costUsd: number
  startedAt: number
}

export type Nav = {
  view: 'crew' | 'kanban' | 'agent' | 'task'
  id?: string
  // The tab a detail view was opened from: Back returns there
  from: 'crew' | 'kanban'
}

export type Layout = {
  // Collapsed Kanban lanes, by lane id
  collapsed: Record<string, boolean>
  // Folders the person opened or closed in the Edits tree, by path
  folders: Record<string, boolean>
  // Edits pane width, percent of the detail columns (20-80)
  split: number
  // Entries scrolled back from the newest in the open log; 0 follows new entries
  logBack: number
}

// Pixel-art accessory: rows of palette keys, `.` transparent (mockup: MOCK.mascots.parts)
export type Part = {
  slot: 'hat' | 'prop'
  y: number
  rows: string[]
  palette: Record<string, string>
  source: 'library' | 'generated'
  prompt?: string
}

export type Look = { label: string; color: string; parts: string[] }

declare module 'claude-code' {
  interface PluginState {
    'crew-kanban': {
      crew: Crew
      nav: Nav
      layout: Layout
      isOpen: boolean
      // Accessories Claude drew for agent types the library has none for, by part id
      generated: Record<string, Part>
      // Role look per agent type that has generated accessories
      looks: Record<string, Look>
    }
  }
}
