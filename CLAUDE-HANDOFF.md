> **NEXT BUILD (2026-09-13, approved by Daniel):** `docs/planning/2026-09-13-product-review/HANDOFF-CODE-2026-09-13.md` — the five-phase product-review build. Read it after the release-state section below.

# Claude handoff — CRC and TBI Overlays

Updated September 13, 2026 (Claude session, after the Codex build stopped). **Read this first.** The feature expansion is now verified, built, and committed on `codex/product-expansion`. The section "Release state" below says exactly what has and has not reached production; do not infer it from git alone.

## Start here

- **Correct working directory: `C:\Users\dsbog\crc-overlays-vercel`.** `C:\Users\dsbog\crc-overlays` is an older checkout. Do not implement or reset there.
- Branch: `codex/product-expansion` (fast-forwarded to the deployed commit; `google-signin`, `phase-b`, `phase-a2`, `phase-a` are its ancestors). Private remote `https://github.com/RavBogard/crc-overlays.git`; CRC production is deployed by `scripts/deploy-workspaces.mjs` from HEAD, not by git integration, but `main` should be kept equal to what is deployed.
- Production: `https://crc-overlays.vercel.app` and `https://tbi-overlays.vercel.app` (TBI editor at `/author`). Sign-in owner in both: `daniel@centralreform.org`. No Michael or Simone account or invitation exists. Never email anyone without authorization.
- Budget: under $25/month combined ideal, $50 acceptable. Neon Launch upgrade already done. **Do not upgrade again.**
- Private local files, never print or commit: `.env.production.local`, `.env.authoring-test.local`, anything under `work/access/`. `PGOPTIONS="-c search_path=crc_authoring_rehearsal"` pins the isolated rehearsal schema; always verify `SELECT current_schema()` before a test mutation.
- Session evidence for this pass: `work/handoffs/claude-2026-09-13/SESSION-LOG.md` (GATE decisions), `work/recovery/rehearsal-drill-20260913/` (recovery drill + evidence file with the cleanup statement), `work/handoffs/claude-2026-09-13/source-checkpoint.zip` (pre-session snapshot).


## What is deployed

`RELEASE-STATE.md` at the repository root, and nowhere else. It is short on purpose: the deployed
commit per workspace, the relay worker version per worker, the environment deltas and the date.
Read it before you change anything.

This file used to carry that as well, inside 150 KB of history, which is no way to find out what
is live on a Friday afternoon. On 2026-09-19 the history moved to `docs/planning/2026-09-deploys/`:

- `DEPLOY-RECORDS.md` — all 25 deploy records, newest first: what shipped, the deployment ids,
  what was verified, how to roll back.
- `RELEASE-HISTORY-2026-09.md` — the running "Previously: deployed ..." chain.
- `BUILD-NOTES-2026-09-13-14.md` — the per-phase build notes (Phase A, A2, B, C, D1, D2, E,
  Release 3, Google sign-in, Companion 1.3.0). Every phase in it is shipped.

Orders and returns live in `docs/planning/<date>-<topic>/`, which is this repository's convention
and, since R-0919-audit-8, everyone's.

## Known limitations and decisions

- Publication fit gate is client-side only; MCP or direct API publishes are not fit-checked (rendering needs a browser).
- T4 landed on `phase-a` (1cc5f74): the cue is now named "Ahava Rabbah Ahavtanu (Partial)" in `lib/cues.json`, the TBI copies and the legacy sources; the `(ncomplete)` mapping is gone from `lib/cue-search.ts`. Cue ids unchanged; the catalog version changes, so every Companion needs one "Refresh cue catalog" after the Phase A deploy.
- Feedback records are readable by any signed-in member (dashboard and CSV); tightening is a product decision.
- Source review defer/reject were not browser-exercised (covered by tests).
- Escape-to-exit full screen could not be exercised by automation; the Close preview button was.
- Rehearsal test data remains in `crc_authoring_rehearsal` (drafts "Unending Love", the Mourner's Kaddish set, the accepted source-update draft, the QA artwork asset, the archived rehearsal starter). It is not production data.

## Remaining beta acceptance (human/hardware)

Michael and Simone must validate their own machines, OBS/vMix composition, Companion/Stream Deck positions, viewing-distance readability, full-service coverage, restart/network/emergency fallback, and cross-workspace isolation. `WORKSPACE_ISOLATION_VERIFIED` stays false until a physical rehearsal. Keep Singular available during beta. See `BETA-TASK-GUIDE.md`.

## Commands

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm test
npm run lint
node scripts/audit-companion-packages.mjs
npm run build            # stop any dev server first (shared .next)
# migrate one workspace (set that workspace's DATABASE_URL first; idempotent, additive only)
node scripts/migrate-authoring.mjs
# deploy the same clean SHA to both workspaces
node scripts/deploy-workspaces.mjs --commit <full-sha> --confirm-production
```

Rehearsal dev server: load `.env.authoring-test.local` into the shell without echoing values (strip surrounding quotes), remove `RELAY_URL`, `RELAY_SECRET`, `CRC_AUTHORING_REHEARSAL`, set `NODE_ENV=development` and `WORKSPACE_ID`, verify `current_schema()` is `crc_authoring_rehearsal`, then run `node node_modules/next/dist/bin/next dev --port 5175`. A test invitation can be created by a script that imports `lib/access.ts` (`accessStore.invite`) and writes the link only under ignored `work/access/`; never print tokens.

