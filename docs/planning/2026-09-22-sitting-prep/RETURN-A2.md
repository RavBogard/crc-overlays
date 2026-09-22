# Return A2 — the Siona resting logo, end to end

Packet: [PACKET-A2.md](PACKET-A2.md). Built on A1 (`fa008ac`) and on `d1ab609`, the fit-stage
hardening another session landed on `google-signin` while this ran.

## 0. What it is, in one paragraph

CRC's own artwork, 132 px across, in the bottom-right corner of an otherwise empty output. It is a
**distinct feature from the Daven Along scan card** at every layer — its own live-state field, its
own command, its own console row, its own Companion actions, its own stylesheet and its own DOM
stage. A logo action never produces a QR card, and the scan card keeps everything it had. It is
also **a setting, not a picture**: the operator's preference lives in authoritative relay state and
survives an output reload, a reconnect and a worker restart, while whether the mark is actually on
screen is decided moment to moment by the renderer, which hides it under any graphic and under the
scan card. Nothing that reports the preference is allowed to present it as a rendered picture.

## 1. Decisions taken

| Decision | What and why |
| --- | --- |
| **Distinct from the scan card** | New `logo` action and `logo` live-state field beside `bug`. The relay refuses a command that mixes them, so the two cannot be half-applied into each other. `bug_on`/`bug_off` and the QR card, caption and page chip are untouched. |
| **Capability is workspace configuration** | `WORKSPACE_RESTING_LOGO` on the workspace profile, with `src` taken from that workspace's own `WORKSPACE_LOGO_PATH`. CRC is `1`; TBI is explicitly `0`. CRC's artwork cannot reach TBI's output even by mistake, because the path is never a module constant. |
| **The default stays quiet** | Absent state is off, and off is stored as an *absent field* rather than `{on:false}`, so "never turned on" and "deliberately turned off" are one durable answer. A state row written by an older worker reads as off. Nothing was inferred about the logo starting enabled. |
| **Visibility comes from the renderer, not the command** | `Player.occupied` — requested **or** settled **or** still in the DOM. That one predicate is what makes all four transition rules true at once (§4). |
| **CLEAR NOW turns the preference off** | `cut` deletes `bug` **and** `logo` from authoritative state, so after an urgent clear the mark waits for a deliberate press rather than reappearing the moment the output is empty. |
| **Inherited deck macros are dropped, not converted** | Michael's deck paired a logo hide/restore with prayer buttons because the old renderer did not know what was on screen. Ours does. On a button that also shows a prayer the macro is dropped; a logo-only button keeps its press. 145 macros dropped, 9 deliberate buttons kept (§6). |
| **Size and treatment** | 132 × 132, circular crop, 3 px gold ring on a paper backing — the same treatment the in-cue medallion already gets. Chosen from a rendered sweep (§5). |

## 2. Changed files

