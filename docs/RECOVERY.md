# Recovery runbook

Guide version: **2026.09.1**

Create a recovery package after meaningful content changes, before major services, and at least monthly. Keep the latest three monthly packages and the packages made before the two most recent major services in restricted congregation storage. The package contains authored content, revision history, service collections and feedback, source review records, public workspace configuration, the expanded and legacy authoring source maps, fonts and artwork, Companion files, relay state/catalog when reachable, and owner-reported usage. It excludes environment variables, credentials, password hashes, browser sessions, invitations, and private output URLs.

```powershell
$env:DATABASE_URL = '<workspace database URL>'
$env:WORKSPACE_ID = 'crc' # or temple-bnai-israel-kalamazoo
node scripts/export-recovery.mjs work/recovery/crc-2026-09-12
node scripts/verify-recovery-bundle.mjs work/recovery/crc-2026-09-12
```

Store the directory outside the repository after verification. Access accounts are recovered separately: provision one administrator through the guarded bootstrap procedure, then invite named users again. Do not copy sessions, passwords, or old invitation links.

Before accepting a release for a major service, rehearse restoration through a nonproduction process. The tool verifies every checksum before opening the database, creates a new randomly named `recovery_*` schema, applies the schema there, and inserts only into that new namespace. It never deletes or replaces an existing table. The isolated schema stays available for inspection and the tool writes a rehearsal evidence file beside the bundle.

```powershell
$env:RECOVERY_REHEARSAL_DATABASE_URL = '<separate rehearsal database URL>'
node scripts/restore-recovery-rehearsal.mjs work/recovery/crc-2026-09-12 --confirm-rehearsal
```

After restoration, point a local rehearsal process at the exact schema named in the evidence file, verify counts, preview one custom graphic and one source-linked graphic, and add the tester and result to the rehearsal record. Never aim a rehearsal process at the production relay. Keep the schema through review; its evidence file includes the exact schema-specific cleanup statement. Run that cleanup only after review. A production restore requires an incident plan, a fresh pre-restore export, and a separately reviewed command; this rehearsal tool cannot perform it.
