// The Crew pane's screens and the band above the prompt, drawn from the mockup's structure with the
// elements a mod has: Box and Text for layout, a Button for everything the mockup made clickable.
import type { Agent, Crew, Entry, Layout, Look, Nav, Part, Status, Task } from '../types'
import { CHANGE, C, KIND, RAW_LABEL, STATUSES, fmtClock, fmtEffort, fmtModel, fmtTime, fmtTokens, statusOf, tint } from './theme'
import { activityOf, agentsIn, progressOf } from './model'
import { compose, frameOf, rasterCells, shrink, svgOf } from './mascot'

// Widths in terminal columns that stand in for the mockup's container queries (600/520/420 px)
export const BREAK = { stack: 75, reflow: 65, compact: 52 }

export type Tree = { name: string; kind: 'dir' | 'file'; path: string }[]

export type Ctx = {
  els: any
  surface: string
  cols: number
  rows: number
  now: number
  tick: number
  isReduced: boolean
  crew: Crew
  nav: Nav
  layout: Layout
  lookOf: (agent: Agent) => Look
  partsOf: (look: Look) => Part[]
  // Folder listings the hooks module read from disk, by path ('' is the root)
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

// A hairline across a panel, between its panes
function rule(ctx: Ctx, width: number) {
  const { Text } = ctx.els
  return <Text color={C.rule}>{'─'.repeat(Math.max(0, width))}</Text>
}

function statusLabel(ctx: Ctx, status: Status, raw?: string) {
  const { Text } = ctx.els
  const st = statusOf(status)
  const finer = raw ? RAW_LABEL[raw] : undefined
  return (
    <Text>
      <Text color={finer?.color ?? st.color}>● </Text>
      <Text color={finer?.color ?? C.text}>{finer?.label ?? st.label}</Text>
    </Text>
  )
}

// ── Mascot ────────────────────────────────────────────────────────────────────────────

export function mascotCells(ctx: Pick<Ctx, 'lookOf' | 'partsOf'>, agent: Agent, tick: number, isSmall: boolean, isReduced: boolean) {
  const frame = isReduced ? { bob: 0, step: -1, isBlink: false } : frameOf(agent.status, tick, agent.order * 3)
  const grid = compose(ctx.partsOf(ctx.lookOf(agent)), frame)
  return rasterCells(isSmall ? shrink(grid) : grid)
}

function mascot(ctx: Ctx, agent: Agent, isSmall: boolean) {
  const { Raster, Svg, Box } = ctx.els
  if (ctx.surface === 'terminal' && Raster) {
    const key = `m-${agent.id}-${isSmall ? 's' : 'l'}`
    ctx.drawn.push({ key, agentId: agent.id, isSmall })
    const r = mascotCells(ctx, agent, ctx.tick, isSmall, ctx.isReduced)
    return <Raster key={key} columns={r.columns} rows={r.rows} cells={r.cells} />
  }
  if (Svg) {
    const source = svgOf(compose(ctx.partsOf(ctx.lookOf(agent))))
    return <Svg source={source} alt={ctx.lookOf(agent).label} width={isSmall ? 10 : 20} height={isSmall ? 4 : 8} />
  }
  return <Box width={0} />
}

// ── Top bar: tabs and session totals ─────────────────────────────────────────────────

function topBar(ctx: Ctx) {
  const { Box, Text, Button } = ctx.els
  const isCompact = ctx.cols < BREAK.compact
  const tab = (view: 'crew' | 'kanban', icon: string, label: string, hotkey: string) => {
    // A detail view keeps the tab it was opened from lit
    const isOn = ctx.nav.view === view || ((ctx.nav.view === 'agent' || ctx.nav.view === 'task') && ctx.nav.from === view)
    return (
      <Box flexDirection="column">
        <Button key={'tab-' + view} plain hotkey={hotkey} dimColor={!isOn} label={`${icon} ${label}`} onPress={() => ctx.act.go({ view, from: view })} />
        <Text color={isOn ? C.accent : C.frame}>{'━'.repeat(label.length + 5)}</Text>
      </Box>
    )
  }
  const usage = ctx.crew
  const tokens = Object.values(usage.agents).reduce((n, a) => n + a.tokens, 0)
  const stat = (label: string, value: string) => (
    <Text>
      {!isCompact && <Text color={C.muted}>{label} </Text>}
      <Text bold>{value}</Text>
    </Text>
  )
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start" paddingX={1}>
      <Box flexDirection="row" columnGap={2}>
        {tab('crew', '✦', 'Crew', '1')}
        {tab('kanban', '▦', 'Kanban', '2')}
      </Box>
      <Box flexDirection="row" columnGap={2}>
        {stat('Cost', '$' + usage.costUsd.toFixed(2))}
        {stat('Tokens', fmtTokens(tokens))}
        {stat('Time', fmtTime(usage.startedAt ? ctx.now - usage.startedAt : 0))}
      </Box>
    </Box>
  )
}

