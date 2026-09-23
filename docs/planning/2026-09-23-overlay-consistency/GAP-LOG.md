# Shared MCP / default gap log

One entry per shared fix. Fields: reproduction, cause, shared fix, live proof, remaining limitation.
Items 1-6 (compact list_drafts, style_draft, fit images, 360px lower-third ceiling, Chromium core
dumps, source sets) were closed before 2026-09-23; see the handoff START-HERE.md.

## A. Blank lines between arbitrary old groups (blocks arrangement)
- Reproduction: Psukei D'Zimrah 1 `65743cb0…` v2 (left, blocks) fails fit (fill 1.08). Its
  transliteration groups cut Psalm 92 and Ashrei into contiguous halves; each half got `\n\n`,
  so transliteration had 6 paragraphs against the Hebrew's 4. Same on Mi Chamocha Sat 1 `a5c90765…`.
- Cause: `composeContentRows` joined every group with `\n\n` (lib/authoring-model.ts).
- Shared fix: `joinGroupParagraphs` joins groups of one source that are contiguous (no skipped
  block carrying that channel) with `\n`; a source change or skipped block keeps `\n\n`. Source
  selections, pins and snapshots are unchanged. Test: `blocks arrangement keeps contiguous groups
  of one source in one paragraph` (fails before, passes after).
- Live proof: released `8f36dd8`; Psukei 1 fail 1.077 -> pass 0.997 (published rev 2); Mi Chamocha Sat 1 fail 1.045 -> pass 0.97 (published).
- Remaining: none known.

## B. Phrase separator at a leading or trailing newline
- Reproduction: How Awesome/Shema `111297d8…` v5, preview `d98a75e4…`: phrase mode shows a
  dangling ` · ` from the source's final newline.
- Cause: `reflowLatinParagraphs` replaced every single newline, including edge ones.
- Shared fix: edge newlines are trimmed before the phrase/paragraph join (display only; source
  text unchanged). Mixed Hebrew/Latin bodies keep their line structure and gain no separator.
  Test: `phrase separators never appear at a leading or trailing newline`.
- Live proof: released `8f36dd8`; How Awesome/Shema v5 refit shows no dangling separator (published).
- Remaining: none known.

## C. Splitter granularity / layout choice (>2 lower thirds -> left)
- Status: mitigated by the layout rule. Long pieces became left sequences on existing IDs (Shiru,
  Hatzi Kaddish, Kedusha, Haftarah After, Birchot) instead of one-block panels. No splitter change
  shipped; `split_draft_into_set` still makes one panel per block, so do not use it for long prayers.

## D. Five source-pin errors (wave 3) / stale pins block the explicit rebase
- Reproduction: Birchot Hashachar 3 `ceb24b8c…` / 4 `2b3da7a3…`: every update_draft, including
  `refreshSourceIds` with a repointed selection, returned "Pinned source authority has changed;
  explicit source rebase and review are required". Same class as Mourners Kaddish 3, Mi Chamocha
  Sat 2, Psukei 2 (the five wave-3 source-pin errors).
- Cause: the pinned library record's authority metadata moved on (feed `ad194a55` -> `d00e67e6`)
  while the selected he/tr text stayed byte-identical (worker verified sourceBlockSha256).
  `update_draft` called `assertSourcePin(current)` unconditionally before reading the patch, so the
  explicit rebase the error asks for could never run.
- Shared fix: `staleSourceIds(draft)` names the sources whose stored pin disagrees with the draft's
  own selection. Without `refreshSourceIds` a stale draft is still refused exactly as before. With a
  refresh, the update proceeds only if every stale source it keeps selected is in
  `refreshSourceIds` (or it is dropped); the new snapshots and pin are rebuilt from current sources.
  Identity checks are not weakened: wording must still be verified before a refresh.
  Tests: `tests/stale-pin-refresh.test.ts` (refusals unchanged; rebase; repoint).
- Live proof: released `5f149da`; Birchot Hashachar 3 and 4 repointed to the canonical source on the
  first refresh attempt and published (rev 3, fill 0.78 each). B1-B4 now show pairs 1-8 once, in order.
- Mi Chamocha Sat 2 and Psukei 2: identity gate passed (byte-identical he/tr), repointed to the
  canonical sources and published. All five wave-3 source-pin holds are resolved (MK3 superseded).
- Remaining: none known.

