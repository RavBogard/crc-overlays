# Relay release

Ships `relay/` to both Cloudflare workers: `crc-live-relay` (default environment) and
`tbi-overlays-live-relay` (`--env tbi`). One `relay/wrangler.jsonc` describes both; the `tbi`
environment repeats the Durable Object binding and `ALLOWED_ORIGINS` because wrangler does not
inherit those two fields into named environments. Each worker keeps its own Durable Object
storage and its own `RELAY_SECRET` (a Worker secret, never in configuration). A relay release is
its own event: not paired with a web deploy, and may ship from a commit with no `release.json`.

## Prerequisites

- Wrangler logged in on the deploying machine: `cd relay && npx wrangler whoami` must name the
  Cloudflare account owning both workers. If it does not, stop — do not deploy.
- Do not set `CLOUDFLARE_API_TOKEN`; the script refuses an empty-looking one and otherwise relies
  on the logged-in wrangler session. The release commit is checked out, tree clean, quiet weekday.

## The gate (read-only, before every release)

The script never holds a control key, so the operator takes the reading and hands it over:

1. `GET /api/state` on each workspace with that workspace's control key as
   `Authorization: Bearer …`. Keys come from the operator's own store; never paste one into a
   document, a commit, a log, or a chat message.
2. Both connected-renderer counts must be `0`. On a Saturday also confirm no cue is live
   unless Daniel says it is his own test.
3. Write the reading to a gate file outside the repo (or under ignored `work/`):

   ```json
   {"crc":{"renderers":0,"checkedAt":"2026-09-13T20:14:00Z"},
    "tbi":{"renderers":0,"checkedAt":"2026-09-13T20:14:30Z"}}
   ```

   Both counts must be `0` and both stamps within the last 10 minutes when the script reads
   them, or it refuses. Re-probe rather than editing a timestamp.

## The release

```
node scripts/deploy-relays.mjs --commit <full-sha> --confirm-production --gate-file <path>
```

`--dry-run` runs every check plus `wrangler deploy --dry-run` for both environments, deploying
nothing and recording nothing. `--only crc` / `--only tbi` releases one worker; the gate then
needs only that workspace.

The script checks HEAD against `<full-sha>`, that `git status --porcelain --untracked-files=all`
is empty, that `cd relay && npm test && npm run check` pass, then the gate, then deploys both
with the relay-local wrangler. It leaves any `release.json` there untouched.

### The release record

Before either worker is touched, the script writes `work/deploy-staging/releases/<sha>/relay.json`
with `status:"in-progress"`, the commit, the gate reading it validated, and each worker at
`status:"pending"`. It refreshes the read-only gate check again immediately before *each* worker's
deploy (not just once up front), since the earlier reading can go stale while the previous worker
was deploying. As each worker's `wrangler deploy` finishes, its own entry is updated in place with
`status:"deployed"` or `"failed"`, the wrangler version id when it can be parsed from the output
(`null` otherwise), a timestamp, and — on failure — the tail of wrangler's output.

The top-level `status` is decided once every requested worker has been attempted or the gate has
blocked one:

- `"complete"` — every requested worker deployed.
- `"partial"` — at least one worker deployed and at least one did not (its own deploy failed, or
  the refreshed gate blocked it before it started). The record gets a `recovery` string naming the
  worker(s) still owed a decision.
- `"aborted"` — the gate blocked the release before any worker deployed (no partial state exists).

The exit code is non-zero for anything other than `"complete"`.

### Recovery from a partial release

`recovery` says exactly what to do: re-verify the gate is idle and rerun this same script with
`--only <worker>` for whatever did not deploy, using the same commit; or, to undo a worker that did
deploy, run `npx wrangler rollback [--env tbi]` from `relay/` and note the version id you rolled
back to. The two workers are independent, so leaving one deployed while you retry or roll back the
other is a valid intermediate state — the record says which is which.

## What live clients see

Durable Object state survives a worker deploy: current cue, revision and renderer presence are not
reset. Open sockets drop and reconnect on their first retry; the Companion module's 3 s grace
before "disconnected" absorbs that, so the deck should not flash red.

## Command answers: outcome, preconditions, press times (MCP plan V1, not yet released)

Added in `relay/src/protocol.ts` (`decideCommand`, shared by the worker and the rehearsal port) so
an agent can tell a retried call from a new one and refuse to act on a stale view. Every field is
additive; a caller that sends none of the new fields gets exactly the old behaviour and the old
body plus new keys.

- **`outcome`** on every `POST /command` 200 answer:
  - `applied` — a commandId the relay had not seen, from a caller with no `clientId` or with a
    `sequence` above that controller's last one. Revision + 1, a cue-log row, a broadcast.
  - `replayed` — a commandId the relay already holds a receipt for, same action and cue. Nothing
    changes; the answer is current state. `originalOutcome` (only on a replay) is `applied` or
    `superseded` for what the first delivery did, or `null` for a receipt an earlier build wrote.
  - `superseded` — a new commandId whose `sequence` is not above that `clientId`'s last one: a newer
    press from the same controller already won. Nothing moves, the receipt is kept (a retry then
    answers `replayed`), no cue-log row. Different controllers still resolve last-writer-wins.
- **Preconditions** (optional on a command): `ifRevision` (non-negative integer; holds only at
  exactly that revision) and `ifCue` (a cue id, or `null` for "only while nothing is pinned").
  A malformed value is `400 Invalid command`. A failed one is `409` with
  `{error,commandId,precondition:'ifRevision'|'ifCue',revision,cue}`, where `error` is a plain
  sentence ending "Nothing was changed; read the live state and decide again." A refusal writes
  nothing: no receipt, no sequence, no press time, so the same commandId can be sent again.
  Order of checks: receipt (so a retry of a command that already moved the state replays rather than
  tripping its own precondition), unknown cue, preconditions, controller sequence.
