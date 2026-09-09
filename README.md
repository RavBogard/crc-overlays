# CRC Overlay Control — test milestone

Cloud-compatible controller, durable cue state, and transparent 1920×1080 graphics output. Three archived CRC cues: Barechu, Modeh Ani (Bottom), and Mah Tovu. Branding, renderer, and cue content are separate. This is an engineering rehearsal, not a service-ready Singular replacement.

## Run locally

Start with `node node_modules/vinext/dist/cli.js dev --port 5173`. `.env` supplies CONTROL_KEY and OUTPUT_KEY; never commit keys or Companion exports. Schema migrations live in `drizzle/`.

Controller: http://localhost:5173/. Output: `/output#key=OUTPUT_KEY` (key is moved to tab session storage). Add output to vMix or OBS as a 1920×1080 browser source with transparency. Preview is excluded from output acknowledgments. `work/CONNECTIONS.md` contains private connection details.

## Control contract

`GET /api/catalog`, `GET /api/state`, `POST /api/ack` accept an output or control Bearer key. `POST /api/command` requires a control key. Commands use `action: in|out|clear|cut`, a known `cue` for in/out, and optional `commandId`, `clientId`, and increasing `sequence`. Out clears only its matching cue; clear animates out; cut cancels animation immediately.

The web controller assigns IDs and sequence numbers, retained across reload within the tab. Duplicate command IDs do not replay. Lower sequence numbers for the same controller do not replace newer requests. Separate controllers follow server arrival order. **Generic HTTP Companion test buttons omit ordering metadata: delayed requests can arrive after clear. Do not use this integration in a service until sequencing and retry identity are assigned at activation.**

Output holds its last graphic on disconnection. A renderer expires from status after eight seconds without acknowledgments. Rendered means the browser matched requested state; it does not mean the broadcast is on air. Clear requires working connectivity.

## Companion

Companion 5.0.5 at http://127.0.0.1:8000/. Connection CRC_Overlays_Test uses Generic HTTP Requests 3.1.1. Page 1, CRC Overlay Test: row 0 columns 1–5 are Barechu, Modeh Ani, Mah Tovu, Animate out, Clear now. Physical hardware not verified. Button colours are static; rendered feedback is in the web controller. No CRC production camera configuration was imported.

`scripts/prepare-companion.py` generates a private page import using the installed version's captured template. `work/companion-before.companionconfig` preserves the initial setup. Never share generated configs without removing keys.

## Content and scope

Text is copied from the archived Singular master without editorial changes. The canonical source candidate remains in the separate archive lab; ShireiShabbat synchronization is not connected here. Timings come from the archive; easing and geometry are approximations. Hebrew font matching remains unresolved. All 162 graphics, other compositions, overrides, camera-linked buttons, and prayer authoring remain migration work.

## Evidence — 2026-09-09

- TypeScript and production build passed.
- `scripts/check-api.py`: 19 assertions passed for authentication, cue validation, in/out, duplicate IDs, conflicts, delayed sequence, acknowledgments, and clear.
- Six actual local Companion API presses: all three prayers, animated clear, Barechu again, immediate clear. Each matched a settled acknowledgment from a separate graphics browser.
- WebMCP registration, read-back, valid cue, invalid cue rejection, and immediate clear passed through the supported browser runtime.
- Focused review confirmed monotonic console snapshots, preview key cleanup, and bounded nonblocking acknowledgments. Outstanding Companion ordering issue is recorded above.
- Physical Stream Deck, vMix/OBS, failure rehearsal, cloud device operation and rendered feedback on buttons remain unverified.

## Hosting

Sites registration is owner-private. Keys are configured as runtime secrets. Cloud state is separate from local rehearsal state. Companion and vMix/OBS cannot use an interactive ChatGPT sign-in gate; device access must be resolved before switching their URLs. Private review hosting does not establish cloud device operation.

The Sites build helper failed through the Windows npm shim; direct `node node_modules/vinext/dist/cli.js build` passed. Packaging uses the provided Sites helper and generated migrations.
