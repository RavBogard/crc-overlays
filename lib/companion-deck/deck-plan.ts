// G6 (TBI redo) - a deck plan applied in one call. A plan is one row per button, the columns of
// work/tbi-redo/build-prep/deck-plan.csv: page,row,col,label,bg,targetKind,targetKey,panelIndex,notes
// (and an optional pageName). This file reads a plan (CSV text or a JSON array of rows) and lays it on a
// copy of the deck; tools.ts (apply_deck_plan) resolves each row's build key to a published cue first,
// then validates and saves the result in one write, as every other deck change is saved.
//
// What a plan does to a cell, by targetKind:
// - local / corpus / slide / crc: a graphic. The cell becomes a one-step cue key on the resolved cue, with
//   the plan's label and background, and the Requested and Rendered lights every cue key carries.
// - birddog / obs: the camera or OBS scene key the deck already has there. It is kept exactly as it is and
//   never rebuilt from the plan; when it is not at that cell, that is reported.
// - empty: the cell ends empty. A graphic key there is removed; a device or navigation key is kept and reported.
// - dropped: the item is not placed. A graphic key left on its cell is removed, unless another row uses it.
// Companion's built-in navigation and a template's fixed keys are never touched.
import type { z } from 'zod/v4'
import { buttonLook } from './convert.ts'
import { companionLabel, unwrap, type ButtonSpec, type CompanionDeck, type CueRole, type DeckButton, type DeckPage, type IdSeed, type PageTemplate } from './model.ts'
import { DECK_PLAN_ROW, DECK_PLAN_TARGET_KINDS } from './tool-schemas.ts'
import { buttonText, entities } from './validate.ts'

/* ----------------------------------------------------------------- rows --- */

export { DECK_PLAN_TARGET_KINDS, DECK_PLAN_ROW }
export type DeckPlanTargetKind = (typeof DECK_PLAN_TARGET_KINDS)[number]
export const GRAPHIC_KINDS: ReadonlySet<DeckPlanTargetKind> = new Set(['local', 'corpus', 'slide', 'crc'])
const DEVICE_KINDS: ReadonlySet<DeckPlanTargetKind> = new Set(['birddog', 'obs'])
export const DECK_PLAN_COLUMNS = ['page', 'row', 'col', 'label', 'bg', 'targetKind', 'targetKey', 'panelIndex', 'notes', 'pageName'] as const
const REQUIRED_COLUMNS = ['page', 'row', 'col', 'label', 'bg', 'targetKind', 'targetKey', 'panelIndex'] as const

export type DeckPlanRow = z.infer<typeof DECK_PLAN_ROW>
/** A plan row with where it came from (its CSV line, or its index in the array). */
export type PlanRow = DeckPlanRow & { line: number }

export class DeckPlanError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message) }
}

/** RFC 4180 CSV: quoted fields, "" inside quotes, commas and line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false, i = 0
  const s = text.replace(/^﻿/, '')
  while (i < s.length) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch; i++
  }
  if (quoted) throw new DeckPlanError('plan_unreadable', 'The deck plan has a quoted field that never closes (an odd number of " marks). Nothing was read.')
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

const integerLike = (v: unknown) => (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v) ? Number(v) : v)
/** A row object (from CSV cells or a JSON array) in the inline row's types: numbers from digit strings, empty key and panel as null. */
function coerceRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }
  for (const k of ['page', 'row', 'col'] as const) if (k in out) out[k] = integerLike(out[k])
  if (out.panelIndex === '' || out.panelIndex === undefined) out.panelIndex = null
  else out.panelIndex = integerLike(out.panelIndex)
  if (out.targetKey === '') out.targetKey = null
  if (typeof out.targetKind === 'string') out.targetKind = out.targetKind.trim().toLowerCase()
  if (out.pageName === '' || out.pageName === undefined) delete out.pageName
  if (out.notes === undefined) delete out.notes
  if (out.label === undefined || out.label === null) out.label = ''
  if (out.bg === undefined || out.bg === null) out.bg = ''
  return out
}

