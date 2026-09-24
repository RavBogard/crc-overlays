// Deck validator (R-C2). Checks a stored CompanionDeck, and the export renderDeck() makes from it, against
// the workspace's own rules: its page templates (fixed cells, Prev/Next chains, gesture shape, whether
// Companion's built-in nav buttons are allowed), the module's action and feedback definitions (from
// companion/definitions.json, generated at module build time), the deck's connection registry (every
// label reference must match exactly: Companion's import binds an unmatched label to the first
// connection of that module type, silently), and the catalog (every bound cue is published and not
// retired, through injected lookups). Pure: no filesystem, network or clock. The optional upgrade check
// runs Companion's own import upgrade when the caller supplies it for the deck's recorded build.
//
// Findings are `{severity, page, row, column, code, message}`. Row and column are zero-based, as in
// Companion's own "page/row/column" button locations. Messages are plain sentences for an operator.
import {
  CONNECTION_REF, INSTANCE_CONTROL, WORKSPACE_COMPANION, assertSanitized, chainNeighbours, companionLabel, unwrap,
  type ButtonSpec, type CompanionDeck, type DeckButton, type DeckPage, type DeckWorkspace, type FixedRole, type PageTemplate,
} from './model.ts'
import { renderButton, renderDeck, type CompanionExport } from './render.ts'

/* ------------------------------------------------------------------ types --- */

export type Severity = 'error' | 'warning' | 'info'

export type FindingCode =
  | 'credential-key' | 'credential-text' | 'companion-build'
  | 'connection-label-duplicate' | 'connection-label-invalid' | 'connection-label-unknown' | 'connection-role'
  | 'connection-not-at-booth' | 'singular-connection' | 'singular-action'
  | 'module-id' | 'module-version' | 'module-definition-unknown' | 'module-option-unknown' | 'module-definition-excluded'
  | 'page-duplicate' | 'page-outside-range' | 'template-unknown' | 'cell-outside-grid' | 'cell-duplicate'
  | 'fragment-missing' | 'render-failed'
  | 'builtin-nav-not-allowed' | 'fixed-cell-missing' | 'fixed-cell-wrong' | 'fixed-cell-differs'
  | 'chain-page-missing' | 'chain-page-template' | 'chain-duplicate' | 'chain-nav-wrong' | 'chain-nav-outside-chain' | 'chain-walk'
  | 'nav-target-missing' | 'location-target-missing' | 'page-unreachable'
  | 'gesture-not-allowed' | 'gesture-incomplete' | 'gesture-return' | 'cue-shape' | 'cue-action-outside-cue-key'
  | 'cue-unpublished' | 'cue-retired'
  | 'upgrade-skipped' | 'upgrade-changes-controls'

export type Finding = { severity: Severity; page: number | null; row: number | null; column: number | null; code: FindingCode; message: string }

type OptionShape = { id: string; type: string }
/** companion/definitions.json: what one module version registers. */
export type ModuleDefinitions = {
  moduleId: string
  version: string
  actions: Record<string, { name: string; options: OptionShape[] }>
  feedbacks: Record<string, { name: string; type: string; options: OptionShape[] }>
}

/** Catalog lookups, injected so the validator stays pure (A3 adds retirement to the catalog). */
export type CueLookups = {
  isPublished(cueId: string): boolean
  isRetired(cueId: string): boolean
  /** Optional: the cue's name, for messages. */
  name?(cueId: string): string | undefined
}

/** Companion's own import upgrade for one release (the vendored or local upgrade bundle). */
export type UpgradeCheck = { release: string; upgradeImport(exported: unknown): unknown }

export type ValidateOptions = {
  module: ModuleDefinitions
  cues: CueLookups
  /** Run when its release is the deck's recorded Companion release; otherwise reported as skipped. */
  upgrade?: UpgradeCheck | null
  /** The booth's installed connections, when known: every connection the deck uses must be there, exactly. */
  boothConnections?: { label: string; moduleId: string }[]
  /** Module definitions the deck design leaves off the deck. */
  excludedModuleDefinitions?: readonly string[]
}

export type ValidationResult = {
  ok: boolean
  findings: Finding[]
  summary: Record<string, string | number>
  /** The rendered export, when every button rendered. */
  exported: CompanionExport | null
}

/* -------------------------------------------------------------- constants --- */

