// The stored Companion deck model (R-C1). A deck is the whole Stream Deck configuration for one
// workspace: its connections (by label), page templates, pages of typed button specs, and the
// sanitized device fragments carried from the booth's own export. renderDeck() (render.ts) turns a
// deck into the Companion export; seed.ts builds CRC's deck as released on 2026-09-23.
//
// A deck never holds a connection's `config` or `secrets`. Connections are import-mapping stubs, and
// every device fragment refers to its connection by label, never by the booth's instance settings.
import crypto from 'node:crypto'

/* ---------------------------------------------------------------- values --- */

/** Companion's option wrapper. */
export type Wrapped<T = unknown> = { value: T; isExpression: boolean }
export const w = <T>(value: T): Wrapped<T> => ({ value, isExpression: false })
export const unwrap = (x: unknown): unknown =>
  x && typeof x === 'object' && !Array.isArray(x) && 'isExpression' in x && 'value' in x ? (x as Wrapped).value : x

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
/** A Companion entity or control carried verbatim (after sanitizing). */
export type JsonObject = { [key: string]: Json }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
/** Deterministic 21-character Companion-style id derived from a seed string. */
export function stableId(seed: string, len = 21): string {
  const bytes = crypto.createHash('sha256').update(String(seed)).digest()
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] & 63]
  return out
}

/** Parse a cell like "r2c5" into [row, column]. */
export function parseCell(cell: string): [number, number] {
  const m = /^r(\d)c(\d)$/.exec(String(cell))
  if (!m) throw new Error(`bad cell ${cell}`)
  return [Number(m[1]), Number(m[2])]
}

/** Companion label: wrap onto two lines once it is longer than `max` characters. */
export function wrapLabel(text: string | null | undefined, max = 10): string {
  const s = String(text ?? '')
  if (s.includes('\n') || s.length <= max) return s
  let best = -1
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && i <= max) best = i
  if (best < 0) best = s.indexOf(' ')
  return best > 0 ? s.slice(0, best) + '\n' + s.slice(best + 1) : s
}

/** Connection label as Companion stores it ("Door_Cam (steve)" → "Door_Cam__steve_"). */
export const companionLabel = (label: string): string => String(label).replace(/[^A-Za-z0-9_-]/g, '_')

/* ------------------------------------------------------------ workspaces --- */

export type DeckWorkspace = 'crc' | 'tbi'

/** The Companion release each workspace's booth runs; the renderer targets the deck's own build. */
export const WORKSPACE_COMPANION: Record<DeckWorkspace, { release: string; exportVersion: number }> = {
  crc: { release: '5.0.3', exportVersion: 12 }, // Michael, ProductionDSKTP export of 2026-09-16
  tbi: { release: '5.0.5', exportVersion: 12 }, // Simone, TBIComputer export of 2026-09-14
}

/* ------------------------------------------------------------- templates --- */

/** What a fixed cell of a page template holds. */
export type FixedRole =
  | 'camera-center' | 'camera-left' | 'camera-right' | 'merge'
  | 'animate-out' | 'clear-now' | 'logo-toggle'
  | 'prev' | 'home' | 'next' | 'bimah-mute'
  | 'ring-prev' | 'ring-home' | 'ring-next'

export type PageTemplate = {
  id: string
  description: string
  fixed: { row: number; col: number; role: FixedRole }[]
  /** Prev/Next follow the deck's service chains (and are absent on a page outside every chain). */
  chainNav: boolean
  /** Companion's built-in page-up / page-number / page-down buttons are allowed on this page. */
  builtInNav: boolean
  /**
   * Camera gestures are allowed on this page, and a gesture's out-move returns the switcher to this
   * input (and a PTZ out-move to this preset). Absent: no cue key on the page may carry a gesture.
   */
  gesture?: { returnInput: string; returnPreset: number }
}

const RECOVERY = [
  { row: 0, col: 6, role: 'animate-out' }, { row: 1, col: 6, role: 'clear-now' }, { row: 2, col: 6, role: 'logo-toggle' },
] as const
const SWITCHER = [
  { row: 0, col: 0, role: 'camera-center' }, { row: 1, col: 0, role: 'camera-left' },
  { row: 2, col: 0, role: 'camera-right' }, { row: 3, col: 0, role: 'merge' },
] as const

