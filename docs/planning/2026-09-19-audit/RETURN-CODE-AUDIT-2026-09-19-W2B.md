# RETURN-CODE-AUDIT-2026-09-19-W2B — crc-overlays

Executor: Claude Code (Opus 5), one session, 2026-09-20 late morning CT
Order: Daniel — "read the addendums and your latest return; the dist-app artifact now exists; finish what
you left owed, push and deploy per this repo's release procedure, and continue Wave 2 (Wave 3 where the
rulings release it)."
Rulings: `RULINGS-AUDIT-2026-09-19.md` including both addendums and the correction ·
Prior return: `RETURN-CODE-AUDIT-2026-09-19-W2.md`
Branch `google-signin`, `a9affa5` → `d33408c`. **Released: web to both workspaces, twice, from `96cd715`
then `4d80925`.** No relay release: `relay/` is untouched by everything in this return.

## What the last return left owed, and what it now has

| Owed | Now |
|---|---|
| The two Wave 2 commits merged to `main` and deployed | **DONE** — both workspaces on `96cd715`, §1 |
| The stale siddur library and moments table regenerated | **DONE and merged** — `4d80925`, §3. This is the paragraph to read. |
| Wave 2 item 2, pull `dist-app/` from the published artifact | **DONE** — and it turned out to be a repair, not a tidy-up, §2 |
| Wave 2 item 10a, strip the unused UI components | **DONE** — 61 files, not 50, §4 |
| Wave 2 item 10b, split `app/author/page.tsx` | **NOT DONE — deferred with a reason and a plan**, §5 |
| Wave 2 item 7b, stamp the source commit on a published cue | **STILL DEFERRED**, unchanged from W2 §7 |
| Wave 3 | **STILL GATED** — the rulings release Wave 3 in shireishabbat and the reader, not here, §6 |

---

## 1. The Wave 2 commits are live

`google-signin` → `main` (`0fb6514..96cd715`), which deploys CRC through the Git integration, then
`node scripts/deploy-workspaces.mjs --commit 96cd715… --confirm-production` for TBI. Gate taken
read-only first: CRC 0 renderers, 0 controllers, no cue; TBI 0 and 0 with a cue selected in relay state
and nobody rendering it — the same benign condition as the last two releases. Reading at
`work/relay-gates/gate-2026-09-20-wave2-web.json`.

Suites on the released commit: 722 root (716 pass, 6 skipped), 16 mjs, 50 relay, 121 companion, 22
python with the one known `awakening.typ` supplement failure, `tsc --noEmit` clean, eslint clean,
`next build` exit 0.

**Confirmed working in production, not assumed.** Before the release, `Kedusha 1`, `2` and `3` returned
`unitId`, `momentId`, `book` and `folio` all null on deployed CRC. After it, all three return
`amidah.kdushah@legacy-shabbat-morning` / `kdushah` / `legacy-shabbat-morning` / folio 31. Three
published cues that had been reporting no liturgical position on air now report one, through the
forwarding list and nothing else.

## 2. Wave 2 item 2 — and the reason it stopped being optional

The plan offered this as a choice: Overlays' workflow "may switch from building the whole repo to
fetching the artifact". It is not a choice any more.

The first dispatch of the Siddur library workflow today **failed**, and not at anything to do with this
repo. shireishabbat's `build/build-app.sh` now builds braille editions through liblouis; the runner here
does not install it; so the producer's script wrote a complete `dist-app/` and then exited 1, and the
step took the job down with it. **The Monday cron would have done the same thing by itself tomorrow, and
the only symptom would have been a regeneration that quietly stopped happening** — which is exactly how
the moments table came to be four pairs out of date in the first place.

`94bfb34` replaces the checkout-and-build with `scripts/fetch-app-surface.py`:

- It takes the newest run of the producer's build workflow on `main` **whose `publish-app-surface` job
  succeeded — not whose run succeeded.** Those differ, and the difference is the whole point: run
  35518946924 concluded `failure` because one volume's typesetting failed, while the publishing job
  inside it produced a complete 13-book surface. Waiting for a wholly green run would mean waiting on
  work that has nothing to do with the surface.
