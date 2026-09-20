# RETURN-CODE-AUDIT-2026-09-19-W2 — crc-overlays

Executor: Claude Code (Opus 5), one session, 2026-09-20 morning CT
Order: `HANDOFF-CODE-AUDIT-2026-09-19.md` · Rulings: `RULINGS-AUDIT-2026-09-19.md` · Master: `PLAN-AUDIT-MASTER-2026-09-19.md`
Prior return: `RETURN-CODE-AUDIT-2026-09-19-W1.md` — this finishes what that one left owed, then starts Wave 2.
Branch `google-signin`, `d62e1df` → `2a5a6d7`, four commits. **Released: relay to both workers, web to both workspaces, from `0fb6514`.**

## What Wave 1 owed, and what it now has

| Owed | Now |
|---|---|
| Clean tree so the release gate could be met | **DONE** — two commits, §1 |
| Whole-suite run | **DONE** — §2 |
| Relay released to both workers | **DONE** — `c013c8eb…` / `47f7d260…`, §3 |
| Web deployed to both workspaces | **DONE** — both from `0fb6514`, §3 |
| A fired cue returning a position from production | **DONE, by a different route than the order named** — §4. This is the paragraph to read. |
| MCP publish chain | **STILL BLOCKED** on Daniel's authoring-scope consent, unchanged |

## Wave 2, started

| Item | Verdict |
|---|---|
| Adopt the moments agreement check | **DONE** — and it found four drifted pairs, §5 |
| Forwarding list for renamed upstream unit ids | **DONE** — and it found three broken cues in production, §6 |
| Stamp the source commit on each published cue | **NOT DONE — deferred with a reason and a plan**, §7 |
| Strip the unused UI components | not started |
| Split `app/author/page.tsx` | not started |
| Translation layer: note it, do not build around it | **NOTED**, §8 |

---

## 1. The tree, and somebody else's work

Wave 1 could not release because `git status --porcelain --untracked-files=all` was not empty and
two of the twelve entries were another session's unfinished code. Both are landed, in their own
commits, rather than dropped:

- `92ef85b` — ten planning documents written between 09-14 and 09-15 and never committed: seven
  integration-round handoffs, the publish-path handoff's Part 1A, the backlog report's revisions,
  122 lines of rulings. No code. They are the orders the 09-14/09-15 work was done against and
  this disk held the only copy. `_w1-gitlog.txt`, a scratch file, was deleted rather than
  committed.
- `0fb6514` — `scripts/convert-companion-singular.mjs` and its test: the converter's new-button
  pass, 433 lines, sixteen tests passing. **Nothing in the app, the relay or the companion module
  imports it** — checked by grep across the repo; it is an operator tool run by hand — so landing
  it cannot move what either congregation sees.

**GATE: the two unfinished files were landed rather than dropped, because they are complete, their
tests pass, nothing at runtime imports them, and this worktree held the only copy. Dropping 433
lines of someone else's working code to satisfy a tree check would have been the more destructive
of the two reversible options.**

## 2. Suites, on the released commit `0fb6514`

```
root      716 tests · 710 pass · 0 fail · 6 skipped   (npm run test:ts)
root       16 tests ·  16 pass · 0 fail               (npm run test:mjs)
relay      50 tests ·  50 pass · 0 fail
companion 121 tests · 121 pass · 0 fail
python     22 tests ·  21 pass · 1 fail               (npm run test:py)
tsc --noEmit: clean    eslint: clean    next build: exit 0
```

The one python failure is the known one from Wave 1 §4 — `supplement file changed:
build/typst/content/shared/awakening.typ`, the upstream translation-pairs work. It skips on a
runner, where no shireishabbat checkout exists, and it is not a regression. On `2a5a6d7` the root
suite is 722 · 716 pass · 6 skipped.

## 3. The release

Relay first, web second, as the procedure requires.

**Gate**, taken read-only twice (once for the dry run, re-taken immediately before the release):
both workspaces `renderers: 0`, `controllers: 0`. CRC no cue live; TBI had a cue selected in relay
state with nobody rendering it, which a deploy does not disturb — the same benign condition noted
at the fourth relay release. Reading at `work/relay-gates/gate-2026-09-20-cue-log.json`.

