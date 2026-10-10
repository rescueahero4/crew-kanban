// The Crew pane's screens and the band above the prompt. On the Desktop app the pane is drawn by
// desktop.tsx to the mockup's pixels; here it's the terminal's version: the mockup's order, spacing,
// colours and words on a grid of cells, a Button for everything the mockup made clickable.
import type { Agent, Crew, Entry, Layout, Look, Nav, Part, Status, Task } from '../types'
import { CHANGE, C, KIND, RAW_LABEL, STATUSES, fmtClock, fmtEffort, fmtModel, fmtTime, fmtTokens, statusOf, tint } from './theme'
import { activityOf, agentsIn, isInProject, progressOf } from './model'
import { compose, frameOf, rasterCells, shrink, svgOf } from './mascot'
import { desktopPane } from './desktop'

// Widths in terminal columns that stand in for the mockup's container queries (600/520/420 px)
export const BREAK = { stack: 75, reflow: 65, compact: 52 }

export type Tree = { name: string; kind: 'dir' | 'file'; path: string }[]

export type Ctx = {
  els: any
  surface: string
  cols: number
  rows: number
  // CSS pixels per column on the Desktop app, to size the pixel-drawn parts
  cellPx: number
  now: number
  tick: number
  isReduced: boolean
  crew: Crew
  nav: Nav
  layout: Layout
  lookOf: (agent: Agent) => Look
  partsOf: (look: Look) => Part[]
  // Folder listings the hooks module read from disk, by path ('' is the project folder)
  dirs: Record<string, Tree>
  // Each Raster the drawing holds, so the animation timer can repaint it
  drawn: { key: string; agentId: string; isSmall: boolean }[]
  act: {
    go: (nav: Nav) => void
    back: () => void
    toggleGroup: (status: Status) => void
    toggleFolder: (path: string, isOpen: boolean) => void
    split: (delta: number | 'reset') => void
    scrollLog: (delta: number | 'latest') => void
    togglePane: () => void
  }
}

const LOG_TEXT = '#d6d6d5'

// The project folder's own name, which the Edits tree has as its one root
export const projectName = (root: string) => root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'project'

// A hairline across a panel, between its panes
function rule(ctx: Ctx, width: number, color = C.rule) {
  const { Text } = ctx.els
  return <Text color={color}>{'─'.repeat(Math.max(0, width))}</Text>
}

// .status-label: a dot and the word, both in the status colour
function statusLabel(ctx: Ctx, status: Status, raw?: string) {
  const { Text } = ctx.els
  const st = statusOf(status)
  const finer = raw ? RAW_LABEL[raw] : undefined
  const color = finer?.color ?? st.color
  return <Text color={color}>● {finer?.label ?? st.label}</Text>
}

// ── Mascot ────────────────────────────────────────────────────────────────────────────

export function mascotCells(ctx: Pick<Ctx, 'lookOf' | 'partsOf'>, agent: Agent, tick: number, isSmall: boolean, isReduced: boolean) {
  const frame = isReduced ? { bob: 0, step: -1, isBlink: false } : frameOf(agent.status, tick, agent.order * 3)
  const grid = compose(ctx.partsOf(ctx.lookOf(agent)), frame)
  return rasterCells(isSmall ? shrink(grid) : grid)
}

function mascot(ctx: Ctx, agent: Agent, isSmall: boolean) {
  const { Raster, Svg, Box } = ctx.els
  if (Raster) {
    const key = `m-${agent.id}-${isSmall ? 's' : 'l'}`
    ctx.drawn.push({ key, agentId: agent.id, isSmall })
    const r = mascotCells(ctx, agent, ctx.tick, isSmall, ctx.isReduced)
    return <Raster key={key} columns={r.columns} rows={r.rows} cells={r.cells} />
  }
  if (Svg) return <Svg source={svgOf(compose(ctx.partsOf(ctx.lookOf(agent))))} alt={ctx.lookOf(agent).label} width={55} height={44} />
  return <Box width={0} />
}

// ── Top bar (.topbar): tabs on the left, session totals on the right ────────────────

