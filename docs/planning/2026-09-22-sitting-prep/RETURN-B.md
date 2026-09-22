# Return — Packet B: cue completeness and replacement-deck map

**Date:** 2026-09-22 · **Checkout:** `crc-overlays-vercel`, branch `google-signin`, HEAD `c5497ab` · **Answering:** `PACKET-B.md`

The pass was discovery only. No application, content, converter, deck or live data was changed. No agents were spawned, no secrets were read and nothing was deployed. Two files were written: this one and `CUE-LEDGER.csv`, next to it. The existing converter diff, `AGENTS.md` and the research import sheet are untouched.

## 0. Summary

1. **The deck on disk is not the deck the cutover return describes.** `work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16.overlays.companionconfig` has sha256 `234096e6…3647`. The copy in `Claude outputs/` is byte-identical. It is the **803 converted / 105 left** run, generated 15:30:41Z, with `slotsFile: null`. It contains **0 of the 16 slot cue ids**. The 832/76 deck that the cutover return (§7) describes was overwritten. Nothing importable carries the slots today. The `verify-deck.py` on disk also has no `--slots` option. §6 covers the details.
2. **We Are Loved 1/2 is a catalog-map alias.** `We Are Loved 2` has `aliasOf: We Are Loved 1`, so both buttons carry `toggle_cue e62e68e1…`. Pressing 2 after 1 takes the graphic off air, and both buttons light together. The two-panel reading Michael had now sits on one 722-character panel. The same aliasing affects five interpretive-translation buttons on Saturday morning (D11).
3. **A group of song cues lost the English song words when they were rebuilt from source blocks.** Affected: Am I Awake, How Awesome / Shema, and the interpretive buttons. Olam Chesed lost its Hebrew instead, because the source feed has `—` placeholders. The Singular archive holds each missing text, and none is in the maintained library. Where these words should come from is a content-source ruling, not a mechanical fix.
4. **Psalm-ish 1/2 show literal `<html>…<i>…</i>` markup.** The cue text was copied verbatim from the Singular archive.
5. **The four completeness checks:** Shiru repeats a verse and omits two. L'cha Dodi is complete against the CRC book's 4 verses but is pinned to Shirei Shabbat text, which has 9. Mizmor L'David and the full Kiddush both have published continuations, but those buttons sit only on spare page 53, and no button in the deck jumps there.
6. **Michael's page logic is highly regular.** Each column is a liturgical slot, read left to right. Continuations stack down the same column: 138 of 145 numbered series do this. Column 7 is a fixed navigation strip. Colour separates multi-panel text from single moments. The replacement map in §4 keeps that grammar. It puts continuations where the grammar says they belong and changes positions on only two priority pages.

---

## 1. Evidence used, and access

| Evidence | Path | Used for |
|---|---|---|
| Michael's latest export (Companion 5.0.3, 16 Sep) | `work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig` (sha256 `89acf766…8cc4`) | all positions, colours, action sequences |
| Converted deck on disk | same folder, `ProductionDSKTP-2026-09-16.overlays.companionconfig` | converted form of every button |
| Catalog map / notes / drafts export / templates | same folder, `catalog-map-2026-09-22.json`, `catalog-notes-…`, `drafts-2026-09-22.json`, `templates-2026-09-22.json` | cue ids, aliases, cue content and pinned block ids |
| Maintained sources | `content/siddur-library.json` (732 units, 13 books) and `content/authoring-sources.json` | source-block completeness |
| Singular archive (sibling private checkout, read-only) | `../Singular-CRC-Archive/2026-09-09-master/master-composition-449398.json` | what Michael's old graphics actually showed |
| Prior audit | `docs/planning/2026-09-22-companion-research/audit-michael-export-and-module-2026-09-22.md` §4 | cross-checked, not repeated |

**Gaps in access:**

