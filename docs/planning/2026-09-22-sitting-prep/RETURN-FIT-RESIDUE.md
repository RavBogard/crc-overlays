# Return: C1-FIT-RESIDUE (server-fit /tmp residue outside scratch)

Worktree `C:/Users/dsbog/crc-overlays-fit-residue`, branch `codex/fit-residue`, from `386daf3`
(production is `9ab8f7b`; `386daf3` adds documentation only). Owned: `lib/server-fit.ts`,
`tests/server-fit-scratch.test.ts`, this file. Not deployed, and no hosted fit calls were made.

## 1. What production showed (logs only, nothing re-run)

In my 16-check series on `9ab8f7b`, and in root's three calls afterwards:

- Every check logged `survivors: 0` and 66,011 bytes left in its scratch directory.
- Free `/tmp` still fell, in chunks, with nothing freeing it:
  - Instance A: 318 → 318 → 217 → 92 → 37 → 21 MB, then two `stage_unavailable`.
  - Instance B: 185 (five times) → 60 → 41 → 41 MB.
- Root's first call 15 minutes later read exactly the 41,365,504 bytes free that instance B last
  logged. Its next check read 20.8 MB, and the one after that crashed at `measure`.

So the loss belongs to the instance and is permanent. The "recovery" from 17 to 185 MB was a
different instance, not space coming back.

The losing checks each took 31–59% of the free space they started with. The crash log shows
Playwright's own profile path: `--user-data-dir=/tmp/playwright_chromiumdev_profile-aTkYmm`,
outside the scratch directory.

## 2. What was wrong in the code (established)

1. **The browser profile lived outside scratch.** Playwright creates
   `/tmp/playwright_chromiumdev_profile-*` from the Node process's `os.tmpdir()`, because
   `chromium.launch` was given no profile. Chromium keeps its disk caches there. Nothing of ours
   measured or removed that dir; only Playwright's own close could.
   - Local measurement: 36–44 MB of `/tmp` in use at peak during each check, all in the profile
     and artifacts dirs.
2. **The survivor scan could never see Chromium.** It looked for `TMPDIR=<scratch>` in
   `/proc/<pid>/environ`. Chromium rewrites its process title over the memory its environment was
   in, so its environ no longer holds that TMPDIR. Reproduced on Linux: the scan found none of a
   check's processes even while the browser was open.
   - So production's `survivors: 0` said nothing about Chromium either way.
   - On top of that, it ran only after close, and a process that is crashing reads as empty anyway.
3. **Close errors were swallowed.** `browser.close()` failures were caught and discarded.

## 3. The correction (commit on `codex/fit-residue`)

- **The profile is an explicit dir inside the check's scratch:** `stageProfile(scratch)` =
  `<scratch>/profile`.
  - It uses the supported `chromium.launchPersistentContext(profile, options)`, and
    `process.env` is never changed, so concurrent requests are unaffected.
  - The profile goes when the scratch dir goes, and its bytes are counted as it is removed
    (`scratchBytes`).
  - The pack options are unchanged: the environment is still read after the pack loads, and
    extraction is still shared through `sharedExtraction`.
- **Owned processes are recorded while the browser is whole,** immediately after launch.
  - Each one is identified by pid plus kernel start time, found by `--user-data-dir=<scratch>/profile`
    on its command line (or, for other processes, its TMPDIR).
  - After close, the host checks those processes through `/proc/<pid>/stat`, which stays readable
    while a process is crashing, and runs a fresh scan for any started later.
  - A survivor is killed only after its start time is re-checked, so a recycled pid is never
    killed.
  - The release then waits for survivors to be gone, capped at `SERVER_FIT_LINGER_MS` = 2 s, and
    reports `heldBytes`: the deleted-but-open bytes they held.
- **Every release logs one `server-fit released` line:**
  `{owned, survivors, heldBytes, stillAlive, waitedMs, scratchBytes, tmpFreeBefore, tmpFreeAfter}`.
  - `server-fit scratch residue` is now a warning only for abnormal cases: survivors, anything
    still alive, or a close, scan or remove error.
  - Scratch bytes alone no longer warn, because the profile is expected to be there.
- **Behavior that is unchanged:** verdicts, readiness, exact measurement, deadline accounting
  (the release runs after the verdict, as before), and honest `unavailable`. Nothing retries.

## 4. Verification

- **Gates on the worktree:** `tsc` clean; `npm test` 790 tests (781 pass, 0 fail, 9 skipped:
  Linux-only tests on Windows) plus MJS 24/24; lint clean; build 42/42.
- **Server-fit tests:**
  - Linux (WSL): 29/29.
  - The real-`/proc` tests cover:
    - start-time identity;
    - refusing to kill a recycled pid;
    - `held` counting an unlinked file still open;
    - finding a process by the profile on a rewritten title, and not by a look-alike path.
  - Unit tests cover:
    - a survivor the post-close scan cannot see;
    - a survivor that won't die, reported after a bounded wait with the verdict unchanged;
    - a close error being logged;
    - the explicit profile, with the env still read after the pack loads.
- **Real browser, locally** (WSL, this worktree's `next start` stage, same cue). Evidence is in
  `crc-overlays-vercel/work/sitting-2026-09-22/fit-residue/`, which is ignored.

| run | code | /tmp | result | profile in /tmp during check | left after | per-check accounting |
|---|---|---|---|---|---|---|
| OLD | 99d1eac (= production) | tmpfs, 90 MB free | 8/8 pass, fill 0.82286 | yes, profile + artifacts | none | none; several closes took 27–34 s |
| NEW2 | this commit | tmpfs, 90 MB free | 8/8 pass, fill 0.82286 | artifacts dir only (empty) | none | owned 1, survivors 0, scratchBytes ≈ 5.0 MB, free unchanged |
| NEW-starved | this commit | tmpfs, ~20 MB free | 6/6 honest `stage_unavailable` (the production crash) | artifacts only | none | owned 1, survivors 0; free held at 20.1 MB, no drain |
| NEW-cold16 | this commit | ordinary | 16/16 pass, fill 0.82286 | artifacts only | none | owned 1, survivors 0; about 0.8 s per check |

- **Closes got faster.** With a persistent context, closing took well under a second locally,
  where the old code sometimes took 27–34 s (Chromium crashing on shutdown, with WSL catching the
  crash). This is a local observation only.

## 5. Not established, and what production will tell us

- **The exact path of the production loss is still not proven.** I could not reproduce it locally:
  the old code's profile dirs were removed after every local check. The correction removes the one
  path outside scratch that production's own log shows, and fixes the scan that made survivors
  invisible. After the next deploy, the `server-fit released` line on each check says whether the
  loss is gone or which of these explains what remains:
  - `scratchBytes`: the profile's size;
  - `survivors` / `heldBytes`: processes outliving close and the space they held;
  - `tmpFreeBefore` / `tmpFreeAfter`: whether free space still falls.
- **Still outside scratch:** Playwright's `playwright-artifacts-*` dir (empty for this stage;
  downloads, video and traces are not used). Its location is an internal option, not a public
  one, so I did not use it.
- **Considered and not taken:**
  - Isolating each check in a child process. It would need its own traced entrypoint on Vercel and
    adds startup time; explicit per-launch dirs were enough.
  - Changing `TMPDIR` for the whole process. It would race concurrent requests.
- **Remaining production check after release** (needs its own authorization): a bounded series on
  an unchanged preview, then read the `server-fit released` lines. Acceptance: free `/tmp` does not
  fall across checks, `survivors` is 0, and there is no `stage_unavailable` with plenty of free space.
