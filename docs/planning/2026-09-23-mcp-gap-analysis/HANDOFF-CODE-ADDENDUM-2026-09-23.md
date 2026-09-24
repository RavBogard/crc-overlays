# Addendum to HANDOFF-CODE-2026-09-23-mcp.md (Daniel, 2026-09-23, after Code started)

Two additions made after the handoff was first written. Fold both into the handoff and STATE.md
(add STATE decision 13 below). Everything else in the handoff stands. Wave 0 is unaffected; P2's
`data-contain` already matches the corrected wording.

## 1. Shared seams: one owner each

Add this above "Headline acceptance".

The catalog envelope and relay payload are touched by four packets:
- A3, retirement;
- L2, resolved layout definitions;
- V1, outcome, commandId and preconditions;
- C5, role and sequence metadata.

The files are app/api/catalog/route.ts, lib/sync-live-catalog.ts, relay/src/index.ts and
relay/src/protocol.ts. Ownership:
- V1 owns the relay files.
- A3 owns the catalog route and the sync.
- L2 and C5 add their fields through those owners, in the envelope only, so old clients keep
  validating.

For V2: `canAccess` is permission-based. It returns true for every permission except
owner / author / history. Confirm `AccessRole` is exactly owner / editor / operator, and gate
`crc.live` on that explicit role list rather than on `canAccess(role, 'control')`.

## 2. Track T: TBI onboarding (STATE decision 13)

STATE decision 13: *TBI onboarding tools added as Track T. The TBI redo thread
(docs/planning/2026-09-23-tbi-redo/) runs after this plan lands and relies on them.*

Add this track after Track C. The TBI redo runs through the MCP with no code and relies on every
tool below.

**T1. Batch copy with house defaults (after A1).**
- Per-workspace authoring defaults: `get_authoring_defaults` / `update_authoring_defaults`,
  covering typography, row order, translation choice, arrangement and the layout rule. They apply
  on create and on customize.
- `customize_shared_batch{items[], applyDefaults, dryRun}` copies CRC library graphics into the
  workspace as local drafts. It keeps attribution and the upstream link, returns per-item results,
  and is resumable.
- Acceptance: 50 CRC graphics copied into a TBI fixture in one call, with TBI defaults applied and a
  dry run first.

**T2. Workspace-owned sources with book and page (after A1).**
- `add_local_source` / `update_local_source` / `list_local_sources`: source units owned by the
  workspace, holding:
  - per-channel blocks (he / tr / en);
  - attribution and licence text;
  - a liturgical position `{book, page}` (e.g. Mishkan T'filah 176) that search,
    `prepare_service_from_setlist` and deck conversion can match on.
- Drafts built from them are source-backed, like corpus drafts. These sources are never shared
  upstream.
- Acceptance: a Mishkan T'filah reading is entered once, found by `search_sources` and by page, and
  built into a graphic that carries its attribution.

**T3. Reference material on conversion rows (after C4 and A6).**
- `import_singular_extract` stores a Singular extract's compositions as reference records: app,
  name, layer and text, with no credentials.
- `convert_singular_deck` rows and drafts carry `reference{origin, app, comp, text, imageAssetId?}`.
- Matching is content-based, not name-only, following work/companion-simone/crc-match-report.md:
  - Hebrew: NFKD with presentation forms folded, niqqud stripped, final letters folded;
  - transliteration: normalised.
- Acceptance: every conversion row shows the old text beside the proposed graphic, and matching
  reproduces the first pass's EXACT / TEXT-MATCH counts on the same inputs.

**T4. Review board (after A2).**
- `create_review_board{draftIds, grouping, title}` creates a web page for signed-in members. For each
  graphic it shows the stored render, and the reference when there is one. Graphics are grouped by
  deck page or by service, with Approve / Needs change and a note per item.
- `get_review_board` returns the decisions and notes to the agent.
- Written for a non-technical reviewer: no ids, no jargon, works on a laptop and a tablet.
- Acceptance: a reviewer marks 20 items and the agent reads the decisions back; a fix that is
  republished shows as updated on the board.
