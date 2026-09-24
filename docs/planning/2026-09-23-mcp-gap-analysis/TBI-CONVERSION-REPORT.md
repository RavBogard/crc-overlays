# TBI deck conversion report: Simone's Stream Deck, Singular.live to TBI Overlays

For Daniel and Simone. Generated 2026-09-24 by `node scripts/convert-companion-singular.mjs --tbi-report`, the same conversion the `convert_singular_deck` tool runs. Nothing was published, nothing was bound on a stored deck, and nothing was sent anywhere.

**The deck.** Simone's Companion export of 14 September 2026 (TBIComputer-2026-09-14-1618-source.companionconfig, Companion 5.0.5+9736-stable-0293f0d1ee). It has 99 pages; 12 of them carry buttons (1–6 and 8 for Shabbat and occasions, 95–99 for the High Holy Days). Every page keeps Companion's own page up / page number / page down buttons in the left column. Her BirdDog camera buttons and her two OBS scene buttons are carried unchanged. Every graphic button keeps its page, position, label and colour. The Singular.live connections (kab, morn, singular__HHDs) are dropped and a TBI_Overlays connection is added. No connection settings or passwords from the export were kept.

**What the three words mean.** *Covered*: exactly one published TBI graphic clearly matches what the button shows today, so it can be bound. *Needs review*: a graphic may exist, but a person has to choose between candidates or settle a defect first. *Needs a graphic*: nothing published matches yet. Only Covered buttons are ever bound, and only when someone confirms them. A bound button gets the Requested and Rendered lights, so the deck shows what is on screen.

**Catalog matched against.** The repo holds no snapshot of today's published TBI catalog, so this ran against the best one available: TBI's published catalog as fetched on 15 September 2026 during the first conversion pass (211 published graphics; 8 archived ones left out), committed as tests/fixtures/tbi-catalog-2026-09-15.json (names and ids only). The TBI redo replaces those 15 September graphics, so read Covered here as "a graphic of this name exists", not as the final binding. Run `convert_singular_deck` again against the live catalog once the redo has published its graphics.

## Counts

| | Buttons | Distinct graphics fired |
|---|---:|---:|
| Covered | 192 | 176 |
| Needs review | 46 | 29 |
| Needs a graphic | 16 | 15 |
| **Total** | **254** | **220** |

Buttons are counted after defects: a button whose graphic matched but which has a defect is counted as Needs review. The graphics column counts each Singular composition once, by the name match alone.

Where a button sits: page, then row and column counted from the top-left button as row 1, column 1 (column 1 holds page up / page number / page down). The code in brackets is the same place as Companion writes it, page/row/column counted from 0: "3/0/5" is page 3, row 1, column 6.

## Defects on the deck (16 buttons)

These are carried over from the Singular deck. The conversion does not copy them: each of these buttons waits for a decision before it is bound.

| Where | Label | What is wrong |
|---|---|---|
| Page 3, row 1, column 6 (3/0/5) | NEED mi chamocha pt 2 | The first press shows "Sing the song 159" (kab) but the second press takes out "Twilight People 2" (kab), so the second press does not clear what the first showed. The label "NEED mi chamocha pt 2" is a working note, not a name for the graphic. |
| Page 3, row 3, column 6 (3/2/5) | 161 middle | The first press shows "Give us a place 161 middle" (kab) but the second press takes out "Sow in Tears" (kab), so the second press does not clear what the first showed. |
| Page 4, row 1, column 5 (4/0/4) | NEED 176 part 1 | The label "NEED 176 part 1" is a working note, not a name for the graphic. |
| Page 8, row 2, column 3 (8/1/2) | America the beautiful pt 1 | Page 8 has another button labelled "America the beautiful pt 1" (button 8/1/4) that fires a different graphic, so one of the two labels is wrong. |
| Page 8, row 2, column 5 (8/1/4) | America the beautiful pt 1 | Page 8 has another button labelled "America the beautiful pt 1" (button 8/1/2) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 1, column 5 (95/0/4) | Goodness of the world 1 | Page 95 has another button labelled "Goodness of the world 1" (button 95/1/4) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 2, column 3 (95/1/2) | Dwell on each 1 | Page 95 has another button labelled "Dwell on each 1" (button 95/2/2) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 2, column 5 (95/1/4) | Goodness of the world 1 | Page 95 has another button labelled "Goodness of the world 1" (button 95/0/4) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 3, column 3 (95/2/2) | Dwell on each 1 | Page 95 has another button labelled "Dwell on each 1" (button 95/1/2) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 4, column 6 (95/3/5) | V'ne-emar | The label "V'ne-emar" names V'ne'emar, but the button fires "Aleinu 2" (singular__HHDs). |
| Page 97, row 2, column 5 (97/1/4) | V'ahavta 1 | The first press shows "Veehavta 1" (singular__HHDs) but the second press takes out "Veehavta Translation 1" (singular__HHDs), so the second press does not clear what the first showed. |
| Page 97, row 3, column 8 (97/2/7) | Amidah 5 | Page 97 has another button labelled "Amidah 5" (button 97/3/7) that fires a different graphic, so one of the two labels is wrong. |
| Page 97, row 4, column 8 (97/3/7) | Amidah 5 | Page 97 has another button labelled "Amidah 5" (button 97/2/7) that fires a different graphic, so one of the two labels is wrong. |
| Page 98, row 3, column 5 (98/2/4) | Veneemar | The label "Veneemar" names V'ne'emar, but the button fires "Aleinu 3" (singular__HHDs). |
| Page 99, row 2, column 6 (99/1/5) | Chatzi Kaddish 1 | Page 99 has another button labelled "Chatzi Kaddish 1" (button 99/2/5) that fires a different graphic, so one of the two labels is wrong. |
| Page 99, row 3, column 6 (99/2/5) | Chatzi Kaddish 1 | Page 99 has another button labelled "Chatzi Kaddish 1" (button 99/1/5) that fires a different graphic, so one of the two labels is wrong. |

### Worth a look, not blocking (6 buttons)

| Where | Label | Note |
|---|---|---|
| Page 4, row 1, column 5 (4/0/4) | NEED 176 part 1 | It fires the same graphic as "176 part 2" (button 4/1/4) on page 4, under a different label. |
| Page 4, row 2, column 5 (4/1/4) | 176 part 2 | It fires the same graphic as "NEED 176 part 1" (button 4/0/4) on page 4, under a different label. |
| Page 95, row 2, column 6 (95/1/5) | Aleinu 2 | It fires the same graphic as "V'ne-emar" (button 95/3/5) on page 95, under a different label. |
| Page 95, row 4, column 6 (95/3/5) | V'ne-emar | It fires the same graphic as "Aleinu 2" (button 95/1/5) on page 95, under a different label. |
| Page 96, row 1, column 4 (96/0/3) | Carl | Page 96 has another "Carl" button (button 96/3/1) firing the same graphic. |
| Page 96, row 4, column 2 (96/3/1) | Carl | Page 96 has another "Carl" button (button 96/0/3) firing the same graphic. |

