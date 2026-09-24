// Converting a deck's Singular.live buttons to published Overlays cues (R-C9), generalised from
// scripts/convert-companion-singular.mjs (which keeps its CLI and its in-place rewrite of an export).
//
// convertSingularDeck() reads a seeded deck (tbi-seed.ts): every button that records what it fired on
// Singular (`singular`) becomes one conversion row. Each row's first-press composition is matched to a
// published cue with the same forgiving title search prepare_service_from_setlist uses (lib/cue-search.ts,
// same clear/plausible thresholds as lib/live-setlists.ts), plus the hand-confirmed spelling aliases of
// the original converter. Rows come back in the services vocabulary: Covered (one clear match), Needs
// review (several candidates, or a defect a person must settle) and Needs a graphic (nothing matches).
//
// Defects are surfaced, never copied: a button whose two presses fire different compositions, a label
// naming a different prayer than the button fires, two buttons on one page with the same label but
// different graphics, working notes left in a label ("NEED ..."), and (when the Singular compositions
// are known) a button firing a composition that no longer exists. applyConversion() binds only the rows a
// caller confirms, and only when they are Covered. Rows are shaped so Track T3 can add
// `reference{origin, app, comp, text, imageAssetId?}` and a content-based matcher (`matchers`).
import crypto from 'node:crypto'
import { cueSearchScore, friendlyCueName } from '../cue-search.ts'
import type { Cue } from '../player.ts'
import { type CompanionDeck, type CueRole, type DeckButton, type DeckPage, type DeckWorkspace, type SingularRef, unwrap } from './model.ts'
import { DeckConflictError, type CompanionDeckRepository, type StoredDeck } from './repository.ts'
import { ExportSeedError, SINGULAR_MODULE, seedDeckFromExportBytes, seedTbiDeck, type ExportSeedData, type SeedSummary } from './tbi-seed.ts'
import { prepare, rankCues, type Prepared } from './singular-match.ts'
import {
  REFERENCE_STORE_MISSING, SINGULAR_EXTRACT, SingularReferenceConflictError, findCredential, isMissingTable, normaliseSingularExtract, referenceFor, referenceIndex, referenceKey,
  referenceRecords, type DraftReference, type SingularReference, type SingularReferenceApp, type SingularReferenceRepository,
} from './singular-references.ts'
import type { ImportRepository } from '../imports.ts'

type Obj = Record<string, unknown>

/* ----------------------------------------- shared with the original converter --- */

/** Unwrap a Companion 5 `{value, isExpression}` option; pass a plain value straight through. */
export const val = unwrap

const layerOfType = (ctrl: Obj | null | undefined, type: string): Obj | null =>
  (((ctrl?.style as Obj | undefined)?.layers as Obj[] | undefined) ?? []).find((l) => l && typeof l === 'object' && l.type === type) ?? null

/** Button label: v4 `style.text`, v5 the text layer's `text`. */
export function buttonText(ctrl: Obj | null | undefined): string {
  const style = ctrl?.style as Obj | undefined
  if (style && typeof style.text !== 'undefined') return String(style.text ?? '')
  const t = layerOfType(ctrl, 'text')
  return t ? String(val(t.text) ?? '') : ''
}
/** Background colour: v4 `style.bgcolor`, v5 the box layer's `color`. */
export function buttonBgColor(ctrl: Obj | null | undefined): number | null {
  const style = ctrl?.style as Obj | undefined
  if (style && typeof style.bgcolor === 'number') return style.bgcolor
  const c = val(layerOfType(ctrl, 'box')?.color)
  return typeof c === 'number' ? c : null
}
/** Text colour: v4 `style.color`, v5 the text layer's `color`. */
export function buttonTextColor(ctrl: Obj | null | undefined): number | null {
  const style = ctrl?.style as Obj | undefined
  if (style && typeof style.color === 'number') return style.color
  const c = val(layerOfType(ctrl, 'text')?.color)
  return typeof c === 'number' ? c : null
}
export function isSingularInstance(inst: Obj | null | undefined): boolean {
  return !!inst && (inst.moduleId === SINGULAR_MODULE || inst.instance_type === SINGULAR_MODULE)
}

export const normName = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Compositions whose Singular names differ from the catalog entry (lower-cased; confirmed by hand). */
export const NAME_ALIASES = new Map<string, string>([
  ['ahava rabbah ahavtanu (ncomplete)', 'ahava rabbah ahavtanu (partial)'],
  ['veehavta 1', 'vahavta 1'],
  ['veehavta 2', 'vahavta 2'],
  ['veshamru', 'vshamru'],
  // Spelling differences confirmed by hand on 22 September 2026.
  ["psukei d'zimrah", 'psukei dzimrah 1'],
  ['elohai neshama', 'elohai nshama'],
  ['ahavah rabbah ahavtanu', 'ahava rabbah ahavtanu (partial)'],
  ['mi chamocha (friday)', 'mi chamocha (friday) 1'],
  ['keddusha 1', 'kedusha 1'],
  ['keddusha 2', 'kedusha 2'],
  ['keddusha 3', 'kedusha 3'],
])

/** A composition that is only ever a side panel beside a real lower third (CRC's deck). */
export const SIDE_PANEL_COMPS = new Set(['start soon right'])

/** Compositions destined to become per-service slots (name cards, reading slates). */
export const SLOT_COMPS = [
  'Student Name', 'Student Name 2', 'Two Line Student Names',
  'Torah Reading 1', 'Torah Reading 2', 'Torah Reading 3', 'Torah Reading 4', 'Torah Reading 5', 'Torah Reading 6', 'Torah Reading 7',
  'Haftarah Reading 1', 'Haftarah Reading 2', 'Haftarah Reading 3',
  'Guest Name', 'Remember Them 1', 'Remember Them 2', 'Remember Them 3',
]

export type CatalogRecord = { cueId: string; name: string; status: string; aliasOf?: string; newButton?: boolean; source?: unknown }
/** The original converter's exact-name index over a `{name: cueId | {cueId, status, ...}}` catalog map. */
export function buildCatalogIndex(catalog: Record<string, string | Partial<CatalogRecord> | null | undefined>): Map<string, CatalogRecord> {
  const index = new Map<string, CatalogRecord>()
  for (const [name, entry] of Object.entries(catalog)) {
    const cueId = typeof entry === 'string' ? entry : entry?.cueId
    if (!cueId) continue
    const rec: CatalogRecord = { cueId, name, status: 'published' }
    if (entry && typeof entry === 'object') {
      if (entry.aliasOf) rec.aliasOf = entry.aliasOf
      if (entry.newButton) rec.newButton = true
      if (entry.status) rec.status = entry.status
      if (entry.source) rec.source = entry.source
    }
    index.set(normName(name), rec)
  }
  return index
}
/** Exact-name lookup (then the alias table). `usable` is false for anything not published. */
export function lookupCue(index: Map<string, CatalogRecord>, comp: unknown): { rec: CatalogRecord | null; viaAlias: string | null; usable: boolean } {
  const key = normName(comp)
  let rec = index.get(key) ?? null
  let viaAlias: string | null = null
  if (!rec) {
    const alias = NAME_ALIASES.get(key)
    if (alias && index.has(alias)) { rec = index.get(alias)!; viaAlias = alias }
  }
  if (!rec) return { rec: null, viaAlias: null, usable: false }
  return { rec, viaAlias, usable: rec.status === 'published' }
}

