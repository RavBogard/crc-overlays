# /setup pages and personal Companion downloads (S1–S5): state

Order: docs/planning/2026-09-24-tbi-setup-page/HANDOFF-CODE-2026-09-24-setup-pages.md, spec PLAN.md in the
same folder (Cowork's, untracked here and never staged by Code). S4/S5 evidence goes in that folder, as
the order asks. Release as usual: gates, migration (db/setup-output.sql), secrets, paired web release, main.

NEXT (paused 2026-09-24 for the setlist-unit-ids order): release S1–S3; set COMPANION_CONNECTION_VALUES on both projects; then S4 QC and the S5 style sheet
for Daniel (stop there).

## Packets

| Packet | Scope | Status |
|---|---|---|
| S1 | per-workspace step data, one component; TBI and CRC flows; picker, legacy key, private URL, per-page imports removed; siddur card to System; durable graphics URL; press readout; pairing in place; Going back pinned; links | built 69c8000 |
| S2 | Owner-only personal download: stored deck rendered, values merged from the backup-derived secret, named revocable token paired in; no-config proofs | built 69c8000 |
| S3 | style as data per operator (lib/companion-deck/styles/*.json) + validate_deck style and placeholder checks | merged (worker 77015b3) |
| S4 | QC checks 1–3 on Companion 5.0.5 | not started |
| S5 | QC check 4: the old-beside-new style sheet for Daniel | not started |

## Decisions

- GATE: the personal download copies connection values out of the 14 Sept (TBI) and 16 Sept (CRC)
  backups into one server secret, COMPANION_CONNECTION_VALUES — proceeded because Daniel ruled it
  (PLAN.md rulings 2 and "Their style", 2026-09-24), and the earlier standing rule (never copy a raw
  export's config) is kept in its purpose: the values are never printed, logged, committed or written to
  disk; scripts/set-connection-values.mjs prints labels, field names and a sha256 only.
- GATE: CRC's deck does use the legacy obs connection — pages 52 "AV / Stream" and 53 "Startup tools"
  carry OBS start/stop-recording actions (crc-seed-data.json fragments 52/0/0, 52/0/1, 52/2/0, 52/3/0,
  52/3/1, 53/0/0) — so the file keeps an obs label stub, with no values, and Michael's label check lists
  11 labels read from the stored deck, not the plan's ten. Proceeded because the plan's intent (obs
  carries no values; connections unchanged) holds either way.
- GATE: Companion's import screen has no "Connections: leave unchanged" control (5.0.3 source,
  webui/src/ImportExport/Import/Full.tsx: connections are always imported; "Import Preserving
  Unselected" merges them by label and module, "Full Reset & Import" resets). Michael's page says: turn
  on Buttons, Triggers and Custom Variables only, then Import Preserving Unselected — proceeded because
  that is the mode that keeps his connections; S4 confirms the words on 5.0.5.
- GATE: CRC's filled connections keep the deck's enabled:false (a merge keeps his own connections, and
  "no new, disabled connection" stays the sign to go back); TBI's are enabled because a full reset
  imports them as the file says.
- GATE: the durable graphics URL keeps its output token sealed (AES-256-GCM, key derived from the relay
  secret) in device_credentials.sealed_token — proceeded because the plan asks for the same URL on a
  later visit and an output credential only reads; revoking it on Access ends it.
- GATE: TBI step 4 ticks on the personal token's own first check-in (or a code paired from the page),
  not on any Companion — proceeded because her old connection may already be online.
- GATE: TBI's test says "panel 1, then panel 2 below it" — the plan's "with Next panel" does not match
  her deck, which has one key per panel and no Next panel key.
- S3 worker GATEs (merge commit): placement/label/colour are warnings (TBI's approved plan breaks them
  31 times on purpose); a missing or duplicated panel key and an unbound placeholder are errors.

## Evidence

- Gates at the S3 merge (not yet released): tsc 0, npm test 1263 pass / 0 fail (+35 .mjs), lint 0 errors (2 known warnings), build 0, audit-companion-packages 0.
- S4 feasibility: Companion 5.0.5 is installed here and running (Daniel's, admin 127.0.0.1:8000); no Stream Deck attached, so a second headless instance (resources/main.js --config-dir <tmp> --admin-port <other>) can take the real import without touching his. Presses must go to `npm run rehearsal` (local relay + output), never production.
- S3 measured: CRC seed 69 sets / 173 panel keys, 0 style findings, exportable; TBI deck plan in memory
  56 sets / 145 keys, 0 errors, 31 warnings (22 label, 8 placement, 1 colour).
- Values dry runs (field names only): TBI obs (host, pass, port, product) and Birddog (host, model,
  poolActive, product); CRC vmix, 5 BirdDog cameras, x32, reaper, vlc.

## Open questions (for Daniel or Cowork)

- The TBI download stays locked while any placeholder key is left on her stored deck (S3 made it an
  error), and until the TBI thread's NEXT (publish, seed, apply_deck_plan, validate_deck) is done.
- The 31 TBI style warnings (her "Amidah 2–6" numbering, the Psalm 27 row, page 96 "228 pt 1" colour)
  go to Daniel with the S5 style sheet.
- A full reset also resets Companion's own Settings and surfaces (Full.tsx: unselected components are
  reset). The S4 rehearsal records what that does to her Stream Deck; the page copy may need a line.
- Plan's one-page update for a later panel-count change is not in S1–S5; not built.
