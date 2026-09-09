# CRC Overlays for Bitfocus Companion 5

Native Companion controls for the CRC Overlays API. Every button activation receives a stable command ID and increasing controller sequence before network work begins. Retries keep both values, so a delayed **In** cannot supersede a later **Clear now**.

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
- Control key: the deployment's `CONTROL_KEY`. It is masked and must not be put in button text, logs, screenshots, or shared exports.
- Poll interval: 500-5000 ms; 1000 ms is the default.

The preset section includes the three current CRC cue buttons and **Clear now**.

## Operator feedback

- Amber **Requested**: the API accepted that desired cue/revision.
- Green **Rendered**: a graphics browser has a fresh heartbeat and reports that exact cue/revision settled.
- Red **Disconnected**: the API poll is stale/unavailable or no graphics browser heartbeat is fresh.

Rendered is deliberately not labeled "on air." It proves browser render state only; it is not a vMix/OBS program tally.

## Current limits

CRC-first single-output operation only. The cue catalog is the three-cue test catalog and is compiled into this module. Physical Stream Deck operation, broadcast tally, vMix/OBS integration, failure rehearsal, and automatic catalog discovery remain outside this milestone.
