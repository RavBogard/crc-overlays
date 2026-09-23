# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-09-23** (paired release `43b9c8b`: server-fit census accounting is logged as JSON so Vercel retains nested attribution fields. Evidence below under "Release 43b9c8b".)

## Web, per workspace

Two congregations, one codebase, one deployment each. **Both are on the same commit today**, and
both were released together on 2026-09-23 UTC (2026-09-22 evening Central).

| Workspace | Host | Deployed commit | How it got there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `43b9c8b` | `scripts/deploy-workspaces.mjs`, 2026-09-23, `dpl_4pguDygcJi1w7oLxdmmWWtUhzmeS` (the Git integration also builds every push to `main`) |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `43b9c8b` | `scripts/deploy-workspaces.mjs`, same run, `dpl_5oTbzWg7hMjqMLA8Tvjdq7RsTng9` |

This file is written after the release it describes, so the commit carrying these words is always one
ahead of the shas in the table. That one commit is documentation: CRC's Git integration builds it by
itself and TBI is not owed a release for it. Any commit that touches `app/`, `lib/`, `content/`,
`components/`, `schemas/` or `workspaces/` **is** owed one.

### Release 43b9c8b (2026-09-23 UTC)

- `43b9c8b` is the reviewed JSON logging fix `d040865`, cherry-picked onto `088379e`. Released from clean exact-SHA guard `43b9c8b2a81ab608d63459601db15c7ffc667d65`. CRC `dpl_4pguDygcJi1w7oLxdmmWWtUhzmeS` and TBI `dpl_5oTbzWg7hMjqMLA8Tvjdq7RsTng9` are Ready; the two custom and two Vercel aliases returned HTTP 200 from `/health`.
- The read-only server-fit census and verdict behavior are unchanged. The `server-fit released` and residue lines now carry JSON strings, preventing Vercel console formatting from collapsing nested census categories, instance attribution, held files, or largest-other data to `[Object]`. No source, publication, relay, or hosted-fit action ran.
- Gates: `tsc --noEmit`; `npm test` (24 MJS checks included); `npm run lint`; and `npm run build` (42 routes). Logs: `work/sitting-2026-09-22/census-json-release-43b9c8b/`.
### Release 80c9371 (2026-09-23 UTC)

- `80c9371` is the reviewed census commit `ddcf197` cherry-picked (patch-identical) onto `642f878`.
  Released from clean exact-SHA guard `80c937139347b9d133f15b56d0dcc7a81cd86b5c`. CRC
  `dpl_DgnHxhQAK2zXJ7heqTgpRFtHQQM7` and TBI `dpl_8L4bn5cbzp9k7zt99EPEn4QPAcBj` are Ready; both
  custom domains resolve to them and all four aliases return HTTP 200.
- Adds a read-only `census {before, after}` of /tmp to each `server-fit released` line (Vercel
  only; caller latency capped at 250 ms, though a timed-out scan is not cancelled). Verdicts are
  unchanged. No source, publication, relay or human-review action ran.
- **Known defect, found after deploy:** Vercel records `console.info`, which prints nested objects
  only two levels deep. The census's `instance`, `files`, `held` and `largestOther` therefore log as
  `[Object]`; only `free`, `used`, `unattributed` and `ms` survive. Fix `d040865` (branch
  `codex/fit-census-log`, logs the line as JSON) awaits review. The hosted fit series is held until
  then.
- Gates: `tsc --noEmit`; `npm test` (787 pass, 11 skipped; 24 MJS pass); `npm run lint`;
  `npm run build` (42 routes). Logs: `work/sitting-2026-09-22/census-release-80c9371/`.

### Release 74f2051 (2026-09-23 UTC)

- Released from clean exact-SHA guard `74f20513063a5f7b562e3ab6462b9a8c39f5757c`.
  CRC `dpl_7y3jnWdf98JA3G1mJfLL3HVqgoSE` and TBI `dpl_3TxGsHmHGBpSQpJDzhmdp5vLGuNB`
  both reported Ready; custom and alternate aliases returned HTTP 200.
- Left/right single-channel copy now starts at its panel body's top edge beneath the title.
  Bilingual stacks, structured rows, and lower-thirds remain unchanged. No source, hosted
  authoring, fit, relay, publication, or human-review action ran in this release.