/* ---------------------------------------------------------------- matching --- */

/** The thresholds prepare_service_from_setlist uses (lib/live-setlists.ts): clear at 80 and ahead of the rest; plausible from 45. */
export const CLEAR_MATCH_SCORE = 80
export const PLAUSIBLE_MATCH_SCORE = 45
const MAX_CANDIDATES = 6

export type Candidate = { cueId: string; name: string; score: number }
export type MatchResult = { method: string; clear: Candidate | null; plausible: Candidate[] }
/** One way of matching a composition to published cues. Title matching is built in; T3 adds content. */
export type CompositionMatcher = (ref: SingularRef, cues: readonly Cue[]) => MatchResult

/** The forgiving title search, over the composition name and its confirmed alias. */
export const titleMatcher: CompositionMatcher = (ref, cues) => {
  const queries = [ref.comp, NAME_ALIASES.get(normName(ref.comp))].filter((q): q is string => !!q && !!q.trim())
  const ranked = cues
    .map((cue, index) => ({ cue, index, score: Math.max(0, ...queries.map((q) => cueSearchScore(cue, q))) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const top = ranked[0]?.score ?? 0, runnerUp = ranked[1]?.score ?? -1
  const as = (x: (typeof ranked)[number]): Candidate => ({ cueId: x.cue.id, name: friendlyCueName(x.cue.name), score: x.score })
  return {
    method: 'title',
    clear: top >= CLEAR_MATCH_SCORE && top > runnerUp ? as(ranked[0]) : null,
    plausible: ranked.filter((x) => x.score >= PLAUSIBLE_MATCH_SCORE).slice(0, MAX_CANDIDATES).map(as),
  }
}

/** Cue text split the way the first pass compared it: Hebrew from every text, Latin from all but the titles. */
function preparedCue(cue: Cue): Prepared {
  const texts = cue.texts ?? {}
  const all = Object.values(texts).filter((v) => typeof v === 'string').join('\n')
  const body = Object.entries(texts).filter(([k, v]) => typeof v === 'string' && k !== 'textTitle' && k !== 'accentTextTitle').map(([, v]) => v).join('\n')
  return prepare(friendlyCueName(cue.name), all, body)
}
const STRONG = new Set(['EXACT', 'TEXT-MATCH'])

/**
 * T3: match by what the composition showed, not only its name (lib/companion-deck/singular-match.ts).
 * Clear when the best cue is EXACT or TEXT-MATCH and no other cue is nearly as strong; SAME-PRAYER and
 * PARTIAL cues are candidates for review. A composition with no stored reference is left to the title search.
 */
export function contentMatcher(references: readonly SingularReference[]): CompositionMatcher {
  const index = referenceIndex({ apps: [{ label: '', name: null, importedAt: 0, importedBy: '', compositions: [...references] }] })
  let cached: { cues: readonly Cue[]; prepared: Prepared[] } | null = null
  return (ref, cues) => {
    const record = index.get(referenceKey(ref.app, ref.comp))
    if (!record || !cues.length) return { method: 'content', clear: null, plausible: [] }
    if (cached?.cues !== cues) cached = { cues, prepared: cues.map(preparedCue) }
    const ranked = rankCues(prepare(record.name, record.text, record.text), cached.prepared)
    const as = (r: (typeof ranked)[number]): Candidate => ({ cueId: cues[r.index].id, name: friendlyCueName(cues[r.index].name), score: Math.round(r.scores.combined * 100) })
    const [best, next] = ranked
    const clear = best && STRONG.has(best.category) && !(next && STRONG.has(next.category) && next.scores.combined > best.scores.combined - 0.05) ? as(best) : null
    return { method: 'content', clear, plausible: ranked.filter((r) => r.category !== 'NO-MATCH').slice(0, MAX_CANDIDATES).map(as) }
  }
}

/* ------------------------------------------------------------ label checks --- */

/** Prayer names as they are spelled on decks, for "the label names a different prayer" (normalised words). */
const PRAYERS: [string, string[]][] = [
  ['Aleinu', ['aleinu', 'alenu']],
  ["V'ne'emar", ['vneemar', 'veneemar', 'vneeimar']],
  ['Shema', ['shema', 'shma']],
  ["V'ahavta", ['vahavta', 'veahavta', 'veehavta']],
  ['Avot', ['avot']],
  ['Gevurot', ['gevurot', 'gvurot']],
  ['Kedusha', ['kedusha', 'keddusha', 'kiddusha', 'kedushah']],
  ['Kiddush', ['kiddush']],
  ['Mi Chamocha', ['mi chamocha', 'mi khamocha']],
  ['Barchu', ['barchu', 'barechu', 'barekhu']],
  ['Kaddish', ['kaddish', 'kadish']],
  ['Adon Olam', ['adon olam']],
  ['Shalom Aleichem', ['shalom aleichem', 'shalom aleicheim']],
  ["L'cha Dodi", ['lcha dodi', 'lecha dodi']],
  ['Mizmor Shir', ['mizmor shir']],
  ['Ahavat Olam', ['ahavat olam']],
  ['Hashkiveinu', ['hashkiveinu', 'haskiveinu', 'hashkivenu']],
  ['Hashiveinu', ['hashiveinu']],
  ['Sim Shalom', ['sim shalom']],
  ['Shalom Rav', ['shalom rav']],
  ['Oseh Shalom', ['oseh shalom']],
  ['Yigdal', ['yigdal']],
  ['Avinu Malkeinu', ['avinu malkeinu', 'avinu']],
  ['Ein Keloheinu', ['ein keloheinu']],
  ['Mah Tovu', ['ma tovu', 'mah tovu']],
  ['Vayomer', ['vayomer']],
  ['Shehecheyanu', ['shehecheyanu', 'shecheyanu', 'shehechiyanu']],
  ["V'shamru", ['vshamru', 'veshamru']],
  ['Mi Shebeirach', ['mi shebeirach', 'mi sheberach']],
  ['Amidah', ['amidah']],
]
/** A label naming the outer prayer of what it fires is not a mismatch ("Amidah 3" firing Avot 2). */
const CONTAINS: Record<string, string[]> = { Amidah: ['Avot', 'Gevurot', 'Kedusha', 'Sim Shalom', 'Shalom Rav', 'Oseh Shalom'] }

export function words(text: string): string {
  return ` ${String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`׳-]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `
}
/** The prayers a label or composition name names. */
export function prayersNamed(text: string): string[] {
  const w = words(text)
  return PRAYERS.filter(([, variants]) => variants.some((v) => w.includes(` ${v} `))).map(([name]) => name)
}
const related = (a: string, b: string) => a === b || (CONTAINS[a] ?? []).includes(b) || (CONTAINS[b] ?? []).includes(a)
const sameComp = (a: SingularRef | null, b: SingularRef | null) => !!a && !!b && a.app === b.app && normName(a.comp) === normName(b.comp)
const labelKey = (label: string) => normName(label).replace(/\s+/g, ' ')
const WORKING_NOTE = /^\s*(need|todo|tbd|fix)\b|\?\?/i

/* ------------------------------------------------------------------- rows --- */

export type ConversionStatus = 'covered' | 'needs-review' | 'needs-a-graphic'
export const STATUS_LABEL: Record<ConversionStatus, string> = { covered: 'Covered', 'needs-review': 'Needs review', 'needs-a-graphic': 'Needs a graphic' }

export type DefectCode =
  | 'in-out-mismatch' | 'label-names-other-prayer' | 'duplicate-label' | 'duplicate-button'
  | 'same-graphic-different-labels' | 'working-note-label' | 'composition-missing' | 'no-first-press' | 'bound-cue-unpublished'
/** Defects that stop a matched row from being bound until a person settles them. */
const BLOCKING = new Set<DefectCode>(['in-out-mismatch', 'label-names-other-prayer', 'duplicate-label', 'working-note-label', 'composition-missing', 'no-first-press', 'bound-cue-unpublished'])
export type Defect = { code: DefectCode; message: string }

export type ConversionRow = {
  /** "page/row/column", zero-based row and column as in Companion's own button locations. */
  id: string
  page: number
  row: number
  column: number
  label: string
  bg: number | null
  color: number | null
  singular: { in: SingularRef | null; out: SingularRef | null }
  /** What the title match alone says; `status` also weighs the defects. */
  matchStatus: ConversionStatus
  status: ConversionStatus
  /** The one published cue a Covered row binds to (or the cue a bound row carries). */
  cue: { id: string; name: string } | null
  candidates: Candidate[]
  match: { method: string; query: string }
  defects: Defect[]
  /** Already a cue key on the deck. */
  bound: boolean
  reason: string
  /** T3: what the button showed on Singular (its first press), to read beside the proposed graphic. `text` is empty until the extract is imported. */
  reference: DraftReference | null
}

export type ConversionSummary = {
  workspace: DeckWorkspace
  buttons: number
  byStatus: Record<ConversionStatus, number>
  /** Distinct Singular compositions the buttons fire first, by what the title match alone says. */
  compositions: { total: number; byStatus: Record<ConversionStatus, number> }
  defects: Record<string, number>
  bound: number
  bindable: number
}
export type ConversionResult = { rows: ConversionRow[]; summary: ConversionSummary }

export type ConvertOptions = {
  /** Published cues of the workspace (the catalog a Companion picker offers). */
  cues: readonly Cue[]
  /** Matchers tried in order; the first with a clear match wins, and candidates are pooled. Default: title. */
  matchers?: CompositionMatcher[]
  /** The compositions that exist in the Singular apps, when known (T3's extract): a missing one is a dead button. Only the apps listed are judged. */
  compositions?: readonly SingularRef[]
  /** T3: the imported Singular reference material. Rows carry its text, matching compares content first, and it supplies `compositions` when those are not given. */
  references?: readonly SingularReference[]
}

/** The label and colours of a seeded (placeholder) button, read from its fragment. */
export function buttonLook(deck: CompanionDeck, button: DeckButton): { label: string; bg: number | null; color: number | null } {
  const spec = button.spec
  if (spec.kind === 'cue') return { label: spec.label, bg: spec.bg ?? null, color: spec.color ?? null }
  if (spec.kind !== 'fragment') return { label: '', bg: null, color: null }
  const f = deck.fragments[spec.fragment]
  if (!f || f.kind === 'entities') return { label: spec.text ?? '', bg: spec.bg ?? null, color: null }
  const pick = (layer: string, key: string) => {
    if ('set' in f.style) return unwrap(f.style.set[`${layer}.${key}`])
    return unwrap(((f.style.style.layers as Obj[] | undefined) ?? []).find((l) => l.id === layer)?.[key])
  }
  const text = spec.text ?? pick('text0', 'text')
  const bg = spec.bg ?? pick('box0', 'color')
  const color = pick('text0', 'color')
  // Template defaults when a style only overrides some keys: black box, white text.
  return { label: typeof text === 'string' ? text : '', bg: typeof bg === 'number' ? bg : 0, color: typeof color === 'number' ? color : 0xffffff }
}

const fires = (r: SingularRef | null) => (r ? `"${r.comp}" (${r.app})` : 'nothing')
const matchedBy = (r: ConversionRow) => (r.match.method.startsWith('content') ? 'by what it shows' : 'by name')

/** Build the conversion rows for every button that records what it fired on Singular. Pure. */
export function convertSingularDeck(deck: CompanionDeck, options: ConvertOptions): ConversionResult {
  const refs = options.references ?? []
  const matchers = options.matchers?.length ? options.matchers : refs.length ? [contentMatcher(refs), titleMatcher] : [titleMatcher]
  const compositions = options.compositions ?? (refs.length ? refs.map((r) => ({ app: r.app, comp: r.name })) : null)
  const known = compositions ? new Set(compositions.map((c) => `${c.app}\u0000${normName(c.comp)}`)) : null
  const judgedApps = new Set(compositions?.map((c) => c.app) ?? [])
  const refIndex = referenceIndex({ apps: [{ label: '', name: null, importedAt: 0, importedBy: '', compositions: [...refs] }] })
  const published = new Map(options.cues.map((c) => [c.id, c]))
  const rows: ConversionRow[] = []
  const pages = [...deck.pages].sort((a, b) => a.number - b.number)
  const match = (ref: SingularRef): MatchResult => {
    const pooled = new Map<string, Candidate>()
    let first: MatchResult | null = null
    for (const m of matchers) {
      const r = m(ref, options.cues)
      first ??= r
      for (const c of r.plausible) if (!pooled.has(c.cueId) || pooled.get(c.cueId)!.score < c.score) pooled.set(c.cueId, c)
      if (r.clear) return { ...r, plausible: [...pooled.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES) }
    }
    return { method: first?.method ?? 'title', clear: null, plausible: [...pooled.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES) }
  }

  for (const page of pages) {
    const origin = page.buttons.filter((b) => b.singular)
    for (const button of origin.sort((a, b) => a.row - b.row || a.col - b.col)) {
      const look = buttonLook(deck, button)
      const s = button.singular!
      const defects: Defect[] = []
      const bound = button.spec.kind === 'cue'
      if (!s.in) defects.push({ code: 'no-first-press', message: `Its first press shows nothing on Singular (the second press animates out ${fires(s.out)}).` })
      if (s.in && s.out && !sameComp(s.in, s.out)) {
        defects.push({ code: 'in-out-mismatch', message: `The first press shows ${fires(s.in)} but the second press takes out ${fires(s.out)}, so the second press does not clear what the first showed.` })
      }
      for (const ref of sameComp(s.in, s.out) ? [s.in] : [s.in, s.out]) {
        if (ref && known && judgedApps.has(ref.app) && !known.has(`${ref.app}\u0000${normName(ref.comp)}`)) {
          defects.push({ code: 'composition-missing', message: `It fires ${fires(ref)}, which no longer exists in that Singular app, so the button already does nothing.` })
        }
      }
      if (WORKING_NOTE.test(look.label)) defects.push({ code: 'working-note-label', message: `The label "${look.label}" is a working note, not a name for the graphic.` })
      const labelPrayers = prayersNamed(look.label)
      const firedPrayers = [s.in, s.out].flatMap((r) => (r ? prayersNamed(r.comp) : []))
      if (labelPrayers.length && firedPrayers.length && labelPrayers.some((p) => !firedPrayers.some((q) => related(p, q)))) {
        defects.push({ code: 'label-names-other-prayer', message: `The label "${look.label}" names ${labelPrayers.join(' and ')}, but the button fires ${fires(s.in)}.` })
      }
      const ref = s.in ?? s.out
      let m: MatchResult = ref ? match(ref) : { method: 'title', clear: null, plausible: [] }
      // Her label as a second query: it can only propose candidates for review, never a Covered match.
      if (!m.clear && look.label.trim() && ref) {
        const byLabel = match({ app: ref.app, comp: look.label })
        const extra = [byLabel.clear, ...byLabel.plausible]
          .filter((c): c is Candidate => !!c && !m.plausible.some((p) => p.cueId === c.cueId))
          .filter((c, i, list) => list.findIndex((x) => x.cueId === c.cueId) === i)
        if (extra.length) m = { ...m, method: `${m.method}+label`, plausible: [...m.plausible, ...extra].slice(0, MAX_CANDIDATES) }
      }
      const matchStatus: ConversionStatus = m.clear ? 'covered' : m.plausible.length ? 'needs-review' : 'needs-a-graphic'
      rows.push({
        id: `${page.number}/${button.row}/${button.col}`, page: page.number, row: button.row, column: button.col,
        label: look.label, bg: look.bg, color: look.color, singular: { in: s.in, out: s.out },
        matchStatus, status: matchStatus, cue: m.clear ? { id: m.clear.cueId, name: m.clear.name } : null,
        candidates: m.clear ? [] : m.plausible, match: { method: m.method, query: ref?.comp ?? '' }, defects, bound, reason: '',
        reference: ref ? referenceFor(ref.app, ref.comp, refIndex.get(referenceKey(ref.app, ref.comp))) : null,
      })
      if (bound && button.spec.kind === 'cue') {
        const cue = published.get(button.spec.cueId)
        const last = rows[rows.length - 1]
        last.cue = { id: button.spec.cueId, name: cue ? friendlyCueName(cue.name) : button.spec.cueId }
        if (!cue) defects.push({ code: 'bound-cue-unpublished', message: 'It is bound to a graphic that is no longer published.' })
      }
    }
  }

  // Page-level checks: one label for two graphics, or one graphic under two labels, on the same page.
  const byPage = new Map<number, ConversionRow[]>()
  for (const r of rows) (byPage.get(r.page) ?? byPage.set(r.page, []).get(r.page)!).push(r)
  for (const [page, list] of byPage) {
    const byLabel = new Map<string, ConversionRow[]>()
    for (const r of list) (byLabel.get(labelKey(r.label)) ?? byLabel.set(labelKey(r.label), []).get(labelKey(r.label))!).push(r)
    for (const group of byLabel.values()) {
      if (group.length < 2 || !group[0].label.trim()) continue
      const different = group.some((r) => !sameComp(r.singular.in, group[0].singular.in))
      const others = (r: ConversionRow) => group.filter((x) => x !== r).map((x) => `button ${x.id}`).join(' and ')
      for (const r of group) {
        r.defects.push(different
          ? { code: 'duplicate-label', message: `Page ${page} has another button labelled "${r.label}" (${others(r)}) that fires a different graphic, so one of the two labels is wrong.` }
          : { code: 'duplicate-button', message: `Page ${page} has another "${r.label}" button (${others(r)}) firing the same graphic.` })
      }
    }
    const byComp = new Map<string, ConversionRow[]>()
    for (const r of list) {
      if (!r.singular.in) continue
      const k = `${r.singular.in.app}\u0000${normName(r.singular.in.comp)}`
      ;(byComp.get(k) ?? byComp.set(k, []).get(k)!).push(r)
    }
    for (const group of byComp.values()) {
      const labels = [...new Set(group.map((r) => labelKey(r.label)))]
      if (labels.length < 2) continue
      for (const r of group) {
        const others = group.filter((x) => labelKey(x.label) !== labelKey(r.label)).map((x) => `"${x.label}" (button ${x.id})`).join(', ')
        r.defects.push({ code: 'same-graphic-different-labels', message: `It fires the same graphic as ${others} on page ${page}, under a different label.` })
      }
    }
  }

  // Status: a matched row with a blocking defect needs a person first.
  for (const r of rows) {
    const blocking = r.defects.filter((d) => BLOCKING.has(d.code))
    if (r.bound) {
      r.status = blocking.some((d) => d.code === 'bound-cue-unpublished') ? 'needs-review' : 'covered'
      r.reason = r.status === 'covered' ? `Bound to "${r.cue?.name}".` : 'Bound to a graphic that is no longer published: bind a published one.'
      continue
    }
    if (r.matchStatus === 'covered' && blocking.length) {
      r.status = 'needs-review'
      r.candidates = r.cue ? [{ cueId: r.cue.id, name: r.cue.name, score: CLEAR_MATCH_SCORE }] : r.candidates
      r.reason = `Matched "${r.cue?.name}" ${matchedBy(r)}, but ${blocking.length === 1 ? 'a defect needs' : 'defects need'} a decision first: ${blocking.map((d) => d.message).join(' ')}`
      r.cue = null
    } else if (r.matchStatus === 'covered') {
      r.reason = `Matched the published graphic "${r.cue?.name}" ${matchedBy(r)}.`
    } else if (r.matchStatus === 'needs-review') {
      r.reason = r.candidates.length > 1
        ? `Several published graphics could be this one: ${r.candidates.map((c) => `"${c.name}"`).join(', ')}. Choose one.`
        : `Closest published graphic: "${r.candidates[0].name}". Confirm it before binding.`
    } else {
      r.reason = `No published graphic matches ${fires(r.singular.in ?? r.singular.out)}. Make one, then convert again.`
    }
  }

  const zero = (): Record<ConversionStatus, number> => ({ covered: 0, 'needs-review': 0, 'needs-a-graphic': 0 })
  const byStatus = zero()
  for (const r of rows) byStatus[r.status]++
  const comps = new Map<string, ConversionStatus>()
  for (const r of rows) {
    const ref = r.singular.in ?? r.singular.out
    if (ref) { const k = `${ref.app}\u0000${normName(ref.comp)}`; if (!comps.has(k)) comps.set(k, r.matchStatus) }
  }
  const compStatus = zero()
  for (const s of comps.values()) compStatus[s]++
  const defects: Record<string, number> = {}
  for (const r of rows) for (const d of r.defects) defects[d.code] = (defects[d.code] ?? 0) + 1
  return {
    rows,
    summary: {
      workspace: deck.workspace, buttons: rows.length, byStatus, compositions: { total: comps.size, byStatus: compStatus }, defects,
      bound: rows.filter((r) => r.bound).length, bindable: rows.filter((r) => r.status === 'covered' && !r.bound).length,
    },
  }
}

/* --------------------------------------------------------------- applying --- */

export class DeckConversionError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status }
}

const cueRole = (label: string): CueRole => (/(\d+|\bpt\.?\s*\d+|\bpart\s*\d+)\s*$/i.test(label.trim()) ? 'sequence-part' : 'single')

/** Drop fragments no button uses any more, and Singular connections nothing references. */
function tidy(deck: CompanionDeck): { removedConnections: string[] } {
  const usedFragments = new Set<string>()
  for (const p of deck.pages) for (const b of p.buttons) {
    if (b.spec.kind === 'fragment') usedFragments.add(b.spec.fragment)
    if (b.spec.kind === 'actions') b.spec.steps.flat().forEach((k) => usedFragments.add(k))
    if (b.spec.kind === 'camera') usedFragments.add('camera-tally')
  }
  for (const k of Object.keys(deck.fragments)) if (!usedFragments.has(k) && /Singular graphic, not yet converted/.test(deck.fragments[k].source)) delete deck.fragments[k]
  const text = JSON.stringify([deck.fragments, deck.triggers])
  const removed: string[] = []
  deck.connections = deck.connections.filter((c) => {
    const keep = c.moduleId !== SINGULAR_MODULE || text.includes(`"label:${c.label}"`)
    if (!keep) removed.push(c.label)
    return keep
  })
  return { removedConnections: removed }
}

/**
 * Bind the confirmed rows (Covered and not yet bound) as one-step toggle cue keys with her label and
 * colours; they gain the Requested and Rendered lights. Any other row named is refused and nothing
 * changes. Returns a new deck.
 */
export function applyConversion(deck: CompanionDeck, result: ConversionResult, bind: readonly string[]): { deck: CompanionDeck; bound: ConversionRow[]; removedConnections: string[] } {
  const byId = new Map(result.rows.map((r) => [r.id, r]))
  const problems: string[] = []
  const chosen: ConversionRow[] = []
  for (const id of new Set(bind)) {
    const r = byId.get(id)
    if (!r) problems.push(`${id} is not a converted button`)
    else if (r.bound) problems.push(`page ${r.page} row ${r.row} column ${r.column} ("${r.label}") is already bound`)
    else if (r.status !== 'covered' || !r.cue) problems.push(`page ${r.page} row ${r.row} column ${r.column} ("${r.label}") is ${STATUS_LABEL[r.status]}, not Covered`)
    else chosen.push(r)
  }
  if (problems.length) throw new DeckConversionError('not_covered', `Nothing was bound: only Covered rows can be bound, and ${problems.join('; ')}. Settle those rows first, or leave them out.`)
  const next = structuredClone(deck)
  const pages = new Map<number, DeckPage>(next.pages.map((p) => [p.number, p]))
  for (const r of chosen) {
    const page = pages.get(r.page)
    const button = page?.buttons.find((b) => b.row === r.row && b.col === r.column)
    if (!button || !button.singular) throw new DeckConversionError('deck_changed', `Page ${r.page} row ${r.row} column ${r.column} is no longer a converted button. Run the conversion again.`, 409)
    button.spec = {
      kind: 'cue', cueId: r.cue!.id, label: r.label, role: cueRole(r.label),
      ...(r.bg == null ? {} : { bg: r.bg }), ...(r.color == null ? {} : { color: r.color }),
    }
    button.ids = { ctx: `${next.workspace}:${r.page}/${r.row}/${r.column}`, base: 0 }
  }
  const { removedConnections } = tidy(next)
  return { deck: next, bound: chosen, removedConnections }
}

/* ------------------------------------------------------------------ report --- */

const hex = (n: number | null) => (n == null ? '' : `#${n.toString(16).padStart(6, '0')}`)
const cell = (r: ConversionRow) => `Page ${r.page}, row ${r.row + 1}, column ${r.column + 1} (${r.id})`
const md = (s: string) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** A plain-language Markdown report of a conversion: counts, every defect, every Needs-a-graphic row. */
export function conversionReportMarkdown(result: ConversionResult, meta: { title: string; intro: string[]; catalogNote: string; validation?: string[]; extra?: string[] }): string {
  const { rows, summary } = result
  const L: string[] = [`# ${meta.title}`, '', ...meta.intro, '', `**Catalog matched against.** ${meta.catalogNote}`, '']
  L.push('## Counts', '', '| | Buttons | Distinct graphics fired |', '|---|---:|---:|')
  for (const s of ['covered', 'needs-review', 'needs-a-graphic'] as ConversionStatus[]) L.push(`| ${STATUS_LABEL[s]} | ${summary.byStatus[s]} | ${summary.compositions.byStatus[s]} |`)
  L.push(`| **Total** | **${summary.buttons}** | **${summary.compositions.total}** |`, '')
  L.push('Buttons are counted after defects: a button whose graphic matched but which has a defect is counted as Needs review. The graphics column counts each Singular composition once, by the name match alone.', '')
  L.push('Where a button sits: page, then row and column counted from the top-left button as row 1, column 1 (column 1 holds page up / page number / page down). The code in brackets is the same place as Companion writes it, page/row/column counted from 0: "3/0/5" is page 3, row 1, column 6.', '')

  const blocking = rows.filter((r) => r.defects.some((d) => BLOCKING.has(d.code)))
  L.push(`## Defects on the deck (${blocking.length} buttons)`, '', 'These are carried over from the Singular deck. The conversion does not copy them: each of these buttons waits for a decision before it is bound.', '')
  L.push('| Where | Label | What is wrong |', '|---|---|---|')
  for (const r of blocking) L.push(`| ${cell(r)} | ${md(r.label)} | ${md(r.defects.filter((d) => BLOCKING.has(d.code)).map((d) => d.message).join(' '))} |`)
  const notes = rows.filter((r) => r.defects.some((d) => !BLOCKING.has(d.code)))
  if (notes.length) {
    L.push('', `### Worth a look, not blocking (${notes.length} buttons)`, '', '| Where | Label | Note |', '|---|---|---|')
    for (const r of notes) L.push(`| ${cell(r)} | ${md(r.label)} | ${md(r.defects.filter((d) => !BLOCKING.has(d.code)).map((d) => d.message).join(' '))} |`)
  }

  const needs = rows.filter((r) => r.status === 'needs-a-graphic')
  L.push('', `## Needs a graphic (${needs.length} buttons)`, '', 'No published graphic matches what these buttons show today. Each needs a graphic made (or an existing one named to match) before the button can be bound. On the new deck they keep their label and colour but do nothing until then.', '')
  L.push('| Where | Label | Shows today (Singular) |', '|---|---|---|')
  for (const r of needs) L.push(`| ${cell(r)} | ${md(r.label)} | ${md(r.singular.in?.comp ?? r.singular.out?.comp ?? '')} (${md(r.singular.in?.app ?? r.singular.out?.app ?? '')}) |`)

  const review = rows.filter((r) => r.status === 'needs-review')
  L.push('', `## Needs review (${review.length} buttons)`, '', 'A graphic may exist for these, but a person has to choose it or settle a defect first.', '')
  L.push('| Where | Label | Shows today (Singular) | Why |', '|---|---|---|---|')
  for (const r of review) L.push(`| ${cell(r)} | ${md(r.label)} | ${md(r.singular.in?.comp ?? '')} | ${md(r.reason)} |`)

  const covered = rows.filter((r) => r.status === 'covered')
  L.push('', `## Covered (${covered.length} buttons)`, '', 'One published graphic clearly matches. These are the only buttons the conversion binds, and only when confirmed.', '')
  L.push('| Where | Label | Colour | Shows today (Singular) | Graphic |', '|---|---|---|---|---|')
  for (const r of covered) L.push(`| ${cell(r)} | ${md(r.label)} | ${hex(r.bg)} | ${md(r.singular.in?.comp ?? '')} | ${md(r.cue?.name ?? '')} |`)
  if (meta.validation?.length) L.push('', '## Deck check', '', ...meta.validation)
  if (meta.extra?.length) L.push('', ...meta.extra)
  return L.join('\n') + '\n'
}

/* ------------------------------------------------------------ MCP surface --- */

export const DECK_CONVERSION_TOOLS = ['seed_deck_from_export', 'convert_singular_deck', 'import_singular_extract'] as const
export const isDeckConversionTool = (name: string) => (DECK_CONVERSION_TOOLS as readonly string[]).includes(name)

export type DeckConversionDeps = {
  workspace: DeckWorkspace
  /** Where decks are stored; null until the deck store is wired on this deployment (C3). */
  repository: CompanionDeckRepository | null
  /** The workspace's published cues. */
  cues(): Promise<readonly Cue[]>
  /** Simone's committed seed (tbi-seed-data.json). */
  committedSeed(): Promise<ExportSeedData>
  now(): number
  /** T3: where imported Singular reference material is kept. Left out, conversion runs without it (name matching only). */
  references?: SingularReferenceRepository | null
  /** Whether an asset id names artwork in this workspace's library. Left out, imageAssetId is checked for its shape only. */
  assetExists?: (id: string) => Promise<boolean>
  /** G1: where dropped files are kept, for import_singular_extract {importId}. Left out, importId is refused. */
  imports?: ImportRepository | null
}

let configuredRepository: CompanionDeckRepository | null = null
/** Override the deck store these tools write to; by default they share the deck tools' own store (C3). */
export function setDeckConversionRepository(repository: CompanionDeckRepository | null) { configuredRepository = repository }

async function defaultDeps(): Promise<DeckConversionDeps> {
  const [{ getPublicWorkspace }, { authoringCatalog }, { isNamesCueId }, { defaultDeckRepository }, { defaultSingularReferenceRepository }] = await Promise.all([import('../workspace'), import('../server'), import('../names-list'), import('./tools.ts'), import('./singular-references.ts')])
  return {
    references: defaultSingularReferenceRepository(),
    imports: (await import('../imports')).defaultImportRepository(),
    assetExists: async (id) => { const { defaultAssetRepository } = await import('../assets'); return Boolean(await defaultAssetRepository().get(id)) },
    workspace: getPublicWorkspace().id === 'temple-bnai-israel-kalamazoo' ? 'tbi' : 'crc',
    // One store for the deck: a deck seeded or converted here is the one get_deck reads and edits.
    repository: configuredRepository ?? defaultDeckRepository(),
    // Archived drafts can keep an active revision in the live catalog, but the deck validator counts them as
    // unpublished (deckCatalogCues), so a button bound to one would fail validate_deck. Match only what it accepts.
    cues: async () => {
      const [catalog, drafts] = await Promise.all([authoringCatalog(), import('../authoring').then(({ authoringRepository }) => authoringRepository().listDrafts())])
      const archived = new Set(drafts.filter((d) => d.archivedAt).map((d) => d.id))
      return catalog.cues.filter((c) => !c.hidden && !c.aliasOf && !isNamesCueId(c.id) && !archived.has(c.id))
    },
    committedSeed: async () => (await import('./tbi-seed-data.json')).default as unknown as ExportSeedData,
    now: Date.now,
  }
}

const refuse = (code: string, message: string, status = 400): never => { throw new DeckConversionError(code, message, status) }
const workspaceName = (w: DeckWorkspace) => (w === 'tbi' ? 'TBI' : 'CRC')
const MAX_BASE64 = 1_000_000

function allowedKeys(data: Obj, allowed: string[]) {
  const extra = Object.keys(data).filter((k) => !allowed.includes(k))
  if (extra.length) refuse('invalid_input', `Unknown field${extra.length > 1 ? 's' : ''}: ${extra.join(', ')}.`)
}

function compactRow(r: ConversionRow) {
  return {
    id: r.id, where: `page ${r.page}, row ${r.row} column ${r.column}`, label: r.label,
    fires: r.singular.in ? `${r.singular.in.app}: ${r.singular.in.comp}` : null,
    ...(r.singular.out && !sameComp(r.singular.in, r.singular.out) ? { takesOut: `${r.singular.out.app}: ${r.singular.out.comp}` } : {}),
    status: STATUS_LABEL[r.status],
    ...(r.cue ? { cue: r.cue.name, cueId: r.cue.id } : {}),
    ...(r.candidates.length && r.status !== 'covered' ? { candidates: r.candidates.map((c) => ({ cueId: c.cueId, name: c.name })) } : {}),
    ...(r.defects.length ? { defects: r.defects.map((d) => d.code) } : {}),
    ...(r.bound ? { bound: true } : {}),
    // T3: the old text beside the proposed graphic (shortened here; view:'full' has the whole reference).
    ...(r.reference ? { oldText: r.reference.text ? excerpt(r.reference.text) : null } : {}),
    next: r.reason,
  }
}
const excerpt = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 160 ? `${flat.slice(0, 159).replace(/\s+\S*$/, '')}…` : flat
}

/** The stored reference material for this workspace, or none; a store that is not set up counts as none. */
async function storedReferences(deps: DeckConversionDeps) {
  if (!deps.references) return null
  try { return await deps.references.get(deps.workspace) } catch (e) { if (isMissingTable(e)) return null; throw e }
}

function committedSummary(seed: ExportSeedData): SeedSummary {
  const count = (kind: (b: DeckButton) => boolean) => seed.pages.reduce((n, p) => n + p.buttons.filter(kind).length, 0)
  return {
    pages: seed.pages.length, pagesWithButtons: seed.pages.filter((p) => p.template === 'service').length,
    graphics: count((b) => !!b.singular), devices: count((b) => b.spec.kind === 'fragment' && !b.singular), builtInNav: count((b) => b.spec.kind === 'builtin'),
    keptConnections: seed.connections.map((c) => c.label), droppedConnections: seed.dropped.map((d) => d.label),
    connectionSettingsDiscarded: seed.connectionSettingsDiscarded, warnings: [],
  }
}

async function seedOperation(data: Obj, actor: string, deps: DeckConversionDeps) {
  allowedKeys(data, ['export', 'fileName', 'useCommittedSeed', 'expectedVersion', 'dryRun'])
  if (deps.workspace !== 'tbi') refuse('seed_workspace', "CRC's deck is seeded from its released preset, not from an export, so nothing was seeded. Use the deck tools to change CRC's deck.")
  const upload = typeof data.export === 'string' ? data.export : null
  const committed = data.useCommittedSeed === true
  if ((upload ? 1 : 0) + (committed ? 1 : 0) !== 1) refuse('invalid_input', "Pass either export (the .companionconfig file, base64-encoded) or useCommittedSeed:true for Simone's 14 September deck, not both.")
  const dryRun = data.dryRun !== false
  let deck: CompanionDeck, summary: SeedSummary, source: { file: string; sha256: string }
  if (upload) {
    if (upload.length > MAX_BASE64 || !/^[A-Za-z0-9+/=\s]+$/.test(upload)) refuse('invalid_input', "export must be the .companionconfig file, base64-encoded; a request carries at most about 700 KB of it (Companion's gzip export is usually far smaller).")
    const bytes = Buffer.from(upload, 'base64')
    source = { file: typeof data.fileName === 'string' && data.fileName.trim() ? data.fileName.trim().slice(0, 160) : 'uploaded.companionconfig', sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
    try {
      const seeded = seedDeckFromExportBytes(bytes, { workspace: deps.workspace, source })
      deck = seeded.deck
      summary = seeded.summary
    } catch (e) {
      if (e instanceof ExportSeedError) refuse(e.code, e.message, e.status)
      throw e
    }
  } else {
    const seed = await deps.committedSeed()
    deck = seedTbiDeck(seed)
    source = seed.source
    summary = committedSummary(seed)
  }
  const existing = deps.repository ? await deps.repository.get(deps.workspace) : null
  const shape = {
    source: source.file, companion: `${deck.companion.release} (export v${deck.companion.exportVersion})`,
    pages: summary.pages, pagesWithButtons: summary.pagesWithButtons, graphicButtons: summary.graphics, deviceButtons: summary.devices, builtInNavButtons: summary.builtInNav,
    connections: deck.connections.map((c) => c.label), droppedConnections: summary.droppedConnections, connectionSettingsDiscarded: summary.connectionSettingsDiscarded,
    warnings: summary.warnings,
  }
  if (dryRun) {
    return {
      dryRun: true, seed: shape, stored: existing ? { version: existing.version } : null,
      next: existing
        ? `Nothing was stored. To replace the stored ${workspaceName(deps.workspace)} deck (version ${existing.version}), call again with dryRun:false and expectedVersion:${existing.version}. Then run convert_singular_deck.`
        : `Nothing was stored. To store this as the ${workspaceName(deps.workspace)} deck, call again with dryRun:false. Then run convert_singular_deck.`,
    }
  }
  const repo = deps.repository ?? refuse('deck_store_unavailable', 'Nothing was stored: this deployment has no Companion deck store yet (it arrives with the deck tools). Run with dryRun:true to see the seed.', 503)
  let stored: StoredDeck
  try {
    if (existing) {
      if (typeof data.expectedVersion !== 'number') refuse('version_required', `A ${workspaceName(deps.workspace)} deck is already stored (version ${existing.version}). Replacing it discards every change made since; pass expectedVersion:${existing.version} to do that.`, 409)
      stored = await repo.replace(deps.workspace, deck, data.expectedVersion as number, actor, deps.now())
    } else stored = await repo.create(deps.workspace, deck, actor, deps.now())
  } catch (e) {
    if (e instanceof DeckConflictError) refuse(e.code, e.message, e.status)
    throw e
  }
  return { dryRun: false, seed: shape, stored: { version: stored.version }, next: 'Run convert_singular_deck (a dry run) to match its graphic buttons to published graphics.' }
}

async function convertOperation(data: Obj, actor: string, deps: DeckConversionDeps) {
  allowedKeys(data, ['deck', 'dryRun', 'bind', 'expectedVersion', 'view', 'status'])
  const source = data.deck === 'committed-seed' ? 'committed-seed' : 'stored'
  const dryRun = data.dryRun !== false
  let deck: CompanionDeck, version: number | null = null
  if (source === 'committed-seed') {
    if (deps.workspace !== 'tbi') refuse('seed_workspace', "The committed seed is TBI's; this is CRC's connection.")
    if (!dryRun) refuse('dry_run_only', 'The committed seed can only be previewed. Store it first with seed_deck_from_export{useCommittedSeed:true, dryRun:false}, then convert the stored deck.')
    deck = seedTbiDeck(await deps.committedSeed())
  } else {
    const stored = (deps.repository ? await deps.repository.get(deps.workspace) : null) ?? refuse('deck_not_found', deps.workspace === 'tbi'
      ? "No TBI deck is stored yet. Seed one with seed_deck_from_export, or preview Simone's committed seed with deck:'committed-seed'."
      : 'No CRC deck is stored yet, so there is nothing to convert.', 404)
    deck = stored.deck
    version = stored.version
  }
  const refStore = await storedReferences(deps)
  const references = refStore?.document.apps.flatMap((a) => a.compositions) ?? []
  const result = convertSingularDeck(deck, { cues: await deps.cues(), references })
  const referenceNote = refStore
    ? { version: refStore.version, apps: refStore.document.apps.map((a) => a.label), withText: result.rows.filter((r) => r.reference?.text).length }
    : null
  const filter = typeof data.status === 'string' ? data.status : null
  const shown = result.rows.filter((r) => !filter || r.status === filter || STATUS_LABEL[r.status] === filter)
  const rows = data.view === 'full' ? shown : shown.map(compactRow)
  const counts = {
    buttons: result.summary.buttons,
    covered: result.summary.byStatus.covered, needsReview: result.summary.byStatus['needs-review'], needsAGraphic: result.summary.byStatus['needs-a-graphic'],
    compositions: result.summary.compositions, defects: result.summary.defects, alreadyBound: result.summary.bound,
  }
  const bindable = result.rows.filter((r) => r.status === 'covered' && !r.bound).map((r) => r.id)
  if (dryRun) {
    return {
      dryRun: true, deck: source, version, counts, bindable,
      references: referenceNote ?? { version: null, apps: [], withText: 0, note: 'No Singular extract is imported, so each row names the composition it fires but not what it showed, and matching is by name only. Import it with import_singular_extract.' },
      rows,
      next: bindable.length
        ? `Nothing was bound. Review the rows, then call again with dryRun:false, expectedVersion:${version ?? '<stored version>'} and bind listing the Covered rows to bind (bindable lists all ${bindable.length}). Needs review and Needs a graphic rows are never bound.`
        : 'Nothing was bound, and no row is ready to bind. Settle the Needs review rows and make the missing graphics, then convert again.',
    }
  }
  if (!Array.isArray(data.bind) || !data.bind.length || data.bind.some((x) => typeof x !== 'string')) refuse('invalid_input', 'bind must list the row ids to bind (from a dry run), for example ["3/0/1"].')
  if (typeof data.expectedVersion !== 'number') refuse('version_required', `Pass expectedVersion:${version} (the deck version this conversion read).`, 409)
  if (data.expectedVersion !== version) refuse('version_conflict', `The ${workspaceName(deps.workspace)} Companion deck changed in another session (it is now version ${version}). Run the dry run again and retry with the new version.`, 409)
  const repo = deps.repository ?? refuse('deck_store_unavailable', 'Nothing was bound: this deployment has no Companion deck store yet.', 503)
  const applied = applyConversion(deck, result, data.bind as string[])
  let stored: StoredDeck
  try { stored = await repo.replace(deps.workspace, applied.deck, version!, actor, deps.now()) } catch (e) {
    if (e instanceof DeckConflictError) refuse(e.code, e.message, e.status)
    throw e
  }
  return {
    dryRun: false, version: stored.version, bound: applied.bound.length, removedConnections: applied.removedConnections,
    next: 'Bound buttons now carry the Requested and Rendered lights. Run validate_deck, then export_deck_config once every row is settled.',
  }
}

/* ------------------------------------------------ T3: the Singular extract --- */

async function importExtractOperation(data: Obj, actor: string, deps: DeckConversionDeps) {
  // Credentials first, before anything else is read, and never echoed: the extract was pulled through
  // Singular control links that carry a token.
  const hit = findCredential(data, 'input')
  if (hit) refuse('credential_in_extract', `Nothing was imported: the extract carries something that looks like a credential (at ${hit}). Remove every Singular control link, token, key and password from it, then import it again.`)
  allowedKeys(data, ['extract', 'importId', 'dryRun', 'expectedVersion'])
  // G1: the extract may come from a dropped file (importId) instead of inline, in either shape.
  if ((data.extract === undefined) === (data.importId === undefined)) refuse('invalid_input', 'Pass either extract (the JSON inline) or importId (from open_import_dropzone), not both and not neither. Nothing was imported.')
  let raw: unknown = data.extract, from: { importId: string; sha256: string | null; bytes: number | null } | undefined
  if (data.importId !== undefined) {
    const repository = deps.imports ?? refuse('imports_unavailable', 'Dropped files are not set up on this deployment. Pass the extract inline instead. Nothing was imported.', 503)
    try {
      const { readImportJson } = await import('../imports')
      const { record, value } = await readImportJson(repository, data.importId, 'singular-extract', deps.now())
      raw = value; from = { importId: record.id, sha256: record.sha256, bytes: record.totalBytes }
    } catch (e) {
      const known = e as { code?: unknown; status?: unknown }
      if (typeof known.code === 'string' && typeof known.status === 'number') refuse(known.code, (e as Error).message, known.status)
      throw e
    }
    const inFile = findCredential(raw, 'file')
    if (inFile) refuse('credential_in_extract', `Nothing was imported: the dropped extract carries something that looks like a credential (at ${inFile}). Remove every Singular control link, token, key and password from it, then drop it again.`)
  }
  const where = from ? 'file' : 'extract'
  const normalised = normaliseSingularExtract(raw)
  if (!normalised.ok) refuse('invalid_extract', `Nothing was imported: the extract is in neither expected shape. In the flat shape ({subcompositions:[{id, name, parentApp, layer, fields}]}) the first problem is at ${[where, ...normalised.issue.path.map(String)].join('.')}: ${normalised.issue.message}.`)
  const parsed = SINGULAR_EXTRACT.safeParse((normalised as { extract: unknown }).extract)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    refuse('invalid_extract', `Nothing was imported: the extract is not in the expected shape ({apps:[{label, subcompositions:[{id, name, layer, fields}]}]}); the first problem is at ${[where, ...issue.path.map(String)].join('.')}: ${issue.message}.`)
  }
  const extract = parsed.data!
  const shape = (normalised as { shape: 'nested' | 'flat' }).shape
  const labels = extract.apps.map((a) => a.label)
  const repeated = labels.filter((l, i) => labels.indexOf(l) !== i)
  if (repeated.length) refuse('invalid_extract', `Nothing was imported: the app ${repeated[0]} appears twice in the extract. Send each app once.`)
  const dryRun = data.dryRun !== false
  const now = deps.now()
  const incoming: SingularReferenceApp[] = extract.apps.map((a) => ({ label: a.label, name: a.name ?? null, importedAt: now, importedBy: actor, compositions: referenceRecords(a) }))
  if (deps.assetExists) {
    for (const a of incoming) for (const c of a.compositions) {
      if (c.imageAssetId && !(await deps.assetExists(c.imageAssetId))) refuse('unknown_asset', `Nothing was imported: ${a.label} "${c.name}" names picture ${c.imageAssetId}, which is not in this workspace's artwork library. Upload it with upload_asset first, or leave imageAssetId out.`, 404)
    }
  }
  let existing
  try { existing = deps.references ? await deps.references.get(deps.workspace) : null } catch (e) {
    if (isMissingTable(e)) refuse('reference_store_missing', REFERENCE_STORE_MISSING, 503)
    throw e
  }
  const summary = incoming.map((a) => {
    const layers: Record<string, number> = {}
    for (const c of a.compositions) layers[c.layer ?? 'none'] = (layers[c.layer ?? 'none'] ?? 0) + 1
    const names = a.compositions.map((c) => c.name.toLowerCase())
    return {
      app: a.label, ...(a.name ? { name: a.name } : {}), compositions: a.compositions.length,
      withText: a.compositions.filter((c) => c.text).length, withHebrew: a.compositions.filter((c) => /[֐-׿יִ-ﭏ]/.test(c.text)).length,
      withPicture: a.compositions.filter((c) => c.imageAssetId).length, layers,
      repeatedNames: [...new Set(names.filter((n, i) => names.indexOf(n) !== i))].length,
      replaces: !!existing?.document.apps.some((x) => x.label === a.label),
    }
  })
  const kept = (existing?.document.apps ?? []).filter((a) => !labels.includes(a.label)).map((a) => a.label)
  const who = workspaceName(deps.workspace)
  if (dryRun) {
    return {
      dryRun: true, apps: summary, total: summary.reduce((n, a) => n + a.compositions, 0), shape, ...(from ? { from } : {}), keptApps: kept, stored: existing ? { version: existing.version, apps: existing.document.apps.map((a) => a.label) } : null,
      next: existing
        ? `Nothing was stored. To store these apps (replacing any of the same label; other apps are kept), call again with dryRun:false and expectedVersion:${existing.version}. Then run convert_singular_deck.`
        : `Nothing was stored. To store this as the ${who} Singular reference material, call again with dryRun:false. Then run convert_singular_deck.`,
    }
  }
  const repo = deps.references ?? refuse('reference_store_missing', REFERENCE_STORE_MISSING, 503)
  if (existing && typeof data.expectedVersion !== 'number') refuse('version_required', `${who} Singular reference material is already stored (version ${existing.version}). Pass expectedVersion:${existing.version} to add or replace apps.`, 409)
  if (existing && data.expectedVersion !== existing.version) refuse('version_conflict', `The ${who} Singular reference material changed in another session (it is now version ${existing.version}). Run the dry run again and retry with the new version.`, 409)
  const document = { apps: [...(existing?.document.apps ?? []).filter((a) => !labels.includes(a.label)), ...incoming].sort((a, b) => a.label.localeCompare(b.label)) }
  let stored
  try { stored = await repo.put(deps.workspace, document, existing ? existing.version : null, actor, now) } catch (e) {
    if (isMissingTable(e)) refuse('reference_store_missing', REFERENCE_STORE_MISSING, 503)
    if (e instanceof SingularReferenceConflictError) refuse(e.code, e.message, e.status)
    throw e
  }
  return {
    dryRun: false, apps: summary, total: summary.reduce((n, a) => n + a.compositions, 0), shape, ...(from ? { from } : {}), keptApps: kept, stored: { version: stored.version, apps: stored.document.apps.map((a) => a.label) },
    next: 'Run convert_singular_deck: each row now shows what its button showed on Singular, and matching compares that text as well as the name.',
  }
}

/** The MCP operations seed_deck_from_export, convert_singular_deck and import_singular_extract (lib/mcp/deck.ts registers them). */
export async function deckConversionOperation(operation: string, input: unknown, actor: string, deps?: DeckConversionDeps): Promise<unknown> {
  const data = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Obj
  const d = deps ?? await defaultDeps()
  if (operation === 'seed_deck_from_export') return seedOperation(data, actor, d)
  if (operation === 'convert_singular_deck') return convertOperation(data, actor, d)
  if (operation === 'import_singular_extract') return importExtractOperation(data, actor, d)
  return refuse('unknown_operation', `Unknown deck operation: ${operation}`, 404)
}
