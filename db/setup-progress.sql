-- Per-member setup progress. Additive and idempotent, like db/access.sql.
-- Applied after access.sql because it references access_members(id).
CREATE TABLE IF NOT EXISTS access_member_setup_progress (
 member_id text PRIMARY KEY REFERENCES access_members(id),
 steps jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at bigint NOT NULL
);
