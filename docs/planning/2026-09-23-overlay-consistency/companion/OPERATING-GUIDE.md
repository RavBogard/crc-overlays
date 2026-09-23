# Operating guide: the fresh Companion preset

For Michael. Written 2026-09-23 for the file `CRC-FRESH-PRESET-2026-09-23.companionconfig`. The grid for each
page is in [PRESET-DESIGN.md](PRESET-DESIGN.md), and the cue behind every graphics button is in
[MANIFEST.md](MANIFEST.md).

## The idea in one paragraph
Each page covers one stretch of a service. The columns run left to right in prayer order, and the parts of a
long piece go down its column. Three columns never move. Column 0, the camera switcher, is on the far left.
Column 6 holds output recovery, and column 7, on the far right, holds navigation. They sit in the same place
on every service page (3–26), so you can reach them without looking. Colour tells you what a button does,
and the label tells you which piece it is.

## The fixed columns (pages 3–26)
| Row | Column 0 · Switcher | Column 6 · Recovery | Column 7 · Navigation |
|---|---|---|---|
| Top | **Center cam 1**: vMix merge to center cam 1 | **Animate out**: takes the current graphic out with its animation | **◂ Prev**: the previous page of this service (from the first page it goes to Home) |
| 2nd | **Left cam 2** | **Clear now**: removes every graphic at once, with no animation | **Home**: always goes to page 1. The label shows the current page's name |
| 3rd | **Right cam 3** | **Logo on/off**: the resting corner logo. The key is lit while the logo setting is on | **Next ▸**: the next page of this service (from the last page it goes to Home) |
| Bottom | **Merge PVW→PGM**: your usual Merge | **Be Right Back** | **Bimah Mute**: X32 /ch/26 and /ch/27 → bus 11 toggle. The key changes colour while the bimah is muted |

Prev and Next stay inside one service. They never run into another service or onto a blank page.
- Friday: 4 → 9
- Shabbat morning: 10 → 16
- B'nai Mitzvah: 17 → 18
- High Holy Days: 19 → 25

Anytime (3) and Memorial (26) are single pages, so they have no Prev or Next.

The camera keys also show vMix tally: the key changes when that input is live.

## Colours
| Colour | Meaning |
|---|---|
| Teal | One part of a sequence (a long piece split into panels) |
| Burgundy | A single graphic, or a short selection (the label says "short") |
| Navy | Announcements, names, readers, Starting Soon, Thank You, Be Right Back |
| Blue / orange | Camera merge / Merge PVW→PGM |
| Black | Navigation and jumps (white text), and Animate out |
| Dark red / charcoal | Clear now / Logo and catalog keys |
| Purple | Bimah Mute |
| Other device colours | Stream, audio and Reaper keys keep the colours they had before |

The graphics keys light up as they go through three states:
- **Amber**: the site has accepted the request.
- **Red**: that graphic is on the output. Red means only this now.
- **Dark red #aa0000**: the Overlays connection or the graphics browser is disconnected. Check the connection
  before you trust any graphics key.

The stream keys on Home are red, as they always were.

## How the graphics keys behave
- **One press in, one press out.** The first press brings the graphic in. A second press on the same key takes
  it out, but only while that graphic is still the one on screen. Companion's step counter no longer decides this,
  so a clear from somewhere else cannot put the key out of step.
- **Sequences**: press the parts in order, going down the column. Pressing the next part replaces the one on
  screen, so you do not need to take the previous part out first. The label on every part shows its number,
  such as "Aleinu 2/4". L'cha Dodi on Fri 2 fills three columns. The verse number and incipit are on every key,
  and the "Shirei" verses are marked.
- **Alternatives** are other versions of the same slot. They keep the colour of their role, and the label names
  the version, for example "Hashki · Randy", "Thou Shalt Love 1/2" or "Kiddush Shirei 1/2". Use one version or the
  other, not both.
- **Short selections** are deliberate extra keys, for example "Shiru (opening only)", "Mi Chamocha (short)" and
  "Kiddush (short)". They are not the start of a sequence.

