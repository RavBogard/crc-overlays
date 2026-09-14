-- The cue log's credential (2026-09-14 integration ruling 7). `db/devices.sql` pins the device
-- kinds in a CHECK constraint, so a third kind needs the constraint widened before a
-- `history_reader` row can exist. Additive and idempotent, like every other file here, and
-- applied after devices.sql.
--
-- A `history_reader` satisfies exactly one permission - reading `GET /api/history` - and never
-- read, control, author or owner. That rule lives in lib/access.ts; this file only makes the
-- row storable. Pairing codes are deliberately left alone: a service-history credential is
-- issued to another website by an administrator, never typed into a device.
--
-- Every existing CHECK on `kind` is dropped by discovery rather than by name, so a constraint
-- Postgres named differently (or one added by hand) cannot survive and keep refusing the new
-- kind. Re-running this file is a no-op.
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN
  SELECT conname FROM pg_constraint
  WHERE conrelid='device_credentials'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%kind%'
 LOOP
  EXECUTE format('ALTER TABLE device_credentials DROP CONSTRAINT %I',constraint_name);
 END LOOP;
 ALTER TABLE device_credentials ADD CONSTRAINT device_credentials_kind_check
  CHECK (kind IN ('companion','output','history_reader'));
END $$;