- **The drafts export holds drafts only.** Content is not in it for 24 template cues: Hareini, Barechu, Vahavta 1, Psukei 1, Psalm 150, the Readers Kaddish pair, Siyahamba and others. For those the ledger records the cue id without block-level completeness. Closing this needs a read of the live catalog (`GET /api/catalog`) or the template source (`content/legacy-crc-shabbat-morning.sources.json` cues).
- **The Singular "Special" composition is not archived.** The archive holds only the Master composition, so Or Zarua, Mizmor L'David (Special) and Shalom Alechem small cannot be compared with what Michael showed.
- **Live state was not read.** The drafts export is dated 2026-09-22 morning. Anything published later is not reflected.

---

## 2. Cue / source / button ledger

`CUE-LEDGER.csv` has 227 rows. There is one row per Singular composition on each graphics button of the priority pages: 2–6 (Friday), 7–11 (Saturday morning) and 76–78 (Michael's camera-coupled "second set" for Kabbalat Shabbat). Each row records:

- the export page, row and column, label and colour;
- the composition name and the resolved cue id;
- the catalog status and origin, and how the name was resolved;
- whether the deck on disk converted it;
- the cue's mode, layout and title;
- the exact source unit and blocks pinned, with the unit's block count;
- the defect id, the fix owner and a confidence rating.

**Coverage.** The priority pages have 222 Singular buttons, and the deck on disk converts 220. The two left are Or Zarua (p2) and Guest Name (p10); p1 Guest Speaker is off-priority. The rest of the catalog has 686 Singular buttons, with 583 converted and 103 left. 71 compositions have no cue: High Holy Day family cards, Seder, Who By Fire, and slot compositions that the deck on disk did not map. The rest of the catalog is **not** ledgered here and needs the same pass next.

### Defects found (priority pages)

| ID | Cue(s) → buttons | Finding | Fix owner | Conf. |
|---|---|---|---|---|
| **D01** | We Are Loved 1/2 → p3 r0c3/r1c3, p8 r2c3/r3c3 (+p13, p47) | Catalog map `aliasOf`, so one cue `e62e68e1`. `toggle_cue` on a shared cue means pressing the second button turns the first off, and feedback lights both. The cue shows the whole 722-character Unending Love reading on one panel. Singular split it into two panels at "…too embittered to hear. / We are loved by an unending love." and left out the closing blessing. | New cue for panel 2 (content). Remove the alias in the catalog map, then re-run the converter. The source is a single original-English block, so a two-panel split needs a way to split one block, or a ruling. Raise this with Packet A. | high |
| **D02** | Am I Awake → p3 r2c0, p7 r2c6 | The cue is morning Bar'chu blocks 0–1 only. Singular showed "Am I awake? Am I prepared? … Am I prepared?" above Bar'chu. No maintained source has these words. | A content-source ruling: add the song to shireishabbat, or authorise the archive text as custom. Then edit the draft. | high |
| **D03** | How Awesome / Shema → p3 r1c2, p8 r1c4 | The same blocks as the plain Sh'ma cue (The Sh'ma 0–2), under a different title. Singular's lines "How awesome is creation / With great love, we are loved / We are one / Echad" are missing. That is the diagnosis the sitting asked for. | Same as D02 | high |
| **D04** | Psalm-ish 1/2 → p3 r2c4/r3c4, p7 r1c4/r2c4 | The custom text starts `<html>Praise Yah...\n<i>` and carries `</i>` and `</html>` tags. This was Singular's rich-text markup, and Overlays shows it literally. The italics marked the variable middle lines. | Draft content in the database, through `/author` or `update_draft` → review → publish. A repo file edit will not change it. Packet A decides how to represent the italics. | high |
| **D05** | Shiru La'Donai 1/2 → p2 r2c1/r3c1 | Pinned to Shirei Shabbat maariv Psalm 96. Panel 1 is blocks 0–1 and panel 2 is blocks 1–2, so **block 1 appears twice**. Blocks 3–4 (vv. 10–13) are never shown. The CRC Kabbalat Shabbat book has no Psalm 96. Singular covered vv. 1–8a. An unplaced `Psalm 96` draft duplicates Shiru 1. | A variant decision: CRC practice (vv. 1–8a) or the whole psalm. Then re-split, likely 0–1 / 2–3 / 4, and add a **Shiru 3** cue. | high |
| **D06** | L'cha Dodi 1–4 → p2 c5, p76 c4 | Each cue is the refrain plus one verse: v1 shamor, v2 likrat, v5 hitoreri, v9 bo'i. That is **exactly the CRC evening book's selection** (folios 8–10, 4 verses), and matches Singular. So the set is complete against the CRC book. However the text is pinned to **Shirei Shabbat**, not the CRC book: it has "L'cha" where CRC has "L'chah", and whole verses per block. Shirei Shabbat has 9 verses, and 5 (blocks 5, 7, 11, 13, 15) have no cue. | A variant decision. For CRC services, re-pin to `legacy-shabbat-evening:opening.shabbat-presence-lchah-dodi` (32 line-blocks) and keep the 4 cues. For a Shirei Shabbat service, add 5 cues. | high |
| **D07** | Mizmor L'David → p2 r3c4; Mizmor L'David 2 (published `1140bc23`) → page 53 only | Psalm 29 is complete across the two cues: blocks 0–2, then 3. The split is unbalanced: three long verses sit on one compact panel (26/22 pt), then one verse. The continuation is on page 53, which no button in the deck jumps to (verified: 0 `set_page → 53`). | Content: rebalance to 0–1 / 2–3. Deck: place panel 2 in column (§4). | high |
| **D08** | Kiddush (long) → p5 r2c5, p11 r2c5; Kiddush (long) 2 (published `19661732`) → page 53 only | "Full Kiddush" is only complete as three cues. Short is hagafen, from the *morning* book. Long is CRC evening blocks 2–9. Long 2 is blocks 10–14, which reach the chatimah. Long 2 cannot be reached mid-service. The CRC book has no Vay'chulu. The Shirei Shabbat Kiddush (`shabbat-maariv:seasonal.kiddush`, 11 blocks) has Vay'chulu. **On p11 (Saturday morning), "Kiddush (full)" shows the Friday-evening text.** Michael's Singular deck did the same, so this is inherited, not new. | Deck placement (§4). A variant decision: CRC or Shirei Shabbat, and what Saturday should show (the morning book has hagafen only; Shirei Shabbat shacharit has Kiddusha Rabbah). | high |
| **D09** | Olam Chesed Yibaneh → p4 r2c4, p9 r1c6 | The cue is `source-en`, English only. Both Hebrew fields in the CRC evening feed are `—` placeholders (blocks 0 and 2). Singular showed Hebrew, transliteration and English. | Source first: shireishabbat, the `amidah.olam-chesed-yibaneh@legacy-shabbat-evening` Hebrew. Then regenerate the library and edit the draft. | high |
| **D10** | El Na R'fa Na → p4 r2c6, p10 r2c3 | Shows the `lah` line (block 1) only. The `lo` line (block 2) is unused, although the title says "Lah/Lo". | Content | high |
| **D11** | Avot Trans 1/2, Gvurot Trans (p9), Yotzer Or Trans 1/2 (p8) | Catalog aliases point at the Hebrew cues: Avot 2, Gevurot 2, Yotzer Or 2. The interpretive English that Singular showed is missing, and three buttons share one state, as in D01. A source exists for Yotzer Or: `shma.yotzer-or-interpretation@legacy-shabbat-morning`, original English. The Avot and G'vurot English exists only as translation-role blocks, which the library excludes by rule (see the README's Birchot exception). | Catalog map and content. A ruling is needed for the Avot and G'vurot translation role. | high |
| D12 | Start soon right (side panel, Starting Soon on p2, p7) | Dropped, as ruled for single output. | — | high |
| D13 | Or Zarua → p2 r2c4 (Special) | No cue. The likely text is Shirei Shabbat Psalm 97 block 4, "Or zaru'a latzadik…" (vv. 11–12), but the Special composition is not archived to confirm it. | Confirm with Daniel or Michael, then create a cue | low |
| D14 | Guest Name → p10 r3c0 | Slot `bb52a63a` exists. The deck on disk was built without `--slots`. | Converter re-run | high |
| D15 | Aleinu 3 → p5 r2c1 | Step 1 also fires `animateIn CRC Logo`, which the converter turned into `bug_on` (the scan card). It fires in the *middle* of the series, since Aleinu 4 is below it. The logo pairing was never applied consistently. | Converter or deck, after Packet A settles the resting-logo design | high |
| D16–D20 | Silent Prayer (a label card), Adon Olam 3 (evening book while 1–2 are morning), Birchot Hashachar 2→3 (template indexing changes to library indexing across one prayer), Shalom Aleichem (verse 1 panel only on p76), Hashkiveinu (Randy) (a long custom side panel) | Recorded in the CSV. These are provenance or verification items, or layout questions for Packet A. None hides text. | various | medium |

