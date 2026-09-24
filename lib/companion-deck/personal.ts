// The operator's personal Companion file (docs/planning/2026-09-24-tbi-setup-page/PLAN.md, S2): the stored
// deck rendered, its connections filled from the workspace's backup-derived values, and the Overlays
// connection already paired with a freshly minted device token. This is the one deliberate exception to
// "a deck never carries connection config" (export.ts), and it stays narrow:
//   - the stored deck still holds labels only (assertSanitized), and every MCP export still renders
//     through fullExport, which never reads this module or the values;
//   - the values live in one server secret, COMPANION_CONNECTION_VALUES, set from the named connections
//     of one backup by scripts/set-connection-values.mjs and nothing else of that file;
//   - they are merged only into the bytes of one download (app/api/setup/companion), never logged,
//     cached or returned anywhere else. tests/setup-personal-deck.test.ts proves each of these.
import { encodeCompanionConfig, renderDeck, type CompanionExport } from './render.ts'
import { sha256 } from './export.ts'
import type { CompanionDeck } from './model.ts'

export const VALUES_ENV = 'COMPANION_CONNECTION_VALUES'

type Obj = Record<string, unknown>
/** One connection's settings from the backup: exactly its `config` and `secrets`, keyed by label and module. */
export type ConnectionValues = { label: string; moduleId: string; config: Obj; secrets: Obj }
export type ValuesSecret = { v: 1; source: string; connections: ConnectionValues[] }

const plain = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * The secret, base64url JSON (so no shell or dashboard quoting touches it). Null when unset; throws a
 * sentence (never the value) when it is set but unreadable.
 */
export function readConnectionValues(env: Record<string, string | undefined> = process.env): ValuesSecret | null {
  const raw = env[VALUES_ENV]?.trim()
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) } catch { throw new Error(`${VALUES_ENV} is not base64url JSON`) }
  if (!plain(parsed) || parsed.v !== 1 || typeof parsed.source !== 'string' || !Array.isArray(parsed.connections)) throw new Error(`${VALUES_ENV} has the wrong shape`)
  const connections = parsed.connections.map((c) => {
    if (!plain(c) || typeof c.label !== 'string' || typeof c.moduleId !== 'string' || !plain(c.config) || (c.secrets !== undefined && !plain(c.secrets))) throw new Error(`${VALUES_ENV} has a connection of the wrong shape`)
    return { label: c.label, moduleId: c.moduleId, config: c.config, secrets: plain(c.secrets) ? c.secrets : {} }
  })
  const labels = new Set<string>()
  for (const c of connections) { if (labels.has(c.label)) throw new Error(`${VALUES_ENV} names a connection twice`); labels.add(c.label) }
  return { v: 1, source: parsed.source, connections }
}

export type PersonalOptions = {
  values: ValuesSecret | null
  /** The labels whose values the file must carry; 'deck' means every deck connection but Overlays and `noValues`. */
  valueLabels: 'deck' | readonly string[]
  noValues: readonly string[]
  /** TBI's full reset imports each connection as the file says, so a filled connection arrives enabled. CRC keeps his own. */
  enableFilled: boolean
  overlays: { baseUrl: string; deviceToken: string }
}

export class PersonalDeckError extends Error { override name = 'PersonalDeckError' }

/** The labels a flow's file must fill, in the deck's rendered order. */
export function labelsToFill(exported: CompanionExport, overlaysId: string, valueLabels: PersonalOptions['valueLabels'], noValues: readonly string[]): string[] {
  const rendered = Object.entries(exported.instances).filter(([id]) => id !== overlaysId).map(([, c]) => String(c.label))
  return valueLabels === 'deck' ? rendered.filter((l) => !noValues.includes(l)) : rendered.filter((l) => valueLabels.includes(l))
}

/** Render, fill and pair. Pure: the token is minted by the caller, and nothing here logs. */
export function personalExport(deck: CompanionDeck, options: PersonalOptions) {
  const exported = renderDeck(deck)
  const overlays = deck.connections.find((c) => c.role === 'overlays')
  if (!overlays || !exported.instances[overlays.id]) throw new PersonalDeckError('The deck has no Overlays connection to pair.')
  const wanted = labelsToFill(exported, overlays.id, options.valueLabels, options.noValues)
  const missing: string[] = [], filled: string[] = []
  for (const [id, instance] of Object.entries(exported.instances)) {
    if (id === overlays.id) {
      exported.instances[id] = { ...instance, config: { baseUrl: options.overlays.baseUrl, pairingCode: '' }, secrets: { deviceToken: options.overlays.deviceToken, controlKey: '' }, enabled: true }
      continue
    }
    const label = String(instance.label)
    if (!wanted.includes(label)) continue
    const value = options.values?.connections.find((c) => c.label === label && c.moduleId === instance.moduleId)
    if (!value) { missing.push(label); continue }
    exported.instances[id] = { ...instance, config: structuredClone(value.config), secrets: structuredClone(value.secrets), ...(options.enableFilled ? { enabled: true } : {}) }
    filled.push(label)
  }
  if (missing.length) throw new PersonalDeckError(`This deployment has no saved settings for ${missing.join(', ')}, so the file would arrive without them.`)
  const bytes = encodeCompanionConfig(exported)
  return { exported, bytes, sha256: sha256(bytes), filled, connections: Object.keys(exported.instances).length }
}

/** "TBI Companion for Simone (deck v14, 2026-09-24).companionconfig" */
export function personalFileName(label: string, version: number, now: number) {
  return `${label.replace(/[^A-Za-z0-9 ._-]/g, '')} (deck v${version}, ${new Date(now).toISOString().slice(0, 10)}).companionconfig`
}
