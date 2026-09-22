# Return A — visual implementation map

Bounded discovery only. No application, content, package or deployment change was made; no dev
server was started, no agent spawned, no live data or credential touched. Working tree left as
found (`M scripts/convert-companion-singular.mjs`, untracked `AGENTS.md`, the import sheet, and
this planning directory) on branch `google-signin` at `c5497ab`.

Read: AGENTS.md, RELEASE-STATE.md (summary + "Known-open"), PLAN.md, PACKET-A.md, and the code
cited below. PLAN.md/STATE.md were updated mid-pass with Daniel's logo decision; this return
follows the updated text (Siona image, no QR-card panel).

---

## 1. File and symbol map

### 1.1 The output renderer

| What | Where |
| --- | --- |
| Output page, stage scaling, realtime wiring | `app/output/page.tsx:12-34` |
| Renderer class (`render`, `applyFit`, `animate`, `drain`) | `lib/player.ts:26-55` (`Player`) |
| Which text channels exist and in what DOM order | `lib/player-motion.ts:24-33` (`textParts`) |
| Panel row channels (Hebrew / transliteration / translation) | `lib/player.ts:12` (`panelRowChannels`), `usesPanelRows` line 10 |
| Two-channel panel auto-fit + stack geometry | `lib/player.ts:15` (`panelStackGeometry`), `:17` (`fitPanelCopy`) |
| Row-list panel auto-fit + gap | `lib/player.ts:16` (`panelRowGap`), `:18` (`fitPanelRows`) |
| Lower-third height publication | `lib/player.ts:19` (`fitBottomText`), `lib/player-motion.ts:35` (`measuredBottomTextHeight`) |
| Authored font-size overrides and fit baseline reset | `lib/player.ts:20-21` (`applyPresentationFontSizes`, `resetFitBaseline`) |
| Motion tracks, easing, element groups | `lib/player-motion.ts:7-19,40-69` |
| Branding tokens fed into the box | `lib/branding.ts:13-38`; applied at `lib/player.ts:31` |

**Geometry lives entirely in CSS, and the CSS is a sedimentary stack.** `app/globals.css` lines
3–19 and 89–91 are successive override layers written by earlier passes: line 4 defines `.bottom`,
lines 8–11 redefine most of it, line 10 redefines it again, line 11 replaces the fixed heights
with the `--bottom-text-height` calc chain; lines 5–6 define `.left`/`.right`, line 14 replaces
almost all of it, lines 16–19 amend again (line 18 turns the decorative circles off for panels).
Any universal rule change must be made at the **last** layer that wins, or the file must be
consolidated first. Recommendation: consolidate into one `app/overlay.css` as a prerequisite
work packet; editing mid-stack is where this will go wrong.

The book-faces trial typography is a separate, opt-in layer: `app/overlay-faces.css`, gated by
`.faces-book` (set in `app/output/page.tsx:32` from `workspace.bookFaces`, `lib/workspace.ts:213`).

### 1.2 Authoring content generation (what produces the text a cue carries)

| What | Where |
| --- | --- |
| Draft → cue compilation | `lib/authoring-model.ts:294` (`buildCue`) |
| Layer selection (`he`/`tr`/`en`) and storage | `lib/authoring-model.ts:18-37` (`LAYER_ORDER`, `textLayers`, `textArrangement`, `layerFields`) |
| **Row composition — the grouping rule** | `lib/authoring-model.ts:275` (`composeContentRows`) |
| Channel text rendering from source blocks | `lib/authoring-model.ts:245` (`renderGroup`), `:259` (`englishRunTexts`) |
| Splitting a prayer across panels | `lib/authoring.ts:78` (`sourceSetSegments`), `:95` (`sourceSetPages`) |
| Panel capacity constants | `lib/panel-budget.ts:11-15,37` (`PANEL_BLOCK_LIMIT`=3, `PANEL_CHAR_BUDGET`=600, `PANEL_ENGLISH_CHAR_BUDGET`=400, `exceedsOnePanel`) |
| Editor layer/arrangement chips | `app/author/siddur-editor.tsx:131-159` (`TextLayerControls`) |
| Editor form defaults | `app/author/editor-state.ts:44-48` (`arrangement: "together"`) |
| Template naming by look | `lib/template-looks.ts:24-42`; `lib/layout-label.ts:3` |
| Bounded presentation overrides | `lib/authoring-model.ts:11` (`Presentation`), parsed in `parseEditable` `:209` |
| Names panels (name cards) | `lib/names-list.ts:71` (`namesPanelShapes`) — `contentRows` with `he` + `en`, `tr` empty |

