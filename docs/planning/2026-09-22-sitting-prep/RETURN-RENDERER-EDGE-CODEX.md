# Renderer edge fixes — Codex

Branch: `codex/renderer-edge-fixes` from `8954415191abfc69a62901f5d7c3617c8fd35bee`.

## Applied

- The lower-third fitter now publishes its measured height, reads the constrained DOM height back,
  and repeats (maximum three passes) only while a text layer still overflows. This fixes the
  measured two-pixel Barechu shortfall as geometry; it neither clips text nor changes a font floor.
- A left or right panel containing transliteration plus translation and no Hebrew gets the explicit
  `panel-translation-stack` layout: transliteration takes the upper measured block and translation
  the lower measured block. Its fit path measures those same two blocks.
- Existing Hebrew/transliteration panels, single-channel panels, content rows, text values, and
  default resting geometry are unchanged.

## Verification

- `npm run test:renderer` — 24 passing tests, including constrained lower-third feedback and the
  alternate panel geometry selector.
- Narrow headless Chrome capture at the isolated path
  `work/sitting-2026-09-22/renderer-edge-fixes/no-hebrew-panel.png` reports translation
  `scrollHeight: 220`, `clientHeight: 220`, `overflows: false`, with bounds `575..795`.
- The counterpart Barechu capture exercised the default face and showed that local font metrics can
  require a further one-pixel post-layout correction after an initial 111px box. The bounded
  feedback loop is intentionally based on that actual constrained measurement; it does not bake in
  a fragile fixed padding value.

No build, deploy, publication, shared-checkout change, or push was performed.
