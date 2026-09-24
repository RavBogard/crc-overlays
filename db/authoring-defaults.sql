-- House authoring defaults (lib/authoring-defaults.ts, T1), one row per workspace. `document` is an
-- AuthoringDefaults object: typography, row order, translation choice, arrangement and the layout rule.
-- Writes are optimistic: the first INSERT names version 0, later UPDATEs name the version they read.
-- Not applied to any database yet (T1); until it is, reads return no defaults and writes are refused.
CREATE TABLE IF NOT EXISTS authoring_defaults (
  workspace_id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
