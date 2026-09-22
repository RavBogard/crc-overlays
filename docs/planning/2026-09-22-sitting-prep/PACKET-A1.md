# Coder 1 implementation — shared layout foundation

## Goal

Implement the first shared presentation improvements established by RETURN-A.md: maintainable overlay CSS, Hebrew above transliteration in stacked two-channel panels, and comfortable lower-third title clearance. Deliver measured before/after previews. This is an implementation packet for Daniel's separate Claude Code session; Astra's task remains direction/integration.

Work explicitly in `C:/Users/dsbog/crc-overlays-vercel`. Read AGENTS.md, current branch/status, AUTHORIZATION.md, RETURN-A.md, and ACCEPTANCE.md. Read the short INTEGRATION-MAP.md sections on source-owned structure and next work; do not implement that migration here. Existing CSS/renderer contracts can improve independently of content ownership.

You are not alone in this codebase. Coder 2 owns RETURN-B.md/CUE-LEDGER.csv discovery. Preserve the existing converter edits, untracked files and every other session's work. Do not reset, switch branches, stage unrelated files or spawn agents. Daniel permits at most two external handoffs at a time.

## Ownership

- `app/globals.css`, new `app/overlay.css`, and only the necessary global CSS import in `app/layout.tsx`.
- `lib/player.ts` for stacked-panel geometry and directly necessary renderer adjustments.
- Existing relevant tests for these contracts: `tests/player.test.ts`, `tests/editor-layout.test.ts`, `tests/overlay-faces.test.ts`, and directly affected presentation/preview tests only when their contracts truly change.
- Your evidence under ignored `work/sitting-2026-09-22/a1/`; tracked `RETURN-A1.md` beside this packet.

Do not edit authoring-model/defaults, source content, catalog files, database rows, source-book/reader repos, relay, Companion, logo/scan-card behavior, converter, or Coder 2's files. If an essential fix exceeds ownership, describe it in the return and finish independent work. No broad cleanup.

## Work

1. Capture a baseline for the relevant local representative cases from RETURN-A: praised lower third, non-row bilingual panel, row-based panel, single-channel panel, long title and book-faces variation. Use the actual renderer at 1920×1080, retain a 480px review version, and label cue IDs. Locate current preview tooling before inventing a new harness. Isolated synthetic long-title inputs may supplement real cues; label them clearly. Do not imply these samples cover database-only evening cues.
2. Consolidate overlay-specific rules into one intelligible stylesheet without moving console/editor/site styles. Preserve winning cascade behavior, font declarations, motion, responsive stage scaling, artwork, optional book-faces behavior, and both workspace brands. First establish that consolidation alone leaves geometry unchanged. Use screenshots and existing checks, not only string assertions.
3. Correct stacked two-channel panels so Hebrew precedes transliteration. Keep CSS defaults and `panelStackGeometry` consistent for missing/single channels, custom font sizes, auto-fit and sparse/dense text. Preserve the successful English-left/Hebrew-right lower-third pattern and the already-correct Hebrew-first row path. Do not alter sacred text, source-block order or layer selection.
4. Increase title clearance from the lower-third decorative circle through a named spacing rule. Choose a restrained initial value using actual rendered samples; record the value and evidence. Account for the reduced available title width. Do not shift body columns or add per-prayer CSS fixes to solve a title issue. Confirm long titles remain legible and contained.
5. Produce a concise side-by-side/contact-sheet review of before and after, with native-resolution evidence available. Explain what changed and any layout families still unresolved.

## Acceptance and limits

- Consolidation-only baseline is visually equivalent; intended final differences are limited to stacked language order and title clearance.
- No unintended movement of praised lower-third body columns, row layouts, name panels, logo artwork, or animation tracks.
- Tests exercise geometry with unequal language heights, missing channels and a tight fit, not only the CSS source text.
- Browser measurements show no new overflow/overlap for the sample set; verify both brands and faces-book on/off as applicable.
- Keep existing font floors and panel budgets for this packet. Global threshold changes require measured catalog evidence, not an arbitrary increase.
- Do not flip the implicit stored-draft arrangement default: it changes the meaning of existing data. A later content packet will use explicit arrangements with a reviewed migration.
- Do not infer “logo on by default” from Daniel's request. Logo visibility, persistence and scan-card separation get their own packet.

Run focused checks during edits and the required TypeScript, npm test, lint and build at the end. Stop only your own/shared dev server after coordinating its use; do not kill unrelated sessions. If unrelated baseline failures occur, report the exact failures separately rather than changing unrelated code or claiming a clean gate.

No Companion changes are owned here, so its package audit is not required for this packet. Capture browser evidence; do not claim hardware validation. Hosted changes are authorized overall, but this packet ends with a locally verified implementation and return for integration, not an independent partial deployment. Commit only your owned changes if the checkout permits clean isolation; otherwise leave a clear diff and explain why.

## Return

Write RETURN-A1.md with changed files/commit, checks and exact results, concise before/after findings, absolute evidence paths, baseline failures, unresolved issues, and any note for the content/defaults or logo packet. Report when finished. No standing wait loop.
