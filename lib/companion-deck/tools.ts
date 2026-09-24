// C3 (R-C3, R-C4 full scope) - the Companion deck tools. Every change is made on a copy of the stored
// deck, validated (validate.ts, with the live catalog's published/retired lookups) and saved only when it
// introduces no error-severity finding; the write names the deck version it read. Decks are complete,
// stable libraries (STATE decision 8): there is no weekly page here. sync_deck_with_catalog keeps the
// deck in step with the catalog by the deck's own grammar, and check_service_on_deck says whether a
// prepared service's graphics are all placed.
//
// The grammar (Michael's H1-H4, PRESET-DESIGN.md): a column is a slot; a sequence runs down its column
// (lead at the top) and continues into the next column; alternates of a slot share its column. A new
// cue's standing page is the page whose keys already hold its slot (matched by name), narrowed by the
// service its name or the prepared service names (Friday, Saturday, Holy Days...). When that leaves more
// than one page, or none, the cue is reported, never placed silently.
//
// Nothing here puts anything on screen or reaches the booth; a deck reaches Companion only through the
// exported file, imported by a person.
import {randomUUID} from 'node:crypto'
import definitions from '../../companion/definitions.json'
import {
  chainNeighbours, companionLabel, wrapLabel,
  type ButtonSpec, type CameraGesture, type CameraMove, type CompanionDeck, type CueRole, type DeckButton, type DeckPage, type DeckWorkspace,
  type FixedRole, type PageTemplate,
} from './model.ts'
import {DeckConflictError, MemoryCompanionDeckRepository, type CompanionDeckRepository, type StoredDeck} from './repository.ts'
import {PgCompanionDeckRepository} from './postgres-repository.ts'
import {isRetiredDraft, type Draft} from '../authoring-model.ts'
import {EXPORT_LINK_MS, EXPORT_ROUTE, exportFileName, exportSigningKey, fullExport, signExport} from './export.ts'
import {buttonText, validateDeck, type Finding, type ModuleDefinitions, type ValidationResult} from './validate.ts'
import {deckToolSchemas, isDeckTool, type DeckToolName} from './tool-schemas.ts'
import type {z} from 'zod/v4'

export {isDeckTool}

/* ------------------------------------------------------------------ context --- */

/** One catalog graphic as the deck tools see it. */
export type DeckCatalogCue = {
  id: string; name: string; title?: string
  /** In the live catalog (baseline or published). */
  published: boolean
  retired: boolean
  /** The active published revision, when known. */
  revision: number | null
  /** Last change (publish or edit), for "since the deck was last synced". */
  updatedAt?: number
  /** A multipart set: its id, this part's 1-based index and the part count. */
  set?: {id: string; index: number; count: number}
}
/** What a prepared service needs on the deck. */
export type DeckServiceView = {id: string; name: string; service: string; needed: {cueId: string; rowLabel: string}[]}
export type DeckSeed = () => Promise<CompanionDeck>

export type DeckToolContext = {
  /** Which deck this deployment owns. Default: from the workspace id (crc, or TBI's). */
  workspace?: DeckWorkspace | null
  repository?: CompanionDeckRepository
  catalog?: () => Promise<DeckCatalogCue[]>
  service?: (serviceId: string) => Promise<DeckServiceView>
  /** First-read seeds per workspace. C4 adds TBI's. */
  seeds?: Partial<Record<DeckWorkspace, DeckSeed | null>>
  module?: ModuleDefinitions
  now?: () => number
  id?: () => string
  signingKey?: Buffer | null
  origin?: string
}

export class DeckToolError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message) }
}
const refuse = (message: string, code = 'invalid_input', status = 400) => new DeckToolError(code, message, status)

const WORKSPACE_NAMES: Record<DeckWorkspace, string> = {crc: 'CRC', tbi: 'TBI'}
/** The deck workspace for a deployment's workspace id. */
export function deckWorkspaceFor(workspaceId: string): DeckWorkspace | null {
  const id = workspaceId.trim().toLowerCase()
  return id === 'crc' ? 'crc' : id === 'temple-bnai-israel-kalamazoo' || id === 'tbi' ? 'tbi' : null
}

/** CRC's released deck, with its sync marker at the catalog snapshot it was built from. */
async function crcSeed(): Promise<CompanionDeck> {
  const [{seedCrcDeck}, manifest, data] = await Promise.all([
    import('./seed.ts'),
    import('../../docs/planning/2026-09-23-overlay-consistency/companion/CUE-MANIFEST.json'),
    import('./crc-seed-data.json'),
  ])
  const m = (manifest.default ?? manifest) as unknown as Parameters<typeof seedCrcDeck>[0]
  const deck = seedCrcDeck(m, (data.default ?? data) as unknown as Parameters<typeof seedCrcDeck>[1])
  const at = Date.parse(m.generatedAt ?? '')
  return Number.isFinite(at) ? {...deck, synced: {at}} : deck
}
// TBI's seed comes from Simone's export (C4, seed_deck_from_export); until then TBI has none.
export const DEFAULT_SEEDS: Record<DeckWorkspace, DeckSeed | null> = {crc: crcSeed, tbi: null}

const rehearsalRepository = new MemoryCompanionDeckRepository()
export function defaultDeckRepository(): CompanionDeckRepository {
  if (process.env.CRC_AUTHORING_REHEARSAL === '1') return rehearsalRepository
  return new PgCompanionDeckRepository()
}

/** The live catalog: every published or baseline cue, with set, revision and retirement from the drafts. */
async function defaultCatalog(): Promise<DeckCatalogCue[]> {
  const [{authoringCatalog}, {authoringRepository}] = await Promise.all([import('../server'), import('../authoring')])
  const [catalog, drafts] = await Promise.all([authoringCatalog(), authoringRepository().listDrafts()])
  return deckCatalogCues(catalog.cues, drafts)
}

/** The live catalog's cues joined to their drafts: published, retired (isRetiredDraft), revision and set. */
export function deckCatalogCues(cues: readonly {id: string; name: string; texts?: {title?: string}}[], drafts: readonly Draft[]): DeckCatalogCue[] {
  const byId = new Map(drafts.map((d) => [d.id, d]))
  const out = new Map<string, DeckCatalogCue>()
  for (const cue of cues) {
    const d = byId.get(cue.id)
    out.set(cue.id, {
      id: cue.id, name: cue.name, title: d?.title ?? cue.texts?.title, published: !d?.archivedAt, revision: d?.activeRevision ?? null,
      retired: Boolean(d && isRetiredDraft(d)), updatedAt: d?.updatedAt,
      ...(d?.draftSetId && d.setIndex && d.setCount ? {set: {id: d.draftSetId, index: d.setIndex, count: d.setCount}} : {}),
    })
  }
  // A draft retired by A3 (isRetiredDraft) has left the live catalog; it is still known here, as retired.
  for (const d of drafts) {
    if (out.has(d.id) || !isRetiredDraft(d)) continue
    out.set(d.id, {id: d.id, name: d.name, title: d.title, published: false, retired: true, revision: d.activeRevision ?? null, updatedAt: d.updatedAt})
  }
  return [...out.values()]
}

async function defaultService(serviceId: string): Promise<DeckServiceView> {
  const {ServicesManager} = await import('../service-collections')
  const service = await new ServicesManager().requireService(serviceId)
  return serviceView(service)
}
/** Every graphic a prepared service needs: each entry's graphics, and each covered row's graphic. */
export function serviceView(service: {id: string; name: string; service: string; entries: {id: string; label: string; cueIds: string[]}[]; coverage: {id: string; label: string; status: string; cueId?: string}[]; rows?: {label: string; entryId?: string | null; coverageId?: string | null}[]}): DeckServiceView {
  const needed: {cueId: string; rowLabel: string}[] = [], seen = new Set<string>()
  const add = (cueId: string, rowLabel: string) => { if (!seen.has(cueId)) { seen.add(cueId); needed.push({cueId, rowLabel}) } }
  const entries = new Map(service.entries.map((e) => [e.id, e])), coverage = new Map(service.coverage.map((c) => [c.id, c]))
  type Row = {label: string; entryId?: string | null; coverageId?: string | null}
  const rows: Row[] = service.rows?.length ? service.rows : [...service.entries.map((e) => ({label: e.label, entryId: e.id})), ...service.coverage.map((c) => ({label: c.label, coverageId: c.id}))]
  for (const row of rows) {
    const entry = row.entryId ? entries.get(row.entryId) : undefined, item = row.coverageId ? coverage.get(row.coverageId) : undefined
    for (const id of entry?.cueIds ?? []) add(id, row.label)
    if (item?.status === 'covered' && item.cueId) add(item.cueId, row.label)
  }
  return {id: service.id, name: service.name, service: service.service, needed}
}

