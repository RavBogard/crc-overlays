# Overlay round 2 — local completion (not deployed)

Daniel's October 8 follow-up to the `overlays-2026-10-07` batch, items 1a–5, on `google-signin`.

## What changed

- 1a/1b: lower-third columns are back to the pre-October-7 geometry: transliteration 730px at the left, Hebrew 850px ending at the right edge, 30px apart, top-aligned as before. Text positions match the pre-batch renderer (`ca3af00^`) to the pixel for Barechu, Elohai N'shamah, Shema and Hareini, and are within 1px for a three-language panel. The Oct 7 centering fix (Adonai S'fatai) stays.
- 2: `presentation.bottomSplit` (whole percent, 20–80) moves the divider between the two columns. Absent = the original columns (about 46%). It is set with a slider and an "Original position" reset under Bottom panel arrangement, saved per graphic, and available over MCP.
- 3: Stacked is one left-aligned column at the body's left edge (just right of the logo), with 4px between rows; each row wraps as needed. Order follows the saved language order (default Hebrew, transliteration, translation). In stacked mode only, the translation uses the transliteration's default size (35px) instead of the 30px under columns; authored sizes still apply. Changing the order no longer switches a lower third to Stacked.
- 4a: the lower third's Hebrew title is placed by its measured glyph ink (vowels included), centred in the title strip. A title too tall for the strip steps down in size. None of the checked titles needed that.
- 4b: a left-to-left words-only change shifts the words' tracks so the earliest starts at 0. It no longer waits for the panel's lead-in (it was 300–400ms; about 60ms of asset settling remains). The retained logo is not reassigned, so it is not reloaded.
- 5: side by side with Translation first in the order puts the translation above the two columns; otherwise it stays below them.

## Evidence

- `npm test` 1,304 TS + 35 MJS pass, 12 existing skips. `tsc --noEmit`, lint (two existing warnings) and `npm run build` pass, and `git diff --check` is clean.
- Isolated renderer harness (session scratchpad) compared `ca3af00^`, the deployed tag and the working tree using real CRC draft texts and presentation (Barechu, Elohai, Shema, Hareini, May the Memory). It also timed the left-to-left switch.
- Rehearsal editor: the slider renders, the preview follows it (1011/569px at 64%), it saves and reloads at 64%, and an order change keeps Side by side.

## Open

- GATE: implemented the stacked look from Daniel's written description; the referenced "Hareini" screenshot was not attached. Proceeded because the description was specific; confirm against the screenshot.
- Hebrew in Stacked is left-aligned per "all rows left-aligned"; confirm that is wanted for Hebrew too.
- Not released. Release follows RELEASE-STATE.md (paired tag release for both workspaces).
