// TBI's deck (R-C7), seeded from Simone's Companion export (TBIComputer, 2026-09-14, Companion 5.0.5),
// and the general "deck from a Companion export" derivation seed_deck_from_export runs on an upload.
//
// What a seed keeps: every page with its id, name and positions; Companion's built-in page up / number /
// down buttons; every device button (her BirdDog pad and presets, her two OBS scene keys) carried
// verbatim as a device fragment that names its connection by label; and every graphic button with her
// label and colours. A graphic button that fired Singular.live becomes an inert placeholder (her label
// and colours, no action) that records what it fired (`singular`); convert.ts binds it to a published
// Overlays cue, which gives it the Requested and Rendered lights. The Singular connections are dropped:
// no seeded button fires them. A `TBI_Overlays` connection stub is added.
//
// What a seed never keeps: any connection's `config` or `secrets`. Connection stubs are built from an
// explicit allowlist of import-mapping fields, the raw export is never stored, and the result must pass
// assertSanitized. tbi-seed-data.json is derived data only (tests/companion-deck-tbi.test.ts proves no
// config/secret value of the raw export appears in it when the raw export is present).
import zlib from 'node:zlib'
import {
  CONNECTION_REF, PAGE_TEMPLATES, PALETTE, WORKSPACE_COMPANION, assertSanitized, companionLabel, stableId, unwrap,
  type BuiltInControl, type CompanionDeck, type DeckButton, type DeckConnection, type DeckPage, type DeckWorkspace,
  type DeviceFragment, type FragmentStyle, type JsonObject, type SingularOrigin, type SingularRef,
} from './model.ts'
import { templateLayers } from './render.ts'

type Obj = Record<string, unknown>

export const SINGULAR_MODULE = 'singularlive-studio'
/** The Overlays connection a converted TBI deck uses: the derived module, same version as crc-overlays. */
export const TBI_OVERLAYS_CONNECTION = { label: 'TBI_Overlays', moduleId: 'tbi-overlays', moduleVersionId: '1.7.0' } as const
const BUILT_IN = new Set<string>(['pageup', 'pagenum', 'pagedown'])
const CREDENTIAL_TEXT = /password|passwd|secret|token/i
/** Largest decompressed export accepted (Simone's is 0.8 MB). */
export const MAX_EXPORT_BYTES = 16 * 1024 * 1024

/* ------------------------------------------------------------ seed data --- */

export type ExportSeedData = {
  about: string
  source: { file: string; sha256: string }
  companion: { build: string; exportVersion: number }
  grid: { rows: number; columns: number }
  /** Connection stubs the carried device buttons use (import-mapping fields only). */
  connections: DeckConnection[]
  /** Connections of the export that the seed leaves out, and why (labels and module ids only). */
  dropped: { label: string; moduleId: string; reason: string }[]
  /** How many of the export's connections carried `config` or `secrets`, all discarded unread. */
  connectionSettingsDiscarded: number
  pages: DeckPage[]
  fragments: Record<string, DeviceFragment>
  triggers: JsonObject
  customVariables: JsonObject
}

/** What a derivation did, in counts and sentences (no button contents, no connection settings). */
export type SeedSummary = {
  pages: number
  pagesWithButtons: number
  graphics: number
  devices: number
  builtInNav: number
  keptConnections: string[]
  droppedConnections: string[]
  /** How many connections had `config` or `secrets` that were discarded (the values are never read out). */
  connectionSettingsDiscarded: number
  warnings: string[]
}

export class ExportSeedError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status }
}

/* ---------------------------------------------------------------- reading --- */