/** The Overlays module each workspace's deck must use (TBI's is the derived package of the same version). */
export const OVERLAYS_MODULE: Record<DeckWorkspace, string> = { crc: 'crc-overlays', tbi: 'tbi-overlays' }
export const SINGULAR_MODULE = 'singularlive-studio'
/** Module definitions the deck design does not use (PRESET-DESIGN.md): panels step by explicit cue keys, and no scan-card page or slot light. */
export const DEFAULT_EXCLUDED_DEFINITIONS = ['next_panel', 'previous_panel', 'set_page', 'slot_empty'] as const
const CUE_ACTIONS = new Set(['toggle_cue', 'show_cue', 'animate_out'])
const CREDENTIAL_TEXT = /password|passwd|secret|token/i
const NAV_ROLES = new Set<FixedRole>(['prev', 'next', 'home', 'ring-prev', 'ring-home', 'ring-next'])
const MODULE_ROLE_ACTION: Partial<Record<FixedRole, string>> = { 'animate-out': 'animate_clear', 'clear-now': 'clear_now', 'logo-toggle': 'logo_toggle' }

/** Lookups over catalog draft rows (a snapshot, or the live catalog): published means an active revision and not archived. */
export function catalogCueLookups(
  drafts: { id: string; name?: string; archived?: boolean; activeRevision?: number | null; retired?: boolean; retiredAt?: unknown }[],
  alsoRetired: (draft: { id: string; name?: string }) => boolean = () => false,
): CueLookups {
  const byId = new Map(drafts.map((d) => [d.id, d]))
  return {
    isPublished: (id) => { const d = byId.get(id); return !!d && !d.archived && (d.activeRevision ?? 0) > 0 },
    isRetired: (id) => { const d = byId.get(id); return !!d && (d.retired === true || (d.retiredAt != null && d.retiredAt !== false) || alsoRetired(d)) },
    name: (id) => byId.get(id)?.name,
  }
}

/* ---------------------------------------------------------------- helpers --- */

type Obj = Record<string, unknown>
type Entity = Obj & { type: 'action' | 'feedback'; definitionId: string; connectionId: string; options?: Obj }

export function entities(value: unknown, out: Entity[] = []): Entity[] {
  if (Array.isArray(value)) { value.forEach((v) => entities(v, out)); return out }
  if (!value || typeof value !== 'object') return out
  const o = value as Obj
  if ((o.type === 'action' || o.type === 'feedback') && typeof o.definitionId === 'string') out.push(o as Entity)
  Object.values(o).forEach((v) => entities(v, out))
  return out
}

/** A control's content with entity and override ids removed, for comparing two cells. */
export function normalise(ctrl: unknown): string {
  return JSON.stringify(ctrl, (k, v) => (k === 'id' || k === 'overrideId' ? undefined : v))
}

/** The page a control's first step jumps to, if it is a jump. */
function jumpTarget(ctrl: Obj | undefined): number | null {
  const steps = ctrl?.steps as Record<string, { action_sets?: { down?: Entity[] } }> | undefined
  const down = steps?.['0']?.action_sets?.down ?? []
  const a = down.find((x) => !x.disabled && x.definitionId === 'set_page' && x.connectionId === 'internal')
  return a ? Number(unwrap(a.options?.page)) : null
}

/** A button's label as the operator sees it (a carried fragment's own text when it is not relabelled). */
export function buttonText(spec: ButtonSpec, deck?: CompanionDeck): string {
  switch (spec.kind) {
    case 'cue': return spec.label
    case 'jump': case 'module': case 'camera': case 'actions': return spec.text
    case 'merge': return 'Merge'
    case 'builtin': return spec.control
    case 'fragment': {
      if (spec.text != null) return spec.text
      const f = deck?.fragments[spec.fragment]
      const style = f && f.kind !== 'entities' ? f.style : null
      const text = style && 'set' in style
        ? unwrap(style.set['text0.text'])
        : ((style?.style.layers as { type?: string; text?: unknown }[] | undefined)?.find((l) => l.type === 'text')?.text)
      const value = unwrap(text)
      return typeof value === 'string' && value ? value : spec.fragment
    }
  }
}

/** Every `label:<label>` connection reference inside a fragment or trigger value. */
function labelRefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) { value.forEach((v) => labelRefs(v, out)); return out }
  if (!value || typeof value !== 'object') return out
  const o = value as Obj
  if (typeof o.connectionId === 'string' && o.connectionId.startsWith(CONNECTION_REF)) out.push(o.connectionId.slice(CONNECTION_REF.length))
  if (o.definitionId === INSTANCE_CONTROL) {
    const target = (o.options as Obj | undefined)?.instance_id as Obj | undefined
    if (target && typeof target.value === 'string' && target.value.startsWith(CONNECTION_REF)) out.push(target.value.slice(CONNECTION_REF.length))
  }
  Object.values(o).forEach((v) => labelRefs(v, out))
  return out
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/* -------------------------------------------------------------- validator --- */

