# Handoff → Code: the 2026-09-13 product-review build

Status: APPROVED by Daniel 2026-09-13, ready to execute. Revised 2026-09-13 ~15:00 CT by Claude (Fable) after the afternoon release; see "Revision 2" below. Daniel approved every Revision 2 change and suggestion at ~15:10 CT (R2 first, R8 relay procedure, S4 as Phase A2, G3 budget check, R7 shared fit code, U2 grace). Cowork's later small edits are merged in.
Source review: "Overlays, reviewed from the outside" (Cowork artifact, 46 suggestions in 8 categories)
Working tree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion` (create a feature branch per phase off it; `main` stays equal to what is deployed)
Production: `crc-overlays.vercel.app` (CRC) and `tbi-overlays.vercel.app` (TBI), both at `5117d32` (Companion module 1.3.0 release, 14:35 CT); `origin/main` = `fc914df` (docs on top of it)
Read first: `CLAUDE-HANDOFF.md` (release state, secrets rules, commands, sections "Companion module 1.3.0" and "Deploy record 2"), then this file.

## Revision 2 — what changed between the review and this build order

Shipped on 2026-09-13 after the review was written; the review's picture of these areas is stale:

- **Companion module is at 1.3.0**, artifacts `public/downloads/crc-overlays-1.3.0.tgz` and `public/workspaces/temple-bnai-israel/downloads/tbi-overlays-1.3.0.tgz`. Version and paths have one source of truth: the constants exported by `scripts/build-tbi-companion-module.mjs`. Every future module change bumps the version there, rebuilds with `cd companion && npm run package`, copies the archive to the new CRC filename, runs `node scripts/prepare-workspace-companion.mjs` (regenerates TBI pages and derives the TBI archive) and `node scripts/audit-companion-packages.mjs`. `lib/workspace.ts` default path and `scripts/stage-workspace-source.mjs` allowlist are the two literals that must move with it.
- **TBI has its own module id `tbi-overlays`** ("TBI Overlays", manufacturer Temple B'nai Israel). It is a deterministic derivation of the CRC archive, not a byte-identical copy. The derivation asserts exact literal counts in the built `main.js`: `https://crc-overlays.vercel.app` x3, `crc_overlay_controls` x1, `CRC Overlay Controls` x1, and that `crc-overlays-v1` and `X-CRC-Catalog-Version` are untouched. Any module change that adds or removes one of those literals must update the assertion constants in the same commit, deliberately. Both modules install side by side in one Companion; this is Daniel's test setup.
- **Cue buttons are toggles.** New action `toggle_cue` (show; press again animates out, decided by the requested cue on the relay). Presets are named "Toggle <graphic>". Both checked-in page files use `toggle_cue`; `show_cue` and `animate_out` remain for hand-built buttons. Feedback colours unchanged: amber requested, green rendered, red disconnected.
- **Red "disconnected" has a 3 s grace** in the module; `rendered` is never graced. Close code and reason are logged to the Companion connection log. The pulse Daniel reported (every ~10 s for 1-2 s) is **not** reproduced: read-only relay probes (control subscription; simulated output + controller, 75 s each) showed stable presence and no closes. Cause is on his output browser or Companion host; the log line "Realtime closed (code reason)" will name it.
- **The module does not poll.** Since `ac027d8` it holds a realtime WebSocket to the relay (hello + heartbeat every 10 s, subprotocol `crc-overlays-v1`). R5 below is rewritten accordingly.
- **Relay code has an unreleased fix** (renderer expiry made inclusive, `relay/src/protocol.ts` `rendererExpired`). The Cloudflare workers were not redeployed. There is no relay deploy script; see the new R8.
- **Accounts:** Daniel has passwords on both workspaces. Michael's CRC owner invitation exists and is unredeemed (checked read-only 15:00 CT). The T4 rename is settled ("(Partial)").
- **Sign-in/nav already exists:** `components/workspace-nav.tsx` is a role-filtered client nav that resolves `/api/access` itself (control key => owner). X1/U3 build on it; do not add a second nav.
- **Setup wording** already says "Add a <product name> connection" for both workspaces.


