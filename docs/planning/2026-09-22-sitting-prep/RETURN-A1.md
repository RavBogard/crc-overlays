# Return A1 — shared layout foundation

Three changes, in the order the packet set them: the overlay CSS is now one stylesheet; stacked
two-channel panels read Hebrew first; the lower third's title clears the decorative circle. Each
was measured in a real Chromium against the real renderer before and after. Nothing else moved.

Branch `google-signin`, on top of `c5497ab`. The other session's modified
`scripts/convert-companion-singular.mjs` and the untracked `AGENTS.md`,
`MICHAEL-IMPORT-SHEET.md` and this planning directory were preserved; no branch was switched,
reset or stashed, and no agent was spawned.

## Changed files

| File | Change |
| --- | --- |
| `app/overlay.css` | **New.** The overlay stage, both panels, the lower third, the overlay typefaces and the fit variables, moved out of `app/globals.css` verbatim, one rule per line, under fifteen headed sections that name each historical layer. Plus the two new rules below. |
| `app/globals.css` | 91 lines → 69. Lost exactly the overlay rules; keeps the console, editor, access and site styles, the `:root` tokens, the `Work` face and `.output-body`. |
| `app/layout.tsx` | `import "./overlay.css";` between `globals.css` and `overlay-faces.css` — the order the rules were written in. |
| `lib/player.ts` | `panelStackGeometry` now returns the Hebrew block at the top of the body and the English block after the measured gap. Same signature, same argument order, same four CSS variable names, same heights and gap. |
| `tests/player.test.ts` | Updated the stack-order expectations; added three tests (see below). |
| `tests/publish-path-contract.test.ts` | The "no panel rule reaches into structured row channels" guard now reads `app/overlay.css` **and** `app/globals.css`. Left pointing at `globals.css` alone it would have passed vacuously — the rules it polices had moved out from under it. |

Commit: “Overlays: one stylesheet, Hebrew above transliteration, room for the title”, the single
commit on top of `c5497ab` — code, tests and this return; nothing else staged.

## 1. Consolidation — verified equivalent, then changed

`app/globals.css` held the overlay geometry as fifteen successive layers: five re-cuts of the
lower third, four of the panels. Each relies on being declared after the one before it, and all
of it was minified onto single lines of up to 3 000 characters. The rules are now in
`app/overlay.css`, in the same order, one rule per line, with a section heading over each layer
saying what that pass did — for example that `.right .prayer` still wins over the later
`.right .combined` rules because it carries `:not(.content-row *)`, which is easy to miss and
easy to break. The file opens with the warning that order is load-bearing.

The extraction was mechanical (`work/sitting-2026-09-22/a1/harness/extract-overlay-css.py`): it
asserts that the whitespace-stripped, comment-stripped rule text is byte-identical on both sides
before writing anything.

**Evidence that consolidation alone changed nothing.** A capture run before and after the split,
17 cases × 2 frame widths:

- **0 of 56 measurement fields differ** across the whole set — every position, size, computed
  font size, scroll/clip height, overflow flag, fit verdict and published CSS variable.
- Pixels: 4 of 34 image pairs differed, by 81 pixels each (0.06 %), all in the medallion artwork.
  That is the renderer's own noise floor, not the change: re-running the *same* CSS twice
  produces differences of the same magnitude in the same places
  (`work/sitting-2026-09-22/a1/after-consolidation-repeat/`). PNG hashes are not a usable signal
  here; the measurement manifest is fully deterministic and is the evidence I relied on.

I also confirmed the production build keeps the order: in the built bundle the console rules land
at offset 8 408, the panel stack variables at 22 768, the title clearance at 24 346 and
`.faces-book` at 24 929.

**Not moved, deliberately:** `.output-body` and `.output-diagnostic` (page-level rules for
`/output`, not overlay geometry), the `:root` design tokens, the console `Work` face. Moving them
buys nothing and each is a cascade risk for no benefit.

## 2. Hebrew above transliteration

Two things had to move together or the panel would lay out one way at rest and jump to another
once the fit ran:

- `lib/player.ts` — `panelStackGeometry` places the Hebrew block first and the English block
  after the gap. Heights, gap sizing, centring in the 184–1024 body and the argument order are
  unchanged; only the stack changed.
