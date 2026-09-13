# Agent-facing rehearsal mode

This document is written for an AI agent operating this repository with no
hardware, no Cloudflare account, and no Neon database. It is **not**
[`docs/REHEARSAL.md`](REHEARSAL.md), which covers the staffed hardware/broadcast
rehearsal (Companion, vMix/OBS, camera-linked controls) — read that one for a
physical run-through; read this one for a fully local instance to publish and
show a graphic.

## One command

```
npm run rehearsal
```

This runs `scripts/rehearsal.mjs`, which:

- Refuses to start if `DATABASE_URL`, `RELAY_SECRET`, `CONTROL_KEY`, `OUTPUT_KEY`,
  or `ACCESS_BOOTSTRAP_KEY` is already set in the environment. It never loads any
  `.env*` file.
- Generates its own `RELAY_SECRET`, `CONTROL_KEY`, and `OUTPUT_KEY`, fresh every run.
- Checks that ports **5175** (Next dev) and **8788** (relay stub) are free, and
  fails with a named error if either is in use.
- Starts the relay stub in-process (`scripts/rehearsal-relay.ts`) — a Node port
  of the Cloudflare Durable Object that imports `relay/src/protocol.ts` verbatim,
  so the wire protocol is not reimplemented.
- Spawns `next dev --port 5175` with `CRC_AUTHORING_REHEARSAL=1 NODE_ENV=development
  RELAY_URL=memory CRC_REHEARSAL_RELAY_PORT=8788` plus the generated keys.
- Waits for `/api/workspace` to answer, then initializes the relay stub with the
  29-cue baseline catalog from `lib/cues.json` (revision 0, cue `null`).
- Prints: `http://localhost:5175/` (console), `http://localhost:5175/output#key=<outputKey>`,
  `/author`, `/access`, `/health`, the control key, and the rehearsal owner sign-in
  `rehearsal-owner@localhost` / `rehearsal-owner-local-2026`.

Ctrl+C stops both the dev server and the relay stub.

## What is real

- Every route handler and page.
- The authoring → review → publish pipeline.
- The realtime protocol, byte for byte: `GET /api/realtime` issues signed
  tickets; the socket is `ws://127.0.0.1:8788/connect` with subprotocols
  `crc-overlays-v1` and `ticket.<t>`; the client sends a UUID `hello`; heartbeats
  every 10 s; presence and renderer acks; close codes 4400 (protocol error,
  e.g. a non-UUID hello) and 4408 (heartbeat/stale timeout).
- Sign-in, with real scrypt password hashing and a real session cookie.
- The player and `/output`.
- The Companion module can connect to `http://localhost:5175` with the printed
  control key, exactly as it would to a deployed workspace.

## What is fake

- All state lives in process memory and dies with the process: drafts,
  revisions, artwork, service collections, feedback, the source-review inbox,
  accounts/sessions, and setup progress.
- The relay is a local Node stub, not a Durable Object — there is no Cloudflare
  involved. `/health` reports "database size" as 0, and provider usage reports
  are env-only (no real Neon/Cloudflare billing data).
- MCP/OAuth is not part of rehearsal.

## Rule

Rehearsal never holds production credentials. `CRC_AUTHORING_REHEARSAL=1` fails
closed unless `NODE_ENV=development`, `VERCEL` is unset, and `RELAY_URL` is
unset or exactly `memory`.

## Recipes

Use the printed control key as a Bearer token. Read `lib/authoring.ts` for the
authoring operations; the sequence to get a graphic on `/output` is
`create_draft` → `preview_draft` → `review_draft` → `publish_draft`, each a
`POST /api/authoring` with body `{operation, input}`.

**1. Create a draft** — `operation: 'create_draft'`, `input` requires `name`,
`title`, `layout` (`bottom`/`left`/`right`), `templateCueId` (a baseline cue
with the same layout), `content`, `presentation` (`{}` is valid). For plain
custom text, `content` is `{mode:'custom', text:'...'}`.

```
curl -s http://localhost:5175/api/authoring -H "Authorization: Bearer <controlKey>" \
  -H 'Content-Type: application/json' -d '{"operation":"create_draft","input":{
  "name":"Rehearsal check","title":"Rehearsal check","layout":"bottom",
  "templateCueId":"<a-bottom-layout-baseline-id>",
  "content":{"mode":"custom","text":"Hello"},"presentation":{}}}'
```

Keep the returned `draft.id` and `draft.version`.
**2. Preview it** — `operation: 'preview_draft'`, `input: {draftId,
expectedVersion}`. Keep the returned `previewId`.
**3. Review it** — `operation: 'review_draft'`, `input: {draftId,
expectedVersion, previewId, humanApproved: true, browserMeasurement:
{viewportWidth:1920, viewportHeight:1080, fontsReady:true, overflow:false,
rendererVersion:'rehearsal', measuredAt:<epoch ms>}}`.
**4. Publish it** — `operation: 'publish_draft'`, `input: {draftId,
expectedVersion, previewId}`.
**5. Show it:**

```
curl -s http://localhost:5175/api/command -H "Authorization: Bearer <controlKey>" \
  -H 'Content-Type: application/json' \
  -d '{"commandId":"<8-80 char id>","clientId":null,"sequence":null,"action":"in","cue":"<draftId>"}'
```

**6. Confirm:** `GET /api/state` (same Bearer) returns the snapshot, including
`renderers` — count them. Open `http://localhost:5175/output#key=<outputKey>`
in a browser and watch the graphic appear.

**Sanity check:** `npm run rehearsal:check` runs `scripts/check-rehearsal.mjs`,
which opens a fake output renderer, publishes a throwaway graphic, shows it,
asserts it rendered, then clears it.

## Troubleshooting

- **Port already in use:** `rehearsal.mjs` names which of 5175/8788 is taken;
  free it (or kill a leftover rehearsal process) and rerun.
- **Turbopack HMR resets the memory stores mid-session:** editing server code
  under active HMR restarts Next.js and wipes drafts/sessions/etc. Live relay
  state survives — the relay stub runs as a separate process.
- **"Live control is disconnected":** the relay stub is not running, or
  `RELAY_URL` is not exactly `memory`.
