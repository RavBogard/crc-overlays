# HANDOFF-CODE-AUDIT-2026-09-19 — crc-overlays

Executor: a Claude Code (Opus) session opened on this repo
Status: open
Verified-against: `1f9a5f3` (branch `google-signin`, which equals `origin/main`)
Rulings: `RULINGS-AUDIT-2026-09-19.md` (same folder) — read it first; R-0919-audit-1 approves everything here
Master order: `PLAN-AUDIT-MASTER-2026-09-19.md` (same folder) — which wave each item is in and what it waits on
Subagents: Opus and Sonnet only (R-0919-audit-9). Repeat this line in any sub-order you write.
Process: you are executor and producer for this repo (R-0919-audit-8). Measure your own expectations, write your own return, deploy when it looks ready. Do not wait for a board row or a producer.

Working directory: `C:\Users\dsbog\crc-overlays-vercel`, branch `google-signin`.
Deployment shape you must keep in mind all the way through: **a push to `main` deploys CRC production by itself** (Vercel Git integration; `CLAUDE-HANDOFF.md:238`). TBI is deployed by CLI only, through `scripts/deploy-workspaces.mjs`. So a push that is fine for CRC leaves the two congregations on different commits until you run the CLI release.

Two corrections to the audit report that reached you earlier, so you do not act on the old version:

- `main` is **not** behind. `origin/main` == `google-signin` == `1f9a5f3`. Only the stale checkout at `C:\Users\dsbog\crc-overlays` holds a `main` 243 commits back. `siddur-library.yml`'s `base: main` is correct and stays.
- The TBI shared library ships licensed units unfiltered by ruling (R-0919-audit-7). No filter is built. Record it and move on.

## Before anything

1. Commit `RULINGS-AUDIT-2026-09-19.md`, `PLAN-AUDIT-MASTER-2026-09-19.md` and this file into `docs/planning/2026-09-19-audit/`. That is already this repo's convention and R-0919-audit-8 makes it the convention everywhere.
2. Read `CLAUDE-HANDOFF.md:16-37` (release state) so you know what is deployed before you change anything.

---

## Wave 1 — this repo alone, no cross-repo dependency

### Correctness

- [ ] **Cue log records the liturgical position again.** This is the top item. A live probe of production `GET /api/history` returned 26 rows from the Sept 15–16 testing; eight of the ten `in` rows were real liturgical cues (Modeh Ani (Bottom), Mah Tovu, Barechu, Mi Chamocha (Sat 1)) and **every row carried `unitId`, `momentId`, `book` and `folio` as null**. The cause is traced, not guessed: the relay stores only source ids that begin with `library:` (`relay/src/protocol.ts:157-161`, `librarySourceIds`), and the Barechu cue's own published revision carries `["shma.barchu@legacy-shabbat-morning"]` — a bare unit id with no `library:<book>:` prefix — so the relay wrote `[]` and there was nothing left to join. The same prefix filter is applied a second time on the way out (`lib/service-history.ts:55`), and a third condition, `index.has(id)` in `liturgyForSourceIds` (`lib/liturgy-index.ts:119-130`), requires the id to be present in `content/siddur-library.json` as it stands today (commit `3625287`) — so a cue pinned at an older feed commit (the Barechu revision names `a3d88b6`) resolves to null even when the prefix is right.
  What to do: drop the `startsWith('library:')` filter from `librarySourceIds` (`relay/src/protocol.ts:160`), keeping the `length<=160` and `slice(0, MAX_HISTORY_SOURCE_IDS)` bounds; drop the same filter from `sourceIdsOf` (`lib/service-history.ts:55`); and in `liturgyForSourceIds` fall back to matching a bare unit id against `source.authority.unitId` when no id hits the index by key. **Log the miss** (id, and that nothing matched) instead of returning silent nulls — the whole reason this went unnoticed for four days is that a miss looks exactly like a cue with no liturgy.
  Release order: the relay ships first and on its own (`docs/RELAY-RELEASE.md`), both workers, `node scripts/deploy-relays.mjs --commit <sha> --confirm-production --gate-file <path>`; the gate wants `renderers: 0` on both. Then the web deploy.
  Done when: you fire one library-backed cue through `/api/command` and `GET /api/history` returns that row with non-null `unitId`, `momentId`, `book` and `folio`. The 26 existing rows are unrecoverable — do not try to backfill them.
  Note while you are in there: `serviceRef` null on every row is **expected**, not a defect. Only a names panel produces one (`relay/src/index.ts:151` → `collectionFromNamesCue`, `relay/src/protocol.ts:168-172`), and D4 ruled against asking an operator to load a prepared service. Leave it alone.