## Needs a graphic (16 buttons)

No published graphic matches what these buttons show today. Each needs a graphic made (or an existing one named to match) before the button can be bound. On the new deck they keep their label and colour but do nothing until then.

| Where | Label | Shows today (Singular) |
|---|---|---|
| Page 2, row 2, column 2 (2/1/1) | Heinei Ma Tov  | Hineih Mah Tov (kab) |
| Page 3, row 2, column 6 (3/1/5) | Page 161 Top | Let there be love pg 161 (kab) |
| Page 3, row 2, column 8 (3/1/7) | G'vurot 1 | Gevurot 1 Summer (kab) |
| Page 3, row 4, column 6 (3/3/5) | Haskiveinu Chatimah | Hashkiveinu chatimah (kab) |
| Page 3, row 4, column 8 (3/3/7) | Kedusha - Friday | Kedusha Friday Night (kab) |
| Page 4, row 2, column 6 (4/1/5) | Shalom Rav 2 | Shalom Rav 2 (kab) |
| Page 5, row 1, column 8 (5/0/7) | Ani v'Atah 2 | Ani v'atah pt 2 (kab) |
| Page 5, row 2, column 8 (5/1/7) | Ani v'Atah 1 | Ani v'Atah pt 1 (kab) |
| Page 8, row 4, column 8 (8/3/7) | Shecheyanu | Shecheyanu (kab) |
| Page 95, row 1, column 3 (95/0/2) | Blessings Shofar | Shofar Blessings (singular__HHDs) |
| Page 97, row 1, column 3 (97/0/2) | Ma Tovu 1 | Ma Tovu 1 (singular__HHDs) |
| Page 97, row 2, column 8 (97/1/7) | Amidah 4 | Avot 3 (singular__HHDs) |
| Page 97, row 3, column 3 (97/2/2) | Ma Tovu 3 | Ma Tovu 3 (singular__HHDs) |
| Page 97, row 3, column 5 (97/2/4) | V'ahavta 2 | Veehavta 2 w/o Lmaan (singular__HHDs) |
| Page 99, row 2, column 3 (99/1/2) | Shalom Aleichem 2 | Shalom Aleichem Friedman 2 (singular__HHDs) |
| Page 99, row 4, column 7 (99/3/6) | Amidah 4 | Avot 3 (singular__HHDs) |

## Needs review (46 buttons)

A graphic may exist for these, but a person has to choose it or settle a defect first.

