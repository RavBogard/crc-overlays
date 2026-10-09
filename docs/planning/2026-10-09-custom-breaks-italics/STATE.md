# Custom text: kept line breaks and italics

Michael, Oct 9: "make it so that all line breaks in text boxes work" (Psalm-ish 1 lost its breaks). He also wants Markdown italics, needed on Psalm-ish 1 and 2.

## Cause

Psalm-ish 1 and 2 have `latinLineBreaks: "phrases"`. That reflow, meant for siddur text whose source line wrapping is arbitrary, joined every typed line with " · ".

## Change

- lib/authoring-model.ts, `customLayer`: custom text and custom lines are built with each typed break as U+2028, which reflow leaves alone. This follows the local-wording precedent: the Player turns U+2028 back into a newline. Typed breaks in the congregation's own words always show. Siddur text is unchanged.
- lib/inline-italics.ts: in custom content only, `*words*` and `_words_` become private-use markers U+E000/U+E001 at build time. Siddur asterisks, such as Birchot 2's footnote "*", are never read as markup. Lone, spaced or mid-word marks stay as typed. The Player (`setRichText`) draws the marked runs as `<em>` inside one inline `<span>`, because a text box is often a flex or grid container. The name plate's lead lines keep italics too.
- Plain-text readers strip the markers and turn U+2028 into newlines: `openingWords` (lib/cue-opening.ts) and `slotTextOf` (lib/slot-catalog.ts).
- Editor hint under custom text and lines: "Each line break shows on screen. Put *asterisks* around words for italics."
- No italic Latin face is bundled, so the browser slants Work Sans itself.

## Evidence

- tests/inline-italics.test.ts covers the markup rules. tests/custom-lines.test.ts covers breaks that survive "phrases", italics in text and lines, Birchot 2 having no markers, and plain-text readers.
- Headless Chrome on rehearsal fit-stage: Psalm-ish 1 as a left panel with "phrases" shows all 16 lines, "dance", "song" and "…Halleluyah" in italics (computed `font-style: italic`), no " · ", and fits. As a lower third it is 768px tall against a 360px limit, so fit blocks it.

## Open

- Psalm-ish 1 and 2 are published lower thirds. Republished with their breaks, they no longer fit a lower third, so Michael should make them left panels or split them. Their live versions are unchanged until republished.
- Not released.
