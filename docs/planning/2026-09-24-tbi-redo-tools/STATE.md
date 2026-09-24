# TBI redo tools (G1–G6): state

Goal: the TBI redo thread builds TBI's library and deck with a handful of calls instead of a few
hundred inline ones. The order is docs/planning/2026-09-23-tbi-redo/HANDOFF-CODE-2026-09-24-tbi-redo-tools.md
(Cowork's folder, untracked here and never staged by Code). The build data is work/tbi-redo/build-prep/.

Release authority: Daniel, 2026-09-24 ("go live … everything can push to live"). These packets ship
the same way once merged: gates, relay only if relay/ changes, paired web release, push to main.

## Decisions

- One shared foundation, written first so the packets don't collide:
  - `lib/imports.ts` holds the per-workspace import store (G1).
  - `lib/build-keys.ts` holds the per-workspace map from a caller's stable key to what it made:
    a local source id, a draft id or a draft set id. G3 and G4 write it; G6 reads it.
- Text is never retyped. Every bulk tool reads the stored import and reports a sha256 per block, so
  the caller can prove the text round-tripped (ruling 3).
- GATE: attribution may be null for a song setting or TBI text. The graphic then carries no credit
  line, and the source says "not credited". Proceeded because inventing a credit breaks ruling 3, and
  14 of the 76 sources have none.
- GATE: a block may be transliteration only, or transliteration and English. Proceeded because 15
  of TBI's song settings are sung in transliteration and have no Hebrew in her compositions.
- GATE: A4 (structured custom content) stays not done. G3 covers TBI's need, because songs and TBI
  texts become local sources and the slides are English only. Recorded as a known gap in the MCP plan.

## Packets

| Packet | Scope | Owner | Status |
|---|---|---|---|
| F | `lib/imports.ts` + `db/imports.sql`; `lib/build-keys.ts` + `db/build-keys.sql` | Code | planned |
| G1 | `open_import_dropzone`, `get_import`, `/import/[token]` page, chunk route; `import_singular_extract` by importId, and the flat `subcompositions[]` shape | worker | planned |
| G2 | `upload_asset` by importId or allowlisted https url; server downscale (sharp) to 512 KB / 4096 px | worker | planned |
| G3 | local sources: optional book/page, `kind`, tr-only blocks, null attribution; `import_local_sources` | worker | planned |
| G4 | `batch_create_drafts` (≤50 items; source draft, set, slide, customize_shared) | worker | planned |
| G6 | `apply_deck_plan` (rows or importId, expectedVersion, dryRun) | worker | planned |

## Evidence

(none yet)

## Open questions

(none yet)
