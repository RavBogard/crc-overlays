# Resting logo rotation — 2026-09-30

Daniel asked for the bottom-right logo bug to rotate clockwise once per minute. Existing push/deploy authorization carried forward.

- Changed only `app/resting-logo.css`: 60-second linear infinite centered rotation, stationary under reduced motion. The resting logo remains separate from cue logos and the scan card; existing suppression and stage scaling remain intact.
- Merged deployed Setup fix `d21d00a` into the working branch to preserve it. Product release `e0c19a88e24224b9021cdfaf36fc170cc6e1c3e4` is on remote main and google-signin.
- TypeScript and build pass. Full suite: 1,294 TS + 35 MJS pass, 12 existing skips; after integration, all 28 focused Setup/logo tests pass and TypeScript rechecked. Lint: zero errors, two existing unused-type warnings.
- Browser checked clockwise 90/180/360 degrees at 15/30/60 seconds, linear infinite timing, independent viewport scale, hidden state and reduced motion. Production browser checked the deployed animation on both custom domains; all four hosts health 200.
- Both deployments Ready with exact source SHA: CRC `dpl_BcF9XLdt1xtvAMJyEwi6bHZy33Dt`, TBI `dpl_2tJVYLHP7Sgi1xAAanWop1rBrZJM`. Main may produce another CRC build of the same SHA.
- Evidence: ignored `work/logo-rotation/` in the active checkout; paired deployment log in the managed `overlays-michael-release` checkout's same relative folder.

Complete. No database or relay changes. Roll back by reverting the four added CSS lines and deploying through the paired release script; preserve newer source changes.
