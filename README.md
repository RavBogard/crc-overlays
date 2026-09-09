# CRC Overlay Control — test milestone

Vercel-hosted controller, durable cue state, and transparent 1920×1080 graphics output. Three archived CRC cues: Barechu, Modeh Ani (Bottom), and Mah Tovu. Branding, renderer, and cue content are separate. This is an engineering rehearsal, not a service-ready Singular replacement.

## Run locally

Start with `npm run dev` (port 5175). `.env` supplies CONTROL_KEY and OUTPUT_KEY; never commit keys or Companion exports. The PostgreSQL schema is in `db/postgres.sql`; run `node --env-file=.env.production.local scripts/migrate-postgres.mjs` against this project's dedicated database. The prior D1 implementation remains in Git history and the original Sites checkout.

Controller: http://localhost:5175/. Output: `/output#key=OUTPUT_KEY` (key is moved to tab session storage). Add output to vMix or OBS as a 1920×1080 browser source with transparency. Preview is excluded from output acknowledgments. `work/CONNECTIONS.md` contains private connection details.

## Control contract

`GET /api/catalog`, `GET /api/state`, `POST /api/ack` accept an output or control Bearer key. `POST /api/command` requires a control key. Commands use `action: in|out|clear|cut`, a known `cue` for in/out, and optional `commandId`, `clientId`, and increasing `sequence`. Out clears only its matching cue; clear animates out; cut cancels animation immediately.

The web controller assigns IDs and sequence numbers, retained across reload within the tab. Duplicate command IDs do not replay. Lower sequence numbers for the same controller do not replace newer requests. Separate controllers follow server arrival order. **Generic HTTP Companion test buttons omit ordering metadata: delayed requests can arrive after clear. Do not use this integration in a service until sequencing and retry identity are assigned at activation.**

Output holds its last graphic on disconnection. A renderer expires from status after eight seconds without acknowledgments. Rendered means the browser matched requested state; it does not mean the broadcast is on air. Clear requires working connectivity.

## Companion

Companion 5.0.5 at http://127.0.0.1:8000/. Connection CRC_Overlays_Test uses Generic HTTP Requests 3.1.1. Page 1, CRC Overlay Test: row 0 columns 1–5 are Barechu, Modeh Ani, Mah Tovu, Animate out, Clear now. Physical hardware not verified. These older Generic HTTP button colours are static. The native CRC_Overlays module is installed separately; its rehearsal buttons occupy row 1 and provide requested/rendered/disconnected feedback. No CRC production camera configuration was imported.

`scripts/prepare-companion.py` generates a private page import using the installed version's captured template. `work/companion-before.companionconfig` preserves the initial setup. Never share generated configs without removing keys.

## Content and scope

Text is copied from the archived Singular master without editorial changes. The canonical source candidate remains in the separate archive lab; ShireiShabbat synchronization is not connected here. Timings come from the archive; easing and geometry are approximations. Hebrew font matching remains unresolved. All 162 graphics, other compositions, overrides, camera-linked buttons, and prayer authoring remain migration work.

## Evidence — 2026-09-09

- TypeScript and production build passed.
- `scripts/check-api.py`: 19 assertions passed for authentication, cue validation, in/out, duplicate IDs, conflicts, delayed sequence, acknowledgments, and clear.
- Six actual Companion API presses against the live Vercel deployment: all three prayers, animated clear, Barechu again, immediate clear. Each matched a settled acknowledgment from a separate graphics browser.
- WebMCP registration, read-back, valid cue, invalid cue rejection, and immediate clear passed through the supported browser runtime.
- Focused review confirmed monotonic console snapshots, preview key cleanup, and bounded nonblocking acknowledgments. Native Companion commands now carry activation sequence and retry identity; the older generic row remains an unsequenced reference.
- Cloud Companion-to-output operation is verified. Native button presses matched Vercel requested/rendered state. Disconnecting the graphics browser turned native feedback red; reconnecting restored green for the settled cue. Physical Stream Deck, vMix/OBS and broader network/restart rehearsal remain unverified.

## Hosting

Primary source: https://github.com/RavBogard/crc-overlays (private).
Live controller: https://crc-overlays.vercel.app. Vercel project: crc-overlays under ravbogards-projects. Production uses its own Neon database named crc-overlays, provisioned on free_v3 in iad1. DATABASE_URL, CONTROL_KEY and OUTPUT_KEY are runtime secrets. Preview deployments have no production database or keys.

Vercel runs standard Next.js. The old Sites deployment is retained as a separate prototype snapshot; its state is independent and it is not the current source/deployment workflow. Neither shireishabbat nor shirei-tshuvah-web is modified by this deployment.

Database initialization is an explicit migration step, not a public API or automatic request action. All changes to the single CRC output are serialized by a PostgreSQL row lock. This preserves duplicate-command handling and per-controller ordering. The native Companion module assigns activation sequence and retry identity; the historical Generic HTTP row retains its ordering limitation.

Vercel migration validation: production build/typecheck, 19 API assertions, concurrent duplicate and reordered-sequence tests. Scoped independent review completed; idle database connection errors handled without crashing the process. Physical Stream Deck and vMix/OBS checks remain separate.