| Where | Label | Shows today (Singular) | Why |
|---|---|---|---|
| Page 2, row 1, column 8 (2/0/7) | 148 pt 1 | Maariv Aravim translation | Several published graphics could be this one: "Maariv Aravim translation 2", "Maariv Aravim translation — 02 of 02", "Maariv Aravim translation — 01 of 02". Choose one. |
| Page 2, row 3, column 6 (2/2/5) | Shalom Aleichem 3 | Shalom Aleicheim 3 | Several published graphics could be this one: "Shalom Aleichem 3", "Shalom Aleichem 1". Choose one. |
| Page 2, row 4, column 6 (2/3/5) | Shalom Aleichem 4 | Shalom Aleicheim 4 Elul | Several published graphics could be this one: "Shalom Aleichem all", "Shalom Aleichem 3", "Shalom Aleichem 1". Choose one. |
| Page 2, row 4, column 7 (2/3/6) | Bar'chu | Barechu | Several published graphics could be this one: "Barechu", "Barechu". Choose one. |
| Page 3, row 1, column 2 (3/0/1) | Ahavat Olam | Ahavat Olam | Several published graphics could be this one: "Ahavat Olam Translation", "Ahavat Olam Translation 2", "Ahavat Olam 1", "Ahavat Olam 2". Choose one. |
| Page 3, row 1, column 6 (3/0/5) | NEED mi chamocha pt 2 | Sing the song 159 | Matched "Sing the song 159" by name, but defects need a decision first: The first press shows "Sing the song 159" (kab) but the second press takes out "Twilight People 2" (kab), so the second press does not clear what the first showed. The label "NEED mi chamocha pt 2" is a working note, not a name for the graphic. |
| Page 3, row 3, column 6 (3/2/5) | 161 middle | Give us a place 161 middle | Matched "Give us a place 161 middle" by name, but a defect needs a decision first: The first press shows "Give us a place 161 middle" (kab) but the second press takes out "Sow in Tears" (kab), so the second press does not clear what the first showed. |
| Page 3, row 4, column 5 (3/3/4) | Mi Chamocha  | Mi Chamocha / full | Several published graphics could be this one: "Mi Chamocha (Sat 1)", "Mi Chamocha eve 2", "Mi Chamocha (Friday) 1". Choose one. |
| Page 4, row 1, column 2 (4/0/1) | Page 172 pt 1 | Kedushat HaYom pg 172 pt 1 | Several published graphics could be this one: "Kedushat HaYom pg 172 pt 1 — 02 of 02", "Kedushat HaYom pg 172 pt 1 — 01 of 02", "Kedushat HaYom pg 172 pt 2". Choose one. |
| Page 4, row 1, column 5 (4/0/4) | NEED 176 part 1 | pg 176 pt 2 | Matched "pg 176 pt 2" by name, but a defect needs a decision first: The label "NEED 176 part 1" is a working note, not a name for the graphic. |
| Page 4, row 3, column 8 (4/2/7) | Oseh shalom | oseh shalom | Several published graphics could be this one: "Oseh Shalom", "Oseh Shalom". Choose one. |
| Page 4, row 4, column 3 (4/3/2) | 484  | Find Favor FESTIVAL 484 | Several published graphics could be this one: "Find Favor FESTIVAL 484 — 02 of 02", "Find Favor FESTIVAL 484 — 01 of 02", "Shofar Service Reading pt 1.2.1", "Aleinu 3". Choose one. |
| Page 4, row 4, column 5 (4/3/4) | Pg 177 middle | When we behold pg 177 middle | Several published graphics could be this one: "When we behold pg 177 middle — 02 of 02", "When we behold pg 177 middle — 01 of 02". Choose one. |
| Page 5, row 1, column 5 (5/0/4) | Ein Keloheinu | Ein K'Eloheinu | Several published graphics could be this one: "Ein K'Eloheinu — 02 of 02", "Ein K'Eloheinu — 01 of 02". Choose one. |
| Page 5, row 2, column 6 (5/1/5) | Adon Olam 2 | Adon Olam 2 | Closest published graphic: "Adon Olam 1". Confirm it before binding. |
| Page 5, row 3, column 6 (5/2/5) | Adon Olam 3 | Adon Olam 3 | Closest published graphic: "Adon Olam 1". Confirm it before binding. |
| Page 5, row 4, column 4 (5/3/3) | Sow in Tears Friedman | Sow in Tears | Several published graphics could be this one: "Sow in Tears — 02 of 02", "Sow in Tears — 01 of 02". Choose one. |
| Page 5, row 4, column 6 (5/3/5) | Adon Olam 4 | Adon Olam 4 | Closest published graphic: "Adon Olam 1". Confirm it before binding. |
| Page 8, row 2, column 3 (8/1/2) | America the beautiful pt 1 | America the beautiful 1 | Matched "America the beautiful 1" by name, but a defect needs a decision first: Page 8 has another button labelled "America the beautiful pt 1" (button 8/1/4) that fires a different graphic, so one of the two labels is wrong. |
| Page 8, row 2, column 5 (8/1/4) | America the beautiful pt 1 | America the Beautful 3 | Matched "America the Beautful 3" by name, but a defect needs a decision first: Page 8 has another button labelled "America the beautiful pt 1" (button 8/1/2) that fires a different graphic, so one of the two labels is wrong. |
| Page 8, row 4, column 2 (8/3/1) | Twilight 1 | Twilight People 1 PRIDE | Several published graphics could be this one: "Twilight People 1 PRIDE — 02 of 02", "Twilight People 1 PRIDE — 01 of 02". Choose one. |
| Page 8, row 4, column 4 (8/3/3) | Candle Gratitude  | PRIDE candle lighting | Several published graphics could be this one: "PRIDE candle lighting — 02 of 02", "PRIDE candle lighting — 01 of 02". Choose one. |
| Page 95, row 1, column 5 (95/0/4) | Goodness of the world 1 | Shofar Service Reading pt 1.2.1 | Matched "Shofar Service Reading pt 1.2.1" by name, but a defect needs a decision first: Page 95 has another button labelled "Goodness of the world 1" (button 95/1/4) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 2, column 3 (95/1/2) | Dwell on each 1 | Shofar Service Reading pt 1 | Matched "Shofar Service Reading pt 1" by name, but a defect needs a decision first: Page 95 has another button labelled "Dwell on each 1" (button 95/2/2) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 2, column 4 (95/1/3) | Our memories 2 | Shofar Service Reading pt 3.1 | Several published graphics could be this one: "Shofar Service Reading pt 3.1 — 02 of 02", "Shofar Service Reading pt 3.1 — 01 of 02". Choose one. |
| Page 95, row 2, column 5 (95/1/4) | Goodness of the world 1 | Shofar Service Reading pt 1.2.2 | Matched "Shofar Service Reading pt 1.2.2" by name, but a defect needs a decision first: Page 95 has another button labelled "Goodness of the world 1" (button 95/0/4) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 3, column 3 (95/2/2) | Dwell on each 1 | Shofar Service Reading pt 2 | Matched "Shofar Service Reading pt 2" by name, but a defect needs a decision first: Page 95 has another button labelled "Dwell on each 1" (button 95/1/2) that fires a different graphic, so one of the two labels is wrong. |
| Page 95, row 4, column 6 (95/3/5) | V'ne-emar | Aleinu 2 | Matched "Aleinu 2" by name, but a defect needs a decision first: The label "V'ne-emar" names V'ne'emar, but the button fires "Aleinu 2" (singular__HHDs). |
| Page 96, row 1, column 2 (96/0/1) | Kiddusha 1 | Keddusha | Several published graphics could be this one: "Keddusha Evening", "Keddusha 3", "Keddusha 2". Choose one. |
| Page 96, row 3, column 8 (96/2/7) | Heal Us Now 3 | Heal Us Now 3 | Several published graphics could be this one: "Heal Us Now 3 — 02 of 02", "Heal Us Now 3 — 01 of 02". Choose one. |
| Page 97, row 1, column 7 (97/0/6) | Mi Chamocha 1 | Mi Chamocha (long) 1 | Several published graphics could be this one: "Mi Chamocha (Sat 1)", "Mi Chamocha (Friday) 1". Choose one. |
| Page 97, row 2, column 5 (97/1/4) | V'ahavta 1 | Veehavta 1 | Matched "Vahavta 1" by name, but a defect needs a decision first: The first press shows "Veehavta 1" (singular__HHDs) but the second press takes out "Veehavta Translation 1" (singular__HHDs), so the second press does not clear what the first showed. |
| Page 97, row 2, column 7 (97/1/6) | Mi Chamocha 2 | Mi Chamocha / tzur (long) 2 | Closest published graphic: "Mi Chamocha eve 2". Confirm it before binding. |
| Page 97, row 3, column 8 (97/2/7) | Amidah 5 | Gevurot 1 | Matched "Gevurot 1" by name, but a defect needs a decision first: Page 97 has another button labelled "Amidah 5" (button 97/3/7) that fires a different graphic, so one of the two labels is wrong. |
| Page 97, row 4, column 4 (97/3/3) | Barchu | Barechu | Several published graphics could be this one: "Barechu", "Barechu". Choose one. |
| Page 97, row 4, column 8 (97/3/7) | Amidah 5 | Gevurot 2 | Matched "Gevurot 2" by name, but a defect needs a decision first: Page 97 has another button labelled "Amidah 5" (button 97/2/7) that fires a different graphic, so one of the two labels is wrong. |
| Page 98, row 2, column 7 (98/1/6) | Adon Olam 2 | Adon Olam 2 | Closest published graphic: "Adon Olam 1". Confirm it before binding. |
| Page 98, row 3, column 5 (98/2/4) | Veneemar | Aleinu 3 | Matched "Aleinu 3" by name, but a defect needs a decision first: The label "Veneemar" names V'ne'emar, but the button fires "Aleinu 3" (singular__HHDs). |
| Page 99, row 1, column 3 (99/0/2) | Shalom Aleichem 1 | Shalom Aleichem Friedman 1 | Several published graphics could be this one: "Shalom Aleichem 1", "Shalom Aleichem all". Choose one. |
| Page 99, row 2, column 4 (99/1/3) | Barchu | Barechu | Several published graphics could be this one: "Barechu", "Barechu". Choose one. |
| Page 99, row 2, column 6 (99/1/5) | Chatzi Kaddish 1 | Readers Kaddish 1 | Matched "Readers Kaddish 1" by name, but a defect needs a decision first: Page 99 has another button labelled "Chatzi Kaddish 1" (button 99/2/5) that fires a different graphic, so one of the two labels is wrong. |
| Page 99, row 3, column 3 (99/2/2) | Shalom Aleichem 3 | Shalom Aleichem Friedman 3 | Several published graphics could be this one: "Shalom Aleichem 3", "Shalom Aleichem 1". Choose one. |
| Page 99, row 3, column 4 (99/2/3) | Ahavat Olam | Ahavat Olam  Mann and Rutman | Several published graphics could be this one: "Ahavat Olam Translation", "Ahavat Olam Translation 2", "Ahavat Olam 1", "Ahavat Olam 2". Choose one. |
| Page 99, row 3, column 5 (99/2/4) | Mi Chamocha 1 | Mi Chamocha eve 1 | Several published graphics could be this one: "Mi Chamocha (Sat 1)", "Mi Chamocha (Friday) 1". Choose one. |
| Page 99, row 3, column 6 (99/2/5) | Chatzi Kaddish 1 | Readers Kaddish 2 | Matched "Readers Kaddish 2" by name, but a defect needs a decision first: Page 99 has another button labelled "Chatzi Kaddish 1" (button 99/1/5) that fires a different graphic, so one of the two labels is wrong. |
| Page 99, row 4, column 3 (99/3/2) | Shalom Aleichem 4 | Shalom Aleichem Friedman 4 | Several published graphics could be this one: "Shalom Aleichem all", "Shalom Aleichem 3", "Shalom Aleichem 1". Choose one. |

