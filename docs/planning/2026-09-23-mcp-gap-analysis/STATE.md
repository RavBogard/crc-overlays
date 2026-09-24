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

## Evidence
Four read-only audits (MCP surface, layouts/renderer, Companion, live/services/access) plus a
structural read of Simone's export; synthesis and file/line references in GAP-ANALYSIS.md.

## Open questions
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