## Daniel's rulings

Approved: everything in the review **except** the items below. Treat the review artifact as the spec of record and this file as the build order.

Declined — do not build:
- **S5** Bitfocus module-store submission. Private `.tgz` import stays.
- **F4** Timed auto-out per graphic.
- **F5** Alignment test card / idle-aware output.
- **R1** Deploy freeze keyed to setlists.
- **R3** A third `crc-rehearsal` workspace.
- **R4** Nightly synthetic production check.

Pending Daniel's read (explained to him in chat; build it in Phase D unless he says otherwise): **F1** persistent "bug" layer.

Assumptions Daniel can overturn in one line:
- Visual system: the **dark** operator system becomes the one system (X1). Health, Setup, Help move onto it.
- Neutral product name: **"Congregation Overlays"**, shown as "CRC Overlays" / "TBI Overlays" via the workspace prefix (I1). If he names something else, it is a string change.
- T4: Daniel ruled "fix it" — rename the cue to **"Ahava Rabbah Ahavtanu (Partial)"** everywhere (`lib/cues.json`, library, catalog), matching the operator label the console already maps to. No further decision needed.
- Michael's invitation was sent by Daniel on 2026-09-13; his account may be enabled and redeemed by the time you read this. Nothing else changes.

## Standing rules for this build

1. **Live safety.** Production carries real state at any hour: on 13 Sept *As We Bless* was live on CRC from Daniel's own Companion at 1:52 PM CT (no service; renderers 0). A real service has a connected renderer. Never issue `in`/`out`/`clear`/`cut` against production from a test. Pre-deploy gate is read-only: `/api/state` on both workspaces must show zero connected renderers before `deploy-workspaces.mjs` runs. Migrations remain additive and idempotent.
2. **Evidence categories stay as they are** in `APPROVED-BACKLOG.md`: (a) automated, (b) browser-verified, (c) implemented-not-browser-verified, (d) beta-only. Update the ledger with each phase; do not mark anything (d) as done.
3. **Secrets:** nothing under `work/`, `.env*`, or `.vercel/` is printed or committed. No invitations sent, no emails, no Michael/Simone addresses invented.
4. **Gate per phase:** `tsc --noEmit`, `npm test`, `npm run lint`, `node scripts/audit-companion-packages.mjs`, `npm run build`, then a Playwright pass of the touched pages at 1440×900, 1024×768, 390×844. Screenshots go in `work/handoffs/<phase>/`. When `companion/` is touched: `cd companion && npm test && npm run lint && npm run package`, then the rebuild sequence in Revision 2. When `relay/` is touched: `cd relay && npm test && npm run check`. Deploy gate (read-only, both workspaces): renderers 0 on `/api/state`; on a Saturday also confirm no cue is live unless Daniel says it is his test.
5. **Vocabulary from day one:** users see *graphic*, *Lower third / Left panel / Right panel*, *Show / Inspect / Animate out / Clear now*. *Cue* survives only in Companion action names and the API. Any new copy you write follows this.
6. Phases are dependency order, not a calendar. Ship each phase when its gate is green; do not hold a finished phase for the next one.
7. **No new module id or archive name conventions.** CRC archive `crc-overlays-<version>.tgz`, TBI `tbi-overlays-<version>.tgz`, module ids fixed. Companion identifies installed modules by id; a changed id orphans every operator's connection.

## Phase A — Consistency and defects (no schema changes)

Goal: one product on every page; every visible defect from the review closed. Cheap, high-leverage; do this first.

