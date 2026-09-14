> **NEXT BUILD (2026-09-13, approved by Daniel):** `docs/planning/2026-09-13-product-review/HANDOFF-CODE-2026-09-13.md` — the five-phase product-review build. Read it after the release-state section below.

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
- **Deployed 2026-09-13 14:35 CT: both workspaces serve `5117d328f1f69995c362b9548d7ca21d0eb97d12`** (Companion module 1.3.0 release; second deploy record at the end of this file). Earlier the same day, 08:59 CT: `fbce9c15a632a8d81348c291f71672b69c953d01` (see "Deploy record" at the end of this file). Both production databases were migrated first (17 → 22 tables each, additive, drafts preserved). Any commit after `fbce9c1` on this branch is documentation only unless the Deploy record says otherwise.

## Phase A built, not deployed (2026-09-13 afternoon/evening)

Nothing was deployed today past the 14:35 CT release above. Two branches are built and gated:

- **`r2-nextjs-16.3.5` = `3c27d94`**: Next.js 16.2.6 → 16.3.5 + eslint-config-next 16.3.5; post-login redirect on `/access` uses `router.push` (new lint rule). Its own release, first in the deploy order. Gate: `tsc` 0; tests 202/0/6; lint 0/0; build ok.
- **`phase-a` = `c79252d`**, ten commits on `3c27d94` (layoutLabel helper; R8 relay release procedure; shared header/dark system/names X1 U3 I1; GraphicThumbnail shared; data/API groundwork T4 X4(7) R6 U5/X6 I5 S6 X4(6); console I2 U2 U4 U5 X4(4); services/health/setup/sources-review/access I2 U4 U5 X6 X4(7) I5 S6; `agentRules:false`; editor/fit-check R6 X3 X4(1,2,3,5) U5 I5; browser-pass fixes). Gate: `tsc` 0; tests 238/0/6; lint 0/0; Companion audit unchanged (crc/tbi both 1.3.0, same shas); `next build` exit 0; relay 15/15 + `tsc` clean. Browser pass (Playwright MCP, rehearsal schema, signed in/out) at 1440×900, 1024×768, 390×844 on all nine pages: no overflow, nav one row at 1440, every page dark. Screenshots: `work/handoffs/phase-a/screenshots/`.

Deploy plan (weekday, renderers 0 on both `/api/state`): 1) deploy `3c27d94` paired (R2, own release); 2) run `node scripts/migrate-authoring.mjs` against both production DBs (adds `access_member_setup_progress`, additive), then deploy phase-a HEAD paired; 3) Companion users press "Refresh cue catalog" (T4 changed the catalog version; cue ids unchanged); 4) first relay release per `docs/RELAY-RELEASE.md` (pending `rendererExpired` fix) once Daniel names who deploys the relay; 5) fast-forward `codex/product-expansion` and `main` to what is deployed; 6) deploy `phase-a2` HEAD (`d5f064d`, audit fixes on top of `328e972`) paired, its own release after Phase A — no DB migration needed for A2.

See `work/handoffs/RETURN-CODE-A-2026-09-13.md` and the ledger `docs/planning/2026-09-product-expansion/APPROVED-BACKLOG.md` for full evidence.

## Phase A2 built, not deployed (2026-09-13 evening)

S4 "Rehearsal mode, made real" (agent-facing), built on `phase-a` at `4cf3a0c`. Five commits on branch `phase-a2`: `ce17105` (Node relay stub `scripts/rehearsal-relay.ts` built on `relay/src/protocol.ts`, 14 tests, `ws` devDependency), `9e79ce2` (`lib/rehearsal.ts`; `RELAY_URL=memory` sentinel; `MemoryAccessStore` seeded owner; memory setup progress; authoring/assets/services gates accept `memory`; `/api/health` memory metrics + lazy pg import; `VERCEL` added to the authoring fail-closed gate), `828e299` (`docs/REHEARSAL-MODE.md`, README paragraph), `c2c03a7` (`scripts/rehearsal.mjs` = `npm run rehearsal`; `scripts/check-rehearsal.mjs` = `npm run rehearsal:check`; seeded owner address `rehearsal-owner@rehearsal.invalid`), `328e972` (console cue card says "Rendered" instead of "Requested" once the renderer acknowledged — a Phase A U2 console follow-up found during the A2 browser pass). Gate on `328e972`: `tsc` 0; tests 265/0/6; lint 0/0; build ok.

