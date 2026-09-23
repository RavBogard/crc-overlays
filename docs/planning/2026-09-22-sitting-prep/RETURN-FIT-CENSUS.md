# Return: C1 post-release residual storage diagnosis (608f495)

Worktree `C:/Users/dsbog/crc-overlays-fit-census`, branch `codex/fit-census`, from reviewed `608f495`.
Owned: `lib/server-fit.ts`, `tests/server-fit-scratch.test.ts`, this file. Not deployed. No hosted
fits, no /tmp deletion, no TMPDIR change.

## 1. What the existing evidence establishes

Source: root's 16-check series on 608f495, from `work/sitting-2026-09-22/fit-residue-integration/production-logs.jsonl`.

| check(s) | free before → after | lost | explained by |
|---|---|---|---|
| 1 | 538,333,184 → 317,767,680 | 220,565,504 | **The pack's cold extraction, exactly.** Uncompressed: chromium 209,022,176 + swiftshader 7,485,440 + al2023 3,532,800 + fonts 460,800 = 220,501,216, plus directory blocks. Nothing else was lost on this check. |
| 2 | 538,333,184 → 195,379,200 | 342,953,984 | Extraction (220,565,504) plus **122,388,480 unexplained** |
| 3 | 195,379,200 → 195,379,200 | 0 | |
| 4 | 195,379,200 → 73,695,232 | **121,683,968** | unexplained |
| 5 | 73,695,232 → 41,811,968 | **31,883,264** | unexplained |
| 6–8 | 41,811,968, flat | 0 | |
| 9 | 41,811,968 → 37,511,168 | **4,300,800** | unexplained |
| 10–16 | 37,511,168, flat | 0 | |

- **Instances.** Checks 1 and 2 both started at 538,333,184, so they ran on two fresh instances.
  From check 3 on, every "before" equals the previous "after" to the byte. That is strong evidence
  of one instance, but ordering alone is not proof. The logs carry no instance marker.
- **The loss happens inside checks, not between them.** No check's "before" differs from the
  previous "after", including across idle gaps of 31 s and 27 s.
- **Ruled out by the logs:**
  - A surviving Chromium. `owned 1, survivors 0, heldBytes 0` on all 16 checks, and since 608f495
    the owned pid is tracked reliably.
  - The profile. It is about 5.17 MB, constant, counted, and removed with scratch.
  - Repeated extraction. The pack is extracted once per instance and never grows again.
- **Pattern.** The unexplained drops take a share of what was free: 38%, 62%, 43% and 10%. Loss
  stops once about 37.5 MB is left, and every check still passes. That looks like something that
  sizes itself to free space, not a fixed leak per check. But it is a pattern, not a cause.
- **What the logs cannot tell apart,** because they record only statfs before and after:
  1. Files outside scratch other than the profile: Playwright's artifacts dir, fontconfig's
     `/tmp/fonts-cache`, or anything else in /tmp.
  2. Deleted files still open, or kept alive only by a memory mapping, in this Node process or
     another. The survivor check looked only at Chromium pids, and never at mappings.
  3. Space used outside the visible /tmp tree, on the same filesystem.

So the existing evidence does not identify the cause. Minimal instrumentation is warranted.

## 2. The instrumentation (a diagnostic change only)

Each `server-fit released` line gains `census:{before,after}` (the type is `TmpCensus`):
- **`before`** is taken before the check makes anything, outside the deadline clock.
- **`after`** is taken once the scratch dir is removed.

Each census records:
- **`instance`:**
  - `id`: random, chosen when the module loads;
  - `boot`: an 8-hex sha256 of the kernel boot id, which identifies the machine;
  - `pid`;
  - `uptimeS`;
  - `check`: a count of this module's censuses.

  Two lines are compared only when these match.
- **`free` and `used`:** from statfs.
- **`files`:** bytes allocated on disk, by top-level category:
  - `pack`: the extracted names;
  - `scratch`: `server-fit-*`;
  - `playwright`: `playwright*`;
  - `other`.
