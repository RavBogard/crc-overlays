# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-09-20** (Wave 2 round two of the four-project audit; see
`docs/planning/2026-09-19-audit/RETURN-CODE-AUDIT-2026-09-19-W2.md` and `-W2B.md`).

## Web, per workspace

Two congregations, one codebase, one deployment each. **Both are on the same commit today**, and
both were released together on 2026-09-20.

| Workspace | Host | Deployed commit | How it got there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `4d80925` | Vercel Git integration on `main` |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `4d80925` | `scripts/deploy-workspaces.mjs`, 2026-09-20 11:40 CT |

The mechanism that produced the 09-16 split is still there and will produce another:

> **A push to `main` deploys CRC production by itself.** `crc-overlays` has Vercel's Git
> integration enabled on `main`. TBI has no Git integration and is released by CLI only. So any
> push to `main` moves CRC and leaves TBI behind until someone runs the CLI release.

**TBI keeps the CLI release.** The Git-integration recommendation was withdrawn on 2026-09-20
(rulings addendum 2, correction): TBI deploys from a staged, allowlisted source tree that
`scripts/deploy-workspaces.mjs` builds, not from the raw repository, so a plain Git integration
would deploy the wrong tree. So **every release records both shas in this table**, and a release
is not finished while they differ.

**Ahead of production:** `google-signin` carries two commits `main` does not — `6a6730a` (this file)
and `d33408c`, which removes the 61 vendored shadcn files nothing imports and eighteen dependencies with
them. Held back deliberately over Kol Nidre and Yom Kippur: it changes the production build's dependency
tree for no user-visible benefit. Merging it is one `git push origin google-signin:main`.

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
- ~~`content/siddur-library.json` and `content/moments.json` are behind the upstream rulings.~~
  **Closed 2026-09-20.** Both were regenerated from shireishabbat `425f52f` and merged (PR #6,
  `4d80925`): four ruled-retired unit ids out, four successors in, two changed, and the moments
  table now matches the producer's exactly. On deployed production 153 of 206 cues carry a
  position, including the three Kedusha cues and the five High Holy Day cues whose pins the
  regeneration retired — those five forward through `content/retired-units.json`.
- **`SHIREISHABBAT_TOKEN` cannot read the source repository's Actions** (HTTP 403 on the workflow
  runs API), so the Siddur library workflow cannot take the published `dist-app` artifact and
  falls back to cloning the repository and building it, braille dependency and all. Granting that
  token `Actions: read` retires the fallback. Daniel's.
