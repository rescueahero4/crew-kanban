// A file name being written: a bright highlight in the writer's colour sweeps through the muted name,
// and the pencil in front of it makes a small writing motion (mockup: ddr-0012). Runs on the surface's
// own frame clock, so the shimmer moves without the hooks module redrawing the pane.
//
// As the mockup's text-shimmer: a 250%-wide gradient, muted except a peak (the writer's colour 30% into
// white) that ramps over ±30% of the name, sweeping left to right once every 1.6s whatever the name's length.
import type { ClientModule } from 'claude-code'

// `noPencil`: the desktop draws its own pencil icon in front of the name
type Props = { text: string; color: string; muted: string; noPencil?: boolean }
type State = { i: number }

const TICK_MS = 50
const PERIOD_MS = 1600

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')
}

const shimmer: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ i: 0 })
    surface.every(TICK_MS, () => surface.setState({ i: (surface.state?.i ?? 0) + 1 }))
  }
  const i = surface.state?.i ?? 0
  const len = Math.max(1, props.text.length)
  const p = ((i * TICK_MS) % PERIOD_MS) / PERIOD_MS
  const centre = len * (-0.25 + 1.5 * p)
  const half = Math.max(1, len * 0.3)
  const peak = mix(props.color, '#ffffff', 0.7)
  const chars = [...props.text].map((ch, x) => {
    const t = Math.max(0, 1 - Math.abs(x + 0.5 - centre) / half)
    return Text({ color: t > 0 ? mix(props.muted, peak, t) : props.muted, bold: true, children: [ch] })
  })
  // The pencil nods every few frames, as if writing
  const nod = Math.floor((i * TICK_MS) / 270) % 2 === 0
  const pencil = Text({ color: props.color, bold: nod, children: [nod ? '✎ ' : '✐ '] })
  return Box({ flexDirection: 'row', children: props.noPencil ? chars : [pencil, ...chars] })
}

export default shimmer
