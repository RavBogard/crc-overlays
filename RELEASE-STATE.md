# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-09-22** (the author-page split of W2B §5, the Wave 2 item 7b source-commit
stamp and the migration it needed on both databases; see
`docs/planning/2026-09-19-audit/RETURN-CODE-AUDIT-2026-09-19-W2.md` §7 and `-W2B.md` §5).

## Web, per workspace

Two congregations, one codebase, one deployment each. **Both are on the same commit today**, and
both were released together on 2026-09-20.

| Workspace | Host | Deployed commit | How it got there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `6ac07d2` | `scripts/deploy-workspaces.mjs`, 2026-09-22 (the Git integration also builds every push to `main`) |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `6ac07d2` | `scripts/deploy-workspaces.mjs`, same run |

This file is written after the release it describes, so the commit carrying these words is always one
ahead of the shas in the table. That one commit is documentation: CRC's Git integration builds it by
itself and TBI is not owed a release for it. Any commit that touches `app/`, `lib/`, `content/`,
`components/`, `schemas/` or `workspaces/` **is** owed one.

The mechanism that produced the 09-16 split is still there and will produce another:

> **A push to `main` deploys CRC production by itself.** `crc-overlays` has Vercel's Git
> integration enabled on `main`. TBI has no Git integration and is released by CLI only. So any
> push to `main` moves CRC and leaves TBI behind until someone runs the CLI release.

**TBI keeps the CLI release.** The Git-integration recommendation was withdrawn on 2026-09-20
(rulings addendum 2, correction): TBI deploys from a staged, allowlisted source tree that
`scripts/deploy-workspaces.mjs` builds, not from the raw repository, so a plain Git integration
would deploy the wrong tree. So **every release records both shas in this table**, and a release
is not finished while they differ.

**Ahead of production: nothing.** `google-signin` and `main` are the same commit. The shadcn strip
(`d33408c`) was held back over Kol Nidre and Yom Kippur and merged on 2026-09-20 once Daniel confirmed
the overlays are not used for either service and do not go live until the following week; it has been
on `main` and in production since then, and the 2026-09-22 order to merge it found nothing left to do.

**Three commits released on 2026-09-22**, in order: `c5b8b96` (the author-page split), `d15a163` (the
source-commit stamp) and `6ac07d2` (four Companion research documents another session left untracked
in this worktree, landed so the release ran from a clean tree). `relay/` did not change, so no relay
release was owed. Both hosts answer 200 and `/author` renders.

**Five releases on 2026-09-20**, in order: `96cd715` (Wave 2 commits), `4d80925` (library at
shireishabbat `425f52f`), `a0913a4` (the shadcn strip and the staging fix it required), `c05e244`
(library at shireishabbat `ad89282`), `70ad8bb` (this file, taken for parity). `relay/` did not change, so no relay release was owed.

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

Neon, one per workspace, 28 tables each. **No migration is pending.**

One ran on 2026-09-22, before the release that needed it, from `scripts/migrate-authoring.mjs`:
`authoring_revisions` gained `source_commits text[]` on both, 9 columns to 10. `ADD COLUMN IF NOT
EXISTS`, nullable, no default, so no table was rewritten and no row was touched — CRC 193 revisions /
217 drafts and TBI 205 revisions / 220 drafts, unchanged either side, 28 tables still. Every existing
row is NULL and nothing backfills them; the stamp starts with the next publish. Reversible with
`DROP COLUMN`.

## Known-open, carried here so it is not lost

- `isolationVerified` is `false` on both workspaces and has been since the first deploy. It is set
  honestly after the rehearsal with Michael, not before.
- The MCP publish chain has never been watched end to end against the deployed function
  (Deploy record 25, "Not verified end to end"). It needs an authoring-scope MCP session, which
  only Daniel can consent to.
- **The source-commit stamp has never been seen on a real published revision.** The column is live on
  both databases and the write path is covered by two unit tests, but confirming it end to end means
  publishing a draft into a congregation's production library, which was not done. The first real
  publish on either workspace will show it.
- **`app/author/page.tsx` is 870 lines, not the under-500 the order asked for.** W2B §5's six
  extractions are all done and are what shipped; the remaining ~370 lines are the thirty async
  handlers and the 130-line return, and lifting them means either action hooks with ten to sixteen
  injected dependencies or splitting `AuthorPage` into a library view and an editor view. The second
  is the right answer and is a redesign, not a lift. See the commit message on `c5b8b96`.
- **Nothing automated covers the authoring editor's behaviour.** The three test files that mention
  `app/author/page.tsx` read it as text and assert on markup. Undo/redo, recovery copies, draft sets
  and the shared shelf have no coverage at all, which is why the split above stopped where it did, and
  why §5's own verification asks for a manual pass and a `fit_check_draft` comparison that only Daniel
  can run.
- **CRC's database carries three extra schemas holding copies of authoring data**:
  `crc_authoring_rehearsal`, `recovery_1789266627016_4533dca5` and `recovery_1789306559735_c9c2c2d7`.
  The last two are retained restores from `scripts/restore-recovery-rehearsal.mjs`, which prints a
  `DROP SCHEMA … CASCADE` and leaves the schema for inspection. They are inert and were not touched by
  the 09-22 migration, which alters `public` only. TBI has `public` alone. Dropping them is Daniel's
  call.
- `GET /api/history` cannot be read by anyone here: it answers an authoring member or a
  `history_reader` credential, and no `history_reader` has been minted. A `CONTROL_KEY` is
  refused. This is what stands between here and the Wave 3 confirmation.
- ~~`content/siddur-library.json` and `content/moments.json` are behind the upstream rulings.~~
  **Closed 2026-09-20.** Both were regenerated from shireishabbat `425f52f` and merged (PR #6,
  `4d80925`): four ruled-retired unit ids out, four successors in, two changed, and the moments
  table now matches the producer's exactly. On deployed production 153 of 206 cues carry a
  position, including the three Kedusha cues and the five High Holy Day cues whose pins the
  regeneration retired — those five forward through `content/retired-units.json`. Regenerated again
  the same evening from `ad89282` (PR #7, `c05e244`): no unit id added or removed, 26 Rosh Hashanah
  morning units changed — 28 Hebrew strings recomposed into canonical order, byte-different and
  NFC-identical, no wording touched — and four folios shifted down one where a page came out
  upstream.
- ~~`SHIREISHABBAT_TOKEN` cannot read the source repository's Actions.~~ **Closed 2026-09-20.**
  Daniel granted `Actions: read`, and run 35526355940 took the published `dist-app` artifact
  directly — 22.8 MB from the producer's run 35524500710, which concluded `failure` while its
  `publish-app-surface` job succeeded, the exact case the fetcher was written for. The checkout
  fallback stays in the workflow and is now the path nothing uses.

## Two things the 2026-09-20 evening release found

- **The TBI staging allowlist required `hooks/`**, which the shadcn strip emptied, so the first
  release after it refused before touching anything. `scripts/stage-workspace-source.mjs` now copies
  that one directory when present. CRC deploys from the repository and never saw it; only the staged
  workspace did, which is the whole reason the two paths are worth keeping honest about each other.
- **The Tests workflow had never run.** It declared `permissions: {}`, which grants a job token
  nothing — not even `contents: read` — so `actions/checkout` could not read this private repository
  and all twelve runs since 2026-09-19 died before a single test. Fixed in `1d217d4`; the first
  green run on `main` is 35526516798, all three jobs. Anything merged to `main` between 09-19 and
  09-20 was covered by local runs only.