### 1.3 Language grouping — where the sitting's complaint actually originates

`composeContentRows` (`lib/authoring-model.ts:275-293`) has two arrangements:

- **`together`** (the default, `editor-state.ts:47` and `textArrangement` line 26): line 292 emits
  **one row per source block**, each row carrying that block's Hebrew *and* its transliteration.
  A prayer whose canonical blocks are single lines therefore renders as He/Tr, He/Tr, He/Tr —
  exactly the "alternating individual lines" the sitting criticized.
- **`blocks`** (lines 281-289): per slide, one row of the whole slide's Hebrew, then one row of
  its whole transliteration, then its translation — i.e. the coherent paragraph/stanza treatment
  the sitting asked for, and it already exists.

So the paragraph request is mostly a **default and re-authoring** change, not new rendering code.
The chips are also disabled for lower thirds (`siddur-editor.tsx:154`), correctly — a lower third
keeps two columns.

**Stacking order is the second half.** For the two-channel (non-row) panel path the CSS puts
transliteration *above* Hebrew: `app/globals.css:19` sets `--panel-english-top:184px` and
`--panel-hebrew-top:556px`, and `panelStackGeometry` (`lib/player.ts:15`) computes `englishTop`
first and places `hebrewTop` beneath it. The row path (`panelRowChannels`, `lib/player.ts:12`)
already emits Hebrew → transliteration → translation. Both must be made to agree with
"Hebrew precedes transliteration where stacked".

The praised lower-third pattern is intact and should be protected as a regression baseline:
`app/globals.css:10` — `.bottom .english{left:250;width:730}`, `.bottom .hebrew{left:1010;width:850}`
(English left, Hebrew right), with the optional third translation line at lines 89–91.

### 1.4 Titles and the decorative circle

- Lower third: circle `::before` at `left:20px;width:220px` (right edge 240) and logo at
  `left:44px;width:172px` (right edge 216) versus `.bottom .title{left:250px}` —
  **10 px of clearance** (`app/globals.css:10`). This is the Hineni title-spacing defect, and it
  is one number in one rule.
- Panels: the circles are disabled (`app/globals.css:18`) and the logo sits top-right
  (`left:522px` / `right:38px`, `top:39px`, 112 px); `.left .title` is `left:48px;width:430px`
  (right edge 478) → 44 px clearance. Panels are fine; the lower third is not.

### 1.5 Fit checks

| What | Where |
| --- | --- |
| Shared render+measure sequence | `app/author/measure-cue.ts:25` (`measureCue`) |
| Overflow / out-of-frame / overlap rules | `app/author/preview.ts:64` (`findFitErrors`), `:25` (`overlapErrors`), `:47` (`occupiedRects`) |
| Sparse-panel warning | `app/author/preview.ts:95,112,128` (`SPARSE_FILL`=0.35, `panelFillRatio`, `findFitWarnings`) |
| Scan-card corner collision report | `app/author/preview.ts:134-161` (`findBugCollisions`, `bugCollisionErrors`) |
| Server (headless Chromium) fit check | `lib/server-fit.ts` (whole file); contract in `lib/server-fit-contract.ts` |
| Publish gate | `lib/authoring.ts:454` (`FIT_CONTRACT`), `:546` (`validatePublishPreview`) |
| Sweep page / contact sheet | `app/author/fit-check/fit-check-client.tsx`; re-pagination analysis in `app/author/fit-check/t1-report.ts`; stills tool `scripts/t3-stills.mjs` |

Two facts that matter for planning:

1. **`findBugCollisions` is *not* part of the publish gate.** `measureCue` (the one the server
   runs) returns only `fitErrors`, `warnings`, `fill`, `artwork`. The corner collision is a
   column on `/author/fit-check` only (`fit-check-client.tsx:79,284`). Changing the reserved
   rectangle therefore cannot break publishing — it changes a report.