// ── Agent card ───────────────────────────────────────────────────────────────────────

function progressBar(ctx: Ctx, agent: Agent, width: number) {
  const { Text } = ctx.els
  const look = ctx.lookOf(agent)
  const pct = progressOf(ctx.crew, agent)
  if (pct === null) return <Text color={tint(look.color, 0.55)}>{'╌'.repeat(Math.max(1, width))}</Text>
  const filled = Math.round((pct / 100) * width)
  return (
    <Text>
      <Text color={look.color}>{'━'.repeat(filled)}</Text>
      <Text color={C.track}>{'━'.repeat(Math.max(0, width - filled))}</Text>
    </Text>
  )
}

function agentCard(ctx: Ctx, agent: Agent, width: number, isDetail: boolean) {
  const { Box, Text, Button } = ctx.els
  const look = ctx.lookOf(agent)
  const isReflow = width < BREAK.reflow
  const mascotWidth = isDetail && !isReflow ? 20 : 10
  const inner = Math.max(10, width - (isDetail ? 2 : 4) - mascotWidth - 2)
  const activity = activityOf(ctx.crew, agent)
  const clipped = activity.length > inner ? activity.slice(0, inner - 1) + '…' : activity
  const totalWeight = Object.values(ctx.crew.agents).reduce((n, a) => n + a.weight, 0)
  const cost = totalWeight ? (ctx.crew.costUsd * agent.weight) / totalWeight : 0
  const ctxPct = agent.ctxWindow ? Math.round((agent.ctxTokens / agent.ctxWindow) * 100) : 0
  const usage = `CTX ${ctxPct}%・${fmtTokens(agent.tokens)} ≈$${cost.toFixed(2)} ${fmtTime((agent.endedAt ?? ctx.now) - agent.startedAt)}`
  const meta = [fmtModel(agent.model), fmtEffort(agent.effort)].filter(Boolean).join(' ・ ')

  const body = (
    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
      <Box flexDirection={isReflow ? 'column' : 'row'} justifyContent="space-between" columnGap={2}>
        <Box flexDirection="column" flexShrink={1}>
          {isDetail ? (
            <Text bold wrap="truncate-end">{activity}</Text>
          ) : (
            <Button key={'open-' + agent.id} plain label={clipped} onPress={() => ctx.act.go({ view: 'agent', id: agent.id, from: 'crew' })} />
          )}
          <Text wrap="truncate-end">
            <Text color={look.color}>{look.label}</Text>
            <Text color={C.muted}>・{meta}</Text>
          </Text>
        </Box>
        <Box flexDirection="column" alignItems={isReflow ? 'flex-start' : 'flex-end'} flexShrink={0}>
          {statusLabel(ctx, agent.status, agent.raw)}
          <Text color={C.muted}>{usage}</Text>
        </Box>
      </Box>
      {progressBar(ctx, agent, inner)}
    </Box>
  )

  return (
    <Box key={'card-' + agent.id} flexDirection="row" columnGap={2} paddingX={1} {...(isDetail ? {} : { borderStyle: 'round', borderColor: C.border })}>
      {mascot(ctx, agent, mascotWidth === 10)}
      {body}
    </Box>
  )
}

