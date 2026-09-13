# Claude handoff — CRC and TBI Overlays

Updated September 13, 2026 (Claude session, after the Codex build stopped). **Read this first.** The feature expansion is now verified, built, and committed on `codex/product-expansion`. The section "Release state" below says exactly what has and has not reached production; do not infer it from git alone.

## Start here

- **Correct working directory: `C:\Users\dsbog\crc-overlays-vercel`.** `C:\Users\dsbog\crc-overlays` is an older checkout. Do not implement or reset there.
- Branch: `codex/product-expansion`. Private remote `https://github.com/RavBogard/crc-overlays.git`; CRC production is deployed by `scripts/deploy-workspaces.mjs` from HEAD, not by git integration, but `main` should be kept equal to what is deployed.
- Production: `https://crc-overlays.vercel.app` and `https://tbi-overlays.vercel.app` (TBI editor at `/author`). Sign-in owner in both: `daniel@centralreform.org`. No Michael or Simone account or invitation exists. Never email anyone without authorization.
- Budget: under $25/month combined ideal, $50 acceptable. Neon Launch upgrade already done. **Do not upgrade again.**
- Private local files, never print or commit: `.env.production.local`, `.env.authoring-test.local`, anything under `work/access/`. `PGOPTIONS="-c search_path=crc_authoring_rehearsal"` pins the isolated rehearsal schema; always verify `SELECT current_schema()` before a test mutation.
- Session evidence for this pass: `work/handoffs/claude-2026-09-13/SESSION-LOG.md` (GATE decisions), `work/recovery/rehearsal-drill-20260913/` (recovery drill + evidence file with the cleanup statement), `work/handoffs/claude-2026-09-13/source-checkpoint.zip` (pre-session snapshot).

## Release state (update this section whenever it changes)

- Production baseline before this pass: `180b88a` on both workspaces. CRC production read-only state at 2026-09-13 08:59 CT: cue clear, revision 1789055589982, catalog d37d122359b9920d, zero connected renderers. TBI: not probed (CRC key is not valid there); TBI has no operator accounts yet.
- **Deployed 2026-09-13 08:59 CT: both workspaces serve `fbce9c15a632a8d81348c291f71672b69c953d01`** (see "Deploy record" at the end of this file). Both production databases were migrated first (17 → 22 tables each, additive, drafts preserved). Any commit after `fbce9c1` on this branch is documentation only unless the Deploy record says otherwise.

## What was done in this pass (2026-09-13)

Everything below was verified against the isolated rehearsal schema with the relay unset, so no live command was ever possible. Product docs updated: `docs/planning/2026-09-product-expansion/APPROVED-BACKLOG.md` (ledger with (a) automated / (b) browser-verified / (c) implemented-not-browser-verified / (d) beta-only), `BETA-BUILD.md` ("Build evidence 2026-09-13"), new `BETA-TASK-GUIDE.md` (Daniel / Michael / Simone tasks).

Code fixes and additions:
- Renderer: text fit now runs after bundled fonts and artwork settle (`Player.applyFit`, idempotent), one shared 8 s asset deadline with listener cleanup, artwork failure falls back to the congregation logo instead of an error state. Author preview and console preview follow the same sequence.
- Fit checker (`app/author/preview.ts`): a paragraph's own line boxes are no longer compared against each other; 6 px font-metric tolerance because Noto Sans Hebrew's content area (≈1.36 em) exceeds the 1.15–1.28 line-heights. Pure `overlapErrors` helper with tests.
- New author-only read-only page `/author/fit-check`: renders every published cue with the real renderer at 1920×1080 and reports the editor's fit errors. Result: CRC branding 26/26 fit, TBI branding 29/29 fit (rehearsal-schema catalogs). Never publishes or sends output.
- Console Inspect stage rendered prayer text white-on-cream in production (pre-existing): overlay ink/paper CSS variables now defined on `.overlay`.
- Workspace nav filters by role and resolves the role itself; control-key sessions get owner navigation; signed-out invitation page shows only Live control.
- Health: unknown output presence is never rendered as zero. Services: 409 conflict refreshes the collection while keeping typed input. Console: prepared-collection selector defaults to "No prepared service"; Inspect renders uploaded artwork.
- Editor: alignment (Template default / Logical start / Centered) and line spacing (Template default / Compact / Spacious) controls with aria-pressed; Reset restores template defaults without touching text; new-draft route clearing extracted to tested `routeForDraft`; asset picker gained Archive / Restore / Show archived with logo fallback when the selected artwork is archived; publish dock says "Fix fit issues to publish" when a reviewed version has fit errors; starting new work clears the stale preview.
- MCP draft schema accepts `alignment`, `lineSpacing`, `imageAssetId`. Shared-asset import tolerates malformed remote labels. Quota message says archived artwork counts.
- Tooling: `npm test` aggregate script (tsx over `tests/*.test.ts` and `app/author/*.test.ts`), PostgreSQL suites self-skip without `TEST_DATABASE_URL`; eslint ignores `work/**` and `relay/**`; test files typed (no `any`).