2. **The fit stage is the known flaky gate** (`RELEASE-STATE.md`, "refuses after about five
   checks in a row"). A catalog-wide re-publish runs straight into it. Preview/measurement work
   (`/author/fit-check`, `scripts/t3-stills.mjs`) does not need the gate and can proceed first.

### 1.6 Logo / scan-card state

| What | Where |
| --- | --- |
| Scan-card layer module (pure) | `lib/bug-layer.ts` — `BugState`, `BUG_RESERVED_RECT` (`:17`, 300×300 at 1572,732), `bugViewFor` (`:40`), `renderBugLayer` (`:53`) |
| Card artwork | `app/bug-layer.css` (parchment card, QR, caption, page chip) |
| Sibling stage + drive | `app/output/page.tsx:23-25,31,34` (`#output-bug`, `applyBug`) |
| Congregation configuration | `lib/workspace.ts:32` (`bug` on `PublicWorkspace`), `:214`; CRC values at `:55-57` (`WORKSPACE_BUG_URL`, `WORKSPACE_BUG_CAPTION`) |
| Command surface | `app/api/command/route.ts:16-27`; console row `app/console.tsx:123-141`; Companion `companion/src/main.ts:292,346-351,390-391` |
| Live-state semantics | `relay/src/protocol.ts:55-62,256-274` (`nextState`), `relay/src/index.ts:261-271` |
| QR image | `app/api/bug/qr.svg/route.ts`, `lib/qr.ts` |

**The emergency rule the plan proposes already holds.** `relay/src/protocol.ts:273` —
`if(command.action==='cut')delete next.bug` — and the console's "Clear" button sends `cut`
(`app/console.tsx:85`, tooltip "Clear also removes the scan card"). `in`/`out`/`clear` carry the
bug through untouched. Nothing needs inventing for CLEAR NOW; it needs re-verifying against the
new resting-logo meaning.

**Three things do not hold:**

- The card is shown **regardless of the active cue**. `applyBug` (`app/output/page.tsx:25`) is
  driven by the snapshot alone and never consults `player.current`. "Hide for any active overlay,
  restore when the overlay clears" is a new rule and belongs in `bugViewFor` (make it take the
  active cue id / player phase) plus the `applySnapshot` path, timed off the Player's `Out`
  animation rather than off command receipt, or the logo will reappear mid-exit.
- **Persistence is inverted for a resting logo.** Today "on" is transient live state that `cut`
  deletes, so the operator re-shows it. A resting logo wants "on by default, off persistently"
  (`Michael can disable it`). That is a congregation/workspace setting plus an operator
  override — a new field, not a reuse of `BugState.on`. Decide before implementing.
- The `page` chip and QR (`BUG_PAGE_PATTERN`, `lib/bug-layer.ts:25`) are scan-card concepts with
  no meaning for a plain logo. They have a console field, a Companion action with a text option,
  and a Companion variable (`companion/src/variables.ts:19,61`).

**Logo assets.** CRC branding already points at the Siona image: `lib/branding.ts:19` and
`lib/workspace.ts:47` both use `/assets/siona-floor.jpg` (1500×1382 JPEG, **2.99 MB**), and every
overlay already renders it as the in-cue `.logo` — circular crop, gold ring, drop shadow
(`app/globals.css:8,18`), preloaded at `app/output/page.tsx:32`. So the "existing asset" is
settled and in use. Two observations rather than decisions:

- 2.99 MB is large for a corner mark; a derived, cropped, appropriately sized asset (and,
  if a soft edge is wanted, a PNG/WebP with alpha or a CSS mask) is worth producing. The JPEG
  has no alpha, as PACKET-A notes.
- `public/assets/3uRXNIycKdqW8qrJQ3gMkV.png` (156×232, RGBA) is **referenced nowhere** in tracked
  source. It may be the "former hands image". Not acted on; flagged.

### 1.7 Generated vs. authoring-library paths — what is editable where

Three independent sources feed the live catalog (`lib/server.ts:32,41,59`):

1. **Generated baseline** — `lib/cues.json`, **29 cues**, produced by `scripts/generate-cues.py`
   from `content/legacy-crc-shabbat-morning.sources.json`. All Saturday-morning: Barechu, Modeh
   Ani, Mah Tovu, Thank you, Oseh Shalom, Mourners Kaddish 1–3, Hareini, Elohai Nshama, Birchot
   Hashachar 1–4, Psukei DZimrah 1–2, Psalm 150, Readers Kaddish 1–2, As We Bless, Yotzer Or
   (short)/1/2, Ahava Rabbah (Partial), Vahavta 1–2, Mi Chamocha (Sat) 1–2, Siyahamba. Five are
   hidden aliases (`hidden`/`aliasOf`, resolved in `mergePublishedCatalog`, `lib/server.ts:11`).
   Editing these means regenerating the file **and** re-publishing, because a published revision
   of the same id overrides the baseline.
