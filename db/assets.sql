CREATE TABLE IF NOT EXISTS workspace_assets (
  id text PRIMARY KEY CHECK (id ~ '^asset_[a-f0-9]{64}$'),
  name text NOT NULL,
  alt_text text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 524288),
  width integer NOT NULL CHECK (width > 0 AND width <= 4096),
  height integer NOT NULL CHECK (height > 0 AND height <= 4096),
  data bytea NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  archived boolean NOT NULL DEFAULT false,
  published_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_assets_list_idx ON workspace_assets(archived, updated_at DESC);
