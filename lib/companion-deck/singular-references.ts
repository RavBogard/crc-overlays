// Singular.live reference material (Track T3): what each Singular composition showed, kept beside the
// conversion so every row can show the old text next to the proposed graphic, and so matching can
// compare text, not only names.
//
// A "Singular extract" is the JSON the first conversion pass pulled from Singular's control model
// (Claude outputs/singular-extract-summary.md, 15 September 2026): apps, each with its sub-compositions,
// each with its id, name, layer (logicLayer.name) and field values. import_singular_extract takes it in
// exactly that shape (SINGULAR_EXTRACT below) and stores only app, name, layer and text per composition.
// That extract was pulled through Singular control URLs that embed a token, so anything that looks like
// a credential (a token, password, key or control link, anywhere in the input) is refused before
// anything else is read, and nothing of the kind is ever stored.
import { z } from 'zod/v4'
import type { DeckWorkspace } from './model.ts'

/* ------------------------------------------------------------------ format --- */

const ASSET_ID = /^asset_[a-f0-9]{64}$/
export const singularExtractField = z.object({
  title: z.string().max(200).optional(),
  type: z.string().max(60).optional(),
  value: z.unknown().optional(),
}).strict()
export const singularExtractComposition = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  parentApp: z.string().max(200).optional(),
  template: z.string().max(120).nullable().optional(),
  layer: z.string().max(80).nullable(),
  fields: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,60}$/), singularExtractField).default({}),
  notes: z.unknown().optional(),
  imageAssetId: z.string().regex(ASSET_ID, { message: 'imageAssetId is an asset id from list_assets (asset_ followed by 64 hex characters).' }).optional()
    .describe('Optional: a picture of the old slide, uploaded with upload_asset, shown beside the proposed graphic.'),
}).strict()
export const singularExtractApp = z.object({
  label: z.string().min(1).max(80).describe("The Companion connection label that fires this app, e.g. 'kab'."),
  name: z.string().max(200).optional(),
  id: z.string().max(120).optional(),
  subcompositions: z.array(singularExtractComposition).min(1).max(600),
}).strict()
/** The extract, as the first pass wrote it: `{apps:[{label, name, id, subcompositions:[...]}]}`. */
export const SINGULAR_EXTRACT = z.object({
  apps: z.array(singularExtractApp).min(1).max(12),
  extractedAt: z.string().max(40).optional(),
}).strict()
export type SingularExtract = z.infer<typeof SINGULAR_EXTRACT>

/* ------------------------------------------------------------- credentials --- */

const CREDENTIAL_KEY = /token|secret|passw|passphrase|api[-_]?key|authorization|credential|cookie|session[-_]?id|private[-_]?key|bearer/i
const CREDENTIAL_TEXT: RegExp[] = [
  /apiv\d+\/control\//i, // a Singular control link: the token is the next path segment
  /app\.singular\.live\/(?:apiv\d+|control)/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /[?&](?:token|key|apikey|api_key|access_token|secret|password)=/i,
  /\b(?:password|passwd|secret|token)\s*[:=]\s*\S+/i,
]

/** Where the first credential-like key or value sits in `value`, or null. Values are never echoed. */
export function findCredential(value: unknown, path = 'extract'): string | null {
  if (typeof value === 'string') return CREDENTIAL_TEXT.some((re) => re.test(value)) ? path : null
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const hit = findCredential(value[i], `${path}[${i}]`); if (hit) return hit }
    return null
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEY.test(key)) return `${path}.${key}`
    const hit = findCredential(item, `${path}.${key}`)
    if (hit) return hit
  }
  return null
}

/* ----------------------------------------------------------------- records --- */

/** One Singular composition as reference material: no field ids, styling, notes or links. */
export type SingularReference = {
  app: string
  compId: string
  name: string
  layer: string | null
  /** Title, accent title and text, in that order, one per line; whitespace tidied, wording untouched. */
  text: string
  imageAssetId?: string
}
export type SingularReferenceApp = { label: string; name: string | null; importedAt: number; importedBy: string; compositions: SingularReference[] }
export type SingularReferenceDocument = { apps: SingularReferenceApp[] }
export type StoredSingularReferences = {
  workspace: DeckWorkspace
  version: number
  document: SingularReferenceDocument
  createdAt: number
  updatedAt: number
  createdBy: string
  updatedBy: string
}