function topBar(ctx: Ctx) {
  const { Box, Text, Button } = ctx.els
  const isCompact = ctx.cols < BREAK.compact
  const tab = (view: 'crew' | 'kanban', icon: string, label: string, hotkey: string) => {
    // A detail view keeps the tab it was opened from lit
    const isOn = ctx.nav.view === view || ((ctx.nav.view === 'agent' || ctx.nav.view === 'task') && ctx.nav.from === view)
    const button = (
      <Button key={'tab-' + view} plain hotkey={hotkey} label={label} onPress={() => ctx.act.go({ view, from: view })}>
        <Text color={isOn ? C.text : C.dim}>{icon} </Text>
        <Text bold color={isOn ? C.text : C.dim}>{label}</Text>
      </Button>
    )
    // The active tab is a raised pill, open at the bottom onto the bar's rule
    return isOn ? (
      <Box key={'tb-' + view} borderStyle="round" borderColor={C.border} paddingX={1}>{button}</Box>
    ) : (
      <Box key={'tb-' + view} paddingX={2} paddingTop={1}>{button}</Box>
    )
  }
  const tokens = Object.values(ctx.crew.agents).reduce((n, a) => n + a.tokens, 0)
  // .stat: a small bordered box, the label above the value, in monospace grey
  const stat = (label: string, value: string) =>
    isCompact ? (
      <Box key={'s-' + label} borderStyle="round" borderColor={C.border} paddingX={1}><Text color={C.dim}>{value}</Text></Box>
    ) : (
      <Box key={'s-' + label} borderStyle="round" borderColor={C.border} paddingX={1} flexDirection="column">
        <Text color={C.dim}>{label}</Text>
        <Text color={C.dim}>{value}</Text>
      </Box>
    )
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
        <Box flexDirection="row" columnGap={isCompact ? 0 : 1} alignItems="flex-end">
          {tab('crew', '⚇', 'Crew', '1')}
          {tab('kanban', '▥', 'Kanban', '2')}
        </Box>
        <Box flexDirection="row">
          {stat('Cost', '$' + ctx.crew.costUsd.toFixed(2))}
          {ctx.cols >= 42 && stat('Tokens', fmtTokens(tokens))}
          {stat('Time', fmtTime(ctx.crew.startedAt ? ctx.now - ctx.crew.startedAt : 0))}
        </Box>
      </Box>
      {rule(ctx, ctx.cols, C.border)}
    </Box>
  )
}

// ── Agent card (.agent-card) ─────────────────────────────────────────────────────────

function progressBar(ctx: Ctx, agent: Agent, width: number) {
  const { Text } = ctx.els
  const look = ctx.lookOf(agent)
  const pct = progressOf(ctx.crew, agent)
  if (pct === null) return <Text color={tint(look.color, 0.55)}>{'▬'.repeat(Math.max(1, width))}</Text>
  const filled = Math.round((pct / 100) * width)
  return (
    <Text>
      <Text color={look.color}>{'▬'.repeat(filled)}</Text>
      <Text color={C.track}>{'▬'.repeat(Math.max(0, width - filled))}</Text>
    </Text>
  )
}

function agentCard(ctx: Ctx, agent: Agent, width: number, isDetail: boolean) {
  const { Box, Text, Button } = ctx.els
  const look = ctx.lookOf(agent)
  const isReflow = width < BREAK.reflow
  const inner = Math.max(10, width - 4 - 10 - 2)
  const activity = activityOf(ctx.crew, agent)
  const clipped = activity.length > inner ? activity.slice(0, inner - 1) + '…' : activity
  const totalWeight = Object.values(ctx.crew.agents).reduce((n, a) => n + a.weight, 0)
  const cost = totalWeight ? (ctx.crew.costUsd * agent.weight) / totalWeight : 0
  const ctxPct = agent.ctxWindow ? Math.round((agent.ctxTokens / agent.ctxWindow) * 100) : 0
  const usage = `CTX ${ctxPct}% • ${fmtTokens(agent.tokens)} $${cost.toFixed(2)} ${fmtTime((agent.endedAt ?? ctx.now) - agent.startedAt)}`
  const meta = [agent.model ? fmtModel(agent.model) : '', fmtEffort(agent.effort)].filter(Boolean)

  const title = isDetail ? (
    <Text color={C.text} wrap="truncate-end">{activity}</Text>
  ) : (
    <Button key={'open-' + agent.id} plain label={clipped} onPress={() => ctx.act.go({ view: 'agent', id: agent.id, from: 'crew' })}>
      <Text color={C.text}>{clipped}</Text>
    </Button>
  )
  const metaLine = (
    <Text wrap="truncate-end">
      <Text color={look.color}>{look.label}</Text>
      {meta.map(m => <Text color={C.muted}> • {m}</Text>)}
    </Text>
  )

  return (
    <Box key={'card-' + agent.id} flexDirection="row" columnGap={2} paddingX={1} alignItems="center" {...(isDetail ? {} : { borderStyle: 'round', borderColor: C.border })}>
      {mascot(ctx, agent, true)}
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {isReflow ? (
          <Box flexDirection="column">
            {title}
            {metaLine}
            <Text>
              {statusLabel(ctx, agent.status, agent.raw)}
              <Text color={C.muted}>  {usage}</Text>
            </Text>
          </Box>
        ) : (
          <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
            <Box flexDirection="column" flexShrink={1}>
              {title}
              {metaLine}
            </Box>
            <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
              {statusLabel(ctx, agent.status, agent.raw)}
              <Text color={C.muted}>{usage}</Text>
            </Box>
          </Box>
        )}
        {progressBar(ctx, agent, inner)}
      </Box>
    </Box>
  )
}