**Excerpts that match Singular, not defects:** Yedid Nefesh (stanza 1 of 4), Ana Bakoach (block 1 of 4), Mi Chamocha (short), Ahavah Raba (short), Shalom Alechem small and Hallelu 1–3. The Priestly Blessing is complete: blocks 0–3 are the whole masculine form, and 4–7 are the feminine form. It does not need extending. The sitting asks only for three Hebrew lines.

### Missing continuation buttons (priority)

| Needed | Cue exists? | Where it is now | Where it belongs (§4) |
|---|---|---|---|
| Mizmor L'David 2 | yes, published | page 53 | p2 r3c4 (Mizmor moves up to r2c4) |
| Kiddush (full) 2 | yes, published | page 53 | p5 r3c5; p11 r3c5 |
| We Are Loved 2 (a real panel) | **no** | alias | p3 r1c3, p8 r3c3 (unchanged cells) |
| Shiru 3 | **no** | — | p2 column 2 (§4) |
| Avot, G'vurot and Yotzer Or interpretations | **no** | aliases | their existing cells |
| L'cha Dodi v3, v4, v6, v7, v8 | **no** | — | only if the Shirei Shabbat variant is chosen: an alternates column |
| Shalom Aleichem v1 on the main Friday pages | yes (`e88e67d2`) | p76 only | p6 r2c0 (next to v2–4 on the alternates page) |

