# Custom Hebrew lines

Michael (Oct 9): "I need an option to freely add new lines of translit, and hebrew. Right now if it's not in one of the siddurs I just can't put Hebrew in with proper formatting."

## Decision

Custom text gains a second kind, alongside the plain block: **Hebrew lines**. Each line is a Hebrew line, its transliteration and an optional translation. The lines build into the same channels and panel rows a siddur passage does. A side panel shows one row per line. A lower third shows Hebrew and transliteration columns with a translation line beneath. A card shows Hebrew over transliteration and refuses translation lines, as it already does for passages. Hebrew is right to left in the Hebrew face.

Local sources (`add_local_source`) already let a congregation enter its own readings, but only over MCP, and they are meant for printed readings with a book and page. Lines are for one graphic's own words.

## Shape

- `CustomContent` is `{mode:'custom', text, rows?, rowOrder?}` (lib/authoring-model.ts). `rows` is at most 24 lines of `{he,tr,en}`, each layer at most 1000 characters and trimmed. Empty lines are dropped. A draft has text or rows, never both. A draft without rows stores no key, so existing custom graphics keep their hash.
- `buildCue` adds `textMainheb` and `textMainEng` (and `textTranslation` on a lower third), plus `contentRows`, and gives the text passage motion. `rowOrder` applies as it does for passages.
- MCP: `content` accepts `{mode:'custom', rows, rowOrder?}` (lib/mcp/shared.ts). The tool snapshot was regenerated.
- Editor: the Text card has a "Kind of text" switch, Plain text or Hebrew lines. Lines can be added, moved and removed (app/author/custom-editor.tsx). Library excerpts and thumbnails read the lines.

## Evidence

- tests/custom-lines.test.ts covers the panel, the lower third, the card refusal, parsing and its errors, an unchanged plain-text hash, and the form round trip.
- Rehearsal editor in headless Chrome: two lines of Birkat Kohanim render as lower-third columns with the translation line, and as two side-panel rows. Both fit. Save and reopen keeps both lines. No page errors.
- `tsc`, `npm test`, lint (the two existing warnings), build.

## Open

- The editor has no row-order control for lines yet; the MCP accepts `rowOrder`.
- Not released.
