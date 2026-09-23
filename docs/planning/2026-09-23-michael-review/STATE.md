# Michael's overlay review (2026-09-23): current state

Source: Daniel and Michael's walkthrough, 2026-09-23 1 p.m. ([MEETING-SUMMARY.txt](MEETING-SUMMARY.txt)).
Earlier sitting: [../2026-09-23-overlay-consistency/STATE.md](../2026-09-23-overlay-consistency/STATE.md).

## Goal
Five requests from the walkthrough, shipped in one paired release, with the fresh Companion preset
rebuilt to include the new corner graphics.

## Decisions (Daniel, 2026-09-23, answered in session)
1. Corner layout: a new small bottom-right "Corner" layout for short text (Vaimru Amen, El Na Refa
   Na La, thank you). It takes the corner flush (48px inset, like Singular); the resting logo hides
   while it is on screen (already true for every cue: `restingLogoViewFor` suppresses on
   `cueOccupied`). Build and publish the three graphics and add them to the preset.
2. Siddur wording edits: editing Hebrew / transliteration / translation inline while building from
   the siddur. The graphic uses the edit; the original and edited text are both kept, and every
   edit appears in a "Wording changes" review list for later source correction. The siddur source
   is never changed automatically.
3. Row order: any order of Hebrew / transliteration / translation, per graphic. Default stays
   Hebrew - transliteration - translation; existing graphics are unchanged.
4. Lower-third Hebrew title: right-justified (a bug; `justify-content:flex-end` under
   `direction:rtl` packs left). Main title stays at x250.
5. Library preview: reproduce Birchot "third blessing not added", "In blocks / Together not
   dynamic", "Preparing preview never finishes"; fix the cause and surface preview errors.

## Work packets
- A (main thread): title alignment; preview failure state + Birchot repro.
- B (worker, worktree): Corner layout end to end.
- C (worker, worktree): per-graphic row order.
- D (after C): inline wording edits + Wording changes list.
- Then: merge, gates, paired release, publish the three corner graphics, rebuild + audit preset.

## Evidence
(filled as packets land)

## Open questions
- None yet.
