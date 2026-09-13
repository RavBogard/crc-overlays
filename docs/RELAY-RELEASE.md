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
with the relay-local wrangler. It writes `work/deploy-staging/releases/<sha>/relay.json`
(workers, gate reading, `completedAt`) and leaves any `release.json` there untouched.

## What live clients see

Durable Object state survives a worker deploy: current cue, revision and renderer presence are not
reset. Open sockets drop and reconnect on their first retry; the Companion module's 3 s grace
before "disconnected" absorbs that, so the deck should not flash red.

## Rollback and first use

From `relay/`, per worker — the two are independent: `npx wrangler deployments list [--env tbi]`
then `npx wrangler rollback [--env tbi]`. Note the version id you rolled back to in the release
folder. First planned use of this procedure: the pending renderer-expiry fix (`rendererExpired`
made inclusive in `relay/src/protocol.ts`), unreleased since the 13 Sept afternoon release.
