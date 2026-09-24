# CRC Overlays for Bitfocus Companion 5

Native Companion controls for the CRC Overlays API. Every button activation receives a stable command ID and increasing controller sequence before network work begins. Retries keep both values, so a delayed **In** cannot supersede a later **Clear now**. Cue choices and presets come from the authenticated API catalog.

Requests have bounded timeouts, feedback arrives over a single realtime subscription, and delayed responses cannot replace a newer revision or survive a connection reconfiguration.

## Build and install

Use Node 22.20 or newer in the Node 22 line:

```powershell
npm ci
npm test
npm run lint
npm run package
```

`npm run package` also writes `definitions.json` beside `package.json`: the action and feedback ids, names and option ids of the packaged version, which the deck validator (`lib/companion-deck/validate.ts`) checks decks against. Commit it with each new package; `tests/definitions.test.ts` fails if the source drops or changes anything it lists (source may add definitions before the next package). It is not part of the packaged archive. Each packaged version's definitions are also kept as `definitions/<version>.json`: a deck keeps asking for the module version it was built for (CRC's released deck asks for 1.7.0), and is validated against that version's definitions.

The package command creates a Companion module archive in this directory. In Companion 5, open **Settings > Advanced > Developer modules** to load this directory for development, or install the generated archive using Companion's module installation UI. Add a **CRC Overlays** connection and set:

- Overlay base URL: `https://overlays.centralreform.org` by default, or another deployment.
- Pairing code: six digits issued from the deployment's setup page. See below.
- Device token: written by the module when a code is accepted; it is not typed by hand.
- Control key: the deployment's `CONTROL_KEY`. Companion stores this `secret-text` field in its secrets store; it must not be put in button text, logs, screenshots, or shared exports.

## Pairing

1. An owner or editor opens the deployment's setup page and creates a code for this computer.
2. Enter it in **Pairing code** and save the connection.
3. The module posts the code to `/api/pairing/redeem`, receives a device token, stores it in **Device token**, and clears the code. Codes are single use and expire ten minutes after they are created.
4. Every later request carries `Authorization: Bearer <device token>`. The pairing survives Companion and machine restarts and ends only when the device is revoked.

**Control key** takes precedence whenever it is set, so a 1.3.0 configuration upgrades in place with nothing to change. A refused code writes nothing: the previous credential stays, and the refusal text becomes the connection status.

## Variables

`current_*` describe what a graphics browser reports rendered; `requested_*` describe what was asked for. `current_name` (Current graphic), `current_panel` (Current panel), `panel_count` (Panels), `connection` (Connection) and `requested_name` (Requested graphic) join the 1.3.0 set `requested_cue`, `revision` and `renderer_status`, which keep their meanings so existing buttons do not break.

`bug` (Scan card) is `On` or `Off`, and `bug_page` (Scan card page) is the short page beside the card or blank. A deployment that does not carry a scan card publishes `Off` and a blank page rather than nothing at all.

`connection` is `Connected`, `Reconnecting` or `Disconnected`, reusing the same 3 second grace window as the red indicator. `current_panel` and `panel_count` are read from the published multipart name convention (`Mah Tovu — 01 of 03`, em dash) and are blank whenever a name does not match it; they are never guessed. The **Connection and current graphic** and **Current panel** presets show them on a button.

## Scan card and panels

**Bug on** shows the scan card and keeps whichever page the live state already carries; **Bug off** hides the card and its page; **Set page** shows the card with the page typed into the action. A page is at most twelve characters of letters, digits, spaces and light punctuation, checked in the module before any request leaves it, so an over-long page never reaches the deployment. **Clear now** removes the card along with the graphic; **Animate out** leaves it alone. A deployment with no scan card configured refuses these actions and the refusal becomes the connection status, exactly as other refusals do.

**Next panel** and **Previous panel** work on any multipart graphic, not on one feature. The target is derived from the graphic on screen and the catalog alone: from panel *n* of *m* they show panel *n+1* or *n-1*, wrapping at either end of the set. From a single-part graphic, a cleared output, or a graphic that is not in the catalog, they show panel 01 of the set chosen in the action's **Panel set** option; with **None** chosen there is nothing to derive and nothing is sent. Nothing about the position is stored on the server, so two Companions and the console never disagree about where the set is.

A set is a title *and* the graphics it belongs to, never the title alone. A names list typed into one service appears in the **Panel set** list as *“Mi Shebeirach (names for this service)”*, separately from a published **Mi Shebeirach** and from another service's list of the same name, and navigation never crosses between them.

The **Scan card** preset toggles the card and lights while it is visible; the **Next panel** preset ships with no set chosen.

The **Resting logo** preset (1.7.0) toggles a different thing, and the two are never the same button. The scan card is the QR panel with its caption and page; the resting logo is the congregation's own artwork, small in the bottom-right corner of an otherwise empty output. **Resting logo on** / **off** / **toggle** change a setting that the site remembers across an output reload, a reconnect and a relay restart — not a picture. The site keeps the mark off screen under any graphic and under the scan card, and brings it back only once the graphic has finished animating out, so turning it on mid-prayer is a real change that shows nothing until the prayer clears. **Clear now** turns the setting off along with everything else, so after an urgent clear the mark waits for a deliberate press.

Two feedbacks say the two halves of that, because one lamp would have to lie about one of them: amber **Resting logo enabled** is the setting, grey **Resting logo held back** means it is enabled and something else is currently up. `$(overlays:logo)` is `On`/`Off`; `$(overlays:logo_state)` adds `On (held)`. Neither is a rendered report — no graphics browser acknowledges the corner mark, and **Rendered** remains the only feedback here that waits for one. A congregation whose deployment has no resting logo configured simply never gets a mark; the actions are refused in plain words.