- **`commandId` on cue-log rows** (ruling 10: a correlation id only). New column
  `command_history.command_id`; `null` on older rows and on `history_cleared`. The web's
  `lib/service-history.ts` rebuilds rows key by key and does not publish it yet.
- **`lastPress`** `{control,companion,mcp}` (ms epoch or `null`) on `GET /state` and on
  `POST /command` answers, never in a socket frame, so it takes nothing from `MAX_SNAPSHOT_BYTES`
  and changes no cue-payload headroom. Classes are the cue log's `source`. A press is a new command
  the relay processed (`applied` or `superseded`); replays, refusals and invalid requests are not.
  Stored in a new `controller_presses` table, so it survives eviction and deploys; it starts empty.

Schema: the two new columns are added in place by a guarded `ALTER TABLE` in the Durable Object
constructor (a duplicate-column error on an already-migrated room is expected and swallowed); both
are nullable. Rolling the worker back is safe: the earlier build names its columns explicitly and
ignores the extra ones and the new table.

Release order: relay first, then the web (V2's `lib/live-command.ts` is the first sender of
`ifRevision`/`ifCue` and the first reader of `outcome`/`lastPress`). The deployed web and Companion
pass the extra answer fields through untouched: the command route returns the relay body as is,
`lib/browser-realtime.ts` and the Companion client ignore unknown snapshot keys.

## A graphic retired while on air (MCP plan A3, not yet released)

Established by test before any change (tests/rehearsal-relay.test.ts, relay/tests/retirement.test.ts):
`POST /catalog` never touches live state, so when a sync drops the pinned cue the relay keeps its
revision, cue and payload, sends only the `catalog` frame, and an open output page keeps rendering
its pinned copy (`withPinnedCue`). A new `in` for that cue is `400 Unknown cue`, as it should be. The
unsafe part: an `out` naming it was also `400 Unknown cue`, so the operator's own Out button for the
graphic stopped working mid-service and only Clear or Cut could take it down.

Rule added in `decideCommand` (`outOfPinnedCue`): an `out` naming the cue that is pinned right now,
whose payload the state holds, is accepted whether or not the catalog still has it. Everything else
is unchanged: sequence, preconditions and receipts apply to it; an `out` for any other unknown cue is
still refused. The cue log row keeps the held payload's source ids (`commandPayload`). Additive and
backward compatible: no schema, no new fields, and a caller that never sends such an `out` sees no
difference. Release order: relay first, then the web that can retire (a web that retires before the
relay ships only brings back the old Clear/Cut-only behaviour for that one graphic).

## Rollback and first use

From `relay/`, per worker — the two are independent: `npx wrangler deployments list [--env tbi]`
then `npx wrangler rollback [--env tbi]`. Note the version id you rolled back to in the release
folder. First planned use of this procedure: the pending renderer-expiry fix (`rendererExpired`
made inclusive in `relay/src/protocol.ts`) — released 2026-09-14 01:29Z from `22a2bfd` to both workers (record under `work/deploy-staging/releases/22a2bfd…/relay.json`).
Second use: controller presence and the snapshot-headroom reservation (`controllers` in presence frames and `/state`; `MAX_CUE_PAYLOAD_BYTES` 258048 → 254464) — released 2026-09-14 03:27Z (22:27 CT on the 13th) from `e9a390f` to both workers after a clean `--dry-run`; `crc-live-relay` version `e5cdacad-f541-4c86-be11-904ccf94ce21`, `tbi-overlays-live-relay` version `9ffc594e-b21f-414f-a2d7-ed0e67591e0d`; record under `work/deploy-staging/releases/e9a390f…/relay.json`. Relay first, web second, as section C of the Phase C plan requires: the field is additive and the 259a645 web passed it through untouched in the interval.
Third use: the scan card in live state (`bug` field, `bug` command action, `MAX_BUG_BYTES` reservation) — released 2026-09-14 06:36Z (01:36 CT) from `b977624` after a clean `--dry-run` (44 relay tests); `crc-live-relay` `604b4dde-c3f7-4636-a268-7a38e8f58f65`, `tbi-overlays-live-relay` `4b830b2e-248f-4090-82be-c01e6e9ef148`; record under `work/deploy-staging/releases/b977624…/relay.json`. The worker and the rehearsal stub changed in comments only; the release is a `protocol.ts` change.
Fourth use: **the cue log** (a bounded `command_history` table in the Durable Object, `GET /history` and `POST /history/clear`, optional `source` and `serviceRef` on a command, and a `WORKSPACE` var so a reader can tell the two congregations apart) — released 2026-09-14 21:21Z (16:21 CT) from `c8ce9c519a579c58aca33c713ff867a3789d9a8b` after a clean `--dry-run` (50 relay tests); `crc-live-relay` version `4f23536f-3e37-4b03-9fbf-63c813778a32`, `tbi-overlays-live-relay` version `7c280607-0c2d-4f58-9686-5d85c1d7115f`; record under `work/deploy-staging/releases/c8ce9c519a579c58aca33c713ff867a3789d9a8b…/relay.json` (`status: complete`). Gate: both workspaces 0 renderers (TBI still had a cue selected in relay state with nobody rendering it, which a deploy does not disturb). Relay first, web second: the deployed web posted commands without the two new fields throughout the interval, and `parseCommand` reads an absent field as 'plain live control, no prepared service'.