// Bidi and zero-width controls Singular authors used for layout; they carry no wording.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g
/** Singular's whitespace-hack indentation collapsed (as the first pass's collapse_ws), line breaks kept. */
export function tidyText(value: string): string {
  return value.replace(INVISIBLE, '').replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ')
    .split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
const fieldText = (fields: Record<string, { value?: unknown }>, id: string) => {
  const v = fields[id]?.value
  return typeof v === 'string' ? tidyText(v) : ''
}
export function referenceRecords(app: SingularExtract['apps'][number]): SingularReference[] {
  return app.subcompositions.map((c) => {
    const parts = [fieldText(c.fields, 'title'), fieldText(c.fields, 'titleAccent') || fieldText(c.fields, 'accentText'), fieldText(c.fields, 'text')]
    return {
      app: app.label, compId: c.id, name: tidyText(c.name), layer: c.layer ?? null,
      text: parts.filter((p, i) => p && parts.indexOf(p) === i).join('\n'),
      ...(c.imageAssetId ? { imageAssetId: c.imageAssetId } : {}),
    }
  })
}

const key = (app: string, name: string) => `${app}\u0000${String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`
/** Look up the reference for what a button fires: by app label and composition name (case and spacing ignored). */
export function referenceIndex(document: SingularReferenceDocument | null | undefined): Map<string, SingularReference> {
  const index = new Map<string, SingularReference>()
  for (const app of document?.apps ?? []) for (const c of app.compositions) if (!index.has(key(c.app, c.name))) index.set(key(c.app, c.name), c)
  return index
}
export const referenceKey = key

/* ------------------------------------------------------- draft reference --- */

/** What the old deck showed, as a conversion row carries it and a draft created from the row keeps it. */
export type DraftReference = { origin: string; app?: string; comp?: string; text: string; imageAssetId?: string }
export const MAX_REFERENCE_TEXT = 4000
export const draftReferenceSchema = z.object({
  origin: z.string().min(1).max(80).describe("Where the old material came from, e.g. 'singular'."),
  app: z.string().min(1).max(160).optional(),
  comp: z.string().min(1).max(200).optional(),
  text: z.string().max(MAX_REFERENCE_TEXT).describe('The old text, as it was shown.'),
  imageAssetId: z.string().regex(ASSET_ID).optional(),
}).strict()

/** A reference passed to create_draft, checked strictly; the message is a sentence. */
export function parseDraftReference(value: unknown): DraftReference | undefined {
  if (value === undefined) return undefined
  const parsed = draftReferenceSchema.safeParse(value)
  if (!parsed.success) throw new Error(`reference needs origin and text (at most ${MAX_REFERENCE_TEXT} characters), with optional app, comp and imageAssetId, and nothing else.`)
  const hit = findCredential(parsed.data, 'reference')
  if (hit) throw new Error(`reference looks like it carries a credential (${hit}); leave out tokens, passwords and control links.`)
  return parsed.data
}

/** A row's reference from its stored composition (or just its name, before an extract is imported). */
export function referenceFor(app: string, comp: string, record: SingularReference | undefined): DraftReference {
  let text = record?.text ?? ''
  if (text.length > MAX_REFERENCE_TEXT) text = `${text.slice(0, MAX_REFERENCE_TEXT - 1).replace(/\s+\S*$/, '')}…`
  return { origin: 'singular', app, comp: record?.name ?? comp, text, ...(record?.imageAssetId ? { imageAssetId: record.imageAssetId } : {}) }
}

/* -------------------------------------------------------------- repository --- */

export class SingularReferenceConflictError extends Error {
  readonly code = 'version_conflict'
  readonly status = 409
  constructor(workspace: string) { super(`The ${workspace === 'tbi' ? 'TBI' : 'CRC'} Singular reference material changed in another session. Run the dry run again and retry with the new version.`) }
}

export interface SingularReferenceRepository {
  get(workspace: DeckWorkspace): Promise<StoredSingularReferences | null>
  /** Store the document: `expectedVersion` null creates version 1; otherwise the stored version must still be it. */
  put(workspace: DeckWorkspace, document: SingularReferenceDocument, expectedVersion: number | null, actor: string, now: number): Promise<StoredSingularReferences>
}

function assertClean(document: SingularReferenceDocument) {
  const hit = findCredential(document, 'document')
  if (hit) throw new Error(`refusing to store reference material with a credential-like value at ${hit}`)
}

export class MemorySingularReferenceRepository implements SingularReferenceRepository {
  private rows = new Map<DeckWorkspace, StoredSingularReferences>()
  async get(workspace: DeckWorkspace) { const row = this.rows.get(workspace); return row ? structuredClone(row) : null }
  async put(workspace: DeckWorkspace, document: SingularReferenceDocument, expectedVersion: number | null, actor: string, now: number) {
    assertClean(document)
    const current = this.rows.get(workspace)
    if (expectedVersion === null ? current : !current || current.version !== expectedVersion) throw new SingularReferenceConflictError(workspace)
    const row: StoredSingularReferences = current
      ? { ...current, version: current.version + 1, document: structuredClone(document), updatedAt: now, updatedBy: actor }
      : { workspace, version: 1, document: structuredClone(document), createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor }
    this.rows.set(workspace, row)
    return structuredClone(row)
  }
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }
type Row = { workspace_id: DeckWorkspace; document: SingularReferenceDocument; version: number; created_at: number; updated_at: number; created_by: string; updated_by: string }
const COLUMNS = 'workspace_id,document,version,created_at,updated_at,created_by,updated_by'
const stored = (row: Row): StoredSingularReferences => ({
  workspace: row.workspace_id, version: Number(row.version), document: row.document,
  createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), createdBy: row.created_by, updatedBy: row.updated_by,
})