## E. Published cue retirement / supersession
- Finding (read-only trace): archiving hides a draft and its cue from the operator library
  (`list_catalog`), but `published()` filters only on `active_revision`, so `/api/catalog`
  (Companion) and the live relay still serve archived published cues. This is deliberate and
  tested (`archive and restore hide editor records without changing published output`).
- Decision: do not change archive semantics now (existing precedent; relay behavior for a
  missing cue unverified). Instead reuse cue IDs where a superseded cue has a natural successor,
  archive the rest, and bind the new Companion preset only to final IDs.
- Remaining limitation: archived-but-published cues still appear in the Companion module's cue
  picker. A reversible retire path (published() honouring archivedAt) needs relay verification.

## F. Inherited unrelated Hebrew accent titles
- Reproduction: Siyahamba inherited Mi Chamocha's accent title from the legacy template cue it was
  imported from (editableFromBaseline copies the template cue's `accentTextTitle`).
- Cause: data inheritance at import, not a code default. A text-match validator is unreliable:
  section-style accents (e.g. Psukei d'Zimrah) never appear in their prayer text.
- Shared fix: compact `list_drafts` rows now carry `accentTitle` and
  `flags.accentTitleSharedWith` (other titles in the catalog using the same accent, ignoring niqqud
  and punctuation). A review prompt, not a rule. Test: `tests/draft-catalog-accent.test.ts`.
- Live proof: released `e0e80ea`; compact rows show `accentTitle` and `accentTitleSharedWith`.
- Related finding: the draft named "Zochreinu" `ba8fa5be…` carries the on-screen title
  "Mi Chamocha מִי כָמכָה" (an inherited title, not only an accent). Queued for the catalog sweep.

## G. Verbose tool results
- Reproduction: one publish_draft result for Psukei 1 was ~25 KB (cue twice, each with source
  snapshots, animation tracks and per-block pin hashes); preview_draft ~12 KB.
- Cause: MCP `result()` serialized the authoring service's full records for every operation.
- Shared fix: non-read operations drop `sourceSnapshots`, `animations`, `openingWords`, and
  replace `blockSha256` maps with `pinnedBlockCount`; results say `compacted.fullRecord:
  get_draft`. Reads (get_draft, get_source, search_sources, list_*, list_revisions,
  get_service_history) are unchanged. Test: `MCP mutation results omit source snapshots,
  animations and per-block hashes; get_draft stays complete`.
- Live proof: pending release.
- Round 2 (released `e0e80ea`): publish results name the repeated `cue` once
  (`"same as revision.cue"`); set mutation results summarize each member's `draftSetManifest` as
  `{version, selectionCount}` (an archive of a 5-member set repeated the 5-selection manifest 5 times).
- Remaining: get_draft itself is still large; use list_drafts compact for inspection.

## H. Custom right-panel text outside the panel, and a fit check that passed it
- Reproduction: "Thank you" `09f50803…`, "Passing the Torah" `cadc69dd…`, "Silent Prayer"
  `bf4eb2c9…` (all layout right, custom textMain). Preview image: the first letter of each line
  sits left of the panel edge. Server fit check: pass.
- Cause: `.right .prayer:not(.content-row *)` (specificity 0,3,0) kept the pre-redesign geometry
  (right 72, width 600, top 266) and outranked the current `.right .combined` rule, so the box ran
  from x1248 while the 640px panel starts at x1264. findFitErrors only checked the frame, not the
  panel.
- Shared fix: that rule now holds the current geometry mirroring the left lone-channel box
  (right 48, top 184, width 576, height 840, 38px); findFitErrors also reports "<element> extends
  beyond the panel." for side-panel copy outside `.base`. Tests: `tests/right-panel-geometry.test.ts`,
  `app/author/preview-panel.test.ts`.
- Live proof: pending release.

## I. Arabic letters render as empty boxes
- Reproduction: Od Yavo Shalom `e7b73357…` ("سلام"); server preview shows tofu boxes.
- Cause: the overlay faces (Work, Noto Sans Hebrew) have no Arabic glyphs and the server Chromium
  has no system Arabic font. Windows renderers may fall back to Arial; not verifiable here.
- Shared fix: bundled Noto Sans Arabic (OFL, `public/assets/NotoSansArabic-*`) as a fallback in the
  overlay text stacks, `unicode-range` limited to Arabic so no other cue downloads it. Test:
  `tests/overlay-arabic-font.test.ts`.
- Live proof: pending release.
