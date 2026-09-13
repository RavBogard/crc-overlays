# Agent-facing rehearsal mode

This document is written for an AI agent operating this repository with no hardware,
no Cloudflare account, and no Neon database. It is **not** [`docs/REHEARSAL.md`](REHEARSAL.md),
which covers the staffed hardware/broadcast rehearsal (Companion, vMix/OBS, camera-linked
controls) — read that one for a physical run-through; read this one for a fully local
instance to publish and show a graphic.

## One command

```
npm run rehearsal            # optional: -- --port 5175 --relay-port 8788 --book-faces
#   add --pair to boot CRC and TBI together (see "Paired rehearsal" below)
```

`--book-faces` sets `WORKSPACE_BOOK_FACES=1` in the Next child's environment, trialing the David Libre / Frank Ruhl Libre overlay typography (default off; see `docs/RENDERER.md`).

This runs `scripts/rehearsal.mjs` (under tsx), which:

- Refuses to start (exit 2, nothing spawned) if `DATABASE_URL`, `RELAY_SECRET`,
  `CONTROL_KEY`, `OUTPUT_KEY`, `ACCESS_BOOTSTRAP_KEY`, or `VERCEL` is set in the
  shell. It never loads any `.env*` file; `next dev` gets a minimal allowlisted
  environment with `DATABASE_URL` and `ACCESS_BOOTSTRAP_KEY` passed as empty strings
  (`@next/env` only applies a `.env*` key whose initial value is undefined).
- Generates fresh `RELAY_SECRET`, `CONTROL_KEY`, and `OUTPUT_KEY` every run.
- Checks that ports **5175** (Next dev) and **8788** (relay stub) are free on
  loopback and wildcard addresses; exit 3 names the busy port.
- Starts the relay stub (`scripts/rehearsal-relay.ts`) **inside the orchestrator's
  own process**, not inside Next — a Node port of the Cloudflare Durable Object that
  imports `relay/src/protocol.ts` verbatim, so the wire protocol is not reimplemented.
- Spawns `next dev --port 5175` with `CRC_AUTHORING_REHEARSAL=1 NODE_ENV=development
  RELAY_URL=memory CRC_REHEARSAL_RELAY_PORT=8788` plus the generated keys.
