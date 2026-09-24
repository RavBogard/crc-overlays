-- TBI redo foundation (lib/build-keys.ts). What each caller-chosen build key became in this
-- workspace: a local source, a draft or a draft set. Written by import_local_sources and
-- batch_create_drafts, read by apply_deck_plan. Additive; nothing else reads it.
CREATE TABLE IF NOT EXISTS build_keys (
  workspace_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('local-source','draft','draft-set')),
  key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'),
  target_id text NOT NULL,
  created_by text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (workspace_id, kind, key)
);
