# Fresh Companion preset for Michael: design

Status: design only, written 2026-09-23. Nothing is built or imported yet. Cue bindings are in
[CUE-MANIFEST.json](CUE-MANIFEST.json), device coverage is in [CAPABILITY-COVERAGE.md](CAPABILITY-COVERAGE.md),
and the decisions that belong to Daniel or Michael are in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
Evidence: the original export `ProductionDSKTP-2026-09-16-source.companionconfig` (Companion 5.0.3, 99 pages,
two Stream Deck XL surfaces, 8×4 grid; read through a script that drops every connection `config`) and the
live catalog (MCP `list_drafts`: 236 non-archived drafts, every one with a published revision; plus
`list_archived_drafts`, 43 drafts).

## Goals
1. Follow the service in order. Each page is one stretch of a service. Columns read left to right in
   liturgical order. Continuation panels stack down the column, and an invitation (Names) sits at the top.
2. Keep the controls in fixed places. Columns c0, c6 and c7 are the same on every service page, so the
   camera, recovery and navigation controls never move.
3. Show one complete, labeled sequence per piece. Long pieces are left-panel sequences driven by
   ordered buttons. Short pieces are 1–2 lower thirds. Short selections such as "Shiru (opening only)"
   are deliberate extra buttons and never duplicate a sequence start.
4. Keep every working device capability: PTZ presets, vMix, X32, Reaper, VLC, triggers and the
   camera-plus-graphic gesture. Positions are not carried over. A device page is carried over as a whole
   only where its grid is itself the capability (preset maps with save and recall buttons in matching cells).
5. Keep colour meaning consistent: colour shows a button's role, and the label shows the piece.