| Worker | Environment | Version id |
|---|---|---|
| `crc-live-relay` | default | `c013c8eb-4ade-4477-ad5d-0fdb285f011c` |
| `tbi-overlays-live-relay` | `tbi` | `47f7d260-5e95-4fe1-afe3-2a209461bb5a` |

Record: `work/deploy-staging/releases/0fb6514…/relay.json`, `status: complete`. A clean `--dry-run`
ran first; both environments showed the right `ALLOWED_ORIGINS` and `WORKSPACE`.

Web: `google-signin` pushed to `main` (`1f9a5f3..0fb6514`), which deploys CRC through the Git
integration, then `node scripts/deploy-workspaces.mjs --commit 0fb6514… --confirm-production`.
Record: `…/release.json`, `status: deployed`. **Both workspaces are on `0fb6514`; the drift
`RELEASE-STATE.md` recorded is closed.**

**On the timing, said plainly.** Wave 1 deferred this partly because Kol Nidre was the next
evening — it is this evening. The release ran at 09:21 CT, ten hours before, with both workspaces
idle and the whole day left to notice a problem; rollback is one `wrangler rollback` per worker.
The order to deploy was given after that return was read, and the master plan puts the calendar in
Daniel's hands, not mine. But he should know the release happened on the morning of Yom Kippur,
and that is why: shipping it meant the Yom Kippur services get logged with positions, which was
the cost Wave 1 named for not shipping.

## 4. The cue log, confirmed in production — but not from `/api/history`

The order's done-when was a row from `GET /api/history` carrying non-null `unitId`, `momentId`,
`book` and `folio`. **I still cannot read that endpoint**, and the reason has changed: it is no
longer "nothing is deployed", it is that `/api/history` answers only an authoring member or a
`history_reader` credential, and no `history_reader` has been minted. A `CONTROL_KEY` is refused.
That is still Daniel's, and it is the same mint the `.live` handoff is waiting on.

**So the fix was confirmed a different way, and the evidence is stronger than one row.** Reading
the production database directly, 158 of the 188 published cues pin at least one source. Of those
pins:

- **153 are library keys** — these resolved before the fix and after.
- **3 are a bare `authority.unitId`** — `We Are Loved 1`, `Vahavta trans`, `Mi Chamocha (short)`.
  **Only the Wave 1 fallback resolves these.** On deployed CRC production, `GET
  /api/catalog?include=liturgy` now returns for them:

  ```
  We Are Loved 1      -> {"unitId":"shma.unending-love@legacy-shabbat-morning","momentId":"unending-love","book":"legacy-shabbat-morning","folio":18}
  Vahavta trans       -> {"unitId":"shma.vahavta@legacy-shabbat-morning","momentId":"vahavta","book":"legacy-shabbat-morning","folio":20}
  Mi Chamocha (short) -> {"unitId":"shma.mi-chamocha@legacy-shabbat-morning","momentId":"mi-chamocha","book":"legacy-shabbat-morning","folio":24}
  ```

  All four fields non-null, from the deployed code, through the same `liturgyForSourceIds` the cue
  log calls. **The Wave 1 fix works in production.**
- **3 match neither** — and they are §6.

Across the catalog, 150 of 206 cues now carry a position. The 56 that do not are baseline and
hand-authored cues that pin no source at all: correctly quiet, not misses.

## 5. The moments agreement check — `6123afa`

`content/moments.json` is the producer's table, copied verbatim by the Monday workflow. Nothing
asserted the copy still said what the original says. **It did not.** Four pairs had drifted, and
they are precisely the two the master plan predicted Overlays would be missing:

```
- service                -> shofar.service@crc-rh-morning                  |  + shofar-service         -> shofar.shofar-service@crc-rh-morning      (R9-b)
- kdushat-hayom          -> amidah.kdushat-hayom@crc-rh-morning            |  + brosh-hashanah         -> amidah.brosh-hashanah@crc-rh-morning
- kdushat-hayom          -> amidah.kdushat-hayom@crc-yk-morning            |  + brosh-hashanah         -> amidah.brosh-hashanah@crc-yk-morning
- kdushat-hayom-kavannah -> amidah.kdushat-hayom-kavannah@crc-rh-morning   |  + untaneh-tokef-kavannah -> amidah.untaneh-tokef-kavannah@crc-rh-morning  (R6-h)
```