- **X1 One visual system.** Move `/health`, `/setup`, `/help` onto the dark tokens, nav placement and type scale used by `/`, `/author`, `/services`, `/access`. Extend `components/workspace-nav.tsx` into the one shared layout/nav (it already carries role filtering and the identity fetch); delete the light-page CSS modules once nothing uses them. Keep the `.overlay` ink/paper CSS variables (fixed 13 Sept) intact when touching `app/globals.css`. Accept: no page renders a cream ground; nav pills do not wrap at 1440.
- **I1 One name, one vocabulary.** Headers: `<Workspace short name> Overlays` everywhere ("CRC Overlays", "TBI Overlays"); page titles follow. Layout labels: `lib/` gets one `layoutLabel()` used by console rows, services grid, fit-check table, library cards, editor. Remove "Overlay control" / "Congregation Graphics" / "Graphics library" as *product* names (they may remain as page names under the product name).
- **I2 One sign-in story.** Account sign-in is the visible path on every gated page. Control-key box lives only on `/` under a collapsed "Administrator connection". `/services`, `/sources-review`, `/author/fit-check` show the same "Sign in to continue" card `/health` already has instead of "Unauthorized / Unable to load." or a blank page. Console's session probe should not 401-spam when a key is in use (probe once).
- **U2 Status block.** Merge "Requested graphic / Graphics browser" and the explanatory sentence into one block with a state chip: amber *Requested*, green *Rendered*, red *Disconnected* (same colours as the Companion feedback, and the same 3 s grace before red so the console and the deck never disagree). Include a small thumbnail of the rendered revision (reuse the library thumbnail renderer).
- **U3 Identity in the header.** "Daniel · Administrator" + Sign out in the shared nav on every page; remove sign-out from the "Connect vMix…" disclosure.
- **U4 Disabled controls explain themselves.** `title` + inline reason on Show/Animate out/Clear now when disconnected; visible failure text on Copy output URL and Check graphics connection when unauthenticated.
- **U5 + X6 Counts and names.** One number, "published, visible", on console footer, library tab, services finder, health. Aliases counted nowhere users see. Health "Current graphic" resolves to the friendly name. Health authoring counters read the same store the library reads.
- **X3 Publish dock done-state.** After publish: "Published · version N · live on next Show", actions *Duplicate* / *Back to library*. Toasts clear on navigation.
- **X4 Defect sweep.** (1) leaked `.preview-fullscreen-close` ghost on non-fullscreen preview; (2) fit-check empty "Measurement stage" box, and a sign-in card when opened without a key; (3) editor horizontal scroll at 1024 (header nav overflow); (4) console horizontal overflow at ~800 px wide; (5) library tab empty state says "No drafts yet" not "No matching drafts" when the search box is empty; (6) README rehearsal-mode sentence corrected; (7) `/setup` checkboxes persist per member (needs one small table or a JSON column on the member record — the only schema touch in Phase A, additive; `scripts/migrate-authoring.mjs` applies a **hardcoded list** of `db/*.sql` files, so add the new file to that list or the migration silently never runs).
- **I5 Hide slugs, link provenance.** Search results show printed book title + folio, not `legacy-shabbat-morning`; "view edition details" opens the source record.
- **S6** Replace "Michael's current setup" with "Default for this congregation" (driven by workspace config, which already knows the compositor).
- **S4 Rehearsal mode, made real (agent-facing) — ship as Phase A2, its own release, after the rest of Phase A.** It is the largest item in this phase and must not hold the UI fixes. Its in-process relay stub must speak the current contract exactly: hello `id` is a UUID (the relay rejects anything else with 4400), heartbeat every `heartbeatMs`, presence and pong frames, renderer acks `{id, revision, cue, phase}` with phase in settled/transition/error. Reuse `relay/src/protocol.ts` rather than re-implementing it. Daniel: rehearsal mode is for AI agents, so make it honest and complete. Either (preferred) extend the memory backend to every store the pages touch — playback state, command, ack, health, access/sessions — so `CRC_AUTHORING_REHEARSAL=1` really runs with no `DATABASE_URL`; or, if that is more than a day, ship `docker-compose.rehearsal.yml` (Postgres 16 + the nine `db/*.sql`) and a single `npm run rehearsal` that brings it up, seeds a throwaway owner and the 29-cue catalog, and prints the local URLs. Either way: the console must not show "Live control is disconnected" in rehearsal — provide an in-process relay stub (`RELAY_URL=memory`) that fans state to `/output` and the console over the same WebSocket contract, so Show/Clear/Inspect and the output page all work locally. Add `docs/REHEARSAL-MODE.md` written for an agent: one command, what is fake, what is real, and the rule that rehearsal never holds production credentials. Accept: a fresh clone runs `npm run rehearsal`, publishes a graphic, Shows it, and sees it on `/output`, with zero network calls to Neon or Cloudflare.
- **R6 Unique library names.** Warn on duplicate names at save; on publish with a duplicate, require confirmation and append the layout automatically ("Modeh Ani · Lower third").
- **R2 Next.js patch** 16.2.6 → 16.3.5 on a quiet weekday behind the read-only gate. Its own commit and its own deploy. Do this **first** in Phase A; it is a critical advisory even though the vulnerable surfaces (middleware/proxy, Server Actions, i18n) are absent here.
- **R8 Relay release procedure (new).** The Cloudflare workers `crc-live-relay` and `tbi-overlays-live-relay` have no deploy script; `relay/wrangler.jsonc` describes only CRC. Add a `tbi` wrangler environment (name, `ALLOWED_ORIGINS`) and `scripts/deploy-relays.mjs` that runs `wrangler deploy` for both from a clean tree behind the same renderers-0 gate, records the deployed commit in `work/deploy-staging/releases/<sha>/relay.json`, and never prints secrets. First use: ship the pending renderer-expiry fix. Durable Object state survives a worker deploy; live sockets reconnect within their first retry, which the module's 3 s grace absorbs. R5 and S1 both need this.
- **T4** Rename "Ahava Rabbah Ahavtanu (ncomplete)" to "Ahava Rabbah Ahavtanu (Partial)" (decided). Touch `lib/cues.json`, the TBI starter/catalog copies under `workspaces/temple-bnai-israel/`, and delete the `(ncomplete)` regex in `lib/cue-search.ts`. Cue ids do not change, so Companion pages and presets are unaffected; the catalog version changes, so Companion needs one "Refresh cue catalog". Re-run `/author/fit-check` against the **production** catalog (Daniel signs in) and record the number in the ledger.

