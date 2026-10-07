# Overlay batch — local completion

## Scope and decisions

Daniel’s October 7 requests 1a–5a are implemented in the active checkout on `google-signin`. Impeccable init records the confirmed CRC/TBI product context in PRODUCT.md and code-first workflow in .impeccable/config.json. The existing interface and congregation branding remain the design authority. No deployment, push, or commit was performed; pre-existing untracked work is preserved.

Bottom columns now size to their content within the available lane and align at the top. The Look section offers Side by side and Stacked; top-to-bottom language order selects stacking for a bottom panel. Side titles use a fixed 42px standard independent of density. Overlap warnings require Publish/Cancel approval for the current saved version; other fit failures still block publication. This also applies during bulk publishing.

## Changes

- Renderer and motion: lib/player.ts, lib/player-motion.ts, app/overlay.css. Covers all-language bottom alignment, Hebrew vowel clearance/title exits, side-only watermark, content widths/stacking/order, and retained left-panel shell during text changes.
- Layout: lib/layout-registry.ts enlarges the corner logo to 72px with a proportionate 80px header; body screen positions remain consistent.
- Editor: app/author look/typography/order controls, fit review, sticky titlebar, and shared fit-issue dialog. Presentation parsing/types and MCP schema preserve the new arrangement and language order.
- Regression coverage: tests/overlay-batch.test.ts and relevant existing renderer/editor/schema expectations.

## Verification

- Full suite: 1,301 TypeScript tests passed, 12 existing skips; 35 script tests passed. No failures.
- Final focused regressions after confirmation cleanup: 15/15 passed.
- TypeScript check and production build passed. Final lint passed with two existing unused-import warnings in lib/authoring.ts.
- git diff --check passed. Impeccable mechanical detector returned no findings on the changed UI targets.
- Browser: actual rehearsal editor verified centered Barechu, stacking/order, and sticky topbar. Source-backed isolated renderer verified Shema columns (795px/598px, both top 0), Hebrew title vowel clearance (58px box, 54px line, visible overflow), 42px side titles at compact density, Hebrew title Out animation, no background animation during left-to-left changes, and corner logo/watermark behavior. Shared production dialog verified both Publish and Cancel callbacks.
- Browser evidence: work/overlay-batch-qa/editor.jpg and corner.jpg. QA fixtures/scripts and command logs are in ignored work/overlay-batch-* paths. The full three-language fixture verifies alignment but remains too tall for a lower third, as correctly reported by the existing overflow check.

## Remaining / next action

Local implementation is complete. Deployment requires a separate instruction and the existing CRC/TBI release process. Browser/automated checks do not establish real OBS/vMix/Companion or booth acceptance. The rehearsal store was isolated and temporary; no production content was published during verification.
