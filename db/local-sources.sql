-- T2: workspace-owned sources (lib/local-sources.ts). One row per source a congregation entered itself
-- (a prayer-book page, a song setting), scoped by workspace. `document` is a LocalSourceRecord: blocks of
-- he / tr / en, attribution and licence text exactly as entered, and the printed position {book, page}.
-- These rows are never exported: the shared library skips every cue built on a `local:` source.
-- Writes are optimistic: UPDATE ... WHERE workspace_id = $1 AND id = $2 AND version = $expected, and zero
-- rows means a version conflict. Not applied to any database yet.
CREATE TABLE IF NOT EXISTS local_sources (
  workspace_id text NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 80),
  id text NOT NULL CHECK (id ~ '^local:[0-9a-f-]{36}$'),
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS local_sources_updated_idx ON local_sources(workspace_id, updated_at DESC);