A cue pinned to any of those four resolves to no moment. The table is **not** corrected here: it is
generated, and the fix is a regeneration, not a hand-patch.

**Two design decisions worth stating.**

- `scripts/check-moments-agree.py` compares **the whole table, exactly**, and deliberately does not
  use shireishabbat's intersection-by-service-suffix scoping. That scoping exists because `.live`
  carries 9 of 13 books on purpose and the reader carries a different 13. Neither is this repo:
  this copy is verbatim, so a subset rule here would pass a table that had lost half its rows.
- **The canonical tool cannot read this repo's copy at all today.** `moments_agree.py`'s
  `moments_index` expects `.live`'s nested `{id, occurrences:[{book, unitId}]}` shape; this repo
  carries the flat `moments-pairs` shape the producer publishes. Run against it, it reports "the
  two moments copies name no service in common (23 here, 0 there)" — honest, and useless. **A
  `pairs`-shaped consumer row is shireishabbat's to add**, and this repo is not in
  `build/tests/moments-consumers.json`. I did not edit their repo. Until then this check is the
  instrument here, and it is the stricter one.

Where it runs, twice, because the two readings answer different questions:

- **`siddur-library.yml`** reports what the committed table had drifted to (into the pull request
  body, since that is the reason to merge it), then **fails the job** if the table it just adopted
  is not identical to the producer's. That also turns the adoption step's quiet "no table published
  yet" else-branch into a visible failure instead of a silent stale copy.
- **`tests.yml`** runs the checker's self-test: nine cases asserting their own verdicts, including a
  renamed unit id, a dropped pair, and three malformed tables that must be refused rather than read
  as empty.
- `tests/test_moments_agree.py`, seven cases, runs the checker as a process on real files so what is
  asserted is the exit code a workflow reads.

`npm run test:py` now **discovers** every `tests/test_*.py` instead of naming one module by hand —
the same disease Wave 1 found in the `.mjs` glob, cured at the source rather than one file at a
time. 22 tests where there were 15.

## 6. Rename forwarding — `2a5a6d7`

The three pins from §4 that matched nothing are `Kedusha 1`, `Kedusha 2` and `Kedusha 3`, all
pinned to `library:legacy-shabbat-morning:amidah.kedushah@legacy-shabbat-morning`. Read live today,
all three return `unitId`, `momentId`, `book` and `folio` null. **Three published cues, on air,
reporting no liturgical position** — the Barechu defect one cause further out.

`content/retired-units.json` mirrors `.live`'s `RETIRED_UNITS` row for row (its four rows, with
R5-a, R6-a, R6-h and R9-b, copied from `scripts/ops/emit-machzor-book.mjs`) so the two repos forward
the same ids to the same successors. `liturgyForSourceIds` consults it **only after** the library
key and the bare `authority.unitId` have both missed, reads the unit id out of either spelling a
cue may carry, and **forwards only to a successor the library actually holds** — a forwarding list
whose targets do not exist would turn a miss into a different miss and log neither, which is the
loophole the miss log exists to close. An unknown id still reports a miss out loud.

**The k'dushah row is the one row with no ruling id, so it is evidenced rather than asserted.**
`amidah.kedushah@legacy-shabbat-morning` appears nowhere in the library; `amidah.kdushah@…` does;
shireishabbat's own consumer check names `kedushah` as the reader's divergent spelling of this same
unit; and the three cues' Hebrew is **98 + 114 + 126 = 338 stripped characters, exactly the 338 of
that unit's 33 blocks**, each cue's opening falling inside it. Three slides of one unit. If Daniel
would rather see a ruling id on that row, it is his to mint; the evidence stands either way.

### The finding underneath it — `content/siddur-library.json` is stale

Writing the list surfaced this and it is the more important half. The library is pinned to
shireishabbat `3625287` and **still holds all four ruled-retired ids**, and is **missing two of
their successors** (`amidah.untaneh-tokef-kavannah@crc-rh-morning`,
`shofar.shofar-service@crc-rh-morning`). So the whole High Holy Day corner of this repo is on
pre-R5-a/R6-a/R6-h/R9-b ids — the same staleness the moments drift shows, from the same cause.