## Covered (192 buttons)

One published graphic clearly matches. These are the only buttons the conversion binds, and only when confirmed.

| Where | Label | Colour | Shows today (Singular) | Graphic |
|---|---|---|---|---|
| Page 1, row 1, column 2 (1/0/1) | JLicense Friday | #000000 | JLicense 2022 | JLicense 2022 |
| Page 1, row 2, column 2 (1/1/1) | Visual Tfilah Friday | #000000 | Visual T'filah Copyright | Visual T'filah Copyright |
| Page 1, row 3, column 2 (1/2/1) | TBI DONATE | #331900 | Donate TBI | Donate TBI |
| Page 2, row 1, column 2 (2/0/1) | Shir Chadash - Silver | #ff80ff | Shir Chadash - Julie Silver | Shir Chadash - Julie Silver |
| Page 2, row 1, column 3 (2/0/2) | Candles  | #ff4040 | Candle LIghting | Candle LIghting |
| Page 2, row 1, column 4 (2/0/3) | Lecha Dodi 1 | #009900 | L'cha Dodi 1 | L'cha Dodi 1 (CRC) |
| Page 2, row 1, column 5 (2/0/4) | Mizmor Shir 1 | #ffff00 | Mizmor Shir | Mizmor Shir |
| Page 2, row 1, column 6 (2/0/5) | Shalom Aleichem 1 | #3333ff | Shalom Aleicheim | Shalom Aleicheim 2 |
| Page 2, row 1, column 7 (2/0/6) | Chatzi Kaddish 1 | #009999 | Readers Kaddish 1 | Readers Kaddish 1 |
| Page 2, row 2, column 3 (2/1/2) | Evening Blessings | #999966 | Evening Blessings 1 of 2 | Evening Blessings 1 of 2 |
| Page 2, row 2, column 4 (2/1/3) | Lecha Dodi 2 | #009900 | L'cha Dodi 2 | L'cha Dodi 2 |
| Page 2, row 2, column 5 (2/1/4) | Mizmor Shir 2 | #ffff00 | Mizmor Shir 2 | Mizmor Shir 2 |
| Page 2, row 2, column 6 (2/1/5) | Shalom Aleichem 2 | #3333ff | Shalom Aleicheim 2 | Shalom Aleicheim 2 |
| Page 2, row 2, column 7 (2/1/6) | Chatzi Kaddish 2 | #009999 | Readers Kaddish 2 | Readers Kaddish 2 |
| Page 2, row 2, column 8 (2/1/7) | 148 pt 2 | #66ff33 | Maariv Aravim translation 2 | Maariv Aravim translation 2 |
| Page 2, row 3, column 2 (2/2/1) | Lchu nranana | #0000ff | Lchu Nrannah | Lchu Nrannah |
| Page 2, row 3, column 3 (2/2/2) | Evening Blessings 2 | #999966 | Evening Blessings 2 of 2 | Evening Blessings 2 of 2 |
| Page 2, row 3, column 4 (2/2/3) | Lecha Dodi 3 | #009900 | L'cha Dodi 3 | L'cha Dodi 3 |
| Page 2, row 3, column 7 (2/2/6) | Am I awake | #00cc00 | Am I Awake | Am I Awake |
| Page 2, row 3, column 8 (2/2/7) | Pg 149 Top | #4040ff | Praise to You pg 149 top | Praise to You pg 149 top |
| Page 2, row 4, column 1 (2/3/0) | Shabbat HaMalkah | #0000ff | Shabbat HaMalkah | Shabbat HaMalkah |
| Page 2, row 4, column 2 (2/3/1) | Ma Yafe Hayom | #0000ff | Ma Yafeh Hayom | Ma Yafeh Hayom |
| Page 2, row 4, column 3 (2/3/2) | Yedid Nefesh | #003366 | Yedid Nefesh | Yedid Nefesh |
| Page 2, row 4, column 4 (2/3/3) | Lecha Dodi 4 | #009900 | L'cha Dodi 4 | L'cha Dodi 4 |
| Page 2, row 4, column 5 (2/3/4) | Tzadik Katamar | #cc3399 | Tzaddik Katamar | Tzaddik Katamar |
| Page 2, row 4, column 8 (2/3/7) | Page 149 m | #0099ff | This is an hour pg 149 middle | This is an hour pg 149 middle |
| Page 3, row 1, column 4 (3/0/3) | Shema | #3333ff | Shema | Shema |
| Page 3, row 1, column 5 (3/0/4) | 157 middle pt 1 | #ff40ff | In a world... pg 157 middle 1 | In a world... pg 157 middle 1 |
| Page 3, row 1, column 7 (3/0/6) | Vshamru | #cc0000 | Veshamru | Vshamru |
| Page 3, row 1, column 8 (3/0/7) | Avot 2 | #cc3399 | Avot 2 | Avot 2 |
| Page 3, row 2, column 2 (3/1/1) | Ahavat Olam 2 | #000066 | Ahavat Olam 2 | Ahavat Olam 2 |
| Page 3, row 2, column 3 (3/1/2) | 151 top | #3333cc | As You Taught pg 151 top | As You Taught pg 151 top |
| Page 3, row 2, column 4 (3/1/3) | V'ahavta 1 | #9933ff | Veehavta 1 | Vahavta 1 |
| Page 3, row 2, column 5 (3/1/4) | 157 middle pt 2 | #ff40ff | In a world... pg 157 middle 2 | In a world... pg 157 middle 2 |
| Page 3, row 3, column 2 (3/2/1) | Page 150 pt 1 | #ffcc66 | Ahavat Olam Translation | Ahavat Olam Translation |
| Page 3, row 3, column 3 (3/2/2) | 151 middle | #3333cc | Wisdom and Wonder pg 151 | Wisdom and Wonder pg 151 |
| Page 3, row 3, column 4 (3/2/3) | V'ahavta 2 | #9933ff | Veehavta 2 | Vahavta 2 |
| Page 3, row 3, column 5 (3/2/4) | 157 middle pt 3 | #ff40ff | In a world... pg 157 middle 3 | In a world... pg 157 middle 3 |
| Page 3, row 3, column 7 (3/2/6) | Adonai Sefatai | #cc3399 | adonai | adonai |
| Page 3, row 3, column 8 (3/2/7) | G'vurot 2  | #cc3399 | Gevurot 2 | Gevurot 2 |
| Page 3, row 4, column 1 (3/3/0) | 266 | #ff6666 | In each age 266 | In each age 266 |
| Page 3, row 4, column 2 (3/3/1) | Page 150 pt 2 | #ffcc66 | Ahavat Olam Translation 2 | Ahavat Olam Translation 2 |
| Page 3, row 4, column 3 (3/3/2) | Open Up Our Eyes | #ff6666 | Open Up Our Eyes - Klepper | Open Up Our Eyes - Klepper |
| Page 3, row 4, column 4 (3/3/3) | 157 top | #ff0000 | Standing on the parted 157 top | Standing on the parted 157 top |
| Page 3, row 4, column 7 (3/3/6) | Avot 1 | #cc3399 | Avot / Meein Sheva | Avot / Meein Sheva |
| Page 4, row 1, column 3 (4/0/2) | Pg 173 Middle pt 1 | #00cc66 | Disturb Us pg 172 pt 1 | Disturb Us pg 172 pt 1 |
| Page 4, row 1, column 4 (4/0/3) | Page 174 | #0099ff | Find favor - pg 174 | Find favor - pg 174 |
| Page 4, row 1, column 6 (4/0/5) | Shalom Rav 1 | #660066 | Shalom Rav | Shalom Rav |
| Page 4, row 1, column 7 (4/0/6) | SP - Solovy | #999966 | SP - Solovy Meditation | SP - Solovy Meditation |
| Page 4, row 1, column 8 (4/0/7) | SP - Festival | #0000cc | SP - Festival pg 493 middle | SP - Festival pg 493 middle |
| Page 4, row 2, column 2 (4/1/1) | Page 172 pt 2 | #00ff00 | Kedushat HaYom pg 172 pt 2 | Kedushat HaYom pg 172 pt 2 |
| Page 4, row 2, column 3 (4/1/2) | Pg 173 Middle pt 2 | #00cc66 | Disturb Us pg 172 pt 2 | Disturb Us pg 172 pt 2 |
| Page 4, row 2, column 4 (4/1/3) | 175 Top | #8080ff | Everpresent One pg 175 top | Everpresent One pg 175 top |
| Page 4, row 2, column 5 (4/1/4) | 176 part 2 | #ffff00 | pg 176 pt 2 | pg 176 pt 2 |
| Page 4, row 2, column 7 (4/1/6) | SP - Rav Nachman | #ff0000 | SP - Rav Nachman | SP - Rav Nachman (TBI text) |
| Page 4, row 2, column 8 (4/1/7) | Sanctuary Shaker Hymn | #ffff00 | Sanctuary shaker hymn | Sanctuary shaker hymn |
| Page 4, row 3, column 2 (4/2/1) | 480 | #ff8000 | Our God pg 480 FESTIVAL | Our God pg 480 FESTIVAL |
| Page 4, row 3, column 3 (4/2/2) | Pg 173 Middle pt 3 | #00cc66 | Disturb Us pg 172 pt 3 | Disturb Us pg 172 pt 3 |
| Page 4, row 3, column 4 (4/2/3) | 175 middle 1 | #66ffff | You are with us 175 middle | You are with us 175 middle |
| Page 4, row 3, column 5 (4/2/4) | 177 Top | #ff6666 | God of goodness 177 top | God of goodness 177 top |
| Page 4, row 3, column 6 (4/2/5) | Shalom Rav Chatimah | #660066 | Shalom Rav 3 chatimah | Shalom Rav 3 chatimah |
| Page 4, row 3, column 7 (4/2/6) | SP - guard | #0000cc | SP - guard my speech | SP - guard my speech |
| Page 4, row 4, column 1 (4/3/0) | 487 | #ff8000 | Our ancestors FESTIVAL pg 487 | Our ancestors FESTIVAL pg 487 |
| Page 4, row 4, column 2 (4/3/1) | 173 Top | #8080ff | May These Hours 173 top | May These Hours 173 top |
| Page 4, row 4, column 4 (4/3/3) | 175 middle 2 | #66ffff | You are with us 2   175 middle | You are with us 2   175 middle |
| Page 4, row 4, column 7 (4/3/6) | SP - Pure Heart | #ff0000 | SP - create a pure heart | SP - create a pure heart |
| Page 4, row 4, column 8 (4/3/7) | Mi Shebeirach | #9966ff | Mi Sheberach | Mi Sheberach |
| Page 5, row 1, column 2 (5/0/1) | Aleinu 1 | #669900 | Aleinu 1 | Aleinu 1 |
| Page 5, row 1, column 4 (5/0/3) | Omer 1 | #ff6666 | Omer Counting | Omer Counting |
| Page 5, row 1, column 6 (5/0/5) | Adon Olam 1 | #cc33ff | Adon Olam 1 | Adon Olam 1 |
| Page 5, row 1, column 7 (5/0/6) | Olam Chesesd | #ff6666 | Olam Chesed Yibaneh | Olam Chesed Yibaneh (TBI text) |
| Page 5, row 2, column 2 (5/1/1) | Aleinu 2 | #669900 | Aleinu 2 | Aleinu 2 |
| Page 5, row 2, column 3 (5/1/2) | Mourn Kadd 1 | #000099 | Mourners Kaddish 1 | Mourners Kaddish 1 |
| Page 5, row 2, column 4 (5/1/3) | Omer 2 | #ff6666 | Omer Counting 2 | Omer Counting 2 |
| Page 5, row 2, column 5 (5/1/4) | Miriam's song 1 | #cc33ff | Miriams Song 1 | Miriams Song 1 |
| Page 5, row 2, column 7 (5/1/6) | Lechi Lach | #cc00cc | Lechi Lach - Debbie Friedman | Lechi Lach - Debbie Friedman |
| Page 5, row 3, column 2 (5/2/1) | Aleinu 3 Eng | #669900 | Aleinu English insert | Aleinu English insert |
| Page 5, row 3, column 3 (5/2/2) | Mourn Kadd 2 | #000099 | Mourners Kaddish 2 Shabbat Shuva | Mourners Kaddish 2 Shabbat Shuva |
| Page 5, row 3, column 4 (5/2/3) | God Bless America | #9999ff | God Bless America | God Bless America |
| Page 5, row 3, column 5 (5/2/4) | Miriam's song 2 | #cc33ff | Miriams Song 2 | Miriams Song 2 |
| Page 5, row 3, column 7 (5/2/6) | Rosh Chodesh 1 | #9999ff | Rosh Chodesh pt 1 | Rosh Chodesh pt 1 |
| Page 5, row 3, column 8 (5/2/7) | Lo Yisa Goi - Low | #00ff00 | Lo Yisa Goi - Low | Lo Yisa Goi - Low |
| Page 5, row 4, column 2 (5/3/1) | Aleinu 4 | #669900 | Aleinu 3 | Aleinu 3 |
| Page 5, row 4, column 3 (5/3/2) | Mourn Kadd 3 | #000099 | Mourners Kaddish 3 | Mourners Kaddish 3 |
| Page 5, row 4, column 5 (5/3/4) | Miriam's song 3 | #cc33ff | Miriam's Song 3 | Miriam's Song 3 |
| Page 5, row 4, column 7 (5/3/6) | Rosh Chodesh 2 | #9999ff | Rosh Chodesh pt 2 | Rosh Chodesh pt 2 |
| Page 5, row 4, column 8 (5/3/7) | Lo Yisa Goi | #00ff00 | Lo Yisa Goi | Lo Yisa Goi |
| Page 6, row 1, column 2 (6/0/1) | Lo Yisa Goi chorus 1 | #660066 | Katz Lo Yisa Goi 1 | Katz Lo Yisa Goi 1 |
| Page 6, row 1, column 5 (6/0/4) | Psalm 27 pt 1 | #ff8000 | Psalm 27 pt 1 | Psalm 27 pt 1 |
| Page 6, row 1, column 6 (6/0/5) | Psalm 27 pt 2 | #ff8000 | Psalm 27 pt 2 | Psalm 27 pt 2 |
| Page 6, row 1, column 7 (6/0/6) | Psalm 27 pt 3 | #ff8000 | Psalm 27 pt 3 | Psalm 27 pt 3 |
| Page 6, row 1, column 8 (6/0/7) | Psalm 27 pt 4 | #ff8000 | Psalm 27 pt 4 | Psalm 27 pt 4 |
| Page 6, row 2, column 2 (6/1/1) | Lo Yisa Goi 2 | #660066 | Katz Lo Yisa Goi 2 | Katz Lo Yisa Goi 2 |
| Page 6, row 2, column 3 (6/1/2) | Lo Yisa Goi 3 | #660066 | Katz Lo Yisa Goi 3 | Katz Lo Yisa Goi 3 |
| Page 6, row 3, column 2 (6/2/1) | Unending love 1 | #ffcc66 | Unending Love Shapiro 1 | Unending Love Shapiro 1 |
| Page 6, row 3, column 3 (6/2/2) | Unending love 2 | #ffcc66 | Unending Love Shapiro 2 | Unending Love Shapiro 2 |
| Page 6, row 3, column 6 (6/2/5) | Hashkiveinu Aronson | #009933 | Hashkiveinu - Aronson let there be | Hashkiveinu - Aronson let there be |
| Page 6, row 4, column 2 (6/3/1) | Gesher Tzar M'od | #000099 | Gesher Tzar Meod | Gesher Tzar Meod |
| Page 6, row 4, column 3 (6/3/2) | Kol Hanshamah | #009933 | Kol Han'shamah folk | Kol Han'shamah folk |
| Page 6, row 4, column 6 (6/3/5) | Hashiveinu | #ff9900 | Hashiveinu - folk | Hashiveinu - folk |
| Page 8, row 1, column 2 (8/0/1) | JLicense Friday | #000000 | JLicense 2022 | JLicense 2022 |
| Page 8, row 1, column 4 (8/0/3) | Omer 1 | #ff9900 | Omer Counting | Omer Counting |
| Page 8, row 1, column 5 (8/0/4) | Omer 2 | #ff9900 | Omer Counting 2 | Omer Counting 2 |
| Page 8, row 2, column 2 (8/1/1) | God bless america | #00ff00 | God Bless America | God Bless America |
| Page 8, row 2, column 4 (8/1/3) | America the beautiful pt 2 | #ff6666 | America the beautiful 2 | America the beautiful 2 |
| Page 8, row 2, column 7 (8/1/6) | Shema Yisrael | #9900cc | Shema | Shema |
| Page 8, row 4, column 3 (8/3/2) | Twilight 2 | #9999ff | Twilight People 2 PRIDE | Twilight People 2 PRIDE |
| Page 95, row 1, column 2 (95/0/1) | V'zot HaTorah | #c0c0ff | Vzot HaTorah | Vzot HaTorah |
| Page 95, row 1, column 4 (95/0/3) | Our memories 1 | #c0c0ff | Shofar Service Reading pt 3 | Shofar Service Reading pt 3 |
| Page 95, row 1, column 6 (95/0/5) | Aleinu 1 | #ff8080 | Aleinu 1 | Aleinu 1 |
| Page 95, row 1, column 7 (95/0/6) | Mourner's Kaddish 1 | #40ff40 | Mourners Kaddish 1 | Mourners Kaddish 1 |
| Page 95, row 1, column 8 (95/0/7) | Yigdal 1 | #ffff00 | Yigdal 1 | Yigdal 1 |
| Page 95, row 2, column 2 (95/1/1) | Etz-chayim hi | #ff80ff | EtzChayim | EtzChayim |
| Page 95, row 2, column 6 (95/1/5) | Aleinu 2 | #ff8080 | Aleinu 2 | Aleinu 2 |
| Page 95, row 2, column 7 (95/1/6) | Mourner's Kaddish 2 | #40ff40 | Mourners Kaddish 2 | Mourners Kaddish 2 |
| Page 95, row 2, column 8 (95/1/7) | Yigdal 2 | #ffff00 | Yigdal 2 | Yigdal 2 |
| Page 95, row 3, column 2 (95/2/1) | Voice of Community 1 | #ffff00 | Shofar Service Reading pt 0 | Shofar Service Reading pt 0 |
| Page 95, row 3, column 4 (95/2/3) | Our memories 3 | #c0c0ff | Shofar Service Reading pt 3.2 | Shofar Service Reading pt 3.2 |
| Page 95, row 3, column 5 (95/2/4) | RSS | #ffff00 | Rabbi Schicker | Rabbi Schicker |
| Page 95, row 3, column 7 (95/2/6) | Mourner's Kaddish 3 | #40ff40 | Mourners Kaddish 3 | Mourners Kaddish 3 |
| Page 95, row 3, column 8 (95/2/7) | Donation | #c0c0ff | Donate TBI - full screen | Donate TBI - full screen |
| Page 95, row 4, column 2 (95/3/1) | Voice of Community 2 | #ffff00 | Shofar Service Reading pt 0.2 | Shofar Service Reading pt 0.2 |
| Page 95, row 4, column 8 (95/3/7) | JLicense | #ff80ff | JLicense | JLicense |
| Page 96, row 1, column 3 (96/0/2) | Sim Shalom 1 | #c0c0ff | Sim Shalom 1 | Sim Shalom 1 |
| Page 96, row 1, column 4 (96/0/3) | Carl | #ffff00 | Prof. Carl Ratner | Prof. Carl Ratner |
| Page 96, row 1, column 5 (96/0/4) | 227 pt 1 | #ff8080 | Torah Service 1 | Torah Service 1 |
| Page 96, row 1, column 6 (96/0/5) | 228 pt 1 | #c0c0ff | Torah Service 3 | Torah Service 3 |
| Page 96, row 1, column 7 (96/0/6) | Torah Blessings BEFORE | #ff8080 | Blessing BEFORE Torah Reading | Blessing BEFORE Torah Reading |
| Page 96, row 1, column 8 (96/0/7) | Heal Us Now 1 | #ffff40 | Heal Us Now 1 | Heal Us Now 1 |
| Page 96, row 2, column 2 (96/1/1) | Kiddusha 2 | #ff8080 | Keddusha 2 | Keddusha 2 |
| Page 96, row 2, column 3 (96/1/2) | Sim Shalom 2 | #c0c0ff | Sim Shalom 2 | Sim Shalom 2 |
| Page 96, row 2, column 4 (96/1/3) | Avinu Malkeinu 1 | #ff80ff | avinu 1 | avinu 1 |
| Page 96, row 2, column 5 (96/1/4) | 227 pt 2 | #ff8080 | Torah Service 2 | Torah Service 2 |
| Page 96, row 2, column 6 (96/1/5) | 228 pt 2 | #c0c0ff | Torah Service 4 | Torah Service 4 |
| Page 96, row 2, column 7 (96/1/6) | Torah Blessings AFTER | #40ff40 | Blessing AFTER Torah Reading | Blessing AFTER Torah Reading |
| Page 96, row 2, column 8 (96/1/7) | Heal Us Now 2 | #ffff40 | Heal Us Now 2 | Heal Us Now 2 |
| Page 96, row 3, column 2 (96/2/1) | Kiddusha 3 | #ff8080 | Keddusha 3 | Keddusha 3 |
| Page 96, row 3, column 3 (96/2/2) | Sim Shalom 3 | #c0c0ff | Sim Shalom 3 | Sim Shalom 3 |
| Page 96, row 3, column 4 (96/2/3) | Avinu Malkeinu 2 | #ff80ff | avinu 2 | avinu 2 |
| Page 96, row 3, column 5 (96/2/4) | Adonai Adonai | #40ff40 | 13 attributes Massey | 13 attributes Massey |
| Page 96, row 3, column 6 (96/2/5) | L'cha Adonai | #ffff00 | Lecha Adonai | Lecha Adonai |
| Page 96, row 4, column 2 (96/3/1) | Carl | #40ff40 | Prof. Carl Ratner | Prof. Carl Ratner |
| Page 96, row 4, column 3 (96/3/2) | Sim Shalom 4 | #c0c0ff | Sim Shalom 4 | Sim Shalom 4 |
| Page 96, row 4, column 6 (96/3/5) | Al Shlosha D'varim | #ff80ff | Al Shlosha dvarim | Al Shlosha dvarim |
| Page 96, row 4, column 8 (96/3/7) | Heal Us Now 4 | #ffff40 | Heal Us Now 4 | Heal Us Now 4 |
| Page 97, row 1, column 2 (97/0/1) | JLicense | #40ff40 | JLicense | JLicense |
| Page 97, row 1, column 4 (97/0/3) | Psalm 150 | #ff8080 | Psalm 150 | Psalm 150 |
| Page 97, row 1, column 5 (97/0/4) | Shema | #c0c0ff | Shema | Shema |
| Page 97, row 1, column 6 (97/0/5) | Vayomer 1 | #ffff00 | Vayomer 1 | Vayomer 1 |
| Page 97, row 1, column 8 (97/0/7) | Amidah 3 | #ff80ff | Avot 2 | Avot 2 |
| Page 97, row 2, column 2 (97/1/1) | Donation | #ffff00 | Donate TBI - full screen | Donate TBI - full screen |
| Page 97, row 2, column 3 (97/1/2) | Ma Tovu 2 | #ff80ff | Ma Tovu 2 | Ma Tovu 2 |
| Page 97, row 2, column 4 (97/1/3) | Chatzi Kaddish 1 | #40ff40 | Readers Kaddish 1 | Readers Kaddish 1 |
| Page 97, row 2, column 6 (97/1/5) | Vayomer 2 | #ffff00 | Vayomer 2 | Vayomer 2 |
| Page 97, row 3, column 4 (97/2/3) | Chatzi Kaddish 2 | #40ff40 | Readers Kaddish 2 | Readers Kaddish 2 |
| Page 97, row 3, column 6 (97/2/5) | Vayomer 3 | #ffff00 | Vayomer 3 | Vayomer 3 |
| Page 97, row 3, column 7 (97/2/6) | Amidah 1 | #ff80ff | Adonai | adonai |
| Page 97, row 4, column 3 (97/3/2) | Elohai n'shamah | #c0c0ff | Elohai Ross-Perry | Elohai Ross-Perry |
| Page 97, row 4, column 7 (97/3/6) | Amidah 2 | #ff80ff | Avot 1 | Avot 1 |
| Page 98, row 1, column 2 (98/0/1) | Prayer | #ffff00 | Prayer come from away | Prayer come from away |
| Page 98, row 1, column 3 (98/0/2) | RSS | #40ff40 | Rabbi Schicker | Rabbi Schicker |
| Page 98, row 1, column 4 (98/0/3) | Kiddush 1 | #ffff00 | Kiddush | Kiddush |
| Page 98, row 1, column 5 (98/0/4) | Aleinu 1 | #c0c0ff | Aleinu 1 | Aleinu 1 |
| Page 98, row 1, column 6 (98/0/5) | Mourners Kaddish 1 | #ff8080 | Mourners Kaddish 1 | Mourners Kaddish 1 |
| Page 98, row 1, column 7 (98/0/6) | Adon Olam 1 | #ff80ff | Adon Olam 1 | Adon Olam 1 |
| Page 98, row 2, column 2 (98/1/1) | Carl | #ff8080 | Prof. Carl Ratner | Prof. Carl Ratner |
| Page 98, row 2, column 3 (98/1/2) | Avinu Malkeinu 1 | #ff80ff | avinu 1 | avinu 1 |
| Page 98, row 2, column 4 (98/1/3) | Kiddush 2 | #ffff00 | Kiddush 2 | Kiddush 2 |
| Page 98, row 2, column 5 (98/1/4) | Aleinu 2 | #c0c0ff | Aleinu 2 | Aleinu 2 |
| Page 98, row 2, column 6 (98/1/5) | Mourners Kaddish 2 | #ff8080 | Mourners Kaddish 2 | Mourners Kaddish 2 |
| Page 98, row 3, column 2 (98/2/1) | Mi Shebeirach 1 | #c0c0ff | Mi Shebeirach Arian 1 | Mi Shebeirach Arian 1 |
| Page 98, row 3, column 3 (98/2/2) | Avinu Malkeinu 2 | #ff80ff | avinu 2 | avinu 2 |
| Page 98, row 3, column 6 (98/2/5) | Mourners Kaddish 3 | #ff8080 | Mourners Kaddish 3 | Mourners Kaddish 3 |
| Page 98, row 3, column 7 (98/2/6) | Donation | #ffff00 | Donate TBI - full screen | Donate TBI - full screen |
| Page 98, row 4, column 2 (98/3/1) | Mi Shebeirach 2 | #c0c0ff | Mi Shebeirach Arian 2 | Mi Shebeirach Arian 2 |
| Page 98, row 4, column 7 (98/3/6) | JLicense | #40ff40 | JLicense | JLicense |
| Page 99, row 1, column 2 (99/0/1) | JLicense | #ff80ff | JLicense | JLicense |
| Page 99, row 1, column 4 (99/0/3) | Marlene & Steve | #ffff00 | Denenfeld | Denenfeld |
| Page 99, row 1, column 5 (99/0/4) | Vahavta 1 | #40ff40 | Veehavta 1 | Vahavta 1 |
| Page 99, row 1, column 6 (99/0/5) | V'shamru | #ff8080 | Vshamru | Vshamru |
| Page 99, row 1, column 7 (99/0/6) | Amidah 1 | #ff80ff | Adonai | adonai |
| Page 99, row 1, column 8 (99/0/7) | Amidah 5 | #ff80ff | Gevurot 1 | Gevurot 1 |
| Page 99, row 2, column 2 (99/1/1) | Donation | #ffff00 | Donate TBI - full screen | Donate TBI - full screen |
| Page 99, row 2, column 5 (99/1/4) | Vahavta 2 | #40ff40 | Veehavta 2 | Vahavta 2 |
| Page 99, row 2, column 7 (99/1/6) | Amidah 2 | #ff80ff | Avot 1 | Avot 1 |
| Page 99, row 2, column 8 (99/1/7) | Amidah 6 | #ff80ff | Gevurot 2 | Gevurot 2 |
| Page 99, row 3, column 2 (99/2/1) | Candle Blessing | #ff8080 | Candle LIghting | Candle LIghting |
| Page 99, row 3, column 7 (99/2/6) | Amidah 3 | #ff80ff | Avot 2 | Avot 2 |
| Page 99, row 3, column 8 (99/2/7) | Amidah 7 | #ff80ff | Keddusha Evening | Keddusha Evening |
| Page 99, row 4, column 2 (99/3/1) | Shecheyanu | #ff8080 | Shehechiyanu | Shehechiyanu |
| Page 99, row 4, column 4 (99/3/3) | Shema | #ffff00 | Shema | Shema |
| Page 99, row 4, column 5 (99/3/4) | Mi Chamocha 2 | #c0c0ff | Mi Chamocha eve 2 | Mi Chamocha eve 2 |

