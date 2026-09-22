# Coder 1 — Siona resting logo end to end

## Outcome

Implement Daniel's requested resting corner image: the existing Siona artwork, small and unobtrusive at bottom right, hidden whenever an overlay is visible, returning after normal dismissal if enabled. Michael can turn it off. Deliver functioning web/Companion controls, measured transition evidence, and a return. This runs in Daniel's separate Claude Code window; strategy stays with Astra. Coder 2 now owns sheet-music-app and must not be disturbed.

Work in `C:/Users/dsbog/crc-overlays-vercel`. Read AGENTS.md, current git status, AUTHORIZATION.md, RETURN-A.md §1.6 and §5, RETURN-A1.md, ACCEPTANCE.md's resting-logo table, and RETURN-B.md D15/§6. A1 is commit `fa008ac`. Preserve all other staged/untracked work and the converter diff. No branch reset/switch or unrelated cleanup. Do not spawn agents.

## Product decisions for this packet

- Siona asset: `public/assets/siona-floor.jpg`, taken through the CRC workspace's branding configuration. Use CSS crop/mask and sizing on the existing artwork; no AI-generated reinterpretation or changes to the in-cue medallion. Start with a restrained corner size and show two reasonable size treatments in preview; choose the more legible unobtrusive one and record dimensions.
- This is a **distinct resting-logo feature**. Retain the explicit QR/Daven Along scan-card feature and its page/caption behavior under clearly named controls. A CRC logo action must no longer show a QR card. Do not silently repurpose every `bug` command into a logo command or remove QR capability.
- Preserve current quiet startup: absent/new logo preference defaults off. Once explicitly enabled, the preference survives output reload and normal reconnect; an explicit off persists. Use one authoritative workspace-scoped state, not per-browser localStorage. Inspect the existing durable relay/state mechanism before choosing storage. Verify relay restart behavior and report it explicitly.
- Preference and visibility differ. If a cue or explicitly shown QR card is visible, the enabled resting logo is suppressed. Enabling it during a cue must not put it over the cue. Disabling it during suppression prevents later restoration.
- Normal out/clear retains the preference; restore only after exit finishes. Cue-to-cue transitions must not flash the logo. Handle queued/cancelled animation transitions and rapid repeated presses.
- CLEAR NOW / `cut` blanks cue, QR and resting logo, and disables the resting-logo preference until the operator deliberately enables it again. Verify its authoritative state and reconnect behavior, not just the DOM.
- CRC supports this feature. Do not introduce a visible logo on TBI or substitute CRC artwork there. Make capability/default decisions explicit in workspace configuration.

## Ownership and implementation

Own the minimal complete feature across `lib/bug-layer.ts` or a new sibling resting-logo module, `app/output/page.tsx`, `lib/player.ts` only for lifecycle hooks needed to know what is actually visible, relevant new/updated logo CSS, workspace capability configuration, command API/schema, relay protocol/durable state, console controls, Companion actions/variables/feedback/presets, and their focused tests/documentation. Keep QR and logo state distinct and schemas consistent across every consumer. No sacred text, source/default migration, database catalog rewrite, general font-floor change or library edits.

Add clear operator actions for toggle/on/off. Companion should distinguish enabled/suppressed from visibly rendered if it reports visibility; never present desired state as rendered truth. Keep existing requested/rendered cue feedback intact. Select an appropriate new module version using the repo's existing release conventions, preserving Companion 5.0.3-compatible API/base versions and building CRC/TBI archives with the existing tools.

Converter scope is limited to necessary logo-action routing and reconciling the known existing diff: retain the useful `--module-version` support, preserve/restore the committed Windows `pathToFileURL` guard and correct slot Guest Name description, remove the newly introduced unused `ctx`/`unmappedPlans` additions only after confirming they remain unused. Inspect fresh diff before editing; do not overwrite newer changes. Distinguish an explicit operator logo toggle from inherited hide/restore macros coupled to prayer buttons. The latter should not fight the automatic visibility rule or re-enable a logo the operator disabled. Preserve every unrelated action, timing and camera command. Exercise the Aleinu 3 case and representative multi-action HHD buttons as well as Home's logo toggle.

Do not overwrite the final named import artifact or claim Michael's deck is ready: RETURN-B found stale conversion outputs, aliases and missing content still awaiting the later content/deck packet. Write any provisional converter fixtures/output under a new ignored A2 directory and identify them as provisional. Do not assign a CLEAR NOW button onto Bimah Mute or move unrelated controls.

## Verification

Use A1's existing local real-renderer capture harness where useful. Test off/on, cue in, cue replacement, animated out, clear, cut, rapid transition reversal, enable/disable while suppressed, QR display/dismissal, output reload/reconnect, and relay restart. Verify preference and actual visibility separately. Show the corner image over light and dark backgrounds; actual camera readability remains hardware acceptance.

Extend meaningful protocol/lifecycle/command/module tests. Run TypeScript, npm test, lint, build, relevant relay and Companion tests, and `scripts/audit-companion-packages.mjs`. Browser-check both CRC and TBI. Report baseline failures distinctly. Stop only your own server or coordinate a shared one before build; do not kill unrelated sessions. Fix stale renderer-path documentation noted in A1 if touching the relevant docs.

Hosted changes are authorized. If the feature and its consumer contract pass all checks, release the complete compatible set using the current repository release procedure, including relay if changed and both web workspaces/module packages as owed. Record deployment sequence and rollback compatibility; do not expose a new web command to an old relay without handling that transition. Preserve unrelated work during staging, use allowlisted clean release artifacts, and record actual SHAs. Do not hide a deployment blocker or deploy an unverified mixed contract just to finish the packet.

## Return

Write `docs/planning/2026-09-22-sitting-prep/RETURN-A2.md`: decisions, files/commits, commands and results, native screenshots/transition evidence paths, chosen logo dimensions, compatibility/migration behavior, local versus deployed status per component, module version, and exact unresolved issues. Update RELEASE-STATE.md for any releases. The known lower-third 2px overflow and translation-without-Hebrew panel defect stay queued for the upcoming renderer/catalog packet unless they directly block this logo work.