function checkedRows(objects: { line: number; value: unknown }[], where: (line: number) => string): PlanRow[] {
  const problems: string[] = []
  const rows: PlanRow[] = []
  for (const { line, value } of objects) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { problems.push(`${where(line)} is not a row object`); continue }
    const parsed = DECK_PLAN_ROW.safeParse(coerceRow(value as Record<string, unknown>))
    if (!parsed.success) { problems.push(`${where(line)}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'row'} ${i.message}`).join('; ')}`); continue }
    rows.push({ ...parsed.data, line })
  }
  if (problems.length) throw new DeckPlanError('plan_invalid', `The deck plan has ${problems.length} row${problems.length === 1 ? '' : 's'} that can't be read, so nothing was changed. ${problems.slice(0, 5).join('. ')}${problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''}. Correct them and send the plan again.`)
  if (!rows.length) throw new DeckPlanError('plan_empty', 'The deck plan has no rows. Nothing was changed.')
  return rows
}

/** The rows of a CSV deck plan: a header naming the columns, then one row per button. */
export function deckPlanFromCsv(text: string): PlanRow[] {
  const table = parseCsv(text)
  if (!table.length) throw new DeckPlanError('plan_empty', 'The deck plan is empty. Nothing was changed.')
  const header = table[0].map((h) => h.trim())
  const unknown = header.filter((h) => !(DECK_PLAN_COLUMNS as readonly string[]).includes(h))
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (unknown.length || missing.length) {
    throw new DeckPlanError('plan_columns', `The deck plan's header must name the columns ${DECK_PLAN_COLUMNS.slice(0, 9).join(',')} (pageName is optional)${missing.length ? `; it lacks ${missing.join(', ')}` : ''}${unknown.length ? `; it has ${unknown.map((u) => `"${u}"`).join(', ')}, which a plan does not use` : ''}. Nothing was changed.`)
  }
  const objects = table.slice(1).map((cells, i) => {
    const value: Record<string, unknown> = {}
    header.forEach((h, j) => { value[h] = cells[j] ?? '' })
    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim())) value.__extra = cells.slice(header.length)
    return { line: i + 2, value }
  })
  return checkedRows(objects, (line) => `Line ${line}`)
}

/** The rows of a JSON deck plan: an array of row objects (the CSV's columns). */
export function deckPlanFromJson(value: unknown): PlanRow[] {
  if (!Array.isArray(value)) throw new DeckPlanError('plan_unreadable', 'A JSON deck plan must be an array of rows ({page,row,col,label,bg,targetKind,targetKey,panelIndex,notes}). Nothing was changed.')
  return checkedRows(value.map((v, i) => ({ line: i + 1, value: v })), (line) => `Row ${line}`)
}

/** A plan read from an import's text: a JSON array when it starts with "[", otherwise CSV. */
export function deckPlanFromText(text: string): PlanRow[] {
  const t = text.replace(/^﻿/, '').trimStart()
  if (t.startsWith('[')) {
    let value: unknown
    try { value = JSON.parse(t) } catch { throw new DeckPlanError('plan_unreadable', 'That deck plan starts like JSON but is not valid JSON. Nothing was changed.') }
    return deckPlanFromJson(value)
  }
  return deckPlanFromCsv(text)
}

/** Inline rows (already typed by the tool schema), numbered from 1. */
export const deckPlanFromRows = (rows: readonly DeckPlanRow[]): PlanRow[] => rows.map((r, i) => ({ ...r, line: i + 1 }))

/* ------------------------------------------------------------ resolution --- */

/** A published cue a graphic row binds to. */
export type PlanCue = { id: string; name: string; title?: string; revision: number | null; set?: { id: string; index: number; count: number } }
/** What a graphic row's key resolved to: the cue, or why not (a sentence naming what to do next). */
export type PlanResolution = { cue: PlanCue; via: 'targets' | 'draft' | 'draft-set' } | { code: string; message: string }

