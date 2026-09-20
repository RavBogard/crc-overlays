# Overlays backlog — where the archived Singular graphics stand

14 September 2026

## 1. Where things stand

**175 graphics are built, measured and ready to publish**, and **five cues that are already live were rendering the wrong prayer** and now have corrective drafts waiting behind them (section 2 — read that one first). Of the 175, 152 are sourced to blocks of the siddur or machzor feed and 23 carry custom text that will not track siddur corrections; every one has been measured in a real browser at 1920×1080 with the production renderer and passes, except **El Na R'fa Na**, which is held up by a right-panel template bug now in the Code handoff. Twenty-one drafts were archived along the way: fourteen collapsed into siblings whose rendered text was byte-identical, four superseded by the corrective drafts on the live cues, and three — Who By Fire 1, 2 and 3 — pulled because their content was wrong (section 4). Twelve songs that had no source in the corpus were migrated out of the archive as custom-text graphics, and seven prayers that overran their panel were given continuation panels, so **no prayer ends mid-text any more**. That leaves **17 compositions with no source in the corpus** (section 4), **35 per-service names lists** (section 5), and **11 production notices whose wording was never archived** (section 6). **Nothing has been published yet** — publishing waits on the bulk-publish action in `HANDOFF-CODE-2026-09-14-publish-path.md`.

## 2. Five live cues were showing the wrong prayer

This is the serious one. Five cues that Michael has been firing on air were not rendering their own text. All five are corrected as **drafts**; the live cues still serve the old revision until someone publishes.

| Cue | What was on screen | What it shows now |
|---|---|---|
| Mourners Kaddish 3 | A sibling slice's text, not Y'hei sh'lama / Oseh shalom | Blocks 17–23 of the Mourners Kaddish unit |
| Birchot Hashachar 3 | A sibling slice's text | Blocks 13–14, 16–17 (malbish arumim, hanotein layaeif koach) |
| Birchot Hashachar 4 | A sibling slice's text | Blocks 19–20, 22–23 |
| Psukei DZimrah 2 | Psalm 91 and Psalm 92 groups sitting ahead of the right ones | The Ashrei-opening and Kol Han'shamah groups only |
| Mi Chamocha (Sat 2) | Mi Chamocha (Sat 1)'s text, verbatim | Blocks 7–12 — Tzur Yisraeil through Shiru l'Adonai |

**Root cause is the same in every case, and it is a code problem, not a data-entry problem.** The stored source reference omitted the `library:<book>:` prefix — it read `shma.mi-chamocha@legacy-shabbat-morning` where it should have read `library:legacy-shabbat-morning:shma.mi-chamocha@legacy-shabbat-morning`. The block indexes were right. But an unprefixed reference does not resolve, and when it fails to resolve the renderer does not error — it silently falls back to whatever text was baked into the cue when it was first created. So a broken reference looks exactly like a working one on the preview and on air.

Two things go into the Code handoff because of this: a **guard** that refuses an unqualified source id rather than falling through to baked text, and a **regression test asserting that no two published cues share body text**, which is what would have caught all five of these the day they were made.

### Sixteen High Holy Day lower thirds lost their Hebrew accent title

When both the title and the accent title are set, the title bar overlaps itself — and it overlaps even when both are short (Aleinu at six characters plus עָלֵינוּ at seven still collided), so this is a template limitation, not a length problem. Dropping the accent was the only fix available to me. Casualties include ones you said were worth keeping: השיבנו, על חטא, פתחו לי, עֹשֶׂה שָׁלוֹם. It also means **Hashkiveinu HHD 1 and 2** now read identically, and **B'rosh Hashanah** and **Teshuvah** share a title. The root cause is now known: in `app/globals.css` the `.bottom .title` rule follows `.bottom .title-accent` at equal specificity, so the accent inherits the full-width title box, and its RTL `flex-end` puts the Hebrew ink at the left edge on top of the English — which is why every pair collides regardless of length, while the panels are immune because their rules use `:not(.title-accent)` and give the accent its own row. Part 4 of `HANDOFF-CODE-2026-09-14-publish-path.md` fixes the rule and restores all sixteen accents.

## 3. Still needs a ruling

- **"Untaneh Tokef" in the machzor** — the K'dushat Hayom unit is the actual *U'nitaneh tokef k'dushat hayom* text and that is what the Unetane Tokef cue uses. The unit the book *names* "Untaneh Tokef" is the B'Rosh Hashanah litany, and that is what Who By Fire uses. The naming is the book's, not mine, but you should know which is which before this goes live.
- **El Malei, split across two panels at a mid-clause break** — 13 blocks cut 0–6 / 7–12, which breaks between "ba'al harachamim" and "yastireim b'seiter k'nafav". Breaking after block 4 reads better but makes panel 2 long. Also: only the communal plural form exists in the corpus, not the funeral form with a name blank.
- **Olam Chesed Yibaneh cannot comply with the Hebrew-plus-transliteration ruling** — no CRC source carries Hebrew for it (the blocks hold a dash), so it stays English-only with the refrain in the title.
- **Two graphics no longer track the siddur.** Sanctuary/Adonai Sifatai and Mi Sheberach each need both an English lyric and a Hebrew line on screen, and the app allows only one channel family per graphic. Both are now `custom` mode carrying CRC's own archived on-air text. That gets you what the congregation actually sings, at the cost that a future siddur correction will not reach them — someone has to edit them by hand.
- **Hinei Ma Tov** — a separate "Hineh Mah Tov" already exists; this operator name may be a duplicate under a different spelling.

## 4. No source in the siddur corpus

Seventeen left, down from twenty-eight. Each was searched by name and by first line; nothing came back and nothing was typed by hand. Counts are Stream Deck buttons.

- **May the Doors** (3) — "May the doors of this synagogue be wide enough".
- **If It Be Your Will 1 / 2** (2 each).
- **Or Zarua** (1) — "Or Zarua", אוֹר זָרֻעַ.
- **Tefilati** (1) — "Va'ani t'filati" returned only Mah Tovu.
- **Chanukah 1 / 2** (1 each) — "Chanukah candles".

And the whole **Second Seder page — there is no Haggadah in the corpus at all.** Ten buttons, one each: Karpas, Yachatz, Dayenu, Avadim Hayinu, In Every Gen 1 / 2 (only V'shamru and K'dushat HaYom came back), Plagues, Matzah Blessing, Birkat Hamazon, Motzi (Special). Three Seder buttons did find a source and were built: Eliyahu, Wine Blessing, shehecheyanu.

The eleven that came off this list — Od Yavo Shalom, Refa Tziri 1 and 2, Jim Mi Sheb, Mazel Tov, One Love, Psalm-ish 1 and 2, L'chi Lach, Ozi vzimrat, Havdalah Songs — now exist as **custom-text graphics** built from CRC's own archived on-air text, along with **Take This Soul**, which had been archived. They will not track siddur updates, because there is nothing in the siddur for them to track.

### Who By Fire 1–3 join this list

The three Who By Fire drafts were built as the liturgical *mi ba'eish u'mi vamayim* litany, but the ruling is that the operator's buttons are almost certainly the Leonard Cohen song. All three drafts are archived and the names are out of the catalog entirely, so the converter marks their nine Stream Deck buttons dead rather than firing the wrong prayer. The Cohen lyrics are in no book in the corpus and were never archived on air, so those buttons stay dead until you supply the text — at which point they become custom-text graphics like the other twelve migrated songs.

## 5. Names lists deferred to the per-service names feature

These 35 put a name on screen, so none got a draft; they belong to the per-service names feature, not the catalog.

Special: Student Name (6 buttons), Two Line Student Names (5), Remember Them 1/2/3 (2 each), Guest Name, Torah Reading 1–4, Haftarah Reading 1–3.

