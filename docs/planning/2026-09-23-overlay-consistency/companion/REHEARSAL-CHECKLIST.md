# Rehearsal checklist: fresh preset on the real decks

For Michael, on the booth PC and both Stream Deck XLs, with Daniel watching the program output and the site.
Written 2026-09-23.

**The automated audits do not prove hardware.** `audit-companion-preset.mjs` proves what is inside the file:
- navigation, bindings and camera actions
- no credentials
- that the file survives Companion 5.0.3's import upgrade

It cannot show whether a camera moved, vMix switched, the X32 muted, or a graphic appeared. Only this
checklist can. Do it with no service live. Mark each line pass or fail, and stop at the first failure that
touches the stream or the audio.

## A. Import (Michael)
| # | Step | Expected result |
|---|---|---|
| A1 | Export a full backup from Companion first | A dated `.companionconfig` saved next to the rollback file |
| A2 | Connections → Overlays shows module 1.7.0 (install `crc-overlays-1.7.0.tgz` first if not) | The version reads 1.7.0. The status is OK, not red |
| A3 | Import the preset as in IMPORT-ROLLBACK.md (buttons, triggers and custom variables reset-and-import; connections unchanged) | The import completes without an error |
| A4 | Connections list | The same connections as before, same status, **no new disabled connection** |
| A5 | Both decks | Both show page 1 Home, with the service keys in columns 0–1 |

## B. Navigation (Michael)
| # | Step | Expected result |
|---|---|---|
| B1 | Home → Friday ▸, then Next ▸ five times | Fri 1 → Fri 2 → … → Fri 6. The next Next ▸ goes to Home |
| B2 | From Fri 6, press ◂ Prev repeatedly | Fri 6 → … → Fri 1, then Home |
| B3 | The same for Shabbat AM (10–16), B'nai Mitzvah (17–18) and Holy Days (19–25) | Each chain stays inside its service and ends on Home |
| B4 | Anytime, Memorial, Kol Nidre · Neilah (lands on HHD 6), Havdalah, Cameras, Devices, AV / Stream, Output & Audio | Each lands on the named page |
| B5 | Home (column 7, 2nd key) from several device pages | Always page 1. The label shows the page name |
| B6 | The labels ◂ Prev / Next ▸ | The arrow glyphs render (not boxes). If they show as boxes, tell Daniel |

## C. Graphics (Michael presses, Daniel watches the output)
| # | Step | Expected result |
|---|---|---|
| C1 | Home → Refresh catalog | Graphics keys are not dark red |
| C2 | Anytime → Starting Soon, then the same key again | Amber → red while it is on screen. The second press animates it out and the key returns to navy |
| C3 | Fri 5 → Aleinu 1/4, 2/4, 3/4, 4/4 in order | Each part replaces the previous one. Only the current key is red |
| C4 | Any graphic up → Animate out (column 6) | It animates out |
| C5 | Any graphic up → Clear now (column 6) | It disappears at once |
| C6 | Logo on/off (column 6), with nothing on screen, pressed twice | The corner logo appears and the key is lit, then it goes. The logo hides under a graphic and returns after it |
| C7 | Output & Audio → Logo ON / Logo OFF | Same as C6 |
| C8 | Be Right Back (column 6, bottom), pressed twice | In, then out |
| C9 | Spot-check one key on each service page 3–26 against MANIFEST.md | The graphic on screen matches the label |
| C10 | Stop the vMix browser input for 30 s | Graphics keys turn dark red. They recover when it returns |

## D. Cameras and vMix (Michael, Daniel watches program)
| # | Step | Expected result |
|---|---|---|
| D1 | Center cam 1 / Left cam 2 / Right cam 3 / Merge on any service page | vMix merges to that input, and the key shows tally |
| D2 | Fri 1 → Hareini: press once, then again | 1st: the graphic comes in, Left goes to preset 3, and after about 1.3 s vMix merges to left cam 2. The label turns yellow. 2nd: the graphic goes out and vMix merges to center cam 1 (no Center preset move) |
| D3 | Fri 3 → Bar'chu: press once, then again | 1st: the graphic comes in, Door cam goes to preset 5, then merges to right cam 3. 2nd: the graphic goes out, Center goes to preset 1, then merges to center cam 1 |
| D4 | Fri 2 → L'cha Dodi 1 (gesture), 2–8 (plain), 9 (gesture, press twice) | 1: Door cam preset 4 and right cam 3. 9's second press returns to Center preset 1 and center cam 1 |
| D5 | Page 30 F1, with the second deck visible | vMix previews input 2, and the **other** deck jumps to Cam · Left (38) |
| D6 | Page 30 Start PreRoll / End PreRoll | The same as the old AV page keys |
| D7 | A camera page (38–42) → recall and save one preset you normally use | The camera moves / saves exactly as before |
| D8 | A camera page → PANIC (bottom right), only if safe | The same behaviour as before |
| D9 | AV / Stream (52) → Start SC Loops, then Stop SC Loops | The loop triggers run and stop (vMix key presses) |

## E. Audio (Michael, Daniel listens on the stream)
| # | Step | Expected result |
|---|---|---|
| E1 | Bimah Mute (column 7, bottom) on any page, pressed twice | X32 /ch/26 and /ch/27 to bus 11 mute and then unmute. The key colour follows |
| E2 | Home → Booth Mic Mute, pressed twice | /ch/30 mutes and unmutes. The key follows |
| E3 | Output & Audio → Bimah +5, press again; Bimah −8, press again | Bimah level on the stream bus rises / drops, then returns to 0. The key colour follows |
| E4 | Output & Audio → Mute bimahs (stream), pressed twice | The stream sends of the bimah mics mute and unmute |
| E5 | ARD audio preset / Computer audio preset | X32 scene 2 / 7 loads as before |
| E6 | Close audio (only when safe) | The main fader fades down as before |

## F. Stream and recording (only on a test stream)
| # | Step | Expected result |
|---|---|---|
| F1 | Home → No-prod Start Stream, on a test stream only | The same sequence as before: Start Up, the B'nai Mitzvah save key, Start Stream. The key turns grey while streaming |
| F2 | Home → No-prod End Stream | The stream stops, and Thank You animates out |
| F3 | Home → Music Rec | Reaper arms and records as before |

## G. Sign-off
| # | Step | Expected result |
|---|---|---|
| G1 | Michael and Daniel agree the deck is usable for the next service | Both initials and the date noted in the release folder |
| G2 | If any line failed | Roll back as in IMPORT-ROLLBACK.md and report the line number |
