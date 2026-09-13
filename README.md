# Congregation Overlays

Hosted 1920 × 1080 broadcast graphics for CRC and an invited second congregation. The system combines a web cue library and editor, transparent OBS/vMix output, a native Companion/Stream Deck module, source-backed liturgical text, and relay-based live control.

This is an active two-congregation pilot. Browser and protocol checks pass; physical Stream Deck operation, actual OBS/vMix compositing, camera-linked controls, restart/network recovery, and a complete staffed service remain acceptance gates.

## Use the product

- `/` opens live control. **Inspect** renders a candidate locally and never changes live output; **Show** sends it live. **Animate out** and **Clear immediately** remain direct emergency controls.
- `/author` opens the visual library and editor. Editors can browse the siddur collection, duplicate cues, create custom non-liturgical text, preview unsaved work, save, review the exact rendered version, publish, and roll back.
- `/setup` gives the workstation installation path, congregation-scoped output URL, Companion downloads, and verification steps.
- `/access` accepts an invitation, signs in, and manages the current account session.
- `/output` is the transparent program graphic. Use the private URL created by setup rather than constructing it by hand.

The ordinary web experience does not require AI. The optional MCP authoring interface remains available for assisted preparation, with visual human review required before publication.

## Run locally

Install dependencies and run `npm run dev` (port 5175). Runtime secrets belong in `.env` and must never be committed. See [setup](docs/SETUP.md) and [workspace deployment](docs/WORKSPACE-DEPLOYMENT.md) for current environment and packaging contracts.

For isolated local editor rehearsal without Neon or a live relay, set `CRC_AUTHORING_REHEARSAL=1` with `NODE_ENV=development` and no `RELAY_URL`. The UI labels this temporary memory-backed mode. It fails closed in production or when a relay is configured.

## Live architecture

Control, output, and Companion receive an initial relay snapshot and continue through WebSocket updates. Catalog data refreshes only after its version marker changes. The relay holds the last synchronized published catalog, so live playback continues during an authoring database outage. Renderer acknowledgement means the browser matched requested state; it does not prove that OBS or vMix put the graphic on air.

The complete siddur corpus stays server-side. Browser source search receives bounded summaries, and a selected source is fetched individually. See the [hosting cost and reliability audit](docs/planning/2026-09-product-expansion/HOSTING-COST-AND-RELIABILITY.md) for payload limits, provider assumptions, monitoring thresholds, and the analysis of the former database-polling design.

## Content integrity

Canonical liturgical text retains source, feed, unit, and block provenance. Hebrew, transliteration, translation, and explicitly original English roles are validated rather than inferred. Custom announcements and readings are labeled local content. Publishing requires review of the exact saved version; edits invalidate stale review evidence.

The expanded source library contains 647 imported CRC sources. Daniel has authorized Simone and TBI to use the complete current and future CRC overlay and source library through a read-only upstream. TBI customization creates independent local drafts; canonical text must never be silently rewritten or copied between language roles.

## Companion and service safety

The native Companion module supplies ordered commands, retry identity, requested/rendered/disconnected feedback, and stable button behavior. Generic HTTP commands remain a compatibility path. Operators must retain a switcher-side way to hide the browser source, and Singular remains available during the parallel trial.

Follow [setup](docs/SETUP.md) for installation and [broadcast rehearsal](docs/REHEARSAL.md) for hardware acceptance. Do not treat automated browser checks as proof of on-air readiness.

## Planning and evidence

The [approved product backlog](docs/planning/2026-09-product-expansion/APPROVED-BACKLOG.md) tracks the thirty approved outcomes and the additional manual-authoring work. Implemented foundations are marked separately from acceptance that still needs operators, hardware, program output, automatic full-library sharing, or two-workspace isolation evidence.

Primary repository: `https://github.com/RavBogard/crc-overlays` (private). Live CRC controller: `https://crc-overlays.vercel.app`. Deployments use independent runtime credentials, relay rooms, databases, output URLs, and workspace branding while sharing one maintained release.
