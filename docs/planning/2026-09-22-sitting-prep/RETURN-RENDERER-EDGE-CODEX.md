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

- Required local checks passed in this isolated worktree: `npx tsc --noEmit`, `npm test`,
  `npm run lint`, and `npm run build`.
- `npm run test:renderer` — 25 passing tests. The final added assertion covers an upper panel block
  which becomes taller only after its constrained width is restored.
- The real-Player headless-Chrome matrix is under
  `work/sitting-2026-09-22/a1/edge-matrix-final2/` (one 1920px screenshot and exact manifest per
  case). It covers actual Barechu lower third and synthetic no-Hebrew panel, each in CRC and TBI
  branding with default and book faces:
  - Barechu: CRC/TBI default `112/112`, book `107/107` for both English and Hebrew; no overflow.
  - No-Hebrew panel: transliteration and translation each `102/102`; no overflow and `fit` verdict
    in all four brand/face combinations.
- The first full matrix exposed a genuine no-Hebrew sparse-text reflow (`102/73` after growth). The
  panel fitter now republishes its measured stack geometry after constrained reflow, which produced
  the clean final matrix above.

No build, deploy, publication, shared-checkout change, or push was performed.
