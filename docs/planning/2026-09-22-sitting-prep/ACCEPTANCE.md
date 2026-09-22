# Draft review and integration acceptance

Prepared by Astra while Claude Packet A/B run. This document sets review outcomes; renderer and deck implementation details await their returns. No result below is claimed as passed.

## What Daniel receives for the next review

1. A browsable visual draft of the priority-service catalog, with every panel and continuation identified. Start with a short representative comparison set, then provide the complete gallery. Show a realistic camera-background composition as well as the transparent output so contrast and occupied picture area can be judged.
2. A replacement Companion page preview in service order, plus a concise explanation of inferred conventions and intentional improvements. Include original-to-new mappings for moved or replaced controls and accessible fallback pages.
3. A coverage ledger: each source prayer/song version, its ordered source blocks, resulting cue/panel IDs, reachable buttons, review status and unresolved exceptions. Separate content completeness, visual readability and hardware acceptance.

## Visual acceptance

| Case | Pass condition |
| --- | --- |
| Short prayer or blessing | A readable lower third where feasible; no unnecessary tall panel. |
| Long prayer/song | Coherent stanza/paragraph splits; all intended source blocks covered in order; continuation titles/labels clearly distinguish panels. No tiny type used to avoid a continuation. |
| Hebrew/transliteration | Hebrew above transliteration when stacked; matching block order and natural RTL/LTR behavior; no line-by-line interleaving introduced by default. Side-by-side variants align at the top. |
| English/Hebrew lower third | Retain the successful English-left/Hebrew-right family; confirm English is the intended translation or song text, not an accidental transliteration substitute. |
| Titles and artwork | Titles clear the decorative circle/image with consistent spacing across short and long names. |
| Priestly Blessing | Three Hebrew lines, one per blessing; natural visual progression from short to long, correct word order and marks. |
| Broken examples from sitting | We Are Loved panels are individually selectable and readable; no visible HTML; Silent Prayer/Thank You meaning and layout are intelligible. |
| Source integrity | Correct version; no invented Hebrew, missing sung text, duplicated source block or unexplained omission. Ambiguity is visible in the ledger. |
| Regression comparisons | Previously praised examples retain their strengths; TBI retains its own artwork and remains readable under shared renderer changes. |

Review native 1920×1080 output and reduced viewing size. Browser fit is a necessary check, not a substitute for comfortable reading over camera footage or at the booth's viewing distance. Record actual font/layout measurements after Packet A establishes the current contract; do not invent a new universal minimum here.

## Resting Siona image

The desired setting and the actual visible state are different. Enabling the logo while a cue is showing should remember the preference without covering the cue. Disabling it while hidden should prevent its return.

| Transition | Expected result |
| --- | --- |
| Enable with clear output | Small unobtrusive Siona image at bottom right. |
| Show a cue | Hide the resting image before the cue becomes visible. |
| Switch cue A to B | No resting-image flash between cues. |
| Normally dismiss a cue | Restore the enabled image only after cue exit completes. |
| Disable during a cue | Keep the image off after the cue exits. |
| Reload/reconnect output | Recover the authoritative preference and cue state without flashing the wrong graphic. |
| CLEAR NOW | Proposal: blank all visible output and prevent immediate logo reappearance until explicitly re-enabled; reconcile this with existing clear commands in the implementation contract. |

Use `public/assets/siona-floor.jpg`, replacing the former hands image. Compare crop/size visually; avoid stretching and a surrounding QR-card panel. Keep CRC-specific artwork out of TBI. Test operator feedback so an enabled-but-suppressed logo does not falsely claim to be visible.

## Michael's workflow acceptance

Derive conventions from repeated evidence, with confidence and exceptions. Evaluate predictability, labels, colors, recurring action placement, adjacent continuation panels and page changes. A current button coordinate is not itself a requirement.

Walk these scenarios against original and proposed pages:

- Ordinary Friday evening/Kabbalat Shabbat, including switching between prayer variants.
- All verses of L'cha Dodi and another multipart song; jump to a chosen verse and return to service flow.
- Saturday morning with Torah/Haftarah names, longer prayers and Kiddush.
- A service-prep name change followed by a normal operator press.
- Combined camera/graphics control: original actions and delays still run exactly as intended.
- Cue toggle, urgent clear, reconnect and return from fallback.

Record page transitions, difficult searches, unreachable cues and consequential muscle-memory changes. Improvements should have a clear operating benefit; a lower click count alone is not sufficient if labels or grouping become less predictable. Physical import and camera/switching checks remain hardware acceptance.

## Integration evidence

Each worker return states changed files, preserved existing edits, targeted checks and unresolved risks. After implementation, Astra integrates and runs the repository-required checks once against the combined state, plus applicable Companion package/deck checks and focused browser verification. Do not count old test results as evidence for new changes. Preview, source coverage and publishing reliability are engineering checks; Daniel has authorized hosted changes and cross-project implementation without a separate production-permission gate. See AUTHORIZATION.md. Operator-state cases here specify the intended finished product, not a claim that anyone is operating it today.
