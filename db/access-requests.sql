-- Access requests: someone signed in with Google but is not a member of this workspace.
-- The row holds only what an administrator needs to decide (who, which address, when);
-- nothing is granted until an administrator approves it, and approval creates or
-- re-enables the member and binds the identity in one transaction, deleting the row.
-- Declining deletes the row; a later attempt starts a new request.
CREATE TABLE IF NOT EXISTS access_requests (
 id text NOT NULL UNIQUE,
 provider text NOT NULL CHECK(provider IN ('google')),
 issuer text NOT NULL, subject text NOT NULL,
 email text NOT NULL, name text NOT NULL,
 requested_at bigint NOT NULL, last_seen_at bigint NOT NULL, attempts integer NOT NULL DEFAULT 1,
 PRIMARY KEY(provider,issuer,subject)
);
