# Switching the Stream Deck to Overlays — import sheet

For: Michael (or whoever does the import on the production desktop).
File: `ProductionDSKTP-2026-09-16.overlays.companionconfig`
Built from: your Companion export of 16 September 2026. Everything that is not a graphics button (cameras, vMix, X32, OBS, Reaper, VLC, triggers, camera loops, both Stream Decks' settings) is carried over exactly as it was.

## What changes for you

- 832 of your 908 graphics buttons now drive Overlays instead of Singular. They sit in the same places with the same labels and colours.
- Most graphics buttons are now one press to show, one press to take out. The button turns **amber** the moment it's requested and **red** once the graphic is actually on screen. Red means it's really up — that's new; Singular never confirmed anything.
- If the button goes **dark red**, Companion has lost contact with Overlays. Check the Overlays connection.
- A **CLEAR NOW** button takes any graphic off instantly. There is one on the Home page (top row, third button) and one on page 53, "Overlays".
- Page 53 also holds the second panels of long prayers that didn't have a button before (Kiddush long 2, Kol Nidre 2 and 3, Sim Shalom 4, Mizmor L'David 2, Unetane Tokef 2, Festival Kiddush 2, Psalm 23 part 2).
- 76 buttons still point at Singular, untouched: the High Holy Day name cards and honoree cards, Seder graphics and Who By Fire. Nothing is dead — Singular still works for them as before.
- **The per-service buttons have moved over.** Student name, the two-line student card, Torah readings 1-7, Haftarah readings 1-3, guest name and the three Remember Them cards now drive Overlays. You never retype their labels again: the button's second line shows the current name by itself, and it changes within a few seconds of somebody saving the names on the website's **This service** page. A button whose name has not been filled in yet is dimmed and shows only its label, and pressing it puts nothing on screen.
- "Starting Soon" now shows only the lower third; the right-hand side panel is gone (Overlays draws one graphic at a time).
- The CRC Logo buttons now turn the Overlays scan card on and off instead of the Singular logo.

## Before you import

1. In Companion, go to **Import / Export → Export** and save a **Full configuration** export. Name it with today's date. This is your way back if anything is wrong.
2. Make sure the Overlays module is installed. In Companion go to **Connections → Add connection** and search for **CRC Overlays**. If it isn't there, install `crc-overlays-1.6.0.tgz` (ask Daniel for the file) through **Modules → Import module package**, then look again.
3. Make sure the Overlays output is already an input in vMix (a browser input pointing at the Overlays output URL). If you've been running the parallel trial, it already is.

## Import

4. **Import / Export → Import**, choose the file. Pick **Full import** and let it replace pages and connections (the file contains your whole setup, including your cameras and Singular connections, so nothing is lost). Let it import triggers, custom variables and surfaces too.
5. Companion will take a moment. The Stream Decks will redraw.

## After the import

6. Go to **Connections**. You should see your three Singular connections, still enabled, and a new one called **Overlays** in the Overlays group. It will show a warning until it's paired.
7. Pairing: on the Overlays website, go to **System → People → Paired devices** and create a pairing code for a Companion. Back in Companion, open the **Overlays** connection, paste the six-digit code into **Pairing code**, and save. The status should turn green within a few seconds.
8. Test with the Overlays output visible in vMix preview: press **Barechu** on Kab Shab 1. It should go amber, then red, and the graphic should appear. Press it again to take it out. Press **CLEAR NOW** on Home and confirm it clears whatever is up.
9. Open any converted button in Companion's editor and confirm **Allow style changes** is on (it should be — this is what lets us update labels later).

## If something is wrong

Import the backup you made in step 1 (Full import, replace everything). You are back exactly where you started.

## Things to tell Daniel

- Whether the CRC Overlays module was already installed or you had to install it.
- Anything that lit amber but never went red (that means requested but not rendered — the output browser in vMix may not be open or connected).
- Any button you use that is missing or in the wrong place.
