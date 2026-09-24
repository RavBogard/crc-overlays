// Each operator's deck style as data (styles/<workspace>.json), and the one check validate_deck runs
// against it: every multi-panel graphic on a page has one key per panel, placed and labelled the way that
// operator places and labels a set (TBI setup-page PLAN, "Their style, intelligently updated"). The data
// also records page roles, fixed columns and key types, so the style is written down rather than
// remembered; only the set rules are checked here (the page templates already check the fixed cells).
//
// A graphic is multi-panel when its key records a sequence (the deck's own record: CRC's manifest, or the
// draft set apply_deck_plan bound it from) or when the catalog says its cue is part of a draft set (the
// `set` lookup). The catalog wins on the panel count, so a set that grew from two panels to three reports
// its missing third key. Pure: no filesystem, network or clock.
// Import attributes, so plain Node (scripts/audit-companion-preset.mjs under node --test) loads the data too.
import crcStyle from './styles/crc.json' with { type: 'json' }
import tbiStyle from './styles/tbi.json' with { type: 'json' }
import { cueSetId } from './cue-roles.ts'
import { roleColour, type ButtonSpec, type CompanionDeck, type DeckButton, type DeckPage, type DeckWorkspace } from './model.ts'
import { PALETTE, type CueRole, type PaletteName } from './palette.ts'
import type { CueLookups, FindingCode, Severity } from './validate.ts'

/* ------------------------------------------------------------------ types --- */

export type DeckStyle = {
  workspace: DeckWorkspace
  operator: string
  about: string
  sources: string[]
  pages: { from: number; to: number; role: string; template: string; purpose: string }[]
  columns: { order: string; graphics: number[]; fixed: { col: number; keys: string }[] }
  /** How a set grows: one key per panel down the column, continuing at the top of the next column. */
  growth: { direction: 'down'; continue: 'next-column-top'; rule: string }
  /**
   * `panel`: a key's label matches one of these once {i} (its panel number, 1-based) and {n} (the panel
   * count) are filled in. `suggest`: the label for a missing panel, from the panel before it.
   */
  labels: { rule: string; panel: string[]; suggest: { strip: string; template: string }; examples: string[] }
  /** `role`: every panel is the role rule's set colour. `one-per-set`: all panels of a set share one colour. */
  colours:
    | { rule: 'role'; meaning: string; roles: Record<CueRole, PaletteName>; set: PaletteName }
    | { rule: 'one-per-set'; meaning: string; palette: Record<string, string> }
  keyTypes: string[]
}

/** A multipart set as the catalog knows it: this cue's 1-based part and the part count. */
export type CueSetLookup = { id: string; index: number; count: number }

/* ----------------------------------------------------------------- loader --- */

const fail = (w: string, what: string): never => { throw new Error(`deck style ${w}: ${what}`) }
const fill = (pattern: string, i: number, n: number) => pattern.replaceAll('{i}', String(i)).replaceAll('{n}', String(n))

/** Check a style's shape (and that its label patterns compile), returning it typed. */
export function parseDeckStyle(value: unknown): DeckStyle {
  const s = value as DeckStyle
  const w = String((s as { workspace?: unknown })?.workspace ?? '?')
  if (!s || typeof s !== 'object') fail(w, 'not an object')
  if (s.workspace !== 'crc' && s.workspace !== 'tbi') fail(w, 'workspace must be crc or tbi')
  if (!Array.isArray(s.pages) || !s.pages.every((p) => Number.isInteger(p.from) && Number.isInteger(p.to) && p.from <= p.to && typeof p.role === 'string' && typeof p.template === 'string')) fail(w, 'pages must be {from, to, role, template} ranges')
  if (!Array.isArray(s.columns?.graphics) || !s.columns.graphics.every(Number.isInteger)) fail(w, 'columns.graphics must list column numbers')
  if (s.growth?.direction !== 'down' || s.growth?.continue !== 'next-column-top') fail(w, 'growth must be down, continuing at the top of the next column')
  if (!Array.isArray(s.labels?.panel) || !s.labels.panel.length) fail(w, 'labels.panel must list at least one pattern')
  for (const p of [...s.labels.panel, s.labels.suggest?.strip ?? '']) {
    if (!p.includes('{i}')) fail(w, `label pattern "${p}" has no {i}`)
    try { new RegExp(fill(p, 1, 2), 'iu') } catch (e) { fail(w, `label pattern "${p}": ${(e as Error).message}`) }
  }
  if (typeof s.labels.suggest?.template !== 'string' || !s.labels.suggest.template.includes('{base}')) fail(w, 'labels.suggest.template must use {base}')
  const c = s.colours
  if (c?.rule === 'role') { if (!(c.set in PALETTE) || !Object.values(c.roles ?? {}).every((n) => n in PALETTE)) fail(w, 'colours name a colour the palette does not have') }
  else if (c?.rule !== 'one-per-set') fail(w, 'colours.rule must be role or one-per-set')
  return s
}