---

## 3. Michael's page logic, from the evidence

Counts come from all 1,689 layered buttons in the 16 September export, using `scratchpad/habits.js`.

### Habits the evidence supports well (keep)

| # | Habit | Evidence | Confidence |
|---|---|---|---|
| H1 | **Each column is a liturgical slot, read left to right; a service page reads column by column.** | p2: col0 arrival songs, col1 candles, then Shiru, col2 Shalom Aleichem, col3 Yom Zeh, col4 Kabbalat alternates, col5 L'cha Dodi. p3: col0 As We Bless/Barchu/Am I Awake, col1 Ma'ariv variants, col2 Sh'ma variants, col3 Ahavat Olam slot, col4 V'ahavta, col5 Mi Chamocha. p5: col1 Aleinu, col2 Kaddish, col3 Adon Olam, col5 Motzi/Kiddush, col6 closing furniture. Saturday p9 follows the Amidah order across its columns. | high |
| H2 | **Continuations stack down the same column.** | 138 of 145 numbered series are vertical and contiguous. 86 start in row 0; the rest start at row 1–2 below a lead-in. The only exceptions are p15 Torah 1–7 (a snake shape) and p45 Who By Fire. | high |
| H3 | **An invitation or lead sits at the top of its column, with the text below.** | p5 col2 Kaddish Names → Kaddish 1–3. p4 col5 Healing Names → Mi Sheb → Jim Mi Sheb. p3 col0 As We Bless → Barchu → Am I Awake. | high |
| H4 | **Alternatives for one slot share its column.** | p3 col3 WAL 1/2 (English) sits over Ahavat Olam 1/2 (Hebrew). p4 col0 Hashkiveinu Randy/Daniel/Jim. p3 col2 Sh'ma / How Awesome / One Love. | high |
| H5 | **Column 7 is fixed navigation, and row 3 holds utilities.** | pageup r0c7 on 99 pages, pagedown r2c7 on 99, and the home button r1c7 on 76 pages (42/42 service pages). r3c7 is Toggle Bimah Mute on 34 service pages (CRC LOGO on 7 HHD pages). r3c6 is vMix Merge on 15 service pages, including every priority page except p6, where the cell holds a "+5 −5 bimas (stream)" X32 button. | high |
| H6 | **Colour separates text types.** | Of numbered series, 303/367 (83%) are teal `#006699`. Single graphics are 230 burgundy `#990033` (43%) and 149 teal. `#000066` is service furniture: announcements, thank you, starting soon, be right back, silent prayer. | high |
| H7 | **Duplicate a graphic onto every page that needs it, rather than navigate.** | 191 compositions sit on more than one button. Examples: Oseh Shalom on p4, p5, p9 and p11; announcements twice on p5. | high |
| H8 | **The graphic, camera move and switcher cut are one gesture on the second set.** | 20 buttons on p76–78 follow one pattern. Step 0: show, recall PTZ preset, wait 1300 ms, vMix merge. Step 1: hide, and on the *last* panel only, return to centre cam with the same wait. The middle continuation panels (likrat, hitoreri) carry **no** camera actions. The deck on disk preserves every one exactly: checked on p76 r0c2, r0c4 and r3c4. | high |
| H9 | **Friday is reached by paging, Saturday by a jump.** | Page 1 has `Sat → 7` and no Friday jump. Pages 2–5 follow Home directly. | medium |

