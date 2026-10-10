// Clawd, the Claude pixel mascot, with accessories for the agent's role (mockup: MOCK.mascots).
// Drawn as a Raster of half-block cells on the terminal and as an Svg on the desktop.
import type { Part, Status } from '../types'

export const CANVAS = { w: 20, h: 16 }

// `E` eyes (blink), `A`/`B` the two leg pairs (walk)
const BASE = {
  y: 8,
  palette: { O: '#d77757', E: '#1a1a19', A: '#d77757', B: '#d77757' } as Record<string, string>,
  rows: [
    '.....OOOOOOOOOO.....',
    '.....OOEOOOOEOO.....',
    '...OOOOEOOOOEOOOO...',
    '.....OOOOOOOOOO.....',
    '.....OOOOOOOOOO.....',
    '.....A.B....A.B.....',
    '.....A.B....A.B.....',
  ],
}

export const LIBRARY: Record<string, Part> = {
  'wizard-hat': { slot: 'hat', y: 1, source: 'library', palette: { P: '#6b4fc8', Y: '#f2c94c' }, rows: [
    '..........P.........',
    '.........PP.........',
    '.........PPP........',
    '........PPYPP.......',
    '.......PPPPPPP......',
    '......PPPPPPPPP.....',
    '....PPPPPPPPPPPPP...',
  ] },
  staff: { slot: 'prop', y: 2, source: 'library', palette: { Y: '#f2c94c', W: '#8b5a2b' }, rows: [
    '.................Y..',
    '................YYY.',
    '.................Y..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
  ] },
  'detective-hat': { slot: 'hat', y: 3, source: 'library', palette: { T: '#9a7652', D: '#5c4630' }, rows: [
    '.......TTTTTT.......',
    '......TTTTTTTT......',
    '......TTTTTTTT......',
    '......DDDDDDDD......',
    '....TTTTTTTTTTTT....',
  ] },
  magnifier: { slot: 'prop', y: 4, source: 'library', palette: { G: '#c9c9c9', L: '#9fd3ff', W: '#8b5a2b' }, rows: [
    '................GG..',
    '...............GLLG.',
    '...............GLLG.',
    '................GG..',
    '................W...',
    '................W...',
  ] },
  'hard-hat': { slot: 'hat', y: 4, source: 'library', palette: { H: '#f2b84b', h: '#c98f22' }, rows: [
    '........HhhH........',
    '.......HHhhHH.......',
    '......HHHhhHHH......',
    '....HHHHHHHHHHHH....',
  ] },
  wrench: { slot: 'prop', y: 4, source: 'library', palette: { G: '#c9c9c9' }, rows: [
    '...............G.G..',
    '...............GGG..',
    '................G...',
    '................G...',
    '................G...',
    '................G...',
  ] },
  beret: { slot: 'hat', y: 4, source: 'library', palette: { R: '#d64545', r: '#a83232' }, rows: [
    '.........r..........',
    '......RRRRRRRR......',
    '.....RRRRRRRRRRR....',
    '......rrrrrrrr......',
  ] },
  paintbrush: { slot: 'prop', y: 3, source: 'library', palette: { X: '#2fbf9b', S: '#c9c9c9', W: '#8b5a2b' }, rows: [
    '.................X..',
    '................XXX.',
    '.................S..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
    '.................W..',
  ] },
}

type Grid = (string | null)[][]

// One frame of the shared animation: working = bob + walk, planning = slow bob, done = still; all blink.
// `tick` advances 4 times a second; `phase` keeps agents out of step.
export function frameOf(status: Status, tick: number, phase: number) {
  const t = tick + phase
  const isBlink = t % 17 === 0
  if (status === 'in_progress') return { bob: t % 4 < 2 ? 0 : 1, step: t % 2, isBlink }
  if (status === 'planning') return { bob: t % 8 < 4 ? 0 : 1, step: 0, isBlink }
  return { bob: 0, step: -1, isBlink }
}

export function compose(parts: Part[], frame = { bob: 0, step: -1, isBlink: false }): Grid {
  const grid: Grid = Array.from({ length: CANVAS.h }, () => Array(CANVAS.w).fill(null))
  const paint = (part: { y: number; rows: string[]; palette: Record<string, string> }, isBase: boolean) =>
    part.rows.forEach((row, dy) =>
      [...row].forEach((ch, x) => {
        if (ch === '.' || x >= CANVAS.w) return
        const isLeg = isBase && (ch === 'A' || ch === 'B')
        // The body and what it wears bob together; legs stay planted, one pair lifts on its step
        let y = part.y + dy + (isLeg ? 0 : frame.bob)
        if (isLeg && frame.step >= 0 && (ch === 'A') === (frame.step === 0) && dy === part.rows.length - 1) return
        if (y < 0 || y >= CANVAS.h) return
        const color = ch === 'E' && frame.isBlink ? part.palette.O : part.palette[ch]
        if (color) grid[y]![x] = color
      }),
    )
  paint(BASE, true)
  parts.forEach(part => paint(part, false))
  return grid
}

// Halves the art for a card: a 2x2 block keeps its most telling pixel (eyes, then accessories, then body)
export function shrink(grid: Grid): Grid {
  const body = BASE.palette.O
  const eye = BASE.palette.E
  const out: Grid = []
  const at = (x: number, y: number) => grid[y]?.[x] ?? null
  for (let y = 0; y < grid.length; y += 2) {
    const row: (string | null)[] = []
    for (let x = 0; x < CANVAS.w; x += 2) {
      const block = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)].filter(Boolean) as string[]
      row.push(block.find(c => c === eye) ?? block.find(c => c !== body) ?? block[0] ?? null)
    }
    out.push(row)
  }
  return out
}

const DEFAULT = 0x01000000
const hex = (c: string | null) => (c ? parseInt(c.slice(1), 16) : DEFAULT)

// Two art rows per cell: the upper half block in the top pixel's colour over the bottom pixel's colour
export function rasterCells(grid: Grid): { columns: number; rows: number; cells: string } {
  const numbers: number[] = []
  const width = grid[0]?.length ?? 0
  for (let y = 0; y < grid.length; y += 2) {
    for (let x = 0; x < width; x++) {
      const top = grid[y]?.[x] ?? null
      const bottom = grid[y + 1]?.[x] ?? null
      if (!top && !bottom) numbers.push(32, DEFAULT, DEFAULT)
      else if (!top) numbers.push(0x2584, hex(bottom), DEFAULT)
      else numbers.push(0x2580, hex(top), hex(bottom))
    }
  }
  return { columns: width, rows: Math.ceil(grid.length / 2), cells: base64(new Uint8Array(Uint32Array.from(numbers).buffer)) }
}

export function svgOf(grid: Grid): string {
  let rects = ''
  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" shape-rendering="crispEdges">${rects}</svg>`
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '='
  }
  return out
}

// Checks accessories Claude drew: the slot's rows fit the canvas and every pixel has a colour
export function isValidPart(part: unknown): part is Part {
  const p = part as Part
  if (!p || (p.slot !== 'hat' && p.slot !== 'prop') || !Array.isArray(p.rows) || typeof p.palette !== 'object') return false
  if (typeof p.y !== 'number' || p.y < 0 || p.y + p.rows.length > CANVAS.h || p.rows.length === 0) return false
  return p.rows.every(
    row => typeof row === 'string' && row.length === CANVAS.w && [...row].every(ch => ch === '.' || /^#[0-9a-f]{6}$/i.test(p.palette[ch] ?? '')),
  )
}