/** Postgres storage (db/singular-references.sql, not applied yet): one row per workspace, optimistic version. */
export class PgSingularReferenceRepository implements SingularReferenceRepository {
  private connection: Queryable | undefined
  constructor(connection?: Queryable) { this.connection = connection }
  private async db(): Promise<Queryable> {
    if (!this.connection) this.connection = (await import('../database')).db
    return this.connection
  }
  async get(workspace: DeckWorkspace) {
    const r = await (await this.db()).query(`SELECT ${COLUMNS} FROM singular_references WHERE workspace_id=$1`, [workspace])
    const row = r.rows[0] as Row | undefined
    return row ? stored(row) : null
  }
  async put(workspace: DeckWorkspace, document: SingularReferenceDocument, expectedVersion: number | null, actor: string, now: number) {
    assertClean(document)
    const r = expectedVersion === null
      ? await (await this.db()).query(`INSERT INTO singular_references(${COLUMNS}) VALUES($1,$2,1,$3,$3,$4,$4) ON CONFLICT (workspace_id) DO NOTHING RETURNING ${COLUMNS}`, [workspace, document, now, actor])
      : await (await this.db()).query(`UPDATE singular_references SET document=$2,version=version+1,updated_at=$3,updated_by=$4 WHERE workspace_id=$1 AND version=$5 RETURNING ${COLUMNS}`, [workspace, document, now, actor, expectedVersion])
    const row = r.rows[0] as Row | undefined
    if (!row) throw new SingularReferenceConflictError(workspace)
    return stored(row)
  }
}

const rehearsalReferences = new MemorySingularReferenceRepository()
/** In memory in rehearsal (CRC_AUTHORING_REHEARSAL=1), Postgres otherwise. */
export function defaultSingularReferenceRepository(): SingularReferenceRepository {
  return process.env.CRC_AUTHORING_REHEARSAL === '1' ? rehearsalReferences : new PgSingularReferenceRepository()
}

/** A Postgres "relation does not exist" (the table was never created) as the sentence a tool returns. */
export const REFERENCE_STORE_MISSING = 'The Singular reference store is not set up on this deployment yet (db/singular-references.sql has not been applied). Nothing was imported.'
export const isMissingTable = (error: unknown) => (error as { code?: string } | null)?.code === '42P01'
