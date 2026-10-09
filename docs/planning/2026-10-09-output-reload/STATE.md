# Output page reloads itself when a release outruns it

After the `overlays-2026-10-09` release, the first name plate on vMix drew as a full-size logo with small text in the corner. The overlay site drew it correctly. vMix's browser input still ran the `/output` code it had loaded before the release. That code had no `nameplate` layout, so the Player drew the parts with no layout. Michael confirmed that reloading the input in vMix fixed it.

## Change

- New module lib/output-refresh.ts. `unrenderableCueIds` lists the catalog cues this page's own registry cannot resolve, which is the exact symptom of outdated code. `shouldReloadForStaleRenderer` reloads at once if the requested cue is one of them. Otherwise it waits until the stage is empty, so nothing on air is cut. It reloads at most once per catalog version, using a sessionStorage mark. A page that cannot write the mark never reloads, so there is no loop.
- `outputReloadUrl` keeps access across the reload. The page strips `#device=` or `#key=` after storing the credential. If storage did not keep it, the fragment is put back, then the page calls `location.reload()`, because a fragment-only change does not navigate.
- app/output/page.tsx runs the check on its existing 100 ms tick, and recomputes only when the cue list changes.

## Evidence

- tests/output-refresh.test.ts covers the decision, the once-per-version guard and the credential URL.
- Headless Chrome against rehearsal `/output#key=...`. Normal catalog: one load and no reload. Catalog with an extra cue in an unknown layout: exactly one reload, every catalog request returned 200 afterwards, and no second reload.

## Limits

This helps only after this code is itself on the output page, so vMix needs one more manual reload after this release. It reacts to unknown layouts. It does not react to other renderer changes, such as CSS or motion fixes, which still need a reload to take effect.