### Inconsistent legacy arrangements (do not copy)

- **Colours drift for the same text between pages.** 57 of 191 compositions placed more than once change colour. Almost all swap between `#012a3e`/`#59011f` and `#006699`/`#990033`. The dark alternates colours mostly appear on the older Friday pages and page 6 ("space"). They do not mark a stable category.
- **Labels that contradict their cue.** "Gvurot 3/4" fires Gevurot 1/2 (p9). "Hoda-ah/ Hatov ki lo" and "Avodah/Rtzei" are combined labels. "Kiddush (full)" is Friday text on the Saturday page.
- **The logo restore fires mid-series** (Aleinu 3, D15), the logo pairing is uneven on p45–50, and one HHD button hides the wrong composition (El Malei, noted in the audit).
- **Placement drifts.** Starting Soon is at r0c6 on p2 but r3c5 on p7. Page 6 is named "space" but is really the Friday alternates page. Page 70 "Page Map" is an empty bookmark.
- **One auto-advancing button.** p11 "Aleinu 2" is a timed 3-panel walk (32.5 s, 42.25 s). The converter kept it. Whether Michael still uses it is unknown.

### Subtle evolutions proposed (with reasons)

1. **E1 — Place every continuation in its column, on the service page.** This follows H2 and H7. Page 53 as a holding page defeats both. *Tradeoff:* some pages lose their spare cells.
2. **E2 — Label optional or extra verses by incipit** ("hitoreri", "bo'i v'shalom"), as Michael already does on p76. Numbering that skips verses (L'cha Dodi 3 is v5) misleads. *Tradeoff:* the labels are longer. The deck's font auto-shrinks (491 buttons use size 100 with shrink).
3. **E3 — Normalise alternates to one colour, `#012a3e`**, keeping teal and burgundy as H6 defines them. *Confidence medium.* This is a visual change Michael should see before it lands.
4. **E4 — Put the fallback one press away** (§4), and add a `Fri → 2` jump beside `Sat` on Home.
5. **E5 — Do not move a camera-coupled button to a different column or page. When adding continuation panels between a series' first and last panel on p76–78, make them plain** (H8). The last panel keeps the return-to-centre on exit.

---

## 4. Proposed replacement page and fallback map

**The rule:** the new pages go at the **existing page numbers**, so Home jumps (`Sat → 7`, `F → 19`, …), home buttons, muscle memory and the Right deck's resume-last-page behaviour keep working. The original pages are copied **unchanged** to the fallback block. Only cells named below change. Every cell not listed keeps its button, action sequence and timing exactly. That includes column 7, r3c6 Merge, r3c7 Bimah Mute, and all camera, X32 and vMix buttons.

### Fallback block

The source export has pages 53–69, 71, 73 and 74 empty. The converter used 53. Proposed destinations:

| Fallback page | Copy of | Label (via `$(this:page_name)`) |
|---|---|---|
| 54–58 | 2, 3, 4, 5, 6 | `Old KS 1`…`Old KS 4`, `Old KS Alt` |
| 59–63 | 7–11 | `Old SM 1`…`Old SM 5` |
| 64–66 | 76–78 | `Old KS2 1`…`3` (only if p76–78 change) |

Each copied page keeps its own home button, which already targets page 1. On **page 1**, the proposal adds `Old Fri → 54` at r3c1 and `Old Sat → 59` at r3c2, both in black `#000000` like the other jump buttons. It also adds `Fri → 2` at r0c4, next to `Sat` at r0c5. All three cells are empty today. Page 53 ("Overlays", holding CLEAR NOW and the stray continuations) stays until E1 lands, then keeps CLEAR NOW only.

### Changed cells on priority pages

| Page | Before | After | Reason |
|---|---|---|---|
| p2 | r1c2 empty · r2c2 empty · r3c2 empty | r1c2 **Shiru 1** · r2c2 **Shiru 2** · r3c2 **Shiru 3 (new)** | The Psalm 96 series needs 3 cells in one column (D05, H2). Column 2 is directly below Shalom Aleichem in service order. |
| p2 | r2c1 Shiru 1 · r3c1 Shiru 2 | r2c1 empty (reserve) · r3c1 empty (reserve) | vacated |
| p2 | r2c4 Or Zarua (Singular) · r3c4 Mizmor l'David | r2c4 **Mizmor 1** · r3c4 **Mizmor 2** · Or Zarua → r1c6 (still Singular) | The Mizmor series in column (D07). Or Zarua has no Overlays graphic, so moving it costs nothing on air. |
| p3 | — | no moves. WAL 2, Am I Awake, How Awesome and Psalm-ish keep their cells; only their cues change (D01–D04) | Cue fixes only |
| p5 | r3c5 empty | r3c5 **Kiddush (full) 2** | The continuation directly under Kiddush (full) (D08) |
| p5 | r2c1 Aleinu 3 (exit fires logo) | Aleinu 3 plain toggle; the logo follows the Packet A resting-logo rule | D15 |
| p6 (alternates) | r2c0 empty | r2c0 **Shalom Alech 1** (copy) | Completes v1–4 in column 0 next to v2–4 in row 3. Page 2 keeps "all". |
| p8, p9 | Yotzer Or Trans 1/2, Avot Trans 1/2, Gvurot Trans | same cells, real interpretation cues | D11 |
| p10 | r3c0 Guest Name (Singular) | same cell, slot `bb52a63a`, label `Guest\n$(Overlays:slot_guest_name)` | D14 |
| p11 | r3c5 Mazel Tov · r2c4 empty | r2c4 **Mazel Tov** · r3c5 **Kiddush (full) 2** | The continuation under Kiddush (full). Mazel Tov moves one cell, keeping its colour and action. *Only if Saturday keeps the Friday Kiddush (D08); otherwise replace both Kiddush cells with the chosen morning text.* |
| p1 | r0c4, r3c1, r3c2 empty | `Fri → 2`, `Old Fri → 54`, `Old Sat → 59` | E4 |

The consequential moves are Shiru 1/2 (two cells over, same rows), Mizmor (one row up), Or Zarua (Singular-only) and Mazel Tov (one cell). Nothing on p76–78 moves. If the Shirei Shabbat L'cha Dodi variant is chosen, its five verses go on p6 in columns 4–5, labelled by incipit (E2). The four CRC verses on p2 column 5 stay as they are.

### Minimal-move alternative for p2

Leave Shiru in column 1. Re-split Psalm 96 into two panels (0–2 / 3–4) after a fit check, so no Shiru 3 is needed. The tradeoff is denser panels, against the sitting's "readable scale" direction. This is Astra's choice.

---

## 5. Representative walkthroughs (before = the deck on disk; after = §4)

| Walk | Before | After |
|---|---|---|
| **W1 Friday, Kiddush.** Home → page-down to p5 → Kiddush (full) → rest of Kiddush | The second half (blocks 10–14, which reach the chatimah) is on page 53, 48 page-downs from p5, and no jump button leads there. **In practice it is unreachable, and the operator stops mid-blessing.** | Press r3c5 directly below. No page change. |
| **W2 Friday, We Are Loved.** p3 WAL 1, then WAL 2 | Press 2 = `toggle_cue` on the cue already on air, **so the screen clears.** Both buttons light together. Panel 1 is too dense to read. | Two distinct cues. Press 2 replaces 1. Each lights alone. |
| **W3 Friday, Mizmor L'David.** p2 | Dense 3-verse panel. Verse 4 is on page 53. | r2c4 → r3c4, the same column. |
| **W4 Saturday, Avot interpretations.** p9 Avot 1 → Avot 2 → Avot Trans 1 → Trans 2 | Trans 1 **turns Avot 2 off.** It is the same cue: Hebrew, not the interpretation. | Distinct cues, in the same cells. |
| **W5 Names and clearing.** p4 Healing Names → Mi Sheb → R'fa Tziri 1/2; p5 Kaddish Names → Kaddish 1–3 | Works already (H3). The invitation is at the top of the column. Clearing means pressing the lit button again, or going Home for CLEAR NOW (on page 1 r0c2 and page 53 only). | Unchanged. Where CLEAR NOW should live on service pages is open (§7). |
| **W6 Second set, L'cha Dodi with cameras.** p76 shamor (PTZ + 1.3 s + merge) → likrat → hitoreri → bo'i (exit: centre cam + 1.3 s + merge) | Preserved exactly in the deck on disk. | Unchanged. Any added verse goes in as a plain button between the first and last panel (E5). |
| **W7 Fallback.** Anything wrong on a new page mid-service | — | Home → `Old Fri`/`Old Sat` gives the old page. Its home button returns to page 1. That is two presses each way. |

---

## 6. Converter diff and deliverable reconciliation

- **Provenance of the overwrite.** The report JSON on disk has input `/root/.claude/uploads/…/b5c85d50-ProductionDSKTP_2026-09-16-1026_custom_config.companionconfig`, so it ran in a Linux sandbox (Cowork). It was generated 15:30:41Z, after the 15:00Z release. Several things point the same way. It carries `slotsFile: null` and 803/105. Its `MICHAEL-IMPORT-SHEET.md` (10:36 local) says 803. The `verify-deck.py` on disk has no `--slots`. So a later sandbox run with older tooling overwrote the 832/76 deck and its tools. **Before import, the deck must be regenerated from HEAD's converter with `--slots slots.json`, and the checks re-run with slot-aware tooling.** Running the existing checks on the deck on disk gives 24/24 for `verify-deck.py` and "upgrade chain check: all clear" for `upgrade-check.mjs` (813 old-shape → 813 layered, 886 unchanged). That proves the 803 deck is sound, not the intended one.
- **Working-tree diff to `scripts/convert-companion-singular.mjs`, provenance consistent with the same sandbox:**
  - It **reverts** the Windows entry guard to `file://${process.argv[1]}`. That brings back the silent no-op on Windows fixed in `4a61f2d`. It works on Linux, which is why the sandbox did not notice. **Keep HEAD.**
  - It **reverts** the Guest Name finding to "No published graphic… Left on Singular", which the slots made stale. **Keep HEAD.**
  - It **adds** `--module-version` and `setModuleVersion`, which is useful for pinning to whatever version Michael has installed. **Keep this.**
  - It adds an unused `ctx` parameter to `toggleCandidate` and an unused `unmappedPlans` variable. **Drop them.**
  - This packet did not touch the file. The merge is for whoever owns the converter next.
- **The two import sheets disagree.** `docs/planning/2026-09-22-companion-cutover/MICHAEL-IMPORT-SHEET.md` (and `Claude outputs/`) says 832, which is correct once the deck is rebuilt. But its pairing step points at **System → People → Paired devices**, and that panel only lists and revokes (`app/access/people-panels.tsx:175–184`). The research sheet says 803, which describes the deck on disk. Its pairing step says **Setup → "Pair this Companion"**, and that matches the actual UI (`app/setup/setup-guide.tsx:278`). **The correct sheet is the 832 counts with the Setup pairing text**, after the deck is rebuilt.
- **Catalog-map fixes needed before the rebuild:** remove the `aliasOf` on We Are Loved 2 and on the five interpretation names once their cues exist. Keep the harmless spelling aliases (Veehavta, Veshamru, Keddusha…). The converter's spare-page logic (`sparePage`, page 53) should give way to explicit placements from §4.

## 7. Required import and upgrade checks (before Michael imports)

1. Blank the 16 slot placeholders through "This service", which is also the first real Postgres `save_slots` (release-state known-open).
2. Rebuild from HEAD's converter, with the diff reconciled as in §6, `--slots` and the corrected catalog map. Confirm 0 slot-waiting buttons, and that the deck contains all 16 slot ids.
3. `verify-deck.py`, slot-aware and with the module version as a flag: 0 failures. `upgrade-check.mjs` against Companion 5.0.3's chain: every converted button layered, `canModifyStyleInApis: true`, untouched controls byte-identical.
4. Replacement-map checks:
   - every §4 cell points at a published cue;
   - no two buttons in a series share a cue id, except intentional duplicates across pages;
   - every home button still targets page 1;
   - the fallback copies are byte-identical to the originals, except their page names;
   - page 1's new jumps land correctly;
   - the p76–78 step lists are unchanged, including the 1300 ms waits and preset numbers.
5. Module 1.6.0 is installed and listed on Companion 5.0.3, with API 2.0.4 in range. Pairing goes through Setup.
6. Hardware: repeated toggles, a replace-then-toggle on a series, clearing, reconnect, the fallback jump, and camera choreography on p76. A home preview does not prove cameras or vMix.

## 8. Decisions needed (content and product; not guessed)

1. **L'cha Dodi source:** re-pin to the CRC book (4 verses, CRC spelling), or keep Shirei Shabbat and add 5 verses?
2. **Shiru:** Michael's vv. 1–8a, or the whole of Psalm 96? And accept the column-2 move, or take the two-panel alternative?
3. **Kiddush:** is CRC's without Vay'chulu the "full" Friday text? What should the Saturday page show?
4. **Song lyrics** (Am I Awake, How Awesome, We Are Loved split): add them to maintained sources, or authorise the archive text as custom content? Also the **translation-role ruling** for the Avot and G'vurot interpretations.
5. **Or Zarua:** is it Psalm 97:11–12?
6. **CLEAR NOW on service pages:** there is no free fixed cell, because r3c7 is Bimah Mute on 34 pages. That contradicts the research synthesis's "reserved column-7 row-3 cell". Decide together with Packet A's logo and clear rules.
7. **E3** (normalising the alternates colour) needs Michael's eye.

**Return path:** `docs/planning/2026-09-22-sitting-prep/RETURN-B.md`, with `docs/planning/2026-09-22-sitting-prep/CUE-LEDGER.csv`.