Ledger: everything here is (a)+(b). Deploy Phase A as one paired release.

## Phase B — Editor and library workflow

- **X2 Editor: one form, one preview, Look in a drawer.** Steps 1–2 (passage, name/title) plus the preview are the default view. Density, alignment, spacing, artwork, template move into a collapsible "Look" drawer that opens already at template defaults. "Section / + Add section" becomes "Panels" and is hidden until a passage set exceeds one panel. Keep undo/redo, autosave, recovery copy.
- **X2b Template tiles named by look.** "Left panel · Hebrew + transliteration", "Lower third · one line", "Right panel · English reading", each with a real miniature. No tile is named after a cue.
- **I3 Add from siddur opens as a shelf.** Default view: twelve books with counts → service arc as printed → units. Rubric/note-like units hidden behind "Show instructions and notes". Search stays on top. Uses the existing Book/Service selects and the `noteLike` flag already in the source library.
- **I4 Duplicate shows what it copied.** A duplicated source-backed graphic opens with its passages ticked and editable.
- **F3 Template family for non-prayer moments:** Speaker name + role; Announcement; Scripture citation ("Genesis 22:1–19 · p. 70"); "Service begins at" (static time, no countdown — F4/F5 are declined, keep it a plain graphic). Custom-text provenance label retained.
- **T1 Transliteration breaks where the Hebrew breaks.** Renderer honours the source feed's per-block he/tr pairing so the two columns move together. Re-run fit check; expect some panels to need re-pagination — report them, do not silently re-cut published graphics (publish as new revisions through the normal review path).
- **T2 Under-fill is a fit warning.** Panels under ~35 % filled flag "Sparse — consider Lower third"; warning, not a publish block.
- **T3 Book faces trial.** Bundle David Libre (Hebrew) and a matching serif for titles behind a workspace flag; render the full catalog both ways in `/author/fit-check`; produce side-by-side stills at 1920 and at a 480-px-wide stream window for Daniel to judge. Decision is his; do not flip the default.
- **U1 Show inside Inspect.** Primary "Show this graphic" under the inspected frame on the console, same guards as the row button.
- **U6 Keyboard navigation.** Up/Down moves the inspected cue, Enter inspects; Show is never bound to a key.