/** Parse a .companionconfig (gzip or plain JSON). The bytes are never stored. */
export function readCompanionExport(bytes: Uint8Array): Obj {
  const buf = Buffer.from(bytes)
  let text: string
  try {
    text = (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf, { maxOutputLength: MAX_EXPORT_BYTES }) : buf).toString('utf8')
  } catch {
    throw new ExportSeedError('export_unreadable', 'That file is not a Companion export Companion 5 writes (it would not decompress). Export again from Companion: Import / Export → Export → Full configuration.')
  }
  if (text.length > MAX_EXPORT_BYTES) throw new ExportSeedError('export_too_large', 'That export is larger than 16 MB. Nothing was stored.')
  let data: unknown
  try { data = JSON.parse(text) } catch {
    throw new ExportSeedError('export_unreadable', 'That file is not a Companion export (it is not JSON). Export again from Companion: Import / Export → Export → Full configuration.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof (data as Obj).pages !== 'object') {
    throw new ExportSeedError('export_unreadable', 'That file has no pages, so it is not a full Companion export. Export again with Full configuration.')
  }
  return data as Obj
}

/* ------------------------------------------------------------- derivation --- */

const layerShape = (layers: Obj[]) => JSON.stringify(layers.map((l) => [l.id, l.type, Object.keys(l)]))
const TEMPLATE_SHAPE = layerShape(templateLayers())

/** Layer overrides against the built-in template when the style has its exact shape, else the whole style. */
export function compactStyle(style: Obj): FragmentStyle {
  const layers = style.layers as Obj[] | undefined
  if (Object.keys(style).join(',') !== 'layers' || !Array.isArray(layers) || layerShape(layers) !== TEMPLATE_SHAPE) return { style: structuredClone(style) as JsonObject }
  const base = templateLayers()
  const set: Record<string, JsonObject[string]> = {}
  layers.forEach((layer, i) => {
    for (const [k, v] of Object.entries(layer)) if (JSON.stringify(v) !== JSON.stringify(base[i][k])) set[`${layer.id}.${k}`] = structuredClone(v) as JsonObject[string]
  })
  return { set }
}

/** Every action and feedback in a control, in step order (feedbacks last). */
function entitiesOf(ctrl: Obj): Obj[] {
  const out: Obj[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (!v || typeof v !== 'object') return
    const o = v as Obj
    if ((o.type === 'action' || o.type === 'feedback') && typeof o.definitionId === 'string') out.push(o)
    Object.values(o).forEach(walk)
  }
  const steps = (ctrl.steps ?? {}) as Obj
  for (const k of Object.keys(steps).sort((a, b) => Number(a) - Number(b))) walk(steps[k])
  walk(ctrl.feedbacks)
  return out
}

/** The Singular composition a step's first animate action names. */
function stepRef(step: unknown, definitionId: string, singularLabel: Map<string, string>): SingularRef | null {
  const down = ((step as Obj | undefined)?.action_sets as Obj | undefined)?.down
  for (const a of Array.isArray(down) ? down as Obj[] : []) {
    const app = singularLabel.get(String(a.connectionId))
    if (app && a.definitionId === definitionId) return { app, comp: String(unwrap((a.options as Obj | undefined)?.comp) ?? '') }
  }
  return null
}

/** What a Singular graphic button fired, and whether it is the plain two-press toggle Singular decks use. */
function singularOrigin(ctrl: Obj, singularLabel: Map<string, string>): { origin: SingularOrigin; plain: boolean } {
  const steps = (ctrl.steps ?? {}) as Obj
  const keys = Object.keys(steps).sort((a, b) => Number(a) - Number(b))
  const all = entitiesOf(ctrl).filter((e) => e.type === 'action')
  const inRef = keys.length ? stepRef(steps[keys[0]], 'animateIn', singularLabel) : null
  const outRef = keys.length > 1 ? stepRef(steps[keys[1]], 'animateOut', singularLabel) : null
  const findAny = (def: string): SingularRef | null => {
    const a = all.find((x) => singularLabel.has(String(x.connectionId)) && x.definitionId === def)
    return a ? { app: singularLabel.get(String(a.connectionId))!, comp: String(unwrap((a.options as Obj | undefined)?.comp) ?? '') } : null
  }
  const plain = keys.length === 2 && all.length === 2 && !!inRef && !!outRef
  return { origin: { in: inRef ?? findAny('animateIn'), out: outRef ?? findAny('animateOut') }, plain }
}

export type DeriveOptions = { workspace: DeckWorkspace; source: { file: string; sha256: string } }

