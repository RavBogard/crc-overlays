# Michael follow-up

Status: complete. Daniel authorized "push and deploy when ready"; both sites deployed and the settings rollout verified on 2026-09-30.

Daniel approved new defaults (Top, watermark on, protected hyphens, Noto Sans Hebrew body / Frank Ruhl Libre watermark) and their settings-only application to both CRC and TBI existing overlays. Report affected counts and retain an undo backup before bulk changes. Text, manual breaks, custom groups and edited translations must remain unchanged.

Work in order:
1. Fix manual line breaks (Shalom Aleichem All after ellipsis), effective/larger title sizing, watermark/logo overlap. Sol workers own editor/content and renderer/CSS respectively; root integrates.
2. New-overlay defaults, then counted and reversible existing-overlay settings update.
3. Named folders and moving overlays; A–Z/newest/oldest sorting inside folders and overall.

Acceptance: focused regressions and browser evidence for reported defects; settings migration preserves content and has guarded undo; folders persist and sorting is deterministic. Integration gates: TypeScript, tests, lint, build. Existing untracked work preserved. Prior release: 2f4c765; prior release record db912f3.

## Completed

- Manual local wording preserves edge newlines. Built cues protect deliberate Latin breaks through paragraph/phrase reflow, then render actual newlines. Real Shalom Aleichem regression passes.
- Numeric title controls apply while typing/spinning without losing focus. A late saved preview cannot replace a newer edit. Explicit corner title sizes no longer silently shrink; side-panel default is 34px, with enough title space for longer names.
- Watermark always uses Frank Ruhl Libre and reserves the logo area. Main Hebrew default is Noto Sans Hebrew.
- New graphics, previews, custom/source sets and shared copies receive the four approved defaults. Explicit opt-outs win. Existing content is not normalized or rewritten.
- Persistent workspace folders: create, rename, move, delete-to-unfiled, All/Unfiled/named filters. Alphabetical/newest/oldest sort works inside folders and persists per workspace. Folder metadata is separate from graphics/publications; version checks prevent lost updates.

## Settings rollout completed

- Approved active-only scope: **453 graphics: CRC 240, TBI 213**. Includes seven TBI built-ins imported under their existing IDs so live text can be cloned exactly. Daniel authorized deployment after the explicit active-only rollout question. All 260 archived/retired records were verified unchanged.
- Backups and exact plans: ignored `work/michael-followup/crc-before.json`, `tbi-before.json`, `crc-plan.json`, `tbi-plan.json`. Final applied backups are `crc-release-plan.json` and `tbi-release-plan.json`, with `.applied.json` and `.verification.json` records. Temporary pulled production environment files were removed after verification; reacquire privately if undo is needed.
- `scripts/rollout-overlay-settings.ts` supports plan/apply/undo, requires workspace/schema identity, validates entire draft/default/live snapshots, and clones each published cue separately from any dirty draft. Only four settings change; text, groups, source pins and other sizes remain intact. New revisions retain originals for rollback. Stale plans abort transactionally.
- Isolated PostgreSQL rehearsal passed for conflicts, dirty/clean/unpublished drafts, a clean draft with already-compliant live settings, built-in import, and undo. Undo leaves imported built-ins editable with their original cue and settings.
- Whole-library comparison: all **452 published cues** have no new fit errors versus production using each workspace's actual branding. One pre-existing TBI support-slide artwork/font timeout remains; no new failure was introduced. One active CRC draft is unpublished.

## Verification and release

- Full tests: 1,294 TypeScript + 35 MJS pass; 12 existing skipped; zero failures. Initial integration found six fake-DOM compatibility failures and two outdated default/whitespace expectations; corrected and rerun.
- TypeScript, production build, diff check pass. Lint: zero errors, two existing unused-import warnings.
- Browser: real title typing/spinner focus, delayed saved-preview race, manual breaks and fonts, logo clearance, long titles, and actual AuthorPage folder CRUD/moves/filter/sort/reload/concurrency flow pass. Folder PostgreSQL rehearsal confirms workspace separation and stale-write refusal.
- Temporary app fixture removed, dev server stopped; generated dev types preserved in ignored work/michael-followup/dev-types-review. Evidence/logs under work/michael-followup and renderer evidence under work/michael-notes.
- Product commit `d97022052c95ab4b99c70ffbae105f3f41cfa305` pushed to remote main and google-signin. Paired release from the reused clean managed release checkout succeeded. CRC CLI `dpl_6DZ3wFtRYkg6Pn7LSqJqS93m42gt`, then same-SHA Git `dpl_BwtxTGrJqdDC8bkEs8qL6gXYKXuu`; TBI `dpl_EQom3N5GKts7wqkdoLUSXikkb1p6`. Both Ready, exact SHA verified.
- Only the folder table migration was applied, with public schema identity checked. CRC 240 settings updates and TBI 213 committed transactionally; exact draft/live verification passed, preserving 45 CRC and 215 TBI inactive records. No dirty draft text was published.
- Production renderer checks passed on both custom domains. All four health checks returned 200; signed-out folder API returned 401. Both live catalogs synchronized and all 452 published records verified against the pre-rollout text under existing alias resolution (four hidden CRC aliases intentionally inherit their targets, as before).
- Initial CRC relay sync lacked credentials in the older local env; a fresh private production env pull confirmed the same database and sync succeeded. Pulled env files removed afterward. No secret values logged or committed.
- Undo: load a fresh private production env for the selected workspace, then run `node --env-file=<private-env> node_modules/tsx/dist/cli.mjs scripts/rollout-overlay-settings.ts undo --workspace <workspace-id> --file work/michael-followup/<crc-or-tbi>-release-plan.json`; synchronize with `scripts/sync-relay-catalog.mjs` under the same environment. Undo refuses intervening draft/default edits. Original revisions remain retained. IDs: `crc` and `temple-bnai-israel-kalamazoo`.
- Release logs and release.json copied to ignored `work/michael-followup/`. RELEASE-STATE.md updated. No required work remains.
