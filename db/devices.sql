-- Device credentials (Phase C, S1/D1). A paired Companion or graphics output holds a
-- credential of its own, so a device keeps working when a human session expires, a
-- password changes or Google is unavailable. Additive and idempotent, like db/access.sql.
-- Applied after access.sql because created_by references access_members(id).
--
-- Only sha256(secret) is stored; the token is shown once, at creation, and lookup is by
-- the credential id (the primary key), never by scanning the secret column.
-- created_by is nullable: a legacy CONTROL_KEY actor has no member row.
CREATE TABLE IF NOT EXISTS device_credentials (
 id text PRIMARY KEY,
 name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('companion','output')),
 secret_hash text NOT NULL,
 created_by text REFERENCES access_members(id),
 created_at bigint NOT NULL,
 last_seen_at bigint,
 revoked_at bigint
);

-- Six-digit pairing codes (D6). The code itself is never stored; the row is keyed by
-- sha256 of the code. Single use is one atomic UPDATE ... RETURNING on redeemed_at,
-- with a ten-minute expiry and at most five attempts per code.
CREATE TABLE IF NOT EXISTS device_pairing_codes (
 code_hash text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('companion','output')),
 name text NOT NULL,
 created_by text REFERENCES access_members(id),
 created_at bigint NOT NULL,
 expires_at bigint NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 redeemed_at bigint,
 credential_id text
);

CREATE INDEX IF NOT EXISTS device_pairing_codes_open ON device_pairing_codes(expires_at) WHERE redeemed_at IS NULL;