2. **Published authoring revisions** (Postgres, `publishedCues()`), which **override** baseline by
   id. RELEASE-STATE records ~206 cues on deployed production, so roughly 175+ cues — including
   effectively all Friday-evening/Kabbalat Shabbat material named in the review ledger (Hineni,
   L'cha Dodi, Shalom Aleichem, Hashkiveinu, Priestly Blessing, the healing/memorial invitations)
   — exist **only in the production database**. I confirmed the invitation wording appears nowhere
   in `content/` or `lib/`, so it is a custom-text published cue.
3. **Names panels** — materialized live only, never stored as drafts (`lib/server.ts:41-58`,
   `lib/names-list.ts`). Clearing a list removes its panels on the next read.

**Consequence for the plan's §2 warning, stated concretely: editing `lib/cues.json` changes 29
Saturday-morning graphics and nothing else.** Every evening cue must be changed through the
authoring path (draft → preview → fit check → publish), against the live database. This session
has no database or export access, so the evening cue bodies could not be inspected here; that is
Packet B's evidence line, and it needs either a DB read or a catalog export.

One more relevant artifact: `app/author/fit-check/t1-report.ts` already models "this panel carries
flat `texts.textMainheb`/`textMainEng`; would the re-paired `contentRows` candidate still fit?"
That is precisely the migration the paragraph-grouping rule requires, and it is read-only. It is
the right instrument for sizing the catalog-wide change before any publish.

---

## 2. Recommended shared presentation contract

Proposed as rules the renderer enforces, so the catalog pass is re-authoring rather than
per-cue CSS. Each is a decision for Astra, not something this pass settled.

1. **Stacking order.** Where two language channels stack on a panel, Hebrew is above
   transliteration. Implement by swapping the CSS variable pair at `app/globals.css:19` and the
   order inside `panelStackGeometry` (`lib/player.ts:15`) together, so the auto-fit and the
   resting geometry cannot disagree. The row path already complies.
2. **Grouping.** `blocks` becomes the default arrangement for panels
   (`app/author/editor-state.ts:47`, `lib/authoring-model.ts:26`), with `together` retained as an
   explicit choice. Stored drafts keep working: `layerFields` (`:28`) only writes the field when
   it differs from the implicit default, so flipping the default silently re-groups existing
   drafts — that is a migration, and it must be an explicit stored value on the affected drafts
   rather than a change of implied meaning. **Decision required.**
3. **Lower third preferred.** Keep `SPARSE_FILL` (`app/author/preview.ts:95`) as the existing
   "Sparse — consider Lower third" nudge, and add the inverse: a panel whose content fits a
   lower third at or above a minimum type size is reported as a lower-third candidate in
   `/author/fit-check`. Report, never auto-convert.
4. **Split rather than shrink.** The auto-fit loops (`fitPanelCopy`, `fitPanelRows`) shrink to
   floors of 29/35 px and 34/28/23 px before declaring `overflow`. Raise the floors and let the
   result fail into a continuation split via `sourceSetPages` (`lib/authoring.ts:95`) instead of
   shrinking to fit. `PANEL_BLOCK_LIMIT`/`PANEL_CHAR_BUDGET` (`lib/panel-budget.ts:11-15`) are the
   knobs; they are shared by editor and server, which is the property to preserve.
5. **Title clearance.** One universal rule: the title box begins at least N px right of the
   circle/logo bounding box in every layout. Today the lower third gives 10 px and the panels 44.
   Express it as a CSS custom property used by both, not a per-layout literal.
6. **Resting logo.** A fourth, cue-independent layer with its own reserved rectangle, visible
   only when no overlay is on air, hidden through the incoming cue's `In` and restored after the
   outgoing cue's `Out` settles; cleared by `cut`; disabled persistently by configuration.
7. **Preserved invariants.** Hebrew source text, order and punctuation are never transformed by
   presentation code (`renderGroup` and the source pin chain, `lib/authoring-model.ts:363,388`).
   English-left/Hebrew-right lower thirds keep their geometry. Motion, durations and the
   requested/rendered feedback contract are untouched.

---

## 3. Representative before/after cases to preview

All render read-only through `/author/fit-check` or `scripts/t3-stills.mjs`; none requires a
publish. Baseline ids are given where the cue is local.

| # | Case | Cue | Why it is the representative |
| --- | --- | --- | --- |
| 1 | Praised lower third, two columns | Barechu `efa9fad4` | Regression baseline for the pattern the sitting explicitly liked; must not move. |
| 2 | Stacked two-channel panel | Mah Tovu `bbd7c98b` | The transliteration-above-Hebrew flip, and the auto-fit path (`fitPanelCopy`). |
| 3 | Row-list panel, 4 rows | Birchot Hashachar 1 `0135de3c` | `together` alternating rows → `blocks` grouping, plus the dense 4-row CSS (`globals.css:19`). |
| 4 | Long bilingual panel | Psalm 150 `a5784181` | Split-rather-than-shrink, `panelFillRatio`, continuation numbering. |
| 5 | Single-channel right panel | Thank you `09f50803` | `textMain` single-channel geometry; also the ledger's "diagnose Thank You". |
| 6 | Single-channel with accent title | Siyahamba `219230a4` | Accent (Hebrew) title above a single English channel — title clearance case. |
| 7 | Name card | a `names:<collection>:NN` panel | `he`+`en` rows render English through `.row-translation` at 24 px muted blue — check legibility for names; plus the invitation copy that precedes it. |
| 8 | Three-line Priestly Blessing | **live-library cue, id unknown here** | The growing-line-length requirement; needs Packet B's id. |

Cases 1–7 are reproducible in this checkout today. Case 8, and every Friday-evening cue in the
review ledger, cannot be previewed without database or export access.

---

## 4. Tests and visual acceptance needed

Existing files to extend (all already run under `npm test`):

- `tests/player.test.ts` — `panelStackGeometry` order, `panelRowGap`, `panelRowChannels`, the
  fit floors.
- `tests/text-layers.test.ts`, `tests/presentation-contract.test.ts` — layer/arrangement
  round-trip after the default flips; explicit-value migration.
- `app/author/preview.test.ts` — `findFitErrors`, `findBugCollisions`, and any new
  lower-third-candidate report.
- `tests/panel-budget.test.ts` — budget changes, editor/server agreement.
- `tests/bug-layer.test.ts` (230 lines) — new resting-logo visibility rule, including the
  cue-active / cue-clearing transitions and `cut`.
- `tests/editor-layout.test.ts`, `tests/overlay-faces.test.ts` — CSS consolidation must not move
  the book-faces cascade (`app/overlay-faces.css:27-39` depends on declaration order).
- `relay/tests/protocol.test.ts` — `nextState` bug semantics if persistence changes.
- `companion/tests/bug.test.ts` + `scripts/audit-companion-packages.mjs` if the module surface changes.

Visual acceptance (automated tests do not establish readability):

- `/author/fit-check` sweep across every affected layout family, with the scan-card column read
  against the **new** reserved rectangle.
- `scripts/t3-stills.mjs` contact sheet at 1920 and 480 px for the eight cases above, before and
  after, annotated with cue ids and pass/fail.
- `app/author/fit-check/t1-report.ts` run across the live catalog to size the flat-texts →
  `contentRows` re-pagination before any publish.
- Resting-logo acceptance on real output: cue in, cue switch, animated out, `clear`, `cut`,
  reload, reconnect, and operator-off. Home-browser preview does not prove vMix.

Integration boundary per AGENTS.md: TypeScript, `npm test`, `npm run lint`, `npm run build`
(shared dev server stopped first), plus the companion package audit for module changes.

---

## 5. Compatibility concerns

**TBI.** `lib/workspace.ts` and `lib/branding.ts` already isolate identity; the renderer reads
branding from the workspace (`overlayBrandingFromWorkspace`, `lib/branding.ts:23`) and never from
the CRC constant at runtime. Risks:

- `lib/branding.ts:13-21` is a CRC-valued module default. Any resting-logo code that reaches for
  `branding` instead of the workspace object will put the Siona image on TBI's output. The logo
  layer must take its asset from `PublicWorkspace.logo`, the same way `Player.render` does.
- TBI's catalog is the **same 29 baseline cues re-identified** (`lib/workspace-catalog.ts:9-23`,
  `workspaces/temple-bnai-israel/catalog-map.json`), and `mappedCatalog` throws if the counts or
  names drift. Any change to `lib/cues.json` that adds, removes, renames or unhides a cue breaks
  the TBI mapping at startup. Adding continuation cues to the baseline requires the map to be
  regenerated in the same change.
