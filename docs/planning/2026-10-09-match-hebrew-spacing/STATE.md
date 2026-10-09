# Match Hebrew spacing

Michael, Oct 9, looking at Birkat Kohanim: the transliteration's line spacing did not look like the Hebrew's, and changing it seemed to do nothing. He then found that part was user error. The underlying confusion is that line height is a multiple of each role's own font size. Hebrew 46px x 1.15 is 53px, while transliteration 38px x 1.12 ("compact") is 43px, so typing the Hebrew's number (1.15) barely moves the transliteration (44px). Matching takes about 1.4.

## Change

- app/author/line-pitch.ts (pure): `linePitchPx` reads pixels between lines from computed styles, treating `normal` as 1.2. `matchingLineHeight` returns the line height on the control's 0.05 steps, kept within 0.9–2, that spaces a role like the Hebrew.
- app/author/typography-controls.tsx: under Look → Individual text settings, each Hebrew, transliteration and translation line-height field shows "Npx between lines", measured from the live editor preview. A MutationObserver keeps it current. Transliteration and translation get a **Match Hebrew spacing** button. It sets their line height from the preview's actual sizes, so it covers template defaults, compact/spacious and fit shrinking. It is disabled when either role is missing from the preview, and reads "Matches Hebrew spacing" when the spacing is within 1px.

## Evidence

- app/author/line-pitch.test.ts covers Birkat Kohanim's numbers (38px against 52.9px gives 1.4) and the clamping.
- Rehearsal editor in headless Chrome, Mah Tovu (left panel): before the click, 45px Hebrew and 36px transliteration. After the click, the field shows 1.5, both roles are 45px, and the button reads "Matches Hebrew spacing". No page errors.
- `tsc`, `npm test`, lint (the two existing warnings), build.

## Open

Not released. Birkat Kohanim itself was left unchanged; Michael adjusts it.
