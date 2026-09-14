# Handoff for Code — the agent publish path: server fit check, bulk publish, right-panel geometry (2026-09-14)

Worktree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion`. Preserve tracked modifications and untracked files. Three parts, each independently shippable; Part 1 first, because Parts 2 and 3 are usable without it and it is what currently blocks every agent.

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

## Not in scope

- Do not weaken `attestedMeasurement`. A stored `fitCheck` must still be `verdict:'pass'` with a `rendererVersion` starting `server-chromium/`, bound to the exact preview.
- Do not let an MCP actor pass a hand-asserted `browserMeasurement`. The `isMcpActor` branch in `review_draft` stays as written; Part 2's asserted measurements come from a signed-in web session, which is the existing, unchanged path.
- The per-graphic human review UI stays. `/author/fit-check` and the editor dock remain available for any graphic the owner wants to eyeball; Part 2 makes that optional for bulk imports he has authorised, not gone.
- No cross-part coupling: Part 2 must work from browser measurements alone even if Part 1 has not shipped.