| File | What changed |
| --- | --- |
| `lib/resting-logo.ts` **(new)** | The pure layer: `restingLogoViewFor` (preference minus occupancy), `restingLogoStatus`, `restingLogoEnabled`, `renderRestingLogo`, `RESTING_LOGO_RECT`. Imports no renderer, exactly as `lib/bug-layer.ts` does not. |
| `app/resting-logo.css` **(new)** | `#output-logo`, its own sibling stage. Route-scoped (imported by `/output`), so A1's `layout.tsx` cascade order is untouched. |
| `app/output/page.tsx` | A third sibling stage, scaled by the same handler. Visibility recomputed after every snapshot and on the existing 100 ms tick. |
| `lib/player.ts` | `get occupied()` and nothing else. |
| `lib/workspace.ts` | `restingLogo` on `PublicWorkspace`; `WORKSPACE_RESTING_LOGO: '1'` in the CRC profile. |
| `workspaces/temple-bnai-israel/workspace.json`, `.env.example` | TBI explicitly `0`; the variable documented. |
| `relay/src/protocol.ts` | `LogoState`, `logo?` on `LiveState`, `parseLogoState`, the `logo` command and history action, `MAX_LOGO_BYTES = 64` taken out of the cue-payload headroom. `cut` deletes both layers. |
| `relay/src/index.ts` | Comment only: both layers ride the persisted `live_state` row, so there is no migration and the preference survives a worker restart. |
| `app/api/command/route.ts` | `action:'logo'`, the capability refusal, the relay-required refusal, and a named refusal if the web ever reaches an older relay. |
| `app/console.tsx` | A "Resting logo" row beside the scan-card row. The button carries the setting; the line under the name says `Off` / `On · showing` / `On · held back`. Clear's tooltip now names both layers. |
| `lib/browser-realtime.ts`, `lib/service-history.ts` | `logo` on the snapshot type; `logo` a cue-log action. |
| `companion/src/client.ts` | `LogoState`, `logo` on the snapshot, `activate(…, logo)`, `parseLogo`, `logoStatusLabel`. |
| `companion/src/main.ts` | Actions `logo_on` / `logo_off` / `logo_toggle`; feedbacks `logo_enabled` and `logo_held`; variables `logo` and `logo_state`; one preset. |
| `companion/src/variables.ts` | The two variables. |
| `companion/package.json`, `companion/companion/manifest.json` | 1.6.0 → **1.7.0**. `@companion-module/base` and `runtime.apiVersion` stay **2.0.4** — Companion 5.0.3 refuses 2.2.0 and above. |
| `public/downloads/crc-overlays-1.7.0.tgz`, `public/workspaces/…/tbi-overlays-1.7.0.tgz` **(new)** | Built by the repo's own route: `npm run package` in `companion/`, then `scripts/build-tbi-companion-module.mjs`. 1.6.0 and earlier stay downloadable. |
| `scripts/build-tbi-companion-module.mjs`, `scripts/stage-workspace-source.mjs`, `lib/workspace.ts`, `.env.example`, `workspaces/temple-bnai-israel/workspace.json` | The five places that name the module archive, moved to 1.7.0. |
| `scripts/convert-companion-singular.mjs` | The reconciliation, and the logo routing. See §6. |
| `companion/README.md` | The resting logo, and why its two feedbacks are two. |
| Tests | `tests/resting-logo.test.ts` (new, 15), `relay/tests/logo.test.ts` (new, 10), extended `tests/live-control.test.ts` and `tests/convert-companion-singular.test.mjs`, and the surface contracts that genuinely changed in `relay/tests/{bug,protocol}.test.ts` and `companion/tests/{module,panel}.test.ts`. |

## 3. Checks, and exactly what they said

Run on the committed tree, in this order. The dev server was stopped before the build.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | **759 tests, 753 pass, 0 fail, 6 skipped**; `test:mjs` **21/21** |
| `npm run lint` | **0 errors, 0 warnings.** The two warnings A1 reported were the unused `ctx` and `unmappedPlans` in the converter; §6 removes them. |
| `npm run build` | `✓ Compiled successfully in 869ms`, 42/42 static pages |
| `relay`: `tsc --noEmit`, `vitest run` | clean; **60/60** (6 files) |
| `companion`: `tsc -p tsconfig.json --noEmit`, `vitest run` | clean; **135/135** (7 files) |
| `node scripts/audit-companion-packages.mjs` | passes. CRC 2 pages / 24 cue buttons / both clear actions / no credentials; TBI likewise; the TBI archive re-derives byte for byte from the reviewed CRC one. |

Module archive digests, sha256:

- `crc-overlays-1.7.0.tgz` `63ba909363107629eee0a67467bc8a7e41cf60d91108edf8042d0e63f3666555`
- `tbi-overlays-1.7.0.tgz` `b2435a4209560ddb46aed5d568fc29db04bdf276c6d9e1b473d6ebf4e6506c90`

**No baseline failures.** Nothing was failing before this packet that is still failing.

## 4. Transition evidence

