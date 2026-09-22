# Server-fit Chromium lifetime — return (C1-FIT-STABILITY rev 2)

Claude 1, 2026-09-22. Checkpointed for a reboot: the unit and repo checks are complete, the repeated real-browser run is not (section 4). Worktree `C:/Users/dsbog/crc-overlays-fit-stability`, branch
`codex/fit-chromium-lifetime`, from `c894465`. Owned and changed: `lib/server-fit.ts` (browser
lifecycle only), `tests/server-fit.test.ts` (one call site), `tests/server-fit-scratch.test.ts`
(new). Nothing else was edited. **Not deployed, not pushed.** Local evidence is under the ignored
`crc-overlays-vercel/work/sitting-2026-09-22/fit-stability/`.

## 1. What failed

Production, CRC, `d1ab609` deployed, 2026-09-22 19:58 UTC: one unchanged preview (Mah Tovu,
`bbd7c98b…` v1, preview `3d242037…`), twelve `fit_check_draft` calls. 1–10 passed; 11 and 12 came
back `unavailable / stage_unavailable`. The function log for both:

- `phase: 'measure'`, `reason: 'stage_error'`, `elapsedMs` 742 and 959, plan `@sparticuz/chromium pack`;
- `page.evaluate: Target page, context or browser has been closed`;
- in the attached browser log, from Chromium itself: `Less than 64MB of free space in temporary
  directory for shared memory files: 23` (check 11) and `: 15` (check 12);
- Chromium pids 460 then 494: the same warm instance.

The request log shows the twelve were strictly sequential. Each POST started after the previous
check's `measuredAt`, so this is not concurrency.

## 2. Cause

**Established: the crash is /tmp exhaustion under the measurement.**

- The pack passes `--disable-dev-shm-usage` (so does Playwright), so Chromium's shared memory is
  ordinary files in its temp directory: `/tmp`, beside the extracted pack.
- Measured on Linux with the identical pack (`@sparticuz/chromium` 153.0.0, `playwright-core`
  1.63.0, `VERCEL=1` so it takes the Vercel/AL2023 path, `HOME` unset as on Vercel): the extracted
  pack is **~215 MB of /tmp** (`/tmp/chromium` alone 204 MB). One measurement holds **20–36 MB**
  of deleted-but-open shared-memory files while it runs, released at close.
- Reproduced with /tmp as a size-limited tmpfs (a user and mount namespace, no sudo). With 30 MB free
  after the pack, check 1 died at `measure` with **the identical error**. The failure is marginal:
  checks 2–4 at 30 MB passed, having used 20 MB. With 90 MB free, 4/4 passed.

**Not established: why production's /tmp was that full.** Locally, with the committed code, nothing
accumulates per check: 12 sequential checks with `HOME=/tmp` left /tmp at its baseline, with no
profile dirs, no surviving Chromium processes and no deleted-but-open files after close. The Vercel
Functions limits page documents no /tmp size. Two explanations fit the two production readings, and
nothing available separates them:

