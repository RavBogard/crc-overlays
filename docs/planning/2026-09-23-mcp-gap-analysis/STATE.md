# MCP completeness: current state

Gap analysis: [GAP-ANALYSIS.md](GAP-ANALYSIS.md) (recommendation IDs R-F*, R-A*, R-H*, R-L*, R-B*, R-S*, R-V*, R-C*).
Code order: [HANDOFF-CODE-2026-09-23-mcp.md](HANDOFF-CODE-2026-09-23-mcp.md), amended by
[HANDOFF-CODE-ADDENDUM-2026-09-23.md](HANDOFF-CODE-ADDENDUM-2026-09-23.md) (seam owners, `crc.live` role list, Track T).
TBI source deck (contains connection config; gitignored, never copy out):
`work/companion-conversion/tbi-2026-09-14/TBIComputer-2026-09-14-1618-source.companionconfig`.

## Goal
Any editor at CRC or TBI can create, modify, pull, publish, retire and run overlays, and keep the Companion
deck in step with them, through the MCP, with no code change and no novel workaround.

## Decisions (Daniel, 2026-09-23, answered in session)
1. Users: any editor at both congregations. Every tool is workspace-aware and self-explaining.
2. Live control is in the MCP under a separate opt-in scope `crc.live`, offered to every role that has
   `control` on the web today (Admin, Editor, Operator). Matches the web; nothing tightened.
3. Live target: `target:'live'` is required; `'rehearsal'` is refused in plain words. A rehearsal relay
   room is a later, separate plan.
4. Agents yield to the deck: while a Companion pressed a button within the guard window, agent live
   calls are refused unless `override:true` with a reason; agent commands are visible on the deck.
5. Publish end-to-end on a server fit pass plus the server-rendered image; every agent publish lands in
   a review list with the image and a rollback.
6. Retire removes a cue everywhere: editor library, Companion's picker and the relay catalog. Relay
   behaviour is tested before the change ships.
7. Layouts as data for Corner and every new layout (card primitive, pixel-identical Corner first). The
   existing lower third, left and right panels stay built-in until golden stills prove a migration.
8. Companion: a stored per-workspace deck model owning the whole deck (camera, vMix, X32 included),
   plus richer module presets. Decks are complete, stable libraries, changed occasionally for big
   changes; Michael and Simone keep every option in front of them and decide while leading. No weekly
   service page; no `generate_service_page`.
9. TBI: convert Simone's Singular deck to TBI Overlays inside this plan, keeping her layout and colours,
   adding Rendered feedback lights, and surfacing Needs review / Needs a graphic and deck defects.
   Simone is already on Companion 5.0.5.
10. Privacy: the cue log may store each command's `commandId` (correlation id; no member or connection
    identity). Agents may set and clear names lists (same on-air refusal as the web).
11. In scope: structured custom content, branding as data (with the font registry), asset tools.
12. Headline acceptance test: centralreform.live setlist → prepared service → missing graphics
    authored and published → deck check shows every graphic the service needs is placed on its
    standing service page → full-deck export ready for the next big import. Both workspaces.

13. TBI onboarding tools added as Track T. The TBI redo thread (docs/planning/2026-09-23-tbi-redo/)
    runs after this plan lands and relies on them (addendum, Daniel, after Code started).

## Work
Packets, ownership and acceptance: the Code handoff. Shape: a small foundation wave (MCP module split,
identity, registry, font registry, TBI derivation), then five tracks that can run side by side —
publish pipeline, layouts, services, live, Companion — with hygiene and branding after their
prerequisites, then Track T (TBI onboarding: T1 batch copy with house defaults, T2 workspace-owned sources
with book/page, T3 Singular reference material and content-based matching, T4 review board) after its
listed prerequisites. Track T is part of done: the TBI redo depends on every Track T tool.
Shared seams have one owner each: V1 owns relay/src/index.ts and relay/src/protocol.ts; A3 owns
app/api/catalog/route.ts and lib/sync-live-catalog.ts; L2 and C5 add envelope-only fields through them.
`crc.live` gates on the explicit role list owner/editor/operator, not `canAccess(role,'control')`.