export function validateDeck(deck: CompanionDeck, options: ValidateOptions): ValidationResult {
  const findings: Finding[] = []
  const exclude = new Set(options.excludedModuleDefinitions ?? DEFAULT_EXCLUDED_DEFINITIONS)
  const add = (severity: Severity, code: FindingCode, where: { page?: number | null; row?: number | null; column?: number | null }, message: string) =>
    findings.push({ severity, page: where.page ?? null, row: where.row ?? null, column: where.column ?? null, code, message })
  const pageByNumber = new Map<number, DeckPage>()
  const pageTitle = (n: number) => { const p = pageByNumber.get(n); return p ? `Page ${n} "${p.name}"` : `Page ${n}` }
  const where = (page: DeckPage, b: { row: number; col: number }) => ({ page: page.number, row: b.row, column: b.col })
  const cellName = (page: DeckPage, b: DeckButton) =>
    `${pageTitle(page.number)}, row ${b.row} column ${b.col} ("${buttonText(b.spec, deck).replace(/\n/g, ' ')}")`
  const errorsBefore = new Set<string>() // "page/row/col" of buttons already reported, so render failures are not reported twice
  const flag = (page: DeckPage, b: DeckButton) => errorsBefore.add(`${page.number}/${b.row}/${b.col}`)

  /* 1. No credentials; the recorded Companion build. */
  try { assertSanitized(deck) } catch (e) {
    add('error', 'credential-key', {}, `The deck stores something that looks like a credential (${(e as Error).message}). Remove it; a deck holds connection labels only.`)
  }
  const credentialInDeck = CREDENTIAL_TEXT.test(JSON.stringify(deck))
  if (credentialInDeck) add('error', 'credential-text', {}, 'The deck contains the word password, secret or token. Find and remove it before any export leaves this system.')
  const recorded = WORKSPACE_COMPANION[deck.workspace]
  if (!recorded) add('error', 'companion-build', {}, `The deck names an unknown workspace "${deck.workspace}".`)
  else {
    if (deck.companion.release !== recorded.release) add('error', 'companion-build', {}, `The deck targets Companion ${deck.companion.release}, but this workspace's booth runs ${recorded.release}. Render for the booth's build.`)
    if (deck.companion.exportVersion !== recorded.exportVersion) add('error', 'companion-build', {}, `The deck writes export format ${deck.companion.exportVersion}, but Companion ${recorded.release} expects format ${recorded.exportVersion}.`)
  }

  /* 2. The connection registry. */
  const labels = new Map<string, number>()
  for (const c of deck.connections) labels.set(c.label, (labels.get(c.label) ?? 0) + 1)
  for (const [label, n] of labels) if (n > 1) add('error', 'connection-label-duplicate', {}, `${n} connections share the label "${label}". Companion maps imports by label, so each label must be unique.`)
  for (const c of deck.connections) {
    if (companionLabel(c.label) !== c.label) add('error', 'connection-label-invalid', {}, `The connection label "${c.label}" is not one Companion keeps as typed (it would become "${companionLabel(c.label)}"). Use letters, digits, "_" and "-" only.`)
    if (c.moduleId === SINGULAR_MODULE) add('warning', 'singular-connection', {}, `The deck still carries the Singular.live connection "${c.label}". Drop it once no button uses it.`)
  }
  const overlays = deck.connections.filter((c) => c.role === 'overlays')
  if (overlays.length !== 1) add('error', 'connection-role', {}, `The deck needs exactly one Overlays connection and has ${overlays.length}.`)
  const overlaysConn = overlays[0]
  if (overlaysConn) {
    const want = OVERLAYS_MODULE[deck.workspace]
    if (want && overlaysConn.moduleId !== want) add('error', 'module-id', {}, `The Overlays connection "${overlaysConn.label}" uses module ${overlaysConn.moduleId}; this workspace's module is ${want}.`)
    if (overlaysConn.moduleVersionId !== options.module.version) add('error', 'module-version', {}, `The Overlays connection "${overlaysConn.label}" asks for module version ${overlaysConn.moduleVersionId}, but the definitions checked are version ${options.module.version}.`)
  }
  if (deck.connections.filter((c) => c.role === 'switcher').length > 1) add('error', 'connection-role', {}, 'The deck has more than one switcher connection.')
  const switcher = deck.connections.find((c) => c.role === 'switcher')

  const exactLabel = (label: string) => deck.connections.find((c) => c.label === label)
  const suggestion = (label: string) => {
    const near = deck.connections.find((c) => squash(c.label) === squash(label) || squash(c.label) === squash(companionLabel(label)))
    return near ? ` Did you mean "${near.label}"?` : ''
  }
  const unknownLabel = (label: string) =>
    `uses the connection "${label}", but the deck has no connection labelled exactly that. On import Companion would bind it to the first connection of the same module, silently.${suggestion(label)}`
  const usedConnections = new Map<string, string>() // label → first use, for the booth check

  /* 3. Pages, grid and per-button references. */
  for (const page of deck.pages) {
    if (pageByNumber.has(page.number)) add('error', 'page-duplicate', { page: page.number }, `Page ${page.number} appears twice in the deck.`)
    pageByNumber.set(page.number, page)
    if (!Number.isInteger(page.number) || page.number < 1 || page.number > 99) add('error', 'page-outside-range', { page: page.number }, `Page ${page.number} is outside Companion's pages 1–99.`)
  }
  const templateOf = (page: DeckPage): PageTemplate | undefined => deck.templates[page.template]
  const rendered = new Map<string, Obj>() // "page/row/col" → control
  const renderedPages: Record<string, { controls: Record<string, Record<string, Obj>> }> = {}
  let renderFailures = 0

  for (const page of [...pageByNumber.values()].sort((a, b) => a.number - b.number)) {
    const template = templateOf(page)
    if (!template) add('error', 'template-unknown', { page: page.number }, `${pageTitle(page.number)} uses the page template "${page.template}", which this deck does not define.`)
    const seen = new Set<string>()
    renderedPages[page.number] = { controls: {} }
    for (const b of page.buttons) {
      const key = `${b.row}/${b.col}`
      if (b.row < 0 || b.row >= deck.grid.rows || b.col < 0 || b.col >= deck.grid.columns) {
        add('error', 'cell-outside-grid', where(page, b), `${cellName(page, b)} is outside the ${deck.grid.rows}×${deck.grid.columns} grid.`); flag(page, b); continue
      }
      if (seen.has(key)) { add('error', 'cell-duplicate', where(page, b), `${cellName(page, b)} is placed on a cell that already holds a button.`); flag(page, b); continue }
      seen.add(key)

      // Connection references, by exact label.
      const spec = b.spec
      const needRole = (role: 'overlays' | 'switcher') => {
        if (role === 'overlays' ? !overlaysConn : !switcher) {
          add('error', 'connection-role', where(page, b), `${cellName(page, b)} needs the deck's ${role === 'overlays' ? 'Overlays' : 'switcher'} connection, and the deck has none.`); flag(page, b)
        } else usedConnections.set((role === 'overlays' ? overlaysConn! : switcher!).label, cellName(page, b))
      }
      const fragmentLabels = (keyName: string) => {
        const f = deck.fragments[keyName]
        if (!f) { add('error', 'fragment-missing', where(page, b), `${cellName(page, b)} uses the device fragment "${keyName}", which is not in the deck.`); flag(page, b); return }
        for (const label of new Set(labelRefs(f))) {
          if (!exactLabel(label)) { add('error', 'connection-label-unknown', where(page, b), `${cellName(page, b)} ${unknownLabel(label)}`); flag(page, b) }
          else if (!usedConnections.has(label)) usedConnections.set(label, cellName(page, b))
        }
      }
      if (spec.kind === 'cue' || spec.kind === 'module') needRole('overlays')
      if (spec.kind === 'camera' || spec.kind === 'merge' || (spec.kind === 'cue' && spec.gesture && (spec.gesture.in || spec.gesture.out))) needRole('switcher')
      if (spec.kind === 'cue' && spec.gesture) {
        for (const move of [spec.gesture.in, spec.gesture.out]) {
          if (!move?.conn) continue
          const found = deck.connections.find((c) => c.label === move.conn || c.label === companionLabel(move.conn!))
          if (!found) { add('error', 'connection-label-unknown', where(page, b), `${cellName(page, b)} ${unknownLabel(move.conn)}`); flag(page, b) }
          else if (!usedConnections.has(found.label)) usedConnections.set(found.label, cellName(page, b))
        }
      }
      if (spec.kind === 'fragment') fragmentLabels(spec.fragment)
      if (spec.kind === 'actions') spec.steps.flat().forEach(fragmentLabels)
      if (spec.kind === 'camera') fragmentLabels('camera-tally')
      if (spec.kind === 'builtin' && template && !template.builtInNav) {
        add('error', 'builtin-nav-not-allowed', where(page, b), `${cellName(page, b)} is Companion's built-in ${spec.control} button, which the "${template.id}" page template does not allow. Use an explicit page jump.`)
      }

      // Render it, unless it has already been explained.
      if (errorsBefore.has(`${page.number}/${b.row}/${b.col}`)) { renderFailures++; continue }
      try {
        const ctrl = renderButton(deck, b, `page ${page.number} r${b.row}c${b.col}`)
        rendered.set(`${page.number}/${key}`, ctrl)
        ;(renderedPages[page.number].controls[b.row] ??= {})[b.col] = ctrl
      } catch (e) {
        renderFailures++
        add('error', 'render-failed', where(page, b), `${cellName(page, b)} cannot be rendered: ${(e as Error).message}.`)
      }
    }
  }
  for (const label of new Set(labelRefs(deck.triggers))) {
    if (!exactLabel(label)) add('error', 'connection-label-unknown', {}, `A trigger ${unknownLabel(label)}`)
    else if (!usedConnections.has(label)) usedConnections.set(label, 'a trigger')
  }
  if (options.boothConnections) {
    for (const [label, firstUse] of usedConnections) {
      const c = exactLabel(label)
      const booth = options.boothConnections.find((x) => x.label === label)
      if (!booth) add('error', 'connection-not-at-booth', {}, `The booth has no connection labelled exactly "${label}" (first used by ${firstUse}). Rename the booth's connection or the deck's before importing.`)
      else if (c && booth.moduleId !== c.moduleId) add('error', 'connection-not-at-booth', {}, `The booth's connection "${label}" is a ${booth.moduleId}, but the deck expects a ${c.moduleId} (first used by ${firstUse}).`)
    }
  }

  const used = [...pageByNumber.values()].filter((p) => p.buttons.length > 0).map((p) => p.number)
  const at = (n: number, r: number, c: number) => rendered.get(`${n}/${r}/${c}`)
  const buttonAt = (page: DeckPage, r: number, c: number) => page.buttons.find((b) => b.row === r && b.col === c)

  /* 4. Chains. */
  const chainOf = new Map<number, number>()
  deck.chains.forEach((chain, i) => {
    for (const n of chain) {
      if (chainOf.has(n)) add('error', 'chain-duplicate', { page: n }, `${pageTitle(n)} is in two service chains.`)
      chainOf.set(n, i)
      const p = pageByNumber.get(n)
      if (!p) { add('error', 'chain-page-missing', { page: n }, `A service chain lists page ${n}, which is not in the deck.`); continue }
      const t = templateOf(p)
      if (t && !t.chainNav) add('error', 'chain-page-template', { page: n }, `${pageTitle(n)} is in a service chain, but its "${t.id}" template has no Prev/Next.`)
    }
    const nextCell = (n: number) => {
      const t = pageByNumber.get(n) && templateOf(pageByNumber.get(n)!)
      const f = t?.fixed.find((x) => x.role === 'next')
      return f ? jumpTarget(at(n, f.row, f.col)) : null
    }
    let p = chain[0]
    const walked: (number | string)[] = [p]
    while (walked.length <= chain.length) {
      const n = nextCell(p)
      if (n === 1) break
      if (n == null) { walked.push('a dead end'); break }
      p = n; walked.push(n)
    }
    if (walked.join() !== chain.join()) add('error', 'chain-walk', { page: chain[0] }, `Pressing Next from page ${chain[0]} walks ${walked.join(' → ')} instead of ${chain.join(' → ')} and back to Home.`)
  })

  /* 5. Page templates: fixed cells. */
  const reference = new Map<string, { page: number; ctrl: string }>() // template/role cell → first page's normalised control
  for (const page of [...pageByNumber.values()].sort((a, b) => a.number - b.number)) {
    const t = templateOf(page)
    if (!t) continue
    const nb = t.chainNav ? chainNeighbours(deck.chains, page.number) : null
    for (const f of t.fixed) {
      const b = buttonAt(page, f.row, f.col)
      const loc = { page: page.number, row: f.row, column: f.col }
      const here = `${pageTitle(page.number)}, row ${f.row} column ${f.col}`
      if (f.role === 'prev' || f.role === 'next') {
        if (!nb) {
          if (b) add('error', 'chain-nav-outside-chain', loc, `${here} holds a ${f.role === 'prev' ? 'Prev' : 'Next'} key, but the page is in no service chain.`)
          continue
        }
        const want = f.role === 'prev' ? nb.prev : nb.next
        const got = jumpTarget(at(page.number, f.row, f.col))
        if (!b) add('error', 'fixed-cell-missing', loc, `${here} should be the ${f.role === 'prev' ? 'Prev' : 'Next'} key to ${want === 1 ? 'Home' : `page ${want}`}, and it is empty.`)
        else if (got !== want) add('error', 'chain-nav-wrong', loc, `${here} (${f.role === 'prev' ? 'Prev' : 'Next'}) should go to ${want === 1 ? 'Home' : `page ${want}`} but goes to ${got == null ? 'nowhere' : `page ${got}`}.`)
        continue
      }
      if (!b) { add('error', 'fixed-cell-missing', loc, `${here} should hold the ${f.role} key of the "${t.id}" template, and it is empty.`); continue }
      const spec = b.spec
      let ok = true
      if (f.role === 'home' || f.role === 'ring-home') ok = jumpTarget(at(page.number, f.row, f.col)) === 1
      else if (f.role === 'ring-prev' || f.role === 'ring-next') ok = jumpTarget(at(page.number, f.row, f.col)) != null
      else if (MODULE_ROLE_ACTION[f.role]) ok = spec.kind === 'module' && spec.action === MODULE_ROLE_ACTION[f.role]
      else if (f.role === 'camera-center' || f.role === 'camera-left' || f.role === 'camera-right') ok = spec.kind === 'camera'
      else if (f.role === 'merge') ok = spec.kind === 'merge'
      else if (f.role === 'bimah-mute') ok = spec.kind === 'fragment' || spec.kind === 'actions'
      if (!ok) { add('error', 'fixed-cell-wrong', loc, `${cellName(page, b)} should be the ${f.role} key of the "${t.id}" template.`); continue }
      // Page-independent keys must be the same on every page of the template.
      if (NAV_ROLES.has(f.role) && f.role !== 'home') continue
      const ctrl = at(page.number, f.row, f.col)
      if (!ctrl) continue
      const refKey = `${t.id}/${f.row}/${f.col}`
      const norm = normalise(ctrl)
      const ref = reference.get(refKey)
      if (!ref) reference.set(refKey, { page: page.number, ctrl: norm })
      else if (ref.ctrl !== norm) add('error', 'fixed-cell-differs', loc, `${cellName(page, b)} differs from the same ${f.role} key on page ${ref.page}; every "${t.id}" page must carry it unchanged.`)
    }
  }

  /* 6. Cue keys: gesture shape from the template, rendered step shape. */
  let cueKeys = 0, gestures = 0
  for (const page of pageByNumber.values()) {
    const t = templateOf(page)
    for (const b of page.buttons) {
      if (b.spec.kind !== 'cue') continue
      cueKeys++
      const spec = b.spec
      const g = spec.gesture
      const loc = where(page, b)
      if (g) {
        gestures++
        if (t && !t.gesture) add('error', 'gesture-not-allowed', loc, `${cellName(page, b)} carries a camera gesture, which the "${t.id}" page template does not allow.`)
        if (!g.in && !g.out) add('error', 'gesture-incomplete', loc, `${cellName(page, b)} has a camera gesture with no camera move.`)
        if (g.in && (!g.in.conn || g.in.preset == null)) add('error', 'gesture-incomplete', loc, `${cellName(page, b)} moves a camera in without naming the camera and its preset.`)
        if (t?.gesture && g.out) {
          if (g.out.input !== t.gesture.returnInput) add('error', 'gesture-return', loc, `${cellName(page, b)} ends on "${g.out.input}" instead of returning to "${t.gesture.returnInput}".`)
          if (g.out.conn && g.out.preset !== t.gesture.returnPreset) add('error', 'gesture-return', loc, `${cellName(page, b)} returns the camera to preset ${g.out.preset} instead of preset ${t.gesture.returnPreset}.`)
        }
      }
      const ctrl = at(page.number, b.row, b.col)
      if (!ctrl) continue
      const steps = Object.values((ctrl.steps as Record<string, { action_sets: { down: Entity[] } }>) ?? {}).map((s) => s.action_sets.down)
      const first = (i: number) => steps[i]?.[0]
      const is = (a: Entity | undefined, def: string) => a?.definitionId === def && unwrap(a.options?.cue) === spec.cueId
      const shaped = g
        ? steps.length === 2 && is(first(0), 'show_cue') && is(first(1), 'animate_out')
        : steps.length === 1 && steps[0].length === 1 && is(first(0), 'toggle_cue')
      if (!shaped) add('error', 'cue-shape', loc, `${cellName(page, b)} is not ${g ? 'a two-step Show / Animate out camera gesture' : 'a one-step Toggle cue key'} for its cue.`)
    }
  }

  /* 7. Rendered entities: navigation targets, module definitions, cue bindings. */
  const moduleUse = new Set<string>()
  const boundCues = new Set<string>()
  const cueFindings = new Set<string>()
  const checkEntities = (list: Entity[], loc: { page?: number; row?: number; column?: number }, label: string, spec: ButtonSpec | null) => {
    const connById = new Map(deck.connections.map((c) => [c.id, c]))
    for (const e of list) {
      if (e.connectionId === 'internal') {
        if (e.definitionId === 'set_page') {
          const target = Number(unwrap(e.options?.page))
          if (!pageByNumber.get(target)?.buttons.length) add('error', 'nav-target-missing', loc, `${label} jumps to page ${target}, which ${pageByNumber.has(target) ? 'has no buttons' : 'is not in the deck'}.`)
        }
        const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(String(unwrap(e.options?.location) ?? ''))
        if (m && !pageByNumber.get(Number(m[1]))?.buttons.some((b) => b.row === Number(m[2]) && b.col === Number(m[3]))) {
          add('error', 'location-target-missing', loc, `${label} points at button ${m[0]}, which is empty.`)
        }
        continue
      }
      const conn = connById.get(e.connectionId)
      if (conn?.moduleId === SINGULAR_MODULE) add('error', 'singular-action', loc, `${label} still fires Singular.live through "${conn.label}". Convert it to an Overlays cue key.`)
      if (!overlaysConn || e.connectionId !== overlaysConn.id) continue
      moduleUse.add(e.definitionId)
      const defs = e.type === 'action' ? options.module.actions : options.module.feedbacks
      const def = defs[e.definitionId]
      if (!def) add('error', 'module-definition-unknown', loc, `${label} uses the Overlays ${e.type} "${e.definitionId}", which module ${options.module.version} does not define.`)
      else for (const k of Object.keys(e.options ?? {})) {
        if (!def.options.some((o) => o.id === k)) add('error', 'module-option-unknown', loc, `${label} sets the option "${k}" on the Overlays ${e.type} "${e.definitionId}", which module ${options.module.version} does not have.`)
      }
      if (exclude.has(e.definitionId)) add('error', 'module-definition-excluded', loc, `${label} uses the Overlays ${e.type} "${e.definitionId}", which the deck design leaves out.`)
      if (e.type === 'action' && CUE_ACTIONS.has(e.definitionId) && spec && spec.kind !== 'cue') {
        add('warning', 'cue-action-outside-cue-key', loc, `${label} fires a cue but is not a cue key, so it has no Requested or Rendered light.`)
      }
      const cue = unwrap(e.options?.cue)
      if (typeof cue !== 'string' || !cue) continue
      boundCues.add(cue)
      const dedupe = `${loc.page}/${loc.row}/${loc.column}/${cue}`
      if (cueFindings.has(dedupe)) continue
      const name = options.cues.name?.(cue)
      const named = name ? `cue "${name}" (${cue})` : `cue ${cue}`
      if (options.cues.isRetired(cue)) { cueFindings.add(dedupe); add('error', 'cue-retired', loc, `${label} is bound to ${named}, which has been retired. Bind its replacement or remove the key.`) }
      else if (!options.cues.isPublished(cue)) { cueFindings.add(dedupe); add('error', 'cue-unpublished', loc, `${label} is bound to ${named}, which is not published. Publish it or bind a published cue.`) }
    }
  }
  for (const page of pageByNumber.values()) {
    for (const b of page.buttons) {
      const ctrl = at(page.number, b.row, b.col)
      if (ctrl) checkEntities(entities(ctrl), where(page, b), cellName(page, b), b.spec)
    }
  }

  /* 8. Every page with buttons is reachable from Home (page 1). */
  const hasBuiltIn = (n: number) => pageByNumber.get(n)?.buttons.some((b) => b.spec.kind === 'builtin' && b.spec.control !== 'pagenum')
  const seen = new Set([1]), queue = [1]
  let stepsEverywhere = false
  while (queue.length) {
    const n = queue.shift()!
    if (hasBuiltIn(n)) stepsEverywhere = true // Companion's page up/down step through every page number
    for (const b of pageByNumber.get(n)?.buttons ?? []) {
      for (const e of entities(at(n, b.row, b.col) ?? {})) {
        if (e.connectionId !== 'internal' || e.definitionId !== 'set_page') continue
        const t = Number(unwrap(e.options?.page))
        if (!seen.has(t)) { seen.add(t); queue.push(t) }
      }
    }
    if (stepsEverywhere) for (const p of used) if (!seen.has(p)) { seen.add(p); queue.push(p) }
  }
  if (!pageByNumber.has(1)) add('error', 'page-unreachable', { page: 1 }, 'The deck has no page 1 (Home).')
  for (const p of used) if (!seen.has(p)) add('error', 'page-unreachable', { page: p }, `${pageTitle(p)} cannot be reached from Home by any page jump.`)

  /* 9. The whole export: triggers, credentials, Companion's own upgrade. */
  let exported: CompanionExport | null = null
  let upgrade = 'skipped (a button did not render)'
  if (renderFailures === 0) {
    try { exported = renderDeck(deck) } catch (e) { add('error', 'render-failed', {}, `The deck cannot be rendered: ${(e as Error).message}.`) }
  }
  if (exported) {
    checkEntities(entities(exported.triggers), {}, 'A trigger', null)
    if (CREDENTIAL_TEXT.test(JSON.stringify(exported)) && !credentialInDeck) add('error', 'credential-text', {}, 'The rendered export contains the word password, secret or token. Find and remove it before the file leaves this system.')
    if (!options.upgrade) {
      upgrade = `skipped (no Companion ${deck.companion.release} upgrade bundle available)`
      add('info', 'upgrade-skipped', {}, `Companion ${deck.companion.release}'s own import upgrade was not run: its upgrade bundle is not available here.`)
    } else if (options.upgrade.release !== deck.companion.release) {
      upgrade = `skipped (bundle is ${options.upgrade.release}, deck targets ${deck.companion.release})`
      add('info', 'upgrade-skipped', {}, `Companion's import upgrade was not run: the bundle available is for ${options.upgrade.release}, and this deck targets ${deck.companion.release}.`)
    } else {
      const up = options.upgrade.upgradeImport(structuredClone(exported)) as { version?: number; pages?: Record<string, { controls?: Record<string, Record<string, unknown>> }> }
      const changed: string[] = []
      let total = 0
      for (const [n, page] of Object.entries(exported.pages)) {
        for (const [r, row] of Object.entries((page as { controls: Record<string, Record<string, unknown>> }).controls)) {
          for (const [c, ctrl] of Object.entries(row)) {
            total++
            const out = up.pages?.[n]?.controls?.[r]?.[c] as Obj | undefined
            if (!out || out.type !== (ctrl as Obj).type || JSON.stringify(out) !== JSON.stringify(ctrl)) changed.push(`${n}/${r}/${c}`)
          }
        }
      }
      if (changed.length) add('error', 'upgrade-changes-controls', {}, `Companion ${deck.companion.release}'s import upgrade changes ${changed.length} buttons (first: ${changed.slice(0, 5).join(', ')}). The deck must import unchanged.`)
      if (Object.keys(up.pages ?? {}).length !== Object.keys(exported.pages).length) add('error', 'upgrade-changes-controls', {}, `Companion ${deck.companion.release}'s import upgrade changes the number of pages.`)
      upgrade = `v${exported.version}→v${up.version}, ${total - changed.length}/${total} controls unchanged`
    }
  }

  const buttons = deck.pages.reduce((n, p) => n + p.buttons.length, 0)
  const summary = {
    workspace: deck.workspace,
    companion: `${deck.companion.release} (export v${deck.companion.exportVersion})`,
    pages: used.length,
    buttons,
    cueKeys: `${cueKeys} (${cueKeys - gestures} one-step, ${gestures} camera gestures)`,
    cueIdsBound: boundCues.size,
    connections: exported ? Object.keys(exported.instances).length : deck.connections.length,
    chains: deck.chains.map((c) => `${c[0]}→${c.at(-1)}`).join(', ') || 'none',
    moduleDefinitionsUsed: [...moduleUse].sort().join(', '),
    companionUpgrade: upgrade,
  }
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.page ?? 0) - (b.page ?? 0) || (a.row ?? 0) - (b.row ?? 0) || (a.column ?? 0) - (b.column ?? 0))
  return { ok: !findings.some((f) => f.severity === 'error'), findings, summary, exported }
}