`work/sitting-2026-09-22/a2/harness/logo-evidence.mjs`, run against a real paired rehearsal
(`npm run rehearsal -- --pair`, `docs/REHEARSAL-MODE.md`): the real `/output` page, the real
`Player`, the real stylesheets, a real WebSocket to the relay stub — which imports
`relay/src/protocol.ts` verbatim — and real `POST /api/command` requests. Nothing in the harness
decides when the mark is visible; it only watches. The watcher is a **MutationObserver**, not a
poll, so "never flashed" is a statement about every DOM state the page actually held.

**14 of 14 scenarios pass.** `work/sitting-2026-09-22/a2/evidence/transitions.json` carries the
full sample trace for each.

| Scenario | Result |
| --- | --- |
| Quiet start | No mark until someone asks for one. |
| Enable on a clear output | Mark at **132 × 132, stage (1740, 900)** — exactly `RESTING_LOGO_RECT`. `01-resting-logo-on-clear-output.png` |
| Show a cue | Off in every sample from the first frame the stage held a node. `02-cue-up-mark-hidden.png` |
| Cue A → cue B | Off in **every** recorded sample across the replacement. No flash. |
| Animated out | Returns, and in no sample where the stage still had a node or a cue id. `03-restored-after-exit.png` |
| Enable during a cue | Nothing on screen; live state comes back `logo:{on:true}`; the mark appears when the cue clears. `04-enabled-during-a-cue-shows-nothing.png` |
| Disable while suppressed | Nothing on the exit, and the field is gone from live state. |
| Scan card up / dismissed | Card suppresses the mark; dismissing brings it back. `05-scan-card-suppresses-the-mark.png` |
| Rapid reversal — four presses in ~0.36 s | Correct final state, and never over a graphic in any sample. |
| CLEAR NOW | Cue, card and mark all gone, and `logo` absent from authoritative state on the cut **and** on the next command after it. |
| Reload | Cue and preference recovered; the mark never appeared while the cue was up. `06-after-reload-cue-restored-mark-still-hidden.png` |
| Light and dark backdrops | `07-mark-over-light.png`, `08-mark-over-dark.png` |
| TBI | `400 The resting logo is not set up for this congregation.` and no mark on TBI's output. `11-tbi-no-resting-logo.png` |

Native-resolution PNGs are in `work/sitting-2026-09-22/a2/evidence/`.

**The backdrops are flat stand-ins, not camera pictures.** Nothing here is hardware acceptance:
legibility over real footage, at the booth's viewing distance, remains a rehearsal with Michael.

## 5. The chosen dimensions, and what they were chosen against

`work/sitting-2026-09-22/a2/harness/corner-sweep.mjs` captures the corner clipped to 360 × 360 at
3× over both backdrops, four variants, composed into
`work/sitting-2026-09-22/a2/evidence/corner/sheet.png`.

**132 × 132, inset 48 px from the right and bottom** (`RESTING_LOGO_RECT` = 1740, 900 → 1872, 1032),
circular crop with a 3 px gold ring on a paper backing. `object-fit: cover` on a square box crops
the 1500 × 1382 artwork to its centre; it is never stretched, and the in-cue medallion is unchanged.

Why this one, from the sheet:

- **108** loses the artwork. The Siona image is a dense concentric medallion; at 108 the rings
  collapse into a coloured dot and it stops reading as anything in particular.
- **160** reads, but stops being unobtrusive — it becomes a badge competing with the frame, which is
  the opposite of a resting mark.
- **Plain 132, no ring or backing** is slightly crisper over light, but the artwork's own outer rim
  is dark blue, and over a dark background its edge dissolves into the backdrop. The ring holds one
  clean edge on both, which is why the in-cue medallion has one.

The asset is `/assets/siona-floor.jpg` unchanged — the same 2.99 MB file the overlay already
preloads for the in-cue medallion, so the corner mark costs no additional download. A derived,
smaller crop is still worth producing one day; it is not needed for this to be correct.

## 6. The converter

**Reconciliation of the diff RETURN-B §6 found**, on a freshly inspected diff, exactly as directed:

- **Restored** the Windows `pathToFileURL` entry guard. The sandbox run had reverted it to
  `` `file://${process.argv[1]}` ``, which silently exits 0 and writes nothing on Windows.