/** Each operator's style, read from styles/<workspace>.json. */
export const DECK_STYLES: Record<DeckWorkspace, DeckStyle> = { crc: parseDeckStyle(crcStyle), tbi: parseDeckStyle(tbiStyle) }

/* ------------------------------------------------------------------ check --- */

type CueKey = { b: DeckButton; spec: Extract<ButtonSpec, { kind: 'cue' }>; index: number; count: number }
type Add = (severity: Severity, code: FindingCode, where: { page?: number | null; row?: number | null; column?: number | null }, message: string) => void

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Does `label` carry panel `i` of `n` the way the style labels a panel? */
export function panelLabelOk(style: DeckStyle, label: string, i: number, n: number): boolean {
  const l = oneLine(label)
  return style.labels.panel.some((p) => new RegExp(fill(p, i, n), 'iu').test(l))
}

/**
 * The label a missing panel `i` of `n` would take, from the label of panel `from` before it, which was
 * labelled when the set had `fromCount` panels (null when the pattern does not fit).
 */
export function suggestPanelLabel(style: DeckStyle, previous: string, from: number, i: number, n: number, fromCount = n): string | null {
  const re = new RegExp(fill(style.labels.suggest.strip, from, fromCount), 'iu')
  const l = oneLine(previous)
  if (!re.test(l)) return null
  const base = l.replace(re, '')
  return base ? fill(style.labels.suggest.template.replaceAll('{base}', base), i, n) : null
}

/**
 * Check every multi-panel graphic on every page against `style`. Findings go through `add`, as the
 * validator's own do. A missing or duplicated panel key is an error (the operator cannot step the set);
 * placement, label and colour are warnings (the operator's own deliberate exceptions exist; QC check 4
 * judges them by eye). Returns counts for the summary.
 */
export function checkDeckStyle(deck: CompanionDeck, style: DeckStyle, cues: Pick<CueLookups, 'set' | 'name'>, add: Add): { sets: number; panels: number } {
  let sets = 0, panels = 0
  for (const page of [...deck.pages].sort((a, b) => a.number - b.number)) {
    const occupied = new Set(page.buttons.map((b) => `${b.row}/${b.col}`))
    const groups = new Map<string, CueKey[]>()
    for (const b of page.buttons) {
      if (b.spec.kind !== 'cue') continue
      const spec = b.spec
      const set = cues.set?.(spec.cueId)
      const key = set && set.count > 1 ? { id: `set:${set.id}`, index: set.index, count: set.count }
        : spec.sequence && spec.sequence.count > 1 ? { id: `seq:${cueSetId(spec.sequence.name)}`, index: spec.sequence.index, count: spec.sequence.count } : null
      if (!key) continue
      ;(groups.get(key.id) ?? groups.set(key.id, []).get(key.id)!).push({ b, spec, index: key.index, count: key.count })
    }
    for (const keys of groups.values()) {
      sets++; panels += keys.length
      checkSet(deck, style, page, keys, occupied, cues, add)
    }
  }
  return { sets, panels }
}