// ── Crew tab ─────────────────────────────────────────────────────────────────────────

function crewView(ctx: Ctx) {
  const { Box, Text } = ctx.els
  const agents = agentsIn(ctx.crew)
  if (!agents.length) return <Box paddingX={1} paddingY={1}><Text color={C.muted}>No agents running in this crew yet.</Text></Box>
  return (
    <Box flexDirection="column" paddingX={1} rowGap={0}>
      {STATUSES.filter(st => agents.some(a => a.status === st.id)).map(st => {
        const group = agents.filter(a => a.status === st.id)
        return (
          <Box key={'grp-' + st.id} flexDirection="column" marginTop={1}>
            {statusLabel(ctx, st.id)}
            {group.map(a => agentCard(ctx, a, ctx.cols - 2, false))}
          </Box>
        )
      })}
    </Box>
  )
}

// ── Kanban tab ───────────────────────────────────────────────────────────────────────

function assigneeChip(ctx: Ctx, agent: Agent | undefined, key: string) {
  const { Text, Button } = ctx.els
  if (!agent) return <Text color={C.dim}>◌ Unassigned</Text>
  const look = ctx.lookOf(agent)
  return (
    <Button key={key} plain label={look.label} onPress={() => ctx.act.go({ view: 'agent', id: agent.id, from: ctx.nav.from })}>
      <Text color={look.color}>● </Text>
      <Text color={look.color}>{look.label}</Text>
    </Button>
  )
}

function taskRow(ctx: Ctx, task: Task) {
  const { Box, Text, Button } = ctx.els
  const isDone = task.status === 'done'
  const agent = task.assignee ? ctx.crew.agents[task.assignee] : undefined
  const isReflow = ctx.cols < BREAK.reflow
  return (
    <Box key={'task-' + task.id} flexDirection={isReflow ? 'column' : 'row'} columnGap={2} paddingLeft={2}>
      {!isReflow && <Box width={5} flexShrink={0}><Text color={C.dim}>{task.id}</Text></Box>}
      <Box flexGrow={1} flexShrink={1}>
        <Button key={'open-' + task.id} plain dimColor={isDone} label={task.title} onPress={() => ctx.act.go({ view: 'task', id: task.id, from: 'kanban' })} />
      </Box>
      <Box flexShrink={0} paddingLeft={isReflow ? 2 : 0}>{assigneeChip(ctx, agent, 'chip-' + task.id)}</Box>
    </Box>
  )
}

function kanbanView(ctx: Ctx) {
  const { Box, Text, Button } = ctx.els
  if (!ctx.crew.tasks.length) return <Box paddingX={1} paddingY={1}><Text color={C.muted}>No tasks in this crew yet.</Text></Box>
  return (
    <Box flexDirection="column" paddingX={1}>
      {STATUSES.map(st => {
        const tasks = ctx.crew.tasks.filter(t => t.status === st.id)
        const isCollapsed = !!ctx.layout.collapsed[st.id]
        return (
          <Box key={'tg-' + st.id} flexDirection="column" marginTop={1}>
            <Button key={'toggle-' + st.id} plain label={st.label} onPress={() => ctx.act.toggleGroup(st.id)}>
              <Text color={C.muted}>{isCollapsed ? '▸ ' : '▾ '}</Text>
              <Text color={st.color}>● </Text>
              <Text>{st.label} </Text>
              <Text color={C.muted}>{tasks.length}</Text>
            </Button>
            {!isCollapsed && (tasks.length ? tasks.map(t => taskRow(ctx, t)) : <Box paddingLeft={2}><Text color={C.dim}>No tasks</Text></Box>)}
          </Box>
        )
      })}
    </Box>
  )
}

// ── Activity log, shared by the agent and task details ───────────────────────────────

