# Per-graphic protocol (graphic workers)

Tools: the CRC Overlays MCP (`mcp__claude_ai_CRC_Overlays__*`). Load schemas with ToolSearch
(`select:<names>`). Do not spawn agents. Work one draft at a time.

## Standing rules
- Exact wording: never change source text, never pass `refreshSourceIds`, never create a local
  variant or custom text to make something fit. Source selections change only when the packet says so.
- Readability: never shrink fonts below the comfortable defaults to force a fit. If it does not fit,
  record it and stop on that draft.
- Layout rule (Daniel, 2026-09-23): a piece that needs MORE THAN TWO readable lower thirds is a
  readable LEFT panel sequence. 1-2 lower thirds stay bottom. A multi-part prayer uses one layout
  for all its parts.
- Keep CRC siddur sources as default; Shirei Shabbat only as a labeled supplement.
- Keep existing titles, Hebrew accent titles, artwork (Siona) and names unless the packet says to
  change them. Flag an accent title that belongs to a different prayer (gap F); do not delete Hebrew
  labels wholesale.
- Use `list_drafts` with `compact:true` + `query` for inspection. Call `get_draft` only when you need
  block IDs, and do not paste its output back.

## Steps per draft
1. Read current state (`list_drafts` compact, query by name). Note `version`, `activeVersion`.
2. If a style/layout change is needed: `style_draft` with `dryRun:true` first, check
   `sourcePreserved`, then apply with `dryRun:false` and the same `expectedVersion`.
   Default style for left panels: `layout:"left"`, `arrangement:"blocks"`,
   `comfortableTypography:true`, `latinLineBreaks:"paragraphs"`.
3. `preview_draft` (exact version) → `fit_check_draft` with `includePreviewImage:true`.
4. Inspect the image yourself: text fully inside the panel, Hebrew then transliteration in matching
   paragraphs, readable size, no stray/dangling separators, correct title and accent title, nothing
   duplicated or missing versus the selected blocks.
5. Only if fit = pass AND the image is acceptable: `review_draft` (`humanApproved:true`), then
   `publish_draft`. Basis: Daniel's blanket authorization for graphic publication (handoff
   2026-09-23). Never claim Daniel inspected it.
6. If the currently published version is already the current version and it passes, just record
   the receipt (status `verified-current`); do not republish.
7. Write one receipt file per draft:
   `C:/Users/dsbog/crc-overlays-vercel/docs/planning/2026-09-23-overlay-consistency/receipts/<kebab-name>.json`
   with: draftId, name, status (published | verified-current | held | failed), kind (original |
   replacement | superseded), layout, draftVersion, previewId, cueHash, fit {verdict, fill},
   imageInspected (one sentence), sourceCheck (one sentence), revision (if published),
   approvalBasis, notes, at (date).

## Holds
Authority holds (diagnose only, do not rebase/refresh/publish): Birchot Hashachar 4 `2b3da7a3…`,
Mi Chamocha Sat 2 `5bad62c7…`, Birchot Hashachar 3 `ceb24b8c…`, Mourners Kaddish 3 `dbf354df…`,
Psukei 2 `f792daee…`. For these, write a receipt with status `held` and a diagnosis of what differs
(selected content vs pinned metadata), from `get_draft`/`get_source`, without changing anything.

## Return
A short table: draft, action, status, fit, one-line note. List anything that needs a main-thread
decision. Do not include tool output dumps.