// ── Crew tab ─────────────────────────────────────────────────────────────────────────

function crewView(ctx: Ctx) {
  const { Box, Text } = ctx.els
  const agents = agentsIn(ctx.crew)
  if (!agents.length) return <Box justifyContent="center" paddingY={2}><Text color={C.muted}>No agents running in this crew yet.</Text></Box>
  return (
    <Box flexDirection="column">
      {STATUSES.filter(st => agents.some(a => a.status === st.id)).map(st => (
        <Box key={'grp-' + st.id} flexDirection="column" marginTop={1}>
          {statusLabel(ctx, st.id)}
          {agents.filter(a => a.status === st.id).map(a => agentCard(ctx, a, ctx.cols, false))}
        </Box>
      ))}
    </Box>
  )
}

// ── Kanban tab ───────────────────────────────────────────────────────────────────────

// .assignee: a pill with the role's dot and name, in the role's colour; dashed when unassigned
function assigneeChip(ctx: Ctx, agent: Agent | undefined, key: string) {
  const { Text, Button } = ctx.els
  if (!agent) return <Text color={C.dim}>╎ Unassigned ╎</Text>
  const look = ctx.lookOf(agent)
  return (
    <Button key={key} plain label={look.label} onPress={() => ctx.act.go({ view: 'agent', id: agent.id, from: ctx.nav.from })}>
      <Text color={C.border}>(</Text>
      <Text color={look.color}>● {look.label}</Text>
      <Text color={C.border}>)</Text>
    </Button>
  )
}

function taskRow(ctx: Ctx, task: Task) {
  const { Box, Text, Button } = ctx.els
  const isDone = task.status === 'done'
  const agent = task.assignee ? ctx.crew.agents[task.assignee] : undefined
  const isReflow = ctx.cols < BREAK.reflow
  return (
    <Box key={'task-' + task.id} flexDirection="row" columnGap={1} paddingX={1}>
      {!isReflow && <Box width={5} flexShrink={0}><Text color={C.dim}>{task.id}</Text></Box>}
      <Box flexGrow={1} flexShrink={1}>
        <Button key={'open-' + task.id} plain label={task.title} onPress={() => ctx.act.go({ view: 'task', id: task.id, from: 'kanban' })}>
          <Text color={isDone ? C.muted : C.text}>{task.title}</Text>
        </Button>
      </Box>
      <Box flexShrink={0}>{assigneeChip(ctx, agent, 'chip-' + task.id)}</Box>
    </Box>
  )
}

