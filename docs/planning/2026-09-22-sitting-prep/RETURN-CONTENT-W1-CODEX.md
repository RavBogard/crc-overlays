# Content repair wave 1 — Codex return

## Status

No hosted draft, preview, review, or publication was written in this pass. The bounded repair packet is prepared as an ignored, version-checked manifest at `work/sitting-2026-09-22/content-wave1/content-repair-manifest.json`.

## Access and freshness evidence

- Production authoring host checked: `https://overlays.centralreform.org/author`.
- Google sign-in with the browser's available `dsbogard@gmail.com` identity completed the identity step, then the workspace reported that its membership request awaits administrator review. This identity has no author session. No role, invitation, account, or membership change was attempted.
- The documented owner identity `daniel@centralreform.org` was not available in the browser account chooser. The only other choice displayed was `crcmusic@centralreform.org`; it was not used because its role was not established.
- A read-only local-database attempt was rejected by an unavailable local connection. The `.env.production.local` connection setting resolved to a placeholder host, and a production catalog request using the locally configured legacy read credential returned HTTP 401. Neither is accepted as fresh production evidence.
- Consequently the manifest deliberately requires a fresh `get_draft` before each update, records its full before snapshot, and passes its returned version as `expectedVersion`. The September 22 export is historical comparison evidence only.

## Proposed bounded changes

1. Remove only the literal `<html>`, `</html>`, `<i>`, and `</i>` wrappers from Psalm-ish 1 and 2, preserving every word and line break, including the Hebrew line and the existing doubled space in “With  every breath.”
2. Replace the healing and memorial invitations with the exact short copy selected in `PLAN.md`.
3. Set Ma'ariv Aravim 1 to the supported bilingual `arrangement: "blocks"`, retaining the same source ID, ordered blocks 0–7, and both Hebrew/transliteration channels.

Daniel's current source ruling is reflected here: the existing CRC siddur remains the default. Ma'ariv Aravim retains its `legacy-shabbat-evening` CRC source and service context; this packet neither blends in Shirei Shabbat wording nor changes sacred text. Any later complete verse options must be supplemental and label edition differences explicitly.

## Required next action

Sign in to the CRC workspace using an existing approved author or owner account, then execute the manifest through `get_draft` → versioned `update_draft` → exact-version `preview_draft` → `fit_check_draft`. A human must visually review the exact preview before any publication. No deployment is part of this wave.

## Root application follow-up — 2026-09-22

Daniel completed owner sign-in in the root task's in-app browser. That browser is not exposed to subagents. Root applied all five prepared repairs through the normal author UI, reading each current saved version 1 before editing and confirming saved version 2 afterward. No WebMCP tools were exposed by the document, so this was UI application rather than the proposed API manifest execution.

- Send Healing Names: saved the manifest's shorter invitation.
- Send Kaddish Names: saved the manifest's shorter invitation.
- Psalm-ish 1 and 2: read the actual textarea values and removed only literal html/i opening and closing tags. All other characters and line breaks remained intact.
- Maariv Arevim 1: confirmed CRC Kabbalat Shabbat pp.13–14, selected passages 1–8, Hebrew and transliteration, then selected In blocks. No source selection or wording changed.

All five saved previews reported Fits this frame with fonts/artwork loaded. Root inspected Ma'ariv's full-screen preview: coherent Hebrew block above transliteration, no visible clipping. These UI preview checks are not a claim of separate server fit_check_draft receipts. No Publish action, human-review receipt, or publication occurred. Published output remains the prior revision until review/publication. Root's browser remains available for the next review.
