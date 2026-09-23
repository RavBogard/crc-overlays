# Capability coverage: original export → fresh preset

Source: `ProductionDSKTP-2026-09-16-source.companionconfig`, read by script with every connection `config`
removed, so no credentials were read out or written. The inventory covers every action and feedback on
every button step, including nested groups and disabled entries, plus the 6 triggers.

The export holds 101 distinct (connection, action) rows. In the new design:
- **91 are preserved.** The same action and options live at a new location; a few only have their page
  references remapped.
- **8 are replaced.** These are the Singular overlay actions; CRC Overlays module actions do the same job.
- **2 are intentionally dropped.**

Page numbers in "New location" are the new page numbers from PRESET-DESIGN. "Carried" means the whole
device page is kept with its grid (31–56).

Count = total entries; dis = entries already disabled in the original.

## Cameras (birddog-ptz 3.4.1)
| Connection | Action (count / dis) | Original pages | New location |
|---|---|---|---|
| Center | recallPset 77/0 | 1, 18–19, 76–78, 80–82, 85, 88–98 | Carried camera pages. Fri camera-gesture returns (preset 1) on pages 4–8. Security Cam (Home c4r0, Cameras c2r3). Camera-page PANIC keys |
| Center | savePset 48/0 · expCompLvl 7/0 · focusM 8/0 · ir_cutfilter 1 · picFlip 1 · preset_speed 1 · stabilizer 1 (+fb) · wb_mode 1 (+fb) | 18, 79–98 | Carried pages 31–49, 53 (Startup tools) |
| Left | recallPset 66/0 | 1, 18–19, 76, 79–99 | Carried pages. Fri gesture presets 1/3/4 (Candle Blessing, Hareini, Mah Tovu). Security Cam. Startup |
| Left | savePset 44 · pt 17 · expCompLvl 1 · focusM 2 · ir_cutfilter 1 · preset_speed 1 | 18, 44, 79–98 | Carried pages 31–51 (pt joystick = PTZ pad · Left 51) |
| Door_Cam (steve), vMix "right cam 3" | recallPset 96/2 | 1, 18–19, 75–78, 80–82, 85, 88–99 | Carried pages. Fri gesture presets 2/4/5 on pages 4–8. Right cam no overlay (Cameras c2r2). End PreRoll. Security Cam |
| Door_Cam | savePset 60 · pt 17 · expCompLvl 11 · focusM 4 · ir_cutfilter 1 · picFlip 1 · wb_mode 1 (+fb) · zoom 1 | 18, 43, 79–98 | Carried pages 31–50 (pt joystick = PTZ pad · Right 50) |
| Free_Cam (dorothy) | recallPset 28 · savePset 24 · preset_speed 2 · pt 1 | 82, 84, 86, 88, 93, 97, 99 | Carried pages 35, 36, 42, 43, 45, 46, 52 |
| Black_Cam (bima) | recallPset 33/1 · savePset 12 · picFlip 5 · focusM 2 | 1, 18–19, 80–99 | Carried pages (41 Cam · Bimah and every camera page's panic/home). Security Cam |

## Switcher and audio
| Connection | Action (count / dis) | Original pages | New location |
|---|---|---|---|
| vmix | command 185/5: `merge preview=&duration=1000` | 1–19, 80–99 | c0r3 **Merge** on every service page, and camera pages' "M" keys (carried) |
| vmix | command: `merge input=center cam 1 / left cam 2 / right cam 3&duration=1000` | 75–78 | c0r0–r2 on every service page. Camera-gesture step 1 and the return |
| vmix | command: `cut input=PANIC`, `OverlayInput1–4Off`, `startrecording` | 18, 80–98 (r3c7 panic) | Carried camera pages, same cell |
| vmix | command: `startstreaming`, `stopstreaming`, `stoprecording`, `SnapshotInput …` | 1, 75, 88, 99 | Home c3 (No-prod start/end, Start HHD). Carried 52 AV / Stream, 54 Self-production, 42 Dorothy |
| vmix | command: `merge input=dinner`, `merge input=bima cam 4` | 21 (Seder) | Cameras c3r2, c3r3 |
| vmix | previewInput 75 · programCut 1 · toggleFunctions 9 · busXAudio 4/1 · keyPress 26/10 | 1, 18, 21, 72, 75, 80–99, triggers | Carried pages. Cameras F1–F6 (P72). Home No-prod Start (programCut 3). Page 2 c4r2 Bus X audio. Triggers unchanged |
| vmix | inputLive fb 45/9 · inputPreview fb 5 · status fb 7 | 1, 18, 80–99 | Carried pages. Tally feedback on the c0 camera keys. Stream status on Home c3 |
| x32 | mute_channel_send 408/208: /ch/26 + /ch/27 → 11/on (Bimah Mute) | 34 pages, r3c7 | c7r3 **Bimah Mute** on every service page and Home. The six disabled /ch/01–02 sends inside that button are carried disabled, as they were |
| x32 | mute_channel_send: /ch/01–02 → 02–05/on (mute bimahs for stream), /ch/30 → 11/on (booth) | 1, 16, 46–50, 75, 79, 97, 99 | Page 2: c2r2 Mute bimahs (stream), c2r3 Booth Mic Mute. Home c4r1. Carried 53/54 |
| x32 | level_channel_send 52: /ch/01–02 → 04/level ±5 / −8, 1000 ms, with bgcolor | 6, 20, 23, 46–50 | Page 2: c2r0 **Bimah +5 (stream)**, c2r1 **Bimah −8 (stream)**. Carried 56 |
| x32 | mute 18/4 (+fb 4/1) · mute_channel_send fb 48/8 | 1, 16, 97, 99 | Booth Mic Mute logic button (Home c4r1, page 2 c2r3). Bimah Mute feedback |
| x32 | fad 11/4 · go_scene 4/1 · solo 6/1 · clear-solo 2 · select 2 · sends-on-fader 2 · fader_level fb 1 | 20, 75, 79, 99 | Page 2 c3 (ARD scene 2, Computer scene 7, Close audio). Carried 52, 53, 54, 56 |
| reaper | autorecarm · record · recordStatus fb (goto_region disabled) | 1 | Home c3r3 Music Rec (disabled goto_region carried disabled) |
| vlc | play · pause · stop · playID 6 · c_status fb 3 · c_cue fb 3 | 83 | Carried 55 Media Player |
| obs | start_recording 1/1 · stop_recording 2/2 | 99 | Carried 52 as they were (all disabled). Recording runs through vMix |

## Internal (Companion)
| Action (count / dis) | New location |
|---|---|
| set_page 99 | Explicit Prev/Next/Home on every page. Home and hub jumps. Every carried target remapped (for example 92→38, 87→49, 99→52) |
| pageup / pagedown / pagenum controls | Replaced by explicit `set_page` chains (no runs into other services or blank pages) |
| button_pressrelease 10 · button_press 2/2 | Home No-prod Start/End and Start HHD. Carried 52. Locations remapped (`99/0/0`→`52/0/0`, `93/1/0`→`35/1/0`) |
| wait 126/10 · action_group 57/7 · logic_if/logic_operator (+fb) · logic_while 1 · bgcolor 40 · custom_variable_set_value 31 · variable_value (+fb 22/2) · trigger_enabled (+fb) · bank_pushed fb 42/3 · exec 4/1 · app_restart 1 · panic 14 | Carried with their buttons (Security Cam, Booth Mic Mute, bimah ±, SC loops, Dorothy timing switch, stream.bat, Restart BFC, camera PANIC). The camera gesture uses `wait 1300` |
| instance_control 72/21 | Carried Start Up / Re connect / Self-production. Entries that toggle the three Singular connections are removed, because those connections are removed |
| bank_current_step (+fb 695) | Kept on camera-gesture two-step buttons and carried device pages. Plain cue buttons use module `requested`/`rendered` feedback instead |
| **panic_bank 2 — dropped** | Only used by the timed Aleinu auto-advance (orig p11 Shab Morn 5). Daniel: no timed auto-advance |
| **button_release 1/1 — dropped** | Disabled; part of the same Aleinu auto-advance chain |

## Singular overlays (replaced by the CRC Overlays module)
| Connection | Action (count / dis) | Replacement |
|---|---|---|
| Master_Composition (All Overlays) | animateIn 733/16 · animateOut 740/16 | `toggle_cue {cue}` (one step), or `show_cue` + `animate_out` (camera gesture). Bound to published cue IDs in CUE-MANIFEST |
| Master_Composition | "CRC Logo" comp (Toggle Logo) | `logo_toggle` (c6r2 everywhere), `logo_on`/`logo_off` (page 2) — the Siona resting logo |
| Master_Composition · Special | takeOutAllOutput 4/1 · 2 | `clear_now` (c6r1 everywhere; inside Start Up / Re connect on 52) |
| Special | animateIn 64/1 · animateOut 63/1 | `toggle_cue`: Starting Soon 0cd20c42 ("Start soon right"), Guest name bb52a63a, Student name / Student names (two lines), Torah and Haftarah reading 1–7 / 1–3, Remember Them 1–3, Shalom Alechem small, Mizmor L'David 1–2 |
| HHD | animateIn 196 · animateOut 194 | `toggle_cue` on HHD 1–7 / Memorial |
| — | Stop Stream's "animate out Thank you" | `animate_out` 09f50803 |

## Buttons removed from carried pages (Singular-only, no published cue)
Accepted by the main thread 2026-09-23. Each button held only Singular overlay actions for a composition with no
published cue. Once those actions were replaced, it would have been an empty key, so it was removed.
- **Startup tools (53) r0c1 "Center Tool"** (orig p79). It held Special "Center" in/out.
- **Audio presets (56) r1c5 "Chanukah 1"** and **r1c6 "Chanukah 2"** (orig p20). They held Special "Chanukah 1–2" in/out.
- **Home "Start HHD Stream"** (orig p1 r0c3). The key stays, but its HHD "Money pls" animate-in was taken out.
  Its vMix recording/streaming and button presses are kept.

The **Cameras (30) r2c3 "Merge dinner (Seder)"** key carries `merge input=dinner` **disabled**, exactly as the
original Seder "Dinner!" key's first step was.

## Original graphics with no published cue (not bound; the device actions around them are kept)
These are content gaps, not device capabilities. They came from the Singular compositions.
- **HHD honours / names (22):** Alter, Bennetts, Exec Committee, Garden, Gilbert, Goldman, Harris,
  Lazaroff Hanes, Levy, Massa, Mourning Families, Nelson-Zoole, Penrod, President, Presidential Families,
  Rehbein, Roccia, Speigel Corps, Torah From Scratch, Undressers, Wirthing-Mass, Young.
- **HHD texts:** Benediction / HHD Benediction, (May It Be a) Good Year, If It Be Your Will 1–2,
  Ki Anu Amecha 1–2, May the Doors, This Year, Tefilati, Who By Fire 1–3 (archived, no replacement),
  Shofar Call 1.1 / Malchuyot (archived, no replacement), "Money pls" (Start HHD), HHD Logo.
- **Second Seder (page 21):** Karpas, Yachatz, Ma Nishtana, Avadim Hayinu, In Every Gen 1–2, Plagues,
  Dayenu, Matzah Blessing, Birkat Hamazon. **Chanukah 1–2** (page 20). **Or Zarua** (Fri, Special comp).
  Special "Center" (Startup tools).
- **Superseded, not missing:** the archived duplicates and old splits (Mourners Kaddish 3, Vahavta trans,
  Avot/Yotzer/G'vurot/Avodah "Trans/interp" drafts, the 5-part Shiru bottom set, the 9-part Readers Kaddish 2
  split, 4× Copy of Thank you) are covered by the published drafts bound in the manifest.

## Connections
The preset uses the existing connections on Michael's machine: vMix, six BirdDog PTZ, X32, Reaper,
VLC and obs, plus the CRC Overlays connection. The three Singular Studio connections are removed. The
BirdDog_NDI and Spotify_WIP connections are unused (0 actions) and left alone. The preset file itself
must hold no connection configs; see OPEN-QUESTIONS Q4.
