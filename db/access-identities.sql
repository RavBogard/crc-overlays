CREATE TABLE IF NOT EXISTS access_identities (
 provider text NOT NULL CHECK(provider IN ('google')),
 issuer text NOT NULL, subject text NOT NULL,
 member_id text NOT NULL REFERENCES access_members(id),
 email_at_link text NOT NULL, linked_at bigint NOT NULL, last_used_at bigint,
 PRIMARY KEY(provider,issuer,subject), UNIQUE(member_id,provider)
);
CREATE TABLE IF NOT EXISTS access_sign_in_flows (
 token_hash text PRIMARY KEY, payload jsonb NOT NULL, expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS access_sign_in_flows_expiry ON access_sign_in_flows(expires_at);