/** Named page templates per workspace. C2's validator reads fixed cells and nav rules from these. */
export const PAGE_TEMPLATES: Record<DeckWorkspace, Record<string, PageTemplate>> = {
  crc: {
    utility: {
      id: 'utility', description: 'Home, Output & Audio, Devices and Cameras: recovery in c6, Home and Bimah Mute in c7.',
      fixed: [...RECOVERY, { row: 1, col: 7, role: 'home' }, { row: 3, col: 7, role: 'bimah-mute' }], chainNav: false, builtInNav: false,
    },
    service: {
      id: 'service', description: 'Service page: switcher in c0, recovery in c6, Prev/Home/Next and Bimah Mute in c7.',
      fixed: [...SWITCHER, ...RECOVERY, { row: 0, col: 7, role: 'prev' }, { row: 1, col: 7, role: 'home' }, { row: 2, col: 7, role: 'next' }, { row: 3, col: 7, role: 'bimah-mute' }],
      chainNav: true, builtInNav: false, gesture: { returnInput: 'center cam 1', returnPreset: 1 },
    },
    carried: {
      id: 'carried', description: 'Device page carried from the booth export; c7 r0–r2 step round the Devices ring.',
      fixed: [{ row: 0, col: 7, role: 'ring-prev' }, { row: 1, col: 7, role: 'ring-home' }, { row: 2, col: 7, role: 'ring-next' }], chainNav: false, builtInNav: false,
    },
    spare: { id: 'spare', description: 'Empty page kept for later use.', fixed: [], chainNav: false, builtInNav: false },
  },
  tbi: {
    // Provisional until C4 seeds Simone's deck: her pages use Companion's built-in nav in column 0 and
    // have no switcher, Bimah Mute or camera gesture.
    service: { id: 'service', description: "Simone's page: Companion's built-in nav in c0; no switcher or Bimah Mute.", fixed: [], chainNav: false, builtInNav: true },
  },
}

/* ----------------------------------------------------------- connections --- */

export type ConnectionRole = 'overlays' | 'switcher'

/** An import-mapping stub. Never carries `config` or `secrets`. */
export type DeckConnection = {
  id: string
  label: string
  moduleId: string
  moduleVersionId: string
  sortOrder: number
  updatePolicy: string
  lastUpgradeIndex: number
  role?: ConnectionRole
}

/**
 * Fragments name their connection as `label:<label>` in place of the booth's instance id, both in
 * `connectionId` and in the target option of Companion's enable/disable-connection action.
 */
export const CONNECTION_REF = 'label:'
export const INSTANCE_CONTROL = 'instance_control'

/* --------------------------------------------------------------- buttons --- */

/** Where a button's entity ids come from: stableId(`${ctx}#${base + n}`) for its n-th entity. */
export type IdSeed = { ctx: string; base: number }

export type CueRole = 'utility' | 'announcement' | 'single' | 'sequence-part' | 'alternate' | 'short-selection'
export type CameraMove = { conn: string | null; preset: number | null; input: string }
/** The camera gesture: step 1 shows the cue, recalls a PTZ preset, waits, merges; step 2 reverses. */
export type CameraGesture = { in: CameraMove | null; out: CameraMove | null }

export type ButtonSpec =
  /** A cue key: one-step toggle, or a two-step camera gesture. Colour follows the role. */
  | { kind: 'cue'; cueId: string; label: string; role: CueRole; sequence?: { name: string; index: number; count: number }; gesture?: CameraGesture }
  /** Jump to a page. */
  | { kind: 'jump'; text: string; page: number }
  /** One Overlays module action, with the disconnected light (and the logo light when asked). */
  | { kind: 'module'; text: string; bg: number; action: string; logoFeedback?: boolean }
  /** Switcher camera key: merge an input, with the carried vMix tally feedback. */
  | { kind: 'camera'; text: string; input: string; tally: number }
  /** Merge preview to program. */
  | { kind: 'merge' }
  /** A device fragment: a `control` is carried verbatim, a `control-template` is re-ided per use. Optionally relabelled. */
  | { kind: 'fragment'; fragment: string; text?: string; bg?: number }
  /** A plain button whose steps are made of device action fragments. */
  | { kind: 'actions'; text: string; bg: number; steps: string[][] }
  /** Companion's own page-up / page-number / page-down control; only where the page template allows it. */
  | { kind: 'builtin'; control: BuiltInControl }

export const BUILT_IN_CONTROLS = ['pageup', 'pagenum', 'pagedown'] as const
export type BuiltInControl = (typeof BUILT_IN_CONTROLS)[number]

export type DeckButton = { row: number; col: number; spec: ButtonSpec; ids?: IdSeed }