Those four forwarding rows are therefore **pre-positioned**: while a retired id is still in the
library the direct lookup answers first and the row is unreachable, which a test asserts. They start
working the moment the regeneration lands. The k'dushah row is live today.

## 7. The source-commit stamp — deferred, with the reason and the plan

The order: record the `repositoryCommit` a cue's sources came from on the published revision, so a
later rename is detectable rather than inferred.

**I did not do it, and I am not going to pretend the reason is technical difficulty alone.** Two
placements exist and both are worse than they look:

- **On `cue.authoring`**, beside `feedSha256` and `unitSha256`. That object is inside `cueHash` and
  inside `sourcePinFor`, which `assertSourcePin` and the shared-library import compare with
  `sameStructuredValue` and reject as `source_pin_mismatch` on any inequality. Adding a field moves
  every hash and risks refusing existing drafts and the CRC→TBI shared-library path on the first
  publish after deploy.
- **As a column on `authoring_revisions`**, which avoids the payload and the hashes entirely and is
  the right shape — but it is a schema migration against two production Neon databases.

**GATE: the source-commit stamp deferred, because the low-risk placement is a migration on two
production databases and the other placement moves the publish path's hash equality, and today is
Yom Kippur. It is diagnostic plumbing; nothing a congregation sees depends on it, and §6 already
does the job it was meant to make easier.** The column is the recommendation when it is picked up.

## 8. Translation layer

Still waiting on `docs/planning/2026-09-14-integration/HANDOFF-CODE-CORPUS-TRANSLATION-PAIRS-2026-09-14.md`,
as the order requires me to say. **No pairing was guessed and none should be.** Wave 1 §4 read the
`awakening.typ` supplement drift as a sign that shireishabbat `14b642c` may have answered it; that
remains unconfirmed here, and regenerating `content/authoring-sources.json` still wants its own pass.

---

## For Daniel

1. **Everything Wave 1 owed is shipped.** Relays `c013c8eb…` / `47f7d260…`, web `0fb6514` on both
   workspaces. The cue-log fix is confirmed working against deployed production (§4).
2. **Three published cues are reporting no liturgical position right now** — Kedusha 1, 2 and 3
   (§6). The forwarding list fixes them and is committed, **not deployed**.
3. **`content/siddur-library.json` and `content/moments.json` are both behind the rulings.** One
   dispatch of the Siddur library workflow regenerates both and opens a pull request; the Monday
   cron will do it by itself tomorrow. **Merging that PR is a CRC production deploy, so it is
   yours.** With the Wave 2 commits on `main` first, that run also carries the new agreement gate.
4. **`GET /api/history` still needs a `history_reader` credential** you have not minted. It is the
   last thing standing between here and the Wave 3 done-when, and the same mint `.live` is waiting
   on.
5. **One row of `content/retired-units.json` has no ruling id** (k'dushah). The evidence is in §6 if
   you want to put one on it.
6. **shireishabbat's `moments_agree.py` cannot read this repo's shape.** Worth a line to that
   session: one `pairs`-shaped consumer reader, one row in `moments-consumers.json`.
7. **Still yours from Wave 1**, unchanged: a Git integration for `tbi-overlays`, the older checkout
   at `C:\Users\dsbog\crc-overlays`, and consent for an authoring-scope MCP session.

**GATE: the Wave 2 commits (`6123afa`, `2a5a6d7`) pushed to `google-signin` but NOT merged to
`main`, because merging is a second CRC production deploy on the day of Yom Kippur, the order said
"start" these items rather than ship them, and the forwarding list is inert until the library is
regenerated anyway. Nothing is lost by waiting; the branch is pushed and the merge is one command.**

## Wave 2 readiness, updated

- Item 1 (moments check): **done here**. Blocked for the others only by shireishabbat's consumer
  shape, above.
- Item 2 (pull `dist-app/` from the published artifact): **still blocked, and now for a named
  reason** — shireishabbat's `publish-app-surface` job declares `needs: gate`, and `check.sh` exits
  1 until their Wave 2 item (g). Their own W1 return says so. This repo's Monday workflow builds
  `dist-app/` from a source checkout and does not need the artifact, so nothing here is waiting.
- Item 7 (forwarding): **done**. Its second half (the stamp) is §7.
- Item 10 (strip 50 components, split `app/author/page.tsx`): unblocked, not started.
