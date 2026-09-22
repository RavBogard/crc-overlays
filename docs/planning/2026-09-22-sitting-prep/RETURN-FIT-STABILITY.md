# Server-fit Chromium lifetime — return (C1-FIT-STABILITY rev 2)

Claude 1, 2026-09-22. Revision 3 (after reboot): the repeated real-browser runs are complete, and they found a cold-start bug in `b06b0b9`, fixed in the follow-up commit (section 3a). Worktree `C:/Users/dsbog/crc-overlays-fit-stability`, branch
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

## 3a. Follow-up fix, found by the real-browser run (revision 3)

`b06b0b9` built the browser's environment (`{...process.env,TMPDIR,HOME}`) *before* importing
`@sparticuz/chromium`. Importing the pack on Vercel is what adds `/tmp/al2023/lib` to
`LD_LIBRARY_PATH`, and extraction can set `FONTCONFIG_PATH`. So on a cold instance the first check
launched without its libraries: `/tmp/chromium: error while loading shared libraries: libnspr4.so`,
`browser_unavailable`. Every later check worked because the import had already happened. In
production that would fail the first check on every cold instance.

Fix: `packLaunchOptions()` reads the environment only after the pack has loaded and extracted. A
unit test pins the order (the fake pack writes both variables while loading; the launch env must
carry them plus the scratch `TMPDIR`/`HOME`). Non-pack launches are unchanged.

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

Stage: this worktree's production build (`next build` then `next start -H 0.0.0.0 -p 5191`),
reached from WSL at the Windows host address. (`next dev` could not be used: Next 16 blocks
cross-origin dev resources from the WSL address, so `__measureCue` never appeared and every check
hit `deadline_exceeded` at `stage_ready`. That run, `real-A-cold.txt`, is not evidence about the fix.)

| Run (evidence file) | Module | /tmp | Result |
|---|---|---|---|
| `real-A-cold.txt` | `b06b0b9` | cold (pack wiped) | check 1 `browser_unavailable`: `libnspr4.so` missing (section 3a) |
| `real-A-cold-v2.txt` | follow-up | cold (pack wiped) | **16/16 pass**, check 1 included; 0 leftover dirs, 0 surviving Chromium, free space flat |
| `real-C-roomy.txt` | follow-up | tmpfs, 90 MB free after pack | **15/15 pass**, free space 90 MB after every check |
| `real-D-tight.txt` | follow-up | tmpfs, 35 MB free | 6/6 pass |
| `real-E-starved.txt` | follow-up | tmpfs, 20 MB free | 0/4 pass: three `stage_unavailable` (the production error at `measure`, Chromium's "Less than 64MB" warning, `tmpFreeBefore`/`tmpFreeNow` logged) and one `fail` (below) |
| `real-F-starved.txt` | follow-up | tmpfs, 20 MB free | 0/10 pass: one `deadline_exceeded`, nine `stage_unavailable`; no false verdicts |
| `real-G-orig.txt` | `d1ab609` (pre-fix) | ordinary | 12/12 pass; baseline for the close timings |

In every run, nothing was left in /tmp between checks, free space did not fall, and no Chromium
outlived its check. When space ran short, the crash was reported honestly as `unavailable`, never
as a pass, and it wasn't retried.

**Finding for Astra (outside this packet's files): a starved stage can return `fail`.** In
`real-E-starved.txt` check 3 returned `verdict: fail`, `fill: null` in 733 ms. That shape is the
stage's own fallback at `app/author/fit-stage/fit-stage-client.tsx:36` ("The graphic did not
render."). With /tmp exhausted the renderer drew nothing, and the stage reported that as a fit
error. An author would be told the cue doesn't fit when it was never measured. It happened once in
14 starved checks. It never happened with room. The stage client is not mine to edit. A possible
direction: have the stage report "did not render" as a distinct reason, so the server can map it
to `unavailable`.

**Slow closes are local (WSL), not a lifecycle bug.** On both the pre-fix and fixed modules, about
one close in three takes 11–27 s, and the check waits for it. The Playwright trace
(`pw-debug.txt`) shows Chromium crashing on shutdown (`signal=SIGTRAP`) after the verdict. WSL
then pipes the crash to `/wsl-capture-crash` (`core_pattern`, which ignores `ulimit -c 0`), and
that takes ~18 s. Playwright's own cleanup takes 4 ms. The same cause explains a
`deadline_exceeded` check returning at ~36 s. I tried a bounded close (3 s grace, then kill by
scratch marker) and reverted it: a process in core dump can't be found through `/proc/*/environ`,
so the bound returned while the crashing Chromium still held ~30 MB of shared memory, and space
stacked up check by check. That is the failure this packet exists to prevent. Whether Chromium
also crashes on shutdown on Vercel is unknown. There it would be quick, with no WSL crash
capture.

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
   - the first check on a fresh instance must not be `browser_unavailable` (section 3a);
   - on any `unavailable`, `tmpFreeBefore` across the sequence: falling check by check means growth
     from outside the scratch directory; flat and low means /tmp is simply too small for the pack
     plus one measurement.
3. If /tmp proves too small, the next step is outside this packet: fewer bytes in /tmp (for example,
   not extracting the unused SwiftShader, about 7 MB) or a different browser host. Not a weaker check.
