# HANDOFF → Code (shireishabbat): declare which English translates which Hebrew

From: Overlays (`crc-overlays-vercel`), 2026-09-14, after shipping the overlay text-layer
controls (Deploy record 17, commit `2fbd6d6`).
To: whichever lane owns `build/tools/extract_feed.py` and the app feeds.
Copies: `crc-overlays-vercel/docs/planning/2026-09-14-integration/`.

## Why this exists

Overlays now lets a person choose which text layers a graphic puts on screen — **Hebrew ·
Transliteration · Translation** — in any combination, and how they sit on the slide. The
first two work. **The third cannot be lit for anything in this corpus**, because the feed
does not say which English translates which Hebrew.

The overlay handoff that ordered the control assumed it did: *"Translation comes from the
shireishabbat feed, which carries English for every passage in every siddur, so no
'unavailable' state is needed."* That is not what the feed says. The chip therefore ships
in its final shape, offers itself only where a correspondence is actually declared, and
otherwise says why. Land this and the layer lights up with no product change on our side.

## The gap, measured

Across all thirteen feeds in `dist-app/` at `7d2cbcc`:

| | count |
|---|---|
| units | 740 |
| `type:"stanza"` blocks carrying both `he` and `tr` | 4,597 |
| **runs** of consecutive he+tr blocks (a passage, as a reader meets it) | **1,151** |
| `type:"english"` blocks | 2,529 |
| …of which sit directly after a he+tr run | 1,056 |
| blocks carrying `he` **and** `tr` **and** `en` on one record | **8** |

So the correspondence is there on the printed page — the English of a passage follows it —
and it is nowhere in the data. A consumer can see it and cannot prove it.

`Awakening Hareini` in `legacy-shabbat-evening-feed.json` is the shape, exactly: four
`stanza` records with `he`+`tr`, then one `english` record whose sentence translates all
four. Nothing in those five records says so.

## Why we will not infer it

Our library builder already refuses, on purpose —
`crc-overlays-vercel/scripts/build-siddur-library.py` states its own rule in the coverage
report it writes: *"Same-record he+tr+en stays one bilingual record; no adjacent English is
paired."* Adjacency is not correspondence. An `english` record after a run may be that run's
translation, or a kavannah, or a reading, or an interpretive gloss, or the translation of
the *next* passage set above it on the page. Guessing puts the wrong English under the
Hebrew on a screen in front of a congregation, which is the one failure this product must
not have. So: declared, or dark.

This is the same standard `extract_feed.py` already holds itself to at `:450` — an
English-only unit is marked `role:"original"` from a **structural** fact, never from titles,
punctuation or prose.

## What the feed should carry

On each `type:"english"` block that is the translation of a Hebrew passage in the same unit,
declare what it translates:

```json
{ "type": "english",
  "en": "I hereby take unto myself the commandment of the Creator…",
  "translates": [0, 1, 2, 3],
  "folio": 2, "phys": 3 }
```

- **`translates`** — the indices (within `unit.blocks`) of the he+tr records this English
  renders, in printed order, contiguous. Present only where the source actually says so.
- Where the English is **not** a translation — a reading, a kavannah, a rubric, an
  interpretation, a credit — leave `translates` absent and, where the source declares it,
  keep using the existing `role`. Absent is a real answer here, and we will render it as
  such: no chip, with the reason shown.
- Indices, not ids: the feed has no block ids of its own, and our ids are derived from
  position (`library:<book>:<unit>#block-<index>`), so indices map straight through.
- One English record may cover several stanzas (usual); several English records must not
  claim the same stanza.

Nothing about the text, the bytes, the page, the licensed lane or the printed book changes.
This is metadata about a relationship that is already true.

## Where it comes from

`build/tools/extract_feed.py` composes the block from a feed-mark, and `role` is already
carried through from the source (`:405-409`). Whatever wraps a translation beside its Hebrew
in the Typst content is what should emit `translates`; if the source does not distinguish a
translation from an adjacent reading, **that** is the real gap and it belongs to the corpus
desk, not to the extractor — say so in the return and we will wait rather than take a guess.

Add the pair check to `build/tools/validate_feed.py`: `translates` is a non-empty list of
in-range indices, contiguous and ascending, each pointing at a record with both `he` and
`tr`, no index claimed twice within a unit.

## Verify

Print coverage per volume: runs, runs with a declared translation, and runs deliberately
left undeclared with why. A volume at 0% is a fine result if that is the truth; we would
rather have an honest zero than a hopeful guess. Byte-identical feeds for any volume where
nothing was declared.

## What we do with it

`scripts/build-siddur-library.py` will turn each declared relation into the shape our
authoring model already consumes — a `translation-en` block carrying `pairedBlockIds` — so
the Translation chip lights, the arrangement switch gains its third layer, and published
graphics pin the English by hash the way they pin the Hebrew. No schema change here beyond
that mapping.

## Return

`RETURN-CODE-CORPUS-TRANSLATION-PAIRS-<date>.md` with the coverage table, the validator
addition, and the feed shas that moved.