- [ ] **Verify the MCP publish chain once, on the deployed function.** Deploy record 25 says outright that nobody has watched `fit_check_draft` return `verdict:"pass"` from production; the fix is measured off the function log and the built trace, not off a working run. The steps and the draft id (`ffe1eedc-80c4-48e9-a9b8-e841131101bd`) are written out in §5 of `work/handoffs/RETURN-CODE-SERVER-FIT-2026-09-16.md`. Needs an MCP session holding the `authoring` scope; `CONTROL_KEY` is refused for `author` by design.
  Why: this is the difference between Daniel publishing 171 graphics by hand and an agent doing it.
  Done when: one draft goes preview → fit check (`pass`) → review → publish over MCP against the deployed function, and you paste the four responses into the return.

### Hygiene

- [ ] **CI that runs the tests.** There is exactly one workflow today, `.github/workflows/siddur-library.yml`; 91 test files guard nothing automatically. Add a workflow on push and pull request that runs root `npm test`, `cd relay && npm test`, `cd companion && npm test`, `npx tsc --noEmit` and `npm run lint`.
  While you are there, fix the glob: `package.json:14` is `tests/*.test.ts`, so `tests/convert-companion-singular.test.mjs` and `tests/test_cue_sources.py` have never run. Give the `.mjs` file a runner line and the python file its own step.
  Done when: a push shows a green run with all three suites reported, and the two previously-excluded files appear in the output.

- [ ] **`.env.example`.** `.gitignore` excludes `.env*` outright, so nothing is committed; the old checkout's copy holds two names out of roughly twenty-eight. Commit a `.env.example` (add the `!` exception to `.gitignore`) listing every name with one line each and a required/optional marker per workspace. The full set I found by grep: `CONTROL_KEY`, `OUTPUT_KEY`, `RELAY_URL`, `RELAY_SECRET`, `WORKSPACE_ID`, `PUBLIC_BASE_URL`, `PUBLIC_ALTERNATE_ORIGINS`, `DATABASE_URL`, `ACCESS_BOOTSTRAP_KEY`, `OVERLAYS_PUBLIC_NOW`, `CRC_AUTHORING_REHEARSAL`, `CRC_REHEARSAL_RELAY_PORT`, `TEST_DATABASE_URL`, `CRC_PAIR_TEST_SECRET`, `RECOVERY_REHEARSAL_DATABASE_URL`, `PLAYWRIGHT_CHROMIUM_PATH`, `PGOPTIONS`, `SOURCE_REVIEW_POSTGRES_TEST`, `ACCESS_POSTGRES_TEST`, `SITE_URL`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `CRC_LIVE_BASE_URL`, `CRC_LIVE_READ_TOKEN`, `CRC_SHARED_LIBRARY_URL`, `SHARED_LIBRARY_IMPORT_KEY`, `SHARED_LIBRARY_EXPORT_KEY`, `WORKSPACE_BOOK_FACES`, `WORKSPACE_COMPANION_MODULE_PATH`, `WORKSPACE_COMPANION_PAGE_PATHS`; plus the relay's own `ALLOWED_ORIGINS`, `WORKSPACE`, `LIVE_ROOM` binding and `RELAY_SECRET` in `relay/wrangler.jsonc`. Values are placeholders only — no secret goes in this file.
  Done when: `.env.example` exists, is committed, and a fresh `grep -rhoP 'process\.env\.[A-Z_0-9]+|env\.[A-Z][A-Z_0-9]{2,}'` across `app lib scripts relay companion` turns up no name the file is missing.

