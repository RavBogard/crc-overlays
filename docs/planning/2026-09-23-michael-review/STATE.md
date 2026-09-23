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

## Findings and gates
- Birchot root cause (reproduced in rehearsal): each blessing is two passages under one authorized
  English translation. Checking one passage (or a passage already on another "slide" of the same
  graphic) made `preview_content` refuse (partial_translation / repeated_source_block); the stage
  then kept "Preparing preview" over the last render, so In blocks / Together looked dead (they
  work whenever the preview succeeds). Fix `4af0d07`.
- GATE: translated blessings check whole; a passage held by another slide moves to the active one
  — proceeded because the server already refuses both other outcomes.
- GATE: Corner drafts borrow a lower-third catalog template for motion/duration (templateLayoutFor)
  instead of adding a catalog corner cue — proceeded because adding one would change both
  workspace catalogs, the TBI mapping and the presets.
- GATE: Corner starter wording "Corner card" / fields Heading, Hebrew, Line; blank heading becomes
  "Response" — proceeded because it follows the existing starter-template pattern; listed for Daniel.
- GATE: edited siddur drafts save as local-variant content labelled "Local wording" — proceeded
  because that model already keeps source text beside local text and publishes the edit.
- The editor calls the groups inside one graphic "Slide 1..N" although they render in one panel.
  Label left unchanged (wording decision for Daniel).

## Evidence
- Commits: 4af0d07 (title + preview), 673cf7c (row order), 674ce33 (corner), eba7538 (wording
  edits); merges 898bf9e, f125c72, d6d4aa8.
- Rehearsal browser checks: accent title right edge x1870 over Hebrew x1860 (was ~x1590);
  half-blessing click selects the pair; move between slides; forced 409 shows "Preview
  unavailable" and recovers; row order Transliteration-Hebrew-Translation renders in that order;
  corner card 640x200 at x1232-1872 / y832-1032, fits; wording edit → preview, save, listed at
  /author/wording-changes, reopens with the edit.
- Gates at d6d4aa8: tsc 0; npm test 886 + 32 pass, 0 fail; lint 0 errors (2 known warnings);
  build OK; audit-companion-packages OK; audit-companion-preset PASS.

- Release `3636857` (CRC dpl_H9vc1Yg55YAU3tQbZPnbEAMpVe9t, TBI dpl_pYumE83i9ZM2vH7LDsSijzggDoBX), four hosts 200.
- Published corner cards: El Na R'fa Na 44ae41a4 (siddur block, CRC Shabbat Morning p. 46), V'imru Amen
  b06f734d (custom; Kaddish wording, first letter capitalized as a standalone line), Thank you d39673be
  (custom; the existing Thank you text). Server fit pass on all three.
- Preset `0757fbc`: sha256 bfc718e1…, 8 new keys (p1 r3c4, p8 r3c2/r3c4, p9 r1c5, p15 r3c2/r3c4, p16 r1c4,
  p23 r1c5); audit PASS. Not placed: Anytime page (full) and HHD Kaddish columns (no free cell).

## Open questions
- Answered (Daniel): the tabs for parts of one graphic say "Group"; "Corner card" wording is fine.
- Anytime page placement of the corner cards: Daniel unsure; left as is (see final report).