export type DeckPage = { number: number; id: string; name: string; template: string; buttons: DeckButton[] }

/* ------------------------------------------------------------- fragments --- */

/** Layer overrides against the built-in template (`"text0.text": {...}`), or the full style. */
export type FragmentStyle = { set: Record<string, Json> } | { style: JsonObject }

export type DeviceFragment =
  /** A whole layered control, ids fixed. */
  | { kind: 'control'; source: string; style: FragmentStyle; options: JsonObject; feedbacks: JsonObject[]; steps: JsonObject; localVariables: Json[] }
  /** A layered control re-ided at every use (Bimah Mute). */
  | { kind: 'control-template'; source: string; style: FragmentStyle; options: JsonObject; feedbacks: JsonObject[]; steps: JsonObject; localVariables: Json[] }
  /** Entities re-ided at every use (camera tally feedback, vMix Bus X, the Seder merges). */
  | { kind: 'entities'; source: string; entities: JsonObject[] }

/* ------------------------------------------------------------------ deck --- */

export const PALETTE = {
  white: 0xffffff, black: 0x000000, teal: 0x006699, burgundy: 0x990033, navy: 0x000066, blue: 0x003399,
  orange: 0xcc6500, darkRed: 0x780000, charcoal: 0x242424, purple: 0x660066,
  requested: 0xb46e00, rendered: 0xff0000, disconnected: 0xaa0000, logoEnabled: 0x5a4600, stepText: 0xffff00,
} as const
export type Palette = Record<keyof typeof PALETTE, number>

export type CompanionDeck = {
  schema: 1
  workspace: DeckWorkspace
  /** Companion's export envelope for this workspace's booth. */
  companion: { release: string; build: string; exportVersion: number }
  palette: Palette
  /** vMix merge duration, and how long a camera gesture waits for the PTZ preset before merging. */
  switcher: { mergeDurationMs: number; presetWaitMs: number }
  grid: { rows: number; columns: number }
  /** Explicit Prev/Next chains of service pages; Home is page 1. */
  chains: number[][]
  connections: DeckConnection[]
  templates: Record<string, PageTemplate>
  pages: DeckPage[]
  fragments: Record<string, DeviceFragment>
  /** Carried verbatim, connection references by label. */
  triggers: JsonObject
  customVariables: JsonObject
}

/** Background colour of a cue key by role. */
export function roleColour(palette: Palette, spec: { role: CueRole; sequence?: unknown }): number {
  if (spec.role === 'announcement' || spec.role === 'utility') return palette.navy
  if (spec.role === 'sequence-part') return palette.teal
  if (spec.role === 'alternate') return spec.sequence ? palette.teal : palette.burgundy
  return palette.burgundy // single, short-selection
}

export function chainNeighbours(chains: number[][], page: number): { prev: number; next: number } | null {
  for (const chain of chains) {
    const i = chain.indexOf(page)
    if (i >= 0) return { prev: i === 0 ? 1 : chain[i - 1], next: i === chain.length - 1 ? 1 : chain[i + 1] }
  }
  return null
}

export function connectionByLabel(deck: CompanionDeck, label: string): DeckConnection {
  const found = deck.connections.find((c) => c.label === companionLabel(label)) ?? deck.connections.find((c) => c.label === label)
  if (!found) throw new Error(`connection ${label} is not in the deck`)
  return found
}
export function connectionByRole(deck: CompanionDeck, role: ConnectionRole): DeckConnection {
  const found = deck.connections.find((c) => c.role === role)
  if (!found) throw new Error(`the deck has no ${role} connection`)
  return found
}

/** Keys that must never appear on a deck connection or anywhere in a deck. */
export const FORBIDDEN_CONNECTION_KEYS = ['config', 'secrets'] as const

/** Throw when a deck carries connection config/secrets or credential-looking keys. */
export function assertSanitized(value: unknown, where = 'deck'): void {
  const walk = (v: unknown, at: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${at}[${i}]`)); return }
    if (!v || typeof v !== 'object') return
    for (const [k, x] of Object.entries(v)) {
      if ((FORBIDDEN_CONNECTION_KEYS as readonly string[]).includes(k)) throw new Error(`${at}.${k}: connection ${k} must never be stored`)
      if (/password|passwd|secret|token|api_?key/i.test(k)) throw new Error(`${at}.${k}: credential-looking key`)
      walk(x, `${at}.${k}`)
    }
  }
  walk(value, where)
}
