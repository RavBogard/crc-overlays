# Visual controls for the beta build

The supported product remains a small family of lower thirds and full-height left/right panels. Ordinary controls should make a good-looking slide easy without requiring a general animation editor.

## Typography and accessibility

Keep the existing Work Sans Latin family. Bundle a named Hebrew family so output does not depend on the operating system's fallback fonts. Noto Sans Hebrew is the candidate for the next implementation slice; verify vowel/cantillation placement and fit against the actual corpus before adopting it. Preserve its redistribution license with the font. Official project: https://github.com/notofonts/hebrew.

Use WCAG 2.2 AA contrast and visible keyboard focus as interface baselines, while retaining separate viewer and program-monitor acceptance in beta. Reference: https://www.w3.org/TR/WCAG22/. Passing browser containment is not proof of comfortable television reading.

## Bounded design controls

- Alignment: template default, logical start, or centered. Logical start preserves Hebrew RTL and Latin LTR reading direction.
- Line spacing: template default, compact, or spacious. Each choice participates in measured preview and overflow checks.
- Text density: retain the existing comfortable, large-print and compact presets. Do not silently shrink below the renderer's readability limits merely to enable publication.
- Reset: explicitly restore the congregation template's presentation defaults without changing text or source selection.
- Artwork: select the congregation's default or a bounded uploaded image through an asset picker. Clearly identify the region being customized; never imply unrestricted image positioning or layer editing.
- Motion: retain the reviewed family and Play in/Play out controls. No arbitrary timeline or scripting.

Presentation fields are optional. Omission preserves existing published behavior. Source text, source metadata and revision pins are unaffected. New fields must round-trip through draft recovery, duplication, source variants, preview, publication, sharing, history and backups.

## Verification samples

Review both congregation brands with sparse/dense bilingual text, Hebrew vowel marks, English-only text, long titles, lower thirds, both side panels, a multipart sequence, and an uploaded artwork example. Verify every layout in the normal editor and full-screen preview, including keyboard exit, fit errors, reset and exact-version publication safeguards. Compare whole-prayer source coverage separately from the visual fit check.