function logPane(ctx: Ctx, entries: Entry[], width: number, height: number, withAgent: boolean, empty: [string, string]) {
  const { Box, Text, Button } = ctx.els
  if (!entries.length) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold>{empty[0]}</Text>
        <Text color={C.muted}>{empty[1]}</Text>
      </Box>
    )
  }
  // Newest at the bottom; the person can page back, and new entries don't move what they're reading
  const isNarrow = width < 40
  const perEntry = isNarrow ? 2 : 1
  const back = Math.min(ctx.layout.logBack, Math.max(0, entries.length - 1))
  const end = entries.length - back
  const fit = Math.max(1, Math.floor((height - (back ? 1 : 0)) / perEntry) - 1)
  const start = Math.max(0, end - fit)
  const shown = entries.slice(start, end)
  const newest = entries[entries.length - 1]
  return (
    <Box flexDirection="column" paddingX={1}>
      {start > 0 && <Button key="log-older" plain hotkey="k" label={`↑ ${start} earlier`} onPress={() => ctx.act.scrollLog(fit)} />}
      {shown.map(entry => {
        const agent = ctx.crew.agents[entry.agentId]
        const look = agent ? ctx.lookOf(agent) : undefined
        const isNewest = entry === newest
        const text = (
          <Text bold={isNewest} color={isNewest ? C.text : C.muted} wrap="truncate-end">
            {withAgent && look && <Text color={look.color}>{look.label} </Text>}
            {entry.text}
          </Text>
        )
        return isNarrow ? (
          <Box key={'e' + entry.seq} flexDirection="column">
            <Text color={C.dim}>{fmtClock(entry.at)}</Text>
            <Box flexDirection="row" columnGap={1}>
              <Text color={KIND[entry.kind]}>●</Text>
              {text}
            </Box>
          </Box>
        ) : (
          <Box key={'e' + entry.seq} flexDirection="row" columnGap={1}>
            <Text color={KIND[entry.kind]}>{isNewest ? '●' : '•'}</Text>
            <Box flexGrow={1} flexShrink={1}>{text}</Box>
            <Text color={C.dim}>{fmtClock(entry.at)}</Text>
          </Box>
        )
      })}
      {back > 0 && <Button key="log-latest" plain hotkey="j" label={`↓ ${back} newer · latest`} onPress={() => ctx.act.scrollLog('latest')} />}
    </Box>
  )
}

function paneHead(ctx: Ctx, title: string, meta: string, extra?: any) {
  const { Box, Text } = ctx.els
  return (
    <Box flexDirection="row" columnGap={1} paddingX={1}>
      <Text bold>{title}</Text>
      {meta && <Text color={C.muted}>{meta}</Text>}
      {extra}
    </Box>
  )
}

const entriesLabel = (n: number) => (n ? n + (n === 1 ? ' entry' : ' entries') : '')

// ── Edits tree ───────────────────────────────────────────────────────────────────────

type Node = { name: string; path: string; kind: 'dir' | 'file'; change?: string }

