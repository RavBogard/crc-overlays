# Legacy CRC overlay source adapter

`legacy-crc-shabbat-morning.sources.json` is the reviewed mapping for the bounded
eight-cue catalog. It makes the maintained CRC Shabbat morning feed authoritative
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

Current liturgical coverage is Barechu, Modeh Ani, Mah Tovu / Hineh Mah Tov, Oseh
Shalom, and the three archived Mourner's Kaddish panels. The three Kaddish cues are
explicit slices of the one maintained morning unit; they are not invented canonical
unit IDs. The catalog intentionally excludes English translation channels. The
archive's other 154 named compositions remain unmapped and outside this batch.

The feed declares the text `CRC-internal, non-commercial` and attributes Central
Reform Congregation, St. Louis. This private consumer may carry the selected generated
text for CRC's congregational use. Do not publish the source feed, expand this into a
corpus copy, or reuse the text outside that permission.
