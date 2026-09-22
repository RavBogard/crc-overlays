# Missing-song private sources

Worktree: `C:/Users/dsbog/crc-overlays-song-source-adoption`, rebased additively onto frozen
active `8062b52` (private-record commit `fc07d07`, plus this materialization commit).

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
draft/template revisions before proposing replacement.

`python scripts/build-authoring-sources.py --source-root
C:/Users/dsbog/shireishabbat-source-authority-a3d` regenerated the 99-unit private source pack;
the matching `--check` command passed. Its only materialized additions are the two matching
`original-en` source units and their derived hashes in `content/authoring-sources.json`.
`tests/authoring.test.ts` now enumerates all three private original-English source identities and
derives the browse-count allowance from that membership, rather than silently increasing a count.

Candidate verification passed: `npx tsc --noEmit`, `npm test` (24 mjs tests plus the TypeScript
suite), `npm run lint`, and `npm run build`. The focused archive tests passed (2/2). Full
`npm run test:py` remains blocked by the pre-existing `8062b52` authority mismatch: mapping
repository commit `38e274f6b40d62ad91cdd6ed9e6d93b9e085d553` differs from compiled cue provenance
`a3d88b6fccb5a87b1519d8bccefc78b5d52ef2e9`, yielding 8 failures and 2 errors unrelated to these
private records. Logs are ignored under
`work/sitting-2026-09-22/song-source-release-candidate/logs/`.