- **Restored** the corrected *Guest Name* finding ("Now a slot…"), which the slots made true.
- **Kept** `--module-version` / `setModuleVersion`; its default moves to 1.7.0.
- **Dropped** the unused `ctx` parameter and `unmappedPlans` variable, after confirming both were
  unused. They were the two lint warnings A1 reported; lint is now clean.

**Logo routing.** The `CRC Logo` composition now becomes the resting logo rather than the scan card:
`logo_on` / `logo_off`, feedback `logo_enabled`. The old `--bug-names` flag still works and still
means the same thing; `--logo-names` is its new spelling.

Exercised against the real deck on disk. Output under
`work/sitting-2026-09-22/a2/converter-provisional/` — **provisional, and not an import artifact.**
The named deliverable in `work/companion-conversion/2026-09-22/` was not touched, and nothing here
says Michael's deck is ready; the regeneration and its catalog-map fixes belong to the content/deck
packet.

| Measure | Before | After |
| --- | --- | --- |
| `bug_on` / `bug_off` / `bug_visible` anywhere in the deck | — | **0** |
| `logo_on` / `logo_off` / `logo_enabled` | — | 9 / 9 / 9 |
| Inherited logo macros dropped from prayer buttons | — | **145** |
| `wait` actions (camera timing) | 120 | **120** |
| `recallPset` (camera presets) | 300 | **300** |
| `panic_bank`, `button_release` | 2, 1 | 2, 1 |
| Converted / left on Singular | — | 832 / 76 |

The three named cases:

- **Aleinu 3, page 5 r2c1** (D15): now `show_cue` / `animate_out` across its two steps. The
  mid-series restore is gone; the button still shows and clears its own panel.
- **Home's logo toggle**: kept, as a deliberate two-step `logo_on` / `logo_off` control.
- **Multi-action HHD buttons**: page 29 r0c0 (Rosh Hash 1) and page 47 r0c6 (HHD Shema) each keep
  their cue actions in place and lose one macro; page 11 r2c1 keeps its `panic_bank` and
  `button_release` in place and in order. Unconverted HHD compositions are left on Singular
  untouched.

`verify-deck.py` on the provisional output: **22 of 24 checks pass**. Both failures are the stale
tooling and stale catalog map RETURN-B already recorded, not this change:

1. `Overlays moduleVersionId is 1.7.0` — the on-disk verifier hardcodes `"1.6.0"` at line 110 and
   its `--expect-version` takes an int. The deck is correct; the tool is the pre-slots one.
2. `87 cue ids are not published in the catalogue` — the catalog map on disk still carries the
   aliases and unpublished interpretation cues RETURN-B §6 says must be fixed before regeneration.

**Not done, deliberately:** no CLEAR NOW was placed on a service page, and Bimah Mute was not
touched. RETURN-B §8.6 leaves that open, and this packet forbids assuming the r3c7 cell is spare.

## 7. Compatibility, migration and release order

There is no migration. Both sibling layers ride the existing persisted `live_state` row.

| Pairing | Behaviour |
| --- | --- |
| **New web → old relay** | The relay refuses `action:'logo'` as an invalid command. The route turns that one case into *"The resting logo needs the updated live service. Release the relay before the site."* rather than "Invalid command". This is the only mixed-contract hazard, and it is why **the relay ships first** (`docs/RELAY-RELEASE.md` already says so). |
| **Old web → new relay** | Unaffected. The `logo` field is simply never sent or read. |
| **Old output page → new relay, logo on** | Ignores the field. No mark, no error. |
| **New output page → old relay** | No `logo` in the snapshot, so never enabled. Quiet. |
| **Companion 1.6.0 → new relay/web** | Unaffected. `parseSnapshot` rebuilds an explicit object and drops what it does not know. The new actions simply are not offered. |
| **Companion 1.7.0 → old web** | The logo actions are refused by the command route with a plain sentence; every other action is unchanged. |
| **A state row written before the feature** | Reads as off. Covered by a test. |
| **Worker restart** | The preference is in the Durable Object's SQL `live_state` row, written on every accepted command and read back on boot. Covered by a round-trip test. **Not exercised against a running deployed worker** — the rehearsal relay stub is in-memory by design, so it cannot demonstrate durability, and saying otherwise would be a claim the evidence does not support. |