An agent with no hardware, no Cloudflare account, and no Neon database now gets a fully local instance to publish and show a graphic: run `npm run rehearsal`, which refuses to start (exit 2) if `DATABASE_URL`, `RELAY_SECRET`, `CONTROL_KEY`, `OUTPUT_KEY`, `ACCESS_BOOTSTRAP_KEY`, or `VERCEL` is set, generates fresh keys, starts a Node relay stub in-process, spawns `next dev` with `RELAY_URL=memory`, and prints the console/output/author/access/health URLs plus the seeded owner sign-in (`rehearsal-owner@rehearsal.invalid` / `rehearsal-owner-local-2026`). `npm run rehearsal:check` verifies both the boot and attach paths end to end. Read `docs/REHEARSAL-MODE.md` first — it is the agent-facing companion to `docs/REHEARSAL.md` (the staffed hardware rehearsal) and documents the fail-closed rule verbatim: rehearsal never holds production credentials, so `CRC_AUTHORING_REHEARSAL=1` fails closed unless `NODE_ENV=development`, `VERCEL` is unset, and `RELAY_URL` is unset or `memory`.

Verified by hand: refusal with `DATABASE_URL` set (exit 2); a clean boot with no production variables present; `npm run rehearsal:check` passing on both paths; the seeded owner signing in through the UI, with session and setup-progress writes persisting across requests because module state is shared in `next dev`; a browser pass of `/access`, `/author`, `/`, and `/output` with zero requests to any non-localhost host; and a Show issued from the console rendering Barechu on `/output` with the chip turning green Rendered — the first physical verification of the Phase A U2 green/amber chip path (amber was only briefly observed in transit; the 3 s disconnect grace was not exercised). Ctrl+C teardown leaves no process, listener, or state file behind.

Not covered: MCP/OAuth is not part of rehearsal. `next dev` binds all interfaces, so a rehearsal is reachable on the LAN with its per-run keys — treat that as a local-network exposure, not a public one. `lib/cues.json` carries float artifacts (e.g. `0.21000000000000002`) that Turbopack serializes differently from Node, so a catalog version hashed outside Next never equals Next's; the orchestrator works around it by calling `POST /api/live-catalog` after initializing the stub, the same as production sync — normalizing the floats in the cue generator is a follow-up candidate, not yet done. Legacy `CRC_AUTHORING_REHEARSAL=1` without `RELAY_URL` now also puts accounts and setup progress in memory.

Deploy order: R2 → Phase A → A2, same weekday gate (renderers 0 on both `/api/state`), migrate before Phase A (A2 needs no migration of its own). Not yet deployed — none of A2 is in production.


## Phase B built, not deployed (2026-09-13 night)

Console, editor, type, fit and sharing-shelf items of the build order, on branch `phase-b` (HEAD `c4bdf6f`, audit fixes on `79a3aa3`), built on `phase-a2` at `d5f064d`. Twenty-two commits: console U1 "Show this graphic" inside Inspect and U6 arrow keys (`lib/console-keys.ts`, Enter never Shows); I3 Add from siddur as a shelf (`list_book_units`); I4 Duplicate shows what it copied; X2 Look drawer + Panels gating; X2b tiles named by look (`lib/template-looks.ts`); F3 custom starters (`lib/custom-templates.ts`); T1 paired he/tr rows for bilingual panels (`buildCue` emits `contentRows`; published graphics are stored cue JSON, so nothing on air changes until a re-publish); T2 sparse-fill warning (never a block); T3 David Libre + Frank Ruhl Libre bundled under `public/assets` behind `WORKSPACE_BOOK_FACES=1` (default off; compare page `/author/fit-check/faces`; `node scripts/t3-stills.mjs`); partner amendment 6 relay-release record; the ADAPT sharing shelf (CRC export carries `set` for whole prayers; TBI editor tab "CRC library" shows New from CRC / Updated from CRC / In your library, one-click Customize for a graphic or set, See what changed, Start a new draft from the update; loopback http feed only under `rehearsalMode()`); and `npm run rehearsal -- --pair` (CRC on 5175/8788, TBI on 5176/8789 fed from CRC, `work/rehearsal/current-tbi.json`, `npm run rehearsal:check -- --pair`). Gate on `c4bdf6f`: `tsc` 0; tests 395 (389/0/6); lint 0/0; build ok; Companion audit unchanged; solo and paired rehearsal checks PASSED on their boot paths; adversarial audit fix-first with all six findings fixed (see RETURN-CODE-B).

