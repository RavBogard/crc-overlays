# RETURN-CODE-AUDIT-2026-09-19-W1 — crc-overlays

Executor: Claude Code (Opus 5), one session, 2026-09-19 evening CT
Order: `HANDOFF-CODE-AUDIT-2026-09-19.md` · Rulings: `RULINGS-AUDIT-2026-09-19.md` · Master: `PLAN-AUDIT-MASTER-2026-09-19.md`
Branch `google-signin`, `6219bdf` → `73c4f1a`, six commits. Nothing deployed — see **The deploy, and why it did not happen**.

## The checklist

| Wave 1 item | Verdict |
|---|---|
| Cue log records the liturgical position | **PASS (code)** / **NOT VERIFIED IN PRODUCTION** — not deployed |
| Verify the MCP publish chain once | **BLOCKED** — needs an `authoring`-scope MCP session that only Daniel can consent to |
| CI that runs the tests | **PASS** |
| `.env.example` | **PASS** |
| Hostname drift after the domain swap | **PASS** |
| TBI deploy record | **PASS (the recording half)** — the Git-integration half is Daniel's choice |
| `RELEASE-STATE.md` | **PASS** |
| Branches, worktrees, scripts, stale checkout | **PASS**, with one correction to the order |
| Record R-0919-audit-7 | **PASS** |
| Governance (R-0919-audit-8) | **PASS** — checked, nothing to remove |

Suites, all green, on `73c4f1a`:

```
root      716 tests · 710 pass · 0 fail · 6 skipped   (npm run test:ts)
root       16 tests ·  16 pass · 0 fail               (npm run test:mjs — had never run)
relay      50 tests ·  50 pass · 0 fail
companion 121 tests · 121 pass · 0 fail
python     15 tests ·  14 pass · 0 fail · 1 skipped   (npm run test:py — had never run)
tsc --noEmit: clean    eslint: clean    next build: exit 0
```

---

## 1. The cue log — `ffc69e8`

The diagnosis in the order was right, and I confirmed the load-bearing part directly:
`shma.barchu@legacy-shabbat-morning` **is** a live `authority.unitId` in
`content/siddur-library.json` today, carried by
`library:legacy-shabbat-morning:shma.barchu@legacy-shabbat-morning`. So the Barechu cue was
always resolvable; three filters stood in the way.

All three are gone:

- `relay/src/protocol.ts` `librarySourceIds` keeps the ids it was given, still bounded by
  `length<=160` and `slice(0, MAX_HISTORY_SOURCE_IDS)`. The relay does not hold the library and
  cannot tell a library id from any other, so it is the wrong place to decide.
- `lib/service-history.ts` `sourceIdsOf` — same filter, same removal.
- `lib/liturgy-index.ts` `liturgyForSourceIds` tries the library key first, then the bare
  `authority.unitId` through a new index built the same way (712 distinct unit ids across 732
  sources; 20 are duplicated and the first wins, which is the rule `loadMoments` already uses).

**The logged miss.** A pinned id that meant to name a unit and matched neither way now produces a
`console.warn` naming the id. An id that names no unit — `custom:`, `upload:` — is not a miss and
stays quiet; the test asserts both halves. This is the part that matters beyond this one bug:
the reason four days went unnoticed is that a miss and a cue with no liturgy were
indistinguishable from outside.

Two tests added (`tests/liturgy-index.test.ts`), one updated (`relay/tests/history.test.ts`,
which pinned the old filter).

**What I cannot claim.** The order's "done when" is a fired cue coming back from
`GET /api/history` with non-null `unitId`, `momentId`, `book` and `folio`. That needs the relay
released and the web deployed, and neither happened tonight. **There is no production row to
quote, and I am not going to imply otherwise.** The evidence I do have is the unit test that
resolves a bare unit id to the same position as the library key, and the 26 unrecoverable rows
were left alone as instructed. `serviceRef` null was confirmed expected and untouched.

## 2. The deploy, and why it did not happen — **the one thing Daniel should read**

I did not release the relay or deploy the web. Three independent reasons, any one of which is
sufficient:

1. **`docs/RELAY-RELEASE.md` requires a clean tree** — `git status --porcelain
   --untracked-files=all` empty. It is not: twelve entries, ten of them documentation a previous
   session left uncommitted, and **two of them a previous session's unfinished code**
   (`scripts/convert-companion-singular.mjs` and its test, 433 added lines). Clearing that
   blocker means committing someone else's work-in-progress into a production relay release. I
   will not do that, and the script refuses before it does anything, which is correct.
2. **The procedure names a "quiet weekday" as a prerequisite.** It is Saturday, 19:05 CT.
3. **Kol Nidre is tomorrow evening.** Shipping a relay change into the highest-attendance
   services of the year, to fix a defect in *logging*, is the wrong trade. Nothing the
   congregation sees is affected by this bug or by its fix.

