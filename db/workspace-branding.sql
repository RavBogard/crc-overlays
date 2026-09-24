-- Workspace branding (lib/branding-store.ts, MCP plan L4 / R-B2), one row per workspace. `document`
-- is a WorkspaceBrandingDocument (lib/branding-palette.ts): only the colours, font roles and
-- artwork a congregation changed; everything else resolves to the built-in workspace identity.
-- Writes are optimistic: the first INSERT names version 0, later UPDATEs name the version they read.
-- Not applied to any database yet (L4); until it is, reads return the built-in branding and writes
-- are refused with a sentence.
CREATE TABLE IF NOT EXISTS workspace_branding (
  workspace_id text PRIMARY KEY,
  document jsonb NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  created_by text NOT NULL,
  updated_by text NOT NULL
);
