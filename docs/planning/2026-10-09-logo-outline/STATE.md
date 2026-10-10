# Logo outline and latest Michael changes

Daniel authorized deployment after confirming Michael had finished broadcasting, and explicitly included Michael's other changes on main.

## Source

- Based on `ec88956`, preserving Michael's centered name plates, custom Hebrew lines, pixel line spacing and Match Hebrew spacing, custom line breaks and italics, and stale-renderer refresh behavior.
- Removes the spinning logo's cream padding/backing and clips a 7% enlarged image inside its frame to remove the JPEG's white margin. Gold edge, 132px footprint, 48px inset, 60-second rotation and reduced-motion behavior remain.
- The renderer reuses both frame and image, preserving animation continuity.
- Release tag: `overlays-2026-10-09-logo`. Release checkout: `C:/Users/dsbog/crc-overlays-release-20261009`.
- No relay deployment, database migration, published graphic mutation or remote browser-source refresh is part of this release. Existing browser sources need a reload to receive this visual change.

## Verification and return

- Original focused checks: 15 resting-logo tests, actual renderer/CSS browser preview, rotation, reduced motion and hide behavior. Screenshot: `C:/Users/dsbog/crc-overlays-vercel/work/logo-outline/after.png`.
- Combined-release gate logs and production browser/health evidence: ignored `work/logo-outline-release/` in the release checkout. Paired deployment receipt: `work/deploy-staging/releases/<tag SHA>/release.json`.
- Before release, CRC was Ready at `ec88956`; TBI was Ready at `a263888`. Both will receive the same tagged source through `scripts/deploy-workspaces.mjs`.
- Original working edits and unrelated untracked material in the active checkout are preserved.