Ledger: (a)+(b); T1/T3 readability judgments remain (d).

## Phase C — Setup and devices

- **R5 Controller presence in the relay.** The module already holds a realtime socket with hello + 10 s heartbeats; the relay already tracks `role: 'control'` attachments and their `seen` time but never reports them. Work: extend the hello frame with `{client: 'companion', version}` (protocol change; older modules omit it and still connect), include controllers in presence broadcasts and in `/state`, surface them through `/api/state` and `/api/health` (replace the "Controller presence is not exposed by the live relay" branch in `lib/operations-health.ts`), and show "Companion connected · <module version> · last seen Ns ago" on `/health`. Durable Object memory only; expire like renderers via `rendererExpired`. Requires a relay deploy (R8) and module 1.4.0; bundle with S1. Also add the module's close-code log line to the health page's guidance so the red-pulse diagnosis has a home.
- **S3 Self-verifying, persistent setup.** Each `/setup` step verifies itself where it can (step 2 via R5, step 4 as today) and stores completion per member (schema touch from Phase A X4-7). Returning installer sees where they left off.
- **S2 Presets first.** Setup step 2 leads with the module's dynamic presets ("drag *Toggle Barechu* onto any button"; presets are toggles since 1.3.0); the two page files become an optional "Recreate CRC's exact button layout" download. Update `docs/SETUP.md`, `OPERATOR-QUICKSTART.md`, and the in-app help text together.
- **S1 Pairing codes.** Six-digit, single-use, ten-minute code issued from `/setup` by an owner/editor. Two consumers: the Companion module config (new field alongside the legacy key) and the output URL (the browser input loads a one-field page, enters the code once, receives a device credential stored in `sessionStorage` as today). Each pairing creates a named device credential with last-seen and revoke on `/access`. `CONTROL_KEY`/`OUTPUT_KEY` remain valid as the transitional path; nothing existing breaks. Companion module bumps to **1.4.0** (1.3.0 is released) together with R5; rebuild both archives per Revision 2 and update the derivation assertions if the config field adds a branded literal.
- **F2 Companion variables.** `$(overlays:current_name)`, `current_panel`, `panel_count`, `connection`, `requested_name`. Presets updated so button text can show them. Same source for CRC and TBI; the TBI archive stays a derivation (Revision 2), never a fork. The variable prefix is the connection label, so it already differs per workspace.

Ledger: (a)+(c) until Michael/Simone connect real hardware — those rows stay (d).

## Phase D — Layers and integration

