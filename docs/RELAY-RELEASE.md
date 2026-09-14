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

## Rollback and first use

From `relay/`, per worker — the two are independent: `npx wrangler deployments list [--env tbi]`
then `npx wrangler rollback [--env tbi]`. Note the version id you rolled back to in the release
folder. First planned use of this procedure: the pending renderer-expiry fix (`rendererExpired`
made inclusive in `relay/src/protocol.ts`) — released 2026-09-14 01:29Z from `22a2bfd` to both workers (record under `work/deploy-staging/releases/22a2bfd…/relay.json`).
Second use: controller presence and the snapshot-headroom reservation (`controllers` in presence frames and `/state`; `MAX_CUE_PAYLOAD_BYTES` 258048 → 254464) — released 2026-09-14 03:27Z (22:27 CT on the 13th) from `e9a390f` to both workers after a clean `--dry-run`; `crc-live-relay` version `e5cdacad-f541-4c86-be11-904ccf94ce21`, `tbi-overlays-live-relay` version `9ffc594e-b21f-414f-a2d7-ed0e67591e0d`; record under `work/deploy-staging/releases/e9a390f…/relay.json`. Relay first, web second, as section C of the Phase C plan requires: the field is additive and the 259a645 web passed it through untouched in the interval.