/**
 * Derive a deck seed from a Companion 5 full export. Pure apart from reading `exported`. Connection
 * config and secrets are never read: stubs copy only id, label, module, version, sort order, update
 * policy and upgrade index.
 */
export function deriveExportSeedData(exported: Obj, options: DeriveOptions): { data: ExportSeedData; summary: SeedSummary } {
  const warnings: string[] = []
  const instances = (exported.instances ?? {}) as Record<string, Obj>
  let discarded = 0
  const stubs = new Map<string, DeckConnection & { singular: boolean }>()
  for (const [id, inst] of Object.entries(instances)) {
    if (!inst || typeof inst !== 'object') continue
    if ('config' in inst || 'secrets' in inst) discarded++
    if (inst.moduleInstanceType !== undefined && inst.moduleInstanceType !== 'connection') continue
    const moduleId = String(inst.moduleId ?? inst.instance_type ?? '')
    stubs.set(id, {
      id, label: String(inst.label ?? ''), moduleId, moduleVersionId: String(inst.moduleVersionId ?? ''),
      sortOrder: Number(inst.sortOrder ?? 0), updatePolicy: String(inst.updatePolicy ?? 'stable'), lastUpgradeIndex: Number(inst.lastUpgradeIndex ?? -1),
      singular: moduleId === SINGULAR_MODULE,
    })
  }
  const singularLabel = new Map([...stubs.values()].filter((c) => c.singular).map((c) => [c.id, c.label]))
  const used = new Set<string>()
  const toRefs = <T>(value: T, where: string): T => {
    if (Array.isArray(value)) return value.map((v) => toRefs(v, where)) as T
    if (!value || typeof value !== 'object') return value
    const out: Obj = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === 'connectionId' && typeof v === 'string' && v !== 'internal') {
        const c = stubs.get(v)
        if (!c) throw new ExportSeedError('export_dangling_connection', `${where} uses a connection that is not in the export. Export again from Companion with every connection included.`)
        used.add(v)
        out[k] = `${CONNECTION_REF}${c.label}`
      } else out[k] = toRefs(v, where)
    }
    const target = out.definitionId === 'instance_control' ? (out.options as Obj | undefined)?.instance_id as Obj | undefined : undefined
    if (target && typeof target.value === 'string' && stubs.has(target.value)) { used.add(target.value); target.value = `${CONNECTION_REF}${stubs.get(target.value)!.label}` }
    return out as T
  }

  const grid = (() => {
    const first = Object.values((exported.pages ?? {}) as Record<string, Obj>)[0]?.gridSize as Obj | undefined
    const rows = first ? Number(first.maxRow) - Number(first.minRow) + 1 : 4
    const columns = first ? Number(first.maxColumn) - Number(first.minColumn) + 1 : 8
    return { rows: Number.isFinite(rows) && rows > 0 ? rows : 4, columns: Number.isFinite(columns) && columns > 0 ? columns : 8 }
  })()

  const pages: DeckPage[] = []
  const fragments: Record<string, DeviceFragment> = {}
  let graphics = 0, devices = 0, builtInNav = 0
  const pageEntries = Object.entries((exported.pages ?? {}) as Record<string, Obj>).map(([n, p]) => [Number(n), p] as const).sort((a, b) => a[0] - b[0])
  for (const [n, page] of pageEntries) {
    if (!Number.isInteger(n) || n < 1 || n > 99) { warnings.push(`Page ${n} is outside Companion's pages 1–99 and was left out.`); continue }
    const buttons: DeckButton[] = []
    const controls = (page.controls ?? {}) as Record<string, Record<string, Obj>>
    for (const [r, row] of Object.entries(controls).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      for (const [c, ctrl] of Object.entries(row ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const R = Number(r), C = Number(c), key = `${n}/${R}/${C}`, where = `Page ${n}, row ${R} column ${C}`
        if (!ctrl || typeof ctrl !== 'object') continue
        if (BUILT_IN.has(String(ctrl.type))) { buttons.push({ row: R, col: C, spec: { kind: 'builtin', control: ctrl.type as BuiltInControl } }); builtInNav++; continue }
        if (ctrl.type !== 'button-layered') throw new ExportSeedError('export_old_format', `${where} is a "${String(ctrl.type)}" button, which Companion 5 no longer writes. Open the export in Companion 5, then export it again.`)
        const style = compactStyle((ctrl.style ?? {}) as Obj)
        const fires = entitiesOf(ctrl).filter((e) => singularLabel.has(String(e.connectionId)))
        if (!fires.length) {
          const carried = toRefs(structuredClone(ctrl), where)
          fragments[key] = {
            kind: 'control', source: `export ${key}`, style: compactStyle((carried.style ?? {}) as Obj), options: (carried.options ?? {}) as JsonObject,
            feedbacks: (carried.feedbacks ?? []) as JsonObject[], steps: (carried.steps ?? {}) as JsonObject, localVariables: (carried.localVariables ?? []) as JsonObject[],
          }
          buttons.push({ row: R, col: C, spec: { kind: 'fragment', fragment: key } })
          devices++
          continue
        }
        const { origin, plain } = singularOrigin(ctrl, singularLabel)
        const others = entitiesOf(ctrl).filter((e) => !singularLabel.has(String(e.connectionId)) && e.connectionId !== 'internal')
        if (others.length) warnings.push(`${where} mixed Singular with other actions; its ${others.length} other action(s) are not carried. Rebuild that button by hand after conversion.`)
        else if (!plain) warnings.push(`${where} is not the usual two-press Singular toggle; conversion treats its first animate-in as what it shows.`)
        // Inert placeholder: her label and colours, no action, until conversion binds a published cue.
        fragments[key] = {
          kind: 'control', source: `export ${key} (Singular graphic, not yet converted)`, style, options: structuredClone((ctrl.options ?? {}) as JsonObject),
          feedbacks: [], steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } }, localVariables: structuredClone((ctrl.localVariables ?? []) as JsonObject[]),
        }
        buttons.push({ row: R, col: C, spec: { kind: 'fragment', fragment: key }, singular: origin })
        graphics++
      }
    }
    const hasOwnButtons = buttons.some((b) => b.spec.kind !== 'builtin')
    pages.push({ number: n, id: typeof page.id === 'string' && page.id ? page.id : stableId(`${options.workspace}:page:${n}`), name: String(page.name ?? 'PAGE'), template: hasOwnButtons ? 'service' : 'blank', buttons })
  }

  const triggers = toRefs(structuredClone((exported.triggers ?? {}) as JsonObject), 'A trigger')
  const kept: DeckConnection[] = [...stubs.values()]
    .filter((c) => used.has(c.id) && !c.singular)
    .map(({ singular: _s, ...c }) => { void _s; return c })
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const dropped = [...stubs.values()].filter((c) => !kept.some((k) => k.id === c.id)).map((c) => ({
    label: c.label, moduleId: c.moduleId,
    reason: c.singular ? 'Singular.live: no button fires it once the deck is converted to Overlays' : 'no button or trigger uses it',
  }))
  for (const c of kept) if (companionLabel(c.label) !== c.label) warnings.push(`The connection "${c.label}" has a label Companion would change to "${companionLabel(c.label)}"; rename it at the booth first.`)

  const build = String(exported.companionBuild ?? '')
  const release = WORKSPACE_COMPANION[options.workspace].release
  if (!build.startsWith(release)) warnings.push(`The export was made by Companion ${build || 'of an unknown build'}; this workspace's booth is recorded as ${release}.`)
  const data: ExportSeedData = {
    about: 'Derived from a Companion full export. Connections are import-mapping stubs; device fragments name connections by label; Singular graphic buttons are inert placeholders that record what they fired. No connection config or secrets.',
    source: options.source,
    companion: { build, exportVersion: Number(exported.version ?? WORKSPACE_COMPANION[options.workspace].exportVersion) },
    grid,
    connections: kept,
    dropped,
    connectionSettingsDiscarded: discarded,
    pages,
    fragments,
    triggers,
    customVariables: structuredClone((exported.custom_variables ?? {}) as JsonObject),
  }
  assertSanitized(data, 'seed')
  if (CREDENTIAL_TEXT.test(JSON.stringify([data.connections, data.pages, data.fragments, data.triggers, data.customVariables]))) throw new ExportSeedError('export_credential_text', 'A carried button or trigger contains the word password, secret or token. Nothing was stored. Remove it in Companion and export again.')
  const summary: SeedSummary = {
    pages: pages.length, pagesWithButtons: pages.filter((p) => p.template === 'service').length, graphics, devices, builtInNav,
    keptConnections: kept.map((c) => c.label), droppedConnections: dropped.map((d) => d.label), connectionSettingsDiscarded: discarded, warnings,
  }
  return { data, summary }
}