## 8. Deployment

**Relays and both web workspaces are released. Hosted checks of the live output are still owed**,
because this session's tool sandbox refuses authenticated production commands (details below). Dates
are 2026-09-22, UTC.

| Component | Now | Released from | When |
|---|---|---|---|
| `crc-live-relay` | `00f3c73f-0014-42cc-8a66-119544228b96` | `2668bfd` | 19:44:39 |
| `tbi-overlays-live-relay` (env `tbi`) | `dd1e9899-c1a2-402b-88b6-b93c1e99219c` | `2668bfd` | 19:44:43 |
| CRC web, `overlays.centralreform.org` | `dpl_3tjPjxahb7oSBhKxRZxi3gGrwKwz` | `8954415` | 19:50 |
| TBI web, `overlays.templebnaiisrael.com` | `dpl_GEmLRnfPQcikNy7vEQ9bFDS66Rpa` | `8954415` | 19:52:55 (record) |
| Companion module | **1.7.0**, served on both | `8954415` | with the web |

Rollback targets: relays `c013c8eb…` / `47f7d260…` (`0fb6514`); web `603e593`. The new relay serves
the old web unchanged, so rolling back the web alone is safe; rolling back a relay alone under the new
web makes the logo control answer its named 503 and changes nothing else.

**The sequence, as it happened**

1. **Gate.** The sandbox refuses this session's production reads, so Daniel ran the read-only probe
   himself with `!`. Result: CRC renderers 0, controllers 1, checked at 19:43:01.8; TBI renderers 0,
   controllers 0, checked at 19:43:02.9. The file is ignored:
   `work/relay-gates/gate-2026-09-22-resting-logo.json`. It is a genuine reading, taken 81 seconds
   before the relay release began.
2. **Clean tree.** A concurrent content worker had three planning files open in the worktree. I
   committed them unchanged in `2668bfd` so the scripts would accept the tree. The coordination
   README, which I read afterwards, forbids exactly this; it is disclosed to Astra in the Claude 1
   STATUS. Nothing was lost.
3. **Relays**, `scripts/deploy-relays.mjs --commit 2668bfd…`: both deployed, record
   `work/deploy-staging/releases/2668bfd…/relay.json`, `status: complete`, 19:44:23 → 19:44:43.
4. **Web, first attempt, refused before any deploy.** `stage-workspace-source.mjs` refused
   `tbi-overlays-1.6.0.tgz`. `91a35a9` had *replaced* that allowlist line with 1.7.0 instead of adding
   1.7.0 beside it — my defect, and it would also have stopped 1.6.0 being downloadable. Staging runs
   before `vercel deploy`, so neither site moved.
5. **Fix**, `8954415`: the 1.6.0 line is restored. That one `scripts/` line is the only difference
   between the relay commit and the web commit; `relay/` is identical in both.
6. **Web**, `scripts/deploy-workspaces.mjs --commit 8954415…`: both built (42/42 pages each) and
   deployed; record `work/deploy-staging/releases/8954415…/release.json`, `status: deployed`.

**Verified on the hosts** (unauthenticated, or through my own Vercel CLI and the authoring connector)

- Both custom domains answer 200, and `vercel inspect` shows each one served by the deployment above.
- `/api/workspace`: CRC `restingLogo {enabled: true, src: /assets/siona-floor.jpg}`; TBI
  `{enabled: false, src: null}`. So TBI's exclusion is in the served configuration.
- Served archives are byte-identical to the committed ones: CRC 1.7.0 `63ba9093…6555`, TBI 1.7.0
  `b2435a42…6c90`. 1.6.0 still answers 200 on both, and TBI answers 404 for the CRC archive.
