# Left-to-left transitions: no pause, hold a shared title

This follows Michael's note on the October 8 round 2 change (item 4b). There was still a pause between two left panels. When the title stays the same, it should not animate: only what changes should move.

## Cause of the pause

The left template's words fade out by about 0.15s, but their slide out runs to about 0.39s. The words-only Out waited for the slide, so the panel sat empty for about 0.24s. The words' fade in starts 0.2s after their slide in starts, which added more blank time. Measured in Chrome with the real left template and the old Player, the panel had no words showing for 0.55s of a 1.12s change.

## Change (lib/player.ts)

- Words-only Out uses only the fade tracks of an element that has them, so the words leave once they have faded. The full exit keeps its slide.
- Words-only timing starts at the earliest fade (when the words first become visible), not the earliest track. Their slide in is already under way, with a negative delay, as they appear.
- `heldTitles(from, to)`: the English or Hebrew title is held when its text is the same and it is drawn the same way. That means the same title mode (accent, watermark or none; losing the accent moves the English title), the same title line height and letter spacing, and for the Hebrew title the same Hebrew font. A held title keeps its element, like the panel chrome, and is neither hidden nor animated. If the cue changes again mid-transition, only titles that both panels still share stay held.

## Evidence

- Real Player in headless Chrome, real left template. Old: 1.12s total, 0.55s with no words showing. New: about 0.52s with the same title (the title stays at full opacity throughout) and 0.56s with a new title, with about 0.06s between the old words going and the new ones half visible.
- Tests in tests/overlay-batch.test.ts cover the timing with the real template, held elements skipped in both directions, the heldTitles rules, and drain passing the held set to render and animate.
- `tsc`, `npm test` (1,306 TS + 35 MJS), lint (the two existing warnings) and the build pass.

## Open

Not pushed or deployed. Not yet checked in OBS or the booth.