- a per-check residue on Vercel that Linux here does not show (the numbers fit about 27 MB a check,
  the size of one measurement's shared memory); or
- a smaller /tmp than assumed, leaving a marginal budget that this sequence happened to lose.

That is why the change below is containment plus diagnostics, not a claimed root-cause fix.

**Found and fixed while reproducing: a real extraction race.** The pack's `executablePath()` returns
`/tmp/chromium` as soon as the file *exists*. When a cold check lost its 25 s deadline mid-extraction,
the extraction kept writing, and the next checks spawned the half-written binary: `spawn ETXTBSY`,
**14 checks in a row**, all `browser_unavailable`. That was on WSL, extracting from the slow `/mnt/c`
mount. Production's cold launch took about 4.7 s, so it is less likely there, but the same race exists.

## 3. The change (`lib/server-fit.ts`)

1. **A scratch directory per check.** `mkdtemp(/tmp/server-fit-…)` is made before the deadline
   race and passed to the launcher. Chromium is launched with `TMPDIR` and `HOME` pointing at it,
   so its shared memory, temp files and home-directory writes all live there. Fonts are unaffected:
   the pack's `fonts.conf` uses absolute font and cache directories.
2. **Released only after close, on every path.** Clean, fail, mid-measure crash, failed launch
   (released before returning), and a launch still in flight at the deadline (released when it lands
   and has been closed, without holding the caller).
3. **Survivors.** After close, any process whose environment carries this check's
   `TMPDIR=<scratch>` is killed and counted. On Linux this reads `/proc`; elsewhere there are none.
   The marker is unique per check, so it cannot match another check's browser or anything else. A
   survivor is exactly what would keep a check's deleted shared memory, and its space, alive.
4. **One pack extraction per instance** (`sharedExtraction`). Every check awaits the same
   extraction; a failed one is forgotten, so the next check retries it.
5. **Diagnostics.** Every `server-fit unavailable` log line now carries `tmpFreeBefore` and
   `tmpFreeNow` (bytes, from `statfs`). A `server-fit scratch residue` warning, with survivor count,
   bytes left and `tmpFreeAfter`, is logged only when a check leaves something behind.

**Unchanged:** the verdicts and their reasons (the public `ServerFitResult` contract); the
`__measureCue` readiness wait; font/artwork handling; the exact-version measurement and renderer
attestation; the 25 s deadline; the review gates. There is no retry: a crash is still reported
once, as `stage_unavailable`, and a test asserts it.

Also corrected: a `d1ab609` comment claimed `setGraphicsMode=false` saves SwiftShader extraction.
It drops the GL flags only; the pack still extracts SwiftShader (about 7 MB).

## 4. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (worktree) | clean |
| `npm test` (worktree) | 769 tests: 762 pass, 0 fail, 7 skipped (the new Linux-only test skips on Windows) |
| `npm run test:mjs` | 21/21 |
| `npm run lint` | clean |
| server-fit tests, Windows | 19: 18 pass, 1 Linux-only skip |
| server-fit tests, Linux (WSL, Node 24.14) | **19/19**, including the real `/proc` survivor test |
| `npm run build` | `✓ Compiled successfully`, 42/42 static pages |

New tests (`tests/server-fit-scratch.test.ts`): scratch handed to the launcher and released after
close; mid-measure crash is `stage_unavailable`, evaluated once, scratch released, free space
logged; survivors killed and residue logged without changing the verdict; late launch releases
only after it lands; a failed launch releases before returning; scratch creation failure launches
nothing; the real host removes what the browser wrote; the real host reports free space; the real
host finds exactly the process carrying its scratch (Linux); one shared extraction, with a failed
one retried.

**Repeated real-browser runs** (Linux, the worktree's own `measureCueOnServer` driving the real
sparticuz path; stage served locally by this worktree's `next dev`; cue Mah Tovu from `lib/cues.json`):

**Not completed.** Four runs against a local stage were started (cold /tmp, 16 checks; 90 MB free,
15 checks, fixed and original; 30 MB free, 6 checks). Daniel needed to reboot before they finished;
their output was buffered, so none was recorded, and none is claimed. The real-browser evidence that
does exist is the reproduction in section 2, run with copies of the committed lifecycle, not with this
module:

- 12/12 passing with no per-check residue;
- the crash at 30 MB free, and none at 90 MB;
- the 14-check `ETXTBSY` chain, from the worktree module before `sharedExtraction` was added.

An earlier real-module run against the public production stage was refused by the session sandbox
(`[Production Reads]`) and was not retried. To finish locally: start this worktree's `next dev -H
0.0.0.0 -p 5191`, then in WSL run `~/fitrepro/real-run.sh A-cold 16 fixed`, then
`real-run.sh C-roomy 15 fixed 300`. The scripts are in the evidence folder.

Local versus hosted: the local stage is a `next dev` build, and the local /tmp capacity is whatever
the tmpfs is set to. Neither says what Vercel's /tmp holds. The runs show the lifecycle is correct and
the crash follows free space; they cannot show that production's shortfall is gone.

## 5. Remaining production check (after this is released)

This packet authorizes no deployment. Once Claude 1's Overlays release ships it:

1. One unchanged, already-published preview; at least 15 sequential `fit_check_draft` calls.
   Nothing is published or edited.
2. Read `vercel logs -p crc-overlays --environment production --query "server-fit"`:
   - `server-fit scratch residue` lines: if any appear, their `survivors` and `leftBytes` name the
     per-check residue, and the containment is now removing it;
   - on any `unavailable`, `tmpFreeBefore` across the sequence: falling check by check means growth
     from outside the scratch directory; flat and low means /tmp is simply too small for the pack
     plus one measurement.
3. If /tmp proves too small, the next step is outside this packet: fewer bytes in /tmp (for example,
   not extracting the unused SwiftShader, about 7 MB) or a different browser host. Not a weaker check.