type Resolved = Required<Omit<DeckToolContext, 'workspace' | 'signingKey' | 'origin'>> & {workspace: DeckWorkspace | null; signingKey: Buffer | null; origin: string | null}
async function resolve(ctx: DeckToolContext): Promise<Resolved> {
  let workspace = ctx.workspace
  if (workspace === undefined) { const {getPublicWorkspace} = await import('../workspace'); workspace = deckWorkspaceFor(getPublicWorkspace().id) }
  let origin = ctx.origin ?? null
  if (origin == null) { try { const {canonicalOrigin} = await import('../oauth-core'); origin = canonicalOrigin() } catch { origin = null } }
  return {
    workspace, origin,
    repository: ctx.repository ?? defaultDeckRepository(), catalog: ctx.catalog ?? defaultCatalog, service: ctx.service ?? defaultService,
    seeds: {...DEFAULT_SEEDS, ...ctx.seeds}, module: ctx.module ?? (definitions as unknown as ModuleDefinitions),
    now: ctx.now ?? Date.now, id: ctx.id ?? randomUUID, signingKey: ctx.signingKey === undefined ? exportSigningKey() : ctx.signingKey,
  }
}

/* -------------------------------------------------------------------- store --- */

const storeUnavailable = (error: unknown) => {
  if ((error as {code?: string})?.code === '42P01') return refuse('The Companion deck store is not set up on this deployment yet (db/companion-decks.sql has not been applied). Nothing was changed.', 'deck_store_missing', 503)
  return error
}

/** The workspace's stored deck, seeded from its seed on the first read. */
export async function loadDeck(ctx: DeckToolContext = {}): Promise<StoredDeck> { return loadStored(await resolve(ctx)) }
async function loadStored(r: Resolved): Promise<StoredDeck> {
  if (!r.workspace) throw refuse('This deployment is not one of the congregations with a Companion deck (CRC or TBI).', 'no_deck', 404)
  const name = WORKSPACE_NAMES[r.workspace]
  try {
    const row = await r.repository.get(r.workspace)
    if (row) return row
  } catch (error) { throw storeUnavailable(error) }
  const seed = r.seeds[r.workspace]
  if (!seed) throw refuse(`The ${name} deck hasn't been seeded yet. It starts from the booth's own Companion export (seed_deck_from_export); until then there is no ${name} deck to read or change.`, 'deck_not_seeded', 404)
  try { return await r.repository.create(r.workspace, await seed(), 'seed', r.now()) }
  catch (error) {
    if (error instanceof DeckConflictError) { const row = await r.repository.get(r.workspace); if (row) return row }
    throw storeUnavailable(error)
  }
}

/* ------------------------------------------------------------------ helpers --- */

type Cat = Map<string, DeckCatalogCue>
const cellName = (page: DeckPage, row: number, col: number) => `page ${page.number} "${page.name}", row ${row} column ${col}`
const oneLine = (s: string) => s.replace(/\n/g, ' ')

