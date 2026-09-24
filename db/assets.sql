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

-- R-B1: chunked uploads over the MCP (upload_asset begin/append/commit). One row per open upload,
-- its chunks concatenated in order; commit assembles and validates the image and deletes the row,
-- and begin sweeps expired rows. At most 20 are open at once. Until this runs, upload_asset
-- answers that uploading over the connection is not set up yet; the web upload is unaffected.
CREATE TABLE IF NOT EXISTS workspace_asset_uploads (
  id text PRIMARY KEY CHECK (id ~ '^upload_[a-f0-9]{32}$'),
  name text NOT NULL,
  alt_text text NOT NULL,
  total_bytes integer NOT NULL CHECK (total_bytes > 0 AND total_bytes <= 524288),
  received_bytes integer NOT NULL CHECK (received_bytes >= 0 AND received_bytes <= total_bytes),
  next_chunk integer NOT NULL CHECK (next_chunk >= 0),
  data bytea NOT NULL,
  created_by text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