Automated evidence: `tsc --noEmit` clean; `npm test` 207 tests, 201 pass, 0 fail, 6 environment skips; `npm run lint` 0 errors 0 warnings; Companion audit unchanged (CRC/TBI 2 pages, 24 cues, both clears, no credentials); `npm run build` exit 0 with all routes.

Browser evidence (Playwright-driven, synthetic owner `qa-claude-2026-09-13@example.invalid`): invitation redeem; role nav; library thumbnails; Add from siddur clears `?draft=`; English-only retrieval; passage and template selection; alignment/spacing live and Reset; save writes draft id to URL; reload preserves presentation; SVG rejected server-side, PNG accepted as content-addressed asset; unpublished content 404 / authenticated preview 200; publish gated on zero fit errors; after publish the content route is 200 public immutable and the catalog carries `imageAssetId` only; archive keeps historical content serving, restore works, archiving the selected artwork marks the draft unsaved and falls back to the logo; console Inspect never sends a command and Show/Clear stay disabled without the relay; health page states; services degraded entries and optional collections; source review scan, exact comparison, Accept into a new unpublished draft (original untouched); multipart: whole-prayer set of 3, Move later, Duplicate slide to 4, Review flags "duplicated (2)"; full-screen preview enter/exit via the close button.

Recovery drill: export 19 files, verified, restored into `recovery_1789306559735_c9c2c2d7` — 9 drafts, 7 revisions, 2 collections, 1 feedback, 1 usage report, 1 asset byte-exact (sha matches id) with published flag. No existing table touched. Cleanup statement is in the evidence file; not yet run.

## Known limitations and decisions

- Publication fit gate is client-side only; MCP or direct API publishes are not fit-checked (rendering needs a browser).
- `lib/cues.json` contains a real cue named "Ahava Rabbah Ahavtanu (ncomplete)"; the operator label maps it to "(Partial)". Renaming is a content decision for Daniel.
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

## Deploy record

**2026-09-13, Saturday, 08:40–09:01 CT. Production migration and paired deployment were run.**

Pre-deploy gate (read-only, Bearer control key): CRC `/api/state` cue null, revision 1789055589982, catalog d37d122359b9920d, renderers 0. TBI `/api/state` (TBI key, pulled with `vercel env pull` into scratch and deleted afterward) revision 0, cue null, renderers 0. No browser output connected on either workspace, so no service could be interrupted.

Migration: `scripts/migrate-authoring.mjs` run once per workspace with only that workspace's `DATABASE_URL` set (no `PGOPTIONS`, no relay vars). CRC: schema `public`, 17 tables → 22, existing drafts preserved. TBI: same, 17 → 22. Idempotent; a re-run is a no-op.

Deployment: `node scripts/deploy-workspaces.mjs --commit fbce9c15a632a8d81348c291f71672b69c953d01 --confirm-production`, exit 0, 3 min 5 s. Release record: `work/deploy-staging/releases/fbce9c15a632a8d81348c291f71672b69c953d01/release.json` (`status: deployed`, completed 2026-09-13T13:59:32Z).
- CRC: `https://crc-overlays-qbt7xw3h9-ravbogards-projects.vercel.app` aliased to `https://crc-overlays.vercel.app`.
- TBI: `https://tbi-overlays-5cnud7vbz-ravbogards-projects.vercel.app` (dpl_7Pagd4GE2HHJwEZ713U3jVy7riva) aliased to `https://tbi-overlays.vercel.app`.

Post-deploy verification (read-only, no live command sent):
- CRC `/api/state` unchanged (cue null, revision 1789055589982, renderers 0). CRC `/api/health` now exists: 200, overall `attention` (provider usage unavailable, not zero), playback relay available, outputs none-seen, synchronization current d37d122359b9920d, authoring 1 published / 1 draft / 1 revision.
- TBI `/api/state` unchanged (revision 0, cue null, renderers 0). TBI `/api/health` 200, synchronization current 2e9a7e975d4923dd, authoring 2 published / 2 drafts / 2 revisions.
- `/api/workspace`: CRC id `crc`, shared library disabled, `usesDefaultCrcIdentity: true`; TBI id `temple-bnai-israel-kalamazoo`, "Temple B'nai Israel", shared library enabled (label "CRC library"), `usesDefaultCrcIdentity: false`. `isolationVerified: false` on both, as required until the physical rehearsal.
- Unauthenticated: `/`, `/author`, `/access`, `/health` return 200 on both; `/api/state` and `/api/health` return 401 without a key on TBI.

Rollback: promote the previous production deployment (`180b88a`) in the Vercel dashboard for each project. The migrations are additive, so the old build runs against the migrated schema.

Not done in this pass: no invitations created or emails sent; rehearsal data left in `crc_authoring_rehearsal` and the recovery schema `recovery_1789306559735_c9c2c2d7` (cleanup statement in `work/recovery/rehearsal-drill-20260913/`, not run); `main` on `origin` fast-forwarded to this branch. Security follow-up: `npm audit --omit=dev` reports a critical advisory in `next` 16.2.6 fixed in 16.3.5. The app has no middleware/proxy file, no Server Actions, and no i18n config, so the published vector does not apply as deployed; schedule the patch release on a weekday with the same gate.