## Deck check

C2's deck validator, with the module definitions shipped with the Overlays module (TBI's page templates allow Companion's built-in navigation):

- The seeded deck, every graphic button still waiting for its graphic: passes. 99 pages with buttons, 574 buttons, 0 graphics bound; connections in the export: Birddog, obs; 0 warnings.
- The deck with every Covered button bound (192 buttons, each with the Requested and Rendered lights): passes. 99 pages with buttons, 574 buttons, 151 graphics bound; connections in the export: TBI_Overlays, Birddog, obs; 0 warnings.

Companion 5.0.5's own import upgrade was not run: no 5.0.5 upgrade bundle is available here. Hardware acceptance (Simone importing the deck and pressing buttons) cannot be claimed from this report.

## Notes for Simone

- The first conversion pass found two buttons on page 5, "Ani v'Atah 1" (row 2, column 8, 5/1/7) and "Ani v'Atah 2" (row 1, column 8, 5/0/7), that point at Singular compositions which no longer exist, so they already do nothing. This conversion cannot see inside the Singular apps; that check returns once the Singular extract is imported (a later step).
- Buttons labelled with a working note ("NEED …") are held for review, whatever they match.
- Labels like "148 pt 1" or "Pg 149 Top" name Mishkan T'filah pages. They rarely match a graphic by name, so most of them are Needs review or Needs a graphic here; the TBI redo builds them as TBI readings with book and page.
