# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-09-19** (Wave 1 of the four-project audit; see
`docs/planning/2026-09-19-audit/`).

## Web, per workspace

Two congregations, one codebase, one deployment each. **They can drift, and right now they have.**

| Workspace | Host | Deployed commit | How it got there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `1f9a5f3` | Vercel Git integration on `main` |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `7582b66` | `scripts/deploy-workspaces.mjs` (Deploy record 25, 2026-09-16 11:50 CT) |

The difference between the two commits is documentation only — `1f9a5f3` is the Deploy record 25
write-up on top of `7582b66` — so the two congregations are running the same code today. But the
mechanism that produced the split is real and will produce a functional one:

> **A push to `main` deploys CRC production by itself.** `crc-overlays` has Vercel's Git
> integration enabled on `main`. TBI has no Git integration and is released by CLI only. So any
> push to `main` moves CRC and leaves TBI behind until someone runs the CLI release.

Until TBI gets a Git integration of its own, **every release records both shas in this table**,
and a release is not finished while they differ. That is the discipline the audit asked for
(`docs/planning/2026-09-19-audit/HANDOFF-CODE-AUDIT-2026-09-19.md`, "TBI deploy record").

## Relay workers

Both workers ship from the same commit, and they ship **before** the web (`docs/RELAY-RELEASE.md`).
Released with `node scripts/deploy-relays.mjs --commit <sha> --confirm-production --gate-file <path>`;
the gate requires `renderers: 0` on both.

| Worker | Environment | Version id | Commit |
|---|---|---|---|
| `crc-live-relay` | default | `4f23536f-3e37-4b03-9fbf-63c813778a32` | `c8ce9c5` |
| `tbi-overlays-live-relay` | `tbi` | `7c280607-0c2d-4f58-9686-5d85c1d7115f` | `c8ce9c5` |

Released 2026-09-14 21:21 UTC (the cue log, fourth relay release). Record:
`work/deploy-staging/releases/c8ce9c5…/relay.json`.

## Environment deltas

- Both: `PUBLIC_BASE_URL` is the congregation's own custom domain, `PUBLIC_ALTERNATE_ORIGINS` its
  Vercel hostname. CRC swapped 2026-09-15; TBI 2026-09-14. All four hosts answer.
- CRC only: `CRC_LIVE_BASE_URL`, `CRC_LIVE_READ_TOKEN` (setlist import from centralreform.live),
  `SHARED_LIBRARY_EXPORT_KEY`.
- TBI only: `CRC_SHARED_LIBRARY_URL`, `SHARED_LIBRARY_IMPORT_KEY`.
- Both: `OVERLAYS_PUBLIC_NOW` is **unset**, and stays unset. `/api/now` answers 404 by design.
- Every name is listed with a placeholder in `.env.example`.

## Databases

Neon, one per workspace, 28 tables each. No migration is pending.

## Known-open, carried here so it is not lost

- `isolationVerified` is `false` on both workspaces and has been since the first deploy. It is set
  honestly after the rehearsal with Michael, not before.
- The MCP publish chain has never been watched end to end against the deployed function
  (Deploy record 25, "Not verified end to end").
