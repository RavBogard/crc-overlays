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

- Overlay base URL: `https://crc-overlays.vercel.app` by default, or another deployment.
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

`connection` is `Connected`, `Reconnecting` or `Disconnected`, reusing the same 3 second grace window as the red indicator. `current_panel` and `panel_count` are read from the published multipart name convention (`Mah Tovu — 01 of 03`, em dash) and are blank whenever a name does not match it; they are never guessed. The **Connection and current graphic** and **Current panel** presets show them on a button.

Each cue preset uses **Toggle cue**, which shows the cue with its In animation or animates it out when it is already the requested cue; **Show cue** and **Animate cue out** remain available as separate actions. The preset section includes every cue in the last validated catalog, animated **Animate out**, and immediate **Clear now**. Use the **Refresh cue catalog** action after publishing newly reviewed cues; a temporary or invalid response retains the previous list.

## TBI package

The Temple B'nai Israel archive is not built from this source tree. `scripts/build-tbi-companion-module.mjs` derives it deterministically from the reviewed CRC archive (`public/downloads/crc-overlays-1.3.0.tgz`), rebranding the manifest to id `tbi-overlays`, name **TBI Overlays**, and default base URL `https://tbi-overlays.vercel.app`. Wire-protocol identifiers are left untouched. Because Companion keys installed modules by manifest id and the two ids differ, both modules can be installed in one Companion at the same time, each with its own connection and its own workspace control key. `scripts/audit-companion-packages.mjs` re-derives the archive and checks it byte for byte against the committed file.

## Operator feedback

- Amber **Requested**: the API accepted that desired cue/revision.
- Green **Rendered**: a graphics browser has a fresh heartbeat and reports that exact cue/revision settled.
- Red **Disconnected**: the realtime subscription is closed or no graphics browser presence has arrived for 30 seconds. It is shown after a 3 second grace window, so a sub-second reconnect does not flash the buttons red.

Rendered is deliberately not labeled "on air." It proves browser render state only; it is not a vMix/OBS program tally.

## Current limits

CRC-first single-output operation only. Catalog refresh is explicit rather than periodic. Physical Stream Deck operation, broadcast tally, vMix/OBS integration, and failure rehearsal remain outside this milestone.
