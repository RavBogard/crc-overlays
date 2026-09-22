# Legacy CRC overlay source adapter

`legacy-crc-shabbat-morning.sources.json` is the reviewed mapping for the bounded
morning-service catalog. It makes the maintained CRC Shabbat morning feed authoritative
for sacred text. The Singular archive supplies only stable composition UUIDs,
operator names, title labels, presentation records, and the authorized non-liturgical
`Thank you` message.

`privateOriginalEnglish` is the narrowly declared exception: a CRC-original English
interpretation whose exact archive composition, field, and hashes are recorded in the
mapping. The builder emits it as one `original-en` authoring unit without adding it to
the pinned feed or any print source. Its declaration records provenance only; it does
not assert publication, redistribution, attribution, or a license grant.

The mapping pins the whole feed, each selected unit, the archive, each selected
composition record, and each generated text-field object by SHA-256. Every prayer field names its `he` or `tr` channel and
its exact block indexes. Generation stops if any pin, unit, stanza type, channel, or
block index changes. This is deliberate: a changed siddur must be reviewed and the
mapping updated rather than flowing silently into broadcast output.

Run from the overlay repository:

```powershell
python scripts/generate-cues.py --check
python scripts/validate-cues.py
```

The first command requires the sibling private checkouts at `../shireishabbat` and
`../Singular-CRC-Archive/2026-09-09-master`. Override them with `--source-root` and
`--archive-root`. The second command validates the committed catalog and provenance
without reading either private checkout, so it is suitable for ordinary CI.

The three Kaddish cues are explicit slices of one maintained morning unit; they are
not invented canonical unit IDs. English translation channels remain excluded by
default. Birchot Hashachar is the sole approved exception: eight exact CRC English
blocks are paired with their Hebrew/transliteration blessings, and the final English
block is completed by the separately hash-pinned CRC `BH-E3G` source fragment. The
four historical Birchot UUIDs remain command-compatible as three visible panels plus
one hidden alias of the third panel; no blessing is omitted.

The feed declares the text `CRC-internal, non-commercial` and attributes Central
Reform Congregation, St. Louis. This private consumer may carry the selected generated
text for CRC's congregational use. Do not publish the source feed, expand this into a
corpus copy, or reuse the text outside that permission.

## Server-only siddur library

`siddur-library.json` expands authoring search beyond the bounded overlay mapping. It
is generated from all twelve books declared by the maintained private
`shireishabbat/dist-app/books.json` shelf: CRC Shabbat evening and morning, Beit
Mitzvah, Slichot, the five legacy High Holy Day service volumes, Shirei Shabbat
evening and morning, and Shirei Tshuvah. This is an authoring source index, not a cue
catalog and not a claim that every block can be overlaid automatically.

The generated library admits only two forms:

- a bilingual source block when the same canonical feed block contains non-empty
  `he` and `tr` fields;
- an original-English source block when the same feed block contains non-empty `en`
  and explicitly declares `role: original`.

It does not align adjacent Hebrew and transliteration blocks, infer correspondence
from a folio or verse label, or admit ordinary English translations as original
readings. Trope without transliteration, rubrics, translations, and unmatched
channels stay out of the authoring source set. The committed coverage record reports
those exclusions rather than hiding them.

At the pinned build, the library covers 12 books, 685 feed units, and 7,064 blocks.
It exposes 647 units containing 4,188 exact bilingual blocks and 194 explicitly
original English blocks. It reports 38 units without either supported form, plus 301
unpaired Hebrew blocks, 2,010 English blocks without the original role, and 371
other unsupported blocks. These numbers are generated in
`siddur-library.json.coverage`; use that record rather than copying this paragraph
when the source shelf changes.

Each book records its feed hash, repository commit, printing metadata, and license.
Each generated source has a unique `library:<book>:<unit>` ID and its own feed/unit
origin and SHA-256 pins. The loader in `lib/source-library.ts` appends these sources
to `authoring-sources.json` without changing the legacy authority object, source IDs,
or ordering. This is necessary so an older draft's source pin does not silently gain
a different meaning when the larger library is enabled.

Build or verify it from the overlay repository with the private sibling checkout:

```powershell
python scripts/build-siddur-library.py
python scripts/build-siddur-library.py --check
node --test --experimental-strip-types tests/source-library.test.ts
```

The maintained `shireishabbat/dist-app` feeds are authoritative. The
`shirei-tshuvah-web/books` copies were inspected as consumers but may lag or differ
while that working tree is being synchronized, so the builder does not merge text
from them. The library JSON must remain server-only: browser code receives bounded
source-search results and must never import or download the raw corpus.