Each cue preset uses **Toggle cue**, which shows the cue with its In animation or animates it out when it is already the requested cue; **Show cue** and **Animate cue out** remain available as separate actions. The presets include every cue in the last validated catalog, animated **Animate out**, and immediate **Clear now**.

The catalog refreshes itself. The realtime connection announces every new catalog version (and every snapshot carries the current one), and the module re-reads and re-validates the catalog as soon as its version changes, redeclaring actions, feedbacks, variables and presets; a newly published graphic reaches the preset list within seconds, with nobody pressing anything. **Refresh cue catalog** is the manual fallback for a publish that did not reach the booth. A temporary or invalid response always retains the previous list.

## Preset sections (1.8.0)

Presets are grouped the way the deck is. The catalog envelope (`GET /api/catalog?include=slots`) carries, under its own `roles` key, each cue's role on the deck and, for a multipart set, the set's id, name, panel index and panel count. The server derives them from the deck model (`content/cue-roles.json`, generated by `scripts/build-cue-roles.mjs` from CRC's seed deck), where they used to exist only in CUE-MANIFEST.json. With roles, the preset list reads:

- **CRC Overlay Controls**: Animate out, Clear now, Resting logo, Scan card, Set page, Next/Previous panel, Refresh catalog, Connection and current graphic, Current panel, and **Last command came from**.
- **CRC Overlay Sets**: one group per multipart set, its parts consecutive and in panel order (Mourner's Kaddish 1, 2).
- **CRC Overlay Prayers**, **Alternates**, **Short selections**, **Announcements**, **Utility graphics**: the graphics the deck gives those roles.
- **CRC Overlay Slots**: the weekly slot presets.
- **CRC Overlay Other graphics**: anything the deck does not place yet, such as a graphic published since the deck was built, or a names list.

Empty sections are left out. A cue with a role takes the deck's colour for that role, from the same palette the deck renderer uses: teal for a set part (and for an alternate that belongs to a set), burgundy for prayers, alternates and short selections, navy for announcements and utility graphics, all with white text. A cue without a role keeps its category colour. A web that sends no `roles` (anything before this change) gets exactly the 1.7.0 behaviour: one flat **CRC Overlay Controls** section, coloured by category. A malformed role entry is dropped on its own and never costs the catalog. A module older than 1.8.0 ignores `roles`.

The palette has one source, `lib/companion-deck/palette.ts`, beside the deck renderer. The module cannot import web code at runtime, so `npm run build` (`scripts/write-palette.mjs`) copies that file verbatim into `src/palette.ts`, which is committed. `tests/presets.test.ts` here and `tests/cue-roles.test.ts` in the repository root fail when the copy is stale.

**Last command came from** shows `$(overlays:last_source)` (`Agent`, `Companion` or `Console`, blank until the service reports it) and turns purple on the `last_source_agent` feedback while the newest press came from an AI agent through the MCP live tools.

### What a preset cannot carry

A module preset can hold only this module's own actions and feedbacks. It can never contain a vMix merge, a PTZ camera recall, an X32 mute or any other device's action, and it cannot light from a vMix tally. Keys that pair a graphic with a camera move (the camera gesture), switcher keys, Bimah Mute and the carried device pages exist only on the deck: they come from the stored deck model (`lib/companion-deck`), exported as a Companion config and imported in Companion. Presets are for adding or replacing a single graphics key by hand.

## TBI package

The Temple B'nai Israel archive is not built from this source tree. `scripts/build-tbi-companion-module.mjs` derives it deterministically from the reviewed CRC archive (`public/downloads/crc-overlays-1.8.0.tgz`; the 1.7.0 pair stays in place for booths that have not upgraded), rebranding the manifest to id `tbi-overlays`, name **TBI Overlays**, and default base URL `https://tbi-overlays.vercel.app`. Wire-protocol identifiers are left untouched. Because Companion keys installed modules by manifest id and the two ids differ, both modules can be installed in one Companion at the same time, each with its own connection and its own workspace control key. `scripts/audit-companion-packages.mjs` re-derives the archive and checks it byte for byte against the committed file. The brand strings are kept in `src/brand.ts` and the derivation replaces them by prefix, every occurrence: CRC hosts, preset section ids starting `crc_overlay_` and labels starting `CRC Overlay`. A new preset section that follows those prefixes derives with no change to the script; any other CRC brand string left in `main.js` or `HELP.md` fails the derivation and names the string.

## Operator feedback

- Amber **Requested**: the API accepted that desired cue/revision.
- Green **Rendered**: a graphics browser has a fresh heartbeat and reports that exact cue/revision settled.
- Red **Disconnected**: the realtime subscription is closed or no graphics browser presence has arrived for 30 seconds. It is shown after a 3 second grace window, so a sub-second reconnect does not flash the buttons red.

Rendered is deliberately not labeled "on air." It proves browser render state only; it is not a vMix/OBS program tally.

## Current limits

CRC-first single-output operation only. Module presets carry no device actions (see above): vMix/OBS, cameras and the audio console are reached only through the deck. Physical Stream Deck operation, broadcast tally and failure rehearsal remain outside this milestone.

Slots (1.6.0) are the graphics whose text changes weekly and whose identity does not: a button points at a slot's cue id forever, the words are typed on the site's **This service** page, and the module publishes each slot's text as `slot_<key>` so the button label follows by itself. The slot list is server-side data — a deployment that does not carry it answers the bare catalog and the module simply has no slot variables. Slots are read only here: nothing in the module writes a slot's text.
