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
- Live proof: pending release, then refit of Psukei 1 and Mi Chamocha Sat 1.
- Remaining: none known.

## B. Phrase separator at a leading or trailing newline
- Reproduction: How Awesome/Shema `111297d8…` v5, preview `d98a75e4…`: phrase mode shows a
  dangling ` · ` from the source's final newline.
- Cause: `reflowLatinParagraphs` replaced every single newline, including edge ones.
- Shared fix: edge newlines are trimmed before the phrase/paragraph join (display only; source
  text unchanged). Mixed Hebrew/Latin bodies keep their line structure and gain no separator.
  Test: `phrase separators never appear at a leading or trailing newline`.
- Live proof: pending release, then refit of How Awesome/Shema.
- Remaining: none known.

## C. Splitter granularity / layout choice (>2 lower thirds -> left)
- Status: open. The new rule reduces the need for a smarter splitter; decide per piece first.

## D. Five source-pin errors (wave 3)
- Status: open. Diagnose selected content vs metadata drift; do not weaken identity checks.

## E. Published cue retirement / supersession
- Status: investigating. archive_draft changes authoring visibility only.

## F. Inherited unrelated Hebrew accent titles
- Status: open (Siyahamba example fixed by hand).

## G. Verbose tool results
- Status: open. get_draft returns full source snapshots.