## Fixed columns on every service page (pages 3–26)
| Row | c0 · Switcher | c6 · Output recovery | c7 · Navigation |
|---|---|---|---|
| r0 | **Center cam 1**: vMix `merge input=center cam 1&duration=1000` | **Animate out**: `animate_clear` | **◂ Prev**: `set_page` to the previous page of this service (from the first page: Home) |
| r1 | **Left cam 2**: `merge input=left cam 2&duration=1000` | **Clear now**: `clear_now` | **Home**: `set_page 1`; the label shows `$(this:page_name)` |
| r2 | **Right cam 3**: `merge input=right cam 3&duration=1000` | **Logo**: `logo_toggle`, with `logo_enabled` feedback | **Next ▸**: `set_page` to the next page of this service (from the last page: Home) |
| r3 | **Merge**: `merge preview=&duration=1000` (Michael's r3c6 Merge) | **Be Right Back**: `toggle_cue` 8e486f11 | **Bimah Mute**: X32 `mute_channel_send` /ch/26 and /ch/27 → `11/on` toggle, with the /ch/26 feedback |

Prev and Next are explicit `set_page` chains, not `pageup`/`pagedown`. A service never runs into the next
service or onto a blank page. The chains are Fri 4→9, Sat 10→16, B'nai Mitzvah 17→18 and HHD 19→25.
The single pages (Anytime 3, Memorial 26) have no Prev or Next. Home (1) and Output & Audio (2) keep c6
and c7 but have no camera column.

## Cue buttons and the camera gesture
- **Standard cue button**: one step, `toggle_cue {cue}`. The first press animates the cue in. A second
  press animates it out, but only if it is still the requested cue. The feedbacks are `requested` (amber
  #b46e00), `rendered` (red #ff0000, on air) and `disconnected` (#aa0000). The module decides in or out,
  so a clear from elsewhere cannot knock the button out of step.
- **Sequence**: one ordered button per panel, down the column (Michael's H2). A long piece that fills
  its column continues into the next column. The only one is L'cha Dodi on Fri 2 (c3→c4→c5, with the
  verse number and incipit on every button). `next_panel`/`previous_panel` are not used. They only work for
  cues named `<title> — NN of MM`, and most sequences here are not named that way (see OPEN-QUESTIONS Q5).
- **Camera gesture** (Michael's H8, copied verbatim from original pages 76–78, Friday pages only): a
  two-step button.
  - Step 1 runs `show_cue` → `recallPset` on that camera's preset → `wait 1300` → vMix
    `merge input=<cam>&duration=1000`.
  - Step 2 runs `animate_out {cue}`, and for a single or the last panel of a sequence it then returns the
    camera: `Center recallPset 1` → `wait 1300` → `merge input=center cam 1&duration=1000`.
  - Middle panels carry no camera actions. Hareini, Mah Tovu and Candle Blessing return with the merge
    only, with no Center preset, exactly as the original did.
  - These buttons keep the `bank_current_step` feedback so the operator can see which step is next.
  - There are 20 such bindings, listed with their presets in CUE-MANIFEST `cameraGesture`.

## Colour legend (role, never piece)
| Tag | Role | Background |
|---|---|---|
| T | Sequence panel (left-panel or 2-part lower-third series) | teal #006699 |
| B | Single graphic, and short selections (`·short` in the label) | burgundy #990033 |
| N | Announcement, names, readers, furniture (Starting Soon, Thank You, BRB) | navy #000066 |
| ·alt | Alternative version of the same slot. It keeps its role colour (no invented alternate colour); the label names the version | as its role |
| ·cam | Camera gesture attached (see above) | as its role |
| C / M | Camera merge (with vMix `inputLive` tally feedback) / Merge PVW→PGM | blue #003399 / orange #cc6500 |
| O / X / L | Animate out / Clear now / Logo | black #000000 / dark red #780000 / charcoal #242424 |
| K / J | Navigation / jump to another page | black #000000, white text |
| P | Bimah Mute | purple #660066 |
| D | Device or utility action (stream, audio, reaper) | keeps the original device colour (for example bimah ± green #009900) |

Red (#ff0000) now means one thing only: the button's own graphic is on air. It also marks the stream
buttons on Home, which were red in the original.

## Page map
| # | Page | Purpose |
|---|---|---|
| 1 | Home | Service chooser, device hubs, stream start/stop, quick people graphics |
| 2 | Output & Audio | Logo on/off, catalog refresh, all bimah/booth audio controls, X32 scenes |
| 3 | Anytime | Graphics that can come up in any service |
| 4–9 | Fri 1–6 | Friday evening: candles and Shalom Aleichem → Kabbalat Shabbat and L'cha Dodi → Bar'chu and Sh'ma → Mi Chamocha to the Amidah → healing, Aleinu, Kaddish → Kiddush and closing |
| 10–16 | Sat 1–7 | Shabbat morning: blessings → Bar'chu and Yotzer → Sh'ma to Avot → Amidah → Torah and Haftarah → healing, Aleinu, Kaddish → Kiddush and closing |
| 17 | B'nai Mitzvah | Names and honours. The service itself runs on Sat 1–7 (jumps in c5) |
| 18 | Havdalah | Saturday-evening B'nai Mitzvah and Havdalah |
| 19–25 | HHD 1–7 | High Holy Days by liturgical section: beginning → Sh'ma → Amidah I → Amidah II and confession → Torah and Shofar → Kol Nidre, Slichot and Neilah pieces → closing |
| 26 | Memorial | Yizkor, funerals, Tisha B'Av |
| 29 | Devices | Index of every carried device page |
| 30 | Cameras | Camera hub: F-keys, direct merges, preroll, jumps to the camera pages |
| 31–56 | Device pages | Carried camera, AV and audio pages (table below) |

Pages 27–28 are left empty for growth. Both surfaces start on page 1, as they do now.

## Per-page grids (service and utility pages)
Cells read `label [tag]`. `·` means empty (deliberately free). The full cue ID, revision and sequence for
every cue cell are in CUE-MANIFEST.json under the same `page`/`cell`.

#### 1 · Home
Service chooser, stream start/stop, quick people graphics.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Friday ▸ [J→4] | Holy Days ▸ [J→19] | Cameras ▸ [J→30] | No-prod Start Stream [D] | Security Cam [D] | Guest Speaker [N] | Animate out [O] | · |
| r1 | Shabbat AM ▸ [J→10] | Kol Nidre · Neilah ▸ [J→24] | Devices ▸ [J→29] | No-prod End Stream [D] | Booth Mic Mute [D] | Starting Soon [N] | Clear now [X] | Home · page name [K] |
| r2 | B'nai Mitzvah ▸ [J→17] | Memorial ▸ [J→26] | AV / Stream ▸ [J→52] | Start HHD Stream [D] | Refresh catalog [D] | Announcements [N] | Logo on/off [L] | · |
| r3 | Havdalah ▸ [J→18] | Anytime ▸ [J→3] | Output & Audio ▸ [J→2] | Music Rec [D] | · | Thank You [N] | Be Right Back [N] | Bimah Mute [P] |

#### 2 · Output & Audio
Every output recovery and audio control in one place.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Logo ON [D] | Starting Soon [N] | Bimah +5 (stream) [D] | ARD audio preset [D] | Media Player ▸ [J→55] | · | Animate out [O] | · |
| r1 | Logo OFF [D] | Welcome [N] | Bimah −8 (stream) [D] | Computer audio preset [D] | Audio presets ▸ [J→56] | · | Clear now [X] | Home · page name [K] |
| r2 | Refresh catalog [D] | Announcements [N] | Mute bimahs (stream) [D] | Close audio [D] | vMix Bus X audio on [D] | · | Logo on/off [L] | · |
| r3 | · | Thank You [N] | Booth Mic Mute [D] | Bimah mute (old ch01) [D] | · | · | Be Right Back [N] | Bimah Mute [P] |

#### 3 · Anytime
Graphics that can come up in any service.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Starting Soon [N] | Guest name [N] | Shehechiyanu [B] | Torah Sh’ma [B] | Kaddish Names [N] | Animate out [O] | · |
| r1 | Left cam 2 [C] | Welcome [N] | Student name [N] | L'chi Lach [B] | Before Torah [B] | Kaddish 1/2 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Announcements [N] | Student names (2) [N] | Priestly Blessing [B] | After Torah [B] | Kaddish 2/2 [T] | Logo on/off [L] | · |
| r3 | Merge PVW→PGM [M] | Thank You [N] | Mazel Tov [N] | May the Memory [B] | Healing Names [N] | Oseh Shalom [B] | Be Right Back [N] | Bimah Mute [P] |

#### 4 · Fri 1
Welcome, candles, opening song, Shalom Aleichem. Prev → Home, Next → 5.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Starting Soon [N] | Hareini [B·cam] | Sh. Aleichem 1 shalom [T·cam] | Sh. Aleichem vv. 1+4 [B·alt] | Yom Zeh 1/3 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Welcome [N] | Mah Tovu [B·alt·cam] | 2 bo’achem [T] | Sh. Aleichem (short) [B·short] | Yom Zeh 2/3 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Light These Lights [B] | Hinei Ma Tov [B·alt] | 3 barchuni [T] | Yedid Nefesh [B] | Yom Zeh 3/3 [T] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Candle Blessing [B·cam] | House of Prayer [B·alt] | 4 tzeitchem [T·cam] | Ozi v'Zimrat [B] | Awaken, Arise [B] | Be Right Back [N] | Bimah Mute [P] |

#### 5 · Fri 2
Kabbalat Shabbat psalms and the complete L'cha Dodi. Prev → 4, Next → 6.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Shiru 1/3 [T] | Mizmor L'David 1/2 [T] | L'cha Dodi 1 Shamor [T·cam] | 5 Hitoreri [T] | 9 Boi v'shalom [T·cam] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Shiru 2/3 [T] | Mizmor 2/2 [T] | 2 Likrat [T] | 6 Lo Tevoshi · Shirei [T] | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Shiru 3/3 [T] | Ana Bakoach [B] | 3 Mikdash · Shirei [T] | 7 V'hayu · Shirei [T] | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Shiru (opening only) [B·short] | · | 4 Hitna'ari · Shirei [T] | 8 Yamin · Shirei [T] | · | Be Right Back [N] | Bimah Mute [P] |

#### 6 · Fri 3
Bar'chu, Ma'ariv Aravim, Ahavat Olam, Sh'ma, V'ahavta. Prev → 5, Next → 7.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Bar'chu [B·cam] | Ma'ariv Aravim 1/2 [T] | Ahavat Olam 1/2 [T] | Sh'ma [B·cam] | V'ahavta 1/2 [T·cam] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | As We Bless [B·alt] | Ma’ariv 2/2 [T] | Ahavat Olam 2/2 [T] | How Awesome / Sh’ma [B·alt] | V'ahavta 2/2 [T·cam] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Am I Awake [B·alt] | Ma'ariv (Evening) [B·alt] | We Are Loved 1/2 [T·alt] | One Love [B·alt] | Thou Shalt Love 1/2 [T·alt] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | · | Ma'ariv (Roll into Dark) [B·alt] | We Are Loved 2/2 [T·alt] | · | Thou Shalt Love 2/2 [T·alt] | Be Right Back [N] | Bimah Mute [P] |

#### 7 · Fri 4
Mi Chamocha, Hashkiveinu, V’shamru, Hatzi Kaddish, Amidah. Prev → 6, Next → 8.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Mi Chamocha 1/2 [T·cam] | Hashkiveinu [B·cam] | V'shamru [B·cam] | Adonai S'fatai [B·cam] | Shalom Rav [B·cam] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Mi Chamocha 2/2 [T] | Hashki · Randy [B·alt] | Hatzi Kaddish 1/2 [T] | Sanctuary [B·alt] | Oseh Shalom [B·cam] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Siyahamba [B·alt·cam] | Hashki · Daniel [B·alt] | Hatzi Kaddish 2/2 [T] | Avodah [B] | Silent Prayer [B·cam] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Mi Chamocha (short) [B·short] | Hashki · Jim [B·alt] | · | Hoda'ah [B] | Od Yavo Shalom [B] | Be Right Back [N] | Bimah Mute [P] |

#### 8 · Fri 5
Healing, Aleinu, Mourner’s Kaddish, Adon Olam. Prev → 7, Next → 9.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Healing Names [N] | R'fa Tziri 1/2 [T] | Aleinu 1/4 [T] | Kaddish Names [N] | Adon Olam 1/3 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Mi Sheberach [B·cam] | R'fa Tziri 2/2 [T] | Aleinu 2/4 [T] | Kaddish 1/2 [T] | Adon Olam 2/3 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Mi Sheb · Jim [B·alt] | Olam Chesed Yibaneh [B] | Aleinu 3/4 [T] | Kaddish 2/2 [T] | Adon Olam 3/3 [T] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | El Na R'fa Na [B] | · | Aleinu 4/4 [T] | · | Priestly Blessing [B] | Be Right Back [N] | Bimah Mute [P] |

#### 9 · Fri 6
Kiddush, Motzi, announcements, thank you. Prev → 8, Next → Home.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Kiddush 1/2 [T] | Kiddush Shirei 1/2 [T·alt] | Motzi [B] | Announcements [N] | · | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Kiddush 2/2 [T] | Kiddush Shirei 2/2 [T·alt] | Shehechiyanu [B] | Thank You [N] | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Kiddush (short) [B·short] | · | Mazel Tov [N] | · | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Wine blessing [B·short] | · | · | · | · | Be Right Back [N] | Bimah Mute [P] |

#### 10 · Sat 1
Arrival, morning blessings, P’sukei d’Zimrah. Prev → Home, Next → 11.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Starting Soon [N] | Mah Tovu [B] | Birchot 1/4 [T] | P'sukei 1/2 [T] | Hal'lu Yah (Ps 150) [B] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Tallit Blessing [B] | Hinei Ma Tov [B·alt] | Birchot 2/4 [T] | P'sukei 2/2 [T] | Psalm-ish 1/2 [T·alt] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Modeh Ani [B] | Hareini [B·alt] | Birchot 3/4 [T] | Hodu [B] | Psalm-ish 2/2 [T·alt] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Elohai N'shama [B] | Esa Einai [B·alt] | Birchot 4/4 [T] | Lev Tahor [B] | Kol Han'shamah [B] | Be Right Back [N] | Bimah Mute [P] |

#### 11 · Sat 2
Hatzi Kaddish, Bar'chu, Yotzeir Or, Ahavah Rabbah. Prev → 10, Next → 12.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Hatzi Kaddish 1/2 [T] | Bar'chu [B] | Yotzeir Or 1/2 [T] | Yotzer Interp 1/2 [T·alt] | Ahavah Rabbah (partial) [B] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Hatzi Kaddish 2/2 [T] | As We Bless [B·alt] | Yotzeir Or 2/2 [T] | Yotzer Interp 2/2 [T·alt] | Ahavah Rabah (short) [B·short] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | · | Am I Awake [B·alt] | Yotzeir Or (short) [B·short] | · | We Are Loved 1/2 [T·alt] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | · | · | · | · | We Are Loved 2/2 [T·alt] | Be Right Back [N] | Bimah Mute [P] |

#### 12 · Sat 3
Sh'ma, V'ahavta, Mi Chamocha, Adonai S'fatai, Avot. Prev → 11, Next → 13.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Sh'ma [B] | V'ahavta 1/2 [T] | Mi Chamocha 1/2 [T] | Adonai S'fatai [B] | Avot 1/2 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | How Awesome / Sh’ma [B·alt] | V'ahavta 2/2 [T] | Mi Chamocha 2/2 [T] | Sanctuary [B·alt] | Avot 2/2 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | One Love [B·alt] | Thou Shalt Love 1/2 [T·alt] | Mi Chamocha (short) [B·short] | · | Avot Interp 1/2 [T·alt] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | · | Thou Shalt Love 2/2 [T·alt] | Siyahamba [B·alt] | · | Avot Interp 2/2 [T·alt] | Be Right Back [N] | Bimah Mute [P] |

#### 13 · Sat 4
G'vurot, K'dushah, Amidah blessings, Sim Shalom. Prev → 12, Next → 14.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | G'vurot 1/2 [T] | K'dushah 1/3 [T] | V'shamru [B] | Sim Shalom [B] | Olam Chesed Yibaneh [B] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | G'vurot 2/2 [T] | K'dushah 2/3 [T] | Avodah [B] | Oseh Shalom [B] | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | G'vurot Interp [B·alt] | K'dushah 3/3 [T] | Modim Anachnu Lach [B] | Silent Prayer [B] | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | · | · | Hoda'ah [B] | Od Yavo Shalom [B] | · | Be Right Back [N] | Bimah Mute [P] |

#### 14 · Sat 5
Torah service, readers, Haftarah. Prev → 13, Next → 15.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Taking out · Sh’ma [B] | Torah reader 1 [N] | Torah reader 5 [N] | Before Haftarah [B] | Haftarah reader 1 [N] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Passing the Torah [N] | Torah reader 2 [N] | Torah reader 6 [N] | After Haftarah 1/3 [T] | Haftarah reader 2 [N] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Before Torah [B] | Torah reader 3 [N] | Torah reader 7 [N] | After Haftarah 2/3 [T] | Haftarah reader 3 [N] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | After Torah [B] | Torah reader 4 [N] | Hagbahah [B] | After Haftarah 3/3 [T] | Eitz Chayim [B] | Be Right Back [N] | Bimah Mute [P] |

#### 15 · Sat 6
Healing, Aleinu, Mourner’s Kaddish, Adon Olam. Prev → 14, Next → 16.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Healing Names [N] | R'fa Tziri 1/2 [T] | Aleinu 1/4 [T] | Kaddish Names [N] | Adon Olam 1/3 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Mi Sheberach [B] | R'fa Tziri 2/2 [T] | Aleinu 2/4 [T] | Kaddish 1/2 [T] | Adon Olam 2/3 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Mi Sheb · Jim [B·alt] | · | Aleinu 3/4 [T] | Kaddish 2/2 [T] | Adon Olam 3/3 [T] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | El Na R'fa Na [B] | · | Aleinu 4/4 [T] | · | Priestly Blessing [B] | Be Right Back [N] | Bimah Mute [P] |

#### 16 · Sat 7
Kiddush, Motzi, celebration, closing. Prev → 15, Next → Home.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Kiddush (short) [B·short] | Motzi [B] | Announcements [N] | · | · | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Sat Kiddush 1/3 [T·alt] | Shehechiyanu [B] | Thank You [N] | · | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Sat Kiddush 2/3 [T·alt] | Mazel Tov [N] | Guest name [N] | · | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Sat Kiddush 3/3 [T·alt] | · | · | · | · | Be Right Back [N] | Bimah Mute [P] |

#### 17 · B'nai Mitzvah
Names and Torah honours; the service itself runs on Sat 1–7. Prev → Home, Next → 18.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Student name [N] | Passing the Torah [N] | · | · | Sat 1 ▸ [J→10] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Student names (2) [N] | Tallit Blessing [B] | · | · | Sat Torah ▸ [J→14] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Guest name [N] | Shehechiyanu [B] | · | · | Sat closing ▸ [J→15] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Mazel Tov [N] | Priestly Blessing [B] | · | · | Havdalah ▸ [J→18] | Be Right Back [N] | Bimah Mute [P] |

#### 18 · Havdalah
Saturday-evening B'nai Mitzvah and Havdalah. Prev → 17, Next → Home.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Ma'ariv Aravim 1/2 [T] | Havdalah 1/4 Wine [T] | Eliyahu Hanavi [B] | Student name [N] | · | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Ma’ariv 2/2 [T] | Havdalah 2/4 Spices [T] | Miryam Han'viah [B] | Student names (2) [N] | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Ma'ariv (Evening) [B·alt] | Havdalah 3/4 Fire [T] | Shavua Tov [B] | Priestly Blessing [B] | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Ma'ariv (Roll into Dark) [B·alt] | Havdalah 4/4 Separation [T] | Havdalah songs [B·alt] | Thank You [N] | · | Be Right Back [N] | Bimah Mute [P] |

#### 19 · HHD 1
Arrival, candles, morning blessings. Prev → Home, Next → 20.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Starting Soon [N] | Light These Lights [B] | Modeh Ani [B] | Birchot 1/4 [T] | P'sukei 1/2 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Candles · Rosh Hashanah [B] | Shehechiyanu [B] | Mah Tovu [B] | Birchot 2/4 [T] | P'sukei 2/2 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Candles · Yom Tov [B·alt] | Esa Einai [B] | Hinei Ma Tov [B·alt] | Birchot 3/4 [T] | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Candles · Yom Kippur [B·alt] | Sacred Assembly [B] | Elohai N'shama [B] | Birchot 4/4 [T] | · | Be Right Back [N] | Bimah Mute [P] |

#### 20 · HHD 2
Hallelu, Hatzi Kaddish, Bar'chu, Sh'ma, V'ahavta, Mi Chamocha. Prev → 19, Next → 21.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Hallelu 1/3 [T] | Hatzi Kaddish 1/2 [T] | Ahavah Rabbah (partial) [B] | V'ahavta 1/2 [T] | Mi Cham. eve 1/2 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Hallelu 2/3 [T] | Hatzi Kaddish 2/2 [T] | Sh'ma [B] | V'ahavta 2/2 [T] | Mi Cham. eve 2/2 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Hallelu 3/3 [T] | Bar'chu [B] | How Awesome / Sh’ma [B·alt] | Thou Shalt Love 1/2 [T·alt] | Mi Cham. morn 1/2 [T·alt] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | · | As We Bless [B·alt] | · | Thou Shalt Love 2/2 [T·alt] | Mi Cham. morn 2/2 [T·alt] | Be Right Back [N] | Bimah Mute [P] |

#### 21 · HHD 3
Hashkiveinu, Avot, G'vurot, Un'taneh Tokef, K'dushah. Prev → 20, Next → 22.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Hashkiveinu 1/2 [T] | Avot 1/2 [T] | G'vurot 1/2 [T] | Un'taneh Eng 1/2 [T·alt] | K'dushah 1/3 [T] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Hashkiveinu 2/2 [T] | Avot 2/2 [T] | G'vurot 2/2 [T] | Un'taneh Eng 2/2 [T·alt] | K'dushah 2/3 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Adonai S'fatai [B] | Zochreinu [B] | Un'taneh Tokef 1/2 [T] | B'rosh Hashanah 1/2 [T] | K'dushah 3/3 [T] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | · | Remember Us [B·alt] | Un'taneh Tokef 2/2 [T] | T’shuvah 2/2 [T] | Avodah [B] | Be Right Back [N] | Bimah Mute [P] |

#### 22 · HHD 4
Sim Shalom, peace, Hayom, confession, Avinu Malkeinu. Prev → 21, Next → 23.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Sim Shalom 1/4 [T] | Shalom Rav [B] | Silent Prayer [B] | Vidui [B] | 13 Attributes [B] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Sim Shalom 2/4 [T] | B'sefer Chayim [B] | Yih'yu [B] | Al Cheit (refrain) [B] | Avinu Malkeinu 1/2 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Sim Shalom 3/4 [T] | Hoda'ah [B] | Hayom 1/2 [T] | Ashamnu [B] | Avinu Malkeinu 2/2 [T] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Sim Shalom 4/4 [T] | Oseh Shalom [B] | Hayom 2/2 [T] | V'al Kulam [B] | Avinu Malkeinu (short) [B·short] | Be Right Back [N] | Bimah Mute [P] |

#### 23 · HHD 5
Torah, Haftarah, Shofar, healing. Prev → 22, Next → 24.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Taking out · Sh’ma [B] | Before Haftarah [B] | Shofar Blessing [B] | Healing Names [N] | · | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Before Torah [B] | After Haftarah 1/3 [T] | Zichronot [B] | El Na R'fa Na [B] | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | After Torah [B] | After Haftarah 2/3 [T] | Shofarot [B] | Concluding T'filah [B] | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Mi Sheberach [B] | After Haftarah 3/3 [T] | Eitz Chayim [B] | Guest name [N] | · | Be Right Back [N] | Bimah Mute [P] |

#### 24 · HHD 6
Kol Nidre, Slichot and Neilah pieces. Prev → 23, Next → 25.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Kol Nidre 1/3 [T] | Return Again [B] | · | · | · | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | Kol Nidre 2/3 [T] | Pitchu Li [B] | · | · | · | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Kol Nidre 3/3 [T] | Miryam Han'viah [B] | · | · | · | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | Hashiveinu [B] | Olam Chesed Yibaneh [B] | · | · | · | Be Right Back [N] | Bimah Mute [P] |

#### 25 · HHD 7
Aleinu, Kaddish, Kiddush, closing. Prev → 24, Next → Home.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | HHD Aleinu 1/2 [T] | Aleinu 1/4 [T·alt] | Kaddish Names [N] | Festival Kiddush 1/2 [T] | Announcements [N] | Animate out [O] | ◂ Prev [K] |
| r1 | Left cam 2 [C] | HHD Aleinu 2/2 [T] | Aleinu 2/4 [T·alt] | Kaddish 1/2 [T] | Festival Kiddush 2/2 [T] | Priestly Blessing [B] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | May the Memory [B] | Aleinu 3/4 [T·alt] | Kaddish 2/2 [T] | Kiddush (short) [B·short] | Thank You [N] | Logo on/off [L] | Next ▸ [K] |
| r3 | Merge PVW→PGM [M] | V'imru Amen [B] | Aleinu 4/4 [T·alt] | Oseh Shalom [B] | Motzi [B] | Havdalah ▸ [J→18] | Be Right Back [N] | Bimah Mute [P] |

#### 26 · Memorial
Yizkor, funerals, Tisha B’Av.

| | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 |
|---|---|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | Starting Soon [N] | El Malei 1/2 [T] | Remember Them 1 [N] | Kaddish 1/2 [T] | Adon Olam 1/3 [T] | Animate out [O] | · |
| r1 | Left cam 2 [C] | Esa Einai [B] | El Malei 2/2 [T] | Remember Them 2 [N] | Kaddish 2/2 [T] | Adon Olam 2/3 [T] | Clear now [X] | Home · page name [K] |
| r2 | Right cam 3 [C] | Psalm 23 1/2 [T] | May the Memory [B] | Remember Them 3 [N] | V'imru Amen [B] | Adon Olam 3/3 [T] | Logo on/off [L] | · |
| r3 | Merge PVW→PGM [M] | Psalm 23 2/2 [T] | Mi Sheberach [B] | Kaddish Names [N] | Oseh Shalom [B] | Thank You [N] | Be Right Back [N] | Bimah Mute [P] |

#### 29 · Devices (index)
Jumps only (`set_page`). c6 and c7 are as on Home.

| | c0 | c1 | c2 | c3 | c4 | c5 |
|---|---|---|---|---|---|---|
| r0 | Cams · Morning ▸31 | Cams · B'nai Mitzvah save ▸35 | Cam · Center ▸39 | Cam · Dorothy spin ▸43 | Cams · Rainbow ▸47 | PTZ pad · Left ▸51 |
| r1 | Cams · Evening ▸32 | Cams · Candles save ▸36 | Cam · Right (Door) ▸40 | Cams · Oneg ▸44 | Cams · Rainbow 2 ▸48 | AV / Stream ▸52 |
| r2 | Cams · Torah ▸33 | Cams · Funeral ▸37 | Cam · Bimah (Black) ▸41 | Cams · Right Oneg ▸45 | Adv Cam Control ▸49 | Startup tools ▸53 |
| r3 | Cams · B'nai Mitzvah ▸34 | Cam · Left ▸38 | Cam · Dorothy ▸42 | Cams · Shir Shabbat ▸46 | PTZ pad · Right ▸50 | Self-production ▸54 |

Media Player (55) and Audio presets (56) are on page 2 (c4).

#### 30 · Cameras (hub)
| | c0 | c1 | c2 | c3 | c4 | c5 |
|---|---|---|---|---|---|---|
| r0 | Center cam 1 [C] | F1: preview input 2 + second deck → Cam · Left | F5: preview 5 + second deck → Cam · Dorothy | Start PreRoll (preview 17 → merge) | Cams · Morning ▸31 | Cam · Left ▸38 |
| r1 | Left cam 2 [C] | F2: preview 1 + second deck → Cam · Center | F6: preview 8 | End PreRoll (preview 3, Door #5, merge, preview 1) | Cams · Evening ▸32 | Cam · Center ▸39 |
| r2 | Right cam 3 [C] | F3: preview 3 + second deck → Cam · Right | Right cam 3, no overlay (merge + Door #5) | Merge dinner (Seder) | Cams · Torah ▸33 | Cam · Right ▸40 |
| r3 | Merge [M] | F4: preview 4 + second deck → Cam · Bimah | Security Cam (all four presets + merge) | Merge bima cam 4 + Bus X audio on | Cams · B'nai Mitzvah ▸34 | Devices ▸29 |

The F-keys keep the original two-deck move. Each previews a vMix input and flips the *other* Stream Deck
to that camera's preset page (the original P72 F1–F6, with page numbers remapped to 38–42).

#### Carried device pages (31–56)
These pages keep their original grids, because the save and recall cells of each preset map are paired
by position and Michael's hands know them. Changes on every carried page:
- Page names are corrected ("space" → Candles save, "PAGE" → Startup tools).
- r1c7 is Home, and r0c7/r2c7 are explicit `set_page` to the neighbouring device page.
- Internal references are remapped: every `set_page` and every `button_pressrelease` location
  (for example `99/2/1` → `52/2/1`, `93/1/0` → `35/1/0`).
- Every Singular action is replaced as listed in CAPABILITY-COVERAGE.
- The r3c7 camera-page PANIC keys stay exactly where they are.

| New | Name | Original | New | Name | Original |
|---|---|---|---|---|---|
| 31 | Cams · Morning | 96 | 44 | Cams · Oneg | 85 |
| 32 | Cams · Evening | 98 | 45 | Cams · Right Oneg | 82 |
| 33 | Cams · Torah | 95 | 46 | Cams · Shir Shabbat | 84 |
| 34 | Cams · B'nai Mitzvah | 94 | 47 | Cams · Rainbow | 81 |
| 35 | Cams · B'nai Mitzvah save | 93 | 48 | Cams · Rainbow 2 | 80 |
| 36 | Cams · Candles save | 97 | 49 | Adv Cam Control | 87 |
| 37 | Cams · Funeral | 18 | 50 | PTZ pad · Right (Door) | 43 |
| 38 | Cam · Left | 92 | 51 | PTZ pad · Left | 44 |
| 39 | Cam · Center | 91 | 52 | AV / Stream | 99 |
| 40 | Cam · Right (Door) | 90 | 53 | Startup tools | 79 |
| 41 | Cam · Bimah (Black) | 89 | 54 | Self-production | 75 |
| 42 | Cam · Dorothy | 88 | 55 | Media Player (VLC) | 83 |
| 43 | Cam · Dorothy spin | 86 | 56 | Audio presets | 20 |

The six camera-loop triggers (Center/Left/Right/Bimah/Dorothy long/short) and the six custom variables
are carried unchanged. They drive vMix `keyPress` only.

## Navigation flow
- Home → service start page (Friday 4, Shabbat 10, B'nai Mitzvah 17, Havdalah 18, Holy Days 19,
  Kol Nidre/Neilah 24, Memorial 26, Anytime 3) → Next ▸ through the service → Home after the last page.
  Home is one press away from anywhere, on r1c7.
- On a B'nai Mitzvah Saturday, the operator runs Sat 1–7 and uses page 17 for names. Its c5 jumps go straight to Sat 1, Sat Torah,
  Sat closing and Havdalah.
- HHD 7 has a Havdalah ▸ jump for the end of Neilah.
- Cameras: Home → Cameras (30) → a camera page. The F-keys can put a camera page on the second deck
  while the first deck stays on the service.

## What changed from the original, and why
| Original | New | Why |
|---|---|---|
| 99 pages, 25 empty "PAGE", 5 "space", separate duplicate pages for B'nai Mitzvah (12–16) and per-service HHD pages (25–41) | 26 service and utility pages plus 26 device pages | Shabbat morning is one progression. B'nai Mitzvah reuses it with a names page. HHD follows Michael's newer section pages 45–50 instead of 17 per-service pages (Q2) |
| `pageup`/`pagedown` ran into other services and empty pages | Explicit Prev/Next chains per service | Predictable next and previous |
| Camera merges only on the Friday camera pages 76–78; Merge at r3c6 | Camera column c0 plus Merge on every service page | The switcher is always reachable, and the camera stays one gesture on Friday |
| No clear or logo recovery on most pages; logo only on Home, HHD and a few others | c6: Animate out / Clear now / Logo / BRB on every page | Recovery from any page |
| Colours drifted: burgundy, teal and navy used for the same kinds of piece | Colour = role only | Consistent meaning |
| Mislabels such as "B'rosh 1/2" (really Un'taneh Tokef English) and "Kaddish 3" (a third copy) | Labels show the published title, the incipit and the part number | Labels that stay readable and correct |
| Aleinu 2 on orig p11 (Shab Morn 5) auto-advanced on timers (32.5 s, 42.25 s) | Four ordered Aleinu buttons | Daniel: no timed auto-advance |
| Two-step Singular buttons everywhere (step desync after a clear) | One-step `toggle_cue`; two steps only where a camera gesture needs them | The module state decides in or out |
| Singular Master/Special/HHD compositions | CRC Overlays module cues | Legacy overlays are retired |
| Shiru 1/2 (overlapping), MK 1/2/3, L'cha Dodi CRC 4 only | Shiru complete 1–3 + opening; MK 1/2 plain; L'cha Dodi 1–9 in liturgical order with the Shirei verses marked | STATE decisions |