- `app/overlay.css` — the resting defaults, `--panel-hebrew-top:184px; --panel-hebrew-height:468px;
  --panel-english-top:670px; --panel-english-height:354px`. Same two heights as before, swapped
  positions, still separated by the 18 px minimum gap and still ending at 1024.

Measured across the six stacked-panel cases, **the only fields that changed are the two tops**.
Mah Tovu: Hebrew 661 → 259, transliteration 259 → 604; heights 288 and 345 unchanged, gap 57
unchanged, font sizes 39/34 unchanged, fit verdict `fit` unchanged. The sparse case (Psalm 150,
which uses the *grow* branch of the fit loop rather than the shrink branch) behaves the same way:
Hebrew 617 → 216, transliteration 216 → 614, gap 24 either way.

**Untouched, and confirmed untouched by measurement:**

- The paired-row path (`.panel-rows`), which was already Hebrew-first — Birchot Hashachar shows
  zero changed fields.
- Single-channel panels, left and right — zero changed fields.
- The praised English-left / Hebrew-right lower third — its columns are identical; only its
  title moved, in §3.
- Sacred text, source-block order and layer selection: nothing in `authoring-model`,
  `player-motion.textParts` or any content file was touched.

## 3. Title clearance

`.bottom::before` (the gold ring) ends at x = 240 and the medallion inside it at 216. The title
began at 250 — **10 px** — while the panels give their title 44. Now:

```css
.bottom{--bottom-title-clearance:40px}
.bottom .title{left:calc(240px + var(--bottom-title-clearance));
               width:calc(1850px - 240px - var(--bottom-title-clearance))}
```

One named value; the width follows it so the title's right edge stays at 1850, 50 px inside the
bar. **40 px** was chosen from rendered samples, not from arithmetic: I captured the whole set at
24, 32, 40 and 48 and composed the title bars into one strip
(`work/sitting-2026-09-22/a1/title-clearance-sweep.png`). At 10 and 24 the title still reads as
pressed against the ring; 32 is clean; 40 is clean and sits closest to the 44 the panels already
use; 48 starts to look detached. The measured effect on every lower third is exactly
`title.left 250 → 280`, `title.width 1600 → 1570`, and nothing else.

**The tradeoff, stated plainly:** the title used to share its left edge with the body columns
(both at 250). At 40 px of clearance it starts 30 px right of them. The packet forbids moving the
body columns to solve a title problem, and I agree — but the flush edge was a real piece of the
design, and the way to get both is to move the whole lower-third content block right in a later
geometry packet, not to tune this number down. Long titles still fit: the 45-character synthetic
title renders on one line inside 1570 px with room to spare.

## 4. Checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `npm test` | 742 tests, 736 pass, **0 fail** (ts) + 19 pass, 0 fail (mjs) |
| `npm run lint` | 0 errors, 2 warnings — both pre-existing, both in the other session's `scripts/convert-companion-singular.mjs` (`ctx` and `unmappedPlans` unused). Not mine and not touched. |
| `npm run build` | `✓ Compiled successfully in 2.1s`, 42/42 static pages |
| Browser measurement | 17 cases × 2 widths, before and after, CRC and TBI, faces default and book |

No dev server was running on 5175 and I started none, so nothing was stopped.

**New tests** in `tests/player.test.ts`, exercising geometry rather than CSS source text:

- `Hebrew leads the stack at every ratio of channel heights` — eight height pairs including
  equal heights, a taller English block, a zero-height channel in each position, an exactly-full
  stack and an overfull one. Asserts Hebrew leads, that the gap really sits between the blocks,
  that neither height is altered, and that the stack stays centred whenever it fits.
- `a stack with no room to spare still reads Hebrew first and stays inside the body` — the tight
  case lands the transliteration's last pixel exactly on 1024; the overfull case starts at the
  top of the body with a zero gap rather than floating above it.
- `the stylesheet resting panel stack agrees with the fitted one` — reads the four defaults out
  of `app/overlay.css` and checks them against `panelStackGeometry`, so the resting state and the
  fitted state cannot drift apart again.
- `the lower third title clears the decorative circle` — the clearance is at least 32 px, is
  measured from a circle that still ends at 240, and the body columns still sit at
  `left:250 / width:730` and `left:1010 / width:850`.

## 5. Evidence

