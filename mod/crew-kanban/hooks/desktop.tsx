// The Crew pane on the Desktop app, drawn to the mockup's own CSS (.design-recall/mockups/styles.css).
// The desktop lays Boxes out in cells of its code font and draws Text in that font, so everything that
// carries the mockup's pixels is SVG: words at the mockup's Inter sizes, hairlines, radii, and every
// vertical space (an empty SVG of so many px, never a padding of rows). What is pressed is a native
// Button (its label one cell per character), drawn over or beside the SVG it belongs to.
import type { Agent, Change, Entry, Status, Task } from '../types'
import { CHANGE, GIT, STATUSES, fmtClock, fmtEffort, fmtModel, fmtTime, fmtTokens, laneOf, statusOf } from './theme'
import { activityOf, agentsIn, gitLabelOf, isInProject, progressOf } from './model'
import { CANVAS, compose } from './mascot'
import { ICON } from './icons'
import { isFolderOpen, lanesShown, type Ctx } from './views'

// The mockup's tokens
const T = {
  frame: '#1a1a19',
  card: '#242424',
  border: '#303030',
  track: '#363636',
  text: '#ffffff',
  muted: '#8d8d8d',
  dim: '#777777',
  accent: '#6eb2ff',
  surface: '#222221',
  raised: '#2a2a29',
  rule: '#2e2e2d',
  guide: '#333332',
  logText: '#d6d6d5',
}
const SANS = `Inter, 'Segoe UI', system-ui, sans-serif`
const MONO = `'Fira Mono', Consolas, monospace`
const KIND_DOT: Record<string, string> = { read: '#8d8d8d', search: '#8d8d8d', edit: '#e5a800', run: '#6eb2ff', message: '#e8e8e7' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Inter's advance widths, near enough to size an SVG to its text (em units)
function measure(s: string, px: number, isBold = false, isMono = false): number {
  if (isMono) return s.length * px * 0.6
  let em = 0
  for (const ch of s) {
    if (/[il.,:;'|!·•]/.test(ch)) em += 0.26
    else if (ch === ' ') em += 0.27
    else if (/[fjrt()[\]/\-]/.test(ch)) em += 0.36
    else if (/[mwMW]/.test(ch)) em += 0.86
    else if (/[A-Z]/.test(ch)) em += 0.68
    else if (/[0-9$%]/.test(ch)) em += 0.62
    else if (/[→—–・]/.test(ch)) em += 0.9
    else em += 0.56
  }
  return em * px * (isBold ? 1.06 : 1)
}

function wrap(s: string, width: number, px: number, isBold = false): string[] {
  const out: string[] = []
  let line = ''
  for (const word of s.split(' ')) {
    const next = line ? line + ' ' + word : word
    if (line && measure(next, px, isBold) > width) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

function fit(s: string, width: number, px: number, isBold = false): string {
  if (measure(s, px, isBold) <= width) return s
  let t = s
  while (t.length > 1 && measure(t + '…', px, isBold) > width) t = t.slice(0, -1)
  return t + '…'
}

// A Button's label is one cell per character
function fitCells(ctx: Ctx, s: string, width: number): string {
  const n = Math.max(2, Math.floor(width / ctx.cellPx))
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

const doc = (w: number, h: number, body: string, style = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}">` +
  (style ? `<style>${style}</style>` : '') +
  body +
  `</svg>`

const text = (x: number, y: number, s: string, px: number, fill: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${px}" fill="${fill}" ${extra}>${esc(s)}</text>`

// (no parameter may be called `h`: JSX compiles against the global of that name)
function svg(ctx: Ctx, width: number, height: number, body: string, alt: string, style = '', isInteractive = false) {
  const { Svg } = ctx.els
  return <Svg source={doc(width, height, body, style)} alt={alt} width={Math.ceil(width)} height={Math.ceil(height)} {...(isInteractive ? { isInteractive: true } : {})} />
}

// Exact space: an empty drawing of so many px (a Box's padding and gaps are whole rows and cells)
function vgap(ctx: Ctx, key: string, px: number) {
  const { Box } = ctx.els
  return <Box key={key}>{svg(ctx, 1, px, '', '')}</Box>
}
function hgap(ctx: Ctx, px: number) {
  return svg(ctx, px, 1, '', '')
}
// Items with the same space between each, as a flex `gap` does
function spaced(ctx: Ctx, key: string, items: any[], px: number) {
  return items.flatMap((item, i) => (i ? [vgap(ctx, `${key}-${i}`, px), item] : [item]))
}

// Width of the pane in CSS pixels: its columns in the desktop's cell metric
const paneWidth = (ctx: Ctx) => Math.min(1200, ctx.cols * ctx.cellPx)

// A colour laid over another at some strength (CSS color-mix in srgb)
function over(hex: string, amount: number, base = T.surface) {
  const rgb = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16))
  const [a, b] = [rgb(hex), rgb(base)]
  return '#' + a.map((v, i) => Math.round(b[i]! + (v - b[i]!) * amount).toString(16).padStart(2, '0')).join('')
}

// ── Pieces ───────────────────────────────────────────────────────────────────────────

// .status-label: 6px dot, 5px gap, 11px label, line 16.5
function statusLabelSvg(ctx: Ctx, status: Status, raw?: string) {
  const st = statusOf(status)
  const label = raw === 'waiting' ? 'Waiting' : raw === 'failed' ? 'Failed' : raw === 'killed' ? 'Stopped' : st.label
  const color = raw === 'failed' || raw === 'killed' ? '#e5534b' : raw === 'waiting' ? '#e5a800' : st.color
  const w = 11 + measure(label, 11) + 2
  const body = `<circle cx="3" cy="8.25" r="3" fill="${color}"/>` + text(11, 12.4, label, 11, color)
  return svg(ctx, w, 17, body, label)
}

// Clawd with the role's accessories, and the mockup's one shared animation (steps, paced by status)
function mascotSvg(ctx: Ctx, agent: Agent, w: number, ht: number) {
  const look = ctx.lookOf(agent)
  const parts = ctx.partsOf(look)
  const grid = compose(parts)
  const groups = { rig: '', eye: '', a: '', b: '' }
  // Rebuild the layers the CSS animates: rig (bobs), eyes (blink), the two leg pairs (step)
  const base = compose([], { bob: 0, step: -1, isBlink: false })
  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return
      const rect = `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`
      const isBody = base[y]?.[x] === c
      if (isBody && y >= 13) groups[x === 5 || x === 12 ? 'a' : 'b'] += rect
      else if (isBody && c === '#1a1a19') groups.eye += rect
      else groups.rig += rect
    }),
  )
  const delay = -(agent.order * 0.37)
  const status = ctx.isReduced ? 'still' : agent.status
  const style =
    `.r,.a,.b,.e{animation-delay:${delay}s}` +
    `.e{animation:blink 4.2s steps(1) infinite ${delay}s}` +
    (status === 'in_progress'
      ? `.r{animation:bob .9s steps(1) infinite ${delay}s}.a{animation:bob .9s steps(1) infinite ${delay}s}.b{animation:bob .9s steps(1) infinite reverse ${delay}s}`
      : status === 'planning'
        ? `.r{animation:bob 2.4s steps(1) infinite ${delay}s}`
        : '') +
    `@keyframes bob{50%{transform:translateY(-1px)}}@keyframes blink{0%,92%,100%{opacity:1}94%{opacity:0}}`
  const body =
    `<svg viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${w}" height="${ht}" shape-rendering="crispEdges" overflow="visible">` +
    `<g class="a">${groups.a}</g><g class="b">${groups.b}</g><g class="r">${groups.rig}<g class="e">${groups.eye}</g></g></svg>`
  // Every agent blinks, finished ones too: only reduced motion draws a still image
  return svg(ctx, w, ht, body, look.label, status === 'still' ? '' : style, status !== 'still')
}

function progressSvg(ctx: Ctx, agent: Agent, w: number) {
  const look = ctx.lookOf(agent)
  const pct = progressOf(ctx.crew, agent)
  const fill = pct === null ? '' : `<rect width="${(w * pct) / 100}" height="6" rx="3" fill="${look.color}"/>`
  const stripes =
    pct === null
      ? `<rect width="${w}" height="6" rx="3" fill="url(#p)"/><defs><pattern id="p" width="12" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${look.color}" opacity=".45"/></pattern></defs>`
      : ''
  return svg(ctx, w, 6, `<rect width="${w}" height="6" rx="3" fill="${T.track}"/>${fill}${stripes}`, `${pct ?? 0}%`)
}

function rule(ctx: Ctx, w: number, color = T.rule) {
  return svg(ctx, w, 1, `<rect width="${w}" height="1" fill="${color}"/>`, '')
}

// A centred line of text (.empty, .pane-empty)
function emptySvg(ctx: Ctx, w: number, lines: [string, number, string][], padY: number) {
  let body = ''
  let y = padY
  for (const [s, px, color] of lines) {
    body += text(w / 2, y + px + 1, s, px, color, 'text-anchor="middle"')
    y += px * 1.5 + 2
  }
  return svg(ctx, w, y - 2 + padY, body, lines.map(l => l[0]).join('. '))
}

// A pressable pill (.assignee): the frame and dot drawn, the label a Button over it, flush right by
// the pill's 8px padding (one cell), so the dot sits 8px in and the label 5px after it
function pill(ctx: Ctx, key: string, label: string, color: string, onPress: () => void) {
  const { Box, Button, Text } = ctx.els
  const pw = 20 + label.length * ctx.cellPx + 8
  const frame = `<rect x=".5" y=".5" width="${pw - 1}" height="22" rx="11" fill="none" stroke="${T.border}"/><circle cx="12" cy="11.5" r="3" fill="${color}"/>`
  return (
    <Box key={'pill-' + key}>
      {svg(ctx, pw, 23, frame, '')}
      <Box position="absolute" top={0} bottom={0} left={0} right={1} flexDirection="row" alignItems="center" justifyContent="flex-end">
        <Button key={key} plain label={label} onPress={onPress}>
          <Text color={color}>{label}</Text>
        </Button>
      </Box>
    </Box>
  )
}

// .assignee.is-unassigned: dashed, dim, not pressable
function unassignedSvg(ctx: Ctx) {
  const w = measure('Unassigned', 11) + 18
  return svg(ctx, w, 23, `<rect x=".5" y=".5" width="${w - 1}" height="22" rx="11" fill="none" stroke="${T.border}" stroke-dasharray="3 2"/>` + text(9, 15.5, 'Unassigned', 11, T.dim), 'Unassigned')
}

// ── Top bar ──────────────────────────────────────────────────────────────────────────

// .topbar is 43px with its 1px line; the tabs fill the rest
const TAB_H = 42

function topBar(ctx: Ctx, w: number) {
  const { Box, Button, Text } = ctx.els
  const tokens = Object.values(ctx.crew.agents).reduce((n, a) => n + a.tokens, 0)
  const isCompact = w <= 420
  const stats: [string, string][] = [
    ['Cost', '$' + ctx.crew.costUsd.toFixed(2)],
    // Tokens: least glanceable, first to go
    ...(w <= 340 ? [] : ([['Tokens', fmtTokens(tokens)]] as [string, string][])),
    ['Time', fmtTime(ctx.crew.startedAt ? ctx.now - ctx.crew.startedAt : 0)],
  ]
  // .stat: label over value, 10px mono, 4px 8px padding, radius 8; compact, the value alone (4px 6px)
  let x = 0
  let body = ''
  for (const [label, value] of stats) {
    if (isCompact) {
      const bw = measure(value, 10, false, true) + 14
      body += `<rect x="${x + 0.5}" y=".5" width="${bw - 1}" height="35" rx="8" fill="none" stroke="${T.border}"/>`
      body += `<text x="${x + 7}" y="21.5" font-family="${MONO}" font-size="10" fill="${T.dim}">${esc(value)}</text>`
      x += bw + 4
    } else {
      const bw = Math.max(measure(label, 10, false, true), measure(value, 10, false, true)) + 18
      body += `<rect x="${x + 0.5}" y=".5" width="${bw - 1}" height="33" rx="8" fill="none" stroke="${T.border}"/>`
      body +=
        `<text x="${x + 9}" y="15" font-family="${MONO}" font-size="10" fill="${T.dim}">${esc(label)}</text>` +
        `<text x="${x + 9}" y="27" font-family="${MONO}" font-size="10" fill="${T.dim}">${esc(value)}</text>`
      x += bw + 4
    }
  }
  // .tab: a 42px tab standing on the bar's line. The active one is a card-coloured box with its top
  // corners rounded and no bottom edge, so it opens onto the line; the frame is drawn to the pixel and
  // the label sits centred over it. Both tabs are the same height with the same overlay, so their
  // labels share a line
  const tab = (view: 'crew' | 'kanban', label: string) => {
    const isOn = ctx.nav.view === view || ((ctx.nav.view === 'agent' || ctx.nav.view === 'task') && ctx.nav.from === view)
    const pad = isCompact ? 12 : 16
    const tw = pad + label.length * ctx.cellPx + pad
    const frame = isOn
      ? `<path d="M.5 ${TAB_H}V8.5a8 8 0 0 1 8-8H${tw - 8.5}a8 8 0 0 1 8 8V${TAB_H}" fill="${T.card}" stroke="${T.border}"/>`
      : ''
    return (
      <Box key={'tabbox-' + view}>
        {svg(ctx, tw, TAB_H, frame, '')}
        <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center">
          <Button key={'tab-' + view} plain label={label} onPress={() => ctx.act.go({ view, from: view })}>
            <Text bold color={isOn ? T.text : T.dim}>{label}</Text>
          </Button>
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
        <Box flexDirection="row" alignItems="flex-end">
          {tab('crew', 'Crew')}
          {hgap(ctx, isCompact ? 4 : 12)}
          {tab('kanban', 'Kanban')}
        </Box>
        <Box alignSelf="center">{svg(ctx, x - 4, isCompact ? 36 : 34, body, stats.map(s => s.join(' ')).join(', '))}</Box>
      </Box>
      {rule(ctx, w, T.border)}
      {gitRow(ctx, w)}
    </Box>
  )
}

// The session's git under the tabs, 12px on a 26px line: "◆ main", "◆ main › ⎇ new-feat" once it has
// moved off the branch it started on, a "wt" tag first in a linked worktree; nothing outside a repository
function gitRow(ctx: Ctx, w: number) {
  const label = gitLabelOf(ctx.git)
  if (!label) return undefined
  const { Box } = ctx.els
  const y = 17.5
  let x = 0
  let body = ''
  if (label.isWorktree) {
    const tw = measure('wt', 10, true) + 10
    body += `<rect x=".5" y="5.5" width="${tw - 1}" height="15" rx="4" fill="none" stroke="${T.accent}"/>` + text(5, 16.5, 'wt', 10, T.accent, 'font-weight="700"')
    x += tw + 8
  }
  // Each branch name gets an even share of what's left, so a long one never hides the other
  const room = (w - x - (label.from ? 64 : 20)) / (label.from ? 2 : 1)
  const place = (icon: string, name: string, isDetached: boolean, color: string) => {
    body += `<g transform="translate(${x} 6)">${icon}</g>`
    x += 20
    const shown = fit(name + (isDetached ? ' (detached)' : ''), room, 12)
    body += text(x, y, shown, 12, color)
    x += measure(shown, 12)
  }
  if (label.from) {
    place(ICON.git(GIT.color), label.from.branch, label.from.isDetached, T.muted)
    body += text(x + 8, y, '›', 12, T.dim)
    x += 24
    place(ICON.branch(GIT.color), label.to.branch, label.to.isDetached, T.text)
  } else {
    place(ICON.git(GIT.color), label.to.branch, label.to.isDetached, T.text)
  }
  const alt = (label.isWorktree ? 'worktree ' : '') + (label.from ? `${label.from.branch} › ${label.to.branch}` : label.to.branch)
  return <Box key="git">{svg(ctx, Math.max(1, Math.min(w, x + 2)), 26, body, 'git: ' + alt)}</Box>
}

// ── Agent card (.agent-card) ─────────────────────────────────────────────────────────

function agentCard(ctx: Ctx, agent: Agent, w: number, isDetail: boolean) {
  const { Box, Button, Text } = ctx.els
  const look = ctx.lookOf(agent)
  const isNarrow = w <= 520
  // padding: 14 (list), 16 (detail); narrow 12, detail 14 by 12
  const padX = isNarrow ? 12 : isDetail ? 16 : 14
  const padY = isNarrow ? (isDetail ? 14 : 12) : padX
  const border = isDetail ? 0 : 2
  const avatar = isNarrow ? [40, 32] : [55, 44]
  const gap = isNarrow ? 10 : 11
  const bodyW = w - border - padX * 2 - avatar[0]! - gap
  const sideW = isNarrow ? bodyW : 157
  const infoW = isNarrow ? bodyW : bodyW - sideW - 8

  const activity = activityOf(ctx.crew, agent)
  const totalWeight = Object.values(ctx.crew.agents).reduce((n, a) => n + a.weight, 0)
  const cost = totalWeight ? (ctx.crew.costUsd * agent.weight) / totalWeight : 0
  const ctxPct = agent.ctxWindow ? Math.round((agent.ctxTokens / agent.ctxWindow) * 100) : 0
  const usage = `CTX ${ctxPct}%・${fmtTokens(agent.tokens)} $${cost.toFixed(2)} ${fmtTime((agent.endedAt ?? ctx.now) - agent.startedAt)}`
  const model = agent.model ? fmtModel(agent.model) : ''
  const effort = fmtEffort(agent.effort)

  // .agent-meta: the role in its colour, then "・model ・ effort" muted, 12px
  const rest = [model && '・' + model, effort && (model ? ' ・ ' : '・') + effort].filter(Boolean).join('')
  const roleW = measure(look.label, 12)
  const metaBody = text(0, 13, look.label, 12, look.color) + (rest ? text(roleW, 13, rest, 12, T.muted) : '')
  const metaSvg = svg(ctx, Math.min(infoW, roleW + measure(rest, 12) + 2), 18, metaBody, `${look.label} ${model} ${effort}`)
  const usageW = measure(usage, 11) + 2
  const usageSvg = svg(ctx, usageW, 16.5, text(usageW - 1, 12.4, usage, 11, T.muted, 'text-anchor="end"'), usage)

  // .agent-activity: 14px, line 21. In the list it opens the agent, so it is the card's Button
  const title = isDetail ? (
    svg(ctx, infoW, 21, text(0, 15, fit(activity, infoW, 14), 14, T.text), activity)
  ) : (
    <Button key={'open-' + agent.id} plain label={fitCells(ctx, activity, infoW)} onPress={() => ctx.act.go({ view: 'agent', id: agent.id, from: 'crew' })}>
      <Text color={T.text}>{fitCells(ctx, activity, infoW)}</Text>
    </Button>
  )

  const content = (
    <Box flexDirection="row" alignItems={isNarrow ? 'flex-start' : 'center'}>
      {mascotSvg(ctx, agent, avatar[0]!, avatar[1]!)}
      {hgap(ctx, gap)}
      <Box flexDirection="column" flexGrow={1}>
        {isNarrow ? (
          // .agent-row stacks, 2px apart; .agent-side is row-reverse: usage, 8px, then the status
          <Box flexDirection="column">
            {title}
            {metaSvg}
            {vgap(ctx, 'g-side', 2)}
            <Box flexDirection="row" alignItems="center">
              {usageSvg}
              {hgap(ctx, 8)}
              {statusLabelSvg(ctx, agent.status, agent.raw)}
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="column" flexShrink={1}>
              {title}
              {metaSvg}
            </Box>
            <Box flexDirection="column" alignItems="flex-end" justifyContent="space-between">
              {statusLabelSvg(ctx, agent.status, agent.raw)}
              {usageSvg}
            </Box>
          </Box>
        )}
        {vgap(ctx, 'g-progress', 8)}
        {progressSvg(ctx, agent, bodyW)}
      </Box>
    </Box>
  )
  const padded = (
    <Box flexDirection="column">
      {vgap(ctx, 'pad-top', padY)}
      <Box flexDirection="row">
        {hgap(ctx, padX)}
        {content}
        {hgap(ctx, padX)}
      </Box>
      {vgap(ctx, 'pad-end', padY)}
    </Box>
  )

  return isDetail ? (
    <Box key={'card-' + agent.id}>{padded}</Box>
  ) : (
    <Box key={'card-' + agent.id} backgroundColor={T.card} borderStyle="round" borderColor={T.border} hover={{ borderColor: '#444444' }}>{padded}</Box>
  )
}

// ── Crew tab ─────────────────────────────────────────────────────────────────────────

// h2.status-label: 16px above the label
function statusHeading(ctx: Ctx, status: Status) {
  const { Box } = ctx.els
  const st = statusOf(status)
  const body = `<circle cx="3" cy="24.25" r="3" fill="${st.color}"/>` + text(11, 28.4, st.label, 11, st.color)
  return <Box key={'h-' + status}>{svg(ctx, 11 + measure(st.label, 11) + 2, 33, body, st.label)}</Box>
}

function crewView(ctx: Ctx, w: number) {
  const { Box } = ctx.els
  const agents = agentsIn(ctx.crew)
  if (!agents.length) return emptySvg(ctx, w, [['No agents running in this crew yet.', 12, T.muted]], 32)
  // .crew-list: headings and cards, 8px apart
  const items = STATUSES.filter(st => agents.some(a => a.status === st.id)).flatMap(st => [
    statusHeading(ctx, st.id),
    ...agents.filter(a => a.status === st.id).map(a => agentCard(ctx, a, w, false)),
  ])
  return <Box flexDirection="column">{spaced(ctx, 'crew', items, 8)}</Box>
}

// ── Kanban tab ───────────────────────────────────────────────────────────────────────

function kanbanView(ctx: Ctx, w: number) {
  const { Box, Text, Button } = ctx.els
  if (!ctx.crew.tasks.length) return emptySvg(ctx, w, [['No tasks in this crew yet.', 12, T.muted]], 32)
  const isNarrow = w <= 520
  // .task-groups: 8px from the bar, groups 8px apart; each group's toggle has 8px above it
  const groups = lanesShown(ctx).map(st => {
    const tasks = ctx.crew.tasks.filter(t => t.lane === st.id)
    // An empty lane is its heading alone, dimmed: six dashed "No tasks" boxes would bury the work
    const isEmpty = !tasks.length
    const isCollapsed = !!ctx.layout.collapsed[st.id] || isEmpty
    // .group-toggle: chevron, 4px, the status dot (6px, 5px gap); the label and the bold count are its Button
    const chevron = isEmpty ? '' : `<g opacity=".55">${ICON.chevron('#ffffff', !isCollapsed)}</g>`
    const lead = `${chevron}<circle cx="21" cy="7" r="3" fill="${st.color}"${isEmpty ? ' opacity=".45"' : ''}/>`
    return (
      <Box key={'tg-' + st.id} flexDirection="column">
        {vgap(ctx, 'tg-top-' + st.id, 8)}
        <Box flexDirection="row" alignItems="center">
          {svg(ctx, 29, 17, `<g transform="translate(0 1.5)">${lead}</g>`, '')}
          <Button key={'toggle-' + st.id} plain label={st.label} onPress={() => ctx.act.toggleGroup(st.id)}>
            <Text color={isEmpty ? T.dim : st.color}>{st.label} </Text>
            <Text bold color={T.dim}>{tasks.length}</Text>
          </Button>
        </Box>
        {!isCollapsed && vgap(ctx, 'tg-gap-' + st.id, 4)}
        {!isCollapsed && (
          // .task-list: one card, rows split by hairlines
          <Box flexDirection="column" backgroundColor={T.card} borderStyle="round" borderColor={T.border}>
            {tasks.flatMap((t, i) => [...(i ? [<Box key={'hr-' + t.id}>{rule(ctx, w - 2, T.border)}</Box>] : []), taskRow(ctx, t, w, isNarrow)])}
          </Box>
        )}
      </Box>
    )
  })
  return <Box flexDirection="column">{[vgap(ctx, 'tgs-top', 8), ...spaced(ctx, 'tgs', groups, 8)]}</Box>
}

// .task-row: id (40px) | title | assignee, 8px apart, padding 10 by 14 (narrow 12, no id)
function taskRow(ctx: Ctx, task: Task, w: number, isNarrow: boolean) {
  const { Box, Button, Text } = ctx.els
  const agent = task.assignee ? ctx.crew.agents[task.assignee] : undefined
  const isDone = task.lane === 'done'
  const padX = isNarrow ? 12 : 14
  const look = agent ? ctx.lookOf(agent) : undefined
  const chipW = look ? 28 + look.label.length * ctx.cellPx : measure('Unassigned', 11) + 18
  const titleW = w - 2 - padX * 2 - (isNarrow ? 0 : 48) - 8 - chipW
  return (
    <Box key={'task-' + task.id} flexDirection="column" hover={{ backgroundColor: '#2b2b2b' }}>
      {vgap(ctx, 'tr-top', 10)}
      <Box flexDirection="row" alignItems="center">
        {hgap(ctx, padX)}
        {!isNarrow && svg(ctx, 48, 15, text(0, 11, task.id, 10, T.dim), task.id)}
        <Box flexGrow={1} flexShrink={1}>
          <Button key={'open-' + task.id} plain label={task.title} onPress={() => ctx.act.go({ view: 'task', id: task.id, from: 'kanban' })}>
            <Text color={isDone ? T.muted : T.text} wrap={isNarrow ? 'wrap' : 'truncate-end'}>{isNarrow ? task.title : fitCells(ctx, task.title, titleW)}</Text>
          </Button>
        </Box>
        {hgap(ctx, 8)}
        {agent && look ? pill(ctx, 'chip-' + task.id, look.label, look.color, () => ctx.act.go({ view: 'agent', id: agent.id, from: ctx.nav.from })) : unassignedSvg(ctx)}
        {hgap(ctx, padX)}
      </Box>
      {task.note && (
        <Box flexDirection="row">
          {hgap(ctx, padX + (isNarrow ? 0 : 48))}
          {svg(ctx, Math.max(40, w - 2 - padX * 2 - (isNarrow ? 0 : 48)), 17, text(0, 12.5, '↳ ' + fit(task.note, w - 2 - padX * 2 - (isNarrow ? 0 : 48) - 4, 11), 11, laneOf(ctx.crew.lanes, task.lane).color), task.note)}
        </Box>
      )}
      {vgap(ctx, 'tr-end', 10)}
    </Box>
  )
}

// ── Detail panes ─────────────────────────────────────────────────────────────────────

function paneHead(ctx: Ctx, w: number, title: string, meta: string, right?: { text: string; color: string; isLive?: boolean }) {
  let body = text(14, 23, title, 13, T.text, 'font-weight="700"')
  const tx = 14 + measure(title, 13, true) + 8
  if (meta) body += text(tx, 23, meta, 11, T.muted)
  let style = ''
  if (right && w > 260) {
    const rx = w - 14
    if (right.isLive) {
      const lw = measure('Live', 11)
      body += `<circle class="l" cx="${rx - lw - 8}" cy="19" r="3" fill="${right.color}"/>` + text(rx, 23, 'Live', 11, right.color, 'text-anchor="end"')
      style = `.l{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.25}}`
    } else {
      const room = w - tx - measure(meta, 11) - 30
      const shown = right.text.length * 6 > room ? '…' + right.text.slice(-Math.max(4, Math.floor(room / 6))) : right.text
      body += text(rx, 23, shown, 10, right.color, 'text-anchor="end"')
    }
  }
  body += `<rect y="37" width="${w}" height="1" fill="${T.rule}"/>`
  return svg(ctx, w, 38, body, `${title} ${meta}`, style, !!style && !ctx.isReduced)
}

// One activity timeline (.activity-log): time (52px) | rail + dot (12px) | text, 8px apart, padding
// 12 14 16; oldest first, newest bold. Narrow (<=260px), the time moves above the text
function logSvg(ctx: Ctx, entries: Entry[], w: number, withAgent: boolean, size?: { h: number }) {
  const isNarrow = w <= 260
  const dotX = isNarrow ? 14 + 6 : 14 + 52 + 8 + 6
  const textX = isNarrow ? 14 + 12 + 8 : 14 + 52 + 8 + 12 + 8
  const textW = w - textX - 14
  let y = 12
  let body = ''
  const rows: { y: number; h: number }[] = []
  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1
    const agent = ctx.crew.agents[entry.agentId]
    const look = agent ? ctx.lookOf(agent) : undefined
    const lines = wrap(entry.text, textW, 12, isLast)
    const top = y
    let ty = y + 13
    if (isNarrow) {
      body += text(textX, y + 13, fmtClock(entry.at), 10, T.dim, 'style="font-variant-numeric:tabular-nums"')
      ty += 17
    } else body += text(14 + 52, y + 13, fmtClock(entry.at), 10, T.dim, 'text-anchor="end" style="font-variant-numeric:tabular-nums"')
    if (withAgent && look) {
      body += text(textX, ty, look.label, 11, look.color)
      ty += 16
    }
    for (const line of lines) {
      body += text(textX, ty, line, 12, isLast ? T.text : T.logText, isLast ? 'font-weight="700"' : '')
      ty += 17.4
    }
    const h = ty - 13 - top + (isLast ? 0 : 12)
    rows.push({ y: top, h })
    y = top + h
  })
  // The rail joins one dot to the next; each dot sits in a ring of the panel's colour
  rows.forEach((r, i) => {
    if (i < rows.length - 1) body = `<rect x="${dotX - 0.5}" y="${r.y + 13}" width="1" height="${r.h - 3}" fill="${T.guide}"/>` + body
    const entry = entries[i]!
    body += `<circle cx="${dotX}" cy="${r.y + 8.5}" r="6.5" fill="${T.surface}"/><circle cx="${dotX}" cy="${r.y + 8.5}" r="3.5" fill="${KIND_DOT[entry.kind] ?? T.dim}"/>`
  })
  if (size) size.h = y + 16
  return svg(ctx, w, y + 16, body, entries.map(e => e.text).join('; '))
}

// `size` gets the drawn height, for the splitter beside it
function logPane(ctx: Ctx, entries: Entry[], w: number, withAgent: boolean, empty: [string, string], size?: { h: number }) {
  const { Box, Button } = ctx.els
  if (!entries.length) {
    // .pane-empty: 13px muted title over a 12px dim line, 24px padding
    if (size) size.h = 24 + 20 + 18 + 24
    return emptySvg(ctx, w, [[empty[0], 13, T.muted], [empty[1], 12, T.dim]], 24)
  }
  const per = 40
  const back = Math.min(ctx.layout.logBack, entries.length - 1)
  const end = entries.length - back
  const start = Math.max(0, end - per)
  return (
    <Box flexDirection="column">
      {start > 0 && <Box flexDirection="row">{hgap(ctx, 14)}<Button key="log-older" plain dimColor label={`↑ ${start} earlier`} onPress={() => ctx.act.scrollLog(per)} /></Box>}
      {logSvg(ctx, entries.slice(start, end), w, withAgent, size)}
      {back > 0 && <Box flexDirection="row">{hgap(ctx, 14)}<Button key="log-latest" plain dimColor label={`↓ ${back} newer · latest`} onPress={() => ctx.act.scrollLog('latest')} /></Box>}
    </Box>
  )
}

// The Edits tree (.file-tree, .tree-row): the workspace's own entries at depth 0 (its path is in the
// pane head). A row is 26px plus the list's 1px gap, inset 8px from the pane:
// [indent guides, chevron and icon, drawn] [the name, a Text] … [editing label and change badge, drawn].
// Names are Text so a file being written can hand its name to the shimmer, which runs on the surface's own
// frame clock (client/shimmer.ts): the pane's redraws never restart it, and every name reads the same.
const ROW_H = 27

// Indent guides under each ancestor folder's chevron, then the icon slot; the name starts after it
function rowLead(depth: number, icon: string) {
  const x0 = 6 + depth * 16
  let body = ''
  for (let d = 0; d < depth; d++) body += `<rect x="${6 + d * 16 + 6.5}" width="1" height="${ROW_H}" fill="${T.guide}"/>`
  return { w: x0 + 38, body: body + icon.replace(/\$X/g, String(x0)) }
}

function folderRow(ctx: Ctx, path: string, name: string, depth: number, isOpen: boolean, hasChanges: boolean) {
  const { Box, Button, Text } = ctx.els
  const lead = rowLead(depth, `<g transform="translate($X 6)" opacity="${hasChanges ? 0.9 : 0.5}">${ICON.chevron('#ffffff', isOpen)}<g transform="translate(19 0)">${ICON.folder('#ffffff')}</g></g>`)
  return (
    <Box key={'r-' + path} flexDirection="row" alignItems="center" marginX={1} hover={{ backgroundColor: T.raised }}>
      {svg(ctx, lead.w, ROW_H, lead.body, '')}
      <Button key={'dir-' + (path || '.')} plain label={name} onPress={() => ctx.act.toggleFolder(path, !isOpen)}>
        <Text color={hasChanges ? T.text : T.muted} wrap="truncate-end">{name}</Text>
      </Button>
    </Box>
  )
}

const EASE = `calcMode="spline" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1"`

function fileRow(ctx: Ctx, w: number, path: string, name: string, depth: number, change: Change | undefined, writer: { color: string; label: string } | undefined) {
  const { Box, Text, Client } = ctx.els
  const badge = change ? CHANGE[change] : undefined
  const isLive = !!writer && !ctx.isReduced
  // The icon becomes the writer's pencil, which keeps writing (@keyframes write, as SMIL)
  const icon = writer
    ? `<g transform="translate($X 6) translate(19 0)">${ICON.pencil(writer.color)}` +
      (isLive
        ? `<animateTransform attributeName="transform" type="translate" values="0 0;1 -1;-1 0;0 0" keyTimes="0;.3;.6;1" ${EASE} dur="1.1s" repeatCount="indefinite" additive="sum"/>` +
          `<animateTransform attributeName="transform" type="rotate" values="0 2.8 11.9;-8 2.8 11.9;4 2.8 11.9;0 2.8 11.9" keyTimes="0;.3;.6;1" ${EASE} dur="1.1s" repeatCount="indefinite" additive="sum"/>`
        : '') +
      `</g>`
    : `<g transform="translate($X 6) translate(20.83 .67)" opacity="${badge ? 0.9 : 0.5}">${ICON.file('#ffffff')}</g>`
  const lead = rowLead(depth, icon)

  // .tree-name: shimmering in the writer's colour while written; else the change's colour, or muted
  const label = writer ? (
    isLive && Client ? (
      <Client key={'sh-' + path} module="./client/shimmer.ts" props={{ text: name, color: writer.color, muted: '#8a8a89', noPencil: true }} width={name.length} />
    ) : (
      <Text bold color={T.text} wrap="truncate-end">{name}</Text>
    )
  ) : (
    <Text color={badge ? badge.color : T.muted} strikethrough={change === 'deleted'} wrap="truncate-end">{name}</Text>
  )

  // .tree-editing then .tree-change (6px apart), flush right with the row's 8px padding
  let tail = ''
  let tw = 8
  if (badge) {
    tail += `<rect x="$R" y="5" width="16" height="16" rx="3" fill="${badge.color}" fill-opacity=".14"/><text x="$RC" y="16.5" font-family="${MONO}" font-size="10" font-weight="700" fill="${badge.color}" text-anchor="middle">${badge.badge}</text>`
    tw += 16
  }
  const lw = writer ? measure(writer.label, 10) + (badge ? 6 : 0) : 0
  if (writer) tail = text(lw - (badge ? 6 : 0), 16.5, writer.label, 10, writer.color, 'text-anchor="end"') + tail
  tw += lw
  tail = tail.replace(/\$RC/g, String(lw + 8)).replace(/\$R/g, String(lw))

  const row = (
    <Box flexDirection="row" flexGrow={1} alignItems="center" position="relative">
      {svg(ctx, lead.w, ROW_H, lead.body, '', '', isLive)}
      <Box flexShrink={1}>{label}</Box>
      <Box flexGrow={1} />
      {tw > 8 && svg(ctx, tw, ROW_H, tail, [writer?.label, change].filter(Boolean).join(', '))}
    </Box>
  )
  // .tree-node.is-editing: the row tinted 13% in the writer's colour, radius 5, under the row's content
  return writer ? (
    <Box key={'r-' + path} marginX={1}>
      <Box position="absolute" top={0} left={0}>
        {svg(ctx, w - 2 * ctx.cellPx, 26, `<rect width="${w - 2 * ctx.cellPx}" height="26" rx="5" fill="${over(writer.color, 0.13)}"/>`, '')}
      </Box>
      {row}
    </Box>
  ) : (
    <Box key={'r-' + path} marginX={1} hover={{ backgroundColor: T.raised }}>{row}</Box>
  )
}

function treeRows(ctx: Ctx, agent: Agent, dir: string, depth: number, w: number, out: any[]) {
  const prefix = dir ? dir + '/' : ''
  const nodes = (ctx.dirs[dir] ?? []).map(e => ({ ...e }))
  // Files this agent changed, and files anyone is writing right now, are drawn in even before a listing has them
  for (const path of [...agent.edits.map(e => e.path), ...Object.keys(ctx.crew.editing)]) {
    if (!isInProject(path) || !path.startsWith(prefix)) continue
    const [head = '', ...tail] = path.slice(prefix.length).split('/')
    if (!nodes.some(n => n.path === prefix + head)) nodes.push({ name: head, path: prefix + head, kind: tail.length ? 'dir' : 'file' })
  }
  nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  for (const node of nodes) {
    if (out.length > 300) return
    if (node.kind === 'dir') {
      const isOpen = isFolderOpen(ctx.layout, ctx.crew, agent, node.path)
      out.push(folderRow(ctx, node.path, node.name, depth, isOpen, agent.edits.some(e => e.path.startsWith(node.path + '/'))))
      if (isOpen) treeRows(ctx, agent, node.path, depth + 1, w, out)
      continue
    }
    const writers = (ctx.crew.editing[node.path] ?? []).map(id => ctx.crew.agents[id]).filter(Boolean) as Agent[]
    const isMine = writers.some(x => x.id === agent.id)
    const writer = isMine ? agent : writers[0]
    const change = agent.edits.find(e => e.path === node.path)?.change
    out.push(
      fileRow(ctx, w, node.path, node.name, depth, change, writer && {
        color: ctx.lookOf(writer).color,
        label: writers.length > 1 ? writers.length + ' agents' : isMine ? 'editing' : ctx.lookOf(writer).label,
      }),
    )
  }
}

// .back-link: 10px below the bar, arrow (16) 4px before "Back" (12px, accent), 6px above the panel
function backLink(ctx: Ctx) {
  const { Box, Button, Text } = ctx.els
  return (
    <Box key="back-link" flexDirection="column">
      {vgap(ctx, 'back-top', 10)}
      <Box key="back-row" flexDirection="row" alignItems="center" alignSelf="flex-start" hover={{ backgroundColor: '#222930' }}>
        {svg(ctx, 24, 26, `<g transform="translate(4 5)">${ICON.back(T.accent)}</g>`, '')}
        <Button key="back" plain label="Back" onPress={() => ctx.act.back()}>
          <Text color={T.accent}>Back</Text>
        </Button>
        {hgap(ctx, 8)}
      </Box>
      {vgap(ctx, 'back-end', 6)}
    </Box>
  )
}

function missing(ctx: Ctx, what: string) {
  const { Box, Text, Button } = ctx.els
  return (
    <Box flexDirection="column">
      {vgap(ctx, 'missing-top', 32)}
      <Box flexDirection="row" justifyContent="center" columnGap={1}>
        <Text color={T.muted}>This {what} no longer exists.</Text>
        <Button key="back-missing" plain label={what === 'agent' ? 'Back to crew' : 'Back to tasks'} onPress={() => ctx.act.back()}>
          <Text color={T.accent}>{what === 'agent' ? 'Back to crew' : 'Back to tasks'}</Text>
        </Button>
      </Box>
      {vgap(ctx, 'missing-end', 32)}
    </Box>
  )
}

function agentDetail(ctx: Ctx, agent: Agent | undefined, w: number) {
  if (!agent) return missing(ctx, 'agent')
  const { Box, Button } = ctx.els
  const inner = w - 2
  const isStacked = w <= 600
  // The Edits pane is a whole number of cells wide, so its rows (cells) and its drawn parts (pixels) agree
  const editsW = isStacked ? inner : Math.floor(((inner - 9) * ctx.layout.split) / 100 / ctx.cellPx) * ctx.cellPx
  const logW = isStacked ? inner : inner - 9 - editsW
  const tree: any[] = []
  treeRows(ctx, agent, '', 0, editsW, tree)
  const entries = ctx.crew.log.filter(e => e.agentId === agent.id)
  const changed = agent.edits.filter(e => isInProject(e.path)).length
  const treeH = tree.length ? 16 + tree.length * ROW_H : 0

  const logSize = { h: 0 }
  const logBody = logPane(ctx, entries, logW, false, ['No activity yet', 'Entries appear here as this agent works.'], logSize)
  // Stacked, each pane is at least 240px tall
  const fill = (key: string, h: number) => (isStacked && h < 240 ? [vgap(ctx, key, 240 - h)] : [])

  const edits = (
    <Box key="edits" flexDirection="column" {...(isStacked ? {} : { width: editsW / ctx.cellPx })}>
      {paneHead(ctx, editsW, 'Edits', changed ? changed + ' changed' : 'No changes yet', w <= 520 ? undefined : { text: ctx.crew.root, color: T.dim })}
      {tree.length
        ? [vgap(ctx, 'tree-top', 8), ...tree, vgap(ctx, 'tree-end', 8)]
        : emptySvg(ctx, editsW, [['Reading the workspace…', 12, T.dim]], 24)}
      {fill('edits-fill', 38 + (treeH || 62))}
    </Box>
  )
  const log = (
    <Box key="log" flexDirection="column" flexGrow={1}>
      {paneHead(ctx, logW, 'Activity Log', entries.length ? entries.length + (entries.length === 1 ? ' entry' : ' entries') : '')}
      {logBody}
      {fill('log-fill', 38 + logSize.h)}
    </Box>
  )
  // .col-splitter: the hairline between the panes, as tall as the taller one, with its grip half way down.
  // Hovering it shows the controls that move the split and reset it
  const splitH = Math.max(38 + (treeH || 62), 38 + logSize.h)
  const splitter = (
    <Box key="splitter" flexDirection="column">
      {svg(ctx, 9, splitH, `<rect x="4" width="1" height="${splitH}" fill="${T.rule}"/><rect x="2" y="${Math.round(splitH / 2) - 14}" width="5" height="28" rx="2.5" fill="#4a4a49" fill-opacity=".7"/>`, 'Resize Edits and Activity Log')}
      <Box position="absolute" top={6} left={-1} flexDirection="column" alignItems="center" backgroundColor={T.card} borderStyle="round" borderColor={T.border} display="none" hover={{ display: 'flex' }}>
        <Button key="split-less" plain label="‹" onPress={() => ctx.act.split(-10)} />
        <Button key="split-reset" plain label="┃" onPress={() => ctx.act.split('reset')} />
        <Button key="split-more" plain label="›" onPress={() => ctx.act.split(10)} />
      </Box>
    </Box>
  )
  return (
    <Box flexDirection="column">
      {backLink(ctx)}
      <Box flexDirection="column" backgroundColor={T.surface} borderStyle="round" borderColor={T.border}>
        {agentCard(ctx, agent, inner, true)}
        {rule(ctx, inner)}
        {isStacked ? (
          <Box flexDirection="column">
            {edits}
            {rule(ctx, inner)}
            {log}
          </Box>
        ) : (
          <Box flexDirection="row">
            {edits}
            {splitter}
            {log}
          </Box>
        )}
      </Box>
    </Box>
  )
}

function taskDetail(ctx: Ctx, task: Task | undefined, w: number) {
  if (!task) return missing(ctx, 'task')
  const { Box } = ctx.els
  const inner = w - 2
  const entries = ctx.crew.log.filter(e => e.taskId === task.id)
  const ids = [...new Set([task.assignee, ...entries.map(e => e.agentId)].filter(Boolean))] as string[]
  const agents = ids.map(id => ctx.crew.agents[id]).filter(Boolean) as Agent[]
  const st = laneOf(ctx.crew.lanes, task.lane)
  // .task-head: padding 16; the id and status (11px, 10px apart), 6px, the title (17px bold, line 22.1),
  // then the agents 10px below it (gap 6 + margin 4), 6px apart, and 16px under them
  const titleLines = wrap(task.title, inner - 32, 17, true)
  let head = text(16, 28.4, task.id, 11, T.dim)
  const sx = 16 + measure(task.id, 11) + 10
  head += `<circle cx="${sx + 3}" cy="24.25" r="3" fill="${st.color}"/>` + text(sx + 11, 28.4, st.label, 11, st.color)
  titleLines.forEach((line, i) => (head += text(16, 56 + i * 22.1, line, 17, T.text, 'font-weight="700"')))
  let headH = Math.ceil(48.5 + 22.1 * titleLines.length)
  if (task.note) {
    head += text(16, headH + 13, '↳ ' + fit(task.note, inner - 36, 12), 12, st.color)
    headH += 18
  }
  const chips = agents.length
    ? agents.flatMap((a, i) => [...(i ? [hgap(ctx, 6)] : []), pill(ctx, 'tchip-' + a.id, ctx.lookOf(a).label, ctx.lookOf(a).color, () => ctx.act.go({ view: 'agent', id: a.id, from: ctx.nav.from }))])
    : [unassignedSvg(ctx)]
  return (
    <Box flexDirection="column">
      {backLink(ctx)}
      <Box flexDirection="column" backgroundColor={T.surface} borderStyle="round" borderColor={T.border}>
        {svg(ctx, inner, headH, head, `${task.id} ${st.label}: ${task.title}`)}
        <Box flexDirection="row">
          {hgap(ctx, 16)}
          <Box flexDirection="row" flexWrap="wrap" flexShrink={1}>{chips}</Box>
          {hgap(ctx, 16)}
        </Box>
        {vgap(ctx, 'head-end', 16)}
        {rule(ctx, inner)}
        {paneHead(ctx, inner, 'Activity', entries.length ? entries.length + (entries.length === 1 ? ' entry' : ' entries') : '', task.lane === 'in_progress' ? { text: 'Live', color: st.color, isLive: true } : undefined)}
        {logPane(ctx, entries, inner, agents.length > 1, ['No agent activity on this task', 'Agent log entries tagged with this task stream in here.'])}
      </Box>
    </Box>
  )
}

// ── The pane (.crew-view) ────────────────────────────────────────────────────────────

// The frame's 12px padding all round; the bar and the view 8px apart
export function desktopPane(ctx: Ctx) {
  const { Box } = ctx.els
  const w = paneWidth(ctx) - 24
  const body =
    ctx.nav.view === 'crew'
      ? crewView(ctx, w)
      : ctx.nav.view === 'kanban'
        ? kanbanView(ctx, w)
        : ctx.nav.view === 'agent'
          ? agentDetail(ctx, ctx.crew.agents[ctx.nav.id ?? ''], w)
          : taskDetail(ctx, ctx.crew.tasks.find(t => t.id === ctx.nav.id), w)
  return (
    <Box flexDirection="column" backgroundColor={T.frame}>
      {vgap(ctx, 'frame-top', 12)}
      <Box flexDirection="row">
        {hgap(ctx, 12)}
        <Box flexDirection="column" flexGrow={1}>
          {topBar(ctx, w)}
          {vgap(ctx, 'bar-gap', 8)}
          {body}
        </Box>
        {hgap(ctx, 12)}
      </Box>
      {vgap(ctx, 'frame-end', 12)}
    </Box>
  )
}
