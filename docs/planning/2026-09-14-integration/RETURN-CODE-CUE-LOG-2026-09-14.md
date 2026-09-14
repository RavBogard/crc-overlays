# RETURN → the cue log (Overlays)

Order: `HANDOFF-CODE-CUE-LOG-2026-09-14.md` (ruling 7) with `PLAN-CODE-OVERLAYS-CUE-LOG-2026-09-14.md`
beside it. Executed and returned by this session, which was also its own producer.

**Shipped.** Relay `c8ce9c519a579c58aca33c713ff867a3789d9a8b` to both workers (fourth relay
release); web `85d6b4ee67f229b62c7f3144584794e9b962218f` to both congregations. Deploy record 20
in `CLAUDE-HANDOFF.md`.

## What a row is

```
{seq, at, action, cueId, source, serviceRef, sourceIds}     kept by the relay
{seq, at, action, cueId, unitId, momentId, book, folio, source, serviceRef}   published by /api/history
```

- **`action`** — the accepted command: `in`, `out`, `clear`, `cut`, `bug`, or `history_cleared`.
- **`source`** — `control`, `companion` or `mcp`. Where a command came from, never who sent it.
- **`serviceRef`** — a prepared-service collection id when one is known.
- **`sourceIds`** — the `library:` pins of the graphic that was on screen. Internal: `/api/history`
  joins them to the siddur library and drops them.

There is no graphic name, no title, no text, no operator identity and no renderer presence in any
row, at any boundary. The walk that proves it runs in production code, not only in tests.

## Decisions that differ from the plan, and why

1. **The liturgy is joined at read time, not frozen at publication.** My first implementation
   resolved `{unitId, momentId, book, folio}` when a catalog was published and shipped the map to
   the relay. The plan resolves from source ids on the way out, and it is right: `content/moments.json`
   is empty today, so a frozen position would carry a null `momentId` for ever, while a read-time
   join starts answering for services *already recorded* the moment the producer's table lands.
   Reworked before anything shipped.
2. **`history_reader` keeps the `cd_` device-token format** rather than the plan's separate `hr_`
   prefix. One format means one store, one verification path, and one revoke button on the panel
   that already exists; the *kind* carries the authority, exactly as it does for `companion` and
   `output`. The test asserts the new kind satisfies neither read, control, author nor owner.
3. **`source` is derived on the web side** from the authorized actor and sent as an optional
   command field, rather than matched against connected control sockets inside the relay. A command
   reaches the relay over HTTP from Vercel, so the socket set is not a reliable witness; the plan
   names this fallback itself. An absent field reads as plain live control, so every deployed
   client is unaffected.
4. **The device-kind CHECK is widened by discovery, not by name.** A constraint Postgres had named
   differently would otherwise survive `DROP CONSTRAINT IF EXISTS` and keep refusing the new kind
   while the migration reported success.

## Discovery answers the plan asked for

- **`db/devices.sql` did pin the kinds** — `CHECK(kind IN ('companion','output'))` on both
  `device_credentials` and `device_pairing_codes`. Hence `db/history-reader.sql`, registered in
  `scripts/migrate-authoring.mjs` after `devices.sql`. Pairing codes were deliberately left alone:
  a service-history credential is issued to a website, never typed into a device.
- **Permissions** are `read | control | author | owner`; `history` is a fifth, outside that ladder.
- **`scripts/check-live-relay.mjs` exists** and was extended (it is the relay-only check);
  the end-to-end proof through `/api/history` is the rehearsal script.
- **Prepared services are never "loaded"** anywhere in the product — D4 ruled against investing
  there — so `serviceRef` is filled today only by a names panel (`names:<collectionId>:<NN>`, read
  inside the relay) or by a caller that already holds a collection id. The field is validated as a
  collection id and refused otherwise.
- **No MCP tool issues a live command**, so `source: "mcp"` cannot occur yet; the vocabulary
  reserves it.

## Evidence

Local only, under `work/handoffs/cue-log/` (git-ignored):

- `report.txt` — the rehearsal run, **0 failures**: real commands through `/api/command`; the log
  read back by the owner and by a freshly minted `history_reader`; that credential refused by
  `/api/state`, `/api/catalog`, `/api/authoring`, `/api/command` and by clear-history; paging by
  `seq`; a stale controller sequence leaving no row; the forbidden-key walk clean; the clear
  leaving only itself.
- `history-rehearsal.json` — the captured history. Three of its rows:

```json
{"seq":9,"at":1789420709619,"action":"history_cleared","cueId":null,"unitId":null,"momentId":null,"book":null,"folio":null,"source":"control","serviceRef":null}
{"seq":10,"at":1789420709649,"action":"in","cueId":"efa9fad4-f7d5-4091-a708-82103028861b","unitId":null,"momentId":null,"book":null,"folio":null,"source":"control","serviceRef":null}
{"seq":13,"at":1789420709751,"action":"clear","cueId":null,"unitId":null,"momentId":null,"book":null,"folio":null,"source":"control","serviceRef":null}
```

  The rehearsal baseline catalog has no library-backed graphic, so every row above is correctly
  all-nulls. The join itself is proven against the **committed siddur library** in
  `tests/service-history.test.ts`, where a library-backed graphic's row carries exactly what
  `liturgyForCue` reports for it.
- `verify-hosts.txt` — post-deploy, read-only, no command issued against production: **0 failures
  across 3 hosts × 9 checks**.
- `work/deploy-staging/releases/c8ce9c…/relay.json` — `status: complete`; `crc-live-relay`
  `4f23536f-3e37-4b03-9fbf-63c813778a32`, `tbi-overlays-live-relay`
  `7c280607-0c2d-4f58-9686-5d85c1d7115f`. Gate: both workspaces 0 renderers.

Tests: 704 web (698 pass / 0 fail / 6 environment skips), 50 relay. `tsc` 0, lint 0, clean build 0.

## What centralreform.live needs to do

An Overlays Administrator opens **System → People → Paired devices**, types a name in
**Service-history connection** (for example `centralreform.live`), presses Create, and copies the
token **once** — only its digest is stored, so it can never be shown again. That token goes
straight into the .live project's own sensitive environment variable; it is never pasted into a
document, a commit or a chat message. It is revoked from the same panel.

Then: `GET https://<overlays host>/api/history?since=<ms>&until=<ms>` with
`Authorization: Bearer <token>`, server-side only (there is no CORS header). The answer is
`{workspace, rows, nextAfter, window:{rows:2000,days:14}}`; page with `after=<seq>` while
`nextAfter` is not null, and `limit` if fewer than 500 rows a page are wanted.

**No production `history_reader` was minted.** That is Daniel's to do when .live is ready for it.

## Also shipped from the same sitting (part B of the plan)

- The Monday siddur workflow adopts the producer's `dist-app/moments-pairs.json` into
  `content/moments.json` when one exists, in the same pull request, via `scripts/adopt-moments.py`.
  A malformed file fails the job loudly rather than committing junk. Nothing else changes:
  `liturgyForCue` already reads that file, so `momentId` appears in `/api/catalog?include=liturgy`
  and in `/api/history` the moment such a pull request merges.
- System → Setup gained a short **Siddur library** card pointing at that workflow's own Run button.
  No dispatching route and no GitHub token in Vercel — "no further lift", as ruled.

## Still open

- Daniel mints the production `history_reader` when .live is ready.
- The translation-pairs return from shireishabbat.
- The CRC domain swap, still waiting on `overlays.centralreform.org` resolving.
