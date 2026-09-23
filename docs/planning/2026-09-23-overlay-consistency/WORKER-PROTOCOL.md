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
Still held (diagnose only unless a packet from the main thread names the draft AND this file lists
the decision below): Mi Chamocha Sat 2 `5bad62c7…`, Psukei 2 `f792daee…`.

Resolved by main-thread decision (2026-09-23), recorded in STATE.md:
- Mourners Kaddish 3 `dbf354df…`: superseded, archived. Do not touch.
- Birchot Hashachar 3 `ceb24b8c…` and 4 `2b3da7a3…`: repoint to the canonical source
  `awakening.birchot-hashachar@legacy-shabbat-morning` (the one B1/B2 use), same blocks
  (13,14,16,17 / 19,20,22,23) with includeTranslation, because the he/tr hashes are byte-identical
  and only the canonical source has paired English. They become panels 3-4 of the Birchot sequence.

## Catalog packets (WORK-QUEUE.md)
- Work only the packet you are assigned. The queue's family grouping is a guide, not a ruling:
  named ALTERNATES (e.g. "Hashkiveinu (Daniel)/(Jim)/(plain)", "(short)", "(Friday)" vs "(Sat)")
  are separate graphics, not parts; only numbered/sequential parts of ONE piece count toward the
  >2 lower thirds rule.
- Multi-part series with more than two lower-third parts become left panels, one existing part per
  panel, same selection: L'cha Dodi (CRC 1-4 and the Shirei supplement verses), Shalom Aleichem 1-4,
  Adon Olam 1-3, and any similar numbered series. Keep "Shalom Aleichem all" (verses 1+4, intentional)
  as its own graphic; do not expand it.
- A family with mixed layouts: make all its parts one layout (left if >2 parts or if any part is too
  tall as a lower third; otherwise bottom).
- Style defaults: arrangement "blocks" for bilingual left panels (replace "together" /
  alternatingGrouping), comfortable typography (drop smallFont overrides), latinLineBreaks
  "paragraphs". If comfortable typography overflows, do NOT shrink: hold and report.
- Families with no concerns: preview + fit with image the current version; if it passes and reads
  well and is already published at that version, write a `verified-current` receipt (no republish).
  If current != published and the diff is style-only, publish; if wording/selection changed, hold.
- Accent titles: keep, except where listed below. A part of a family with no accent while its
  siblings have one: align it to the siblings.
- Resolved accent decisions (main thread): Festival Kiddush `cef61697…` accent -> "קִדּוּשׁ" (was
  Aleinu's "עָלֵינוּ"); Mi Chamochah 2 HHD evening `d14ac228…` accent -> "מִי כָמֹכָה" (was "שְׁמַע").
  Leave One Love's "שְׁמַע", the shared "תְּהִלִּים" and "קִדּוּשׁ" labels.
- Anything marked DECISION in the queue, possible duplicates, source/wording questions, the draft
  named "Zochreinu" `ba8fa5be…` titled "Mi Chamocha", Olam Chesed, and "Copy of Thank you": do not
  change; report what you see.
- Receipts: one file per draft (a family may share one file with a "graphics" array).

## Return
A short table: draft, action, status, fit, one-line note. List anything that needs a main-thread
decision. Do not include tool output dumps.
