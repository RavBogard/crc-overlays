# TBI redo tools (G1–G9): state

Goal: the TBI redo thread builds TBI's library and deck with a handful of calls instead of a few
hundred inline ones. Orders: docs/planning/2026-09-23-tbi-redo/HANDOFF-CODE-2026-09-24-tbi-redo-tools.md
and its -ADDENDUM (Cowork's folder, untracked here and never staged by Code). Build data:
work/tbi-redo/build-prep/.

Release authority: Daniel, 2026-09-24 ("go live … everything can push to live"). These packets ship
the same way once merged: gates, migrations (db/imports.sql, db/build-keys.sql), relay only if relay/
changes, paired web release, push to main.

## Decisions

- One shared foundation (c68d357) so the packets don't collide: `lib/imports.ts` (per-workspace file
  intake) and `lib/build-keys.ts` (caller key -> local source, draft or draft set). G3 and G4 write
  keys; G6 reads them.
- Text is never retyped. Bulk tools read the stored import and report a sha256 per block (ruling 3).
- GATE: attribution may be null; the graphic then carries no credit line and the source reads "not
  credited" — proceeded because inventing a credit breaks ruling 3 (14 of 76 sources have none).
- GATE: a block may be transliteration only, or transliteration and English, stored as a bilingual
  block with no Hebrew; it renders as a transliteration row with no empty Hebrew row — proceeded
  because 15 of TBI's song settings are sung in transliteration.
- GATE: A4 (structured custom content) stays not done; G3 covers TBI's need.
- GATE (G4 finding): 18 ships stopped at duplicate_name because first-pass graphics of the same name
  are still live. Resolution is G8 (retire first), not allowRename — proceeded because the addendum
  says renamed duplicates are wrong.
- Worker GATE lines are in each packet's merge commit message and return; the ones with user-visible
  effect are listed under Open questions.

## Packets

| Packet | Scope | Status |
|---|---|---|
| F | import store + build keys | merged c68d357 |
| G1 | open_import_dropzone, get_import, list_imports, /import/[token] page; import_singular_extract by importId and flat shape | merged 7b7bb24; real extract dry run 726 compositions (kab 194, morn 156, singular__HHDs 193, shabbat-holidays 183) |
| G2 | upload_asset by importId or allowlisted url; sharp downscale to 512 KB / 4096 px | merged 4190843; Donate QR and logo byte-identical, 0001.jpg 8000x4500 -> 4096x2304 436 KB |
| G3 | local sources: kind, optional book/page, tr-only blocks, null attribution; import_local_sources | merged e7d77e1; 76/76 created, 196/196 block receipts match, rerun all unchanged |
| G4 | batch_create_drafts (source, set, slide, customize_shared) + batchShip input | merged (G4 merge); 93 of 115 items built in 3 calls; 21 mixed panels + Omer refused (-> G9) |
| G5 | answer: A4 not done, G3 covers it | answered |
| G6 | apply_deck_plan | merged; real 282-row plan: dry run + apply, validate 0 errors / 0 warnings |
| G7 | Raleway in the font registry (addendum) | worker running |
| G8 | bulk retire (addendum) | worker running |
| G9 | panels mixing English-only and Hebrew/transliteration blocks (G4 finding) | worker running |

## Evidence

- Integration tip e7d77e1: 131 MCP tools (snapshot regenerated); packet tests 44/44 after merge.

## Open questions (for Daniel or Cowork)

- G6: five plan buttons use #ff0000, the palette's Rendered colour, so their Rendered light won't show
  (p3 r3c3 "157 top", p4 r1c6 "SP - Rav Nachman", p4 r3c4 "Pg 177 middle", p4 r3c6 "SP - Pure Heart",
  p5 r0c4 "Ein Keloheinu"). Recolour or keep Simone's red?
- G6: p5 r1c7 Mourners Kaddish move is still "PROPOSED, NOT RULED" in the plan; the tool applies it as
  written.
- G6: when the plan changes a button's background, text colour becomes black or white, whichever reads.
- G3: a source with no book shows its kind ("Song setting", "TBI text", "Prayer-book reading") where
  search used to say "Unlabeled book".
- G3: a tr-only block with no English, asked for with includeTranslation, is refused as missing a
  translation (as any corpus block is). Relax for sung lines?
- G1: dropzone page copy ("Drop a file for {congregation}", "Received. You can close this page.",
  "This link has expired or is not valid. Ask for a new link.").
- G2: sharp loading on Vercel is unproven until the first large upload after release.
