# Companion integration — research synthesis (2026-09-22)

Prepared for Daniel. Three source reports sit next to this file:

- `companion5-platform-research.md` — what Companion 5.0.3 and the module API can and cannot do, read from the v5.0.3 source.
- `graphics-module-patterns-research.md` — how Singular, H2R Graphics, vMix, SPX, NewBlue, ProPresenter and others integrate with Companion, and which patterns are worth copying.
- `audit-report.md` — what our own module, web API and converter do today, and a page-by-page inventory of Michael's 2026-09-16 export.

This memo says what the three reports add up to and what I recommend. Where I recommend something it is marked "recommend"; everything else is context or an option.

## What Michael's file actually is

Companion 5.0.3, export format 12, 99 pages, 1,910 buttons, two Stream Deck XLs (Left always starts on page 1; Right resumes where it was). 908 buttons talk to Singular through three connections: Master Composition (about 1,470 in/out actions), HHD (about 390) and Special (about 130), across 283 distinct composition names.

676 of the 908 Singular buttons are the same shape: press once, the graphic animates in and the button turns red; press again, it animates out and the red goes away. The red comes from Companion's own "which step am I on" feedback, not from Singular — Singular never tells Companion anything. That means Michael has been operating for years with no confirmation that a graphic is actually on screen.

The rest of the 908 are variations that matter for the conversion:

