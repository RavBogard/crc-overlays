-- Singular.live reference material (Track T3, lib/companion-deck/singular-references.ts), one row per
-- workspace. `document` is {apps:[{label, name, importedAt, importedBy, compositions:[{app, compId,
-- name, layer, text, imageAssetId?}]}]}: what each old Singular composition showed, never a control
-- link, token or password (the import refuses those, and the repository re-checks before writing).
-- Writes are optimistic: UPDATE ... WHERE workspace_id = $1 AND version = $expected; zero rows is a
-- version conflict. Not applied to any database yet; until it is, import_singular_extract says so.
CREATE TABLE IF NOT EXISTS singular_references (
  workspace_id text PRIMARY KEY CHECK (workspace_id IN ('crc', 'tbi')),
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
