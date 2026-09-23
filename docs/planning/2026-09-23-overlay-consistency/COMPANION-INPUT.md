# Companion preset design input (research digest, 2026-09-23)

Read-only digest of the original export, RETURN-B and the rejected candidate. Evidence for the
fresh preset design; not a layout to copy.

## Export
`work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig`
(gzip JSON, `version: 12`, Companion 5.0.3). 99 pages, ~1,689 buttons. Contains live credentials
for obs and vlc connections: never copy the raw file outside authorized locations.

Connections: vMix `qBJmIOnrZHsaDwHs8ckmF`; Visca PTZ Center `EypENOqsd92mtQEXs2zfB`, Left
`RBdCC5Mwi8ovsxmzrog6b`, Free_Cam `fUDzSLu1sj7ObzAJKFfMw`, Birddog `-xHy6jDBgFA7fRA3RxmRE`,
Door_Cam `CQkYIJKgrSCfs5IOU3--O`, Black_Cam(bima) `dHN73UBd9n1Jktd9YW1kX`; X32
`MLFHxifnRUOY3uoK3cS6K`; three Singular Studio connections (legacy overlays); obs, BirdDog_NDI,
reaper, Spotify_WIP, vlc. Converted deck adds the "Overlays" connection `JKUO3gbCLf6mwwpsZCYae`.

## Device actions to preserve exactly
- Camera: `recallPset` (per camera connection, `options.val` preset).
- X32 Bimah Mute: `mute_channel_send` `/ch/26`→`11/on`, `/ch/27`→`11/on` (`mute: 2`); other sends
  in that button are `disabled: true`. ±5 bimah fader pair: `level_channel_send`, 1000 ms fade,
  plus `bgcolor` state.
- vMix: `command` e.g. `merge input=left cam 2&duration=1000`.
- Camera-coupled graphic gesture (pages 76-78): press = animate in → `recallPset` → `wait 1300` →
  vMix merge to that camera (duration 1000); release/second step = animate out + merge back to
  `center cam 1`. Middle continuation panels carry no camera actions. Keep 1300 ms / 1000 ms.
- Internal nav: `pageup`, `pagedown`, `set_page`, `home`.

## Michael's grammar (RETURN-B, evidence graded high unless noted)
H1 column = liturgical slot, read left→right. H2 continuations stack down the column. H3 invitation
at column top (Kaddish Names → Kaddish). H4 alternatives share a column. H5 column 7 fixed nav;
row 3 utilities (Bimah Mute r3c7 on 34 pages; vMix Merge r3c6). H6 colours: teal `#006699` for
numbered series (83%), burgundy `#990033` / teal for singles, `#000066` service furniture; colour
drifts across duplicates, so no invented universal alternate colour. H7 duplicate a graphic onto
every page that needs it. H8 camera+graphic+switcher is one gesture. H9 (medium) Friday by paging,
Saturday by a jump from page 1.

Do not copy: colour drift, mislabeled buttons, the timed auto-advance on p11 Aleinu 2, uneven logo
restore placement, "space"/"Page Map" naming.

## Overlay module (companion/src/main.ts)
`show_cue {cue}`, `toggle_cue {cue}`, `animate_out {cue}`, `animate_clear`, `clear_now`,
`logo_on`/`logo_off` (Siona resting logo), `next_panel`/`previous_panel {set}`, `set_page`,
`refresh_catalog`; feedbacks `requested`, `rendered`, `slot_empty`. Verify which module version
Michael has installed (packaged 1.7.0; import sheet mentions 1.6.0) before relying on newer actions.

## Rejected candidate
`C:/Users/dsbog/crc-coordination/releases/2026-09-23-michael/MICHAEL-FINAL-FULL-PUBLISHED-16SLOTS.companionconfig`:
a page-preserving patch (69 changed cells) of the 99-page original. Daniel rejected its visuals and
service flow on 2026-09-23. Rollback/comparison only.

## Reusable code
`scripts/convert-companion-singular.mjs` (button builders), `scripts/refresh-companion-catalog.mjs`,
`scripts/audit-companion-rehearsal.mjs` (camera invariants; template for new audit),
`scripts/audit-companion-packages.mjs` (release gate), `work/companion-conversion/2026-09-22/verify-deck.py`,
`upgrade-check.mjs` (Companion 5.0.3 upgrade scripts).

## Verify before building
Module version on Michael's machine; We Are Loved 2/5 are still catalog aliases (need distinct cues);
no free fixed utility cell (r3c7 is Bimah Mute); content decisions still open: Kiddush Fri/Sat
variants, Or Zarua identity.