/* ------------------------------------------------------------------- deck --- */

/** The deck a seed describes: her pages, the carried fragments, and the TBI_Overlays connection stub. */
export function deckFromSeedData(data: ExportSeedData, workspace: DeckWorkspace = 'tbi'): CompanionDeck {
  if (workspace !== 'tbi') throw new ExportSeedError('seed_workspace', "Only TBI's deck is seeded from a Companion export; CRC's deck is seeded from its released preset.")
  const overlays: DeckConnection = {
    id: stableId(`${workspace}:connection:${TBI_OVERLAYS_CONNECTION.label}`), label: TBI_OVERLAYS_CONNECTION.label, moduleId: TBI_OVERLAYS_CONNECTION.moduleId,
    moduleVersionId: TBI_OVERLAYS_CONNECTION.moduleVersionId, sortOrder: 0, updatePolicy: 'stable', lastUpgradeIndex: -1, role: 'overlays',
  }
  const deck: CompanionDeck = {
    schema: 1,
    workspace,
    companion: { release: WORKSPACE_COMPANION[workspace].release, build: data.companion.build, exportVersion: data.companion.exportVersion },
    palette: { ...PALETTE },
    switcher: { mergeDurationMs: 1000, presetWaitMs: 1300 },
    grid: { ...data.grid },
    chains: [],
    connections: [overlays, ...structuredClone(data.connections).filter((c) => c.label !== overlays.label)],
    templates: structuredClone(PAGE_TEMPLATES[workspace]),
    pages: structuredClone(data.pages),
    fragments: structuredClone(data.fragments),
    triggers: structuredClone(data.triggers),
    customVariables: structuredClone(data.customVariables),
  }
  assertSanitized(deck, 'deck')
  return deck
}