- **F1 Persistent "bug" layer** (pending Daniel's read). A second layer `bug` that Show/Animate out/Clear now never touch. Content: the parchment QR card from `shireishabbat/stream-kit` (QR → `https://siddur.centralreform.org`, caption configurable per workspace) plus an optional page chip "p. 45" fed by the current cue's folio (G2) or set by hand. Own Companion actions: *Bug on*, *Bug off*, *Set page*. Own console control. Renderer composites bug over/under prayer layer per layout (bottom-right corner is reserved; the three panel layouts already avoid it — verify with the fit check). QR generation server-side from the workspace config so a domain change is a config edit. Physical scan test from couch distance is Daniel's (d).
- **G2 Shared key: shireishabbat unit / moment IDs.** Cues already store unit IDs; add `momentId` and `{book: folio}` per cue, populated from `moments.json` when the shireishabbat producer publishes it (order exists in that repo's queue; until then, populate `book/folio` from `siddur-library.json`, which carries folios). Expose in `/api/catalog`.
- **G1 Setlist import → prepared service + coverage.** New `/services` action "Import from centralreform.live": list recent setlists (read-only bearer stored server-side), pick one, match rows: `liturgyRef {book, folio}` → unit → published cue; songs by the console's forgiving search. **Credential:** do not use a minted admin bearer (30-day TTL, admin scope, wrong shape). Add to the centralreform.live repo a long-lived, read-only *service* token kind (`setlist_reader`: `list_setlists`, `get_setlist`, `get_congregation_context` only), mint one host-side, and store it as `CRC_LIVE_READ_TOKEN` in both Vercel projects. No human copies it through chat. Output: a service collection plus a coverage report per row (*Covered / Needs a graphic / Not applicable*), saved and exportable. Never auto-publishes. This supersedes the hand-maintained GAP-01 coverage map.
- **G3 Public "now" endpoint.** `GET /api/now` → `{unitId, momentId, book, folio, updatedAt}` only; no names, no keys; `Cache-Control: max-age=2`. **Budget check before building:** a congregation of phones polling every 2 s is the first thing that could breach the $25/$50 cap. Serve it from the relay worker (Cloudflare, already holds the state, generous free tier) or behind Vercel edge caching with `s-maxage`, and put the measured request rate in the ledger. Document it for the web-siddur repo (that side's "Follow the service" toggle is a separate order to that repo — write it as `HANDOFF-WEBAPP-FOLLOW-SERVICE.md` in this folder for Daniel to hand over).
- **G4 Source-feed pipeline in CI.** GitHub Action in shireishabbat (or a scheduled action here with a read token) runs `scripts/build-siddur-library.py` and opens a PR against this repo with the regenerated `content/siddur-library.json`; merging it feeds the existing source-review inbox. Remove the sibling-checkout assumption from the script (paths via env).
- **G5 MCP: connect and bridge.** Confirm the OAuth MCP against Daniel's Claude desktop (acceptance step — Daniel performs the connect; you verify the DCR/token path works with a real client and record it). Add tool `prepare_service_from_setlist(setlistId)` that runs G1's matcher and returns the draft collection + coverage.
- **G6 Help/Setup cross-links.** Help names centralreform.live and the web siddur as parts of one system with one-line roles; setup tells an operator which of the three they need.
- **F6 Names list template.** Paged list (N names per panel, next-panel action) for Mi Shebeirach / yahrzeit. Names are typed by an Editor into a per-service field, never stored in the published catalog beyond that collection, and purged with the collection. Approved by Daniel; confirm the on-screen wording with him before first use.
- **R7 Server-side fit check for MCP/API publishes.** A serverless function with headless Chromium renders the reviewed version at 1920×1080 and returns the same fit verdict the editor computes; `publish_draft` via MCP/API is blocked on a failing verdict exactly as the web dock is. Reuse `app/author/preview.ts` (`findFitErrors`, 6 px font-metric tolerance, same-owner overlap skip) so the two verdicts cannot drift. If the Chromium function's cold start or cost is unacceptable on this plan, the fallback is: MCP publish returns "needs browser fit review" and links `/author/fit-check?draft=...`; record which path was taken.

Ledger: (a)+(b) for the code; F1 scan test, F6 wording, G1 credential, G5 connect are Daniel's.

## Phase E — Services page split

- **X5** `/services` becomes two pages: *Prepared services* (finder + collections + G1 import) and *Service log* (the fallback/issue form + CSV), the latter linked from the console's disconnected banner. Global finder no longer duplicates the console list; it searches and adds, nothing else.

## Not in this build (recorded so nobody re-proposes them)

Second output per workspace; ordered rundown mode; multi-tenant merge; open "fork your own overlays" repo; NDI output; retiring the stale `crc-overlays-*` worktrees (housekeeping Daniel can do when convenient — only `-vercel` is live).

## What Daniel owes this build

- His read on F1 (explained in chat). Default is build.
- Michael's invitation is sent (2026-09-13, unredeemed as of 15:00 CT; the link expires 24 h after issue, so reissue from `/access` if needed). When he has redeemed it, the (d) rows can be scheduled with him.
- Confirmation that the Companion red pulse is gone after installing module 1.3.0, or the "Realtime closed (...)" line from the Companion connection log if it is not.
- Cloudflare CLI access for R8 (wrangler must be logged in on the machine that deploys; say who deploys the relay).
- Connecting the Overlays MCP to his own Claude desktop (G5 acceptance).

## Return

One `RETURN-CODE-<phase>-<date>.md` per phase in `work/handoffs/`, ten lines by default: gate tail, SHAs, deploy record, screenshots path, anything Daniel must see. Update `CLAUDE-HANDOFF.md` "Release state" on every deploy.
