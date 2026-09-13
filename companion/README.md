# CRC Overlays for Bitfocus Companion 5

Native Companion controls for the CRC Overlays API. Every button activation receives a stable command ID and increasing controller sequence before network work begins. Retries keep both values, so a delayed **In** cannot supersede a later **Clear now**. Cue choices and presets come from the authenticated API catalog.

Requests have bounded timeouts, feedback polling is single-flight, and delayed responses cannot replace a newer revision or survive a connection reconfiguration.

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
- Control key: the deployment's `CONTROL_KEY`. Companion stores this `secret-text` field in its secrets store; it must not be put in button text, logs, screenshots, or shared exports.
- Poll interval: 500-5000 ms; 1000 ms is the default.

The preset section includes every cue in the last validated catalog, animated **Animate out**, and immediate **Clear now**. Use the **Refresh cue catalog** action after publishing newly reviewed cues; a temporary or invalid response retains the previous list.

## TBI package

The Temple B'nai Israel archive is not built from this source tree. `scripts/build-tbi-companion-module.mjs` derives it deterministically from the reviewed CRC archive (`public/downloads/crc-overlays-1.2.0.tgz`), rebranding the manifest to id `tbi-overlays`, name **TBI Overlays**, and default base URL `https://tbi-overlays.vercel.app`. Wire-protocol identifiers are left untouched. Because Companion keys installed modules by manifest id and the two ids differ, both modules can be installed in one Companion at the same time, each with its own connection and its own workspace control key. `scripts/audit-companion-packages.mjs` re-derives the archive and checks it byte for byte against the committed file.

## Operator feedback

- Amber **Requested**: the API accepted that desired cue/revision.
- Green **Rendered**: a graphics browser has a fresh heartbeat and reports that exact cue/revision settled.
- Red **Disconnected**: the API poll is stale/unavailable or no graphics browser heartbeat is fresh.

Rendered is deliberately not labeled "on air." It proves browser render state only; it is not a vMix/OBS program tally.

## Current limits

CRC-first single-output operation only. Catalog refresh is explicit rather than periodic. Physical Stream Deck operation, broadcast tally, vMix/OBS integration, and failure rehearsal remain outside this milestone.
