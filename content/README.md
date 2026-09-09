# Legacy CRC overlay source adapter

`legacy-crc-shabbat-morning.sources.json` is the reviewed mapping for the bounded
morning-service catalog. It makes the maintained CRC Shabbat morning feed authoritative
for sacred text. The Singular archive supplies only stable composition UUIDs,
operator names, title labels, presentation records, and the authorized non-liturgical
`Thank you` message.

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