function childrenOf(ctx: Ctx, dir: string, agent: Agent): Node[] {
  const prefix = dir ? dir + '/' : ''
  const nodes: Node[] = (ctx.dirs[dir] ?? []).map(e => ({ name: e.name, path: e.path, kind: e.kind }))
  // Files the agent changed that aren't on disk (deleted, or not listed yet) are drawn back in
  for (const edit of agent.edits) {
    if (!edit.path.startsWith(prefix)) continue
    const rest = edit.path.slice(prefix.length)
    const [head = '', ...tail] = rest.split('/')
    const path = prefix + head
    if (!nodes.some(n => n.path === path)) nodes.push({ name: head, path, kind: tail.length ? 'dir' : 'file' })
  }
  for (const n of nodes) if (n.kind === 'file') n.change = agent.edits.find(e => e.path === n.path)?.change
  return nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

export function isFolderOpen(layout: Layout, crew: Crew, agent: Agent, path: string): boolean {
  const chosen = layout.folders[path]
  if (chosen !== undefined) return chosen
  const prefix = path + '/'
  // Folders holding this agent's changes, or a file anyone is writing now, open by themselves
  return agent.edits.some(e => e.path.startsWith(prefix)) || Object.keys(crew.editing).some(p => p.startsWith(prefix))
}

function treeRows(ctx: Ctx, agent: Agent, dir: string, depth: number, out: any[], width: number) {
  const { Box, Text, Button, Client } = ctx.els
  for (const node of childrenOf(ctx, dir, agent)) {
    if (out.length > 400) return
    const guides = <Text color={C.guide}>{'│ '.repeat(depth)}</Text>
    if (node.kind === 'dir') {
      const isOpen = isFolderOpen(ctx.layout, ctx.crew, agent, node.path)
      const hasChanges = agent.edits.some(e => e.path.startsWith(node.path + '/'))
      out.push(
        <Box key={'r-' + node.path} flexDirection="row">
          {guides}
          <Button key={'dir-' + node.path} plain label={node.name} onPress={() => ctx.act.toggleFolder(node.path, !isOpen)}>
            <Text color={C.muted}>{isOpen ? '▾ ' : '▸ '}</Text>
            <Text color={hasChanges ? C.text : C.muted}>{node.name}</Text>
          </Button>
        </Box>,
      )
      if (isOpen) treeRows(ctx, agent, node.path, depth + 1, out, width)
      continue
    }

    const writers = (ctx.crew.editing[node.path] ?? []).map(id => ctx.crew.agents[id]).filter(Boolean) as Agent[]
    const isMine = writers.some(w => w.id === agent.id)
    const writer = isMine ? agent : writers[0]
    const change = node.change ? CHANGE[node.change as keyof typeof CHANGE] : undefined
    const label = writers.length > 1 ? writers.length + ' agents' : isMine ? 'editing' : writer ? ctx.lookOf(writer).label : ''
    const color = writer ? ctx.lookOf(writer).color : C.muted

    // A file being written: the name shimmers in the writer's colour behind a moving pencil, on a tinted row
    const name = writer
      ? ctx.isReduced || !Client
        ? <Text><Text color={color}>✎ </Text><Text bold color={C.text}>{node.name}</Text></Text>
        : <Client key={'sh-' + node.path} module="./client/shimmer.ts" props={{ text: node.name, color, muted: C.muted }} width={node.name.length + 2} />
      : <Text>
          <Text color={C.dim}>· </Text>
          <Text color={change ? C.text : C.muted} strikethrough={node.change === 'deleted'}>{node.name}</Text>
        </Text>

    out.push(
      <Box key={'r-' + node.path} flexDirection="row" {...(writer ? { backgroundColor: tint(color) } : {})}>
        {guides}
        {name}
        <Box flexGrow={1} />
        {writer && <Text color={color}>{label} </Text>}
        {change && <Text bold color={change.color}>{change.badge}</Text>}
      </Box>,
    )
  }
}

// ── Agent detail ─────────────────────────────────────────────────────────────────────

function backLink(ctx: Ctx) {
  const { Box, Button } = ctx.els
  return (
    <Box paddingX={1} marginTop={1}>
      <Button key="back" plain hotkey="b" label="← Back" onPress={() => ctx.act.back()} />
    </Box>
  )
}

function missing(ctx: Ctx, what: string) {
  const { Box, Text, Button } = ctx.els
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} rowGap={1}>
      <Text color={C.muted}>This {what} no longer exists.</Text>
      <Button key="back-missing" plain hotkey="b" label={what === 'agent' ? '← Back to crew' : '← Back to tasks'} onPress={() => ctx.act.back()} />
    </Box>
  )
}

function splitter(ctx: Ctx, height: number) {
  const { Box, Text, Button } = ctx.els
  return (
    <Box flexDirection="column" width={1} flexShrink={0} alignItems="center">
      <Button key="split-less" plain hotkey="h" label="◂" onPress={() => ctx.act.split(-10)} />
      <Button key="split-reset" plain hotkey="r" label="┃" onPress={() => ctx.act.split('reset')} />
      <Button key="split-more" plain hotkey="l" label="▸" onPress={() => ctx.act.split(10)} />
      <Text color={C.rule}>{Array.from({ length: Math.max(0, height - 3) }, () => '│').join('\n')}</Text>
    </Box>
  )
}

