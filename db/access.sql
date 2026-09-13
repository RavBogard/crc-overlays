CREATE TABLE IF NOT EXISTS access_members (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','editor','operator')),
 enabled boolean NOT NULL DEFAULT true, created_at bigint NOT NULL,
 password_hash text
);
ALTER TABLE access_members ADD COLUMN IF NOT EXISTS password_hash text;
CREATE TABLE IF NOT EXISTS access_links (
 token_hash text PRIMARY KEY, member_id text NOT NULL REFERENCES access_members(id),
 expires_at bigint NOT NULL, used_at bigint,
 pending_name text, pending_role text CHECK(pending_role IN ('owner','editor','operator')),
 reset_password boolean NOT NULL DEFAULT false
);
ALTER TABLE access_links ADD COLUMN IF NOT EXISTS pending_name text;
ALTER TABLE access_links ADD COLUMN IF NOT EXISTS pending_role text;
ALTER TABLE access_links ADD COLUMN IF NOT EXISTS reset_password boolean NOT NULL DEFAULT false;
DO $$ BEGIN
 ALTER TABLE access_links ADD CONSTRAINT access_links_pending_role_check CHECK(pending_role IN ('owner','editor','operator'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
UPDATE access_links l SET pending_name=m.name,pending_role=m.role FROM access_members m WHERE l.member_id=m.id AND (l.pending_name IS NULL OR l.pending_role IS NULL);
ALTER TABLE access_links ALTER COLUMN pending_name SET NOT NULL;
ALTER TABLE access_links ALTER COLUMN pending_role SET NOT NULL;
CREATE TABLE IF NOT EXISTS access_sessions (
 token_hash text PRIMARY KEY, member_id text NOT NULL REFERENCES access_members(id),
 expires_at bigint NOT NULL, created_at bigint NOT NULL,
 auth_method text NOT NULL DEFAULT 'invite' CHECK(auth_method IN ('invite','password','bootstrap')),
 authenticated_at bigint NOT NULL
);
ALTER TABLE access_sessions ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'invite';
DO $$ BEGIN
 ALTER TABLE access_sessions ADD CONSTRAINT access_sessions_auth_method_check CHECK(auth_method IN ('invite','password','bootstrap'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE access_sessions ADD COLUMN IF NOT EXISTS authenticated_at bigint;
UPDATE access_sessions SET authenticated_at=created_at WHERE authenticated_at IS NULL;
ALTER TABLE access_sessions ALTER COLUMN authenticated_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS access_sessions_expiry ON access_sessions(expires_at);
CREATE TABLE IF NOT EXISTS access_attempts (
 identity text PRIMARY KEY, window_start bigint NOT NULL, attempts integer NOT NULL
);
CREATE INDEX IF NOT EXISTS access_attempts_window ON access_attempts(window_start);