/* ---------------------------------------------------------------- report --- */

export type PlanFinding = {
  page: number; row: number; column: number; label: string; key: string | null; targetKind: DeckPlanTargetKind | null
  code: string; message: string
  /** A blocking finding refuses the apply; nothing is written while any remains. */
  blocking: boolean
}
export type PlanAction = 'placed' | 'rebound' | 'unchanged' | 'kept-device' | 'emptied' | 'dropped'
export type PlanChange = { page: number; row: number; column: number; action: PlanAction; label?: string; cueId?: string; cueName?: string; was?: string }
export type PlanCounts = { rows: number; placed: number; rebound: number; unchanged: number; keptDevice: number; emptied: number; dropped: number; findings: number; blocking: number; pagesCreated: number; pagesRenamed: number; notInPlan: number }
export type PlanOutcome = { counts: PlanCounts; changes: PlanChange[]; findings: PlanFinding[]; notInPlan: { page: number; row: number; column: number; label: string }[] }

export type PlanHooks = {
  /** A new page on the deck's service template, with the template's fixed keys. */
  newPage(deck: CompanionDeck, page: number, name: string | null): DeckPage
  /** Fresh entity ids for a key the plan places. */
  ids(): IdSeed
}

const HEX = /^#([0-9a-f]{6})$/i
/** Black or white text, whichever reads on the background (WCAG relative luminance). */
export function contrastText(bg: number): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const l = 0.2126 * lin((bg >> 16) & 255) + 0.7152 * lin((bg >> 8) & 255) + 0.0722 * lin(bg & 255)
  return l > 0.179 ? 0x000000 : 0xffffff
}

/** A seeded Singular button that has not been bound yet: her label and colours, no action. */
export const isPlaceholder = (deck: CompanionDeck, b: DeckButton) =>
  b.spec.kind === 'fragment' && Boolean(b.singular) && /Singular graphic, not yet converted/.test(deck.fragments[b.spec.fragment]?.source ?? '')
/** A key the plan may replace or clear: a cue key, or an unconverted placeholder. */
const isGraphic = (deck: CompanionDeck, b: DeckButton) => b.spec.kind === 'cue' || isPlaceholder(deck, b)
/** A carried camera / OBS / other device key (never rebuilt from a plan). */
const isDevice = (deck: CompanionDeck, b: DeckButton) => (b.spec.kind === 'fragment' && !isPlaceholder(deck, b)) || b.spec.kind === 'actions'

/** The device actions a key's targetKey names: "Birddog:pt:up_left; Birddog:pt:stop" -> [{conn, action, value}]. */
export function deviceParts(key: string): { conn: string; action: string; value: string }[] {
  return key.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const a = p.indexOf(':'), b = a < 0 ? -1 : p.indexOf(':', a + 1)
    return a < 0 ? { conn: p, action: '', value: '' } : b < 0 ? { conn: p.slice(0, a), action: p.slice(a + 1), value: '' } : { conn: p.slice(0, a), action: p.slice(a + 1, b), value: p.slice(b + 1) }
  })
}

/** Does this device key fire what `parts` names (its connection, action and first option value)? */
function deviceMatches(deck: CompanionDeck, b: DeckButton, parts: { conn: string; action: string; value: string }[]): boolean {
  if (!isDevice(deck, b)) return false
  const keys = b.spec.kind === 'fragment' ? [b.spec.fragment] : b.spec.kind === 'actions' ? b.spec.steps.flat() : []
  const list = keys.flatMap((k) => { const f = deck.fragments[k]; return f ? entities(f.kind === 'entities' ? f.entities : f.steps) : [] }).filter((e) => e.type === 'action')
  if (!parts.length) return false
  return parts.every((p) => list.some((e) => {
    const conn = e.connectionId.startsWith('label:') ? e.connectionId.slice(6) : e.connectionId
    if (conn !== p.conn && conn !== companionLabel(p.conn)) return false
    if (p.action && e.definitionId !== p.action) return false
    if (!p.value) return true
    return Object.values(e.options ?? {}).some((v) => String(unwrap(v)) === p.value)
  }))
}

