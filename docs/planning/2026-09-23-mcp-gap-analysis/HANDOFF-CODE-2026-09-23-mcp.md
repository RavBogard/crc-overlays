# Code handoff: MCP completeness (overlays, services, live, layouts, Companion, TBI onboarding)

Amended 2026-09-23 with [HANDOFF-CODE-ADDENDUM-2026-09-23.md](HANDOFF-CODE-ADDENDUM-2026-09-23.md):
shared-seam owners, the explicit `crc.live` role list (V2), and Track T.

From: the Cowork planning sitting of 2026-09-23. Rulings: [STATE.md](STATE.md). Findings, file/line
evidence and the reasoning behind every packet: [GAP-ANALYSIS.md](GAP-ANALYSIS.md). Recommendation IDs
below (R-…) point into that file; read the matching section before starting a packet.

NEXT: start Wave 0 on the main thread (P0 first, because every later packet registers tools in the
module layout it creates), then open the five tracks.

## Operating rules
- Follow AGENTS.md: verify the checkout, branch and working tree before anything; preserve others'
  tracked and untracked work; one bounded packet per worker, with the file ownership listed below;
  keep this folder's STATE.md current (goal, decisions, next packet, evidence, open questions).
- Gates at every integration boundary: `tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`;
  Companion changes add `scripts/audit-companion-packages.mjs` (and the preset audit while it exists);
  browser-visible changes get focused browser verification. Hardware acceptance (Michael's and
  Simone's Stream Decks) cannot be claimed from tests.
- Release: relay changes ship before the web changes that depend on them (docs/RELAY-RELEASE.md). Web
  releases are paired CRC + TBI (TBI is the staged CLI release; check its asset allowlist). This file
  does not authorize any deployment; ask Daniel for release authority.
- Never read, print, copy or commit `.env*`, `work/access/`, tokens, or the raw Companion exports'
  connection `config`/`secrets`. The two raw exports are
  `work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig` (Michael)
  and `work/companion-conversion/tbi-2026-09-14/TBIComputer-2026-09-14-1618-source.companionconfig`
  (Simone). Seeds strip config and secrets before anything is stored.
- Every new MCP tool: strict zod schema; `expectedVersion` on writes; dry run by default for batch or
  destructive operations; results name the workspace; refusals are plain sentences that say what to do
  next. Keep results compact (the gap-G pattern) with a full-record read available.
- Existing behaviour stays unless a ruling changes it. Existing `crc.authoring` tokens and connected
  clients must keep working through every packet.

## Wave 0: foundation (main thread, small)

**P0. Split MCP registration by area.** lib/mcp.ts becomes a thin server that registers tool groups from
`lib/mcp/{authoring,catalog,services,live,layouts,assets,branding,deck}.ts`. Schemas move unchanged.
Acceptance: tool list and schemas byte-identical before/after (snapshot test); tests/mcp.test.ts
passes. Owns: lib/mcp.ts, lib/mcp/*.

**P1. Identity and instructions (R-F1, R-F2).** Server name, consent copy and tool descriptions from
`getPublicWorkspace()`; register `get_workspace`; `{workspaceId, shortName, host}` in every result;
a server `instructions` string (workflow, one-call publish once P6 lands, the layout rule "more than
two lower thirds becomes a left sequence", corner/look defaults, don't use `split_draft_into_set` for
long prayers); required `workspace` argument on every write and live tool, refused on mismatch;
correct docs/MCP.md (review_draft is registered; custom text is accepted). Acceptance: on a TBI
configuration nothing says CRC; a wrong `workspace` is refused with a sentence. Owns: lib/mcp/*
descriptions, lib/oauth-http.ts copy, docs/MCP.md.

**P2. Layout registry (R-L1).** lib/layout-registry.ts replaces the closed layout unions/enums
(layout-label.ts, template-looks.ts, panel-budget.ts, custom-templates.ts, authoring-model.ts :11
:261 :369, authoring.ts :118 :369 :385 :446, the four MCP enums, app/author/types.ts; preview.ts:79
uses a `data-contain` attribute). Layout ids become validated strings. Acceptance: no behaviour
change; every existing test passes; adding a registry entry is the only step needed for a new layout
to be accepted by validation (proved by a test-only fixture layout).

**P3. Font registry (R-L7).** One code registry generates the @font-face list, the
`waitForOverlayFonts` targets and the TBI staging allowlist (scripts/stage-workspace-source.mjs).
Acceptance: the existing test that every stylesheet face is staged still passes and now reads from the
registry.

**P4. TBI module derivation survives module changes (R-C6).** Brand strings in one constant (or read
from the catalog envelope); update build-tbi-companion-module.mjs counts. Acceptance:
audit-companion-packages passes; adding a preset section string no longer breaks the TBI build.

## Track A: authoring and publish

**A1. Reads, looks and missing operations (R-A4, R-A5, R-A6).** Register `list_catalog`,
`duplicate_draft`, `preview_content` (optional image), `list_book_units`, the `book`/`service` search
filters, the shared-library five, `save_slots`, source review. Compact by default; rows carry set
id/index/count, `dirty`, `archived`, a text excerpt (custom included); sort by name then set index;
`get_draft{view:'rendered'}`; search results without the licence blob and with block ids on request.
`templateCueId` optional (defaults to the layout's look); `list_templates` returns looks;
`list_custom_templates` / `compose_custom_draft`; named text-size presets. Acceptance: a source-backed
graphic is created with `search_sources` → `create_draft` (no get_source, no list_templates needed
when defaults suit); tests per tool.

**A2. One-call publish and the review list (R-A1, R-A2).** `ship_draft{workspace, draftId,
expectedVersion, allowRename?}` runs preview → fit with image → attested review → publish and returns
image, verdict, revision, final name, or stops with the renderer's sentences. `confirmDuplicateName`
on `publish_draft`. Receipts record `approvedBy: agent|person` and the member; replace the
`humanApproved` literal (keep accepting it for existing clients). Store the fit JPEG with the preview;
`list_recent_publications{since, actor?}`; a web review page showing the stored image with one-click
rollback. Acceptance: nothing → published custom graphic in two calls (create, ship); the review page
shows it with the image the agent saw; fits inside `maxDuration` from a cold start (measure and
record).

**A3. Retire everywhere (R-A3).** Relay test first: what the relay and an open output do when a cue it
holds leaves the catalog. Then `published()` honours retirement; `/api/catalog` and relay sync drop
retired cues; `retire_cue` / `restore_cue` tools. Acceptance: a retired cue is absent from Companion's
picker and the relay catalog; an on-air retired cue behaves as the relay test established; deck and
service validation (T-C, T-S) flag bindings to it.

**A4. Structured custom content (R-A7).** Custom mode gains optional he/tr/en lines or rows.
Acceptance: existing custom drafts and slots unchanged; a bilingual announcement renders as a proper
lower third and as panel rows.

**A5. Hygiene (R-H1–H3), after A2 and A3.** `find_catalog_issues`, `batch_update` (dry run default,
per-item results, no stop on first failure), `batch_ship` (resumable cursor, one ship per item),
`supersede_cue{old,new}` (repoints service entries and deck bindings, retires the old). Acceptance: the
known cases are found (four "Copy of Thank you"-style duplicates in a fixture, Zochreinu's inherited
title, archived-but-published cues).

**A6. Assets (R-B1).** Chunked `upload_asset`, `list_assets`, `archive_asset`; a signed short-lived
artwork URL so the server fit loads artwork (`artwork:'loaded'`). Acceptance: agent uploads a PNG,
attaches it, and the ship image shows it.

## Track L: layouts as data (after P2, P3)

**L1. Card primitive and parameterised fit, Corner first (R-L2, R-L6).** Generalise overlay.css
252-277 and `fitCornerText` into CSS custom properties set from a definition; fit dispatch by
strategy; container, fill denominator, sparse threshold and height ceiling from the definition; logical
start/end alignment. Acceptance: golden stills show published Corner cards pixel-identical before and
after; tests/corner-layout.test.ts rewritten against the definition.

**L2. Definitions table, pinning, motion (R-L3, R-L5).** Per-workspace `layout_definitions(id,
version, document, status, sha256)`; published cues pin `layoutRef` inside `cueHash`; catalog and relay
payloads carry the resolved definitions; motion presets in the definition (new layouts stop cloning
baseline cues). Built-in four stay code. Acceptance: editing a definition never changes a published
cue until it is republished or rebased; an output page older than the release still renders built-in
layouts.

**L3. Layout tools (R-L4).** `list_layouts`, `get_layout`, `create_layout` (clone), `update_layout`,
`validate_layout`, `preview_layout` (sample texts and named drafts through the server fit, images
back), `publish_layout` (passing sample set required), `rebase_to_layout` (dry run default).
Acceptance: an agent creates a new layout (e.g. a top-right "Response" card) and publishes a graphic in
it with no code change and no release, on both workspaces.

**L4. Branding as data (R-B2), after P3 and A6.** Versioned `workspace_branding` (full colour set,
font roles from the registry, logo/resting-logo/scan-card artwork as asset ids); hardcoded CSS colours
become variables; `get_branding` / `update_branding` with a preview across representative cues.
Acceptance: TBI's accent reaches the medallion ring; CRC renders unchanged (golden stills).

## Track S: prepared services

**S1. Service model (R-S1).** Ordered `rows[]` linking coverage and entries (setlist position, status,
linked entry, candidate cue ids, button label, optional camera hint, note) and
`origin{setlistId, trackIds, eventDate, importedAt}`; lazy migration on read; importer writes the new
shape. Acceptance: existing documents open unchanged in the web UI; a fresh import keeps setlist order
including rows with no graphic.

**S2. Services tools (R-S2, R-S3).** `list_services`, `get_service`, `list_live_setlists`,
`create_service`, `rename_service`, `add_entry`, `remove_entry`, `reorder_entries`, `swap_graphic`,
`resolve_coverage_row`, `set_coverage_row`, `set_names` / `clear_names` (on-air refusal kept),
`archive_service` / `restore_service`, `refresh_from_setlist`, `service_readiness`. Acceptance: every
web services operation has an MCP equivalent; names changes still refuse while on air.

## Track V: live control

**V1. Relay (ships first).** `outcome: applied|replayed|superseded` on every command response;
`commandId` stored on history rows; `ifRevision`/`ifCue` preconditions; last-press time per controller
class available to the web. Acceptance: relay tests for each outcome and precondition; existing
console and Companion unaffected.

**V2. Command core and `crc.live` scope (R-V1, R-V2).** lib/live-command.ts shared by the route and MCP
(`source:'mcp'`, stable `clientId` from the token family, clock-based sequence, caller `commandId`).
Scopes: `normalizeScope` accepts subsets and keeps existing rows valid; consent offers `crc.live` as a
separate, unchecked-by-default line to the owner, editor and operator roles (Admin, Editor, Operator) and grants
the intersection; per-request scope-aware member re-check; per-tool gating with `insufficient_scope`.
Console WebMCP commands tagged `source:'mcp'` (R-V4). Acceptance: an authoring-only token can't reach
live tools; a live-only token can't author; removing a member's role ends the matching scope at the
next request. Gate `crc.live` on the explicit role list owner / editor / operator (`AccessRole` is
exactly those three, confirmed 2026-09-23 in lib/access.ts:5), not on `canAccess(role,'control')`,
which is permission-based and returns true for every permission except owner / author / history
(addendum §1).

**V3. Live tools (R-V3) with the deck guard.** `get_live_state`, `show_graphic`, `take_out`,
`animate_out`, `clear_now` (`immediate:true` required; result says it also clears the scan card and
turns the resting-logo preference off), server-side `next_panel` / `previous_panel`, `set_scan_card`,
`set_resting_logo` (result never claims visibility). Required `workspace` and `target:'live'`
('rehearsal' refused in words); optional `commandId`, `serviceId`, `ifRevision`; wait up to ~3 s for
a renderer ack. Guard: while any Companion pressed within the guard window (Daniel to set; propose 5
minutes), refuse unless `override:true` with a `reason`. The module shows agent activity (a variable
such as `$(overlays:last_source)` and a feedback). Acceptance: cue log rows show `mcp` and the
commandId; the guard refuses during a simulated service and allows with override; Companion shows the
agent command.

## Track C: Companion

**C1. Deck model and pure renderer (R-C1).** lib/companion-deck/{model,render,seed}.ts,
`companion_decks` per workspace with optimistic version; built-in layered button template (no page-76
clone); sanitized device fragments; named page templates per workspace; recorded Companion build per
workspace (CRC 5.0.3, TBI 5.0.5). build-companion-preset.mjs becomes a thin CLI over it. Acceptance:
`renderDeck(seed)` reproduces today's CRC preset byte for byte (sha256 matches the current release).

**C2. Validator (R-C2).** The preset audit becomes lib/companion-deck/validate.ts reading chains, fixed
cells, gesture shapes and allowed built-in buttons from the workspace's templates; module definitions
from a JSON manifest shipped with the module; exact connection-label check against the registry; bound
cues must be published and not retired; upgrade check runs against the workspace's build (CI-only
unless the MIT bundle is vendored). Acceptance: CRC's current preset passes; the TBI seed passes with
built-in nav; a label mismatch fails with the exact button and label.

**C3. Deck tools and export (R-C3, R-C4, minus weekly pages).** `get_deck`, `get_deck_page`,
`create_page`, `rename_page`, `move_page`, `delete_page`, `place_button`, `move_button`,
`remove_button`, `bind_cue`, `attach_camera_gesture`, `apply_template`, `layout_column`,
`sync_deck_with_catalog` (after publish/revise/retire: proposes where a cue lands on its standing page
by the grammar, relabels revised cues, removes or flags retired ones; dry run default),
`check_service_on_deck{serviceId}` (every graphic the service needs is placed; lists what isn't and
where it would go), `validate_deck`, `export_deck_config{scope:'full'}` as a signed download listed on
the setup page. No `generate_service_page`. Acceptance: publishing a new Kiddush alternate and running
`sync_deck_with_catalog` places it in the right column of the Friday page; export imports cleanly in
Companion 5.0.3 (fixture) with every connection label exact.

**C4. TBI conversion (R-C7, R-C9).** `seed_deck_from_export` (strips config/secrets server-side) and
`convert_singular_deck` (matches each Singular composition to a published cue with the forgiving title
search; returns Covered / Needs review / Needs a graphic; flags in/out mismatches, labels naming a
different prayer than they fire, duplicate labels; binds only confirmed Covered rows). TBI seed from
Simone's export: keep her 13 pages, positions and colours; carry the BirdDog and OBS buttons; add a
`TBI_Overlays` connection and Rendered feedback on every graphic button; drop the Singular
connections once no button uses them. Generalise scripts/convert-companion-singular.mjs rather than
starting over. Known defects to surface: page 3 r0c5 animates in "Sing the song 159" but out "Twilight
People 2"; page 95 r3c5 "V'ne-emar" fires Aleinu 2. Acceptance: a conversion report for Daniel and
Simone (counts per status, every defect, every Needs-a-graphic row); a TBI full export that passes C2.

**C5. Module presets (R-C5, R-C8).** Presets grouped by role and by set, coloured by the deck's role
rules from one shared palette; role and sequence metadata move from CUE-MANIFEST into the catalog
envelope; the agent-activity variable from V3; README refresh claim corrected and the "presets can't
carry device actions" limit documented. Acceptance: old module versions still validate the catalog;
audit-companion-packages passes; the TBI build derives cleanly (P4).

## Track T: TBI onboarding (after its prerequisites; addendum §2, STATE decision 13)

The TBI redo (docs/planning/2026-09-23-tbi-redo/) runs through the MCP with no code after this plan
lands and relies on every tool below, so Track T is part of done.

**T1. Batch copy with house defaults (after A1).** Per-workspace authoring defaults:
`get_authoring_defaults` / `update_authoring_defaults` (typography, row order, translation choice,
arrangement, the layout rule), applied on create and on customize. `customize_shared_batch{items[],
applyDefaults, dryRun}` copies CRC library graphics into the workspace as local drafts, keeping
attribution and the upstream link, with per-item results, resumable. Acceptance: 50 CRC graphics copied
into a TBI fixture in one call, with TBI defaults applied and a dry run first.

**T2. Workspace-owned sources with book and page (after A1).** `add_local_source` /
`update_local_source` / `list_local_sources`: workspace-owned source units with per-channel blocks
(he/tr/en), attribution and licence text, and a liturgical position `{book, page}` (e.g. Mishkan
T'filah 176) that search, `prepare_service_from_setlist` and deck conversion match on. Drafts built
from them are source-backed like corpus drafts; these sources are never shared upstream. Acceptance: a
Mishkan T'filah reading is entered once, found by `search_sources` and by page, and built into a
graphic that carries its attribution.

**T3. Reference material on conversion rows (after C4 and A6).** `import_singular_extract` stores a
Singular extract's compositions as reference records (app, name, layer, text; no credentials).
`convert_singular_deck` rows and drafts carry `reference{origin, app, comp, text, imageAssetId?}`.
Matching is content-based, not name-only, following work/companion-simone/crc-match-report.md: Hebrew
NFKD with presentation forms folded, niqqud stripped, final letters folded; transliteration normalised.
Acceptance: every conversion row shows the old text beside the proposed graphic, and matching
reproduces the first pass's EXACT / TEXT-MATCH counts on the same inputs.

**T4. Review board (after A2).** `create_review_board{draftIds, grouping, title}` creates a web page
for signed-in members: per graphic the stored render, and the reference when there is one, grouped by
deck page or by service, with Approve / Needs change and a note per item. `get_review_board` returns
the decisions and notes to the agent. Written for a non-technical reviewer: no ids, no jargon, works
on a laptop and a tablet. Acceptance: a reviewer marks 20 items and the agent reads the decisions
back; a fix that is republished shows as updated on the board.

## Dependencies (shape, not a schedule)
P0 → everything that registers tools. P2 → L1 → L2 → L3; P3 → L4; A6 → L4 and A2's artwork. A2 and A3
→ A5. S1 → S2 and C3's `check_service_on_deck`. V1 → V2's command core → V3. C1 → C2 → C3, C4; P4 →
C5; V3's variable lands in C5. A3 → C2's retired-cue rule. A1 → T1, T2; C4 and A6 → T3; A2 → T4.

## Shared seams: one owner each (addendum §1)

The catalog envelope and relay payload are touched by four packets: A3 (retirement), L2 (resolved
layout definitions), V1 (outcome, commandId, preconditions) and C5 (role and sequence metadata). The
files are app/api/catalog/route.ts, lib/sync-live-catalog.ts, relay/src/index.ts and
relay/src/protocol.ts. V1 owns the relay files; A3 owns the catalog route and the sync. L2 and C5 add
their fields through those owners, in the envelope only, so old clients keep validating.

## Headline acceptance (both workspaces, recorded as a receipt in this folder)
1. `get_setlist` (centralreform.live MCP) → `prepare_service_from_setlist` → `service_readiness`.
2. For each Needs-a-graphic row: `create_draft` (look defaults) → `ship_draft`; `resolve_coverage_row`
   where review is needed.
3. `sync_deck_with_catalog` (apply) → `check_service_on_deck` reports every needed graphic placed on
   its standing page → `validate_deck` passes → `export_deck_config{scope:'full'}` link produced.
4. No code change, no repo edit, no release in steps 1-3. Count and record the calls.
Hardware follow-up (not claimable here): Michael imports the CRC export and Simone the TBI export in a
staffed rehearsal; both confirm every option is in front of them and the Rendered lights work.

## Fragile parts to watch
- Companion page/full import binds an unmatched connection label to the first connection of that
  module type, silently. The exact-label validator check is the only guard.
- The built-in lower third and panels are layered CSS where order is load-bearing; L1-L4 must not
  touch them (ruling 7).
- `maxDuration` 60 s vs a cold Chromium start for `ship_draft`; batches go one ship per item.
- Relay-first ordering for V1 and A3; old output pages in open browser sources during L2.
- `normalizeScope` re-validates stored token scopes; subset scopes must keep old rows valid.
- TBI's staged build allowlist (fonts, assets) and the exact-count TBI module derivation until P4.