HHD: President (2), Exec Committee, Presidential Families, Mourning Families, and the family cards Worthington, Glazier Snow, Nelson-Zoole, Cohan Federman, Coburn Skrainka, Wirthing-Mass, Young, Massa, Hertz, Goldman, E Beinfeld, O Beinfeld, Lazaroff Hanes, Kaplan Van Dellen, Cohan, Kepecs, Rehbein, Rothenberg M (1 each).

## 6. Production notices with no archived text

Never archived, so there was nothing to rebuild and nothing was invented. Each needs wording from you or Michael once, then becomes a one-line custom draft. Buttons in brackets.

Money pls (7, the HHD services) · Start soon right (7, everywhere) · Good Year (3) · Benediction (3 — may be Birkat Kohanim or a spoken blessing) · This Year (1) · HHD Benediction (1, same ambiguity) · HHD Logo (1) · Torah From Scratch, Speigel Corps, Garden and Undressers (1 each, all Yom Kip 2).

## 7. Appendix — every graphic

### What the converter has to do to Michael's deck

Two changes, and only one of them he will notice.

**The fourteen collapsed drafts cost him nothing.** Where two drafts rendered byte-identical text, the duplicate was archived and its Stream Deck button name is **aliased onto the survivor** by the converter. Every button on his deck still fires, and fires the same picture. The retirements: Avot interp 1 and 2 → Avot 2; **Yotzer Or Interp 1 and 2 → the live Yotzer Or 2 cue**, which they turned out to duplicate exactly; We Are Loved 2 → We Are Loved 1; Shofar Call 1.1 → Shofar Blessing; the HHD Zochreinu → Remember Us; the second Yom Tov Candles → the first; Gevurot Trans → Gevurot 2; Avodah Trans → Avodah; the Seder Eliyahu → Eliyahu Hanavi; Mourners Kaddish 2 TT → 2 T; 3 TT → 3 T; the Seder shehecheyanu → Shehechiyanu.

**The eight continuation panels do need new buttons.** Kiddush (long) 2, Kol Nidre 2, Kol Nidre 3, Sim Shalom 4, Mizmor L'David 2, Unetane Tokef 2, Festival Kiddsuh 2 and psalm 23 (2) have no Singular composition behind them, so there is nothing to alias. The converter places eight brand-new buttons on a spare Companion page. Michael will want to know where they land and in what order before the next service that uses them.

### The table

201 rows: 178 standing and ready, 18 marked *(archived — collapsed)* or *(archived — parallel draft)*, and the 5 marked *(live cue — corrective draft)* from section 2. "Blocks" is the range as it stands after every fit fix and re-split. "Btns" is how many Stream Deck buttons point at the composition; on a collapsed row that count is the button names now aliased onto the survivor, so it is already counted on the survivor's row too. Books: `legacy-shabbat-morning` = CRC Shabbat Morning; `legacy-shabbat-evening` = CRC Kabbalat Shabbat; `legacy-beit-mitzvah` / `bm-shacharit` / `bm-maariv` = CRC Beit Mitzvah; `shabbat-maariv` / `shabbat-shacharit` = Shirei Shabbat; `crc-erev-rh`, `crc-rh-morning`, `crc-kol-nidre`, `crc-yk-morning`, `crc-neilah`, `crc-yizkor`, `legacy-slichot` = the CRC machzorim; `shirei-tshuvah` / `rh1-maariv` / `rh-shacharit` = Shirei T'shuvah.

