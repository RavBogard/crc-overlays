// Storage for the per-workspace deck (db/companion-decks.sql). One deck per workspace, written with an
// optimistic `version`: a write names the version it read, and a stale write is refused, not merged.
import { assertSanitized, type CompanionDeck, type DeckWorkspace } from './model.ts'

export type StoredDeck = {
  workspace: DeckWorkspace
  version: number
  deck: CompanionDeck
  createdAt: number
  updatedAt: number
  createdBy: string
  updatedBy: string
}

export class DeckConflictError extends Error {
  readonly code = 'version_conflict'
  readonly status = 409
  constructor(workspace: string) {
    super(`The ${workspace} Companion deck changed in another session. Read it again and retry with the new version.`)
  }
}

export interface CompanionDeckRepository {
  get(workspace: DeckWorkspace): Promise<StoredDeck | null>
  /** Store the first deck for a workspace (version 1). Refused when one already exists. */
  create(workspace: DeckWorkspace, deck: CompanionDeck, actor: string, now: number): Promise<StoredDeck>
  /** Replace the deck when its stored version is still `expectedVersion`; the new version is one higher. */
  replace(workspace: DeckWorkspace, deck: CompanionDeck, expectedVersion: number, actor: string, now: number): Promise<StoredDeck>
}

function checkDeck(workspace: DeckWorkspace, deck: CompanionDeck) {
  if (deck.workspace !== workspace) throw new Error(`a ${deck.workspace} deck cannot be stored for ${workspace}`)
  assertSanitized(deck.connections, 'deck.connections')
}

export class MemoryCompanionDeckRepository implements CompanionDeckRepository {
  private rows = new Map<DeckWorkspace, StoredDeck>()

  async get(workspace: DeckWorkspace) {
    const row = this.rows.get(workspace)
    return row ? structuredClone(row) : null
  }

  async create(workspace: DeckWorkspace, deck: CompanionDeck, actor: string, now: number) {
    checkDeck(workspace, deck)
    if (this.rows.has(workspace)) throw new DeckConflictError(workspace)
    const row: StoredDeck = { workspace, version: 1, deck: structuredClone(deck), createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor }
    this.rows.set(workspace, row)
    return structuredClone(row)
  }

  async replace(workspace: DeckWorkspace, deck: CompanionDeck, expectedVersion: number, actor: string, now: number) {
    checkDeck(workspace, deck)
    const current = this.rows.get(workspace)
    if (!current || current.version !== expectedVersion) throw new DeckConflictError(workspace)
    const row: StoredDeck = { ...current, version: current.version + 1, deck: structuredClone(deck), updatedAt: now, updatedBy: actor }
    this.rows.set(workspace, row)
    return structuredClone(row)
  }
}