- TBI has no scan card configured (no `WORKSPACE_BUG_URL` in
  `workspaces/temple-bnai-israel/workspace.json`), so `bug.enabled` is false and `bugViewFor`
  returns null. A resting logo that is "on by default" would newly appear on TBI's output unless
  it is gated on the same per-workspace configuration. Keep the gate.
- TBI ships `bookFaces` off; the faces CSS must keep its declaration-order dependency if
  `globals.css` is consolidated.

**Existing QR / scan-card controls.** The scan card is a shipped feature with five surfaces:
console row (`app/console.tsx:137-141`), `POST /api/command` action `bug`, relay live state,
Companion actions `bug`/`bug_on`/`bug_off` + `bug_page` (`companion/src/main.ts:292,390-391`) and
the `bug` feedback variable, and the cue log action `bug` (`lib/service-history.ts:25`,
`relay/src/protocol.ts:67`). Replacing its *behavior* with a resting logo means deciding, per
surface, whether the scan card is retired, retained alongside, or repurposed. **The safest read
of the sitting is that the CRC logo *button* stops producing a scan card, not that the scan-card
feature is deleted** — `siddur.centralreform.org` / "DAVEN ALONG" is configured CRC production
value (`lib/workspace.ts:55-57`) and deleting it is a product decision. Michael's deck also has
converted buttons pointing at these actions; changing action ids would strand them (Packet B).