function kanbanView(ctx: Ctx) {
  const { Box, Text, Button } = ctx.els
  if (!ctx.crew.tasks.length) return <Box justifyContent="center" paddingY={2}><Text color={C.muted}>No tasks in this crew yet.</Text></Box>
  return (
    <Box flexDirection="column">
      {STATUSES.map(st => {
        const tasks = ctx.crew.tasks.filter(t => t.status === st.id)
        const isCollapsed = !!ctx.layout.collapsed[st.id]
        return (
          <Box key={'tg-' + st.id} flexDirection="column" marginTop={1}>
            <Button key={'toggle-' + st.id} plain label={st.label} onPress={() => ctx.act.toggleGroup(st.id)}>
              <Text color={C.dim}>{isCollapsed ? '› ' : '⌄ '}</Text>
              <Text color={st.color}>● {st.label} </Text>
              <Text color={C.dim}>{tasks.length}</Text>
            </Button>
            {!isCollapsed &&
              (tasks.length ? (
                // .task-list: one card, rows split by hairlines
                <Box flexDirection="column" borderStyle="round" borderColor={C.border}>
                  {tasks.flatMap((t, i) => [...(i ? [rule(ctx, ctx.cols - 2, C.border)] : []), taskRow(ctx, t)])}
                </Box>
              ) : (
                <Box borderStyle="dashed" borderColor={C.border} justifyContent="center">
                  <Text color={C.dim}>No tasks</Text>
                </Box>
              ))}
          </Box>
        )
      })}
    </Box>
  )
}

// ── Activity log (.activity-log): time | rail and dot | text ─────────────────────────

function logPane(ctx: Ctx, entries: Entry[], width: number, height: number, withAgent: boolean, empty: [string, string]) {
  const { Box, Text, Button } = ctx.els
  if (!entries.length) {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={2}>
        <Text color={C.muted}>{empty[0]}</Text>
        <Text color={C.dim}>{empty[1]}</Text>
      </Box>
    )
  }
  // Newest at the bottom; the person can page back, and new entries don't move what they're reading
  const isNarrow = width < 34
  const perEntry = isNarrow ? 3 : 2
  const back = Math.min(ctx.layout.logBack, Math.max(0, entries.length - 1))
  const end = entries.length - back
  const fit = Math.max(1, Math.floor((height - (back ? 1 : 0)) / perEntry))
  const start = Math.max(0, end - fit)
  const shown = entries.slice(start, end)
  const newest = entries[entries.length - 1]
  return (
    <Box flexDirection="column" paddingX={1}>
      {start > 0 && <Button key="log-older" plain hotkey="k" label={`↑ ${start} earlier`} onPress={() => ctx.act.scrollLog(fit)} />}
      {shown.map((entry, i) => {
        const agent = ctx.crew.agents[entry.agentId]
        const look = agent ? ctx.lookOf(agent) : undefined
        const isNewest = entry === newest
        const isLast = i === shown.length - 1
        const words = (
          <Box flexDirection="column" flexShrink={1}>
            {withAgent && look && <Text color={look.color}>{look.label}</Text>}
            <Text bold={isNewest} color={isNewest ? C.text : LOG_TEXT}>{entry.text}</Text>
          </Box>
        )
        const dot = <Text color={KIND[entry.kind]}>●</Text>
        return isNarrow ? (
          <Box key={'e' + entry.seq} flexDirection="column">
            <Text><Text>{dot} </Text><Text color={C.dim}>{fmtClock(entry.at)}</Text></Text>
            <Box paddingLeft={2}>{words}</Box>
            {!isLast && <Text color={C.guide}>│</Text>}
          </Box>
        ) : (
          <Box key={'e' + entry.seq} flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              <Box width={8} flexShrink={0} justifyContent="flex-end"><Text color={C.dim}>{fmtClock(entry.at)}</Text></Box>
              {dot}
              {words}
            </Box>
            {!isLast && <Text color={C.guide}>{'         │'}</Text>}
          </Box>
        )
      })}
      {back > 0 && <Button key="log-latest" plain hotkey="j" label={`↓ ${back} newer · latest`} onPress={() => ctx.act.scrollLog('latest')} />}
    </Box>
  )
}

// .pane-head: title, count, and on the right the path; a hairline under it
function paneHead(ctx: Ctx, width: number, title: string, meta: string, extra?: any) {
  const { Box, Text } = ctx.els
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={1} paddingX={1}>
        <Text bold color={C.text}>{title}</Text>
        {meta && <Text color={C.muted}>{meta}</Text>}
        {extra && <Box flexGrow={1} justifyContent="flex-end">{extra}</Box>}
      </Box>
      {rule(ctx, width)}
    </Box>
  )
}

const entriesLabel = (n: number) => (n ? n + (n === 1 ? ' entry' : ' entries') : '')

// ── Edits tree (.file-tree): the project folder, folders first ───────────────────────

type Node = { name: string; path: string; kind: 'dir' | 'file'; change?: string }

