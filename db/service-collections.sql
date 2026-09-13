CREATE TABLE IF NOT EXISTS service_collections (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  archived boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS service_collections_active_idx ON service_collections(archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS beta_feedback (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  archived boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS beta_feedback_active_idx ON beta_feedback(archived, updated_at DESC);