**GATE: the Wave 1 relay + web release — deferred, because the release script's clean-tree gate
cannot be met without committing another session's unfinished code, the documented "quiet
weekday" prerequisite is not met on a Saturday, and the change fixes logging only, hours before
Kol Nidre. Rollback cost is low but the benefit does not arrive until a service runs, and the
next service is the one not to gamble with.**

The cost is real and worth stating: if this does not ship before the Yom Kippur services, those
services will not be logged with positions either, and Wave 3 — "confirm the cue log on a real
service" — waits for a service after that.

When the tree is clean and the day is quiet, it is:

```
node scripts/deploy-relays.mjs --commit <full-sha> --confirm-production --gate-file <path>
node scripts/deploy-workspaces.mjs      # relay first, always
```

The gate file wants `renderers: 0` on both workspaces, stamped within ten minutes.

## 3. MCP publish chain — blocked on Daniel

It needs an MCP session holding the `authoring` scope. The CRC_Overlays connector in this session
exposes only `authenticate` / `complete_authentication`, which means it is not connected, and
consent is by workspace sign-in — a human step, by design, and `CONTROL_KEY` is refused for
`author`. Draft `ffe1eedc-80c4-48e9-a9b8-e841131101bd` and the four steps are still waiting in §5
of `work/handoffs/RETURN-CODE-SERVER-FIT-2026-09-16.md`.

## 4. CI — `392ed4d`

`.github/workflows/tests.yml`, on push and pull request, three jobs (root / relay / companion) so
one red suite cannot hide another, plus `tsc --noEmit` and `eslint`. It reads no secret and
deploys nothing.

The glob fix found two files that had **never run once**:

- `tests/convert-companion-singular.test.mjs` — 16 cases, all passing. Also checked the committed
  version (10 cases) in isolation, since the working tree's copy is that other session's WIP;
  both are green, so CI is green either way.
- `tests/test_cue_sources.py` — 15 cases. 14 pass.

**The fifteenth is worth Daniel's attention.** It builds the authoring pack from a shireishabbat
checkout at a path hardcoded to this machine. It now reads `CRC_SHIREISHABBAT_ROOT` with the same
default and skips when the checkout is absent (always, on a runner). Where the checkout *does*
exist it fails:

```
supplement file changed: build/typst/content/shared/awakening.typ
```

That is not a defect here. `awakening.typ` last moved upstream in shireishabbat `14b642c`,
**"feed: declare the Shabbat-morning translation pairs"** — the translation-pairs work the Wave 2
translation item has been waiting on. It appears to have landed. Regenerating
`content/authoring-sources.json` changes what graphics are built from, so I did not do it inside
a hygiene item; it wants its own pass.

## 5. Hostname drift — `80ed0fe`

Swept: `companion/src/main.ts` (×3), `lib/oauth-core.ts`, `scripts/prepare-workspace.mjs`,
`scripts/deploy-workspaces.mjs` (×2), `scripts/convert-companion-singular.mjs` (×2),
`docs/MCP.md` (×2), `docs/LIVE-ARCHITECTURE.md`, `companion/README.md`.
`lib/google-sign-in.ts` untouched, as instructed.

The knock-on was handled rather than deferred. `scripts/build-tbi-companion-module.mjs` now maps
each CRC host to the matching TBI host and asserts three base URLs **across both spellings
together**, so the module package committed today (built before the swap, carrying the Vercel
host) still derives byte for byte, and one rebuilt from the new source will too. Verified with
`node scripts/audit-companion-packages.mjs`: the committed TBI package is still the exact
derivation of the committed CRC package. The TBI leak guard in
`scripts/prepare-workspace-companion.mjs` now catches **either** CRC host — catching only the old
one would have let the new one through, which is a worse bug than the one being fixed.

**Two corrections to the order.**

- The stated reason — that `*.vercel.app` hosts now sit behind Vercel SSO and can fail for
  someone not signed in to Vercel — **did not reproduce**. All four hosts return the real
  application to an anonymous request, checked tonight (`crc-overlays.vercel.app` and
  `tbi-overlays.vercel.app` both serve their own `<title>`, no SSO interstitial). The sweep is
  still right, because the written default should be the primary domain, but nothing was broken
  and nobody was locked out.
- `docs/ACCESS.md` said four addresses are registered with Google when `REGISTERED_ORIGINS` has
  six. Fixed here, same drift.

`scripts/audit-companion-packages.mjs` still names the Vercel host and should: it describes what
the committed `.companionconfig` files actually contain.

Two tests pinned the old fallback origin and were updated with the code, not around it.

## 6. `.env.example` — `d427743`

Thirty-eight names, grouped, required/optional, per workspace, placeholders only. `.gitignore`
gains `!.env.example`. Re-grepped every `process.env` / `os.environ` read across `app lib scripts
relay/src companion/src tests`: nothing missing. The one name deliberately absent is
`CRC_ENV_TEST_SECRET`, which a test invents to prove an unknown secret is *not* forwarded.

## 7. TBI deploy record + `RELEASE-STATE.md` — `73c4f1a`

