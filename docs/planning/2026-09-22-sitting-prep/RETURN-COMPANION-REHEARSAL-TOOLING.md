# Companion rehearsal tooling

Worktree: `C:/Users/dsbog/crc-overlays-companion-rehearsal-tooling`, created from
`google-signin` `e0f3c94`.

`scripts/audit-companion-rehearsal.mjs` is a read-only gate for generated rehearsal decks. It
requires the source export, generated deck, conversion report, and slot map. It verifies all 16
unique slot cue ids occur in deck actions, no slot buttons remain on Singular, and non-overlay
camera/switcher action sequences on pages 76–78 are unchanged. `--fallback-pages 54,59` rejects
any relative page-up/page-down control on fallback pages, preventing the known escape into
unrelated pages.

The provisional output is ignored at
`work/companion-rehearsal/provisional/PROVISIONAL-ProductionDSKTP-2026-09-16.overlays.companionconfig`
with its conversion report and manifest. It was generated from Michael's original export,
existing catalog map, and the existing 16-id `slots.json`; it converted 832 and left 76 on
Singular, with no slot buttons waiting. The auditor passed with all 16 ids and no camera-action
differences.

This is explicitly **not Michael-ready**: it does not use any unpublished draft ids, has no
reviewed replacement/fallback page map, and no live Companion import was attempted. When pending
draft ids are reviewed and published, make a final deck with the same converter command and run.
The exact nonsecret provisional generation command was:

```powershell
node scripts/convert-companion-singular.mjs --in C:/Users/dsbog/crc-overlays-vercel/work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig --out work/companion-rehearsal/provisional/PROVISIONAL-ProductionDSKTP-2026-09-16.overlays.companionconfig --catalog C:/Users/dsbog/crc-overlays-vercel/work/companion-conversion/2026-09-22/catalog-map-2026-09-22.json --catalog-notes C:/Users/dsbog/crc-overlays-vercel/work/companion-conversion/2026-09-22/catalog-notes-2026-09-22.json --slots C:/Users/dsbog/crc-overlays-vercel/work/companion-conversion/2026-09-22/slots.json --report work/companion-rehearsal/provisional --report-name PROVISIONAL-conversion-report --no-gzip
```

```powershell
npm run audit:companion-rehearsal -- --deck <final.deck> --source <original-export> --slots <published-slots.json> --report <conversion-report.json> --fallback-pages <reviewed-fallback-pages> --out <final-manifest.json>
```
