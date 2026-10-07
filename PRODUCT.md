# Congregation Overlays

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

CRC and TBI service leaders prepare graphics. Booth operators select and display them during services.

## Product Purpose

Prepare Hebrew, transliteration, and English broadcast graphics, visually review and publish them to a library, and display them through OBS/vMix and Companion.

## Operating Context

The editor supports service preparation; the live controller and Companion support service operation. Output is a transparent 1920 × 1080 broadcast frame. Publication and displaying a graphic are separate actions.

## Capabilities and Constraints

Preserve source wording, language roles, congregation branding, and workspace separation. Layout choices include left and right panels, bottom panels (lower thirds), and corner overlays. Existing architecture uses Next.js, React, and TypeScript. Automated browser verification does not establish physical broadcast or booth acceptance.

## Brand Commitments

Preserve each congregation's existing identity and logo. Refinements extend the existing interface unless Daniel explicitly requests a redesign.

## Evidence on Hand

- `README.md`: workflows and architecture.
- `RELEASE-STATE.md`: deployed state and remaining acceptance limitations.
- `content/` and `lib/cues.json`: source-backed liturgical content and baseline graphics.
- `app/overlay.css`, `app/author/author.css`, and `lib/branding.ts`: incumbent interface and branding.

## Product Principles

- Make service preparation and live operation dependable and understandable.
- Keep published graphics separate from the operator's decision to display them.
- Preserve liturgical wording and the distinction between Hebrew, transliteration, and English.
- Respect the operator's visual judgment when reviewing presentation issues.

## Accessibility & Inclusion

Hebrew must retain its vowels and right-to-left reading behavior. Operators need readable text and clear controls for language order, alignment, and sizing.