/** Seed a workspace's deck from export bytes. The bytes and the parsed export are dropped on return. */
export function seedDeckFromExportBytes(bytes: Uint8Array, options: DeriveOptions): { deck: CompanionDeck; data: ExportSeedData; summary: SeedSummary } {
  const exported = readCompanionExport(bytes)
  const { data, summary } = deriveExportSeedData(exported, options)
  return { deck: deckFromSeedData(data, options.workspace), data, summary }
}

/** One page, fragment or connection per line, so the committed file diffs by button. */
export function formatExportSeedData(data: ExportSeedData): string {
  const lines = ['{']
  const entries = Object.entries(data)
  entries.forEach(([k, v], i) => {
    const comma = i === entries.length - 1 ? '' : ','
    if (k === 'fragments' && v && typeof v === 'object') {
      const inner = Object.entries(v as Obj)
      lines.push(`  ${JSON.stringify(k)}: {`)
      inner.forEach(([ik, iv], j) => lines.push(`    ${JSON.stringify(ik)}: ${JSON.stringify(iv)}${j === inner.length - 1 ? '' : ','}`))
      lines.push(`  }${comma}`)
    } else if ((k === 'connections' || k === 'dropped' || k === 'pages') && Array.isArray(v)) {
      lines.push(`  ${JSON.stringify(k)}: [`)
      v.forEach((c, j) => lines.push(`    ${JSON.stringify(c)}${j === v.length - 1 ? '' : ','}`))
      lines.push(`  ]${comma}`)
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`)
  })
  lines.push('}')
  return lines.join('\n') + '\n'
}

/** Simone's deck as her 2026-09-14 export describes it (graphic buttons not yet converted). */
export function seedTbiDeck(data: ExportSeedData): CompanionDeck {
  return deckFromSeedData(data, 'tbi')
}