function checkSet(deck: CompanionDeck, style: DeckStyle, page: DeckPage, keys: CueKey[], occupied: Set<string>, cues: Pick<CueLookups, 'name'>, add: Add) {
  const count = Math.max(...keys.map((k) => k.count))
  keys.sort((a, b) => a.index - b.index || a.b.col - b.b.col || a.b.row - b.b.row)
  const first = keys[0]
  const setName = first.spec.sequence?.name ?? cues.name?.(first.spec.cueId) ?? first.spec.label
  const at = (k: CueKey) => ({ page: page.number, row: k.b.row, column: k.b.col })
  const cell = (r: number, c: number) => `row ${r} column ${c}`
  const named = (k: CueKey) => `Page ${page.number} "${page.name}", ${cell(k.b.row, k.b.col)} ("${oneLine(k.spec.label)}")`
  const byIndex = new Map<number, CueKey>()

  // One key per panel.
  for (const k of keys) {
    if (byIndex.has(k.index)) {
      const other = byIndex.get(k.index)!
      add('error', 'style-panel-duplicate', at(k), `${named(k)} is a second key for panel ${k.index} of ${count} of "${setName}"; ${cell(other.b.row, other.b.col)} already fires it. Keep one key per panel.`)
      continue
    }
    byIndex.set(k.index, k)
  }
  const missing = Array.from({ length: count }, (_, i) => i + 1).filter((i) => !byIndex.has(i))
  if (missing.length) {
    const hints = missing.map((i) => {
      const before = [...byIndex.values()].filter((k) => k.index < i).at(-1)
      const spot = before ? nextSpot(deck, style, before, occupied) : null
      const label = before ? suggestPanelLabel(style, before.spec.label, before.index, i, count, before.spec.sequence?.count ?? count) : null
      const place = spot ? `by ${style.workspace.toUpperCase()}'s layout: ${cell(spot[0], spot[1])}` : before ? `no free graphics cell follows panel ${before.index}, so make room below it` : ''
      const parts = [place, label ? `labelled "${label}"` : ''].filter(Boolean)
      return `panel ${i}${parts.length ? ` (${parts.join(', ')})` : ''}`
    })
    add('error', 'style-panel-missing', at(first), `"${setName}" has ${count} panels, and page ${page.number} "${page.name}" has keys for ${byIndex.size === 1 ? 'only panel' : 'panels'} ${[...byIndex.keys()].join(', ')}. Add ${hints.join('; ')}, so the operator can step the whole set.`)
  }

  // Placement: each panel directly below the one before, or at the top of the next column when the column is full below it.
  const present = [...byIndex.values()]
  for (let j = 1; j < present.length; j++) {
    const prev = present[j - 1], k = present[j]
    if (k.index !== prev.index + 1) continue // a gap is reported as missing, not as placement
    if (placedAfter(deck, prev, k, occupied)) continue
    const spot = nextSpot(deck, style, prev, occupied)
    add('warning', 'style-placement', at(k), `${named(k)} is panel ${k.index} of "${setName}", but ${style.workspace.toUpperCase()}'s sets run down the column, continuing at the top of the next one: after ${cell(prev.b.row, prev.b.col)} it would sit at ${spot ? cell(spot[0], spot[1]) : 'the next free cell'}.`)
  }

  // Labels carry the panel number the operator's way.
  for (const k of present) {
    if (panelLabelOk(style, k.spec.label, k.index, count)) continue
    add('warning', 'style-label', at(k), `${named(k)} is panel ${k.index} of ${count} of "${setName}", and its label does not carry its panel number ${k.index} the ${style.workspace.toUpperCase()} way (as in ${style.labels.examples.slice(0, 2).map((e) => `"${e}"`).join(', ')}).`)
  }

  // Colour meaning.
  const colourOf = (k: CueKey) => k.spec.bg ?? roleColour(deck.palette, k.spec)
  if (style.colours.rule === 'role') {
    const want = deck.palette[style.colours.set]
    for (const k of present) if (colourOf(k) !== want) add('warning', 'style-colour', at(k), `${named(k)} is panel ${k.index} of "${setName}", and a set's panels are ${style.colours.set} (${hex(want)}) on the ${style.workspace.toUpperCase()} deck; this key is ${hex(colourOf(k))}.`)
  } else {
    const colours = new Map<number, number>()
    for (const k of present) colours.set(colourOf(k), (colours.get(colourOf(k)) ?? 0) + 1)
    if (colours.size > 1) {
      const main = [...colours].sort((a, b) => b[1] - a[1])[0][0]
      for (const k of present) if (colourOf(k) !== main) add('warning', 'style-colour', at(k), `${named(k)} is panel ${k.index} of "${setName}", coloured ${hex(colourOf(k))}; the set's other panels are ${hex(main)}. One prayer keeps one colour.`)
    }
  }
}

/** Is `k` where the growth rule puts the panel after `prev`? */
function placedAfter(deck: CompanionDeck, prev: CueKey, k: CueKey, occupied: Set<string>): boolean {
  if (k.b.col === prev.b.col && k.b.row === prev.b.row + 1) return true
  const fullBelow = prev.b.row + 1 >= deck.grid.rows || occupied.has(`${prev.b.row + 1}/${prev.b.col}`)
  if (!fullBelow || k.b.col !== prev.b.col + 1) return false
  for (let r = 0; r < k.b.row; r++) if (!occupied.has(`${r}/${k.b.col}`)) return false
  return true
}

/** Where the panel after `prev` goes: below it when that cell is free, else the first free cell from the top of the next graphics column. */
function nextSpot(deck: CompanionDeck, style: DeckStyle, prev: CueKey, occupied: Set<string>): [number, number] | null {
  const below = prev.b.row + 1
  if (below < deck.grid.rows && !occupied.has(`${below}/${prev.b.col}`)) return [below, prev.b.col]
  const col = prev.b.col + 1
  if (col >= deck.grid.columns || !style.columns.graphics.includes(col)) return null
  for (let r = 0; r < deck.grid.rows; r++) if (!occupied.has(`${r}/${col}`)) return [r, col]
  return null
}