Reserved-rectangle note: a smaller resting logo should shrink `BUG_RESERVED_RECT`
(`lib/bug-layer.ts:17`). That only loosens the `/author/fit-check` report, never a publish gate.
But note the lower third's Hebrew column (`left:1010;width:850`, `app/globals.css:10`) already
runs through that corner — which is why the card paints *under* the prayer layer
(`app/bug-layer.css`). A resting logo hidden whenever a cue is on air makes the collision moot;
a logo that stayed visible would sit behind lower-third text.

---

## 6. Remaining decisions and stated uncertainty

Decisions for Astra / Daniel:

1. **Arrangement default flip** — silent re-grouping of existing drafts vs. writing explicit
   `arrangement` values on affected drafts as a migration. (§2.2)
2. **Resting-logo persistence model** — new workspace/operator setting vs. reuse of the transient
   `BugState`. Includes: what happens on reconnect, and whether "off" survives a deploy.
3. **Scan card's future** — retire, retain beside the logo, or repurpose, across all five
   surfaces, including the `page` chip and QR.
4. **Logo asset production** — whether to derive a small cropped/masked asset from
   `siona-floor.jpg` (2.99 MB) rather than serve the full JPEG as a corner mark.
5. **CSS consolidation** — whether the `globals.css` override stack is rewritten into one
   `overlay.css` before the layout pass. My recommendation: yes, as its own packet with the
   existing layout tests green before and after.
6. **Fit floors / budgets** — the numeric split-rather-than-shrink thresholds.

Uncertainty, stated plainly:

- **No Friday-evening or Kabbalat Shabbat cue could be inspected.** Those bodies are in the
  production database only. Every ledger item from Hineni through Adon Olam is unverified here.
- I did not open Michael's deck export beyond confirming it decompresses and that all 29 baseline
  cue ids appear in it; its button/cue option shape did not match a naive `options.cue` probe, so
  the deck's cue-reference structure is unresolved and is Packet B's.
- `3uRXNIycKdqW8qrJQ3gMkV.png` is unreferenced; whether it is the "former hands image" is a
  guess, not a finding.
- The `.bottom` clearance figures are read from the CSS, not measured in a browser; confirm at
  1920 before changing numbers.
- The `--panel-eng-height` variable (`app/globals.css:14`) appears to be dead, superseded by
  `--panel-english-height` at line 19. Unconfirmed.
- I did not run the test suite, a build, or the fit stage; nothing in this pass needed them and
  the packet excludes a dev server.

---

Return path: `docs/planning/2026-09-22-sitting-prep/RETURN-A.md`
