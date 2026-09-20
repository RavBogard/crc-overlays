# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-09-20** (Wave 2 of the four-project audit; see
`docs/planning/2026-09-19-audit/RETURN-CODE-AUDIT-2026-09-19-W2.md`).

## Web, per workspace

Two congregations, one codebase, one deployment each. **Both are on the same commit today**, and
both were released together on 2026-09-20.

| Workspace | Host | Deployed commit | How it got there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `0fb6514` | Vercel Git integration on `main` |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `0fb6514` | `scripts/deploy-workspaces.mjs`, 2026-09-20 09:27 CT |

The mechanism that produced the 09-16 split is still there and will produce another:

> **A push to `main` deploys CRC production by itself.** `crc-overlays` has Vercel's Git
> integration enabled on `main`. TBI has no Git integration and is released by CLI only. So any
> push to `main` moves CRC and leaves TBI behind until someone runs the CLI release.

Until TBI gets a Git integration of its own, **every release records both shas in this table**,
and a release is not finished while they differ. That is the discipline the audit asked for
(`docs/planning/2026-09-19-audit/HANDOFF-CODE-AUDIT-2026-09-19.md`, "TBI deploy record").

**Ahead of production:** `google-signin` carries two Wave 2 commits (`6123afa`, `2a5a6d7`) that
are not on `main` — the moments agreement check and the rename forwarding list. Merging them is a
CRC production deploy.

## Relay workers

Both workers ship from the same commit, and they ship **before** the web (`docs/RELAY-RELEASE.md`).
Released with `node scripts/deploy-relays.mjs --commit <sha> --confirm-production --gate-file <path>`;
the gate requires `renderers: 0` on both.

| Worker | Environment | Version id | Commit |
|---|---|---|---|
| `crc-live-relay` | default | `c013c8eb-4ade-4477-ad5d-0fdb285f011c` | `0fb6514` |
| `tbi-overlays-live-relay` | `tbi` | `47f7d260-5e95-4fe1-afe3-2a209461bb5a` | `0fb6514` |

Released 2026-09-20 14:21 UTC (the cue log's liturgical position, fifth relay release). Gate:
both workspaces 0 renderers and 0 controllers. Record:
`work/deploy-staging/releases/0fb6514…/relay.json`, `status: complete`.

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
  (Deploy record 25, "Not verified end to end"). It needs an authoring-scope MCP session, which
  only Daniel can consent to.
- `GET /api/history` cannot be read by anyone here: it answers an authoring member or a
  `history_reader` credential, and no `history_reader` has been minted. A `CONTROL_KEY` is
  refused. This is what stands between here and the Wave 3 confirmation.
- **`content/siddur-library.json` and `content/moments.json` are both behind the upstream
  rulings.** The library is pinned to shireishabbat `3625287` and still holds four ruled-retired
  unit ids; the moments table is four pairs out (R9-b and R6-h). One dispatch of the Siddur
  library workflow regenerates both and opens a pull request. Until then, three published cues
  (Kedusha 1, 2 and 3) report no liturgical position on air.