function agentDetail(ctx: Ctx, agent: Agent | undefined) {
  if (!agent) return missing(ctx, 'agent')
  const { Box, Text } = ctx.els
  const width = ctx.cols - 2
  const isStacked = width < BREAK.stack
  const entries = ctx.crew.log.filter(e => e.agentId === agent.id)
  const tree: any[] = []
  treeRows(ctx, agent, '', 0, tree, width)
  const changed = agent.edits.length
  // Rows left for the two panes once the bar, Back, the card and the pane heads are drawn
  const height = Math.max(8, ctx.rows - (width < BREAK.reflow ? 16 : 14))
  const editsWidth = isStacked ? width : Math.round(((width - 3) * ctx.layout.split) / 100)
  const logWidth = isStacked ? width : width - 3 - editsWidth

  const edits = (
    <Box key="edits" flexDirection="column" flexShrink={0} {...(isStacked ? {} : { width: editsWidth })}>
      {paneHead(ctx, 'Edits', changed ? changed + ' changed' : 'No changes yet',
        <Box flexGrow={1} justifyContent="flex-end"><Text color={C.dim} wrap="truncate-start">{ctx.crew.root}</Text></Box>)}
      <Box flexDirection="column" paddingX={1}>{tree.length ? tree : <Text color={C.muted}>Reading the workspace…</Text>}</Box>
    </Box>
  )
  const log = (
    <Box key="log" flexDirection="column" flexGrow={1} flexShrink={1}>
      {paneHead(ctx, 'Activity Log', entriesLabel(entries.length))}
      {logPane(ctx, entries, logWidth, isStacked ? 10 : height, false, ['No activity yet', 'Entries appear here as this agent works.'])}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {backLink(ctx)}
      <Box flexDirection="column" borderStyle="round" borderColor={C.border} marginX={1}>
        {agentCard(ctx, agent, width, true)}
        {rule(ctx, width - 2)}
        {isStacked ? (
          <Box flexDirection="column">
            {edits}
            {rule(ctx, width - 2)}
            {log}
          </Box>
        ) : (
          <Box flexDirection="row">
            {edits}
            <Box paddingX={1}>{splitter(ctx, Math.max(tree.length, height) + 1)}</Box>
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
      <Box flexDirection="column" borderStyle="round" borderColor={C.border} marginX={1}>
        <Box flexDirection="column" paddingX={1}>
          <Text>
            <Text color={C.muted}>{task.id}  </Text>
            {statusLabel(ctx, task.status)}
          </Text>
          <Text bold>{task.title}</Text>
          <Box flexDirection="row" columnGap={2} flexWrap="wrap">
            {agents.length ? agents.map(a => assigneeChip(ctx, a, 'tchip-' + a.id)) : assigneeChip(ctx, undefined, 'tchip-none')}
          </Box>
        </Box>
        {rule(ctx, width - 2)}
        {paneHead(ctx, 'Activity', entriesLabel(entries.length), isLive ? <Text color="#e5534b">● Live</Text> : null)}
        {logPane(ctx, entries, width - 2, Math.max(8, ctx.rows - 12), agents.length > 1, [
          'No agent activity on this task',
          'Agent log entries tagged with this task stream in here.',
        ])}
      </Box>
    </Box>
  )
}

// ── The pane ─────────────────────────────────────────────────────────────────────────

export function crewPane(ctx: Ctx) {
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
      <Text color={C.accent}>✦ Crew</Text>
      <Box flexDirection="row" columnGap={1} flexShrink={1}>
        {counts.map(({ st, n }) => (
          <Text>
            <Text color={st.color}>●</Text>
            <Text> {n}{isMid ? ' ' + st.label.toLowerCase() : ''}</Text>
          </Text>
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