`RELEASE-STATE.md`, 64 lines. Writing it surfaced the drift the audit predicted:

| Workspace | Commit | How |
|---|---|---|
| CRC | `1f9a5f3` | Vercel Git integration on a push to `main` |
| TBI | `7582b66` | last CLI release (Deploy record 25) |

The difference is documentation only, so both congregations run the same code today — but the
mechanism is real. The file carries both shas in one table with the rule that a release is not
finished while they differ. **Connecting a Git integration on the `tbi-overlays` project is still
Daniel's call**; the one-line-of-discipline alternative is now in place.

`CLAUDE-HANDOFF.md`: 150 KB → **5.5 KB**. History moved unedited to
`docs/planning/2026-09-deploys/` as `DEPLOY-RECORDS.md` (all 25), `RELEASE-HISTORY-2026-09.md`
and `BUILD-NOTES-2026-09-13-14.md`.

## 8. Worktrees, branches, scripts, stale checkout — `28683c1`

**A correction to the order.** It said the eight worktrees were "all reported `prunable`". They
were not — all eight directories existed on disk and `git worktree prune --dry-run` was a no-op.
Removing them was therefore a real deletion, not a prune, so I checked each first. Six were
completely clean and one (`-opening`) held only `__pycache__`; those seven are gone and their
branches survive. `git worktree list` now shows this worktree and the older checkout.

Seven merged branches deleted. `git branch --merged google-signin` now lists only `google-signin`
and `main`. **Eighteen unmerged branches were left alone**, as instructed:

`codex/authoring-backend`, `codex/authoring-mcp`, `codex/authoring-ui`, `codex/birchot-density`,
`codex/catalog-alias-resolution`, `codex/catalog-console`, `codex/companion-catalog-sync`,
`codex/companion-controls`, `codex/companion-hidden`, `codex/full-panel-spacing`,
`codex/legacy-source-adapter`, `codex/live-relay`, `codex/live-relay-check`,
`codex/morning-next-nine`, `codex/oauth-offline`, `codex/opening-service`,
`codex/output-url-discovery`, `codex/overlay-fidelity`, `codex/panel-density`,
`codex/published-catalog-cache`, `codex/push-companion`, `codex/readiness-prep`,
`codex/sequence-density`, `codex/site-check`, `codex/snapshot-payload-cache`.

Five unreferenced scripts deleted; `scripts/migrate-authoring.mjs` stays. `npm run build` exits 0.

**The stale checkout was fast-forwarded, not deleted.** Local `main` was 248 commits behind at
`ce018e1` and is now `1f9a5f3`. It holds untracked material that is not in git —
`.playwright-mcp/`, `Claude outputs/`, `_to_delete/` and a copy of `CLAUDE-HANDOFF.md` — so
deleting it was not a call to make here. The old handoff copy is renamed
`CLAUDE-HANDOFF.stale-2026-09-19.local.md` so nobody mistakes it for the current one.
**GATE: the older checkout kept and fast-forwarded rather than deleted, because it holds
untracked material that exists nowhere else.** Whether it goes is still Daniel's.

## 9. R-0919-audit-7 and governance

The licence note is in `docs/WORKSPACE-DEPLOYMENT.md` beside the isolation checklist, naming the
ruling id. Checked against the code before writing it: `buildSharedLibraryPayload` skips only a
hidden cue — there is no licence filter, exactly as the ruling says.

Governance, as predicted and now confirmed: **no `CLAUDE.md`, no `AGENTS.md`, no "PRODUCER
TRANSITION" banner, no "STANDING TERMINAL" block** anywhere in this repository. Root holds two
Markdown files, `CLAUDE-HANDOFF.md` and `README.md`, plus the new `RELEASE-STATE.md`. Nothing to
remove. `docs/planning/<date>-<topic>/` is already where orders and returns live.

---

## For Daniel

1. **Nothing is deployed.** The cue-log fix is committed and green but lives only in git. The
   deploy wants a clean tree and a quiet day; reasons in §2.
2. **Two files in the working tree are somebody's unfinished work** —
   `scripts/convert-companion-singular.mjs` and its test, 433 added lines, passing. They are the
   reason the release gate cannot be met. Someone should land or drop them.
3. **The translation pairs appear to have landed upstream** (shireishabbat `14b642c`). That is the
   thing the Wave 2 translation item was waiting on. See §4.
4. **Two calls still yours:** a Git integration for `tbi-overlays`, and whether the older checkout
   at `C:\Users\dsbog\crc-overlays` stays.
5. **The MCP publish chain still has not been watched end to end** and needs you to consent to an
   authoring-scope session.

## Wave 2 readiness

Wave 1 CI exists, so items 7 and 10 of the master plan are unblocked on this side. The moments
agreement check still waits on shireishabbat's Wave 1. The translation layer item is still
waiting on `HANDOFF-CODE-CORPUS-TRANSLATION-PAIRS-2026-09-14.md`, and §4 is the first sign it may
have been answered — no pairing was guessed here, and none should be.
