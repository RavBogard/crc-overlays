# Handoff for Code — the agent publish path: server fit check, bulk publish, right-panel geometry (2026-09-14)

Worktree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion`. Preserve tracked modifications and untracked files. Five parts, each independently shippable. Part 1A is the most serious — five published cues are wrong on air right now — so do it first, despite its position below; then Part 1, because Parts 2, 3 and 4 are usable without it and it is what currently blocks every agent.

## Symptom

Over MCP against production (`crc-overlays.vercel.app`), `fit_check_draft` returns `{"verdict":"unavailable","reason":"browser_unavailable"}` for every draft. `attestedMeasurement` (`lib/authoring.ts`) therefore finds no stored `fitCheck` on the preview, `review_draft` from an MCP actor throws `review_required` — "Exact-version browser fit review is required" — and `publish_draft` can never satisfy `validatePublishPreview`. Agents cannot publish anything.

The same measurement in a real browser works. On `/author/fit-stage`, signed in, `window.__measureCue(cue)` measured 124 new drafts in about eight minutes today; 123 pass. So the renderer, the fit functions and the stage page are all sound — only the server-side launch is broken.

## Part 1 — make `fit_check_draft` run on Vercel

`measureCueOnServer` (`lib/server-fit.ts`) is reached only through `defaultServerFitRunner` in `lib/authoring.ts`, which does `await Promise.all([import('./server-fit'),import('./oauth-core')])` and passes `origin: canonicalOrigin()`. Its single `catch` maps everything that is not the deadline to `{verdict:'unavailable',reason:'browser_unavailable'}` — launch failure, a missing Chromium binary, and a `canonicalOrigin()` throw all arrive at the caller wearing the same word. That is the first thing to fix, because it is why we are guessing.

**1a. Log the real error.** In the `catch` of `measureCueOnServer`, before returning, `console.error('server-fit launch failed',{plan:launchPlan(),origin:options.origin,error:error instanceof Error?(error.stack??error.message):String(error)})`. The returned shape does not change (no error text reaches an MCP client). Deploy this alone if you like — one `fit_check_draft` call then names the cause in the function logs, and the rest of Part 1 becomes confirmation rather than speculation.

**1b. Work the candidates, in this order.**

- *The pack is not in the function trace.* `lib/server-fit.ts` is imported dynamically and by design (`lib/server-fit-contract.ts` exists precisely so nothing else pulls the browser in). A dynamic import Next cannot see statically is exactly what its file tracer under-collects, and @sparticuz/chromium ships its Chromium as a `.tar` payload that no bundler follows. There is no `next.config.ts` in the tree. Add one with `serverExternalPackages:['@sparticuz/chromium','playwright-core']` and `outputFileTracingIncludes` mapping the MCP and authoring routes to `node_modules/@sparticuz/chromium/**` and `node_modules/playwright-core/**`. Symptom match: `executablePath()` resolves to a path that does not exist in the lambda.
- *`PUBLIC_BASE_URL` is unset.* `canonicalOrigin()` is called inside `defaultServerFitRunner` — inside the same try — so a throw there is also laundered into `browser_unavailable` without a browser ever starting. Check the env var on Production before spending time on Chromium.
- *Function config on the wrong route.* `app/api/authoring/route.ts` sets `runtime='nodejs'` and `maxDuration=60` with a comment explaining why. **MCP calls do not land there.** They land on the MCP route (`lib/mcp.ts` → `/api/mcp`), which must carry the identical `export const runtime='nodejs'` and `export const maxDuration=60`, plus the same tracing includes. A 10 s default timeout kills a cold Chromium start well inside the module's own 25 s `SERVER_FIT_DEADLINE_MS` — and that failure would surface as `deadline_exceeded` or as a dead invocation, not as `browser_unavailable`, so treat a mismatch here as a second bug to fix regardless.
- *Memory.* If the log shows the process dying during launch, raise the Fluid compute memory for those two functions to at least 2 GB.

### Acceptance (Part 1)

- `fit_check_draft` over MCP on draft `d541f3d2-f8c4-4a58-b733-579413e447c4` ("El Na R'fa Na") returns `verdict:"fail"` with populated `fitErrors` — not `unavailable`.
- `fit_check_draft` over MCP on any of today's passing drafts returns `verdict:"pass"` with a `rendererVersion` beginning `server-chromium/`, and `review_draft` then `publish_draft` from the same MCP actor succeed end to end.
- Any remaining `unavailable` leaves a line in the function logs naming the launch plan, the origin, and the underlying error.
- `/api/mcp` and `/api/authoring` report the same `runtime` and `maxDuration`.

## Part 1A — unresolvable source references must fail, never substitute

This is the most serious defect in the app and should be fixed before anything else here. Five **published** cues were rendering another cue's text on air today.

`Mi Chamocha (Sat 2)` (cue `5bad62c7-3005-4977-8349-230520c70211`) stored its content referencing the unit as `shma.mi-chamocha@legacy-shabbat-morning`. That string is real — it is a key in the `units` map of `content/legacy-crc-shabbat-morning.sources.json` — but it is not a source id. Every resolvable source id carries the `library:legacy-shabbat-morning:` prefix (`lib/authoring.ts` branches on `source.id.startsWith('library:')` in four places). So the reference resolved to nothing, and instead of erroring the cue rendered the text of `Mi Chamocha (Sat 1)`. The same class of failure left `Mourners Kaddish 3` identical to `Mourners Kaddish 2`, `Birchot Hashachar 3` and `Birchot Hashachar 4` identical to `Birchot Hashachar 2`, and `Psukei DZimrah 2` identical to `Psukei DZimrah 1`. A congregation watching the stream would never have seen the end of the Mourner's Kaddish. Corrected drafts exist for all five; they are not yet published.

**(a) Make the resolver raise.** The lookup is in `buildCue` / `sourceBlockFor` (`lib/authoring-model.ts`). Look for a `sources.find(...)` or `blocks.find(...)` whose `undefined` result is then skipped (a `continue`, a `?.`, a `.filter(Boolean)`), leaving the texts built so far in place; that residue is what got published. Replace it with a named `AuthoringError('unresolvable_source_reference', …)` naming the offending `sourceId`/`blockId`. The precedent already exists: `assertRevisionAuthority` (`lib/authoring.ts`) does `sourceIds.map(id=>sourcePack.sources.find(item=>item.id===id))` then `if(sources.some(item=>!item)) throw … 'source_pin_mismatch'`. That guard runs only on `rollback_draft`, never on the build path, and never checks `blockId`. Note why `assertSourcePin` did not catch this: `sourcePinFor(content, sourceSnapshots)` appears to be computed over the references that did resolve, so a pin over an incomplete set agrees with itself. Confirm that in `authoring-model.ts`. `preview_draft` and `publish_draft` must both refuse; `previewValidation` returning `valid:false` suffices for publish (`validatePublishPreview` already throws `invalid_preview`), but preview should surface the named error, not a generic invalid verdict.

**(b) Walk every published revision.** A one-off script that resolves every `sourceId`/`blockId` in every published revision against `sourcePack` and reports the unresolvable ones by cue id and name — to prove no sixth cue is affected.

**(c) A regression test on duplicate bodies.** Assert that no two published cues share identical body text — `textMainheb` + `textMainEng` + `textMain` + serialized `contentRows`. It would have caught all five at once, without knowing anything about source ids.

**(d) Rule on the bare form, once.** Because the bare key is a genuine identifier in the `units` namespace, `library:legacy-shabbat-morning:` + key is a derivable normalization — so decide deliberately whether the bare id is a legacy alias normalized at read time or simply invalid, and enforce that choice in exactly one function. Not both, and not two silently confusable namespaces.

### Acceptance (Part 1A)

- The five cues render distinct, correct text, and the corrected drafts publish.
- `preview_draft` and `publish_draft` on a draft with a bare-id reference fail with the named error; neither falls back to previously built text.
- The validator reports zero unresolvable references across all published revisions.
- The duplicate-text test fails if any two published cues are made identical, and passes today.

## Part 2 — "Publish N reviewed drafts" in the Library

About 120 fit-passing drafts are waiting. Add a single action to the authoring Library, visible to Editor and above, shown when at least one draft's latest preview carries a passing fit measurement — either a stored server `fitCheck` (`verdict:'pass'`) or a passing measurement this browser already took. Label it `Publish N reviewed drafts`.

One click, no confirmation dialog: the click is the approval. Per the owner's standing rule, do not add a step. For each qualifying draft, in the browser, in sequence:

1. `preview_draft` — or reuse the latest preview when its `draftVersion` equals the draft's current version (`fit_check_draft` and `review_draft` both reject a mismatch with `stale_preview`).
2. Measure the cue the way `/author/fit-stage` does: one `Player.render`, the shared asset wait, `applyFit`, then `findFitErrors` / `findFitWarnings` / `panelFillRatio` from `app/author/preview.ts`. Reuse `window.__measureCue`'s body rather than reimplementing it.
3. `review_draft` with `humanApproved:true` and this browser's `browserMeasurement` — a signed-in web session, so `assertedMeasurement` applies and the 1920×1080 / `fontsReady` / `overflow:false` contract is what it validates.
4. `publish_draft`. On a `duplicate_name` 409, retry once with `confirmDuplicateName:true` and record the `suggestedName` the server returned.

Show a running list as it goes: each draft published (with its final name), or skipped with its reason. A draft whose measurement reports `fitErrors` is never reviewed or published — it stays a draft and is listed with those errors. Note that `authoringCall` in `app/author/api.ts` uses a 12 s `AbortSignal.timeout`; run drafts sequentially so no single call is starved, and keep the button disabled while the run is in flight.

### Acceptance (Part 2)

- With ~120 fit-passing drafts, one click publishes all of them and each appears in the catalog under its published name.
- Drafts that fail measurement are listed with their fit errors and remain drafts; the run does not stop at the first failure.
- A draft whose name collides is published under the server's `suggestedName`, and the list says so.
- No dialog, no per-draft confirmation, no second click.
- The button is absent for Operator and below, and absent when nothing qualifies.

## Part 3 — right-panel bilingual geometry

Reproduce with draft `d541f3d2-f8c4-4a58-b733-579413e447c4`: a `layout:"right"` bilingual cue with one short content row measures `fill` 2.03 and "Graphic extends beyond the frame" even at compact spacing. The equivalent left panel is fine.

Cause, from `app/globals.css` and `lib/player.ts`. `Player.render` builds each row channel as `class="prayer row-hebrew|row-transliteration|row-translation"` inside `.content-row`, and `.part{position:absolute}` — but the legacy right-panel block still carries a blanket `.right .prayer{right:72px;top:266px;width:600px;height:560px;font-size:33px}`. There is no `.left .prayer` counterpart: the left panel targets `.english`, `.hebrew`, `.combined` and `.single-channel` specifically. So on a right panel every row channel is pulled out of the flex flow and forced to 560 px tall; the `.content-row` boxes that `panelFillRatio` sums (row heights ÷ 842, `app/author/preview.ts`) no longer describe the text, and `fitPanelRows`' 842 px budget is measuring something that does not shrink — which is why compact spacing does not help. Three stacked 560 px channels is the 2.03.

Fix: reset the channels inside panel rows rather than editing the legacy rule's numbers — add, after the panel-rows block, `.panel-rows .prayer{position:static;left:auto;right:auto;top:auto;width:auto;height:auto}`. `.right .panel-rows{left:auto;right:48px}` already places the container correctly, so nothing else about the right panel changes, and the non-row right-panel cue ("Thank you", custom text) keeps the rule it depends on.

### Acceptance (Part 3)

- The El Na R'fa Na draft measures `fit` (not `overflow`) with a `fill` within a few percent of the same content on `layout:"left"`, and `findFitErrors` returns empty.
- The shipped right-panel "Thank you" cue is pixel-identical before and after.
- A fixture in `tests/player.test.ts` (or the fit-check tests) renders a one-block bilingual cue on `right` and on `left` and asserts both produce `data-fit="fit"` and comparable fill; it fails against the current CSS.
- `npm test` passes.

## Part 4 — the title bar cannot hold an English title and a Hebrew accent title at once

Sixteen High Holy Day lower thirds failed the browser fit check with `textTitle overlaps accentTextTitle`. The only remedy available was to delete the accent title, which was done on all sixteen, so those graphics now show English where the Hebrew belongs: *May the Memory, Vimru Amen, aleinu bot 1, aleinu bot 2, Bsefer Chayim, Esah Einai, Ve'Al Kulam, Shofar Blessing, Hashkiveinu HHD 1, Hashkiveinu HHD 2, Hashiveinu, 13 Attributes, Al Cheit Refrain, Pitchu Li, Shalom Alechem small, Shofar Call 1.1.* This is not a long-title problem: `Aleinu` (6 characters) with accent `עָלֵינוּ` (7) overlapped.

The two titles are absolutely positioned over one another, and the CSS says exactly why. `Player.render` (`lib/player.ts`) emits them as siblings — `add('title',…,'textTitle')` and `add('title title-accent',…,'accentTextTitle')` — both `.part{position:absolute}`, with no row container. In `app/globals.css` the accent's own bottom rule is `.bottom .title-accent{right:68px;width:480px}`, but a **later** rule, `.bottom .title{left:250px;bottom:158px;width:1600px;height:46px;font-size:36px;font-weight:500}`, matches the accent element too (it carries both classes) at equal specificity, and wins. The accent therefore inherits the full-width title box, and since `.title-accent` sets `direction:rtl` with `justify-content:flex-end`, flex-end is the *left* edge — so the Hebrew ink lands on top of the left-aligned English ink at the same x. Any pair collides; combined width is irrelevant.

The panel layouts escape this: their rules are written `.left .title:not(.title-accent)` / `.right .title:not(.title-accent)` and give the accent its own row (`top:42px` vs `top:94px`). That guard was never applied to `.bottom`. It also explains why `Mourner's Kaddish` (a panel) carries `קדיש` without colliding, while most published lower thirds sidestep the problem by baking the Hebrew into `textTitle` (`Bar'chu בָּרְכוּ`).

Fix it as layout, not as a numbers tweak: give the lower-third title bar one row holding both — English at the start, Hebrew accent at the end, with a real gap — so they cannot overlap at any combined width, and shrink or elide predictably when too wide. Then restore the sixteen accent titles and re-publish.

### Acceptance (Part 4)

- A lower third with title `Aleinu` and accent `עָלֵינוּ` passes `findFitErrors` (`app/author/preview.ts`) with no `overlaps` entry from `overlapErrors`.
- A deliberately long pair (for example `זֵכֶר צַדִּיק לִבְרָכָה` against a 23-character title) degrades — shrinks or elides — without overlapping.
- The sixteen restored graphics pass a fresh fit check.
- The shipped lower thirds that bake Hebrew into `textTitle` are pixel-identical before and after.

## Not in scope

- Do not weaken `attestedMeasurement`. A stored `fitCheck` must still be `verdict:'pass'` with a `rendererVersion` starting `server-chromium/`, bound to the exact preview.
- Do not let an MCP actor pass a hand-asserted `browserMeasurement`. The `isMcpActor` branch in `review_draft` stays as written; Part 2's asserted measurements come from a signed-in web session, which is the existing, unchanged path.
- The per-graphic human review UI stays. `/author/fit-check` and the editor dock remain available for any graphic the owner wants to eyeball; Part 2 makes that optional for bulk imports he has authorised, not gone.
- No cross-part coupling: Part 2 must work from browser measurements alone even if Part 1 has not shipped.
- Do not resolve Part 1A by silently normalising bare unit keys wherever they turn up. Whichever way (d) is decided, one function owns it; a second quiet fallback anywhere else re-creates this defect in a new place.
- Do not re-fix Part 4 by shortening titles or dropping accent titles. That was today's workaround and it is what put English where the Hebrew belongs; the title bar has to hold both.