- [ ] **Hostname drift after the domain swap.** CRC is primary on `overlays.centralreform.org` since 2026-09-15 (Deploy 23), but the Vercel hostname is still the written default in several places, and the `*.vercel.app` hosts now sit behind Vercel SSO for non-custom domains — so a default that points there can fail for someone who is not signed in to Vercel. Change: `companion/src/main.ts:55`, `:122`, `:127` (the module's default `baseUrl`, which is what a new Stream Deck connection gets); `scripts/prepare-workspace.mjs:102`; `scripts/deploy-workspaces.mjs:28` and `:33`; `scripts/convert-companion-singular.mjs:187` and `:389`; `lib/oauth-core.ts:33` (the fallback origin when no request exists); `docs/MCP.md:3` and `:7`; `docs/LIVE-ARCHITECTURE.md:126`. Leave `lib/google-sign-in.ts:19` (`REGISTERED_ORIGINS`) alone — all four hosts belong there. `tests/google-sign-in.test.ts`, `tests/google-routes.test.ts`, `tests/mcp.test.ts` and `tests/public-origins.test.ts` pin the old string; update them with the code, not around it.
  Note the knock-on: `scripts/build-tbi-companion-module.mjs:166,183` rewrites `crc-overlays.vercel.app` → `tbi-overlays.vercel.app` by string replacement and counts the occurrences (`replaceExactly(..., 3, ...)`). Change both sides together or that script fails loudly, which is the correct behaviour but will stop your build.
  Done when: `grep -rn "crc-overlays\.vercel\.app" app lib scripts companion docs` returns only `lib/google-sign-in.ts` and the tests that deliberately exercise the alternate origin, and `npm test` is green.

- [ ] **TBI deploy record.** TBI has no Git integration, so a CRC push silently splits the two congregations. Either connect a Vercel Git integration on the `tbi-overlays` project deploying the same branch with TBI's own environment, or — at minimum — record the deployed sha per workspace in `RELEASE-STATE.md` (next item) on every release. Daniel's call which; the second is one line of discipline and no configuration.
  Done when: either the TBI project shows a Git connection in Vercel, or `RELEASE-STATE.md` carries a per-workspace sha line and the current one matches what both hosts actually serve.

- [ ] **`RELEASE-STATE.md`.** `CLAUDE-HANDOFF.md` is 150 KB and is the only record of what is deployed — too big to read under pressure on a Friday. Split out a short `RELEASE-STATE.md` at the repo root: deployed commit per workspace, environment deltas, relay worker version per worker, and the date. Move the deploy records into `docs/planning/2026-09-<nn>-deploys/` archived by date and leave a pointer.
  Done when: `RELEASE-STATE.md` exists, is under about 60 lines, names both workspaces and both relay workers, and `CLAUDE-HANDOFF.md` is under 40 KB.

- [ ] **Branches, worktrees, scripts, stale checkout.** Prune the eight worktrees (all reported `prunable`: `crc-overlays-companion`, `-console`, `-opening`, `-push-companion`, `-renderer`, `-site-check`, `-source`, and the `mnt` one) with `git worktree prune`, keeping `crc-overlays-vercel`. Delete the `codex/*` branches whose tip is an ancestor of `google-signin` (`git branch --merged google-signin`); leave anything not merged and say in the return which those are. Delete the five scripts nothing references: `scripts/check-api.py`, `scripts/check-concurrency.py`, `scripts/migrate-operations.mjs`, `scripts/migrate-postgres.mjs`, `scripts/prepare-companion.py` (`scripts/migrate-authoring.mjs` is the live migrator and stays). Fast-forward or delete the stale checkout at `C:\Users\dsbog\crc-overlays` — Daniel's call which; both are one command, and until it is done there is an old `main` and an old `CLAUDE-HANDOFF.md` on disk that a future session can pick up by mistake.
  Done when: `git worktree list` shows one worktree, `git branch --merged google-signin` lists nothing but `google-signin` and `main`, the five files are gone, and `npm run build` still exits 0.

### Docs

- [ ] **Record R-0919-audit-7.** Add a short note to `docs/WORKSPACE-DEPLOYMENT.md` (or beside `lib/shared-library.ts`) saying that licensed CRC units travel to TBI unfiltered by Daniel's standing authorization, and that `buildSharedLibraryPayload` deliberately has no licence filter. Purpose is to stop the next reader re-raising it.
  Done when: the note exists and names the ruling id.

- [ ] **Governance (R-0919-audit-8).** This repo has no `CLAUDE.md` and no `AGENTS.md`, and `CLAUDE-HANDOFF.md` carries no "PRODUCER TRANSITION" or "STANDING TERMINAL" banner — I checked. So there is nothing to delete here. Confirm the same in your return and keep `docs/planning/<date>-<topic>/` as where orders and returns live; that is already what this repo does.
  Done when: the return states the check was made and found nothing to remove.

---

## Wave 2 — waits on: Wave 1 (b) CI in this repo; shireishabbat Wave 1 (d) the moments agreement check

- [ ] **Adopt the moments agreement check.** `content/moments.json` is the producer's table copied verbatim by `scripts/adopt-moments.py` in the Monday workflow; nothing here asserts it still agrees with the canonical one upstream. Add the same check shireishabbat is building, run it in CI, and fail the regeneration PR when the two disagree.
  Done when: CI runs the check and a deliberately mismatched fixture fails it.

- [ ] **Forwarding list for renamed upstream unit ids.** The Barechu case shows the shape: a cue pinned at feed commit `a3d88b6` no longer resolves against the library at `3625287`. Mirror `.live`'s `RETIRED_UNITS` structure so a renamed upstream unit id maps forward to its current id, and consult it in `liturgyForSourceIds` after the direct and `authority.unitId` lookups both miss.
  Done when: a fixture cue pinned to a retired id resolves to the current unit, and an unknown id still logs a miss rather than returning nulls quietly.

- [ ] **Stamp the source commit on each published cue.** At publish time, record the `repositoryCommit` the cue's sources came from on the published revision, so a later rename is detectable rather than inferred. This is what makes the previous item diagnosable instead of guesswork.
  Done when: a newly published cue's revision carries the commit, and a test asserts it.

- [ ] **Strip the unused UI components.** 50 of 61 files under `components/ui/` are imported nowhere (11 are used). They carry `recharts`, `embla-carousel-react`, `react-day-picker`, `vaul`, `cmdk`, `input-otp`, `react-resizable-panels`, `sonner`, `react-hook-form`, `@hookform/resolvers` and `date-fns` in `dependencies`. Measure `npm ci` before and after and put both numbers in the return — one CI run of `npm ci` was observed at 7m01s on an unchanged tree, so this is worth measuring rather than asserting.
  Done when: the files and their now-unreferenced dependencies are gone, `npm run build` exits 0, `npm test` is green, and the return carries the two `npm ci` timings.

- [ ] **Split `app/author/page.tsx`.** 1,265 lines, and the file every future editor change touches. No behaviour change; do it only with the Wave 1 CI green so a regression is caught.
  Done when: no file in `app/author/` exceeds about 500 lines, the suite is green, and the rendered editor is unchanged (compare a fit-stage measurement of one cue before and after).

- [ ] **Translation layer: note it, do not build around it.** The chip exists and is offered, but the feed carries zero `translation-en` blocks, so it is dark for almost the whole library. The fix is upstream: `docs/planning/2026-09-14-integration/HANDOFF-CODE-CORPUS-TRANSLATION-PAIRS-2026-09-14.md`, which asks shireishabbat to declare which English translates which Hebrew. Do not guess pairings here and do not build a heuristic — adjacency is not correspondence, and a wrong guess puts the wrong English under the Hebrew in front of a congregation.
  Done when: the return says the layer is still waiting on that order and names it.

---

## Wave 3 — waits on: Daniel and Michael's rehearsal (a real service)

- [ ] **Confirm the cue log on a real service.** After one service has been run and logged, read `GET /api/history` for that window and confirm every library-backed cue that was fired carries `unitId`, `momentId`, `book` and `folio`. Report how many rows, how many carried a position, and any that did not with the logged miss reason from Wave 1.
  Done when: the numbers are in a return and the window is handed to `.live` for `reconcile_service`.

- [ ] **Set `isolationVerified` honestly.** It is `false` on both workspaces today and has been since the first deploy. After the rehearsal — Stream Deck, real vMix, restart, network drop, a service-length run, and evidence that credentials, catalog, output URL, branding and presence never cross workspaces — set it to what is true.
  Done when: the value matches the evidence and the evidence is written down.

---

## Return

Write `RETURN-CODE-AUDIT-2026-09-19-W<n>.md` beside this file after each wave: the checklist above with PASS or FAIL per line, the web sha and the relay version id per worker, the gate and test tail, and anything Daniel must see. For Wave 1 that must include the one `GET /api/history` row that proves the cue log fix, quoted.

## Do not

- Do not enable `/api/now`. It stays dark. It would publish a draft book slug and a draft folio on a public, credential-free surface (142 of the 732 units in `content/siddur-library.json` come from the two draft books).
- Do not upgrade Neon.
- Do not pin the siddur library to release commits — declined; the Monday PR is already the gate.
- Do not build a licence filter on the shared export (R-0919-audit-7).
- Do not wire the scan-card page chip to the cue folio. It stays free text set by the operator.
- Do not change `siddur-library.yml`'s `base: main`. It is correct.
- No cross-fade transitions, no Bitfocus module-store publication, no test card, no timed auto-out, no rehearsal mode for humans.
- Never propose which setting or melody the band plays.