## Progress (branch google-signin; nothing released)
- Wave 0 done 2026-09-23. P0 d5e185b/f4aa64c (lib/mcp/{catalog,authoring,services,...}.ts behind the
  tool-list snapshot tests/fixtures/mcp-tools.json; regenerate only with MCP_TOOL_SNAPSHOT=write).
  P1 256d33a (names its congregation; required `workspace` on every change, optional-but-checked on reads;
  get_workspace; instructions). P3 150c85a (lib/font-registry.ts). P4 bf38f41 (TBI module derivation by
  replacement, not counts). P2 d6b0a32 (lib/layout-registry.ts; Player sets `data-contain`).
  Gate at d6b0a32: tsc clean; npm test 896+38 pass, 0 fail; lint 0 errors; build ok;
  audit-companion-packages ok; renderer tests 31 pass.
- GATE: tools/list snapshot compares tools sorted by name, not registration order — proceeded because MCP
  clients attach no meaning to list order and the split necessarily reorders two authoring tools.
- GATE: P1 accepts the short name as well as the id for `workspace`, and reads take it optionally —
  proceeded because it removes friction without weakening the mismatch refusal.
- GATE: both "layout must be" refusals now list layouts in registry order (bottom, left, right, or corner);
  one test updated — proceeded because it is an error sentence, not product copy.
- P2 touches lib/player.ts (adds an inert `data-contain` attribute); it rides the next paired web release.
- Tracks opened 2026-09-23: A1, S1, V1, C1, L1 running in isolated worktrees (V1 already owns the relay
  files per the addendum; none of the five touches the catalog route or sync). Addendum folded in the same
  day; `AccessRole` confirmed as owner/editor/operator (lib/access.ts:5).
- S1 merged (eae5c16): lib/service-rows.ts; `rows[]` + `origin` on prepared services, lazy on read, importer
  writes them in setlist order. Gate after merge: tsc clean, npm test 907+38 pass, lint 0 errors.
- GATE: S1 keeps entries[]/coverage[] as the stored truth the web edits and adds rows[] as the linking
  spine — proceeded because it keeps /services unchanged; S2 needs a raw rows parser and positioned inserts.
- V1 merged (d9d3232): relay `outcome` applied|replayed|superseded (+`originalOutcome` on replays),
  `ifRevision`/`ifCue` preconditions (409 with a sentence, writes nothing), `command_id` on cue-log rows,
  `lastPress{control,companion,mcp}` on GET /state and command answers (HTTP only, not socket frames).
  scripts/rehearsal-relay.ts kept in step. Relay tests 77 pass; root npm test 912+38 pass; lint 0 errors.
  Needs the gated relay release before any web change depends on it (docs/RELAY-RELEASE.md).
- GATE: a superseded press counts as a controller press for the V3 guard; relay/tests/history.test.ts
  now expects `commandId:null` on old rows — proceeded because ruling 10 adds the key.
- A1 merged (d4cac8a): 18 new MCP tools (48 total), 7 widened; templateCueId optional (layout look);
  compact list_drafts/search_sources by default on MCP only. Server instructions updated to match.
  Gate after merge: tsc clean, npm test 927+38 pass, lint 0 errors.
- GATE: compact is the MCP default for list_drafts/search_sources (web keeps the full shape) — proceeded
  because R-A5 asks for it. GATE: named text sizes duplicated in lib/template-looks.ts, held equal to
  app/author/look-drawer.tsx by a test. GATE: shared-library descriptions don't say CRC (TBI rule).
- A3 (worktree branch, not merged): relay test first showed a retired on-air graphic stays on screen
  but its own Out was `Unknown cue`; `decideCommand` now accepts an Out for the pinned cue (relay +
  rehearsal port). Retire clears activeRevision and remembers it in `draft.retired` (no migration);
  catalog/relay sync/shared shelf drop retired ids (and built-in cues/aliases sharing them);
  `retire_cue`/`restore_cue`; services flag bindings; editor Drafts row shows "Retired" + Return.
- GATE: retire implemented as "active revision cleared + remembered" rather than a column or a
  document flag read by the signature query — proceeded because it needs no schema change and keeps
  the per-request signature SQL off the documents (tests/published-cache.test.ts guard).
- GATE: publishing or rolling back a retired draft un-retires it; bulk publish skips retired drafts —
  proceeded because "publish means live" is the existing meaning and avoids touching A2's publish path.
- GATE: a multipart set member can be retired on its own (cue ids bind per button) — proceeded because
  archive's whole-set rule protects editor order, which retire does not change.
- GATE: web UI offers Return (restore) but no Retire button — proceeded because retire copy for the web
  is a wording decision; retire is MCP-only for now.
