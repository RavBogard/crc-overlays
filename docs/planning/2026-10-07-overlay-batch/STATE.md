# Overlay batch — local completion

## Scope and decisions

Daniel’s October 7 requests 1a–5a are implemented in the active checkout on `google-signin`. Impeccable init records the confirmed CRC/TBI product context in PRODUCT.md and code-first workflow in .impeccable/config.json. The existing interface and congregation branding remain the design authority. Daniel authorized merging, pushing, and deployment on October 7. Pre-existing untracked work is preserved.

Bottom columns now size to their content within the available lane and align at the top. The Look section offers Side by side and Stacked; top-to-bottom language order selects stacking for a bottom panel. Side titles use a fixed 42px standard independent of density. Overlap warnings require Publish/Cancel approval for the current saved version; other fit failures still block publication. This also applies during bulk publishing.

## Changes

- Renderer and motion: lib/player.ts, lib/player-motion.ts, app/overlay.css. Covers all-language bottom alignment, Hebrew vowel clearance/title exits, side-only watermark, content widths/stacking/order, and retained left-panel shell during text changes.
- Layout: lib/layout-registry.ts enlarges the corner logo to 72px with a proportionate 80px header; body screen positions remain consistent.
- Editor: app/author look/typography/order controls, fit review, sticky titlebar, and shared fit-issue dialog. Presentation parsing/types and MCP schema preserve the new arrangement and language order.
- Regression coverage: tests/overlay-batch.test.ts and relevant existing renderer/editor/schema expectations.

## Verification

- Full suite: 1,301 TypeScript tests passed, 12 existing skips; 35 script tests passed. No failures.
- Final focused regressions after confirmation cleanup: 15/15 passed. Combined release suite: 1,300 TS tests passed, 13 optional skips in the isolated checkout, and 35 script tests passed. The additional skip is a private ignored fixture absent from this clean checkout. No failures.
- Integration exposed an existing clock mismatch in rehearsal relay tests. Ticket issuance now uses the same injected clock as verification in three test fixtures; production code is unchanged. All 43 relay tests and the final full suite pass.
- TypeScript check and production build passed. Final lint passed with two existing unused-import warnings in lib/authoring.ts.
- git diff --check passed. Impeccable mechanical detector returned no findings on the changed UI targets.
- Browser: actual rehearsal editor verified centered Barechu, stacking/order, and sticky topbar. Source-backed isolated renderer verified Shema columns (795px/598px, both top 0), Hebrew title vowel clearance (58px box, 54px line, visible overflow), 42px side titles at compact density, Hebrew title Out animation, no background animation during left-to-left changes, and corner logo/watermark behavior. Shared production dialog verified both Publish and Cancel callbacks.
- Browser evidence: work/overlay-batch-qa/editor.jpg and corner.jpg. QA fixtures/scripts and command logs are in ignored work/overlay-batch-* paths. The full three-language fixture verifies alignment but remains too tall for a lower third, as correctly reported by the existing overflow check.

## Release / operating limits

The release combines the overlay batch and PR #8 (generated siddur source changes, two revisions, no automatic publication). All current remote branches are integrated. Of 41 old local branches outside ancestry, 35 have identical patches already present; six hold older overlapping implementations and remain preserved. The paired release is identified by tag `overlays-2026-10-07`; deployment metadata and receipts live in ignored `work/deploy-staging/releases/<tag SHA>/`. Browser/automated checks do not establish real OBS/vMix/Companion or booth acceptance. The rehearsal store was isolated and temporary; no production content was published during verification.