No DB migration for Phase B and no catalog change (no Companion "Refresh cue catalog"). Deploy as its own paired release after R2 → Phase A → A2 on a weekday behind renderers 0 on both `/api/state`; leave `WORKSPACE_BOOK_FACES` unset until Daniel chooses a face from the stills. Read `work/handoffs/RETURN-CODE-B-2026-09-13.md` for the T1 re-pagination list, the wording decisions awaiting Daniel, and the partner-review reconciliation. Google sign-in (approved 2026-09-13) builds next on branch `google-signin` off `phase-b`; plan in `work/handoffs/google-signin/PLAN.md`, config record in `docs/planning/2026-09-13-product-review/GOOGLE-SIGNIN-CONFIG-2026-09-13.md`.

## Google sign-in built, not deployed (2026-09-13 night)

The I2/S1 approved addition, on branch `google-signin` (HEAD `1e0de1b`) built on `phase-b` at `100e59c`. Six commits: `05c4ec3` (identity tables `db/access-identities.sql`, the `access_sessions.auth_method` CHECK widened idempotently to include `google`, identity and sign-in-flow methods on both the Postgres and memory stores, and `redeem(..., identity?)` binding inside the existing redemption transaction); `74627e2` (`openid-client@6.8.8`, lockfile +3 — openid-client, jose, oauth4webapi — and `lib/google-sign-in.ts`: availability = configured and the request origin both registered and equal to `canonicalOrigin`, reasons `unconfigured`/`preview`/`misconfigured`, memoized discovery whose failures are never cached, PKCE S256 with state and nonce and `prompt=select_account`, never `access_type=offline`, plus a pure callback decision table); `acca9a4` (`/access` UI and the copy table `app/access/google-copy.ts`); `264e60e` (the three `/api/auth/google/*` routes and the `/api/access` availability flag, `google` profile and `unlink_google` action); `a959b0d` (the `--google` rehearsal flag); the docs commit after it (docs, ledger, RETURN). Gate on `1e0de1b`: `tsc` 0; tests 449 (443/0/6); lint 0/0; build ok; rehearsal checks PASSED. Adversarial audit: ⟨audit⟩.

Google establishes identity only. Nothing creates a member from a Google account, and roles and `enabled` are never touched by Google; a Google account is bound to a member only through the authenticated link flow (current password required when one exists, ruling D1) or through invitation redemption, and a matching email address alone only skips the confirmation card inside those two flows. Scopes are `openid email profile`, userinfo is never called and no Google token is stored. Google sign-in of a linked member issues `auth_method='google'`; a redemption proved by Google stays `'invite'`. Device pairing and the MCP OAuth provider are untouched, and password, recovery, invitation and bootstrap sign-in are unchanged. The cowork order named `codex/product-expansion`, but that branch must stay equal to what is deployed, so this landed on `google-signin` stacked on `phase-b`.

**This one needs a DB migration**: `scripts/migrate-authoring.mjs` now applies `db/access-identities.sql` after `db/access.sql`, and must be run against both production databases (each with only its own `DATABASE_URL`) before the Google deploy. A pre-migration deploy degrades rather than breaks — `/access` still renders (the profile identity read is fail-soft and logs `access_identity_unavailable`), the Google routes answer unavailable, and password paths are unaffected. Before deploying, confirm by variable name only that `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` exist on both Vercel projects and that `PUBLIC_BASE_URL` is set on `tbi-overlays` to `https://tbi-overlays.vercel.app`, or TBI's Google availability fails closed as misconfigured (TBI invite links would already be wrong if it were unset). No catalog change, so no Companion "Refresh cue catalog". Deploy order is unchanged: R2 → Phase A (migration first) → A2 → Phase B → Google sign-in (migration first), paired across both workspaces on a weekday behind renderers 0 on both `/api/state`, then fast-forward `codex/product-expansion` and `main`. The real Google callback is Daniel's evidence (d), on `http://localhost:5175` first and then in production. Read `work/handoffs/RETURN-CODE-GOOGLE-SIGNIN-2026-09-13.md` for the lead decisions awaiting Daniel, the noted-not-fixed list and the deploy notes; the binding contract stays `docs/planning/2026-09-13-product-review/GOOGLE-SIGNIN-CONFIG-2026-09-13.md` and the plan is `work/handoffs/google-signin/PLAN.md`.


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

