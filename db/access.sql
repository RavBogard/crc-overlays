CREATE TABLE IF NOT EXISTS access_members (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','editor','operator')),
 enabled boolean NOT NULL DEFAULT true, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS access_links (
 token_hash text PRIMARY KEY, member_id text NOT NULL REFERENCES access_members(id),
 expires_at bigint NOT NULL, used_at bigint
);
CREATE TABLE IF NOT EXISTS access_sessions (
 token_hash text PRIMARY KEY, member_id text NOT NULL REFERENCES access_members(id),
 expires_at bigint NOT NULL, created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS access_sessions_expiry ON access_sessions(expires_at);
CREATE TABLE IF NOT EXISTS access_attempts (
 identity text PRIMARY KEY, window_start bigint NOT NULL, attempts integer NOT NULL
);
