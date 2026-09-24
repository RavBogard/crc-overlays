-- The Setup page's graphics URL, shown again on a later visit (docs/planning/2026-09-24-tbi-setup-page/
-- PLAN.md). A graphics output's token is otherwise shown once and only its sha256 is kept; an output
-- created from /setup also keeps the token sealed (AES-256-GCM, lib/setup-output.ts) under a key derived
-- from the deployment's secret, so a signed-in editor can copy the same URL again instead of minting a
-- new device every visit. An output credential satisfies `read` only. Additive and idempotent; applied
-- after devices.sql.
ALTER TABLE device_credentials ADD COLUMN IF NOT EXISTS sealed_token text;