## Camera gestures (Friday pages only)
These keys are the Friday pieces you had on your old pages 76–78: Candle Blessing, Hareini, Mah Tovu,
Shalom Aleichem, L'cha Dodi, Bar'chu, Sh'ma, V'ahavta, Mi Chamocha, Siyahamba, Hashkiveinu, V'shamru,
Adonai S'fatai, Shalom Rav, Oseh Shalom, Silent Prayer and Mi Sheberach. Each is a two-press key.
1. **First press**: the graphic comes in. The camera goes to its preset, and after 1.3 seconds vMix merges to that
   camera.
2. **Second press**: the graphic goes out. For a single piece, or the last part of a sequence, the camera then
   returns: the Center camera goes to preset 1, and after 1.3 seconds vMix merges to center cam 1. Hareini,
   Mah Tovu and Candle Blessing return with the merge only, as they always did.

The label turns yellow while the key is waiting for its second press. Only the first and last parts of a
sequence carry camera moves (for example L'cha Dodi 1 and 9), and the middle parts are plain one-press keys.
Every camera preset is the one you used before. The full list is in CUE-MANIFEST.json under `cameraGesture`.

## Running a service
1. At the start, press Home and then the service: Friday ▸, Shabbat AM ▸, B'nai Mitzvah ▸, Havdalah ▸,
   Holy Days ▸, Kol Nidre · Neilah ▸, Memorial ▸ or Anytime ▸.
2. Use **Starting Soon** before the service. It is on Home, Output & Audio, Anytime and the first page of each
   service.
3. Work left to right across the page, pressing the keys down each column. When a page is finished, press
   **Next ▸**.
4. At the end, use Thank You, and **Next ▸** from the last page takes you back to Home.

Notes for particular services:
- **B'nai Mitzvah Saturday**: run Sat 1–7 as usual. Page 17 holds the student names, guest name, Mazel Tov
  and honours. Its column 5 jumps straight to Sat 1, Sat Torah, Sat closing and Havdalah.
- **Havdalah** (18): the Saturday-evening B'nai Mitzvah and Havdalah.
- **High Holy Days** (19–25): seven pages in liturgical order: beginning, Sh'ma, Amidah I, Amidah II and
  confession, Torah and Shofar, Kol Nidre / Slichot / Neilah pieces, and closing. HHD 7 has a Havdalah ▸ key
  for the end of Neilah.
- **Kiddush**: Friday's default is Kiddush 1/2 → 2/2. The Shirei "Kiddush with Vay'chulu" 1/2 → 2/2 is the
  alternative. Kiddush (short) and the one-block Wine blessing are the short options. On Saturday the default is
  Kiddush (short), with Sat Kiddush 1/3 → 3/3 as the alternative. HHD uses Festival Kiddush 1/2 → 2/2.
- **Names and readers** (Guest name, Student name, Torah reader 1–7, Haftarah reader 1–3, Remember Them
  1–3): the text is typed on the site before the service. The key only shows it.

## Page by page
| Page | What it is for |
|---|---|
| 1 Home | Choose a service. Also Cameras, Devices, AV / Stream and Output & Audio; No-prod Start / End Stream, Start HHD Stream, Music Rec; Security Cam, Booth Mic Mute, Refresh catalog; Guest Speaker, Starting Soon, Announcements, Thank You |
| 2 Output & Audio | Logo ON / OFF, Refresh catalog, Starting Soon / Welcome / Announcements / Thank You. Bimah +5 and −8 on the stream bus, Mute bimahs (stream), Booth Mic Mute, the ARD and Computer audio presets, Close audio, Bimah mute (old ch01), vMix Bus X audio on. Also jumps to Media Player (55) and Audio presets (56) |
| 3 Anytime | Graphics for any service: Starting Soon, Welcome, names, Shehechiyanu, L'chi Lach, Priestly Blessing, May the Memory, the Torah blessings, Healing and Kaddish names, Kaddish, Oseh Shalom |
| 4–9 Fri 1–6 | Friday evening: candles and Shalom Aleichem → psalms and L'cha Dodi → Bar'chu to V'ahavta → Mi Chamocha to the Amidah → healing, Aleinu, Kaddish, Adon Olam → Kiddush and closing |
| 10–16 Sat 1–7 | Shabbat morning: blessings → Bar'chu and Yotzer → Sh'ma to Avot → Amidah → Torah and Haftarah (readers 1–7 and 1–3) → healing, Aleinu, Kaddish → Kiddush and closing |
| 17 B'nai Mitzvah | Names and honours, plus jumps into Sat 1–7 |
| 18 Havdalah | Ma'ariv, Havdalah 1–4, Eliyahu, Miryam, Shavua Tov, names |
| 19–25 HHD 1–7 | The High Holy Days by section (above) |
| 26 Memorial | Yizkor, funerals, Tisha B'Av: El Malei, Psalm 23, Remember Them 1–3, Kaddish |
| 29 Devices | An index of every device page (31–56) |
| 30 Cameras | Direct camera merges and Merge. F1–F6 (see below). Start / End PreRoll, Right cam 3 without overlay, Merge dinner (Seder, carried disabled), Merge bima cam 4 + Bus X, Security Cam, and jumps to the camera pages |
| 31–56 | Your camera, AV and audio pages, kept with the same grid as before (list below) |

The **F-keys** on page 30 work the way your old page 72 did. Each one previews a vMix input and puts the
*other* Stream Deck on that camera's page: F1 → Cam · Left, F2 → Cam · Center, F3 → Cam · Right,
F4 → Cam · Bimah and F5 → Cam · Dorothy. F6 previews input 8 only.

**Carried device pages.** These pages keep every save and recall key where it was:
- 31 Cams · Morning, 32 Evening, 33 Torah, 34 B'nai Mitzvah, 35 B'nai Mitzvah save, 36 Candles save,
  37 Funeral
- 38 Cam · Left, 39 Center, 40 Right (Door), 41 Bimah (Black), 42 Dorothy, 43 Dorothy spin
- 44 Oneg, 45 Right Oneg, 46 Shir Shabbat, 47 Rainbow, 48 Rainbow 2, 49 Adv Cam Control
- 50 PTZ pad · Right, 51 PTZ pad · Left
- 52 AV / Stream (Start Up, Re connect, Start / Stop Stream, SC loops), 53 Startup tools, 54 Self-production,
  55 Media Player (VLC), 56 Audio presets

On each of these pages, column 7 has the previous device page at the top, Home second, and the next device
page third. The PANIC key on the camera pages is still at the bottom right. Start Up, Re connect and Start Up v2
now use Clear now in place of the old Singular "take out all". Stop Stream takes Thank You out, and Start Stream
brings Starting Soon in.

## Recovery
| Problem | What to do |
|---|---|
| A graphic is stuck on screen | **Animate out** (column 6, top). If that does nothing, use **Clear now** (column 6, second) |
| A graphics key stays dark red | The Overlays connection or the graphics browser is down. Check the Overlays connection in Companion and the vMix browser input. Use **Refresh catalog** on Home or page 2 once it is back |
| The wrong camera is live | Use the camera keys in column 0, or Merge |
| A camera gesture key is out of step (yellow label when you did not expect it) | Press it once more to finish the second step. Then press **Center cam 1** if the camera did not come back |
| The bimah is muted by mistake | **Bimah Mute** (column 7, bottom) toggles it back. The key colour shows the state |
| Lost on the deck | **Home** (column 7, second key) from any page |
| Everything is wrong | Roll back as in [IMPORT-ROLLBACK.md](IMPORT-ROLLBACK.md) |

## What is not here
Some graphics existed only in Singular and have no published cue yet, so they have no key. They include the
HHD honours and names, Benediction, If It Be Your Will, Who By Fire, the Second Seder set, Chanukah 1–2,
Or Zarua, "Money pls" and the Special "Center" tool. The full list is in
[CAPABILITY-COVERAGE.md](CAPABILITY-COVERAGE.md), and the decision on each is in
[OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) Q8. Pages 27–28 are left empty for growth.

**Removed keys.** These keys held only a Singular graphic that has no published cue, so they were removed:
- "Center Tool" on Startup tools (53)
- "Chanukah 1" and "Chanukah 2" on Audio presets (56)

Start HHD Stream on Home keeps its stream and recording actions but no longer brings up the "Money pls" panel.
On Cameras (30), **Merge dinner (Seder)** is carried *disabled*, exactly as it was on the old Seder page, so
pressing it does nothing until it is enabled in Companion.
