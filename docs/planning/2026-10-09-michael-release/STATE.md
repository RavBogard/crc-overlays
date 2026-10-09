# Michael's October 9 release

Daniel authorized pushing and deploying Michael's changes, followed by identifying what Michael needs to release future changes himself.

## Source and release

- Michael's commits `1e9b091` (Name plate layout/form) and `d8459e0` (left-panel timing and retained shared titles) were already on `origin/main` when this task began. CRC's GitHub-triggered deployment was Ready at `d8459e0`; TBI was still at the October 8 release.
- The first paired CLI attempt at `d8459e0` was blocked before promotion: Vercel reported "The deployment was blocked because the commit author doesn't have permission to create deployments for this project." The blocked deployment was `dpl_4BbVYR9JR7u7Y1i2tMz6BwdMNb8m`; it did not replace production.
- This documentation-only release commit, authored by Daniel's existing authorized Git identity, preserves Michael's commits and changes. The annotated tag `overlays-2026-10-09` identifies the exact final paired deployment source. No history was rewritten and no existing worktree edits were included.
- Release checkout: `C:/Users/dsbog/crc-overlays-release-20261009`. The final paired receipt is `work/deploy-staging/releases/<tag SHA>/release.json`. `work/overlay-batch-release/verified.json` records both deployment IDs, Ready status, exact SHA comparisons and all four host health results.

## Verification

- TypeScript, npm test (1,309 TS and 35 MJS pass; 13 existing skips), lint (zero errors, two existing warnings), production build and diff check passed on Michael's source. The release adds documentation only.
- Browser verification on the real fit stage: standard bilingual name plate, long name and name-only card all fit; the lead line is larger and preserves the authored language order. A real Player transition retains the same title element at full opacity and takes about 0.52 seconds.
- Logs, final browser report and screenshots: ignored `work/release-20261009/`. Final verification reruns against both production hosts after the paired deployment.
- The six GitHub Linux test failures match the October 1 baseline: three Companion preset byte/hash comparisons, two mocked scratch-directory launch cases and a screenshot timeout case. Local tests pass. These failures were not introduced by Michael, and GitHub Tests does not gate the current automatic CRC deployment.
- No migrations, relay changes, Companion source changes or published graphic mutations. Automated checks do not replace a physical booth rehearsal.

## Michael's future releases

- GitHub is already enabled: `mcornillon42-source` has repository write access and successfully pushed both commits.
- Vercel team membership currently lists only Daniel as Owner. Michael needs a Vercel account linked to his GitHub identity and permission to deploy the relevant projects; verify his Git commit email maps to that account. The observed failure is specifically the CLI commit-author check, despite the successful CRC Git integration deployment.
- CRC is linked to GitHub `main`. TBI has no Git integration and deliberately deploys an allowlisted staged source tree to preserve its workspace assets/library policy. Granting Vercel access alone does not automate TBI.
- Once access is configured, Michael can use the existing paired release command from a clean checkout: `node scripts/deploy-workspaces.mjs --commit <full SHA> --confirm-production`, then verify both deployed SHAs and health.
- For automatic paired releases, adapt this existing staging path into one GitHub Actions release workflow, supply a dedicated Vercel deployment credential and both project IDs as repository configuration, and first repair the existing Linux CI failures. Do not connect TBI blindly to the CRC root upload: keep the current workspace staging boundary.
- No membership invitation, paid seat/billing change, credential distribution or deployment automation was performed in this task. The next required input is Michael's Vercel account identity and the intended deployment role.