function childrenOf(ctx: Ctx, dir: string, agent: Agent): Node[] {
  const prefix = dir ? dir + '/' : ''
  const nodes: Node[] = (ctx.dirs[dir] ?? []).map(e => ({ name: e.name, path: e.path, kind: e.kind }))
  // Files the agent changed in the project that aren't on disk (deleted, or not listed yet) are drawn back in
  for (const edit of agent.edits) {
    if (!isInProject(edit.path) || !edit.path.startsWith(prefix)) continue
    const [head = '', ...tail] = edit.path.slice(prefix.length).split('/')
    const path = prefix + head
    if (!nodes.some(n => n.path === path)) nodes.push({ name: head, path, kind: tail.length ? 'dir' : 'file' })
  }
  for (const n of nodes) if (n.kind === 'file') n.change = agent.edits.find(e => e.path === n.path)?.change
  return nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

export function isFolderOpen(layout: Layout, crew: Crew, agent: Agent, path: string): boolean {
  if (path === '') return layout.folders[''] ?? true
  const chosen = layout.folders[path]
  if (chosen !== undefined) return chosen
  const prefix = path + '/'
  // Folders holding this agent's changes, or a file anyone is writing now, open by themselves
  return agent.edits.some(e => e.path.startsWith(prefix)) || Object.keys(crew.editing).some(p => p.startsWith(prefix))
}

function folderRow(ctx: Ctx, path: string, name: string, depth: number, isOpen: boolean, hasChanges: boolean) {
  const { Box, Text, Button } = ctx.els
  return (
    <Box key={'r-' + path} flexDirection="row">
      <Text color={C.guide}>{'│ '.repeat(depth)}</Text>
      <Button key={'dir-' + (path || '.')} plain label={name} onPress={() => ctx.act.toggleFolder(path, !isOpen)}>
        <Text color={C.muted}>{isOpen ? '⌄ ' : '› '}</Text>
        <Text color={hasChanges ? C.text : C.muted}>▭ {name}</Text>
      </Button>
    </Box>
  )
}

function treeRows(ctx: Ctx, agent: Agent, dir: string, depth: number, out: any[]) {
  const { Box, Text, Client } = ctx.els
  for (const node of childrenOf(ctx, dir, agent)) {
    if (out.length > 400) return
    if (node.kind === 'dir') {
      const isOpen = isFolderOpen(ctx.layout, ctx.crew, agent, node.path)
      out.push(folderRow(ctx, node.path, node.name, depth, isOpen, agent.edits.some(e => e.path.startsWith(node.path + '/'))))
      if (isOpen) treeRows(ctx, agent, node.path, depth + 1, out)
      continue
    }

    const writers = (ctx.crew.editing[node.path] ?? []).map(id => ctx.crew.agents[id]).filter(Boolean) as Agent[]
    const isMine = writers.some(w => w.id === agent.id)
    const writer = isMine ? agent : writers[0]
    const change = node.change ? CHANGE[node.change as keyof typeof CHANGE] : undefined
    const label = writers.length > 1 ? writers.length + ' agents' : isMine ? 'editing' : writer ? ctx.lookOf(writer).label : ''
    const color = writer ? ctx.lookOf(writer).color : C.muted

    // A file being written: the name shimmers in the writer's colour behind a moving pencil, on a tinted row
    const name = writer ? (
      ctx.isReduced || !Client ? (
        <Text><Text color={color}>✎ </Text><Text bold color={C.text}>{node.name}</Text></Text>
      ) : (
        <Client key={'sh-' + node.path} module="./client/shimmer.ts" props={{ text: node.name, color, muted: '#8a8a89' }} width={node.name.length + 2} />
      )
    ) : (
      <Text>
        <Text color={change ? C.text : C.dim}>▯ </Text>
        <Text color={change ? change.color : C.muted} strikethrough={node.change === 'deleted'}>{node.name}</Text>
      </Text>
    )

    out.push(
      <Box key={'r-' + node.path} flexDirection="row" {...(writer ? { backgroundColor: tint(color, 0.13) } : {})}>
        <Text color={C.guide}>{'│ '.repeat(depth)}</Text>
        <Text>  </Text>
        {name}
        <Box flexGrow={1} />
        {writer && <Text color={color}>{label} </Text>}
        {change && <Text bold color={change.color} backgroundColor={tint(change.color, 0.14)}>{` ${change.badge} `}</Text>}
      </Box>,
    )
  }
}

// ── Agent detail ─────────────────────────────────────────────────────────────────────

function backLink(ctx: Ctx) {
  const { Box, Button, Text } = ctx.els
  return (
    <Box marginTop={1}>
      <Button key="back" plain hotkey="b" label="Back" onPress={() => ctx.act.back()}>
        <Text color={C.accent}>← Back</Text>
      </Button>
    </Box>
  )
}

function missing(ctx: Ctx, what: string) {
  const { Box, Text, Button } = ctx.els
  return (
    <Box flexDirection="row" justifyContent="center" columnGap={1} paddingY={2}>
      <Text color={C.muted}>This {what} no longer exists.</Text>
      <Button key="back-missing" plain hotkey="b" label={what === 'agent' ? 'Back to crew' : 'Back to tasks'} onPress={() => ctx.act.back()}>
        <Text color={C.accent}>{what === 'agent' ? 'Back to crew' : 'Back to tasks'}</Text>
      </Button>
    </Box>
  )
}

// The hairline between the panes is the handle: ‹ and › move it, the grip puts it back at half
function splitter(ctx: Ctx, height: number) {
  const { Box, Text, Button } = ctx.els
  const above = Math.max(0, Math.floor((height - 3) / 2))
  const line = (n: number) => <Text color={C.rule}>{Array.from({ length: n }, () => '│').join('\n')}</Text>
  return (
    <Box flexDirection="column" width={1} flexShrink={0} alignItems="center">
      {above > 0 && line(above)}
      <Button key="split-less" plain hotkey="h" label="‹" onPress={() => ctx.act.split(-10)} />
      <Button key="split-reset" plain hotkey="r" label="┃" onPress={() => ctx.act.split('reset')} />
      <Button key="split-more" plain hotkey="l" label="›" onPress={() => ctx.act.split(10)} />
      {height - above - 3 > 0 && line(height - above - 3)}
    </Box>
  )
}

function agentDetail(ctx: Ctx, agent: Agent | undefined) {
  if (!agent) return missing(ctx, 'agent')
  const { Box, Text } = ctx.els
  const width = ctx.cols
  const isStacked = width < BREAK.stack
  const entries = ctx.crew.log.filter(e => e.agentId === agent.id)
  const root = projectName(ctx.crew.root)
  const tree: any[] = [folderRow(ctx, '', root, 0, isFolderOpen(ctx.layout, ctx.crew, agent, ''), agent.edits.some(e => isInProject(e.path)))]
  if (isFolderOpen(ctx.layout, ctx.crew, agent, '')) treeRows(ctx, agent, '', 1, tree)
  const changed = agent.edits.filter(e => isInProject(e.path)).length
  // Rows left for the two panes once the bar, Back, the card and the pane heads are drawn
  const height = Math.max(8, ctx.rows - 16)
  const editsWidth = isStacked ? width - 2 : Math.round(((width - 5) * ctx.layout.split) / 100)
  const logWidth = isStacked ? width - 2 : width - 5 - editsWidth

  const edits = (
    <Box key="edits" flexDirection="column" flexShrink={0} {...(isStacked ? {} : { width: editsWidth })}>
      {paneHead(ctx, editsWidth, 'Edits', changed ? changed + ' changed' : 'No changes yet',
        ctx.cols >= BREAK.reflow ? <Text color={C.dim} wrap="truncate-start">{ctx.crew.root}</Text> : undefined)}
      <Box flexDirection="column" paddingX={1}>{tree}</Box>
    </Box>
  )
  const log = (
    <Box key="log" flexDirection="column" flexGrow={1} flexShrink={1}>
      {paneHead(ctx, logWidth, 'Activity Log', entriesLabel(entries.length))}
      {logPane(ctx, entries, logWidth, isStacked ? 12 : height, false, ['No activity yet', 'Entries appear here as this agent works.'])}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {backLink(ctx)}
      <Box flexDirection="column" borderStyle="round" borderColor={C.border}>
        {agentCard(ctx, agent, width - 2, true)}
        {rule(ctx, width - 2)}
        {isStacked ? (
          <Box flexDirection="column">
            {edits}
            {log}
          </Box>
        ) : (
          <Box flexDirection="row">
            {edits}
            {splitter(ctx, Math.max(tree.length, height) + 2)}
            {log}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// ── Task detail ──────────────────────────────────────────────────────────────────────

function taskDetail(ctx: Ctx, task: Task | undefined) {
  if (!task) return missing(ctx, 'task')
  const { Box, Text } = ctx.els
  const width = ctx.cols - 2
  const entries = ctx.crew.log.filter(e => e.taskId === task.id)
  // Chips for every agent with activity on the task, assignee first
  const ids = [...new Set([task.assignee, ...entries.map(e => e.agentId)].filter(Boolean))] as string[]
  const agents = ids.map(id => ctx.crew.agents[id]).filter(Boolean) as Agent[]
  const isLive = task.status === 'in_progress'
  return (
    <Box flexDirection="column">
      {backLink(ctx)}
      <Box flexDirection="column" borderStyle="round" borderColor={C.border}>
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Text>
            <Text color={C.dim}>{task.id}  </Text>
            {statusLabel(ctx, task.status)}
          </Text>
          <Text bold color={C.text}>{task.title}</Text>
          <Box flexDirection="row" columnGap={1} flexWrap="wrap" marginTop={1}>
            {agents.length ? agents.map(a => assigneeChip(ctx, a, 'tchip-' + a.id)) : assigneeChip(ctx, undefined, 'tchip-none')}
          </Box>
        </Box>
        {rule(ctx, width)}
        {paneHead(ctx, width, 'Activity', entriesLabel(entries.length), isLive ? <Text color={statusOf('in_progress').color}>● Live</Text> : undefined)}
        {logPane(ctx, entries, width - 2, Math.max(8, ctx.rows - 14), agents.length > 1, [
          'No agent activity on this task',
          'Agent log entries tagged with this task stream in here.',
        ])}
      </Box>
    </Box>
  )
}

// ── The pane ─────────────────────────────────────────────────────────────────────────

export function crewPane(ctx: Ctx) {
  if (ctx.surface === 'desktop' && ctx.els.Svg) return desktopPane(ctx)
  const { Box } = ctx.els
  const body =
    ctx.nav.view === 'crew'
      ? crewView(ctx)
      : ctx.nav.view === 'kanban'
        ? kanbanView(ctx)
        : ctx.nav.view === 'agent'
          ? agentDetail(ctx, ctx.crew.agents[ctx.nav.id ?? ''])
          : taskDetail(ctx, ctx.crew.tasks.find(t => t.id === ctx.nav.id))
  return (
    <Box flexDirection="column" width={ctx.cols}>
      {topBar(ctx)}
      {body}
    </Box>
  )
}

// ── The band above the prompt: the session's crew at a glance, and the way in ──────

export function band(ctx: Pick<Ctx, 'els' | 'cols' | 'crew'> & { isOpen: boolean; toggle: () => void }) {
  const { Box, Text, Button } = ctx.els
  const agents = Object.values(ctx.crew.agents)
  const tasks = ctx.crew.tasks
  const isWide = ctx.cols >= 90
  const isMid = ctx.cols >= 60
  const counts = STATUSES.map(st => ({ st, n: agents.filter(a => a.status === st.id).length })).filter(c => c.n)
  const waiting = agents.filter(a => a.raw === 'waiting').length
  return (
    <Box flexDirection="row" columnGap={2} paddingX={1}>
      <Text color={C.accent}>⚇ Crew</Text>
      <Box flexDirection="row" columnGap={1} flexShrink={1}>
        {counts.map(({ st, n }) => (
          <Text color={st.color}>● {n}{isMid ? ' ' + st.label.toLowerCase() : ''}</Text>
        ))}
        {waiting > 0 && <Text color={RAW_LABEL.waiting.color}>({waiting} waiting)</Text>}
      </Box>
      {isMid && tasks.length > 0 && (
        <Text>
          <Text color={C.muted}>Tasks </Text>
          {tasks.filter(t => t.status === 'done').length}/{tasks.length}
        </Text>
      )}
      {isWide && (
        <Text>
          <Text color={C.muted}>Tools </Text>
          {ctx.crew.tools}
        </Text>
      )}
      {isWide && <Text color={C.muted}>${ctx.crew.costUsd.toFixed(2)}</Text>}
      <Box flexGrow={1} />
      <Button key="crew-toggle" plain hotkey="0" label={ctx.isOpen ? 'Hide Crew' : 'Open Crew'} onPress={ctx.toggle} />
    </Box>
  )
}