- It refuses an artifact with no `PROVENANCE.json`, a provenance naming another repository or no commit,
  an abbreviated commit, a book manifest whose feeds are not all present, and a `bookCount` that
  disagrees with the manifest. A half-published surface must not quietly become a library.
- `scripts/build-siddur-library.py` now reads `repositoryCommit` from `PROVENANCE.json` when the surface
  carries one and from git otherwise. An artifact has no repository to ask; without this the library
  would have attributed the producer's feeds to whatever commit the runner's working directory sat on.

Tests: nine self-test cases (a CI step in `tests.yml`, beside the moments one), ten python cases over run
choice and verification, two builder cases pinning the provenance commit and refusing a surface that
cannot be attributed.

**Then the artifact path failed on its first real dispatch, for a different reason:
`SHIREISHABBAT_TOKEN` can clone the source repository but cannot read its Actions** — `HTTP 403,
Resource not accessible by personal access token` on the workflow-runs API. So `f8c3ec3` and `bf48b29`
add a fallback: the fetch is attempted, a refusal falls through to a checkout and a local build, and
that build now installs liblouis (and points `PYTHONPATH` at Debian's dist-packages, because apt
installs `python3-louis` for the system interpreter and the job runs the setup-python one). The step
summary says which route ran.

**Granting `SHIREISHABBAT_TOKEN` the `Actions: read` permission retires the fallback.** That is Daniel's
and it is one checkbox on a fine-grained token.

Both routes were exercised and they agree. Fetched locally: 22.8 MB from run 35521478064, 732 sources
built at shireishabbat `425f52f`. Built on the runner: the same 732 sources, the same four added, four
removed and two changed. Two independent paths to the same library is better evidence than either alone.

## 3. The library and the moments table are regenerated, merged and live — `4d80925`

Pull request #6, regenerated from shireishabbat `425f52f`:

```
Sources: 732 -> 732
Added:   amidah.brosh-hashanah@crc-rh-morning, amidah.brosh-hashanah@crc-yk-morning,
         amidah.untaneh-tokef-kavannah@crc-rh-morning, shofar.shofar-service@crc-rh-morning
Removed: amidah.kdushat-hayom@crc-rh-morning, amidah.kdushat-hayom@crc-yk-morning,
         amidah.kdushat-hayom-kavannah@crc-rh-morning, shofar.service@crc-rh-morning
Changed: amidah.untaneh-tokef@crc-rh-morning, amidah.untaneh-tokef@crc-yk-morning
```

The new agreement gate ran inside that job and passed, so `content/moments.json` now matches the
producer's table exactly. The four drifted pairs are gone.

**The part that needed checking before merging, and was checked.** That regeneration *removes* four unit
ids, and **five published cues are pinned to two of them** — `Unetane (Eng) 1`, `Unetane (Eng) 2`,
`Unetane Tokef`, `Unetane Tokef 2` (all `amidah.kdushat-hayom@crc-yk-morning`) and `Shofar Blessing`
(`shofar.service@crc-rh-morning`). Before the merge all five resolved; a careless merge would have
turned five working cues into five silent misses on Yom Kippur morning. They do not, because the
forwarding list shipped first and was pre-positioned for exactly this. Verified three ways:

1. Locally against the pull request's own content, before merging: all five forward, and a genuinely
   unknown id still logs a miss and returns nulls.
2. The suite on the pull request branch: 724 tests, 718 pass, 6 skipped. The retirement invariant test
   written in Wave 2 now runs its strict branch for the first time — the retired ids really are out of
   the library, so every successor really must be in it, and they are.
3. On deployed CRC production after the release:

   ```
   Unetane (Eng) 1  -> amidah.untaneh-tokef@crc-yk-morning / untaneh-tokef / crc-yk-morning / 23
   Unetane (Eng) 2  -> amidah.untaneh-tokef@crc-yk-morning / untaneh-tokef / crc-yk-morning / 23
   Unetane Tokef    -> amidah.untaneh-tokef@crc-yk-morning / untaneh-tokef / crc-yk-morning / 23
   Unetane Tokef 2  -> amidah.untaneh-tokef@crc-yk-morning / untaneh-tokef / crc-yk-morning / 23
   Shofar Blessing  -> shofar.shofar-service@crc-rh-morning / shofar-service / crc-rh-morning / 54
   Kedusha 1, 2, 3  -> amidah.kdushah@legacy-shabbat-morning / kdushah / legacy-shabbat-morning / 31
   ```

   153 of 206 cues carry a position, the same count as before the merge. Nothing regressed; four of the
   five now carry the *correct* unit name (Un'taneh Tokef, not K'dushat HaYom) hours before the service
   that prays it.