- 106 buttons fire two or three compositions at once. The biggest family is "Starting Soon" (11 pages): a lower third on Master plus a side panel on Special, shown and hidden together. The second family is the CRC Logo under-layer on the HHD pages 45–50 (about 86 buttons): showing a prayer takes the logo out, clearing the prayer brings it back — applied inconsistently.
- 20 buttons on pages 76–78 (Michael's "second set" Kabbalat Shabbat pages) do graphic + camera preset + 1.3 second wait + vMix dissolve in one press. The graphic action has to stay an ordinary action he can sandwich between camera moves.
- There is no standalone panic button anywhere. "Take everything out" only happens inside the startup and reconnect macros on page 99.
- Per-service names are hand-typed into button labels: page 15 has "Student Name Noa" and "Student Name Ezra" firing Singular's "Student Name" and "Student Name 2" compositions. Same pattern for Guest Name, Two Line Student Names, Torah Reading 1–7, Haftarah Reading 1–3, Remember Them 1–3, and the HHD honoree cards.

## The five findings that change the plan

**1. We do not need to rewrite the converter for Companion 5's button format.** Companion 5 still stamps every export "version 12", and its import path upgrades any button that still has the old flat shape (`type: "button"` with `style.text`, `style.bgcolor`) into the new layered shape. The upgrade code dispatches on each button's type, so a file that mixes old-shape buttons (ours) with new-shape buttons (Michael's untouched camera buttons) imports cleanly. Two bonuses: the old shape is the one our converter already writes, and buttons that arrive this way get "Allow style changes" switched on, which new Companion 5 buttons do not. This is confirmed by reading the v5.0.3 source, but it is an implementation detail, so the handoff should say "re-test on Companion upgrade." Recommend: keep the converter emitting the old shape; add a reader for the new shape so it can parse Michael's current file; add a test that imports the output into a real Companion 5.

**2. Our module runs on Companion 5 as-is.** Companion 5.0.3 accepts module API versions 2.0 through 2.1.x; ours is 2.0.4 on the node22 runtime. Do not bump the module base past 2.1.x or Michael's Companion will silently refuse to list it.

**3. Our system is single-output; Michael runs three at once.** Overlays has one cue on screen at a time plus the scan card. Singular let Michael layer a lower third, a side panel and a resting logo. Every product that integrates well with Companion (H2R, SPX, Singular itself) has layers or at least independent graphics. This is the one real product gap the research found, and it decides what happens to 106 of Michael's buttons. Options: (a) accept single output — "Starting Soon" converts to the lower third alone, the side panel is dropped, the logo under-layer becomes the scan card as already ruled; (b) add one more layer to Overlays (a "side panel / resting graphic" slot with its own in/out) so those buttons convert faithfully. I lean (a) for the cutover and (b) as a later decision only if Michael misses the side panel — but it is his call as much as yours.

**4. Nobody in this world types names on the Stream Deck.** Every serious product puts per-service text in a prep surface (a web page or a spreadsheet) and has Companion reflect it. H2R does it with named text tokens that graphics reference; vMix does it with a data source (a sheet) and next/previous-row buttons. Our "Names for this service" feature is already this idea. Recommend: fixed slot graphics per service type (b'nei mitzvah: student name 1-line, student names 2-line, Torah reading 1–7, Haftarah 1–3; Shabbat: guest name; funeral: Remember Them 1–3), edited on one "This service" page in the console, with Michael's buttons pointing permanently at the slots. Then the part Companion research adds: the module publishes each slot's current text as a variable, so the converted button can be labelled `Student\n$(Overlays:slot_student_name)` and reads "Student / Noa" on the deck without anyone relabelling it. That replaces the hand-typed "Student Name Noa" button.

**5. The module already receives more than it uses.** The catalog arrives over a live socket with a version header, presets are regenerated on every catalog change, and each snapshot carries the cue's content — which the module parses and throws away. H2R's whole approach (regenerate actions, presets, variables and feedbacks from every push) is one step from where we are. What is missing is category colouring on presets (every preset is charcoal; Michael's deck is legible because core liturgy is teal, sung liturgy is burgundy, readings are navy), a variable carrying the cue id, and any notion of service or position.

## Things the research says we can do, ranked by how much they help Michael

Each item is scored against your standing test: faster and better, not slower and more bureaucratic.

**A. Old-format converter path (finding 1).** Saves the whole Companion 5 schema rewrite. Recommend.

**B. Slot graphics + slot variables on button labels (finding 4).** Retires about 40 hand-relabelled buttons and is the "modify and drop in overlays quickly" ask. Recommend.

**C. Send commands even when the live socket is down.** Today the module refuses to send a command unless its realtime socket is connected; a press during a 1–30 second reconnect is lost silently. Singular buttons had no such gate. The HTTP command path works without the socket. Recommend: send anyway and show the feedback as unconfirmed.

**D. Truthful colours instead of the step-red.** With real feedback available, the internal step feedback is redundant and competes visually (module amber/green versus his red). Recommend: converted buttons keep the two-press toggle but colour from the module — his familiar red for "rendered" (actually on screen), amber for "requested, not yet confirmed", and the disconnected red-outline. The habit "red means it's up" survives; it just becomes true.

**E. Category-coloured presets.** Make the module's generated presets carry Michael's palette by liturgical category so a preset dragged from the panel looks like it belongs on his deck. Small module change. Recommend.

**F. A real panic button.** He has none. One preset: "CLEAR NOW" (the module already has the action). Recommend, placed on the reserved column-7 row-3 cell of each service page or on Home — his choice.

**G. Service-order variables ("what's on now / what's next").** ProPresenter's best trick. The pieces exist: prepared services on the web side, `serviceRef` accepted by the command API and never sent. You ruled 9/14 "not now, Michael keeps his own pages." The research does not change that ruling; it only notes the cost has dropped. Not recommended for this cutover.

**H. Thumbnails on buttons.** The module could ship a tiny render of each graphic as the button image (NewBlue does this). At Stream Deck size a lower-third render is a coloured bar; text is still what he reads. Not recommended unless he asks.

**I. Mirror his Stream Deck in the web console.** Companion 5's Satellite subscriptions can stream the actual button bitmaps to a browser. Technically neat, no clear use for Michael, who is in the booth with the decks. Not recommended.

**J. Companion-side push from the console.** Because Companion runs on the booth LAN, the Vercel server cannot reach its HTTP API; the module is the only sensible channel for pushing labels or state in. Slot variables (item B) cover the need. No separate work.

## What the cutover file should contain

- All 908 Singular buttons mapped where the catalog has the graphic (Shabbat evening, Shabbat morning and b'nei mitzvah pages map completely once the slot graphics exist and the four Kab Shab spellings — Veehavta 1/2, Veshamru, Or Zarua — are aliased or built).
- Unmapped buttons (mostly HHD, Seder, honoree cards) left pointing at Singular, not marked dead, unless you rule otherwise.
- The three Singular connections kept, enabled, until you say Singular is cancelled.
- Michael's cameras, X32, vMix, OBS, Reaper, VLC, triggers, custom variables, surfaces and image library untouched — the converter copies them through byte for byte.
- One "Overlays" connection with the pairing code flow; the file cannot carry the device token (it lives in Companion's secrets store), so pairing is a one-time step on Michael's desktop after import.
- A new spare page holding continuation panels and the CLEAR NOW button, as on 9/14.

## Verify on Michael's machine before relying on it

1. Open one of his prayer buttons and confirm "Allow style changes" is on (expected: yes, because the buttons came up from Companion 4).
2. Confirm the crc-overlays module shows up in his Companion 5 connections list (module API 2.0.4 is in range; this is a five-second check).
3. After import, confirm one old-shape converted button rendered as a proper layered button with his colours.
