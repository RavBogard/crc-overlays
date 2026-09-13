# Handoff → Code: the 2026-09-13 product-review build

Status: APPROVED by Daniel 2026-09-13, ready to execute
Source review: "Overlays, reviewed from the outside" (Cowork artifact, 46 suggestions in 8 categories)
Working tree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion` (create a feature branch per phase off it; `main` stays equal to what is deployed)
Production: `crc-overlays.vercel.app` (CRC) and `tbi-overlays.vercel.app` (TBI), both at `fbce9c1`
Read first: `CLAUDE-HANDOFF.md` (release state, secrets rules, commands), then this file.

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

1. **Live safety.** Production has had a connected output rendering graphics during services (observed 13 Sept, 1:52 PM CT, *As We Bless* live). Never issue `in`/`out`/`clear`/`cut` against production from a test. Pre-deploy gate is read-only: `/api/state` on both workspaces must show zero connected renderers before `deploy-workspaces.mjs` runs. Migrations remain additive and idempotent.
2. **Evidence categories stay as they are** in `APPROVED-BACKLOG.md`: (a) automated, (b) browser-verified, (c) implemented-not-browser-verified, (d) beta-only. Update the ledger with each phase; do not mark anything (d) as done.
3. **Secrets:** nothing under `work/`, `.env*`, or `.vercel/` is printed or committed. No invitations sent, no emails, no Michael/Simone addresses invented.
4. **Gate per phase:** `tsc --noEmit`, `npm test`, `npm run lint`, `node scripts/audit-companion-packages.mjs`, `npm run build`, then a Playwright pass of the touched pages at 1440×900, 1024×768, 390×844. Screenshots go in `work/handoffs/<phase>/`.
5. **Vocabulary from day one:** users see *graphic*, *Lower third / Left panel / Right panel*, *Show / Inspect / Animate out / Clear now*. *Cue* survives only in Companion action names and the API. Any new copy you write follows this.
6. Phases are dependency order, not a calendar. Ship each phase when its gate is green; do not hold a finished phase for the next one.

## Phase A — Consistency and defects (no schema changes)

Goal: one product on every page; every visible defect from the review closed. Cheap, high-leverage; do this first.

- **X1 One visual system.** Move `/health`, `/setup`, `/help` onto the dark tokens, nav placement and type scale used by `/`, `/author`, `/services`, `/access`. One shared layout/nav component; delete the light-page CSS modules once nothing uses them. Accept: no page renders a cream ground; nav pills do not wrap at 1440.
- **I1 One name, one vocabulary.** Headers: `<Workspace short name> Overlays` everywhere ("CRC Overlays", "TBI Overlays"); page titles follow. Layout labels: `lib/` gets one `layoutLabel()` used by console rows, services grid, fit-check table, library cards, editor. Remove "Overlay control" / "Congregation Graphics" / "Graphics library" as *product* names (they may remain as page names under the product name).
- **I2 One sign-in story.** Account sign-in is the visible path on every gated page. Control-key box lives only on `/` under a collapsed "Administrator connection". `/services`, `/sources-review`, `/author/fit-check` show the same "Sign in to continue" card `/health` already has instead of "Unauthorized / Unable to load." or a blank page. Console's session probe should not 401-spam when a key is in use (probe once).
- **U2 Status block.** Merge "Requested graphic / Graphics browser" and the explanatory sentence into one block with a state chip: amber *Requested*, green *Rendered*, red *Disconnected* (same colours as the Companion feedback). Include a small thumbnail of the rendered revision (reuse the library thumbnail renderer).
- **U3 Identity in the header.** "Daniel · Administrator" + Sign out in the shared nav on every page; remove sign-out from the "Connect vMix…" disclosure.
- **U4 Disabled controls explain themselves.** `title` + inline reason on Show/Animate out/Clear now when disconnected; visible failure text on Copy output URL and Check graphics connection when unauthenticated.
- **U5 + X6 Counts and names.** One number, "published, visible", on console footer, library tab, services finder, health. Aliases counted nowhere users see. Health "Current graphic" resolves to the friendly name. Health authoring counters read the same store the library reads.
- **X3 Publish dock done-state.** After publish: "Published · version N · live on next Show", actions *Duplicate* / *Back to library*. Toasts clear on navigation.
- **X4 Defect sweep.** (1) leaked `.preview-fullscreen-close` ghost on non-fullscreen preview; (2) fit-check empty "Measurement stage" box, and a sign-in card when opened without a key; (3) editor horizontal scroll at 1024 (header nav overflow); (4) console horizontal overflow at ~800 px wide; (5) library tab empty state says "No drafts yet" not "No matching drafts" when the search box is empty; (6) README rehearsal-mode sentence corrected; (7) `/setup` checkboxes persist per member (needs one small table or a JSON column on the member record — the only schema touch in Phase A, additive).
- **I5 Hide slugs, link provenance.** Search results show printed book title + folio, not `legacy-shabbat-morning`; "view edition details" opens the source record.
- **S6** Replace "Michael's current setup" with "Default for this congregation" (driven by workspace config, which already knows the compositor).
- **S4 Rehearsal mode, made real (agent-facing).** Daniel: rehearsal mode is for AI agents, so make it honest and complete. Either (preferred) extend the memory backend to every store the pages touch — playback state, command, ack, health, access/sessions — so `CRC_AUTHORING_REHEARSAL=1` really runs with no `DATABASE_URL`; or, if that is more than a day, ship `docker-compose.rehearsal.yml` (Postgres 16 + the nine `db/*.sql`) and a single `npm run rehearsal` that brings it up, seeds a throwaway owner and the 29-cue catalog, and prints the local URLs. Either way: the console must not show "Live control is disconnected" in rehearsal — provide an in-process relay stub (`RELAY_URL=memory`) that fans state to `/output` and the console over the same WebSocket contract, so Show/Clear/Inspect and the output page all work locally. Add `docs/REHEARSAL-MODE.md` written for an agent: one command, what is fake, what is real, and the rule that rehearsal never holds production credentials. Accept: a fresh clone runs `npm run rehearsal`, publishes a graphic, Shows it, and sees it on `/output`, with zero network calls to Neon or Cloudflare.
- **R6 Unique library names.** Warn on duplicate names at save; on publish with a duplicate, require confirmation and append the layout automatically ("Modeh Ani · Lower third").
- **R2 Next.js patch** 16.2.6 → 16.3.5 on a quiet weekday behind the read-only gate. Its own commit and its own deploy.
- **T4** Rename "Ahava Rabbah Ahavtanu (ncomplete)" once Daniel supplies the name (`lib/cues.json` + operator label map); re-run `/author/fit-check` against the **production** catalog and record the number in the ledger.

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

- **R5 Controller presence in the relay.** Companion's poll becomes a heartbeat recorded by the relay (role `control`, module version, last seen). `/api/health` and the health page show "Companion connected · <module version> · last seen Ns ago". Do not add a database write per heartbeat — Durable Object memory only, presence expires like renderer presence does.
- **S3 Self-verifying, persistent setup.** Each `/setup` step verifies itself where it can (step 2 via R5, step 4 as today) and stores completion per member (schema touch from Phase A X4-7). Returning installer sees where they left off.
- **S2 Presets first.** Setup step 2 leads with the module's dynamic presets ("drag *Barechu · Show* onto any button"); the two page files become an optional "Recreate CRC's exact button layout" download. Update `docs/SETUP.md`, `OPERATOR-QUICKSTART.md`, and the in-app help text together.
- **S1 Pairing codes.** Six-digit, single-use, ten-minute code issued from `/setup` by an owner/editor. Two consumers: the Companion module config (new field alongside the legacy key) and the output URL (the browser input loads a one-field page, enters the code once, receives a device credential stored in `sessionStorage` as today). Each pairing creates a named device credential with last-seen and revoke on `/access`. `CONTROL_KEY`/`OUTPUT_KEY` remain valid as the transitional path; nothing existing breaks. Companion module bumps to 1.3.0; audit script updated.
- **F2 Companion variables.** `$(overlays:current_name)`, `current_panel`, `panel_count`, `connection`, `requested_name`. Presets updated so button text can show them. Byte-identical module for CRC and TBI as today.

Ledger: (a)+(c) until Michael/Simone connect real hardware — those rows stay (d).

## Phase D — Layers and integration

- **F1 Persistent "bug" layer** (pending Daniel's read). A second layer `bug` that Show/Animate out/Clear now never touch. Content: the parchment QR card from `shireishabbat/stream-kit` (QR → `https://siddur.centralreform.org`, caption configurable per workspace) plus an optional page chip "p. 45" fed by the current cue's folio (G2) or set by hand. Own Companion actions: *Bug on*, *Bug off*, *Set page*. Own console control. Renderer composites bug over/under prayer layer per layout (bottom-right corner is reserved; the three panel layouts already avoid it — verify with the fit check). QR generation server-side from the workspace config so a domain change is a config edit. Physical scan test from couch distance is Daniel's (d).
- **G2 Shared key: shireishabbat unit / moment IDs.** Cues already store unit IDs; add `momentId` and `{book: folio}` per cue, populated from `moments.json` when the shireishabbat producer publishes it (order exists in that repo's queue; until then, populate `book/folio` from `siddur-library.json`, which carries folios). Expose in `/api/catalog`.
- **G1 Setlist import → prepared service + coverage.** New `/services` action "Import from centralreform.live": list recent setlists (read-only bearer stored server-side), pick one, match rows: `liturgyRef {book, folio}` → unit → published cue; songs by the console's forgiving search. **Credential:** do not use a minted admin bearer (30-day TTL, admin scope, wrong shape). Add to the centralreform.live repo a long-lived, read-only *service* token kind (`setlist_reader`: `list_setlists`, `get_setlist`, `get_congregation_context` only), mint one host-side, and store it as `CRC_LIVE_READ_TOKEN` in both Vercel projects. No human copies it through chat. Output: a service collection plus a coverage report per row (*Covered / Needs a graphic / Not applicable*), saved and exportable. Never auto-publishes. This supersedes the hand-maintained GAP-01 coverage map.
- **G3 Public "now" endpoint.** `GET /api/now` → `{unitId, momentId, book, folio, updatedAt}` only; no names, no keys; `Cache-Control: max-age=2`. Document it for the web-siddur repo (that side's "Follow the service" toggle is a separate order to that repo — write it as `HANDOFF-WEBAPP-FOLLOW-SERVICE.md` in this folder for Daniel to hand over).
- **G4 Source-feed pipeline in CI.** GitHub Action in shireishabbat (or a scheduled action here with a read token) runs `scripts/build-siddur-library.py` and opens a PR against this repo with the regenerated `content/siddur-library.json`; merging it feeds the existing source-review inbox. Remove the sibling-checkout assumption from the script (paths via env).
- **G5 MCP: connect and bridge.** Confirm the OAuth MCP against Daniel's Claude desktop (acceptance step — Daniel performs the connect; you verify the DCR/token path works with a real client and record it). Add tool `prepare_service_from_setlist(setlistId)` that runs G1's matcher and returns the draft collection + coverage.
- **G6 Help/Setup cross-links.** Help names centralreform.live and the web siddur as parts of one system with one-line roles; setup tells an operator which of the three they need.
- **F6 Names list template.** Paged list (N names per panel, next-panel action) for Mi Shebeirach / yahrzeit. Names are typed by an Editor into a per-service field, never stored in the published catalog beyond that collection, and purged with the collection. Approved by Daniel; confirm the on-screen wording with him before first use.
- **R7 Server-side fit check for MCP/API publishes.** A serverless function with headless Chromium renders the reviewed version at 1920×1080 and returns the same fit verdict the editor computes; `publish_draft` via MCP/API is blocked on a failing verdict exactly as the web dock is.

Ledger: (a)+(b) for the code; F1 scan test, F6 wording, G1 credential, G5 connect are Daniel's.

## Phase E — Services page split

- **X5** `/services` becomes two pages: *Prepared services* (finder + collections + G1 import) and *Service log* (the fallback/issue form + CSV), the latter linked from the console's disconnected banner. Global finder no longer duplicates the console list; it searches and adds, nothing else.

## Not in this build (recorded so nobody re-proposes them)

Second output per workspace; ordered rundown mode; multi-tenant merge; open "fork your own overlays" repo; NDI output; retiring the stale `crc-overlays-*` worktrees (housekeeping Daniel can do when convenient — only `-vercel` is live).

## What Daniel owes this build

- His read on F1 (explained in chat). Default is build.
- Michael's invitation is sent (2026-09-13). When he has redeemed it, the (d) rows can be scheduled with him.
- Connecting the Overlays MCP to his own Claude desktop (G5 acceptance).

## Return

One `RETURN-CODE-<phase>-<date>.md` per phase in `work/handoffs/`, ten lines by default: gate tail, SHAs, deploy record, screenshots path, anything Daniel must see. Update `CLAUDE-HANDOFF.md` "Release state" on every deploy.
