# Missing-song private sources

Worktree: `C:/Users/dsbog/crc-overlays-song-source-adoption`, based on active `ed58d23`.

Adds two additive `privateOriginalEnglish` records only:

- `shma.am-i-awake@legacy-shabbat-morning`
- `shma.how-awesome@legacy-shabbat-morning`

Both retain exact archive text SHA-256s, composition UUIDs, and text-property identities from
`master-composition-449398.json` SHA-256
`9e372260b251d87a126dfba57dbb699531c466338a9134263963f453db3f8f1c`. They carry the same narrow
private-authoring provenance and no asserted publication, redistribution, attribution, or license.
The focused tests verify each record's bytes/hash/provenance and the generated `original-en` block.

Local catalog-map evidence has distinct published identities: Am I Awake
`23cc50be-1d16-4720-b073-d2ea207c4c12`; How Awesome / Shema
`111297d8-29c7-44b1-837f-b71e20b7e74e`. This packet does not repin either cue. No read-only live
catalog MCP operation is available in this environment, so a source worker must read current live
draft/template revisions before proposing replacement. Active `8062b52` has newer mapping authority;
integrate these records additively and do not overwrite its authority or pins.