- Gates: `tsc --noEmit`; `npm test` (784 pass, 9 skipped; 24 MJS pass); `npm run lint`; and
  `npm run build` (42 routes). Logs: `work/sitting-2026-09-22/single-channel-top-align-release/`.

### Release 608f495 (2026-09-23 UTC)

- Released from a clean exact-SHA guard: `608f495682300f9fb0c8aee02bdda7d48192c3fc`. The paired
  CLI release record completed at `2026-09-23T01:23:37.259Z`; both custom-domain aliases are
  Ready on the deployment ids above. Required local gates were green before release. No relay
  change, push, publication, or hosted authoring refresh was performed by this release.
- `update_draft.refreshSourceIds` is now deployed. It permits an explicitly selected source
  snapshot refresh with optimistic version matching; it does not silently re-pin cosmetic edits.
- Root ran the exact 16 sequential checks on unchanged published Mah Tovu v1 / its existing
  preview: **16/16 pass**, fill `0.8040008907363421`, `server-chromium/1.63.0`. This is server
  fit evidence only; it is not human review or publication approval.
- The persistent profile/residue accounting did **not** establish that `/tmp` loss is fixed.
  Every release line reported `owned: 1`, `survivors: 0`, `heldBytes: 0`, `stillAlive: 0`, and
  scratch about 5.17 MB, yet free space fell across instances: `538333184→317767680`,
  `538333184→195379200`, then `195379200→73695232→41811968→37511168`; the final seven checks
  remained at `37511168`. No further fits were run. Evidence:
  `work/sitting-2026-09-22/fit-residue-integration/{hosted-fit-results.json,production-logs.jsonl}`.

### Release 9ab8f7b (2026-09-23 UTC)

- Released from the active `google-signin` checkout, clean, HEAD = `9ab8f7b8d61ece034b5208718f53c325d78acc36`
  (the script refuses any other HEAD or a dirty tree). Both builds 42/42 pages. Custom domains resolve to
  the two deployment ids above, both Ready/production. CLI deployments carry no git metadata, so the sha
  proof is the script guard plus served content: all five checked source `unitSha256` values equal this
  commit's `content/authoring-sources.json`. `relay/` is unchanged since `8954415`; no relay release.
  `main` was not moved and nothing was pushed (the `origin/main` hazard below still stands, now further behind).