| Name | Conn. | Layout | Mode | Source book | Blocks | Btns | Fit | Note |
|---|---|---|---|---|---|---|---|---|
| Be Right Back | Master | bottom | custom | — | — | 13 | pass | Non-liturgical production card; archived textMain used verbatim, title 'Central Reform Congregation'. |
| Birkat Kohanim | Master | bottom | bilingual | legacy-shabbat-morning | 0-3 | 13 | pass | Masculine-form three lines (blocks 0-3); source also carries a feminine set at 4-7 which the archive did not show… |
| Silent Prayer | Master | right | custom | — | — | 11 | pass | Production notice ('Silent Prayer') under title T'filah תְּפִלָּה; no siddur text referenced. |
| Adonai Sifatai | Master | bottom | bilingual | legacy-shabbat-morning | 0 | 10 | pass | Unit is named 'We Open Our Lips' in CRC Shabbat Morning p.27; single bilingual block matches the archived line exactly (source 'tiftach' vs archive 't… |
| Announcements | Master | bottom | custom | — | — | 10 | pass | Non-liturgical; archived calendar URL text used verbatim. |
| Shema | Master | bottom | bilingual | legacy-shabbat-evening | 0-2 | 10 | pass | CRC Shabbat Morning has no standalone Sh'ma unit (only the Torah-procession call), so the CRC Kabbalat Shabbat 'The Sh'ma' unit was used… |
| Avot 1 | Master | left | bilingual | legacy-shabbat-morning | 0-5 | 8 | pass | Blocks 0-5 = Baruch atah ... Elohei Bilhah v'Elohei Zilpah, exactly the archived slice; Avot 2 continues at block 6 with no gap. |
| Avot 2 | Master | left | bilingual | legacy-shabbat-morning | 6-14 | 8 | pass after font fix | Blocks 6-14 = Ha-Eil hagadol ... magein Avraham v'ezrat Sarah; block 5 carries a footnote asterisk which appears in Avot 1 only. |
| Mi Sheberach | Master | left | custom | — | — | 8 | pass | **Mixed English + Hebrew, so now custom text.** Carries the archived on-air text verbatim — the Debbie Friedman English couplets interleaved with the Mi shebeirach lines. **No longer tracks siddur corrections.** |
| Shehechiyanu | Master | bottom | bilingual | shabbat-maariv | 0 | 8 | pass | No Shehecheyanu unit surfaced in the CRC legacy siddurim; used Shirei Shabbat p.66 (single bilingual block)… |
| Aleinu 3 | Master | left | bilingual | legacy-shabbat-morning | 14-21 | 7 | pass after font fix | Blocks 14-21 = Hu Eloheinu ein od ... v'al ha-aretz mitachat, ein od, matching the archived slice… |
| Gevurot 1 | Master | left | bilingual | legacy-shabbat-morning | 0-1,4-8 | 7 | pass | Deliberate gap: source blocks 2-3 are the seasonal Mashiv haruach / Morid hatal insertions, which the archived slice did not include. |
| Gevurot 2 | Master | left | bilingual | legacy-shabbat-morning | 9-13 | 7 | pass | Blocks 9-13 = Mi chamochah ba-al g'vurot ... Baruch atah Adonai m'chayeih hakol; continues Gevurot 1 with no gap. |
| Motzi | Special | bottom | bilingual | legacy-shabbat-morning | 0-1 | 1 | pass | Full Hamotzi blessing, both bilingual blocks; block 2 is the source-en translation and was excluded… |
| Adon Olam 1 | Master | left | bilingual | legacy-shabbat-morning | 0-7 | 6 | pass | Verses 1-2 (Adon olam asher malach ... v'hu yih'yeh b'tif'arah). Exactly matches archived slice; contiguous with Adon Olam 2 (block 8). |
| Adon Olam 2 | Master | left | bilingual | legacy-shabbat-morning | 8-15 | 6 | pass | Verses 3-4 (V'hu echad v'ein sheini ... m'nat kosi b'yom ekra). No overlap or gap with Adon Olam 1… |
| Aleinu 1 | Master | left | bilingual | legacy-shabbat-morning | 0-5 | 6 | pass | Aleinu l'shabei'ach ... v'goraleinu k'chol hamonam - exact match to archived slice. |
| Aleinu 2 | Master | left | bilingual | legacy-shabbat-morning | 6-13 | 6 | pass | Va-anachnu korim ... b'govhei m'romim. Contiguous with Aleinu 1. Source transliteration carries sung repeats in brackets ('ush'chinat uzo [ush'chinat… |
| Aleinu 4 | Master | left | bilingual | legacy-shabbat-morning | 22-25 | 6 | pass | V'ne-emar v'hayah Adonai ... ush'mo echad. Blocks 14-21 are the missing 'Aleinu 3' slice (not in this batch)… |
| Aliyah Blessing AFTER | Master | left | bilingual | legacy-shabbat-morning | 0-4 | 6 | pass | All five bilingual blocks of the after-aliyah blessing; block 5 is source-en and excluded. Archive spells the Name 'אֲדֹנָי'… |
| Aliyah Blessing BEFORE | Master | left | bilingual | legacy-shabbat-morning | 0-6 | 6 | pass | Bar'chu call/response plus the full before-aliyah blessing. Source block 4 carries CRC's inclusive alternative 'mikol [im kol] ha-amim' which the arch… |
| Hashkiveinu (Randy) | Master | left | custom | — | — | 6 | pass after font fix | Randy's English/Hebrew song setting, not a siddur passage - archived text kept verbatim as custom… |
| Hinei Ma Tov | Master | bottom | bilingual | legacy-shabbat-morning | 0-1 | 6 | pass | Both bilingual blocks; blocks 2-3 are the English and the Psalm 133 credit, excluded… |
| Hoda-Ah | Master | bottom | bilingual | legacy-shabbat-morning | 11-13 | 6 | pass | The Hoda'ah/thanksgiving refrain inside Modim: Hatov ki lo chalu rachamecha ... mei-olam kivinu lach… |
| Kedusha 1 | Master | left | bilingual | legacy-shabbat-morning | 0-3,5-6 | 6 | pass | N'kadeish ... v'kara zeh el zeh v'amar, then Kadosh kadosh kadosh ... k'vodo. Block 4 (source-en) skipped, which is why the run is not contiguous. |
| Kedusha 2 | Master | left | bilingual | legacy-shabbat-morning | 9-10,12,15-17 | 6 | pass | Adir adireinu ... Baruch k'vod Adonai mimkomo ... Echad hu Eloheinu ... l'einei kol chai. Blocks 11, 13, 14 are source-en/citations and were skipped… |
| Kedusha 3 | Master | left | bilingual | legacy-shabbat-morning | 19,21-22,25-28,30 | 6 | pass after font fix | Ani Adonai Eloheichem ... Yimloch Adonai l'olam ... L'dor vador ... Baruch atah Adonai ha-Eil hakadosh… |
| Kiddush (short) | Master | bottom | bilingual | legacy-shabbat-morning | 0-1 | 6 | pass | Exact match for the short borei p'ri hagafen; block 2 is the English translation and was excluded. |
| Starting Soon | Master | bottom | custom | — | — | 6 | pass | Non-liturgical production slate; archived text used verbatim. |
| Torah Shema | Master | bottom | bilingual | legacy-shabbat-morning | 0-3 | 6 | pass | Sh'ma + Echad Eloheinu exactly as archived; archive spelling 'Yisrael'/'Adoneinu' vs source 'Yisraeil'/'Adoneinu', source used… |
| Avodah | Master | left | bilingual | legacy-shabbat-morning | 0-3,9-10 | 5 | pass | Archived slice is the abridged Avodah: R'tzeih...avodat Yisrael amecha, then straight to the chatimah… |
| Birchot Hashachar 3 *(archived — parallel draft)* | Master | left | bilingual | legacy-shabbat-morning | 13-14,16-17 | — | n/a | Archived. The published cue of the same name was rendering the wrong prayer; it now carries blocks 13-14, 16-17 as a corrective draft of its own (section 2). |
| Mourners Kaddish 3 *(archived — parallel draft)* | Master | left | bilingual | legacy-shabbat-morning | 17-23 | — | n/a | Archived. The published cue of the same name was rendering the wrong prayer; it now carries blocks 17-23 as a corrective draft of its own (section 2). |
| Eitz Chayim | Master | left | bilingual | legacy-shabbat-morning | 0-7 | 5 | pass | Full archived text (Ki lekach tov through chadeish yameinu k'kedem) matches blocks 0-7 exactly. |
| Olam Chesed Yibaneh | Master | left | source-en | legacy-shabbat-evening | 1 | 5 | pass | DOUBT: no CRC source carries Hebrew for this piece - the two 'bilingual' blocks have he = '—' and tr = the refrain… |
| Yihyu | HHD | bottom | bilingual | shirei-tshuvah | 2 | 2 | pass | Used only on HHD pages; no CRC legacy machzor/siddur unit exposes Yih'yu l'ratzon as its own block… |
| Am I Awake | Master | left | bilingual | legacy-shabbat-morning | 0-1 | 4 | pass | Barchu call and response. The 'Am I awake? Am I prepared?' poem in the archived English channel is not in any CRC source and was not typed… |
| El Malei TRANSLIT | Master | left | bilingual | crc-yizkor | 0-6 | 4 | pass after re-cut | Archive held an English paraphrase with a blank for the deceased's name, not a transliteration… |
| El Na R'fa Na | Master | right | bilingual | legacy-shabbat-morning | 1 | 4 | **FAILS** (right-panel template bug) | Block 1 only ('El na r'fa na lah'), matching the archive. Two short lines measure fill 4.06 because the legacy `.right .prayer` CSS forces each row into a fixed box — Part 3 of the Code handoff. The 'lo' line is still out, though the composition title reads 'Lah/Lo'. |
| Haftarah Blessing AFTER 1 | Master | left | bilingual | legacy-shabbat-morning | 0-4 | 4 | pass after re-cut | Archived slice 1 (Baruch atah ... shekol d'varav emet vatzedek) maps exactly to blocks 0-4; slice 2 continues at block 5 with no gap. |
| Haftarah Blessing AFTER 2 | Master | left | bilingual | legacy-shabbat-morning | 5-10 | 4 | pass after re-cut | Archived slice ends at 'anachnu modim lach,' which is mid-block 10 ('anachnu modim lach, um'varchim otach,')… |
| Haftarah Blessing BEFORE | Master | left | bilingual | legacy-shabbat-morning | 0-6 | 4 | pass after re-cut | Whole blessing, blocks 0-6; translation block 7 excluded. Archive Hebrew used ה' for the divine name, source uses יְיָ; source used. |
| Kiddush (long) | Master | left | bilingual | legacy-shabbat-evening | 2-9 | 4 | pass after re-cut | Friday-night Kiddush, CRC Kabbalat Shabbat pp.54-55. Continues on **Kiddush (long) 2** (blocks 10-14), which carries the chatimah. |
| Sanctuary/Adonai Sifatai | Master | bottom | custom | — | — | 4 | pass | **Mixed English + Hebrew, so now custom text.** Carries CRC's archived on-air line verbatim (the 'Sanctuary' English plus the Adonai s'fatai transliteration). One channel family per graphic, so this is the only way to keep both. **No longer tracks siddur corrections.** |
| Send Healing Names | Master | bottom | custom | — | — | 4 | pass | Non-liturgical production notice; archived text used verbatim. |
| Send Kaddish Names | Master | bottom | custom | — | — | 4 | pass | Non-liturgical production notice; archived text used verbatim. |
| Shalom Rav | Master | left | bilingual | legacy-shabbat-evening | 0-8 | 4 | pass after font fix | Whole prayer, CRC Kabbalat Shabbat p.35 (Kab Shab 3 is the first operator page). Archive spelling 'Yisrael' vs source 'Yisraeil'… |
| We Are Loved 1 | Master | left | original-en | legacy-shabbat-morning | 0 | 4 | pass after re-cut | DOUBT — NEEDS OWNER REVIEW: Rami Shapiro 'Unending Love' exists in the feed as ONE block containing the whole poem… |
| We Are Loved 2 *(archived — collapsed)* | Master | left | original-en | legacy-shabbat-morning | 0 | 4 | n/a | Rendered text byte-identical to **We Are Loved 1**; archived under the collapse ruling. Its Stream Deck button name is aliased onto We Are Loved 1 by the converter, so Michael's deck is unchanged. |
| Adon Olam 3 | Master | left | bilingual | legacy-shabbat-evening | 16-19 | 3 | pass | Final verse 'B'yado afkid ruchi ... Adonai li v'lo ira' = blocks 16-19, exactly matching the archived Hebrew… |
| Ahavah Raba (short) | Master | bottom | bilingual | legacy-beit-mitzvah | 0 | 3 | pass | Short cue = opening line only, block-0 'Ahavah rabah ahavtanu'. No legacy-shabbat-morning unit for this prayer exists in the corpus… |
| Haftarah Blessing AFTER 3 | Master | left | bilingual | legacy-shabbat-morning | 10-14 | 3 | pass after re-cut | Archived slice begins mid-block-10 (at 'um'varchim otach'); included block 10 whole rather than leave a gap… |
| Hashkiveinu (plain) | Master | left | bilingual | legacy-shabbat-evening | 3-7 | 3 | pass | Archived text interleaves English translations with the Hebrew; used only the five bilingual blocks 3-7… |
| How Awesome / Shema | Master | left | bilingual | legacy-shabbat-evening | 0-2 | 3 | pass | Shema line + Baruch sheim k'vod malchuto l'olam va-ed, matching the archived Hebrew exactly… |
| Maariv Arevim (Evening) | Master | bottom | original-en | legacy-shabbat-evening | 0 | 3 | pass | English-only chant by Rabbi Geela Rayzel Raphael, so mode original-en. Block 0 is the chant… |
| Maariv Arevim (Roll into Dark) | Master | bottom | bilingual | legacy-shabbat-evening | 8-10 | 3 | pass | Blocks 8-10 are exactly the archived transliteration slice 'Borei yom valailah goleil or mipnei choshech v'choshech mipnei or'… |
| Maariv Arevim 1 | Master | left | bilingual | legacy-shabbat-evening | 0-7 | 3 | pass | Exact match to archived slice, 'Baruch atah Adonai ... b'mishm'roteihem baraki-a kirtzono.' Slices 1 and 2 are contiguous with no overlap and no gap (… |
| Maariv Arevim 2 | Master | left | bilingual | legacy-shabbat-evening | 8-16 | 3 | pass after font fix | Exact match to archived slice, 'Borei yom valailah ... Baruch atah Adonai hama-ariv aravim.' Block 17 is the English interpretation and was excluded. |
| Mi Chamocha (Friday) 1 | Master | left | bilingual | legacy-shabbat-evening | 0-6 | 3 | pass | Matches archived slice through 'Adonai yimloch l'olam va-ed'. Source block 6 transliteration reads 'Adonai (Yah) yim'loch l'olam va-ed.' where the arc… |
| Mi Chamocha (Friday) 2 | Master | left | bilingual | legacy-shabbat-evening | 7-10 | 3 | pass | Exact match to archived slice 'V'ne-emar: ki fadah ... Shiru laAdonai ki ga-oh ga-ah.' English blocks 11-15 (including the 'Then Miriam...' rubric) ex… |
| Psukei DZimrah 2 *(archived — parallel draft)* | Master | left | bilingual | legacy-shabbat-morning | 0-1 | — | n/a | Archived. The published cue of the same name was rendering the wrong prayer; it now carries the Ashrei-opening and Kol Han'shamah groups as a corrective draft of its own (section 2). |
| Sim Shalom | Master | bottom | bilingual | legacy-shabbat-morning | 0-2 | 3 | pass | Archive stops at 'aleinu v'al kol yisrael amecha', so block 3 ('Baruch atah Adonai oseh hashalom') was excluded… |
| Tallit Blessing | Master | bottom | bilingual | legacy-beit-mitzvah | 1-4 | 3 | pass | CRC Shabbat Morning has no Tallit unit (searched 'Tallit', 'Tallit blessing tzitzit', 'l'hitatef batzitzit')… |
| Vshamru | Master | left | bilingual | legacy-shabbat-evening | 4-11 | 3 | pass | Blocks 4-11 are the full archived paragraph through 'u'vayom hashvi-i shavat vayinafash'… |
| Avot interp 1 *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 6-14 | 2 | n/a | Rendered text byte-identical to **Avot 2**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Avot 2 by the converter, so Michael's deck is unchanged. |
| Avot interp 2 *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 6-14 | 2 | n/a | Rendered text byte-identical to **Avot 2**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Avot 2 by the converter, so Michael's deck is unchanged. |
| Barcheinu | Master | bottom | bilingual | legacy-shabbat-morning | 0-1 | 2 | pass | Archived text matches source verbatim including the bracketed repeat '[kulanu k'echad] b'or panecha'… |
| Birchot Hashachar 4 *(archived — parallel draft)* | HHD | left | bilingual | legacy-shabbat-morning | 19-20,22-23 | — | n/a | Archived. The published cue of the same name was rendering the wrong prayer; it now carries blocks 19-20, 22-23 as a corrective draft of its own (section 2). |
| Candle LIghting | Master | bottom | bilingual | legacy-shabbat-evening | 0-4 | 2 | pass | Full Shabbat candle blessing from CRC Kabbalat Shabbat (the Friday-night book the operator uses on 'Kab Shab 1')… |
| El Mei Rachamim | Master | left | bilingual | crc-yizkor | 7-12 | 2 | pass after re-cut | Only El Malei source in the corpus is the CRC Yizkor communal version; used all 13 bilingual blocks… |
| Eliyahu Hanavi | Master | left | bilingual | legacy-beit-mitzvah | 0-3 | 2 | pass | Full song, all four bilingual blocks, from the CRC Beit Mitzvah Havdalah service (operator page 'BM Havdala'… |
| Gevurot Trans *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 9-13 | 2 | n/a | Rendered text byte-identical to **Gevurot 2**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Gevurot 2 by the converter, so Michael's deck is unchanged. |
| Hagbahah | Master | left | bilingual | legacy-shabbat-morning | 0-1 | 2 | pass | V'zot haTorah (both bilingual blocks). DOUBT: the archive also showed a second stanza 'Al shloshah d'varim ha'olam omeid...' — no source unit for it e… |
| Hallelu 1 | Master | bottom | bilingual | shirei-tshuvah | 0 | 2 | pass | Psalm 150 v.1-2 (Hal'lu-Yah ... hal'luhu k'rov gudlo) = block 0. Sourced to Shirei Tshuvah, the HHD book matching the operator page 'HHD Beginning'… |
| Hallelu 2 | Master | bottom | bilingual | shirei-tshuvah | 2 | 2 | pass | Psalm 150 v.3-4 (b'teka shofar ... b'minim v'ugav) = block 2; block 1 skipped as source-en, so no gap in Hebrew between slices 1 and 2. |
| Hallelu 3 | Master | bottom | bilingual | shirei-tshuvah | 4 | 2 | pass | Psalm 150 v.5-6 (b'tziltz'lei-shama ... Kol han'shama t'halel Yah, hal'lu-Yah) = block 4; completes the psalm with no overlap. |
| Hashkiveinu (Daniel) | Master | left | bilingual | legacy-shabbat-evening | 3-5 | 2 | pass | Archived Hebrew is only the two opening lines plus Ufros aleinu sukkat sh'lomecha = blocks 3-5… |
| Havd 1 | Master | bottom | bilingual | legacy-beit-mitzvah | 1-3 | 2 | pass | Havdalah wine blessing, the three bilingual blocks (block 0 is the 'THE CUP OF WINE IS RAISED' rubric, excluded)… |
| Havd 2 | Master | bottom | bilingual | legacy-beit-mitzvah | 3-5 | 2 | pass | Havdalah spice blessing, the three bilingual blocks (blocks 0-2 are all-caps rubrics, excluded). Same book choice as Havd 1 for consistency… |
| Havd 3 | Master | bottom | bilingual | legacy-beit-mitzvah | 2-4 | 2 | pass | Fire blessing matched to CRC Beit Mitzvah 'The Light of the Fire' (michaelPages 'BM Havdala'); rubric blocks 0-1 and English block 5 excluded… |
| Havd 4 | Master | bottom | bilingual | legacy-beit-mitzvah | 2-9 | 2 | pass | Full separation blessing incl. closing chatimah, same Beit Mitzvah Havdalah unit as Havd 3… |
| Hodu | Master | bottom | bilingual | legacy-shabbat-morning | 0 | 2 | pass | Archive showed transliteration only; created bilingual he+tr from the single Hodu verse block (Psalm 107:1) in CRC Shabbat Morning per owner preferenc… |
| House of Prayer | Master | bottom | original-en | legacy-shabbat-evening | 0 | 2 | pass | English-only piece (Isaiah 56:7, Hirschfield melody) exists in CRC Kabbalat Shabbat as original-en; attribution block 1 excluded. |
| L'cha Dodi 1 | Master | left | bilingual | shabbat-maariv | 0-1 | 2 | pass | Refrain + verse 1 (Shamor v'zachor). L'cha Dodi exists only in Shirei Shabbat (shabbat-maariv), not in the CRC legacy siddurim… |
| L'cha Dodi 2 | Master | left | bilingual | shabbat-maariv | 0,3 | 2 | pass | Refrain + verse 2 (Likrat Shabbat). Archive's four slices skip source verses 3, 4, 6, 7, 8 — deliberate gap matching the operator's sung selection. |
| L'cha Dodi 3 | Master | left | bilingual | shabbat-maariv | 0,9 | 2 | pass | Refrain + Hitor'ri verse (source block 9); archive spelling 'Hitor'ri' vs source 'Hit'or'ri' — source used. |
| L'cha Dodi 4 | Master | left | bilingual | shabbat-maariv | 0,17 | 2 | pass | Refrain + Bo'i v'shalom verse; source block has 'bo'i chala' three times plus 'Shabbat malk'ta' where the archive showed only two — source used… |
| Lev Tahor | Master | bottom | source-en | legacy-shabbat-morning | 2 | 2 | pass | Piece exists in CRC Shabbat Morning as 'Tahor Lev' with English only (no he/tr blocks), so source-en used… |
| Light These Lights | Master | left | original-en | legacy-shabbat-evening | 0 | 2 | pass | Debbie Friedman candle-lighting song = CRC Kabbalat Shabbat 'Candle Lighting Song', original-en… |
| Shalom Aleichem 2 | Master | left | bilingual | legacy-shabbat-evening | 4-7 | 2 | pass | Bo'achem l'shalom verse; CRC Kabbalat Shabbat chosen over Shirei Shabbat because it carries the archived parenthetical '(מַלְאֲכֵי הָרַחֲמִים)'… |
| Shalom Aleichem 3 | Master | left | bilingual | legacy-shabbat-evening | 8-11 | 2 | pass | Barchuni l'shalom verse; archive 'Barchuni l'shalom mal'achei hashalom' matches source blocks 8-11 exactly (source spells 'Barchuni l'shalom… |
| Shalom Aleichem 4 | Master | left | bilingual | legacy-shabbat-evening | 12-15 | 2 | pass | Tzeitchem l'shalom verse, blocks 12-15; archive spelling 'Tzeitechem' vs source 'Tzeitchem', source used. Consecutive with Shalom Aleichem 3. |
| Siddurim | Master | bottom | custom | — | — | 2 | pass | Non-liturgical production notice; archived text used verbatim ('Download our Siddurim at centralreform.org/#livestream'). |
| Thou Shalt Love | Master | left | original-en | legacy-shabbat-morning | 0-2 | 2 | pass | English-only Debbie Friedman setting; exists in CRC Shabbat Morning p.22 as original-en blocks. Archive slice = blocks 0-2 verbatim incl… |
| Thou Shalt Love 2 | Master | left | original-en | legacy-shabbat-morning | 3-4 | 2 | pass | Consecutive continuation of Thou Shalt Love; blocks 3-4 match the archived slice exactly (source block 4 carries both the 'upon thy gates (2x)' and 't… |
| Yedid Nefesh | Master | left | bilingual | shabbat-maariv | 0 | 2 | pass | Verse 1 only, matching archive. Not present in the CRC legacy siddurim; only Shirei Shabbat (shabbat-maariv) has it… |
| Yotzer Or Interp 1 *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 8-15 | 2 | n/a | Rendered text byte-identical to **the live cue Yotzer Or 2**; archived under the collapse ruling. Its Stream Deck button name is aliased onto the live cue Yotzer Or 2 by the converter, so Michael's deck is unchanged. |
| Yotzer Or Interp 2 *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 8-15 | 2 | n/a | Rendered text byte-identical to **the live cue Yotzer Or 2**; archived under the collapse ruling. Its Stream Deck button name is aliased onto the live cue Yotzer Or 2 by the converter, so Michael's deck is unchanged. |
| psalm 23 | Master | left | bilingual | crc-yizkor | 0-5 | 2 | pass | Hebrew + transliteration per the ruling; the English translation block 15 is dropped. Re-split: verses 1-3 here, ending cleanly at 'l'ma'an sh'mo'. Rest on **psalm 23 (2)**. Compact, he 24 / tr 20. |
| Ahavat Olam 1 | Master | left | bilingual | legacy-shabbat-evening | 0-8 | 1 | pass after font fix | Opening through 'uv'mitzvotecha l'olam va-ed' = blocks 0-8. Archive spelling 'Yisrael' vs source 'Yisraeil'; source used. |
| Ahavat Olam 2 | Master | left | bilingual | legacy-shabbat-evening | 9-12 | 1 | pass | 'Ki heim chayeinu' through the chatimah = blocks 9-12, consecutive with Ahavat Olam 1, no gap. Archive 'al tashir' is a typo for source 'al tasir'… |
| Ana Bakoach | Master | bottom | bilingual | shabbat-maariv | 0 | 1 | pass | Archive showed verse 1 only (both lines), which is exactly source block 0. Only Shirei Shabbat (shabbat-maariv) carries Ana B'koach… |
| Avodah Trans *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 0-3,9-10 | 1 | n/a | Rendered text byte-identical to **Avodah**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Avodah by the converter, so Michael's deck is unchanged. |
| Awaken, Arise | Master | bottom | bilingual | legacy-shabbat-evening | 1 | 1 | pass | Sourced (Hanna Tiferet Siegel, CRC Kabbalat Shabbat p.8). Only block 1 is bilingual… |
| Hashkiveinu (Jim) | Master | left | bilingual | legacy-shabbat-evening | 5-7 | 1 | pass | Archived slice = Ufros aleinu + the chatimah (Baruch atah...haporeis sukkat shalom aleinu, v'al kol amo Yisrael, v'al Yerushalayim)… |
| Mi Chamocha (short) | Master | bottom | bilingual | legacy-shabbat-morning | 0-2 | 1 | pass | Archived text is exactly the ba'eilim verse; blocks 0-2 match word for word… |
| Miryam Han'viah | Master | left | bilingual | crc-neilah | 0-6 | 1 | pass | Full song, matches archive exactly. Only source in the corpus is the CRC Neilah havdalah unit… |
| Modim Anachnu Lach | Master | left | bilingual | legacy-shabbat-morning | 0-2 | 1 | pass | Archive showed only 'Modim anachnu lach…' (ellipsis) plus an interpretive English poem with no siddur counterpart… |
| Passing the Torah | Master | right | custom | — | — | 1 | pass | Treated as production/ceremony title card, not liturgy: archived text is an English caption plus the unpointed words לדור ודור… |
| Shalom Aleichem 1 | Master | left | bilingual | legacy-shabbat-evening | 0-3 | 1 | pass | Verse 1 only; matches the archive including the (malachei harachamim) parenthetical… |
| Shalom Aleichem all | Master | left | bilingual | legacy-shabbat-evening | 0-3, 12-15 | 1 | pass (fill 0.88) | Verses 1 and 4. Four full verses measure 1.51x too tall even at the smallest permitted type, so a single all-four-verse panel is not possible; the four single-verse buttons already exist if you want the whole song. |
| Shavua Tov | Master | bottom | bilingual | legacy-beit-mitzvah | 0 | 1 | pass | kindGuess said custom, but a real source unit exists in CRC Beit Mitzvah (matches the 'BM Havdala' page). Block-0 is the bilingual 'Shavua tov… |
| Shiru La'Donai 1 | Master | left | bilingual | shabbat-maariv | 0-1 | 1 | pass | Psalm 96; only source in the corpus is the Shirei Shabbat unit (no CRC Kabbalat Shabbat Psalm 96)… |
| Shiru La'Donai 2 | Master | left | bilingual | shabbat-maariv | 1-2 | 1 | pass | Archived slice 2 starts mid-block-1 ('Ki kol elohei ha'amim') and ends mid-block-2 ('uvo'u l'chatzrotav')… |
| Vahavta trans | Master | left | bilingual | legacy-shabbat-morning | 0-8 | 1 | pass after font fix | Archived Hebrew runs V'ahavta through 'uvshochb'cha uvkumecha' = blocks 0-8 exactly… |
| Yom Zeh lYisrael | Master | left | bilingual | legacy-shabbat-evening | 2-7 | 1 | pass | Chorus plus first stanza, matching the archived slice; the 'Chorus' rubric block-1 was excluded… |
| Yom Zeh lYisrael 2 | Master | left | bilingual | legacy-shabbat-evening | 2-3,8-11 | 1 | pass | Chorus (2-3) + stanza 'Chemdat halvavot' (8-11), matching the archived slice… |
| Yom Zeh lYisrael 3 | Master | left | bilingual | legacy-shabbat-evening | 2-3,12-15 | 1 | pass | Chorus (2-3) + stanza 'Kidashta beirachta' (12-15); no overlap with slice 2's stanza, chorus intentionally repeated as in the archive… |
| Mourners Kaddish 1 TT | Master | left | bilingual | legacy-shabbat-morning | 2-9 | 0 | pass | Yitgadal … l'alam ul'almei almaya — exactly the archived slice; rubric blocks 0-1 (PLEASE RISE/BE SEATED) excluded… |
| Mourners Kaddish 2 T | Master | left | bilingual | legacy-shabbat-morning | 10-16 | 0 | pass | Yitbarach … da-amiran b'alma, v'imru amein — continues slice 1 with no gap… |
| Mourners Kaddish 2 TT *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 10-16 | 0 | n/a | Rendered text byte-identical to **Mourners Kaddish 2 T**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Mourners Kaddish 2 T by the converter, so Michael's deck is unchanged. |
| Mourners Kaddish 3 T | Master | left | bilingual | legacy-shabbat-morning | 17-23 | 0 | pass | Y'hei sh'lama … Oseh shalom … v'imru amein; same blocks as the pre-existing 'Mourners Kaddish 3' draft… |
| Mourners Kaddish 3 TT *(archived — collapsed)* | Master | left | bilingual | legacy-shabbat-morning | 17-23 | 0 | n/a | Rendered text byte-identical to **Mourners Kaddish 3 T**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Mourners Kaddish 3 T by the converter, so Michael's deck is unchanged. |
| Take This Soul | Master | bottom | custom | — | — | 0 | pass | Re-created from the archived on-air text (the U2 'Yahweh' lyric sung alongside Hashkiveinu). Custom text, so it will not track siddur corrections. No Stream Deck button points at it yet. |
| Zochreinu | Master | bottom | bilingual | shabbat-maariv | 1 | 0 | pass | Archived text is the Zochreinu Avot insertion only (despite the graphic's 'Mi Chamocha' title, kept verbatim)… |
| May the Memory | HHD | bottom | bilingual | crc-erev-rh | 1-3 | 9 | pass after title fix | Bonia Shur 'Zeicher tzadik livrachah' refrain; used the Erev Rosh Hashanah machzor copy (HHD book) over the Shabbat siblings… |
| Zochreinu *(archived — collapsed)* | HHD | left | bilingual | crc-erev-rh | 0,3,5 | 0 | n/a | Rendered text byte-identical to **Remember Us**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Remember Us by the converter, so Michael's deck is unchanged. |
| Vimru Amen | HHD | bottom | bilingual | crc-yk-morning | 4-6 | 6 | pass after title fix | Read the button name as the sung Oseh Shalom ending on '…v'imru amen'; took the Oseh Shalom half of the YK-morning Yihyu/Oseh Shalom unit… |
| Avinu Malkeinu 1 | HHD | left | bilingual | crc-erev-rh | 3,5,7-8,10-11,13-14 | 6 | pass | No archive: split the unit's 18 bilingual blocks into consecutive halves at a couplet boundary (8 here, 10 in slice 2)… |
| Avinu Malkeinu 2 | HHD | left | bilingual | crc-erev-rh | 16-17,19-20,22-23,25-28 | 6 | pass | Second consecutive half of the Erev RH Avinu Malkeinu, no gap or overlap with slice 1; rubric and kavannah/English blocks excluded. Re-measured after the font reduction: passes. |
| aleinu bot 1 | HHD | bottom | bilingual | legacy-slichot | 0-10 | 5 | pass after title fix | 'bot' read as bottom layout; no archive, so the 22 bilingual blocks were split into equal consecutive halves… |
| aleinu bot 2 | HHD | bottom | bilingual | legacy-slichot | 11-21 | 5 | pass after title fix | Second half, continuous with slice 1; block 22 (long English paragraph) excluded. Slichot is the HHD-season CRC book that carries Aleinu. |
| Bsefer Chayim | HHD | bottom | bilingual | shirei-tshuvah | 1 | 5 | pass after title fix | The HHD insertion 'B'sefer chayim…' isolated as one block in Shirei Tshuvah's evening Shalom Rav… |
| Vidui | HHD | left | bilingual | crc-kol-nidre | 2-10 | 5 | pass after re-cut | All nine bilingual blocks (Eloheinu velohei… through Chatanu. Avinu. Pashanu.)… |
| Esah Einai | HHD | bottom | bilingual | crc-erev-rh | 0-2 | 4 | pass after title fix | Psalm 121 opening; Erev Rosh Hashanah copy (Erev Rosh 1 is a listed page)… |
| Return Again | HHD | left | original-en | legacy-slichot | 0 | 4 | pass | English-only song; CRC Slichot carries it as a single original-en block, so used original-en rather than typing lyrics. |
| Ve'Al Kulam | HHD | bottom | bilingual | crc-kol-nidre | 19-20 | 4 | pass after title fix | The V'al kulam refrain inside Al Cheit; took its first occurrence (blocks 19-20)… |
| Shofar Blessing | HHD | bottom | bilingual | crc-rh-morning | 2-4 | 4 | pass after title fix | '…lishmo'a kol shofar' blessing only; the Shehecheyanu that follows it in the same unit (blocks 6-9) left out since a separate Shehecheyanu draft exis… |
| Avinu Malkeinu Short | HHD | left | bilingual | crc-erev-rh | 25-28 | 3 | pass | 'Short' read as the sung closing verse Chaneinu va'aneinu…; reused the Erev RH unit already fetched (its pages are Rosh Hash 2 / Yom Kip 2… |
| Unetane (Eng) 1 | HHD | left | source-en | crc-yk-morning | 12 | 3 | pass | English Un'taneh Tokef: the book splits the translation into exactly two paragraphs… |
| Unetane (Eng) 2 | HHD | left | source-en | crc-yk-morning | 13 | 3 | pass | Slice 2 = 'You remember deeds long forgotten…' (block 13); continuous with slice 1, no gap. |
| Hashkiveinu HHD 1 | HHD | bottom | bilingual | crc-erev-rh | 0-1 | 3 | pass after title fix | HHD-evening Hashkiveinu; unit has only four bilingual blocks, split 2/2… |
| Hashkiveinu HHD 2 | HHD | bottom | bilingual | crc-erev-rh | 2,4 | 3 | pass after title fix | Second half (block 3 between them is the English line, skipped); ends at 'Ufros aleinu sukat sh'lomecha' — the rest of the prayer exists only as Engli… |
| Who By Fire 1 | HHD | left | bilingual | crc-yk-morning | 0-4 | 3 | pass | Read as the liturgical 'who by fire' litany (B'Rosh Hashanah yikateivun / Mi ba'eish u'mi vamayim), not the Leonard Cohen song… |
| Who By Fire 2 | HHD | left | bilingual | crc-yk-morning | 5-9 | 3 | pass | Middle third, continuous with slice 1. |
| Unetane Tokef | HHD | left | bilingual | crc-yk-morning | 1-7 | 3 | pass after re-cut | The book's K'dushat Hayom unit is the actual 'U'nitaneh tokef k'dushat hayom' text (see section 3 on the machzor's unit naming). Continues on **Unetane Tokef 2** (blocks 8-11). |
| Who By Fire 3 | HHD | left | bilingual | crc-yk-morning | 10-13,15-16 | 3 | pass | Final third plus the U't'shuvah u't'filah u'tz'dakah response (15-16); block 14 between them is the English translation, skipped. |
| Hashiveinu | HHD | bottom | bilingual | legacy-slichot | 0,3 | 3 | pass after title fix | CRC Slichot setting (A section + B 'Chadeish' section); both bilingual blocks included, the 'B · Sing twice' rubric and English glosses excluded. |
| Mi Chamochah 2 HHD evening | HHD | left | bilingual | crc-erev-rh | 5-8 | 2 | pass | Evening HHD book chosen (pages Erev Rosh 1 / Kol Nidre 1); Erev RH preferred… |
| Remember Us | HHD | left | bilingual | crc-erev-rh | 0,3,5 | 2 | pass | Zochreinu (Bonia Shur chant). Erev RH book chosen (pages Erev Rosh 2 / Rosh Hash 2). Only the 3 bilingual blocks used… |
| Festival Kiddsuh | HHD | left | bilingual | crc-erev-rh | 0-8 | 2 | pass after re-cut | Operator misspelling 'Kiddsuh' kept verbatim. Yom HaZikaron kiddush, first half; continues on **Festival Kiddsuh 2** (blocks 9-17). |
| Sim Shalom 1 | HHD | left | bilingual | crc-rh-morning | 1-6 | 2 | pass | RH Morning chosen (pages Rosh Hash 2 / Yom Kip 2; YK text is identical)… |
| Sim Shalom 2 | HHD | left | bilingual | crc-rh-morning | 7-14 | 2 | pass | Slice 2 = Sim shalom + v'tov b'einecha l'vareich. Consecutive with slice 1, no gap or overlap. |
| Sim Shalom 3 | HHD | left | bilingual | crc-rh-morning | 15-22 | 2 | pass after re-cut | Slice 3, B'seifer chayim onward. Continues on **Sim Shalom 4** (blocks 23-27), which carries 'oseh hashalom'. |
| Kol Nidre | HHD | left | bilingual | crc-kol-nidre | 2-9 | 2 | pass after re-cut | Kol Nidre formula proper, through ush'vuatana lo sh'vuot. Continues on **Kol Nidre 2** and **Kol Nidre 3**, which finish the paragraph, V'nislach, S'lach na and Vayomeir Adonai. |
| 13 Attributes | HHD | bottom | bilingual | shirei-tshuvah | 1 | 2 | pass after title fix | Not in the legacy machzor books under any spelling I tried; found in Shirei Tshuvah Torah Service as 'The Thirteen Attributes'… |
| Al Cheit Refrain | HHD | bottom | bilingual | crc-yk-morning | 42-43 | 2 | pass after title fix | The V'al kulam refrain. The unit repeats this refrain four times (blocks 1/2, 5/6, 9/10, 42/43)… |
| Hayom | HHD | left | bilingual | crc-yk-morning | 0,3,6 | 2 | pass | Re-sliced to t'amtzeinu / t'varcheinu / t'gadleinu so it no longer overlaps **Hayom 2** (9,12,15,18). Between the two, all seven petitions appear once. |
| Pitchu Li | HHD | bottom | bilingual | crc-neilah | 0-1 | 2 | pass after title fix | Psalm 118:19 verse only. The same unit also carries Hashiveinu (blocks 5-6) and P'tach Lanu Sha'ar (8-11)… |
| Ashamnu | HHD | left | bilingual | crc-neilah | 0-6 | 2 | pass | Full alphabetical confession from the Neilah book (page 'Neilah 2'). The trailing V'al kulam refrain (blocks 8-9) left out — covered by the 'Al Cheit… |
| Mizmor L'David | Special | left | bilingual | shabbat-maariv | 0-2 | 1 | pass after re-cut | Psalm 29 from Shirei Shabbat Welcoming Shabbat (the 'Kab Shab 1' page), not the Yizkor Psalm 23. Continues on **Mizmor L'David 2** (block 3), the closing 'Adonai oz l'amo yiten' the room sings. |
| Shalom Alechem small | Special | bottom | bilingual | shabbat-maariv | 5 | 1 | pass after title fix | 'small' read as the condensed one-line four-phrase form the source carries (block 5)… |
| Eliyahu *(archived — collapsed)* | Special | left | bilingual | legacy-beit-mitzvah | 0-3 | 1 | n/a | Rendered text byte-identical to **Eliyahu Hanavi**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Eliyahu Hanavi by the converter, so Michael's deck is unchanged. |
| Yom Tov Candles | Special | bottom | bilingual | shirei-tshuvah | 2 | 1 | pass | Festival candle blessing 'l'hadlik ner shel (Shabbat v'shel) yom tov' — only yom-tov candle unit in corpus (Shirei Tshuvah, Erev RH)… |
| shehecheyanu *(archived — collapsed)* | Special | bottom | bilingual | shabbat-maariv | 0 | 1 | n/a | Rendered text byte-identical to **Shehechiyanu**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Shehechiyanu by the converter, so Michael's deck is unchanged. |
| Kol Hanshemah | Special | bottom | bilingual | legacy-shabbat-morning | 0-1 | 1 | pass | Operator spelling 'Hanshemah' vs source 'Kol Han'shamah'; source spelling used for title… |
| Wine Blessing | Special | bottom | bilingual | shabbat-maariv | 0 | 1 | pass | Borei p'ri hagafen only, from the Festival Kiddush unit (its block 2 carries the Chag haMatzot insertion, so this is the right book for a seder)… |
| Candle Lighting RH | HHD | bottom | bilingual | shirei-tshuvah | 2 | 1 | pass | Erev Rosh 1 page. Block 2 is the yom-tov candle blessing; block 0 ('L'shana tova tikatevu') deliberately left out… |
| B'rosh Hashanah | HHD | bottom | bilingual | legacy-slichot | 0 | 1 | pass | CRC Slichot unit 'B'Rosh Hashanah Yikateivun' block 0 is exactly the one-line refrain… |
| Teshuvah | HHD | bottom | bilingual | legacy-slichot | 3 | 1 | pass | U'teshuvah u'tefillah u'tzedakah line, consecutive slice after B'rosh Hashanah (English blocks 1-2 skipped, they are original-en)… |
| Shofar Call 1.1 *(archived — collapsed)* | HHD | bottom | bilingual | crc-rh-morning | 2-4 | 1 | n/a | Rendered text byte-identical to **Shofar Blessing**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Shofar Blessing by the converter, so Michael's deck is unchanged. |
| Shofar Call 2 | HHD | bottom | bilingual | crc-rh-morning | 2 | 1 | pass | Shofar Call 1/2/3 = the machzor's three calls (Malchuyot/Zichronot/Shofarot)… |
| Shofar Call 3 | HHD | bottom | bilingual | crc-rh-morning | 2,4 | 1 | pass | Third call, Shofarot. Blocks 2 and 3 are identical (TEKIAH·TERUAH·TEKIAH) so 3 was dropped… |
| Candle Lighting YK | HHD | left | bilingual | crc-kol-nidre | 0-4 | 1 | pass | Kol Nidre 1 page → CRC Kol Nidre book, 'Candle Blessing' unit; all 5 bilingual blocks, English gloss block 5 excluded… |
| Hayom 2 | HHD | left | bilingual | crc-yk-morning | 9,12,15,18 | 1 | pass | Yom Kip 3 page → CRC Yom Kippur Morning 'Hayom'. No archive to guide the cut: the unit's 7 bilingual blocks (0,3,6,9,12,15,18) split into consecutive… |
| Sacred Assembly | HHD | left | bilingual | crc-erev-rh | 0-6 | 1 | pass | DEVIATION, flag for owner: the brief lists 'Sacred Assembly' under no-text… |
| Yom Tov Candles *(archived — collapsed)* | HHD | bottom | bilingual | shirei-tshuvah | 2 | 1 | n/a | Rendered text byte-identical to **Yom Tov Candles (Special)**; archived under the collapse ruling. Its Stream Deck button name is aliased onto Yom Tov Candles (Special) by the converter, so Michael's deck is unchanged. |
| psalm 23 (2) | Master | left | bilingual | crc-yizkor | 6-14 | 0 | pass | Continuation panel. Blocks 9 and 12 straddle verse boundaries internally, so 5/6 was the only clean split near the midpoint. No Singular composition — new Companion button. |
| Kiddush (long) 2 | Master | left | bilingual | legacy-shabbat-evening | 10-14 | 0 | pass | Continuation of Kiddush (long): Ki vanu vacharta through the chatimah 'm'kadeish haShabbat'. No Singular composition — new Companion button. |
| Kol Nidre 2 | HHD | left | bilingual | crc-kol-nidre | 10-13,15-17 | 0 | pass | Second of three panels: end of the Kol Nidre paragraph plus V'nislach. Blocks 14 and 18 are source-en, so the skips are not gaps. No Singular composition — new Companion button. |
| Kol Nidre 3 | HHD | left | bilingual | crc-kol-nidre | 19-22,24 | 0 | pass | Third panel: S'lach na and Vayomeir Adonai; completes the unit's bilingual text. No Singular composition — new Companion button. |
| Sim Shalom 4 | HHD | left | bilingual | crc-rh-morning | 23-27 | 0 | pass | Continuation of Sim Shalom 3, all remaining bilingual blocks (28-31 are source-en). No Singular composition — new Companion button. |
| Mizmor L'David 2 | Special | left | bilingual | shabbat-maariv | 3 | 0 | pass | The one remaining bilingual block of Psalm 29, 'Adonai oz l'amo yiten'. No Singular composition — new Companion button. |
| Unetane Tokef 2 | HHD | left | bilingual | crc-yk-morning | 8-11 | 0 | pass | Continuation; all remaining bilingual blocks of the K'dushat Hayom unit. No Singular composition — new Companion button. |
| Festival Kiddsuh 2 | HHD | left | bilingual | crc-erev-rh | 9-17 | 0 | pass | Second half of the Yom HaZikaron kiddush. No Singular composition — new Companion button. |
| Od Yavo Shalom | Master | bottom | custom | — | — | 4 | pass | Migrated from the archive as custom text — no source in the corpus. Will not track siddur updates. |
| Refa Tziri 1 | Master | left | custom | — | — | 4 | pass | Migrated from the archive as custom text (transliteration plus Hebrew, compact). No source in the corpus. |
| Refa Tziri 2 | Master | left | custom | — | — | 4 | pass | Migrated from the archive as custom text (transliteration plus Hebrew, compact). No source in the corpus. |
| Jim Mi Sheb | Master | left | custom | — | — | 3 | pass | Migrated from the archive as custom text; the archive carried transliteration only. No source in the corpus. |
| Mazel Tov | Master | bottom | custom | — | — | 3 | pass | Migrated from the archive as custom text. No source in the corpus. |
| One Love | Master | left | custom | — | — | 2 | pass | Migrated from the archive as custom text; transliteration only. No source in the corpus. |
| Psalm-ish 1 | Master | left | custom | — | — | 2 | pass | Migrated from the archive as custom text; transliteration only. No source in the corpus. |
| Psalm-ish 2 | Master | left | custom | — | — | 2 | pass | Migrated from the archive as custom text (transliteration plus Hebrew). No source in the corpus. |
| L'chi Lach | Master | left | custom | — | — | 1 | pass | Migrated from the archive as custom text. The archived Hebrew field held stray Adon Olam text and was not used. |
| Ozi vzimrat | Master | bottom | custom | — | — | 1 | pass | Migrated from the archive as custom text rather than cut out of the middle of Psalm 118 block 4. |
| Havdalah Songs | Master | left | custom | — | — | 0 | pass | Migrated from the archive as custom text; CRC Havdalah units carry only the blessings. No Stream Deck button points at it. |
| Mourners Kaddish 3 *(live cue — corrective draft)* | Master | left | bilingual | legacy-shabbat-morning | 17-23 | 13 | pass | Was showing a sibling slice's text on air. Corrected draft at v2; **not yet published**. |
| Birchot Hashachar 3 *(live cue — corrective draft)* | Master | left | bilingual | legacy-shabbat-morning | 13-14,16-17 | 5 | pass | Was showing a sibling slice's text on air. Corrected draft at v2; **not yet published**. |
| Birchot Hashachar 4 *(live cue — corrective draft)* | Master | left | bilingual | legacy-shabbat-morning | 19-20,22-23 | 2 | pass | Was showing a sibling slice's text on air. Corrected draft at v2; **not yet published**. |
| Psukei DZimrah 2 *(live cue — corrective draft)* | Master | left | bilingual | legacy-shabbat-morning | Ashrei 0-1 + Kol Han'shamah 0-1 | 3 | pass | Was carrying Psalm 91 and Psalm 92 groups ahead of the Ashrei / Kol Han'shamah groups; those are now removed. Corrected draft at v2; **not yet published**. |
| Mi Chamocha (Sat 2) *(live cue — corrective draft)* | Master | left | bilingual | legacy-shabbat-morning | 7-12 | 6 | pass | Was showing Mi Chamocha (Sat 1)'s text on air. Now the continuation: Tzur Yisraeil through Shiru l'Adonai. Corrected draft at v2; **not yet published**. |
