// A file name being written: a bright highlight in the writer's colour sweeps through the muted name,
// and the pencil in front of it makes a small writing motion (mockup: ddr-0012). Runs on the surface's
// own frame clock, so the shimmer moves without the hooks module redrawing the pane.
import type { ClientModule } from 'claude-code'

type Props = { text: string; color: string; muted: string }
type State = { i: number }

const WIDTH = 3

const shimmer: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ i: 0 })
    surface.every(90, () => surface.setState({ i: (surface.state?.i ?? 0) + 1 }))
  }
  const i = surface.state?.i ?? 0
  const span = props.text.length + WIDTH * 2 + 4
  const at = (i % span) - WIDTH
  const chars = [...props.text].map((ch, x) => {
    const d = Math.abs(x - at)
    if (d === 0) return Text({ color: '#ffffff', bold: true, children: [ch] })
    if (d < WIDTH) return Text({ color: props.color, bold: true, children: [ch] })
    return Text({ color: props.muted, bold: true, children: [ch] })
  })
  // The pencil nods every few frames, as if writing
  const pencil = Text({ color: props.color, bold: i % 6 < 3, children: [i % 6 < 3 ? '✎ ' : '✐ '] })
  return Box({ flexDirection: 'row', children: [pencil, ...chars] })
}

export default shimmer