- Sources (authenticated `get_source`): Unending Love and Yotzer Or serve the canonical parent `#block-0`
  plus `/slice-0` and `/slice-1` children carrying `canonicalParentBlockId`; the three private
  original-English sources (G'vurot interpretation, Am I Awake, How Awesome / Shema) are present with
  archive provenance.
- Hosted fit, 16 checks on the unchanged published draft "Mah Tovu" `bbd7c98b…` v1, existing preview
  `3d242037…`: **14 pass (fill 0.804, `server-chromium/1.63.0`), checks 7–8 `unavailable /
  stage_unavailable`**, no false `fail`, no retry. Checks 9 and 10 were sent together and may have
  overlapped; all others strictly serial. Failures: `phase: 'measure'`, `Target page, context or browser
  has been closed`, `tmpFreeBefore` 21.1 MB and 16.9 MB. Every check logged 0 survivors and 66 KB left in
  its scratch dir, but free `/tmp` fell 318 → 318 → 217 → 92 → 37 → 21 → 17 MB on the first instance and
  185 (×5) → 60 → 41 → 41 MB on the second. So the per-check scratch fix holds, and the remaining
  consumption is outside the scratch dir. Candidate, unverified: Playwright makes its
  `playwright_chromiumdev_profile-*` and `playwright-artifacts-*` dirs in the Node process's
  `os.tmpdir()`, not the browser's `TMPDIR`. **The server fit stage is improved (from 10/12) but not
  fixed**; the web fit check remains the fallback. Return and details:
  `crc-coordination/claude-1/STATUS.md`.

The mechanism that produced the 09-16 split is still there and will produce another:

> **A push to `main` deploys CRC production by itself.** `crc-overlays` has Vercel's Git
> integration enabled on `main`. TBI has no Git integration and is released by CLI only. So any
> push to `main` moves CRC and leaves TBI behind until someone runs the CLI release.

**TBI keeps the CLI release.** The Git-integration recommendation was withdrawn on 2026-09-20
(rulings addendum 2, correction): TBI deploys from a staged, allowlisted source tree that
`scripts/deploy-workspaces.mjs` builds, not from the raw repository, so a plain Git integration
would deploy the wrong tree. So **every release records both shas in this table**, and a release
is not finished while they differ.

**Ahead of production: nothing but documentation** (as of `9ab8f7b`; the paragraph below describes the
earlier `8954415` release). Released on 2026-09-22 from `google-signin` —
`main` was **not** moved, so CRC's Git integration has not built this and will not until `main` is
brought forward. Commits released, in order past `603e593`: `c5497ab` (slot graphics), `fa008ac` (A1,
one overlay stylesheet), `d1ab609` (server fit-stage readiness hardening, another session's),
`91a35a9` (A2, the Siona resting logo, module 1.7.0), `85e881d`, `9159d7c`, `6fc8bc3`, `2668bfd`
(documents), `8954415` (keeps TBI's 1.6.0 archive in the staging allowlist; the first web attempt was
refused by staging, before any deploy, for its absence).

> **Hazard: `origin/main` is at `c5497ab`, behind production.** Any push to `main` of that line, or
> a redeploy of CRC's latest Git build, would put CRC back on `c5497ab` — without the resting logo,
> A1's stylesheet or the fit hardening, and under a Companion 1.7.0 whose logo buttons it would refuse.
> The fix is a fast-forward: `git push origin be8e7da:main` (`origin/main` is an ancestor). The
> Git integration then rebuilds the same tree. The releasing session's sandbox refused that push as
> a production deploy, so it has not been done. Nothing is pushed: `origin/google-signin` is still
> `ebcc893`.

Owed after this release, recorded in RETURN-A2 §8: the resting logo has not yet been exercised on the
production output — the releasing session's sandbox refused authenticated production commands — and
the server fit stage still fails at `measure` after ten rapid checks (10/12 passed; checks 11–12
`stage_unavailable`, `Target page, context or browser has been closed`).
(`d33408c`) was held back over Kol Nidre and Yom Kippur and merged on 2026-09-20 once Daniel confirmed
the overlays are not used for either service and do not go live until the following week; it has been
on `main` and in production since then, and the 2026-09-22 order to merge it found nothing left to do.

**Three more commits released on 2026-09-22 at 15:00 UTC**, in order: `273ec83` (the Cowork handoff),
`523178c` (slots, "This service", Companion module 1.6.0) and `603e593` (a `.gitignore` line the
release script needed). `4a61f2d`, the converter run, touches only `scripts/` and `docs/` and is
carried along. `relay/` did not change, so no relay release was owed. Both hosts answer 200, `/author`
renders, and `/this-service` answers 200 on both.

The Companion module archives: **1.7.0** is served and `WORKSPACE_COMPANION_MODULE_PATH` points at
it on both — CRC `public/downloads/crc-overlays-1.7.0.tgz` (sha256 `63ba9093…6555`), TBI
`public/workspaces/temple-bnai-israel/downloads/tbi-overlays-1.7.0.tgz` (sha256 `b2435a42…6c90`), both
verified byte-identical as served. 1.6.0 and earlier stay downloadable. `@companion-module/base` and `runtime.apiVersion` are still 2.0.4 — Companion 5.0.3 silently
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
| `crc-live-relay` | default | `00f3c73f-0014-42cc-8a66-119544228b96` | `2668bfd` |
| `tbi-overlays-live-relay` | `tbi` | `dd1e9899-c1a2-402b-88b6-b93c1e99219c` | `2668bfd` |

Released 2026-09-22 19:44 UTC (the resting logo's `logo` action and state field; sixth relay release).
Gate, taken by Daniel read-only at 19:43: CRC 0 renderers / 1 controller, TBI 0 / 0. Record:
`work/deploy-staging/releases/2668bfd…/relay.json`, `status: complete`. `relay/` is identical at the
web commit `8954415`. Previous: `c013c8eb…` / `47f7d260…` from `0fb6514` (2026-09-20), which is the
relay rollback target; the new relay serves the old web unchanged.

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
