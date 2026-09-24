-- TBI redo G1 (lib/imports.ts). A file a person dropped on a short-lived signed page, read by an
-- agent by importId. The token is stored only as its sha256. JSON and CSV at most 2 MB, images 5 MB.
-- Kept 7 days (expires_at); swept on the next open. Additive; nothing else reads it.
CREATE TABLE IF NOT EXISTS workspace_imports (
  id text PRIMARY KEY CHECK (id ~ '^import_[a-f0-9]{32}$'),
  workspace_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('singular-extract','local-sources','asset','deck-plan')),
  token_sha256 text NOT NULL UNIQUE,
  link_expires_at bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('waiting','receiving','ready','refused')),
  file_name text,
  media_type text,
  total_bytes integer CHECK (total_bytes IS NULL OR (total_bytes > 0 AND total_bytes <= 5242880)),
  received_bytes integer NOT NULL DEFAULT 0,
  next_chunk integer NOT NULL DEFAULT 0,
  sha256 text,
  refusal text,
  note text,
  data bytea NOT NULL DEFAULT ''::bytea,
  created_by text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_imports_created_idx ON workspace_imports(workspace_id, created_at DESC);
