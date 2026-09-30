# Michael's Companion rebuild — 2026-09-30

Daniel requested a rebuilt, working Michael preset accessible from CRC Setup, following Simone's successful personal rebuild. Michael already has an enabled CRC Owner account (`michael@centralreform.org`).

## Result

- Reproduced the production download failure: `COMPANION_CONNECTION_VALUES` was missing, so the personal download refused all nine required equipment connections. The stored CRC deck v1 validates with zero errors and six existing AV/startup feedback warnings.
- Set CRC's existing server secret from only the nine matching connections in Michael's September 16 backup: vMix, five BirdDog cameras, X32, Reaper and VLC. Every config and secret field matches the backup. Legacy OBS is intentionally excluded by the existing CRC flow. Nothing private was put in Git or public downloads.
- Redeployed previously released clean source `2f4c765e380e205900e83a9ba289cd939cf7fc39` to CRC as `dpl_APvrb3TDqfFpKXiBJzdqbLs9R6bz`; production build passed. The concurrent authorized Michael typography release subsequently superseded this with `d97022052c95ab4b99c70ffbae105f3f41cfa305` on both workspaces. The configured secret persists on the newer CRC deployment.
- CRC `/setup`, step 5, now successfully generates `CRC deck (deck v1, 2026-09-30).companionconfig`. The existing Owner-only, uncached download gives Michael a fresh paired credential whenever he downloads. Keep the existing preserving import instructions and equipment labels.
- Also rebuilt a private fallback file using the same personal renderer and a named revocable Companion credential owned by Michael. File, report and checks are under ignored `work/michael-companion-2026-09-30/`; credential ID `SDWNMpu4TiA6`, never its token in notes.

## Verification

- 1,460 keys, 439 graphic keys, 56 total pages (54 with buttons), six triggers and six custom variables. No Singular module connections. All 465 cue show/toggle/out actions reference graphics present in the live CRC catalog; Michael's credential returns catalog HTTP 200.
- Real import in an isolated Companion **5.0.5+9736-stable-0293f0d1ee**, using its bundled Node 26 runtime and **Import Preserving Unselected** with Buttons, Triggers and Custom Variables. Equipment connections and triggers were disabled in the test copy; no booth commands were sent. Exported back from Companion: all keys, triggers and custom variables survive; all 3,513 non-internal action/feedback entities (1,522 equipment + 1,991 Overlays), including their options and cell locations, match. CRC module 1.7.0 installs successfully.
- Personal setup tests 13/13, preset tests 5/5, package audit pass. Existing exact-source broad release gates were reused; Vercel rebuilt the configuration release successfully. Both custom domain health checks HTTP 200.
- Browser confirms the successful live download after the settings change. Final checks use the latest production release, not the superseded deployment.

## Setup test-pick correction

- Production catalog names lower thirds `bottom`; Setup's CRC test pick incorrectly searched `lower-third` and reported the Fri 1 button missing. Changed the pick to `bottom` and corrected the regression fixture to the production layout names (`left`, `bottom`). Product commit `d21d00a69b6872fd5579469ad0dcc67d9faf3fe9`, based on the deployed Michael follow-up `d970220`, fast-forwarded remote main. Source changes are confined to `lib/setup-flow.ts` and `tests/setup-personal-deck.test.ts`.
- Dedicated release checkout: `C:/Users/dsbog/.codex/worktrees/michael-companion-setup/crc-overlays`. TypeScript, 1,293 TypeScript + 35 MJS tests, lint (zero errors/two existing warnings), package audit, production build and diff check pass. Thirteen optional environment/platform/ignored-fixture tests skipped; the active checkout's focused preset tests also passed with the private backup present.
- Paired production deployment complete: CRC CLI `dpl_q9phevqy8G2TV6dnBD98fNquRBnC`, then same-SHA Git build `dpl_3rzoGiFbRPu3NmwrLhpCcnV6Cht6` serving production; TBI `dpl_DRJKNPW2hiKYGxx3s7sEZqWQvHVU`. Both custom domains report Ready with exact `d21d00a` source through Vercel metadata; all four hosts health HTTP 200. Browser confirms successful fresh download and all three test picks, including Fri 1 page 4 / row 1 / column 2 “Starting Soon”. Screenshot: ignored `work/michael-companion-2026-09-30/setup-download.jpg`. Logs: ignored `work/michael-companion/` in the dedicated checkout. Isolated Companion process stopped after validation.

## Remaining physical acceptance

Michael must import on his own booth computer and check vMix output, Stream Decks, camera loops and X32 mute. Automated and isolated import checks do not prove his current equipment addresses/passwords or physical operation. The saved fallback settings come from September 16; preserving import keeps his matching current equipment connections.

No email sent, no graphic edits, no deck-layout change, no migrations and no relay deployment in this task. Detailed local evidence: ignored `work/michael-companion-2026-09-30/`.