- **`held`:** deleted files under /tmp that are still held:
  - `self` and `others`: held open by a descriptor;
  - `mapped`: kept alive only by a mapping, counted as the mapped extent, an upper bound;
  - `processes`: how many processes hold any.

  Each inode counts once.
- **`unattributed`:** `used - files - held`. It is constant metadata on a filesystem of its own. A
  growing figure means space went somewhere this process cannot see.
- **`largestOther`:** the three largest `other` entries, as masked name shapes with byte counts,
  for example `core.#~65536`.
- **`truncated`** and **`ms`.**

Bounds and safety:
- Read-only: lstat, readdir, statfs and `/proc/<pid>/{fd,maps}`. It never follows a symlink.
- It records names, sizes and counts only: no file contents, no environment, no credentials.
- Capped at 20,000 entries, and at `CENSUS_BUDGET_MS` = 250 ms. A census that runs over or fails is
  logged as `census_timeout` or as the error, and never changes a verdict.
- It is concurrent-safe because it only reads.
- The real host takes a census only on Vercel (`VERCEL=1`). Walking a large developer or CI temp
  dir added up to 1 s in tests.

**How to read the next series:**

| Loss shows up in | Meaning |
|---|---|
| `files.other` (with `largestOther`) or `files.playwright` | A file outside scratch |
| `held.self` or `held.mapped` | This process keeps deleted space alive |
| `held.others` | Another process keeps deleted space alive |
| `unattributed` | Outside the /tmp tree |
| `files.pack` | A repeated extraction |

## 3. Verification

- **Gates:**
  - `tsc` clean; lint clean; build 42/42, run with no server up.
  - `npm test`: 797 tests, 786 pass, 0 fail, 11 skipped (Linux-only tests on Windows); MJS 24/24.
- **Server-fit tests on Linux (WSL):** 34/34, both with `VERCEL` unset and with `VERCEL=1`.
  - The deadline test still returns promptly with the census on.
- **New tests:**
  - Census order and outside-deadline timing.
  - A census that fails is logged, and the verdict stands.
  - Categories, masked name shapes, and the entry cap.
  - Linux: an unlinked file that is still open counts as `held.self`, not as a file.
  - Linux: a libc-mmapped deleted file with no descriptor counts as `held.mapped`, exactly 1 MiB.
- **Real browser, locally.** This is WSL with tmpfs /tmp, the pack pre-extracted, and this
  worktree's stage. Evidence is in `crc-overlays-vercel/work/sitting-2026-09-22/fit-census/`, which
  is ignored.

  | Run | Free /tmp | Result | Census |
  |---|---|---|---|
  | `real-CENSUS-warm400` | ~190 MB | 16/16 pass, fill 0.82286 | Flat free space; pack 210.3 MiB (= 220.5 MB); held 0/0/0; unattributed 0; 12–27 ms each |
  | `real-CENSUS-starved` | ~35 MB | 6/6 pass | Flat; all attributed |
  | `real-CENSUS-final` (final code) | ~190 MB | 8/8 pass | Flat; 11–19 ms each |

  - A cold local run could not be done. Under the user-namespace harness, the pack's tar
    extraction fails with `EINVAL chown /tmp/fonts`. This is an artifact of the harness, and the
    log is in `cold-probe-harness-chown.err`. The cold cost comes from the production arithmetic
    above instead.
  - The production loss again did not reproduce locally. That is why the instrumentation is
    aimed at production.

## 4. Not established, and a note on scope

- **The cause of the roughly 280 MB of unexplained loss per instance** (122 + 122 + 32 + 4 MB) is
  still unknown. The census is built to name it on the next authorized series.
- **Observed and not acted on.** If a cold extraction fails partway, it leaves a partial
  `/tmp/chromium`. The pack's `existsSync` short-circuit then trusts that file, and the next launch
  fails with `ETXTBSY`. This was seen locally only, and only through the harness artifact above.
  Production's cold checks succeeded. It is outside this packet.
- **Next step, which needs root's review and authorization:** release this diagnostic, then run a
  bounded series on an unchanged preview and read `census.before` and `census.after` for each
  check, grouped by `instance`.
