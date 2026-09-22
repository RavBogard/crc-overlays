# Server-fit reliability return — 2026-09-22

## Scope

Investigated only the server browser measurement lifecycle in `lib/server-fit.ts` and its focused
tests. No renderer, CSS, output/player, authoring persistence, Companion, relay, hosted data, or
deployment was changed.

## Evidence and correction

The reported production pattern is real operational evidence but does not prove a self-request
failure. The previous `stage_unavailable` classification only established that `launch()` had
resolved: a later `browser.newPage()` failure was classified identically to a failed navigation or
unhydrated stage. `deadline_exceeded` carried no lifecycle phase at all.

The stage's required readiness condition is `window.__measureCue`; it is checked explicitly after
navigation. The prior navigation nevertheless waited for the browser `load` event, which waits for
all page subresources before allowing the actual readiness test to start. That could consume the
single 25-second budget on resources irrelevant to the measurement without making the check more
strict.

`lib/server-fit.ts` now:

- navigates through `domcontentloaded`, then still requires `__measureCue` before evaluating;
- records the active phase (`launch`, `new_page`, `navigate`, `stage_ready`, or `measure`) and
  elapsed time in every unavailable log entry; and
- preserves the exact public result contract, Chromium renderer attestation, real-browser
  measurement, and existing no-leak close behavior.

This is a bounded time-budget correction, not a retry loop and not a claim that the public-origin
request was conclusively responsible. A subsequent deployed failure will identify whether it is
before page creation, during navigation, waiting for hydration, or during measurement.

## Verification

- `node node_modules/tsx/dist/cli.mjs --test tests/server-fit.test.ts` — 9 passed, 0 failed.
  The focused fake browser asserts `domcontentloaded` navigation and still asserts the separate
  `__measureCue` readiness wait, as well as existing unavailable and deadline cleanup paths.
- `npx tsc --noEmit --pretty false` — passed.
- `git diff --check` — passed; it reported only existing Windows line-ending warnings for files in
  this shared working tree.

## Limitation and next evidence

No local fixture can reproduce Vercel Fluid's warm-instance routing, resource state, or public
self-request path, and no shared development server, build, deployment, publish, or live data
operation was run. The change improves the proven budget allocation and makes the remaining
production mechanism observable, but production repetition is still required to establish whether
it resolves the roughly-five-check failure pattern.

Changed paths: `lib/server-fit.ts`, `tests/server-fit.test.ts`, and this return.