TBI released from the same commit; both workspaces are on `4d80925`.

## 4. Wave 2 item 10a — the unused UI components, and a correction to the count

The audit said 50 of 61 files under `components/ui/` are unused, 11 used. **All 61 are unused.** The
other 11 are imported by other files *inside* `components/ui`; `@/components/ui` does not appear in
`app/`, `lib/` or `hooks/` at all. The kit was vendored from shadcn and never wired up.

`d33408c` removes all 61, plus three files that exist only to serve them — `hooks/use-mobile.ts`
(imported by `sidebar.tsx` alone), `lib/utils.ts` (the `cn` helper, imported by nothing outside the
kit) and `components.json`, whose three path aliases would otherwise all point at deleted directories —
and the eslint override that exempted them. `npx shadcn init` writes all four back if the kit is ever
wanted.

Eighteen dependencies were reachable only from those files and are gone: `@base-ui/react`,
`@hookform/resolvers`, `@shadcn/react`, `class-variance-authority`, `clsx`, `cmdk`, `date-fns`,
`embla-carousel-react`, `input-otp`, `next-themes`, `radix-ui`, `react-day-picker`, `react-hook-form`,
`react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `vaul`. `lucide-react` stays — ten app
files import it — and so does `react-dom`, which is Next's runtime whether or not source names it.

**The two `npm ci` timings the order asked for, reported as they came out rather than as they were
expected to.** Installing the two lockfiles side by side in scratch directories, each warmed once and
then timed:

```
before   384 packages   1m09.7s   695 MB on disk
after    328 packages   1m26.8s   605 MB on disk
```

The stripped tree installed **slower**. Two runs of the identical stripped tree earlier in the session
differed by 3m35s against 46s. `npm ci` wall time on this machine is filesystem noise, not package
count, and **these numbers do not support a speed claim in either direction** — including the one the
order half-expected. The honest figures are 384 → 328 packages, 3,178 deleted lockfile lines, and **90 MB less `node_modules`** — the one size that did move, measured over the same two scratch trees the timings used. The
bundle does not move either, and should not: dead code nothing imports was never in it. What this buys
is a smaller dependency surface to audit and update, which is worth having on its own terms.

`tsc` clean, eslint clean, 718 root tests pass with 6 skipped, 16 mjs pass, `next build` exit 0.

## 5. Wave 2 item 10b — `app/author/page.tsx`, deferred

`app/author/page.tsx` is 1,265 lines and it is the only file in `app/author/` over 500 (the next is
`editor-state.ts` at 333). Of those 1,265, **975 are one component**: `AuthorPage` declares 60-odd
`useState` hooks, a dozen `useRef`s and about thirty callbacks in a single closure, and the seventeen
presentational components after it account for only 189 lines. Getting the file under 500 means lifting
roughly 800 lines out of that closure into hooks — a real refactor of the editor's state, not a file
move.

**GATE: the split deferred, because it is 800 lines of closure surgery on the one page Daniel and
Michael author from, the service it is used for is tonight and tomorrow, and the order's own done-when
offers a single fit-stage measurement as the check — which exercises the preview path and says nothing
about undo/redo, recovery copies, draft sets, the shared shelf or source review. A partial split that
did not reach 500 lines would spend the churn and the merge conflicts without earning the done-when.**

The plan, so the next session does not re-derive it. Extract, in this order, each as a hook that owns
its own state and exposes a small surface:

1. `useSourceSearch` — `sourceQuery`, `sourceResults`, `sourceTruncated`, `sourceFacets`, `source`,
   `bookFilter`, `serviceFilter`, `activeGroup`, `browseSources`, `loadSource`, `showDraftSource`. The
   most self-contained block in the file.
2. `useSharedLibrary` — `sharedLibrary`, `sharedSelectedId`, `sharedPreview`, `refreshSharedLibrary` and
   the preview effect.
3. `useWorkspaceAssets` — `assets`, `assetError`, `showArchivedAssets`, `refreshAssets`.
4. `useFitReview` — `exactPreview`, `fitErrors`, `fitWarnings`, `previewWarnings`, `assetsReady`,
   `resetReview`, and `showCue`.
5. `useToasts` — `message`, `error`, `fail`, and the two effects that clear them.
6. The seventeen presentational components at the tail into `app/author/panels.tsx`, last, because it is
   the only mechanical step and it is worth nothing on its own.

Verification the next session should use, beyond the suite: `fit_check_draft` on one saved draft through
the authoring API, before and after, comparing the whole `StageMeasurement` (`fitErrors`, `warnings`,
`fill`, `artwork`) — and a manual pass over undo/redo, a recovery copy and a draft set, because no
automated check covers those.

## 6. Wave 3, and what the rulings did and did not release

R-0919-audit-18 releases Wave 3 **in shireishabbat and the reader**. It does not release Overlays' Wave 3,
which the master plan gates on something else entirely: Daniel and Michael's rehearsal producing one real
logged service, and a `history_reader` credential to read `GET /api/history` with. Neither exists yet.
Nothing here is waiting on a decision; it is waiting on a service and a credential.

## 7. Two notes for the other repos

- **shireishabbat.** Its canonical `moments_agree.py` still cannot read this repo's copy: `moments_index`
  expects `.live`'s nested `{id, occurrences}` shape and Overlays carries the flat `moments-pairs` shape
  the producer itself publishes. A `pairs`-shaped consumer reader plus a row in
  `build/tests/moments-consumers.json` closes it. Addendum 1 calls this a seam item for whichever repo
  picks it up first and says the source repo's checker is canonical — which is why it was not fixed from
  this side.
- **shireishabbat, second.** Its build workflow's `publish-app-surface` job is now load-bearing for this
  repo. If it stops publishing a `dist-app` artifact, or if the artifacts age out faster than 90 days,
  the regeneration here falls back to a full build.

## 8. Git housekeeping from addendum 2

- **TBI Git integration: not done, and correctly so.** The correction Daniel committed at 16:06 UTC
  withdrew the recommendation — TBI deploys from a staged, allowlisted source tree that
  `scripts/deploy-workspaces.mjs` builds, so a plain Git integration would deploy the wrong tree. The CLI
  release and the two-sha record in `RELEASE-STATE.md` stay, and `RELEASE-STATE.md` now says so.
  The correction landed while this session was working; nothing had been built against the withdrawn
  version.
- **Making the staging a Vercel build step** is offered in that correction as something this session may
  propose. It is worth doing and it is not worth doing today: it changes the release path for a
  congregation the evening before Kol Nidre, with no way to test the new path except by using it.
- **`C:\Users\dsbog\crc-overlays` kept**, untouched, as the git database this worktree runs on.

---

## For Daniel

1. **Both congregations are on `4d80925` and the library is current.** The five High Holy Day cues that
   the regeneration's retired ids would have broken — four Un'taneh Tokef, one Shofar Blessing — were
   checked on deployed production after the release and all five carry a position, now under the correct
   unit name. The three Kedusha cues are fixed too. §1, §3.
2. **One checkbox is yours:** grant `SHIREISHABBAT_TOKEN` the `Actions: read` permission. Until then the
   Monday regeneration clones and builds the whole source repository instead of taking the artifact,
   which works but adopts every dependency the producer adds — that is what broke it this morning. §2.
3. **`d33408c` is on `google-signin` and deliberately not on `main`.** **GATE: the UI strip pushed but
   not merged, because it removes eighteen dependencies from the production build for no user-visible
   benefit, and the next two evenings are Kol Nidre and Yom Kippur. It is one `git push origin
   google-signin:main` on Monday, and `main` is otherwise identical to the branch.**
4. **`GET /api/history` still needs a `history_reader` credential.** Unchanged, and still the last thing
   between here and the Wave 3 done-when.
5. **The rehearsal with Michael** is the other half of Wave 3 and is yours.
6. **`app/author/page.tsx` is still 1,265 lines**, with the plan for splitting it in §5 and the reason it
   was not split today.
