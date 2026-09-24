// Postgres storage for the per-workspace deck (db/companion-decks.sql), beside the in-memory repository.
// Same contract: one row per workspace, created at version 1, replaced only while its stored version is
// still the one the writer read (UPDATE ... WHERE version = $expected; zero rows is a conflict).
import { assertSanitized, type CompanionDeck, type DeckWorkspace } from './model.ts'
import { DeckConflictError, type CompanionDeckRepository, type StoredDeck } from './repository.ts'

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }
type Row = { workspace_id: DeckWorkspace; document: CompanionDeck; version: number; created_at: number; updated_at: number; created_by: string; updated_by: string }

const COLUMNS = 'workspace_id,document,version,created_at,updated_at,created_by,updated_by'
const stored = (row: Row): StoredDeck => ({
  workspace: row.workspace_id, version: Number(row.version), deck: row.document,
  createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), createdBy: row.created_by, updatedBy: row.updated_by,
})

function checkDeck(workspace: DeckWorkspace, deck: CompanionDeck) {
  if (deck.workspace !== workspace) throw new Error(`a ${deck.workspace} deck cannot be stored for ${workspace}`)
  assertSanitized(deck, 'deck')
}

export class PgCompanionDeckRepository implements CompanionDeckRepository {
  /** `connection` defaults to the app's pool, loaded only when a query runs. */
  constructor(private connection?: Queryable) {}

  private async db(): Promise<Queryable> {
    if (!this.connection) this.connection = (await import('../database')).db
    return this.connection
  }

  async get(workspace: DeckWorkspace) {
    const r = await (await this.db()).query(`SELECT ${COLUMNS} FROM companion_decks WHERE workspace_id=$1`, [workspace])
    const row = r.rows[0] as Row | undefined
    return row ? stored(row) : null
  }

  async create(workspace: DeckWorkspace, deck: CompanionDeck, actor: string, now: number) {
    checkDeck(workspace, deck)
    const r = await (await this.db()).query(
      `INSERT INTO companion_decks(${COLUMNS}) VALUES($1,$2,1,$3,$3,$4,$4) ON CONFLICT (workspace_id) DO NOTHING RETURNING ${COLUMNS}`,
      [workspace, deck, now, actor],
    )
    const row = r.rows[0] as Row | undefined
    if (!row) throw new DeckConflictError(workspace)
    return stored(row)
  }

  async replace(workspace: DeckWorkspace, deck: CompanionDeck, expectedVersion: number, actor: string, now: number) {
    checkDeck(workspace, deck)
    const r = await (await this.db()).query(
      `UPDATE companion_decks SET document=$2,version=version+1,updated_at=$3,updated_by=$4 WHERE workspace_id=$1 AND version=$5 RETURNING ${COLUMNS}`,
      [workspace, deck, now, actor, expectedVersion],
    )
    const row = r.rows[0] as Row | undefined
    if (!row) throw new DeckConflictError(workspace)
    return stored(row)
  }
}
