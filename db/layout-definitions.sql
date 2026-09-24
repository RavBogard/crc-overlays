-- Layouts as data (MCP plan L2; lib/layout-definitions.ts). One row per version of a workspace's
-- data layout; each workspace has its own database, so rows carry no workspace column, as in
-- authoring_drafts. The built-in four layouts (bottom, left, right, corner) are code and never
-- stored here. `document` is a LayoutDocument (label, capabilities, card, motion) and `sha256` is
-- the hash of its canonical JSON, which a published graphic pins as layoutRef{id, version, sha256}.
-- A published row is never updated: an edit writes version N+1 as a draft, and only the newest
-- version may be a draft. Not applied to any database yet; L3 wires the Postgres repository.
CREATE TABLE IF NOT EXISTS layout_definitions (
  id text NOT NULL CHECK (id ~ '^[a-z][a-z0-9_-]{0,39}$' AND id NOT IN ('bottom', 'left', 'right', 'corner')),
  version integer NOT NULL CHECK (version >= 1),
  document jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  PRIMARY KEY (id, version)
);
-- At most one draft per layout (the newest version).
CREATE UNIQUE INDEX IF NOT EXISTS layout_definitions_one_draft ON layout_definitions (id) WHERE status = 'draft';
