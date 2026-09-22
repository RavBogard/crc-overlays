# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-09-22** (unchanged deployment; the A2 resting-logo release is prepared and
blocked — see "Ahead of production" below. Previous entry: the Companion cutover: slots, "This service", module 1.6.0 and the
converter run; see `docs/planning/2026-09-22-companion-cutover/RETURN-CODE-2026-09-22-companion-cutover.md`).

## Web, per workspace

Two congregations, one codebase, one deployment each. **Both are on the same commit today**, and
both were released together on 2026-09-22.

| Workspace | Host | Deployed commit | How it got there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `603e593` | `scripts/deploy-workspaces.mjs`, 2026-09-22 15:00 UTC (the Git integration also builds every push to `main`) |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `603e593` | `scripts/deploy-workspaces.mjs`, same run |

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

**Ahead of production: six commits, and a relay release is owed with them.** As of 2026-09-22 the
checkout `google-signin` is at `9159d7c` plus the documentation commit carrying these words, six
commits past the deployed `603e593`:

| Commit | What |
|---|---|
| `c5497ab` | the sixteen slot graphics |
| `fa008ac` | A1 — one stylesheet, Hebrew above transliteration, room for the title |
| `d1ab609` | another session's server fit-stage readiness hardening |
| `91a35a9` | A2 — the Siona resting logo and its controls, Companion module 1.7.0 |
| `85e881d`, `9159d7c` | planning documents, landed only so the release scripts see a clean tree |

`relay/src/protocol.ts` and `relay/src/index.ts` changed in `91a35a9`, so **this release owes a relay
release first** — a web build that can send `action: 'logo'` must not meet a `0fb6514` relay. The
release is authorized (AUTHORIZATION.md, `PACKET-A2-RELEASE.md`) and every local gate passes, but it
**has not run**: `scripts/deploy-relays.mjs` accepts only a read-only idle gate reading showing
`renderers: 0` on both workspaces, and the session that prepared the release could not take that
reading — its tool sandbox refuses production reads. Nothing was deployed, nothing was half-deployed,
and no deployment record was written. The exact remaining commands and every owed hosted check are in
`docs/planning/2026-09-22-sitting-prep/RETURN-A2.md` §8.

Module archives 1.7.0 are built and committed but **not yet served**: production still serves 1.6.0.

Historical note, still true of the deployed commit: `google-signin` and `main` were the same commit. The shadcn strip
(`d33408c`) was held back over Kol Nidre and Yom Kippur and merged on 2026-09-20 once Daniel confirmed
the overlays are not used for either service and do not go live until the following week; it has been
on `main` and in production since then, and the 2026-09-22 order to merge it found nothing left to do.

**Three more commits released on 2026-09-22 at 15:00 UTC**, in order: `273ec83` (the Cowork handoff),
`523178c` (slots, "This service", Companion module 1.6.0) and `603e593` (a `.gitignore` line the
release script needed). `4a61f2d`, the converter run, touches only `scripts/` and `docs/` and is
carried along. `relay/` did not change, so no relay release was owed. Both hosts answer 200, `/author`
renders, and `/this-service` answers 200 on both.

The Companion module archives moved with it: `public/downloads/crc-overlays-1.6.0.tgz` and
`public/workspaces/temple-bnai-israel/downloads/tbi-overlays-1.6.0.tgz` are served, and
`WORKSPACE_COMPANION_MODULE_PATH` points at each. 1.5.0 stays downloadable for anyone still running
it. `@companion-module/base` and `runtime.apiVersion` are still 2.0.4 — Companion 5.0.3 silently
refuses 2.2.0 and above.

**Earlier on 2026-09-22, three commits**, in order: `c5b8b96` (the author-page split), `d15a163` (the
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
- **The source-commit stamp still has not been seen carrying anything.** Seven real revisions were
  published into CRC's production library on 2026-09-22 (the slot graphics), so the write path has now
  run for real — and every one recorded `sourceCommits: null`, correctly: a slot is a local custom
  graphic with no pinned library sources, so there is nothing to stamp. A published revision of a
  graphic built from the siddur is still what would show it.
- **All sixteen slot graphics are published, and all sixteen still carry placeholder text.** They were
  minted with *Reader Name* / *Guest Name* / *Name* because the fit check needs something to measure
  and the MCP surface refuses an empty string. Nothing is on air — no button points at a slot until
  Michael's converted deck is imported — but they want blanking through "This service" first. See the
  return document, §8.
- **The fit-check stage refuses after about five checks in a row.** It is the gate on every publish
  in the system, not just slots. The refusals are `stage_unavailable` and `deadline_exceeded`, never
  `browser_unavailable`, so Chromium launches and the `/author/fit-stage` page it loads is what fails
  — that page answers 200 in 0.1 s from outside. Retrying the same preview immediately often gets
  through; a deployment always clears it. Anyone publishing a batch should expect it.
- **`save_slots` has not been exercised against Postgres.** Its tests run against the in-memory
  repository. The publish gate it widens is the same function in both repositories, and the six
  published slots went through the Postgres path by the ordinary route, but the one-click slot Save
  itself has only been proven in memory. The first real Save on "This service" is the test.
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
