CREATE TABLE IF NOT EXISTS authoring_drafts (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  active_revision integer,
  active_draft_version integer,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS authoring_previews (
  id text PRIMARY KEY,
  draft_id text NOT NULL REFERENCES authoring_drafts(id) ON DELETE CASCADE,
  draft_version integer NOT NULL,
  cue_hash text NOT NULL,
  cue jsonb NOT NULL,
  validation jsonb NOT NULL,
  review jsonb,
  created_at bigint NOT NULL,
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS authoring_revisions (
  draft_id text NOT NULL REFERENCES authoring_drafts(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  draft_version integer NOT NULL,
  cue_hash text NOT NULL,
  cue jsonb NOT NULL,
  preview_id text REFERENCES authoring_previews(id) ON DELETE RESTRICT,
  review jsonb,
  actor text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (draft_id, revision),
  UNIQUE (draft_id, draft_version, cue_hash)
);

-- Wave 2 item 7b. The producer commit a revision's sources came from, recorded here rather than
-- on cue.authoring: that object is inside cueHash and inside sourcePinFor, which assertSourcePin
-- and the shared-library import compare with sameStructuredValue, so a field added there would move
-- every hash and refuse existing drafts on the first publish after deploy. A set, because the legacy
-- pack and the generated library each carry their own commit; NULL for a local cue with no upstream
-- source, and NULL on every revision published before this column existed.
ALTER TABLE authoring_revisions ADD COLUMN IF NOT EXISTS source_commits text[];

CREATE INDEX IF NOT EXISTS authoring_drafts_updated_idx ON authoring_drafts(updated_at DESC);
CREATE INDEX IF NOT EXISTS authoring_previews_draft_idx ON authoring_previews(draft_id, draft_version);