const where = (page: number, row: number, col: number) => `page ${page}, row ${row} column ${col}`

/**
 * Lay `rows` on `deck` (mutated in place; pass a copy). `resolved` holds each graphic row's resolution
 * by its line. Pure apart from `hooks`.
 */
export function layDeckPlan(deck: CompanionDeck, rows: readonly PlanRow[], resolved: ReadonlyMap<number, PlanResolution>, hooks: PlanHooks): PlanOutcome {
  const findings: PlanFinding[] = [], changes: PlanChange[] = []
  const counts: PlanCounts = { rows: rows.length, placed: 0, rebound: 0, unchanged: 0, keptDevice: 0, emptied: 0, dropped: 0, findings: 0, blocking: 0, pagesCreated: 0, pagesRenamed: 0, notInPlan: 0 }
  const find = (r: PlanRow, code: string, message: string, blocking: boolean) =>
    findings.push({ page: r.page, row: r.row, column: r.col, label: r.label, key: r.targetKey ?? null, targetKind: r.targetKind, code, message, blocking })
  const named = (r: PlanRow) => `${where(r.page, r.row, r.col)}${r.label ? ` ("${r.label.replace(/\n/g, ' ')}"` : ' ('}${r.targetKey ? `${r.label ? ', ' : ''}${r.targetKey})` : r.label ? ')' : 'no label)'}`
  const P = deck.palette
  const lights: [number, string][] = [[P.rendered, 'Rendered'], [P.requested, 'Requested'], [P.disconnected, 'disconnected']]

  // Pages: create the ones the plan needs, rename where it names one.
  const names = new Map<number, Set<string>>()
  for (const r of rows) if (r.pageName) (names.get(r.page) ?? names.set(r.page, new Set()).get(r.page)!).add(r.pageName)
  for (const [n, set] of names) if (set.size > 1) {
    const r = rows.find((x) => x.page === n && x.pageName)!
    find(r, 'page-name-conflict', `The plan names page ${n} ${[...set].map((s) => `"${s}"`).join(' and ')}. Give each page one name.`, true)
  }
  for (const n of [...new Set(rows.map((r) => r.page))].sort((a, b) => a - b)) {
    const name = names.get(n)?.size === 1 ? [...names.get(n)!][0] : null
    const page = deck.pages.find((p) => p.number === n)
    if (!page) {
      deck.pages.push(hooks.newPage(deck, n, name)); deck.pages.sort((a, b) => a.number - b.number)
      counts.pagesCreated++
    } else if (name && page.name !== name) { page.name = name; counts.pagesRenamed++ }
  }

  // One effective row per cell; a dropped row never claims a cell.
  const byCell = new Map<string, PlanRow[]>()
  for (const r of rows) (byCell.get(`${r.page}/${r.row}/${r.col}`) ?? byCell.set(`${r.page}/${r.row}/${r.col}`, []).get(`${r.page}/${r.row}/${r.col}`)!).push(r)

  for (const [, cellRows] of byCell) {
    const r0 = cellRows[0]
    const page = deck.pages.find((p) => p.number === r0.page)!
    const t: PageTemplate | undefined = deck.templates[page.template]
    const fixed = t?.fixed.find((f) => f.row === r0.row && f.col === r0.col)
    const outside = r0.row >= deck.grid.rows || r0.col >= deck.grid.columns
    const claims = cellRows.filter((r) => r.targetKind !== 'dropped')
    const dropped = cellRows.filter((r) => r.targetKind === 'dropped')
    for (const extra of claims.slice(1)) find(extra, 'cell-twice', `The plan puts two things on ${where(extra.page, extra.row, extra.col)} (lines ${claims.map((c) => c.line).join(' and ')}). Give each cell one row.`, true)
    const r = claims[0]
    const bIndex = () => page.buttons.findIndex((b) => b.row === r0.row && b.col === r0.col)
    const b = page.buttons[bIndex()] as DeckButton | undefined
    const here = b ? buttonText(b.spec, deck).replace(/\n/g, ' ') : ''

    for (const d of dropped) {
      counts.dropped++
      changes.push({ page: d.page, row: d.row, column: d.col, action: 'dropped', label: d.label })
      find(d, 'dropped', `${named(d)} is dropped by the plan and not placed${r ? '; its cell is used by another row' : ''}.${d.notes ? ` Plan note: ${d.notes}` : ''}`, false)
    }
    if (outside) { for (const x of claims) find(x, 'outside-grid', `${named(x)} is outside the deck's ${deck.grid.rows}×${deck.grid.columns} grid (rows 0-${deck.grid.rows - 1}, columns 0-${deck.grid.columns - 1}).`, true); continue }

    if (!r) {
      // Only dropped rows here: a graphic key left on the cell goes with the dropped item.
      if (b && isGraphic(deck, b)) { page.buttons.splice(bIndex(), 1); const last = changes[changes.length - 1]; last.was = here }
      else if (b && !fixed) find(dropped[0], 'dropped-cell-kept', `${named(dropped[0])} is dropped, but its cell holds "${here}", which is not a graphic key, so it was kept.`, false)
      continue
    }

    if (DEVICE_KINDS.has(r.targetKind)) {
      const parts = deviceParts(r.targetKey ?? '')
      if (b && deviceMatches(deck, b, parts)) { counts.keptDevice++; continue }
      const elsewhere = deck.pages.flatMap((p) => p.buttons.filter((x) => deviceMatches(deck, x, parts)).map((x) => where(p.number, x.row, x.col)))
      const kind = r.targetKind === 'obs' ? 'OBS scene key' : 'camera key'
      find(r, elsewhere.length ? 'device-elsewhere' : 'device-missing',
        `${named(r)}: the plan expects the ${kind} "${r.targetKey ?? ''}" here, ${b ? `but the cell holds "${here}"` : 'but the cell is empty'}${elsewhere.length ? `; the deck has it at ${elsewhere.join(', ')}` : ', and the deck has no such key anywhere'}. Device keys are kept as they are and never rebuilt from a plan; move it with move_button if it belongs here.`, false)
      continue
    }

    if (r.targetKind === 'empty') {
      if (!b) { counts.unchanged++; continue }
      if (fixed || !isGraphic(deck, b)) { find(r, 'empty-kept', `${named(r)} should end empty, but it holds "${here}", ${fixed ? `the page template's ${fixed.role} key` : 'a device or navigation key'}, which a plan never removes.`, false); continue }
      page.buttons.splice(bIndex(), 1)
      counts.emptied++
      changes.push({ page: r.page, row: r.row, column: r.col, action: 'emptied', was: here })
      continue
    }

    // A graphic.
    if (fixed) { find(r, 'fixed-cell', `${named(r)} is on the "${t!.id}" template's ${fixed.role} key, which a plan never replaces. Put the graphic on another cell.`, true); continue }
    if (b && !isGraphic(deck, b)) { find(r, 'cell-holds-device', `${named(r)}: the cell holds "${here}", a ${b.spec.kind === 'builtin' ? 'built-in navigation' : 'device or navigation'} key, which a plan never replaces. Put the graphic on another cell, or move that key first.`, true); continue }
    const res = resolved.get(r.line)
    if (!res || !('cue' in res)) { find(r, res?.code ?? 'unresolved', `${named(r)}: ${res?.message ?? 'its target was not resolved.'}`, true); continue }
    const c = res.cue
    let bg: number | undefined
    if (r.bg.trim()) {
      const m = HEX.exec(r.bg.trim())
      if (!m) { find(r, 'bad-colour', `${named(r)}: the colour "${r.bg}" is not #rrggbb.`, true); continue }
      bg = parseInt(m[1], 16)
      const clash = lights.find(([v]) => v === bg)
      if (clash) find(r, 'colour-hides-light', `${named(r)}: its background ${r.bg} is the palette's ${clash[1]} colour, so the ${clash[1]} light would not show on it. Pick another colour.`, false)
    }
    let label = r.label
    if (!label.trim()) { label = c.name.slice(0, 40); find(r, 'label-from-cue', `${named(r)} has no label in the plan, so it takes its graphic's name "${label}".`, false) }
    if (label.length > 40) { find(r, 'label-too-long', `${named(r)}: the label is ${label.length} characters; a key takes at most 40.`, true); continue }
    const was = b?.spec.kind === 'cue' ? b.spec : null
    const look = b ? buttonLook(deck, b) : null
    const color = bg === undefined ? look?.color ?? undefined : look && look.bg === bg && look.color != null ? look.color : contrastText(bg)
    const sequence = c.set && c.set.count > 1 ? { name: c.title ?? c.name, index: c.set.index, count: c.set.count } : undefined
    const role: CueRole = sequence ? 'sequence-part' : was?.role ?? 'single'
    const spec: Extract<ButtonSpec, { kind: 'cue' }> = {
      kind: 'cue', cueId: c.id, label, role, ...(sequence ? { sequence } : {}), ...(was?.gesture ? { gesture: was.gesture } : {}),
      catalog: { name: c.name, revision: c.revision }, ...(bg === undefined ? {} : { bg }), ...(color === undefined ? {} : { color }),
    }
    const same = (a: typeof spec, x: typeof spec) => JSON.stringify({ ...a, catalog: undefined }) === JSON.stringify({ ...x, catalog: undefined })
    if (b && was) {
      const rebound = !same(spec, was)
      b.spec = spec
      if (rebound) { counts.rebound++; changes.push({ page: r.page, row: r.row, column: r.col, action: 'rebound', label, cueId: c.id, cueName: c.name, was: was.cueId === c.id ? `"${was.label}"` : `"${was.label}" on ${was.catalog?.name ?? was.cueId}` }) }
      else counts.unchanged++
      continue
    }
    if (b) { b.spec = spec; b.ids = hooks.ids() }
    else page.buttons.push({ row: r.row, col: r.col, spec, ids: hooks.ids() })
    counts.placed++
    changes.push({ page: r.page, row: r.row, column: r.col, action: 'placed', label, cueId: c.id, cueName: c.name, ...(b ? { was: here } : {}) })
  }

  // A page that now holds keys of its own uses the service template (TBI's blank and service pages share their fixed keys).
  for (const n of new Set(rows.map((r) => r.page))) {
    const page = deck.pages.find((p) => p.number === n)!
    if (page.template === 'blank' && deck.templates.service && page.buttons.some((b) => b.spec.kind !== 'builtin')) page.template = 'service'
  }
  // Placeholders nothing uses any more are dropped from the deck's fragments, as the conversion does.
  const used = new Set(deck.pages.flatMap((p) => p.buttons.flatMap((b) => (b.spec.kind === 'fragment' ? [b.spec.fragment] : b.spec.kind === 'actions' ? b.spec.steps.flat() : []))))
  for (const k of Object.keys(deck.fragments)) if (!used.has(k) && /Singular graphic, not yet converted/.test(deck.fragments[k].source)) delete deck.fragments[k]

  // Graphic keys on the deck that no plan row names: kept as they are, and listed.
  const inPlan = new Set(rows.map((r) => `${r.page}/${r.row}/${r.col}`))
  const notInPlan = deck.pages.flatMap((p) => p.buttons.filter((b) => isGraphic(deck, b) && !inPlan.has(`${p.number}/${b.row}/${b.col}`)).map((b) => ({ page: p.number, row: b.row, column: b.col, label: buttonText(b.spec, deck).replace(/\n/g, ' ') })))
  counts.notInPlan = notInPlan.length
  counts.findings = findings.length
  counts.blocking = findings.filter((f) => f.blocking).length
  return { counts, changes, findings, notInPlan }
}