All under `C:\Users\dsbog\crc-overlays-vercel\work\sitting-2026-09-22\a1\` (ignored):

| Path | What it is |
| --- | --- |
| `sheet-before-vs-after\index.html` | The side-by-side review, 17 pairs at 1920 |
| `before\`, `after\` | Native 1920×1080 and 480-wide PNGs, plus `manifest.json` with every measurement |
| `after-consolidation\`, `after-consolidation-repeat\` | The consolidation-only step and its noise-floor control |
| `sweep-24\`, `sweep-32\`, `sweep-40\`, `sweep-48\` | The title-clearance sweep |
| `title-clearance-sweep.png` | The five title bars stacked for comparison |
| `harness\` | `shoot.mjs` (capture), `compare.mjs` (measurement diff), `pixel-diff.mjs` (numeric image diff), `sheet.mjs`, `cases.mjs`, `serve.mjs`, `stage.html`, `entry.ts`, `extract-overlay-css.py` |
| `globals.css.orig` | The pre-consolidation stylesheet |

**On the harness.** `scripts/t3-stills.mjs` is the repository's stills tool, but it needs a
running rehearsal instance, a control key and the published catalog. For a CSS-and-geometry
comparison that is both more setup and less control, so I built a standalone stage: esbuild
bundles the real `lib/player.ts`, a local static server hands out the repository's own
stylesheets and fonts, and Playwright drives it. It uses the real renderer and the real CSS, no
dev server, no credentials, no database. The backdrop behind the overlay is a stand-in gradient,
not a camera picture — it makes contrast visible and proves nothing about on-air legibility.

## 6. What the samples do not cover

The set is nine real cues from `lib/cues.json` plus two clearly-labelled synthetic long-title
variants. `lib/cues.json` is the generated Saturday-morning baseline: **29 cues**. Production
carries roughly 206. **Every Friday-evening cue named in the sitting — Hineni, L'cha Dodi,
Hashkiveinu, the Priestly Blessing, both invitations — exists only in the production Postgres
library and is not in this checkout.** These changes are contract-level and apply to any cue of
the same layout family, but nothing here is evidence about those specific cues.

## 7. Unresolved, and notes for the next packets

**Pre-existing, found while measuring, not fixed here:**

1. **The lower third's Hebrew column overflows its box.** Barechu at default faces:
   `hebrew.scrollHeight 111 > clientHeight 109`. It survives visually because the column is not
   clipped, but it is a genuine overflow and the same cue under book faces does not do it. This
   is the lower third's own fit path (`fitBottomText` sizes the *block* from the tallest column
   but never shrinks type), and it is unrelated to anything in this packet. Worth its own look
   before the catalog-wide pass.
2. **A panel carrying transliteration + translation but no Hebrew has no geometry.** `textParts`
   emits two parts, so neither gets `.single-channel`; `fitPanelCopy` then bails because there is
   no `.hebrew`; and no panel rule positions `.translation`, so it lands at the top-left corner
   over the title. The lower third's C6 translation layer has no panel counterpart. No cue in
   `lib/cues.json` hits it; a published one could.
3. **Dead rules I left alone** (no broad cleanup): `--panel-eng-height` and the `calc(202px + …)`
   pair in the panel-rebuild section, and the `.right .english/.hebrew` tops in the right-panel
   section, are all fully superseded by the last section. They are now visibly grouped and
   labelled in `app/overlay.css`, which is the first step to removing them safely.

**Outside my ownership, left for whoever owns them:**

4. `app/author/fit-stage/fit-stage-client.tsx:13` says the overlay CSS is
   "`app/globals.css` and `app/overlay-faces.css`". It now also includes `app/overlay.css`. The
   page's behaviour is correct — it inherits the root layout — but the comment is stale.
5. `docs/RENDERER.md` points at `app/globals.css` for overlay geometry; it should point at
   `app/overlay.css`.

**For the content/defaults packet:** nothing here changes stored data or authoring behaviour. The
implicit `arrangement: "together"` draft default is untouched, as instructed. Worth knowing that
the row path was already Hebrew-first, so re-authoring cues into `blocks` now lands them in the
same reading order as the stacked path — the two paths agree for the first time.

**For the logo packet:** untouched. I did not change the logo's size, position, persistence or
the scan card, and I did not assume the resting logo should default to enabled. Note only that
the lower third's medallion at `left:44px; width:172px` and the panel logo at `top:39px` are now
declared in two clearly labelled places in `app/overlay.css`.

**Global fit floors and panel budgets** are unchanged, as the packet required. Changing them
needs measured catalog evidence, which needs the database cues.
