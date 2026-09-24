-- The stored Companion deck (lib/companion-deck), one row per workspace. `document` is a CompanionDeck:
-- connection import-mapping stubs only, never a connection's config or secrets. Writes are optimistic:
-- UPDATE ... WHERE workspace_id = $1 AND version = $expected, and zero rows means a version conflict.
-- Not applied to any database yet (C1); C3 wires the Postgres repository.
CREATE TABLE IF NOT EXISTS companion_decks (
  workspace_id text PRIMARY KEY CHECK (workspace_id IN ('crc', 'tbi')),
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