## Companion module 1.3.0 (afternoon of 2026-09-13, Daniel present)

- TBI now downloads its own module package `tbi-overlays-1.3.0.tgz` (manifest id `tbi-overlays`, name "TBI Overlays", default base URL tbi-overlays.vercel.app). It is derived deterministically from the reviewed CRC package by `scripts/build-tbi-companion-module.mjs`; `scripts/audit-companion-packages.mjs` re-derives and compares. Distinct ids let CRC and TBI modules be installed in one Companion (Daniel's testing setup). Protocol identifiers (`crc-overlays-v1`, `X-CRC-Catalog-Version`) are unchanged.
- New action `toggle_cue`: press shows the cue, press again animates it out (decided by the requested cue on the relay, never by rendered state; unknown state shows). Presets and both checked-in button pages use it; `show_cue`/`animate_out` still exist for hand-built buttons. Colours are the existing feedbacks: amber requested, green rendered, default idle.
- Red "disconnected" indicator now waits 3 s before painting; `rendered` is not graced and the command gate is unchanged. Close code/reason are logged in the Companion connection log.
- Red-pulse root cause is NOT confirmed. Read-only probes against the CRC relay (control subscription; simulated output + controller, 75 s each) showed no closes and stable presence. The pulse reported by Daniel (every ~10 s, 1-2 s) must originate in his output browser or Companion environment. Next time it happens: read the Companion connection log for "Realtime closed (code reason)" and note whether a graphics browser was open. Solid red = no graphics browser; pulsing red = flapping presence.
- Relay renderer-expiry off-by-one fixed in `relay/src` (tests pass) but the Cloudflare relay was NOT redeployed; deploy it on a weekday with `wrangler` from `relay/`.

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

## Deploy record 2 — Companion module 1.3.0

**2026-09-13, 14:32–14:36 CT.** Gate: CRC `/api/state` renderers 0 (a test cue "As We Bless" was live from Daniel's own Companion; no graphics browser connected); TBI `/api/state` revision 4, cue null, renderers 0. No production DB migration was needed (no schema change).

`node scripts/deploy-workspaces.mjs --commit 5117d328f1f69995c362b9548d7ca21d0eb97d12 --confirm-production`, exit 0. Release record `work/deploy-staging/releases/5117d328…/release.json`.
- CRC: `https://crc-overlays-zwljenlne-ravbogards-projects.vercel.app` (dpl_3mYabSEkdsFeAmFBsweBjAnHTg21) aliased to crc-overlays.vercel.app.
- TBI: `https://tbi-overlays-n6ucdpk9z-ravbogards-projects.vercel.app` (dpl_HfnNmGrvxJzawdfAMCd4eP8YtfNc) aliased to tbi-overlays.vercel.app.

Post-deploy (read-only): CRC state unchanged; `/api/health` 200, outputs 0, synchronization current. `/downloads/crc-overlays-1.3.0.tgz` 200 sha256 f728364a…; TBI `/workspaces/temple-bnai-israel/downloads/tbi-overlays-1.3.0.tgz` 200 sha256 62903419…; both 1.2.0 paths 404; `/api/workspace` download links point at 1.3.0 on both; served TBI page 1 decodes to module `tbi-overlays` 1.3.0, base URL tbi, 16 toggle_cue / 0 show_cue. `/setup` and `/author` 200 on both.

Rollback: promote the previous production deployment (`fbce9c1` build) in Vercel for each project. Operators who already installed module 1.2.0 keep working; the new pages require 1.3.0 because they use `toggle_cue`.

