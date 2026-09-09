CREATE TABLE IF NOT EXISTS oauth_clients(
 client_id_hash text PRIMARY KEY,
 redirect_uris jsonb NOT NULL,
 client_name text NOT NULL,
 created bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_authorization_requests(
 request_hash text PRIMARY KEY,
 client_id_hash text NOT NULL REFERENCES oauth_clients(client_id_hash),
 redirect_uri text NOT NULL,
 code_challenge text NOT NULL,
 scope text NOT NULL,
 resource text NOT NULL,
 state text,
 expires bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes(
 code_hash text PRIMARY KEY,
 client_id_hash text NOT NULL REFERENCES oauth_clients(client_id_hash),
 redirect_uri text NOT NULL,
 code_challenge text NOT NULL,
 scope text NOT NULL,
 resource text NOT NULL,
 actor text NOT NULL,
 expires bigint NOT NULL,
 used_at bigint
);
CREATE TABLE IF NOT EXISTS oauth_tokens(
 token_hash text PRIMARY KEY,
 family_hash text,
 client_id_hash text NOT NULL REFERENCES oauth_clients(client_id_hash),
 scope text NOT NULL,
 resource text NOT NULL,
 actor text NOT NULL,
 expires bigint NOT NULL,
 revoked_at bigint
);
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS family_hash text;
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens(
 token_hash text PRIMARY KEY,
 family_hash text NOT NULL,
 client_id_hash text NOT NULL REFERENCES oauth_clients(client_id_hash),
 scope text NOT NULL,
 resource text NOT NULL,
 actor text NOT NULL,
 expires bigint NOT NULL,
 used_at bigint,
 revoked_at bigint
);
CREATE TABLE IF NOT EXISTS oauth_rate_limits(
 key_hash text PRIMARY KEY,
 window_start bigint NOT NULL,
 count integer NOT NULL CHECK(count>0)
);
CREATE INDEX IF NOT EXISTS oauth_authorization_requests_expiry ON oauth_authorization_requests(expires);
CREATE INDEX IF NOT EXISTS oauth_codes_expiry ON oauth_codes(expires);
CREATE INDEX IF NOT EXISTS oauth_tokens_expiry ON oauth_tokens(expires);
CREATE INDEX IF NOT EXISTS oauth_tokens_family ON oauth_tokens(family_hash) WHERE family_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_expiry ON oauth_refresh_tokens(expires);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family ON oauth_refresh_tokens(family_hash);