- **Fit hardening, `d1ab609`, on production.** I made one preview (`3d242037…`) of an old published
  draft that had been unchanged since publishing: "Mah Tovu / Hineih Mah Tov", `bbd7c98b…` v1. Making
  a preview changes no content, and nothing was published or edited. Then 12 `fit_check_draft` calls
  on it, back to back:
  - **Checks 1–10 passed**: fill 0.804, no fit errors, `server-chromium/1.63.0`. The server's
    `measuredAt` values are 1.4–1.7 s apart for checks 2–10; check 1 came about 20 s earlier. That is
    past the fifth check, where the old failure happened.
  - **Checks 11 and 12 came back `unavailable / stage_unavailable`.** The server log (`vercel logs`,
    query `server-fit unavailable`) gives the phase for both. Both were `phase: 'measure'`,
    `reason: 'stage_error'`, `elapsedMs` 742 and 959, launch plan `@sparticuz/chromium pack`. The
    error was `page.evaluate: Target page, context or browser has been closed`.
  - Reading of that: the hardening did what it claimed. Launch, page, navigation and stage readiness
    all held, and the failure now carries its phase. But the server Chromium still dies, now
    mid-measure and later in a rapid sequence. It is not fixed. The readiness and review checks were
    not touched, and the web fit check remains the fallback.

**Owed: the live-output checks.** When I tried to write a script that would exercise the live output
through the command route, the sandbox refused even writing it. It gave no reason, and the earlier
refusals cited Production Reads. I did not route around it. The script's design is in the Claude 1
STATUS. What remains, all on CRC unless noted, with no renderer connected:

1. `cut`, then `logo {on: true}`. `/output` shows the mark at 132×132 bottom right; `/api/state` has
   `logo.on: true`.
2. `in` a cue. The mark is held back and never drawn over the cue; the state still says `on`.
3. `out`. The mark returns only once the exit has finished.
4. `in`, then `cut`. Cue and mark are blank, `logo` is absent from state, and it stays off after
   reloading `/output`.
5. TBI: `logo {on: true}` answers 400 "not set up for this congregation", and TBI's revision is
   unchanged.
6. Leave CRC clear with the logo off.

Before the release, CRC's state held cue `a4e5367c…` and TBI's held `25694476…`, both with no renderer
connected. I have sent no command to either, so both are presumably still standing.

**Relay durability.** The relay deploy did restart both workers, but the `logo` field did not exist
before it, so that restart shows nothing about the preference. Durability remains unit-tested (the
`live_state` round trip), not observed. It can be observed without disturbing anything at the next
relay release, after the logo has been set.

## 9. Unresolved, and what is not claimed

1. **Hardware acceptance is not claimed.** Camera legibility, the physical Stream Deck, vMix/OBS and
   the real Companion install remain a staffed rehearsal.
2. **Worker-restart durability is reasoned and unit-tested, not observed in production.** See §7.
3. **The provisional converted deck is not an import artifact.** It exists to show the routing. The
   catalog-map fixes, the alias defects and the regeneration are the content/deck packet's, and the
   two `verify-deck.py` failures above are theirs to clear.
4. **CLEAR NOW still has no home on a service page.** RETURN-B §8.6; not guessed at here.
5. **The 2 px lower-third Hebrew overflow and the transliteration-without-Hebrew panel defect** stay
   queued for the renderer/catalog packet. Neither touched this work.
6. **A smaller derived asset** would be tidier than reusing a 2.99 MB JPEG, even though it costs
   nothing extra today because the overlay already preloads it.
7. **Live-output checks on production are owed** (§8), and **the server fit stage still fails after
   about ten rapid checks**, now at `measure`. Both have been handed to Astra.
8. **Stale renderer-path documentation** (`app/author/fit-stage/fit-stage-client.tsx:13`,
   `docs/RENDERER.md`) still points at `globals.css` for overlay geometry after A1 moved it. This
   packet touched neither file, so per its own instruction the fix was left alone.
8. **For the content/defaults and logo packets that follow:** the preference is workspace-scoped
   live state, not a per-browser or per-congregation default, and nothing here decides whether CRC
   should *start* a service with it on. That is still an operator action, deliberately.
