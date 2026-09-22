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

Each cue preset uses **Toggle cue**, which shows the cue with its In animation or animates it out when it is already the requested cue; **Show cue** and **Animate cue out** remain available as separate actions. The preset section includes every cue in the last validated catalog, animated **Animate out**, and immediate **Clear now**. Use the **Refresh cue catalog** action after publishing newly reviewed cues; a temporary or invalid response retains the previous list.

## TBI package

The Temple B'nai Israel archive is not built from this source tree. `scripts/build-tbi-companion-module.mjs` derives it deterministically from the reviewed CRC archive (`public/downloads/crc-overlays-1.6.0.tgz`), rebranding the manifest to id `tbi-overlays`, name **TBI Overlays**, and default base URL `https://tbi-overlays.vercel.app`. Wire-protocol identifiers are left untouched. Because Companion keys installed modules by manifest id and the two ids differ, both modules can be installed in one Companion at the same time, each with its own connection and its own workspace control key. `scripts/audit-companion-packages.mjs` re-derives the archive and checks it byte for byte against the committed file.

## Operator feedback

- Amber **Requested**: the API accepted that desired cue/revision.
- Green **Rendered**: a graphics browser has a fresh heartbeat and reports that exact cue/revision settled.
- Red **Disconnected**: the realtime subscription is closed or no graphics browser presence has arrived for 30 seconds. It is shown after a 3 second grace window, so a sub-second reconnect does not flash the buttons red.

Rendered is deliberately not labeled "on air." It proves browser render state only; it is not a vMix/OBS program tally.

## Current limits

CRC-first single-output operation only. Catalog refresh is explicit rather than periodic. Physical Stream Deck operation, broadcast tally, vMix/OBS integration, and failure rehearsal remain outside this milestone.

Slots (1.6.0) are the graphics whose text changes weekly and whose identity does not: a button points at a slot's cue id forever, the words are typed on the site's **This service** page, and the module publishes each slot's text as `slot_<key>` so the button label follows by itself. The slot list is server-side data — a deployment that does not carry it answers the bare catalog and the module simply has no slot variables. Slots are read only here: nothing in the module writes a slot's text.