- Known follow-ups from A1: update_draft patch doesn't map a TBI templateCueId; web /api/slots has no
  version check; preview_content's real server fit is covered only by a stubbed runner.
- C1 merged (a7651bd): lib/companion-deck/{model,render,seed,extract,repository}.ts; renderDeck(seed)
  reproduces the released CRC preset byte for byte (gzip bfc718e1…, JSON 52d1da91…; 56 pages, 1460
  buttons). db/companion-decks.sql written, not applied. Gate after merge: tsc clean, npm test 939+38 pass,
  lint 0 errors, audit-companion-packages ok.
- GATE: C1's seed is derived from the released preset, not Michael's raw export (the generator no longer
  needs the raw export; GAP-ANALYSIS §7's "can't run without it" is now historical); each button stores
  its own id seed so edits never renumber other buttons; TBI page template is provisional until C4.
- V2 merged (f7474c3): lib/live-command.ts shared by /api/command (byte-compatible, pinned) and MCP
  (runMcpCommand: source mcp, per-token-family clientId, clock sequence, caller commandId); scopes are
  subsets of crc.authoring/crc.live/offline_access; consent offers crc.live unchecked, gated on
  LIVE_ROLES owner/editor/operator; per-request re-check narrows scopes; per-group tool gating with
  insufficient_scope; console WebMCP sends source mcp; /api/history rows carry commandId.
  Gate after merge: tsc clean, npm test 955+38 pass, lint 0 errors. Web release must follow the relay release.
- GATE (V2): the crc.live checkbox shows before sign-in (Approve re-checks the role); an Operator may
  approve a live-only connection; scopes are declared per tool group in lib/mcp.ts; a refresh narrows the
  stored scope to what the role allows; unknown `source` values ignored as before.
- L1 merged (14d6069): card primitive, Corner first. `CardDefinition` / `CORNER_CARD` and
  `cardStyle()` in lib/layout-registry.ts; the Player sets `data-card` and the `--card-*` properties; one
  flat `.overlay[data-card]` block replaces the `.corner` rules; `applyFit` dispatches card layouts by
  `fit.strategy` (`shrink-to-floor`); preview.ts reads fill/sparse/height ceiling from the definition for
  cards. Golden stills (scripts/corner-golden-stills.mjs, baseline tests/fixtures/corner-golden-stills/crc.json
  captured at e35693f): 16 corner cases pixel- and part-dump-identical after, on the dev server and on a
  webpack production build; a 1 px definition change fails all 16. Rides the next paired web release.
- GATE: the corner card gains no fill ratio (`fit.fill: null`, `heightCeiling: null`) — proceeded because
  panelFillRatio returned null for corner before, so no warning or verdict changes; a card that defines
  them is measured against its own.
- GATE: the corner's Hebrew accent title still packs to the left of its 220 px lane (`justify-content:
  flex-end` under `direction:rtl`, the bug class the lower third fixed) — kept because L1 must be
  pixel-identical; fixing it is a visible change for Daniel to approve.
- GATE: `npm run build` (Turbopack) refuses a worktree whose node_modules is a junction; the worker ran
  `next build --webpack` and the golden stills on it — proceeded because the Turbopack build is re-run at
  integration on the main checkout.
- GATE: TBI stills not captured (TBI's workspace profile lives in env files the worker may not read) —
  proceeded because corner geometry does not depend on branding; colours only change `--crc-*` values.
- Integration check of L1 on the main checkout (baa990a): Turbopack `npm run build` ok; golden stills
  --check against a Turbopack dev server: all 16 identical (Chrome 153.0.8010.53; matched in browser
  session 2 of 3, the known logo-antialiasing flake). Gate: tsc clean, npm test 962+38, renderer 31, lint 0 errors.
- Corner Hebrew accent-title alignment (packs left under RTL) — visible fix awaits Daniel (open question).
- S2 merged (94a205d; merge ff54dd9): 17 services tools (MCP now 65 tools; snapshot regenerated as the exact
  union of A1 and S2, no existing tool changed). lib/service-tools.ts, lib/service-tool-schemas.ts,
  parseRows/alignToRows in lib/service-rows.ts. Every web /services operation has an MCP equivalent except
  feedback on /services/log. Gate after merge: tsc clean, npm test 978+38 pass, lint 0 errors.
- GATE (S2): Needs-review/needs-a-graphic rows default their owner to "Unassigned"; service_readiness has
  four states (covered, needs-review, needs-a-graphic, not-needed incl. intentional fallback); coverage
  removal is set_coverage_row{clear:true}; refresh_from_setlist never overwrites a human decision and keeps
  dropped rows unless removeMissing:true; no-op writes don't bump the version.
- C2 merged (92d88d6, ed343ae): lib/companion-deck/validate.ts with structured findings; companion/
  definitions.json generated at module build and checked by audit-companion-packages; the preset audit is
  a thin CLI over the validator and no longer needs Michael's raw export. CRC seed passes (439 cue keys,
  235 cues bound); 5.0.3 upgrade leaves 1460/1460 buttons unchanged. Gate after merge: tsc clean, npm test
  992+35 (3 old-audit helper tests removed), lint 0 errors, both audits pass.
- GATE (C2): definitions.json sits beside companion/package.json (TBI derivation refuses unexpected archive
  files); cue-action-outside-cue-key is a warning (six released booth-page buttons fire cues without lights);
  the X32 Bimah literal and raw-export comparisons dropped (covered by template fixed cells and C1's byte
  test); upgrade check skipped for TBI until a 5.0.5 bundle exists; until A3 lands the CLI treats the
  snapshot-era superseded cue names as retired.
- C2 notes for C3: seedCrcDeck shares the manifest's gesture objects by reference (clone in the seed);
  booth connection labels (Q4) are still the only unguarded wrong-camera path.
- A2 merged (6ed5862): ship_draft (preview → server fit with image → attested review → publish, or stops
  with stoppedAt duplicate_name|validation|fit_failed|fit_unavailable and publishes nothing);
  publish_draft confirmDuplicateName; receipts record approvedBy agent|person + member (humanApproved:true
  still accepted); fit frames kept in authoring_preview_images (db/authoring.sql, not applied, ≤750 KB,
  best effort); list_recent_publications; /author/publications page with one-click rollback. Instructions
  now lead with ship_draft. Timing (Windows, local Chrome): fit 0.8-1.1 s; ship_draft 6.5 s first call
  after dev start, 1.0-1.3 s after; Vercel cold start not measured. Gate: tsc clean, npm test 1002+35,
  lint 0 errors, Turbopack build ok.
- GATE (A2): fit_check_draft now keeps its image when includePreviewImage:true (R-A2); the page defaults to
  assistant publications; one library link added in app/author/panels.tsx.
- A2 notes: first publications can't be undone from the page (retire, A3); recovery backups don't include
  authoring_preview_images.
- A3 merged (4eef4f2, 3661004): conflicts with A2 (lib/authoring.ts repository methods, publish-invalidating
  ops) and S2 (lib/service-collections.ts createCollection/updateCollection) resolved by hand, keeping
  both; S2's `enriched()` now passes the retired map so get_service flags retired bindings; S2's
  service_readiness already reads a retired graphic as "no longer published" → needs-review. Relay rule
  (on-air `out` accepted for a cue no longer in the catalog) ships with the next relay release, before
  the web. Gate after merge: tsc clean, npm test 1016+35, lint 0 errors, relay 83, Turbopack build ok.
- T1 merged (39e2f70): get/update_authoring_defaults (db/authoring-defaults.sql, not applied; writes refused
  in a sentence until it is), customize_shared_batch (≤50 items, dry run default, idempotent per upstream
  version so a rerun resumes), applyDefaults on create_draft/create_source_draft_set/customize_shared_*.
  Gate after merge: tsc clean, npm test 1035+35, lint 0 errors; snapshot 81 tools = 3-way union.
- GATE (T1): layout rule applies only where a set is formed; house typography replaces a shared copy's sizes
  while a caller's explicit sizes win on create_draft; the web shelf copy takes stored defaults too;
  translation default not applied to create_source_draft_set; a single part of a shared set may be a batch
  item. Follow-ups: drafts don't record which defaults version made them.
- T2 merged (64d0e87): add/update/list_local_sources (lib/local-sources.ts; db/local-sources.sql not
  applied, missing table reads as empty and refuses writes in a sentence); local sources merge into search
  (new page filter), get_source, facets, list_book_units, drafts/sets/preview, source review drift, the
  liturgy index and setlist book matching; never in the shared-library payload (tested). Merged by hand
  with T1 in create_draft/create_source_draft_set (house defaults and local units both apply; test added);
  createAuthoringService takes localSources 6th, defaultsRepo 7th. Gate: tsc clean, npm test 1044+35,
  lint 0 errors; snapshot 84 tools = 3-way union.
- GATE (T2): attribution required, licence optional and stored as given; attribution travels as data
  (snapshot + provenance), not on-screen text; setlist book match ignores case/punctuation; local-backed
  cues now report a liturgical position; migration not in migrate-authoring.mjs (C1 precedent).
  Follow-ups: service coverage rows can't name a local source id directly; update_local_source doesn't refuse
  a duplicate name on the same page.
- A6 merged (ab21287): upload_asset (begin/append/commit, 192 KB chunks, staged in workspace_asset_uploads —
  db/assets.sql, not applied), list_assets (with usedBy), archive_asset (refused while published cues use it);
  signed 5-minute per-asset artwork link (/api/assets/<id>/signed, HMAC keyed from RELAY_SECRET under its own
  label) handed to every server fit, so artwork cues fit with artwork:'loaded' (real Chrome: 1.6 s ship with
  artwork; unsigned control failed "Fonts or artwork did not load in time"). createAuthoringService: 6 localSources,
  7 defaultsRepo, 8 assetStores. Gate: tsc clean, npm test 1050(+1 timing flake in server-fit, passes 3/3
  alone)+35, lint 0 errors, Turbopack build ok; snapshot 87 = 3-way union.
- GATE (A6): signing key derived from RELAY_SECRET (no new env var); one upload_asset tool with a step field;
  5-minute expiry and 192 KB chunks chosen by the worker. Noted: before A6 every artwork graphic failed the
  server fit (still true on a deployment without RELAY_SECRET); signed URLs appear in request logs (expire in 5 min).
- T4 merged (5269efd): create/get/update_review_board (lib/mcp/review.ts; db/review-boards.sql not applied;
  answers stored apart from the board so clicks never bump its version); /author/review/<boardId> for any
  signed-in member, stored fit frames, "Before"/old-slide reference, grouping none|deck-page|service (deck-page
  refused until C3 wires the stored deck unless groupLabels given). Browser-checked by the worker at laptop and
  tablet widths. Gate after merge: tsc clean, npm test 1059+35, lint 0 errors, Turbopack build ok; snapshot 90.
- GATE (T4): a republished item becomes undecided but keeps the earlier answer; any signed-in member may review;
  grouping fixed when a graphic is added; a graphic in several pages/services groups under the first;
  removing an answered item needs dropAnswers:true.
- Review page copy (T4) needs Daniel's review: the full string list is in lib/review-board*.ts and
  app/author/review/review-model.ts (COPY).
- A5 merged (d5a82c3): find_catalog_issues (9 kinds incl. duplicate/near-duplicate names, inherited titles,
  archived-but-published, retired in services/deck, restored name clash, unpublished changes), batch_update,
  batch_ship (one ship per item, ≤40 s per call, cursor fingerprinted to the item list), supersede_cue (services,
  deck keys, then retire). Gate after merge: tsc clean, npm test 1067+35, lint 0 errors; snapshot 94.
- GATE (A5): batch_ship dry-runs by default (handoff rule: batch ops dry-run by default; stricter wins);
  unpublished changes compare what is on screen, not versions (retire/restore bump versions); supersede leaves
  labels unchanged (no silent rewording) and reports them. Deck checks say "No Companion deck is stored" until
  C3's repository is wired. Noted: after restore, list_drafts/get_draft report `dirty` (A3 version bump).
- L2 merged (27746ea, cfe902e; merge 0599913): layout_definitions table (not applied), versioned data layouts,
  `layoutRef` pinned in cueHash for data layouts only (built-ins unchanged: 34 baseline + custom cue hashes and
  the catalog version match tests/fixtures/cue-hashes.json), `layouts` envelope via /api/catalog?include=layouts
  (default response still the bare Cue[]) and relay `approved_layouts`; motion presets in the definition.
  Integration: Turbopack build ok; golden stills 16/16 identical on a Turbopack dev server; tsc clean, npm test
  1081+35, renderer 31, relay 86, lint 0 errors. Release order: relay before web (an old relay drops layouts).
- L2 notes for L3: register published layouts at startup when Postgres is wired; console/editor previews and the
  fit stage don't pass `layouts` to the Player yet; output pages older than the release draw a data-layout cue
  without its card.
- C3 merged (c5effa5): 17 deck tools (MCP now 111), Postgres + memory deck repositories (db/companion-decks.sql
  not applied: tools refuse "store not set up" until it is), sync_deck_with_catalog grammar, check_service_on_deck,
  signed 15-minute full export (unchanged seed = released preset, gzip bfc718e1…), /setup download block
  (copy needs Daniel's review). Integration fix: C3's retired lookup checked `retired===true`, which A3's
  object never matches; now uses isRetiredDraft via exported deckCatalogCues (test added). Gate: tsc clean,
  npm test 1105+35, lint 0 errors.
- GATE (C3): export signing key COMPANION_EXPORT_KEY or a purpose-labelled derivation of RELAY_SECRET/CONTROL_KEY;
  a write is refused only if an error finding's count rises; sync default scope anchored to the deck's last sync.
- C4 merged (5d76e6f; merge 3a61a14): seed_deck_from_export and convert_singular_deck (MCP now 113), TBI seed from
  Simone's 14 September export (connection config/secrets stripped before storage), TBI-CONVERSION-REPORT.md
  (192 Covered / 46 Needs review / 16 Needs a graphic against the 15 September catalog). Integration: both
  dispatches kept; the conversion tools default to C3's own store (defaultDeckRepository), so a seeded/converted
  deck is the one get_deck reads (cross-packet test added); C3's template code handles TBI's built-in nav roles
  (page-up/number/down); the cue key keeps C3's catalog stamp and C4's bg/color. Snapshot 3-way verified.
- C5 merged (c023130; merge f7d261b): module presets grouped by deck role and set, palette shared with the
  renderer (lib/companion-deck/palette.ts, copied into companion/src at build), `roles` on the slot envelope
  (catalog route keeps L2's include=layouts too), module 1.8.0 packaged for CRC and TBI (served downloads still
  1.7.0 — a release step), companion/definitions/<version>.json archive. Integration fix: the deck tools
  validated against the newest definitions (now 1.8.0) while the CRC deck and TBI seed ask for 1.7.0; they now
  pick the definitions for the version the deck's Overlays connection asks for (moduleDefinitionsFor). Gate:
  tsc clean, npm test 1126+35, lint 0 errors, companion 153, both audits pass.
- GATE (C5): one role per cue (first non-alternate binding in page order; nine cues differ, e.g. set
  "V'ahavta" parts go to "V'ahavta (Fri)"); roles from committed content/cue-roles.json built from the seed
  deck, not the (unapplied) deck table; preset section names are the deck's role names (visible to Michael in
  Companion — open question); moving the deck itself to 1.8.0 is a separate step (changes preset bytes).
- Deck wiring (c73879f): deckSourceForDeployment gives T4's deck-page grouping and A5's retired_on_deck /
  supersede_cue the same deck get_deck reads (CRC seeded on first read; null where none is stored). A service
  over the in-memory authoring repository keeps its deck in memory. Gate: npm test 1126+35, lint 0 errors.
- L3, L4, T3 launched as workers from f7d261b.
- NEXT (resume here): merge L3, L4, T3 as they finish (snapshot regenerate + 3-way check each time; golden
  stills after L3 and L4 on a Turbopack dev server). Then the consolidated browser pass (Retired label,
  /author/publications, /author/review, /setup) and the headline acceptance receipt.
- Owed: a real-browser check of the library's Retired label and Return button (A3 did a server render only).
- V3 merged (ae37165): nine live tools in lib/mcp/live.ts dispatched to a separate live
  operation (route wires runMcpCommand/snapshot/catalog); deck guard on lastPress.companion; server-side
  panel stepping (lib/panel-navigation.ts); Companion `last_source` variable + `last_source_agent` feedback
  (src only, no package rebuild). docs/MCP.md "Live control".
- GATE (V3): guard window is `WORKSPACE_DECK_GUARD_MINUTES`, default 5, range 1-240, no off value — proceeded
  because 5 is the proposal on record and Daniel has not set it; he can change it by configuration.
- GATE (V3): a live service that doesn't report lastPress (pre-V1 relay, legacy path) counts as guard active
  (override needed) — proceeded because decision 4 says agents yield, and relay-first release makes it moot.
- GATE (V3): override reasons go in the tool result and one `mcp_live_override` server log line, not the cue
  log — proceeded because the relay has no note field and relay/ is outside this packet.
- GATE (V3): the module reads GET /api/state after a revision it didn't make, to learn who pressed (the
  socket snapshot carries no source) — proceeded because it is an existing endpoint the device credential
  already reads; an older web answers no lastPress and the variable stays blank.
- GATE (V3): server instructions line "Nothing on this connection puts anything on screen" replaced by a
  sentence naming the live tools, target:'live' and the deck guard — agent-facing text, not product copy.
- L2 (worktree branch, not merged): lib/layout-definitions.ts (validated LayoutDocument, sha256 over canonical
  JSON, memory repository, motion presets card-scale/fade or tracks, registerPublishedLayouts,
  resolvedLayoutsFor/withResolvedLayouts); db/layout-definitions.sql written, not applied. Data-layout cues pin
  `layoutRef{id,version,sha256}` beside `layout` (inside cueHash) and take the definition's motion; built-in
  cue hashes unchanged (tests/fixtures/cue-hashes.json recorded before the change). Envelope `layouts{"id@version"}`
  on authoringCatalog, relay approved catalog (new `approved_layouts` row) and `/api/catalog?include=layouts`
  (the new /output asks for it; the default stays the bare array). Relay change ships before the web.
- GATE (L2): built-in layouts get no `layoutRef` (pinned by the code release as before) — proceeded because any
  pin would change every existing published cue's hash. GATE: catalog version stays the hash of the cues —
  proceeded because each pin names its definition's sha256, and no existing version moves. GATE: a data-layout box
  has class `overlay` + `data-layout` (the id is not a class) — proceeded because an author id could otherwise
  match a part rule. GATE: data layouts keep `templateLayout:'bottom'` only so parseEditable accepts a lower-third
  templateCueId; buildCue ignores that template. GATE: a pin missing from the envelope degrades to the newest
  version of the same layout given — proceeded because a held graphic rendering in newer geometry beats unstyled.
  GATE: webpack dev/build used in the worktree (junctioned node_modules); Turbopack build and stills re-run at
  integration.
- L2 notes for L3: wire the Postgres repository and call registerPublishedLayouts at load; the editor/console
  previews and the server fit (fit-stage) do not yet receive `layouts`, so a data-layout draft previews without its
  card until they pass `options.layouts`; `rebase_to_layout` = republish against the newest published version.

## Evidence
Four read-only audits (MCP surface, layouts/renderer, Companion, live/services/access) plus a
structural read of Simone's export; synthesis and file/line references in GAP-ANALYSIS.md.

## Open questions
- C5: Companion preset section names (Controls, Sets, Prayers, Alternates, Short selections, Announcements,
  Utility graphics, Slots, Other graphics) are what Michael sees in Companion; confirm them before 1.8.0 ships.
- V3 integration: C2's companion/definitions.json went stale against V3's new feedback, and the package
  audit rightly refused it (the released 1.7.0 package lacks it). GATE: definitions.json now describes the
  packaged module (written by `npm run package`, not `npm run build`); the module test holds source to a
  superset of it — proceeded because decks are imported against the installed package, and the next module
  version regenerates it. Gate after merge: tsc clean, npm test 1027+35, lint 0 errors, companion 142,
  audit-companion-packages ok.
- Recent publications page copy (A2) needs Daniel's review: "Published by an assistant connected by …",
  "Go back to the previous version", "In use now".
- Should agents record service feedback (/services/log)? S2 left it out of the MCP; needed only for strict parity.
- Corner card: fix the Hebrew accent title packing left in its lane (the RTL flex-end bug the lower third
  already fixed)? Visible change; L1 kept it for pixel identity.
- Consent copy written by V2 needs Daniel's review (user-visible, no precedent): checkbox "Live control:
  also let this connection show, take out and clear graphics on the <congregation> output, as the console
  does."; Operator without the tick: "Your role here can't author graphics, so this connection can have
  live control only. Tick Live control to allow it, or Deny."; nothing ticked: "Nothing was chosen to
  allow. Tick Live control to connect, or Deny."
- Consent page copy (lib/oauth-http.ts) still says "Publishing still requires an exact preview reviewed in
  the <congregation> web UI." Since D18 an MCP actor can review (after a server fit pass) and publish, so the
  sentence understates the grant. Wording needs Daniel; P1 only replaced "CRC" with the workspace name.
- Release authority for this plan's releases (relay first, then paired web): not granted by this file.
- Guard window length for decision 4 (proposed: 5 minutes since the last Companion press).
- Michael's installed Companion build and connection labels (OPEN-QUESTIONS Q3/Q4 of the preset work)
  before any deck import.
