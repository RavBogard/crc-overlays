-- One folder tree per congregation. Assignments are metadata keyed by cue ID; no cue or
-- publication row changes when a graphic is moved, renamed, or unfiled.
CREATE TABLE IF NOT EXISTS workspace_library_folders (
  workspace_id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