function findPage(deck: CompanionDeck, n: number): DeckPage {
  const page = deck.pages.find((p) => p.number === n)
  if (!page) throw refuse(`The deck has no page ${n}. get_deck lists its pages.`, 'unknown_page', 404)
  return page
}
const buttonAt = (page: DeckPage, row: number, col: number) => page.buttons.find((b) => b.row === row && b.col === col)
function requireButton(page: DeckPage, row: number, col: number): DeckButton {
  const b = buttonAt(page, row, col)
  if (!b) throw refuse(`${cap(cellName(page, row, col))} is empty. get_deck_page shows what is where.`, 'empty_cell', 404)
  return b
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
function templateOf(deck: CompanionDeck, page: DeckPage): PageTemplate | undefined { return deck.templates[page.template] }
const fixedAt = (t: PageTemplate | undefined, row: number, col: number) => t?.fixed.find((f) => f.row === row && f.col === col)
function inGrid(deck: CompanionDeck, row: number, col: number) {
  if (row >= deck.grid.rows || col >= deck.grid.columns) throw refuse(`Row ${row} column ${col} is outside the deck's ${deck.grid.rows}×${deck.grid.columns} grid (rows 0-${deck.grid.rows - 1}, columns 0-${deck.grid.columns - 1}).`)
}
function requireFree(deck: CompanionDeck, page: DeckPage, row: number, col: number) {
  inGrid(deck, row, col)
  const b = buttonAt(page, row, col)
  if (b) throw refuse(`${cap(cellName(page, row, col))} already holds "${oneLine(buttonText(b.spec, deck))}". Move or remove it first, or pick an empty cell.`, 'cell_taken', 409)
}
/** A button's entity ids: fresh for every button placed by a tool, so no two buttons ever share one. */
const freshIds = (r: Resolved) => ({ctx: `deck/${r.id()}`, base: 0})
const stamp = (cue: DeckCatalogCue | undefined) => cue ? {name: cue.name, revision: cue.revision} : undefined

/** A key label from a catalog name: "X — 1 of 3" becomes "X 1/3"; a service word the page already says is dropped. */
export function labelFor(name: string, strip: readonly string[] = []): string {
  let s = name.replace(/\s*[—–-]\s*(\d+)\s+of\s+(\d+)\s*$/i, ' $1/$2').replace(/\s+/g, ' ').trim()
  for (const w of [...strip].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i')
    if (re.test(s)) { s = s.replace(re, ''); break }
  }
  if (s.length > 40) { const cut = s.slice(0, 40); s = (cut.lastIndexOf(' ') > 20 ? cut.slice(0, cut.lastIndexOf(' ')) : cut).trim() }
  return s || name.slice(0, 40)
}

/** Names that differ only in quote marks, dashes or spacing are the same name. */
const sameName = (a: string, b: string) => {
  const n = (s: string) => s.normalize('NFKC').replace(/[’‘ʼ`]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
  return n(a) === n(b)
}

/* ---------------------------------------------------------------- validation --- */

function validation(r: Resolved, deck: CompanionDeck, cat: Cat): ValidationResult {
  return validateDeck(deck, {
    module: r.module,
    cues: {isPublished: (id) => cat.get(id)?.published === true, isRetired: (id) => cat.get(id)?.retired === true, name: (id) => cat.get(id)?.name},
  })
}
/** Error findings the change adds: per code, any beyond the count before (a moved finding is not new). */
function introducedErrors(before: Finding[], after: Finding[]): Finding[] {
  const errs = (fs: Finding[]) => fs.filter((f) => f.severity === 'error')
  const count = (fs: Finding[]) => fs.reduce((m, f) => m.set(f.code, (m.get(f.code) ?? 0) + 1), new Map<string, number>())
  const b = count(errs(before)), a = count(errs(after)), old = new Set(errs(before).map((f) => f.message))
  const out: Finding[] = []
  for (const [code, n] of a) {
    const extra = n - (b.get(code) ?? 0)
    if (extra <= 0) continue
    const ofCode = errs(after).filter((f) => f.code === code)
    const fresh = ofCode.filter((f) => !old.has(f.message))
    out.push(...(fresh.length ? fresh : ofCode).slice(0, extra))
  }
  return out
}
const brief = (f: Finding) => ({page: f.page, row: f.row, column: f.column, code: f.code, message: f.message})

type Change = {change: string; [key: string]: unknown}
/** Apply `mutate` to a copy, validate, and save only when nothing new is broken. */
async function commit(r: Resolved, actor: string, expectedVersion: number, mutate: (deck: CompanionDeck, cat: Cat, stored: StoredDeck) => Change | Promise<Change>) {
  const stored = await loadStored(r)
  if (stored.version !== expectedVersion) throw refuse(`The ${WORKSPACE_NAMES[stored.workspace]} deck is at version ${stored.version}, not ${expectedVersion}; it changed since you read it. Nothing was changed. Call get_deck for the current version and try again.`, 'version_conflict', 409)
  const cat = await catalogMap(r)
  const deck = structuredClone(stored.deck)
  const result = await mutate(deck, cat, stored)
  if (JSON.stringify(deck) === JSON.stringify(stored.deck)) return {deckVersion: stored.version, changed: false, ...result}
  const before = validation(r, stored.deck, cat), after = validation(r, deck, cat)
  const introduced = introducedErrors(before.findings, after.findings)
  if (introduced.length) {
    const shown = introduced.slice(0, 5).map((f) => f.message).join(' ')
    throw refuse(`That change would break the deck, so nothing was saved. ${shown}${introduced.length > 5 ? ` (and ${introduced.length - 5} more)` : ''}`, 'deck_invalid', 422)
  }
  let saved: StoredDeck
  try { saved = await r.repository.replace(stored.workspace, deck, stored.version, actor, r.now()) }
  catch (error) {
    if (error instanceof DeckConflictError) throw refuse(`${error.message} Nothing was changed.`, 'version_conflict', 409)
    throw storeUnavailable(error)
  }
  const errors = after.findings.filter((f) => f.severity === 'error').length
  return {deckVersion: saved.version, changed: true, ...result, validation: {ok: errors === 0, errors, warnings: after.findings.filter((f) => f.severity === 'warning').length}}
}
async function catalogMap(r: Resolved): Promise<Cat> { return new Map((await r.catalog()).map((c) => [c.id, c])) }

/* ---------------------------------------------------------- template buttons --- */

/** The key a template's fixed cell holds on page `n` (CRC's templates; the same specs the seed builds). */
function templateSpec(deck: CompanionDeck, n: number, role: FixedRole): ButtonSpec | null {
  const P = deck.palette
  const name = (to: number) => deck.pages.find((p) => p.number === to)?.name ?? `Page ${to}`
  switch (role) {
    case 'animate-out': return {kind: 'module', text: 'Animate\nout', bg: P.black, action: 'animate_clear'}
    case 'clear-now': return {kind: 'module', text: 'Clear\nnow', bg: P.darkRed, action: 'clear_now'}
    case 'logo-toggle': return {kind: 'module', text: 'Logo\non/off', bg: P.charcoal, action: 'logo_toggle', logoFeedback: true}
    case 'prev': case 'next': {
      const nb = chainNeighbours(deck.chains, n)
      if (!nb) return null
      const to = role === 'prev' ? nb.prev : nb.next
      const title = to === 1 ? 'Home' : name(to)
      return {kind: 'jump', text: role === 'prev' ? `◂ Prev\n${title}` : `Next ▸\n${title}`, page: to}
    }
    case 'home': return {kind: 'jump', text: 'Home\n$(this:page_name)', page: 1}
    case 'bimah-mute': return {kind: 'fragment', fragment: 'bimah-mute', text: 'Bimah\nMute', bg: P.purple}
    case 'camera-center': return {kind: 'camera', text: 'Center\ncam 1', input: 'center cam 1', tally: 1}
    case 'camera-left': return {kind: 'camera', text: 'Left\ncam 2', input: 'left cam 2', tally: 2}
    case 'camera-right': return {kind: 'camera', text: 'Right\ncam 3', input: 'right cam 3', tally: 3}
    case 'merge': return {kind: 'merge'}
    default: throw refuse(`The "${role}" key belongs to a device page carried from the booth's export; such pages cannot be made here.`)
  }
}
/** Does an existing key already do what the template's fixed role asks? */
function servesRole(spec: ButtonSpec, role: FixedRole): boolean {
  switch (role) {
    case 'animate-out': return spec.kind === 'module' && spec.action === 'animate_clear'
    case 'clear-now': return spec.kind === 'module' && spec.action === 'clear_now'
    case 'logo-toggle': return spec.kind === 'module' && spec.action === 'logo_toggle'
    case 'prev': case 'next': case 'home': case 'ring-prev': case 'ring-home': case 'ring-next': return spec.kind === 'jump' || spec.kind === 'fragment'
    case 'bimah-mute': return spec.kind === 'fragment' || spec.kind === 'actions'
    case 'camera-center': case 'camera-left': case 'camera-right': return spec.kind === 'camera'
    case 'merge': return spec.kind === 'merge'
  }
}

/** Prev/Next keys follow the chains: labels name their targets, pages outside every chain have none. */
export function refreshNav(deck: CompanionDeck, ids: () => DeckButton['ids']) {
  for (const page of deck.pages) {
    const t = templateOf(deck, page)
    if (!t?.chainNav) continue
    for (const f of t.fixed) {
      if (f.role !== 'prev' && f.role !== 'next') continue
      const spec = templateSpec(deck, page.number, f.role)
      const b = buttonAt(page, f.row, f.col)
      if (!spec) { if (b?.spec.kind === 'jump') page.buttons.splice(page.buttons.indexOf(b), 1); continue }
      if (!b) page.buttons.push({row: f.row, col: f.col, spec, ids: ids()})
      else if (b.spec.kind === 'jump' && (b.spec.text !== (spec as {text: string}).text || b.spec.page !== (spec as {page: number}).page)) b.spec = spec
    }
  }
}

/* -------------------------------------------------------------------- grammar --- */

const STOP = new Set(['friday', 'night', 'saturday', 'daytime', 'morning', 'evening', 'erev', 'festival', 'holiday', 'the', 'an', 'of', 'with', 'and', 'for', 'in', 'to',
  'supplement', 'shirei', 'complete', 'short', 'long', 'crc', 'version', 'part', 'pt', 'plain', 'corner', 'opening', 'only', 'vv', 'trans', 'tt'])
/** The words that name a cue's slot: no parentheses, part numbers, service words or filler. */
export function slotTokens(name: string): Set<string> {
  const s = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`ʼ]/g, '')
    .replace(/\([^)]*\)/g, ' ').replace(/[—–-]\s*\d+\s+of\s+\d+/g, ' ').replace(/\b\d+\s*\/\s*\d+\b/g, ' ').replace(/\b\d+\b/g, ' ')
  return new Set(s.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)))
}
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x))
export const sameSlot = (a: Set<string>, b: Set<string>) => a.size > 0 && b.size > 0 && (subset(a, b) || subset(b, a))

/** Service words by the name of a chain's (or single page's) first page. */
const SERVICE_WORDS: {test: RegExp; words: string[]}[] = [
  {test: /^fri/i, words: ['friday night', 'friday', 'erev shabbat', 'kabbalat shabbat', 'shabbat evening']},
  {test: /^sat/i, words: ['saturday daytime', 'saturday', 'shabbat morning', 'shacharit']},
  {test: /^hhd|holy/i, words: ['high holy days', 'high holy', 'rosh hashanah', 'yom kippur', 'kol nidre', 'neilah', 'slichot', 'selichot', 'festival']},
  {test: /mitzvah/i, words: ["b'nai mitzvah", 'bnai mitzvah', 'bar mitzvah', 'bat mitzvah']},
  {test: /havdalah/i, words: ['havdalah']},
  {test: /memorial/i, words: ['yizkor', 'memorial', 'funeral', 'tisha']},
]
type Group = {name: string; pages: number[]; words: string[]}
function serviceGroups(deck: CompanionDeck): Group[] {
  const inChain = new Set(deck.chains.flat())
  const groups: Group[] = deck.chains.map((chain) => ({name: deck.pages.find((p) => p.number === chain[0])?.name ?? '', pages: [...chain], words: []}))
  for (const p of deck.pages) if (!inChain.has(p.number) && p.buttons.some((b) => b.spec.kind === 'cue')) groups.push({name: p.name, pages: [p.number], words: []})
  for (const g of groups) g.words = SERVICE_WORDS.find((s) => s.test.test(g.name))?.words ?? []
  return groups
}
const plain = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`ʼ]/g, "'")
function hinted(groups: Group[], texts: string[]): Group[] {
  const hay = plain(texts.join(' ')).replace(/'/g, '')
  return groups.filter((g) => g.words.some((w) => new RegExp(`\\b${plain(w).replace(/'/g, '')}\\b`).test(hay)))
}

/** Grammar columns: columns where the page's template fixes no cell. */
function slotColumns(deck: CompanionDeck, page: DeckPage) {
  const t = templateOf(deck, page)
  return Array.from({length: deck.grid.columns}, (_, c) => c).filter((c) => !t?.fixed.some((f) => f.col === c))
}
const isFree = (deck: CompanionDeck, page: DeckPage, row: number, col: number) => !buttonAt(page, row, col) && !fixedAt(templateOf(deck, page), row, col) && row < deck.grid.rows && col < deck.grid.columns
const topFree = (deck: CompanionDeck, page: DeckPage, col: number) => { for (let r = 0; r < deck.grid.rows; r++) if (isFree(deck, page, r, col)) return r; return -1 }

type Where = {page: DeckPage; row: number; col: number}
type Proposal = {page: number; row: number; column: number; label: string; role: CueRole; sequence?: {name: string; index: number; count: number}; why: string}
type Unplaced = {reason: string; candidatePages?: {page: number; name: string}[]}

function cueKeys(deck: CompanionDeck) {
  const out: (Where & {spec: Extract<ButtonSpec, {kind: 'cue'}>})[] = []
  for (const page of deck.pages) for (const b of page.buttons) if (b.spec.kind === 'cue') out.push({page, row: b.row, col: b.col, spec: b.spec})
  return out
}
const keyName = (spec: Extract<ButtonSpec, {kind: 'cue'}>, cat: Cat) => cat.get(spec.cueId)?.name ?? spec.catalog?.name ?? spec.label
const pageWords = (groups: Group[], page: number) => groups.find((g) => g.pages.includes(page))?.words ?? []

/**
 * Where the grammar puts `cue` on the working deck. Sequence parts continue from the part before them;
 * a cue that shares a slot joins that slot's column; the first part of a new sequence starts an empty
 * column. `hints` are extra texts that name the service (a prepared service's name).
 */
function propose(deck: CompanionDeck, cue: DeckCatalogCue, cat: Cat, hints: string[], override?: {page: number; row?: number; column?: number; label?: string}): Proposal | Unplaced {
  const groups = serviceGroups(deck)
  const keys = cueKeys(deck)
  const texts = [cue.name, cue.title ?? '', ...hints]
  const labelOn = (page: number) => override?.label ?? labelFor(cue.name, pageWords(groups, page))
  const cuePages = new Set(deck.pages.filter((p) => templateOf(deck, p) && p.buttons.some((b) => b.spec.kind === 'cue')).map((p) => p.number))

  if (override?.row !== undefined || override?.column !== undefined) {
    if (override.row === undefined || override.column === undefined) return {reason: 'A placement names a cell with both row and column, or neither.'}
    const page = deck.pages.find((p) => p.number === override.page)
    if (!page) return {reason: `The deck has no page ${override.page}.`}
    if (!isFree(deck, page, override.row, override.column)) return {reason: `${cap(cellName(page, override.row, override.column))} is not free.`}
  }
  const at = (page: DeckPage, row: number, col: number, role: CueRole, why: string, sequence?: Proposal['sequence']): Proposal => {
    if (override?.row !== undefined && override.column !== undefined) { row = override.row; col = override.column; why = 'at the cell you gave' }
    return {page: page.number, row, column: col, label: labelOn(page.number), role, ...(sequence ? {sequence} : {}), why}
  }

  // 1. A part of a set whose earlier part is placed: continue down its column, then into the next.
  if (cue.set && cue.set.count > 1) {
    const siblings = keys.filter((k) => cat.get(k.spec.cueId)?.set?.id === cue.set!.id)
    const before = siblings.filter((k) => (cat.get(k.spec.cueId)!.set!.index) < cue.set!.index).sort((a, b) => cat.get(b.spec.cueId)!.set!.index - cat.get(a.spec.cueId)!.set!.index)[0]
    if (before && (!override || override.page === before.page.number)) {
      const cols = slotColumns(deck, before.page).filter((c) => c >= before.col)
      for (const c of cols) for (let r = c === before.col ? before.row + 1 : 0; r < deck.grid.rows; r++) {
        if (isFree(deck, before.page, r, c)) {
          const sequence = {name: before.spec.sequence?.name ?? cue.title ?? cue.name, index: cue.set.index, count: cue.set.count}
          return at(before.page, r, c, before.spec.role === 'alternate' ? 'alternate' : 'sequence-part', c === before.col ? `continues its sequence down column ${c}` : `continues its sequence into column ${c}`, sequence)
        }
      }
      return {reason: `Its sequence runs out of room on page ${before.page.number} "${before.page.name}". Free a cell after part ${cat.get(before.spec.cueId)!.set!.index}, or pass a placement.`}
    }
    if (siblings.length && !override) return {reason: 'Later parts of its sequence are on the deck but no earlier one is. Place the earlier parts first, or pass a placement.'}
  }

  // 2. The slot: keys whose cue names the same thing.
  const tokens = slotTokens(cue.name)
  const matches = keys.filter((k) => cuePages.has(k.page.number) && k.spec.role !== 'utility' && sameSlot(tokens, slotTokens(keyName(k.spec, cat))))
  let pages = [...new Set(matches.map((k) => k.page.number))]
  const hintedPages = new Set(hinted(groups, texts).flatMap((g) => g.pages))
  if (override) pages = [override.page]
  else if (pages.length > 1 && hintedPages.size) { const narrowed = pages.filter((p) => hintedPages.has(p)); if (narrowed.length) pages = narrowed }
  if (!pages.length) {
    return {reason: 'No page holds its slot yet (no key names the same prayer or song), so the grammar has no standing page for it. Say where it goes with placements, or place it with place_button.'}
  }
  if (pages.length > 1) {
    return {reason: `It shares a slot with keys on ${pages.length} pages, and nothing in its name says which service it is for. Say which with placements (cueId and page).`, candidatePages: pages.sort((a, b) => a - b).map((n) => ({page: n, name: deck.pages.find((p) => p.number === n)!.name}))}
  }
  const page = deck.pages.find((p) => p.number === pages[0])
  if (!page) return {reason: `The deck has no page ${pages[0]}.`}
  const slotCols = [...new Set(matches.filter((k) => k.page === page).map((k) => k.col))].sort((a, b) => a - b)
  const cols = slotColumns(deck, page)
  const first = slotCols[0] ?? cols[0]
  const byDistance = cols.filter((c) => !slotCols.includes(c)).sort((a, b) => Math.abs(a - first) - Math.abs(b - first) || (a > first ? -1 : 1))

  // The first part of a new sequence starts an empty column (lead at the top).
  if (cue.set && cue.set.count > 1) {
    const sequence = {name: cue.title || cue.name.replace(/\s*[—–-]\s*\d+\s+of\s+\d+\s*$/, ''), index: cue.set.index, count: cue.set.count}
    const role: CueRole = slotCols.length ? 'alternate' : 'sequence-part'
    const empty = [...slotCols.filter((c) => cols.includes(c)), ...byDistance].filter((c) => !page.buttons.some((b) => b.col === c))
    if (empty.length) return at(page, topFree(deck, page, empty[0]), empty[0], role, `starts its sequence at the top of empty column ${empty[0]}`, sequence)
    return {reason: `Page ${page.number} "${page.name}" has no empty column to start its sequence in. Pass a placement.`}
  }
  // Alternates share the slot's column; then the nearest column with room.
  for (const c of [...slotCols.filter((c) => cols.includes(c)), ...byDistance]) {
    const r = topFree(deck, page, c)
    if (r >= 0) return at(page, r, c, slotCols.length ? 'alternate' : 'single', slotCols.includes(c) ? `shares column ${c} with its slot` : `column ${c} is the nearest with room`)
  }
  return {reason: `Page ${page.number} "${page.name}" has no free cell. Free one, or pass a placement on another page.`}
}

/* -------------------------------------------------------------------- views --- */

function cellView(deck: CompanionDeck, page: DeckPage, b: DeckButton, cat: Cat) {
  const t = templateOf(deck, page), f = fixedAt(t, b.row, b.col)
  const base = {row: b.row, column: b.col, kind: b.spec.kind, label: buttonText(b.spec, deck), ...(f ? {fixed: f.role} : {})}
  if (b.spec.kind === 'cue') {
    const c = cat.get(b.spec.cueId), g = b.spec.gesture
    return {...base, cueId: b.spec.cueId, cueName: c?.name ?? b.spec.catalog?.name ?? null, role: b.spec.role, ...(c ? {} : {inCatalog: false}), ...(c?.retired ? {retired: true} : {}),
      ...(b.spec.sequence ? {sequence: b.spec.sequence} : {}),
      ...(g ? {gesture: {in: g.in ? {camera: g.in.conn, preset: g.in.preset, input: g.in.input} : null, out: g.out ? {camera: g.out.conn, preset: g.out.preset, input: g.out.input} : null}} : {})}
  }
  if (b.spec.kind === 'jump') return {...base, jumpsTo: b.spec.page}
  if (b.spec.kind === 'module') return {...base, action: b.spec.action}
  if (b.spec.kind === 'fragment') return {...base, fragment: b.spec.fragment}
  return base
}
function freeCells(deck: CompanionDeck, page: DeckPage) {
  const out: string[] = []
  for (let r = 0; r < deck.grid.rows; r++) for (let c = 0; c < deck.grid.columns; c++) if (isFree(deck, page, r, c)) out.push(`r${r}c${c}`)
  return out
}
const loc = (page: DeckPage, row: number, col: number, label?: string) => ({page: page.number, pageName: page.name, row, column: col, ...(label ? {label} : {})})

/* ---------------------------------------------------------------- operations --- */

type Input<T extends DeckToolName> = z.infer<(typeof deckToolSchemas)[T]>

export async function deckToolOperation(operation: string, raw: unknown, actor: string, context: DeckToolContext = {}): Promise<unknown> {
  if (!isDeckTool(operation)) throw refuse(`Unknown deck operation: ${operation}`, 'unknown_operation', 404)
  const parsed = deckToolSchemas[operation].safeParse(raw)
  if (!parsed.success) throw refuse(`The ${operation} input is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}.`)
  const r = await resolve(context)
  const input = parsed.data as Record<string, unknown>
  const ids = () => freshIds(r)

  switch (operation) {
    case 'get_deck': {
      const stored = await loadStored(r), deck = stored.deck, cat = await catalogMap(r)
      const cues = cueKeys(deck)
      return {
        deckVersion: stored.version, workspace: deck.workspace, companion: deck.companion, grid: deck.grid,
        updatedAt: stored.updatedAt, updatedBy: stored.updatedBy, syncedAt: deck.synced?.at ?? null,
        counts: {pages: deck.pages.filter((p) => p.buttons.length).length, buttons: deck.pages.reduce((n, p) => n + p.buttons.length, 0), cueKeys: cues.length, cuesBound: new Set(cues.map((k) => k.spec.cueId)).size,
          cueKeysNotInCatalog: cues.filter((k) => !cat.has(k.spec.cueId)).length},
        pages: [...deck.pages].sort((a, b) => a.number - b.number).map((p) => ({page: p.number, name: p.name, template: p.template, buttons: p.buttons.length, cueKeys: p.buttons.filter((b) => b.spec.kind === 'cue').length, free: freeCells(deck, p).length})),
        chains: deck.chains,
        templates: Object.values(deck.templates).map((t) => ({id: t.id, description: t.description})),
        connections: deck.connections.map((c) => ({label: c.label, moduleId: c.moduleId, ...(c.role ? {role: c.role} : {})})),
        next: 'get_deck_page reads one page cell by cell; validate_deck checks the whole deck; export_deck_config makes the file to import.',
      }
    }
    case 'get_deck_page': {
      const {page: n} = input as Input<'get_deck_page'>
      const stored = await loadStored(r), deck = stored.deck, cat = await catalogMap(r), page = findPage(deck, n)
      const nb = templateOf(deck, page)?.chainNav ? chainNeighbours(deck.chains, n) : null
      return {deckVersion: stored.version, page: n, name: page.name, template: page.template, chain: nb,
        cells: [...page.buttons].sort((a, b) => a.row - b.row || a.col - b.col).map((b) => cellView(deck, page, b, cat)), free: freeCells(deck, page)}
    }
    case 'create_page': {
      const {expectedVersion, page: n, name, template, chainAfter, jumpFrom} = input as Input<'create_page'>
      return commit(r, actor, expectedVersion, (deck) => {
        if (deck.pages.some((p) => p.number === n)) throw refuse(`Page ${n} already exists ("${findPage(deck, n).name}"). Pick an unused page number.`, 'page_taken', 409)
        const t = deck.templates[template]
        if (!t) throw refuse(`The deck has no page template "${template}". It has ${Object.keys(deck.templates).join(', ')}.`)
        const page: DeckPage = {number: n, id: `page-${r.id()}`, name, template, buttons: []}
        deck.pages.push(page); deck.pages.sort((a, b) => a.number - b.number)
        if (chainAfter !== undefined) {
          const chain = deck.chains.find((c) => c.includes(chainAfter))
          if (!chain) throw refuse(`Page ${chainAfter} is in no service chain, so there is nothing to put page ${n} after.`)
          chain.splice(chain.indexOf(chainAfter) + 1, 0, n)
        }
        for (const f of t.fixed) {
          if (f.role === 'prev' || f.role === 'next') continue
          const spec = templateSpec(deck, n, f.role)
          if (spec) page.buttons.push({row: f.row, col: f.col, spec, ids: ids()})
        }
        refreshNav(deck, ids)
        if (jumpFrom) {
          const from = findPage(deck, jumpFrom.page)
          requireFree(deck, from, jumpFrom.row, jumpFrom.column)
          from.buttons.push({row: jumpFrom.row, col: jumpFrom.column, spec: {kind: 'jump', text: jumpFrom.text ?? `${wrapLabel(name, 12)} ▸`, page: n}, ids: ids()})
        }
        return {change: `Created page ${n} "${name}" on the "${template}" template${chainAfter !== undefined ? `, after page ${chainAfter} in its service chain` : ''}.`, page: n}
      })
    }
    case 'rename_page': {
      const {expectedVersion, page: n, name} = input as Input<'rename_page'>
      return commit(r, actor, expectedVersion, (deck) => {
        const page = findPage(deck, n), old = page.name
        page.name = name
        const forms = (s: string) => [[`${wrapLabel(s, 12)} ▸`, `${wrapLabel(name, 12)} ▸`], [`◂ ${wrapLabel(s, 12)}`, `◂ ${wrapLabel(name, 12)}`]]
        for (const p of deck.pages) for (const b of p.buttons) {
          if (b.spec.kind !== 'jump' || b.spec.page !== n) continue
          for (const [from, to] of forms(old)) if (b.spec.text === from) b.spec.text = to
        }
        refreshNav(deck, ids)
        return {change: `Renamed page ${n} from "${old}" to "${name}", with the keys that name it.`}
      })
    }
    case 'move_page': {
      const {expectedVersion, page: n, to} = input as Input<'move_page'>
      return commit(r, actor, expectedVersion, (deck) => {
        if (n === 1) throw refuse('Page 1 is Home, where every surface starts; it cannot move.')
        const page = findPage(deck, n)
        if (deck.pages.some((p) => p.number === to)) throw refuse(`Page ${to} already exists ("${findPage(deck, to).name}"). Move to an unused page number.`, 'page_taken', 409)
        page.number = to; deck.pages.sort((a, b) => a.number - b.number)
        for (const p of deck.pages) for (const b of p.buttons) if (b.spec.kind === 'jump' && b.spec.page === n) b.spec.page = to
        deck.chains = deck.chains.map((c) => c.map((x) => (x === n ? to : x)))
        refreshNav(deck, ids)
        return {change: `Moved page "${page.name}" from ${n} to ${to}; every key that jumped to it now jumps to ${to}.`}
      })
    }
    case 'delete_page': {
      const {expectedVersion, page: n} = input as Input<'delete_page'>
      return commit(r, actor, expectedVersion, (deck) => {
        if (n === 1) throw refuse('Page 1 is Home; it cannot be deleted.')
        const page = findPage(deck, n)
        // Prev/Next keys follow the chains and are rewritten below; any other key that jumps here blocks the delete.
        const chainKey = (p: DeckPage, b: DeckButton) => templateOf(deck, p)?.chainNav && ['prev', 'next'].includes(fixedAt(templateOf(deck, p), b.row, b.col)?.role ?? '')
        const jumps = deck.pages.filter((p) => p.number !== n).flatMap((p) => p.buttons.filter((b) => b.spec.kind === 'jump' && b.spec.page === n && !chainKey(p, b)).map((b) => ({p, b})))
        if (jumps.length) throw refuse(`${jumps.length} key${jumps.length === 1 ? '' : 's'} still jump to page ${n} (first: ${cellName(jumps[0].p, jumps[0].b.row, jumps[0].b.col)}). Remove or repoint ${jumps.length === 1 ? 'it' : 'them'} first. Nothing was changed.`, 'page_in_use', 409)
        deck.pages.splice(deck.pages.indexOf(page), 1)
        deck.chains = deck.chains.map((c) => c.filter((x) => x !== n)).filter((c) => c.length)
        refreshNav(deck, ids)
        return {change: `Deleted page ${n} "${page.name}" (${page.buttons.length} buttons).`}
      })
    }
    case 'place_button': {
      const {expectedVersion, page: n, row, column, button} = input as Input<'place_button'>
      return commit(r, actor, expectedVersion, (deck, cat) => {
        const page = findPage(deck, n)
        requireFree(deck, page, row, column)
        let spec: ButtonSpec
        switch (button.kind) {
          case 'cue': {
            const c = cat.get(button.cueId)
            if (!c) throw refuse(`There is no cue ${button.cueId} in the catalog. Publish it first, or check the id with list_catalog.`, 'unknown_cue', 404)
            spec = {kind: 'cue', cueId: c.id, label: button.label ?? labelFor(c.name, pageWords(serviceGroups(deck), n)), role: button.role ?? 'single', ...(c.set && c.set.count > 1 ? {sequence: {name: c.title ?? c.name, index: c.set.index, count: c.set.count}} : {}), catalog: stamp(c)}
            break
          }
          case 'jump': spec = {kind: 'jump', text: button.text, page: button.page}; break
          case 'module': spec = {kind: 'module', text: button.text, bg: button.bg ?? deck.palette.charcoal, action: button.action, ...(button.action.startsWith('logo') ? {logoFeedback: true} : {})}; break
          case 'camera': spec = {kind: 'camera', text: button.text, input: button.input, tally: button.tally}; break
          case 'merge': spec = {kind: 'merge'}; break
          case 'builtin': spec = {kind: 'builtin', control: button.control}; break
          case 'fragment': spec = {kind: 'fragment', fragment: button.fragment, ...(button.text ? {text: button.text} : {})}; break
          case 'copy': {
            const from = requireButton(findPage(deck, button.from.page), button.from.row, button.from.column)
            spec = structuredClone(from.spec)
            break
          }
        }
        if (spec.kind === 'fragment') spec = fragmentForPlacement(deck, spec, r)
        page.buttons.push({row, col: column, spec, ...(spec.kind === 'builtin' ? {} : {ids: ids()})})
        return {change: `Placed "${oneLine(buttonText(spec, deck))}" at ${cellName(page, row, column)}.`, cell: loc(page, row, column)}
      })
    }
    case 'move_button': {
      const {expectedVersion, page: n, row, column, to} = input as Input<'move_button'>
      return commit(r, actor, expectedVersion, (deck) => {
        const from = findPage(deck, n), b = requireButton(from, row, column), dest = findPage(deck, to.page)
        requireFree(deck, dest, to.row, to.column)
        from.buttons.splice(from.buttons.indexOf(b), 1)
        dest.buttons.push({...b, row: to.row, col: to.column})
        return {change: `Moved "${oneLine(buttonText(b.spec, deck))}" from ${cellName(from, row, column)} to ${cellName(dest, to.row, to.column)}.`, cell: loc(dest, to.row, to.column)}
      })
    }
    case 'remove_button': {
      const {expectedVersion, page: n, row, column} = input as Input<'remove_button'>
      return commit(r, actor, expectedVersion, (deck) => {
        const page = findPage(deck, n), b = requireButton(page, row, column)
        page.buttons.splice(page.buttons.indexOf(b), 1)
        return {change: `Removed "${oneLine(buttonText(b.spec, deck))}" from ${cellName(page, row, column)}.`}
      })
    }
    case 'bind_cue': {
      const {expectedVersion, page: n, row, column, cueId, label, role} = input as Input<'bind_cue'>
      return commit(r, actor, expectedVersion, (deck, cat) => {
        const page = findPage(deck, n), c = cat.get(cueId)
        if (!c) throw refuse(`There is no cue ${cueId} in the catalog. Publish it first, or check the id with list_catalog.`, 'unknown_cue', 404)
        const b = buttonAt(page, row, column)
        if (b && b.spec.kind !== 'cue') throw refuse(`${cap(cellName(page, row, column))} is a ${b.spec.kind} key ("${oneLine(buttonText(b.spec, deck))}"), not a cue key. Remove it first or pick another cell.`, 'not_a_cue_key', 409)
        if (!b) {
          requireFree(deck, page, row, column)
          page.buttons.push({row, col: column, spec: {kind: 'cue', cueId, label: label ?? labelFor(c.name, pageWords(serviceGroups(deck), n)), role: role ?? 'single', catalog: stamp(c)}, ids: ids()})
          return {change: `Placed a new key for "${c.name}" at ${cellName(page, row, column)}.`, cell: loc(page, row, column)}
        }
        const spec = b.spec as Extract<ButtonSpec, {kind: 'cue'}>, was = spec.cueId
        spec.label = label ?? (was === cueId ? spec.label : labelFor(c.name, pageWords(serviceGroups(deck), n)))
        spec.cueId = cueId; if (role) spec.role = role
        spec.catalog = stamp(c)
        return {change: was === cueId ? `Kept ${cellName(page, row, column)} on "${c.name}" and refreshed its label.` : `${cap(cellName(page, row, column))} now fires "${c.name}" (was ${cat.get(was)?.name ?? was}); its gesture and colour rule are kept.`, cell: loc(page, row, column, spec.label)}
      })
    }
    case 'attach_camera_gesture': {
      const {expectedVersion, page: n, row, column, gesture, from} = input as Input<'attach_camera_gesture'>
      return commit(r, actor, expectedVersion, (deck) => {
        const page = findPage(deck, n), b = requireButton(page, row, column)
        if (b.spec.kind !== 'cue') throw refuse(`${cap(cellName(page, row, column))} is not a cue key, so it cannot carry a camera gesture.`, 'not_a_cue_key', 409)
        const spec = b.spec
        if ((gesture === undefined) === (from === undefined)) throw refuse('Give either gesture (the camera move, or null to remove it) or from (a key whose gesture to copy), not both.')
        if (from) {
          const src = requireButton(findPage(deck, from.page), from.row, from.column)
          if (src.spec.kind !== 'cue' || !src.spec.gesture) throw refuse(`${cap(cellName(findPage(deck, from.page), from.row, from.column))} carries no camera gesture to copy.`)
          spec.gesture = structuredClone(src.spec.gesture)
          return {change: `Copied the camera gesture onto ${cellName(page, row, column)}.`}
        }
        if (gesture === null) { delete spec.gesture; return {change: `Removed the camera gesture from ${cellName(page, row, column)}; it is a one-step toggle again.`} }
        const t = templateOf(deck, page)
        if (!t?.gesture) throw refuse(`Page ${n} "${page.name}" uses the "${page.template}" template, which allows no camera gestures.`, 'gesture_not_allowed', 409)
        const mv = (m: {camera: string | null; preset: number | null; input: string}): CameraMove => ({conn: m.camera == null ? null : companionLabel(m.camera), preset: m.preset, input: m.input})
        const out = gesture!.out ?? 'return'
        const returnCamera = () => cueKeys(deck).map((k) => k.spec.gesture?.out).find((o) => o?.conn && o.preset === t.gesture!.returnPreset && o.input === t.gesture!.returnInput)?.conn ?? null
        const g: CameraGesture = {
          in: mv(gesture!.in),
          out: out === 'none' ? null : out === 'merge-only' ? {conn: null, preset: null, input: t.gesture.returnInput}
            : out === 'return' ? {conn: returnCamera(), preset: returnCamera() ? t.gesture.returnPreset : null, input: t.gesture.returnInput} : mv(out),
        }
        spec.gesture = g
        return {change: `${cap(cellName(page, row, column))} now moves ${g.in!.conn ?? 'the switcher'}${g.in!.preset != null ? ` to preset ${g.in!.preset}` : ''} and merges "${g.in!.input}" when it shows the cue${g.out ? `, and returns to "${g.out.input}" when it takes it out` : ''}.`}
      })
    }
    case 'apply_template': {
      const {expectedVersion, page: n, template, replace} = input as Input<'apply_template'>
      return commit(r, actor, expectedVersion, (deck) => {
        const page = findPage(deck, n)
        if (template) { if (!deck.templates[template]) throw refuse(`The deck has no page template "${template}". It has ${Object.keys(deck.templates).join(', ')}.`); page.template = template }
        const t = templateOf(deck, page)!
        const placed: string[] = []
        for (const f of t.fixed) {
          if (f.role === 'prev' || f.role === 'next') continue
          const b = buttonAt(page, f.row, f.col)
          if (b && servesRole(b.spec, f.role)) continue
          if (b && !replace) throw refuse(`${cap(cellName(page, f.row, f.col))} holds "${oneLine(buttonText(b.spec, deck))}", but the "${t.id}" template reserves it for the ${f.role} key. Move it first, or pass replace:true to overwrite it. Nothing was changed.`, 'cell_reserved', 409)
          const spec = templateSpec(deck, n, f.role)
          if (!spec) continue
          if (b) page.buttons.splice(page.buttons.indexOf(b), 1)
          page.buttons.push({row: f.row, col: f.col, spec, ids: ids()})
          placed.push(`${f.role} at row ${f.row} column ${f.col}`)
        }
        refreshNav(deck, ids)
        return {change: placed.length ? `Applied the "${t.id}" template to page ${n}: ${placed.join(', ')}.` : `Page ${n} already carries every key of the "${t.id}" template.`}
      })
    }
    case 'layout_column': {
      const {expectedVersion, page: n, column, order} = input as Input<'layout_column'>
      return commit(r, actor, expectedVersion, (deck) => {
        const page = findPage(deck, n)
        inGrid(deck, 0, column)
        const t = templateOf(deck, page)
        const cues = page.buttons.filter((b) => b.col === column && b.spec.kind === 'cue').sort((a, b) => a.row - b.row)
        if (!cues.length) throw refuse(`Column ${column} of page ${n} holds no cue keys.`)
        const rows = Array.from({length: deck.grid.rows}, (_, i) => i).filter((i) => !fixedAt(t, i, column) && !page.buttons.some((b) => b.col === column && b.row === i && b.spec.kind !== 'cue'))
        let sorted: DeckButton[]
        const spec = (b: DeckButton) => b.spec as Extract<ButtonSpec, {kind: 'cue'}>
        if (order) {
          if (order.length !== cues.length || new Set(order).size !== order.length || !cues.every((b) => order.includes(spec(b).cueId))) throw refuse(`order must list the ${cues.length} cue ids in column ${column} exactly once each: ${cues.map((b) => spec(b).cueId).join(', ')}.`)
          sorted = order.map((id) => cues.find((b) => spec(b).cueId === id)!)
        } else {
          // H3/H4: the lead and its continuations first (in part order), then alternates, then short selections.
          const rank = (b: DeckButton) => (spec(b).role === 'short-selection' ? 2 : spec(b).role === 'alternate' ? 1 : 0)
          const groupKey = (b: DeckButton) => spec(b).sequence?.name ?? `#${spec(b).cueId}`
          const groups: DeckButton[][] = []
          for (const b of cues) { const g = groups.find((x) => groupKey(x[0]) === groupKey(b)); if (g) g.push(b); else groups.push([b]) }
          groups.forEach((g) => g.sort((a, b) => (spec(a).sequence?.index ?? 0) - (spec(b).sequence?.index ?? 0)))
          sorted = groups.map((g, i) => ({g, i})).sort((a, b) => Math.min(...a.g.map(rank)) - Math.min(...b.g.map(rank)) || a.i - b.i).flatMap((x) => x.g)
        }
        const before = cues.map((b) => b.row)
        sorted.forEach((b, i) => { b.row = rows[i] })
        for (const b of sorted) if (spec(b).sequence && spec(b).role === 'single') spec(b).role = 'sequence-part'
        const moved = sorted.filter((b, i) => before[cues.indexOf(b)] !== rows[i]).length
        return {change: moved ? `Laid out column ${column} of page ${n}: ${sorted.map((b) => oneLine(spec(b).label)).join(' → ')}.` : `Column ${column} of page ${n} already follows the grammar.`}
      })
    }
    case 'sync_deck_with_catalog': return sync(r, input as Input<'sync_deck_with_catalog'>, actor)
    case 'check_service_on_deck': {
      const {serviceId} = input as Input<'check_service_on_deck'>
      const [stored, cat] = await Promise.all([loadStored(r), catalogMap(r)])
      let view: DeckServiceView
      try { view = await r.service(serviceId) } catch (error) { throw refuse((error as Error).message || `No prepared service has the id ${serviceId}.`, (error as {code?: string}).code ?? 'not_found', (error as {status?: number}).status ?? 404) }
      const deck = structuredClone(stored.deck)
      const keys = cueKeys(deck)
      const placed: unknown[] = [], missing: unknown[] = []
      for (const need of view.needed) {
        const at = keys.filter((k) => k.spec.cueId === need.cueId)
        const c = cat.get(need.cueId)
        if (at.length) { placed.push({cueId: need.cueId, name: c?.name ?? at[0].spec.label, row: need.rowLabel, on: at.map((k) => loc(k.page, k.row, k.col, k.spec.label))}); continue }
        if (!c || !c.published || c.retired) { missing.push({cueId: need.cueId, name: c?.name ?? null, row: need.rowLabel, wouldGo: null, reason: c?.retired ? 'It is retired; swap it for its replacement on the service.' : 'It is not published, so it cannot be placed. Publish it first.'}); continue }
        const p = propose(deck, c, cat, [view.service, view.name])
        if ('reason' in p) { missing.push({cueId: need.cueId, name: c.name, row: need.rowLabel, wouldGo: null, reason: p.reason, ...(p.candidatePages ? {candidatePages: p.candidatePages} : {})}); continue }
        const page = findPage(deck, p.page)
        page.buttons.push({row: p.row, col: p.column, spec: {kind: 'cue', cueId: c.id, label: p.label, role: p.role, ...(p.sequence ? {sequence: p.sequence} : {})}, ids: {ctx: 'check', base: 0}})
        missing.push({cueId: need.cueId, name: c.name, row: need.rowLabel, wouldGo: {...loc(page, p.row, p.column, p.label), why: p.why}})
      }
      const ready = missing.length === 0
      return {deckVersion: stored.version, serviceId: view.id, name: view.name, service: view.service, ready, needed: view.needed.length, placedCount: placed.length, missingCount: missing.length, placed, missing,
        next: ready ? 'Every graphic this service needs is on the deck. validate_deck, then export_deck_config for the next import.'
          : `sync_deck_with_catalog with cueIds of the missing graphics (and placements for any the grammar cannot place) and dryRun:false puts them on the deck.`}
    }
    case 'validate_deck': {
      const [stored, cat] = await Promise.all([loadStored(r), catalogMap(r)])
      const v = validation(r, stored.deck, cat)
      const errors = v.findings.filter((f) => f.severity === 'error'), warnings = v.findings.filter((f) => f.severity === 'warning')
      return {deckVersion: stored.version, ok: v.ok, errors: errors.map(brief), warnings: warnings.map(brief), info: v.findings.filter((f) => f.severity === 'info').map((f) => f.message), summary: v.summary,
        next: v.ok ? 'The deck passes. export_deck_config makes the file to import.' : 'Fix the errors (each names its page, row and column) before exporting.'}
    }
    case 'export_deck_config': {
      const {expectedVersion} = input as Input<'export_deck_config'>
      return exportLink(r, expectedVersion)
    }
  }
}

/** A device key placed by a tool: a fixed-id control already on the deck is copied as a template, so its ids are new. */
function fragmentForPlacement(deck: CompanionDeck, spec: Extract<ButtonSpec, {kind: 'fragment'}>, r: Resolved): Extract<ButtonSpec, {kind: 'fragment'}> {
  const f = deck.fragments[spec.fragment]
  if (!f) throw refuse(`The deck carries no device fragment "${spec.fragment}". get_deck_page shows each device key's fragment.`, 'unknown_fragment', 404)
  if (f.kind === 'entities') throw refuse(`"${spec.fragment}" is a set of actions, not a whole key; it cannot be placed as a button.`)
  if (f.kind === 'control-template') return spec
  const used = deck.pages.some((p) => p.buttons.some((b) => b.spec.kind === 'fragment' && b.spec.fragment === spec.fragment))
  if (!used) return spec
  const key = `${spec.fragment}~${r.id()}`
  deck.fragments[key] = {...structuredClone(f), kind: 'control-template'}
  return {...spec, fragment: key}
}

/* ------------------------------------------------------------------------ sync --- */

async function sync(r: Resolved, input: Input<'sync_deck_with_catalog'>, actor: string) {
  const dryRun = input.dryRun !== false
  if (!dryRun && input.expectedVersion === undefined) throw refuse('Pass expectedVersion (the deck version from get_deck) to apply a sync; a dry run needs none.')
  const plan = async (deck: CompanionDeck, cat: Cat) => {
    const placed: unknown[] = [], relabelled: unknown[] = [], revised: unknown[] = [], removed: unknown[] = [], flagged: unknown[] = [], unplaced: unknown[] = []
    const groups = serviceGroups(deck)
    // Revised, renamed, retired and unpublished cues on keys already on the deck.
    for (const k of cueKeys(deck)) {
      const c = cat.get(k.spec.cueId), here = loc(k.page, k.row, k.col, k.spec.label)
      if (c?.retired) {
        if (input.retired === 'flag') flagged.push({...here, cueId: k.spec.cueId, reason: `Its cue "${c.name}" is retired. Bind its replacement (bind_cue) or remove the key.`})
        else { k.page.buttons.splice(k.page.buttons.findIndex((b) => b.row === k.row && b.col === k.col), 1); removed.push({...here, cueId: k.spec.cueId, name: c.name, reason: 'its cue is retired'}) }
        continue
      }
      if (!c || !c.published) { flagged.push({...here, cueId: k.spec.cueId, reason: 'Its cue is no longer published. Bind a published cue (bind_cue) or remove the key.'}); continue }
      const was = k.spec.catalog
      if (!was) { k.spec.catalog = stamp(c); continue }
      if (!sameName(was.name, c.name)) {
        const words = pageWords(groups, k.page.number)
        const derived = [labelFor(was.name, words), labelFor(was.name), wrapLabel(was.name)].includes(k.spec.label)
        if (derived || input.relabelHandWritten) {
          const to = labelFor(c.name, words)
          relabelled.push({...here, cueId: c.id, from: k.spec.label, to, renamed: {from: was.name, to: c.name}})
          k.spec.label = to; k.spec.catalog = stamp(c)
        } else flagged.push({...here, cueId: c.id, reason: `Its cue was renamed from "${was.name}" to "${c.name}", and this label was written by hand, so it was kept. Relabel it with bind_cue, or sync with relabelHandWritten:true.`, proposedLabel: labelFor(c.name, words)})
      } else if (c.revision != null && was.revision !== c.revision) {
        revised.push({...here, cueId: c.id, name: c.name, revision: {from: was.revision, to: c.revision}})
        k.spec.catalog = stamp(c)
      }
    }
    // New cues: the ones asked for, or every one published or changed since the last sync that is not on the deck.
    const onDeck = new Set(cueKeys(deck).map((k) => k.spec.cueId))
    const since = deck.synced?.at ?? 0
    const overrides = new Map((input.placements ?? []).map((p) => [p.cueId, p]))
    const wanted = input.cueIds ?? [...new Set([...cat.values()].filter((c) => c.published && !c.retired && !onDeck.has(c.id) && (c.updatedAt ?? 0) > since).map((c) => c.id).concat([...overrides.keys()]))]
    const scope: DeckCatalogCue[] = []
    for (const id of wanted) {
      const c = cat.get(id)
      if (!c) { unplaced.push({cueId: id, name: null, reason: 'It is not in the catalog. Check the id with list_catalog.'}); continue }
      if (c.retired) { unplaced.push({cueId: id, name: c.name, reason: 'It is retired.'}); continue }
      if (!c.published) { unplaced.push({cueId: id, name: c.name, reason: 'It is not published. Publish it first.'}); continue }
      if (onDeck.has(id)) continue
      scope.push(c)
    }
    scope.sort((a, b) => (a.set?.id ?? a.name).localeCompare(b.set?.id ?? b.name) || (a.set?.index ?? 0) - (b.set?.index ?? 0))
    for (const c of scope) {
      const p = propose(deck, c, cat, [], overrides.get(c.id))
      if ('reason' in p) { unplaced.push({cueId: c.id, name: c.name, reason: p.reason, ...(p.candidatePages ? {candidatePages: p.candidatePages} : {})}); continue }
      const page = findPage(deck, p.page)
      page.buttons.push({row: p.row, col: p.column, spec: {kind: 'cue', cueId: c.id, label: p.label, role: p.role, ...(p.sequence ? {sequence: p.sequence} : {}), catalog: stamp(c)}, ids: freshIds(r)})
      placed.push({cueId: c.id, name: c.name, ...loc(page, p.row, p.column, p.label), role: p.role, why: p.why})
    }
    const changes = placed.length + relabelled.length + revised.length + removed.length
    if (changes || !deck.synced) deck.synced = {at: r.now()}
    const summary = `${placed.length} placed, ${relabelled.length} relabelled, ${removed.length} removed, ${flagged.length} flagged, ${unplaced.length} not placed.`
    return {placed, relabelled, revised, removed, flagged, unplaced, summary}
  }
  if (dryRun) {
    const [stored, cat] = await Promise.all([loadStored(r), catalogMap(r)])
    const deck = structuredClone(stored.deck)
    const out = await plan(deck, cat)
    const introduced = introducedErrors(validation(r, stored.deck, cat).findings, validation(r, deck, cat).findings)
    return {dryRun: true, deckVersion: stored.version, change: `Dry run, nothing saved: ${out.summary}`, ...out,
      ...(introduced.length ? {wouldBeRefused: introduced.slice(0, 5).map(brief)} : {}),
      next: `Run again with dryRun:false and expectedVersion:${stored.version} to apply${out.unplaced.length ? '; pass placements for the cues the grammar could not place' : ''}.`}
  }
  return commit(r, actor, input.expectedVersion!, async (deck, cat) => {
    const out = await plan(deck, cat)
    return {dryRun: false, change: `Synced the deck with the catalog: ${out.summary}`, ...out}
  })
}

/* ---------------------------------------------------------------------- export --- */

/** Validate the stored deck and, when it passes, a signed short-lived link to exactly these bytes. */
export async function prepareExport(ctx: DeckToolContext = {}, expectedVersion?: number) { return exportLink(await resolve(ctx), expectedVersion) }
async function exportLink(r: Resolved, expectedVersion?: number) {
  const [stored, cat] = await Promise.all([loadStored(r), catalogMap(r)])
  if (expectedVersion !== undefined && stored.version !== expectedVersion) throw refuse(`The deck is at version ${stored.version}, not ${expectedVersion}; it changed since you read it. Nothing was exported. Call get_deck and try again.`, 'version_conflict', 409)
  const v = validation(r, stored.deck, cat)
  const errors = v.findings.filter((f) => f.severity === 'error')
  if (errors.length) throw refuse(`The deck has ${errors.length} error${errors.length === 1 ? '' : 's'}, so it was not exported. ${errors.slice(0, 3).map((f) => f.message).join(' ')} Run validate_deck for the full list.`, 'deck_invalid', 422)
  if (!r.signingKey) throw refuse('Deck export links are not configured on this deployment (no signing key). Nothing was exported.', 'export_unconfigured', 503)
  const file = fullExport(stored.deck)
  const now = r.now(), exp = now + EXPORT_LINK_MS
  const token = signExport({w: stored.workspace, v: stored.version, scope: 'full', sha: file.sha256, exp}, r.signingKey)
  const path = `${EXPORT_ROUTE}?token=${encodeURIComponent(token)}`
  const labels = new Set(stored.deck.connections.map((c) => c.label))
  const connections = file.connections.map((c) => ({...c, exact: labels.has(c.label) && companionLabel(c.label) === c.label}))
  return {
    deckVersion: stored.version, scope: 'full', url: r.origin ? new URL(path, r.origin).toString() : path, expiresAt: exp,
    fileName: exportFileName(stored.workspace, stored.version, now), bytes: file.bytes.length, sha256: file.sha256,
    pages: Object.keys(file.exported.pages).length, buttons: stored.deck.pages.reduce((n, p) => n + p.buttons.length, 0), companion: stored.deck.companion,
    connections, warnings: v.findings.filter((f) => f.severity === 'warning').length,
    importNote: `A full import in Companion ${stored.deck.companion.release}: Import/Export, choose this file, and map each connection to the booth connection with exactly the same label (${connections.map((c) => c.label).join(', ')}). Companion binds an unmatched label to the first connection of that module, silently.`,
    next: 'The link works for 15 minutes; it is also on the Setup page for a signed-in member.',
  }
}

/** The bytes a link names, when the deck is still at that version and renders to those bytes. */
export async function exportForLink(ctx: DeckToolContext, claims: {w: DeckWorkspace; v: number; sha: string}) {
  const r = await resolve(ctx)
  if (r.workspace !== claims.w) throw refuse('This link is for another congregation\'s deck.', 'wrong_workspace', 404)
  const stored = await loadStored(r)
  if (stored.version !== claims.v) throw refuse(`This link is for deck version ${claims.v}, and the deck is now at version ${stored.version}. Ask for a new export link.`, 'stale_link', 410)
  const file = fullExport(stored.deck)
  if (file.sha256 !== claims.sha) throw refuse('The deck no longer renders to the file this link was made for. Ask for a new export link.', 'stale_link', 410)
  return {bytes: file.bytes, fileName: exportFileName(stored.workspace, stored.version, r.now()), sha256: file.sha256}
}