- Waits up to 90 s for `/api/workspace` (exit 5 with Next's last stderr lines), initializes the relay stub with the 29-graphic baseline catalog from `lib/cues.json` (revision 0, no graphic on air — `cue: null` in the API), then calls `POST /api/live-catalog` so Next pushes its own catalog version (Turbopack and tsx serialize one `cues.json` float differently).
- Writes gitignored `work/rehearsal/current.json` (`baseUrl`, `relayUrl`, keys, pids,
  `startedAt`) so `rehearsal:check` can attach; deletes it on exit.
- Prints: `http://localhost:5175/` (console), `http://localhost:5175/output#key=<outputKey>`,
  `/author`, `/access`, `/health`, the control key, and the owner sign-in
  `rehearsal-owner@rehearsal.invalid` / `rehearsal-owner-local-2026`.

Ctrl+C (or SIGTERM/SIGHUP, or Next exiting) stops the dev server tree and the relay
stub and removes the state file.

## Paired rehearsal (CRC + TBI)

```
npm run rehearsal -- --pair    # optional: --port 5175 --relay-port 8788 --tbi-port 5176 --tbi-relay-port 8789
```

One orchestrator process, two congregations: two relay stubs, two `next dev` children, and one
generated shared-library key. CRC boots first on **5175**/**8788**; TBI boots second on
**5176**/**8789** with `WORKSPACE_ID=temple-bnai-israel-kalamazoo`. Exit 3 names whichever of
the four ports is busy (or repeated), and nothing is spawned until all four are free.

- **The shared key** is a fresh 43-character key drawn with every other key of the run, so it
  can never equal either child's `CONTROL_KEY`, `OUTPUT_KEY`, or relay secret. CRC gets it as
  `SHARED_LIBRARY_EXPORT_KEY` (it serves `/api/shared-library`); TBI gets the same value as
  `SHARED_LIBRARY_IMPORT_KEY` plus
  `CRC_SHARED_LIBRARY_URL=http://127.0.0.1:<crcPort>/api/shared-library`. The key exists only
  in those two child environments and in the two state files; it is never printed.
- **Loopback http is a rehearsal-only allowance.** Both the shared library client
  (`lib/shared-library.ts`) and shared artwork import (`lib/assets.ts`) are https-only unless
  `rehearsalMode()` is true — that is, `CRC_AUTHORING_REHEARSAL=1`, `NODE_ENV=development`, no
  `VERCEL`, and no live relay — and even then only for `127.0.0.1`/`localhost` **with an
  explicit port**. On Vercel, in production, or beside a real relay, an http feed URL is
  refused before any request is made.
- **Each relay stub is initialized with its own workspace's baseline catalog**
  (`baselineCatalogForWorkspace`): 29 graphics for CRC, 24 for TBI, whose ids differ.
- **Two state files:** `work/rehearsal/current.json` (CRC) and
  `work/rehearsal/current-tbi.json` (TBI); both carry `workspaceId`, and both are removed on
  exit. The banner prints both origins, both output/author/access/health links, both control
  keys, and the same seeded owner sign-in for each.
- **Separate build directories.** Next 16 takes an exclusive lock on `<distDir>/lock` per
  checkout, so two `next dev` servers cannot share `.next/dev`. `distDir` can only come from
  the resolved Next config, so the orchestrator asks Next for its own resolved development
  config (`next.config.ts` is read normally and never edited), repoints `distDir` at
  `.next/rehearsal/crc` and `.next/rehearsal/tbi`, and passes it to each child in
  `__NEXT_PRIVATE_STANDALONE_CONFIG`. It also repoints `typescript.tsconfigPath` at a generated
  copy of `tsconfig.json` under `work/rehearsal/`, because Next appends its own `types` globs
  to whichever tsconfig the config names and the repository's `tsconfig.json` must not grow
  entries for a rehearsal build directory. Both locations are already git- and lint-ignored.
  If a future Next stops exposing this, the pair exits **6** with that explanation instead of
  half-starting; single-instance `npm run rehearsal` is unaffected and keeps using `.next/dev`.
  A pair therefore runs happily beside an unrelated `next dev` in the same checkout.

### The acceptance scenario

```
npm run rehearsal:check -- --pair
```

Attaches to both state files (or boots its own pair, `--attach`/`--boot` force either) and
drives the whole CRC → TBI story over HTTP, printing `ok <step>` / `FAIL <step>: <detail>`:

1. **paired workspaces** — both instances answer `/api/workspace` with different workspace ids.
2. **crc publishes a graphic** — `create_draft` → `preview_draft` → `review_draft` →
   `publish_draft` for a throwaway custom graphic.
3. **tbi lists it as new** — `list_shared_library {refresh:true}` shows it with `state:'new'`.
4. **tbi customizes it** — `customize_shared_cue {cueId, expectedCueHash}` makes a TBI draft,
   and `update_draft` gives that draft its own title.
5. **crc changes the wording and republishes** — `update_draft` → preview → review → publish.
6. **tbi sees the update without losing its copy** — the same entry now reads `state:'updated'`
   and `get_draft` of the TBI draft still deep-equals its pre-update document.
7. **tbi compares its copy with crc** — `compare_shared_cue {cueId, draftId}` reports
   `changed.wording === true`.
8. **a second copy is a second draft** — customizing again yields a different draft id.

`cueHash` is never computed by the check: it always comes from what TBI actually read (tsx and
Turbopack serialize `cues.json` floats differently). Without `--pair` the check is exactly the
single-instance run described below.

## What is real

- Every route handler and page, and the authoring → review → publish pipeline.
- The realtime protocol, byte for byte: `GET /api/realtime` issues signed
  tickets; the socket is `ws://127.0.0.1:8788/connect` with subprotocols
  `crc-overlays-v1` and `ticket.<t>`; the client sends a UUID `hello`; heartbeats
  every 10 s; presence and renderer acks; close codes 4400 (protocol error,
  e.g. a non-UUID hello) and 4408 (heartbeat/stale timeout).
- Sign-in, with real scrypt password hashing and a real session cookie. The seeded
  owner's address is deliberately unroutable (`.invalid`) and passes the same email
  check production applies.
- The player and `/output`.
- The Companion module can connect to `http://localhost:5175` with the printed
  control key, exactly as it would to a deployed workspace.

## What is fake

- All state lives in process memory and dies with the process: drafts, revisions,
  artwork, service collections, feedback, the source-review inbox, accounts/sessions,
  and setup progress.
- The relay is a local Node stub, not a Durable Object — no Cloudflare involved.
  `/health` reports "database size" as 0, and provider usage reports are env-only
  (no real Neon/Cloudflare billing data). MCP/OAuth is not part of rehearsal.

## Rule

Rehearsal never holds production credentials. `CRC_AUTHORING_REHEARSAL=1` fails
closed unless `NODE_ENV=development`, `VERCEL` is unset, and `RELAY_URL` is unset or
`memory`.

## Recipes

Use the printed control key as a Bearer token. Read `lib/authoring.ts` for the
authoring operations; the sequence to get a graphic on `/output` is
`create_draft` → `preview_draft` → `review_draft` → `publish_draft`, each a
`POST /api/authoring` with body `{operation, input}`. Cookie-authenticated writes
need `Origin: http://localhost:5175` (Next dev reports `request.url` as `localhost`).

**1. Create a draft** — `operation: 'create_draft'`, `input` requires `name`, `title`,
`layout` (`bottom`/`left`/`right`), `templateCueId` (a baseline graphic with the same
layout), `content`, `presentation` (`{}` is valid). For plain custom text, `content`
is `{mode:'custom', text:'...'}`. Keep the returned `draft.id` and `draft.version`.

```
curl -s http://localhost:5175/api/authoring -H "Authorization: Bearer <controlKey>" \
  -H 'Content-Type: application/json' -d '{"operation":"create_draft","input":{
  "name":"Rehearsal check","title":"Rehearsal check","layout":"bottom",
  "templateCueId":"<a-bottom-layout-baseline-id>",
  "content":{"mode":"custom","text":"Hello"},"presentation":{}}}'
```

**2. Preview it** — `operation: 'preview_draft'`, `input: {draftId,
expectedVersion}`. Keep the returned `previewId`.
**3. Review it** — `operation: 'review_draft'`, `input: {draftId,
expectedVersion, previewId, humanApproved: true, browserMeasurement:
{viewportWidth:1920, viewportHeight:1080, fontsReady:true, overflow:false,
rendererVersion:'rehearsal', measuredAt:<epoch ms>}}`.
**4. Publish it** — `operation: 'publish_draft'`, `input: {draftId,
expectedVersion, previewId}`. The published graphic's id equals `draftId`.
**5. Show it:**

```
curl -s http://localhost:5175/api/command -H "Authorization: Bearer <controlKey>" \
  -H 'Content-Type: application/json' \
  -d '{"commandId":"<8-80 char id>","clientId":null,"sequence":null,"action":"in","cue":"<draftId>"}'
```

**6. Confirm:** `GET /api/state` (same Bearer) returns the snapshot, including
`renderers` — count them. Open `http://localhost:5175/output#key=<outputKey>` in a
browser and watch the graphic appear.

**Sanity check:** `npm run rehearsal:check` (`scripts/check-rehearsal.mjs`) attaches
to the instance in `work/rehearsal/current.json` if it answers, else boots a private
one and stops it afterwards (`-- --attach` / `-- --boot` force either). It prints
`ok <step>` or `FAIL <step>: <detail>` (exit 1) for: health, fake output renderer
over the real socket, renderer presence, publish a throwaway graphic, `in` and `out`
each acknowledged by the renderer; then `REHEARSAL CHECK PASSED`. `-- --pair` runs the
CRC → TBI shared library scenario instead (see "Paired rehearsal" above).

## Troubleshooting

- **Port already in use:** `rehearsal.mjs` names which of 5175/8788 (and 5176/8789 with
  `--pair`) is taken; free it.
- **"Another next dev server is already running":** only single-instance rehearsal uses
  `.next/dev`, so this means another `next dev` holds the checkout. Stop it, or run the pair,
  which gives each child its own build directory.
- **Turbopack HMR resets the memory stores mid-session:** editing server code under
  active HMR restarts Next.js and wipes drafts/sessions/etc. Live relay state
  survives — the relay stub runs in the orchestrator's process, not in Next.
- **"Live control is disconnected":** the relay stub is not running, or `RELAY_URL`
  is not exactly `memory`.
- **Stale `work/rehearsal/current.json`** (hard kill): `rehearsal:check` ignores it
  when the recorded `baseUrl` does not answer.
- **Setting `CRC_AUTHORING_REHEARSAL=1` by hand, without `RELAY_URL=memory`:** accounts, setup progress, drafts, artwork, services, and the source-review inbox still move into memory (only the seeded rehearsal owner can sign in), but `/api/state`, `/api/command`, and `/api/ack` still need Postgres because no relay is configured — prefer `npm run rehearsal`.
