# Rulings — cross-app integration sitting, 2026-09-14

Sitting: Daniel with Claude (Cowork / Fable), on the review "One Service, Four Surfaces".
Scope: centralreform.live (.live), Overlays (crc-overlays-vercel), shireishabbat, the siddur reader.
Copies of this file: crc-overlays-vercel/docs/planning/2026-09-14-integration/, CentralReform.live/, shireishabbat/.

## Approved (handoffs written, same date)

| # | Ruling | Handoff |
|---|---|---|
| 1 | Build `moments.json`. Lift the QUEUED gate on `shireishabbat/HANDOFF-CODE-MOMENTS-JSON-2026-09-03.md`. Two consumers: .live (`dist-app/moments.json`, full spec) and Overlays (`content/moments.json`, `{momentId, unitId}` pairs). Alias list is Daniel's, curated in stage→confirm batches, never a spreadsheet. | `shireishabbat/HANDOFF-CODE-MOMENTS-JSON-UNBLOCK-2026-09-14.md` |
| 2 | The setlist is the whole service. Friday and Saturday templates carry the fixed liturgy as `prayer` / `reading` / `header` rows with `liturgyRef` pre-filled per book; hidden from the band's Perform mode by default. Authoring must not get heavier for David. | `CentralReform.live/HANDOFF-CODE-LIVE-SERVICE-TEMPLATES-2026-09-14.md` |
| 5 | `today.json`: a metadata-only public file emitted on setlist publish (service, book slug, start folio, stream URL, rabbi). The reader reads it instead of its hardcoded `CAL`; Overlays reads it for the default "Today's order" and the scan card's book. Calendar remains the fallback. No text, no bytes. | `CentralReform.live/HANDOFF-CODE-LIVE-TODAY-JSON-2026-09-14.md` · `shirei-tshuvah-desktop-reader/HANDOFF-CODE-READER-TODAY-2026-09-14.md` |
| 6 | Anonymous setlist links: historical setlist links stay readable (metadata only); chart bytes flow only through explicit, revocable grants via the already-deployed endpoint. CHARTS-001 is unblocked. The reader chart branch (`a6828b8`) must be located and rebased onto `codex/desktop-reader-ux` before either reader line ships. | `CentralReform.live/HANDOFF-CODE-LIVE-CHARTS-001-UNBLOCK-2026-09-14.md` |
| 7 | The cue log is the service's ground truth. Overlays keeps a bounded per-service history of accepted commands and exposes it read-only; .live reconciles it against the published setlist into an "as performed" version that sits BESIDE the plan, never replaces it (one-tap promote). "Bounded operational history, not permanent personal surveillance." | `crc-overlays-vercel/docs/planning/2026-09-14-integration/HANDOFF-CODE-CUE-LOG-2026-09-14.md` · `CentralReform.live/HANDOFF-CODE-LIVE-AS-PERFORMED-2026-09-14.md` |

Also accepted as-is: the setlist-import title-match thresholds (clear ≥80, plausible ≥45) and the "Not needed" label. Revisit 45 after a Shabbat setlist has run through it.

## Declined

- **Page numbers on the stream** (idea 4). "That's why we have the overlays." Anyone on the siddur app already finds the page the rabbi calls. The deployed scan card page chip stays manual; do not wire it to the cue folio.
- **Pinning the Overlays siddur library** to release commits. Changes are rare; the Monday PR is already a manual gate. If anything, a manual "refresh siddur library" control in admin settings is enough. No further lift.

## Deferred — "possibly, later" list

- **Idea 3 — Companion "Today's order" slot buttons.** Michael's page 1 as permanent slot buttons whose labels/targets resolve through module variables filled from the prepared service. Not now; changes are infrequent and the lift is not worth it yet. Michael keeps his own pages.
- **Idea 8 — Neon exit / cues as files.** The Sept 10 outage has passed (authoring writes observed 2026-09-14). Keep "cues as versioned files, relay holds live state" as a design direction for whenever Overlays next touches storage. Not a project.
- **Idea 9 — live "now" pointer for the band / rabbi one-tap audible.** No, at least not now. `/api/now` stays dark.
- **Idea 10 — delayed follow-the-service mode in the reader.** No, same.
- **Idea 13 — the family as an installable product for other shuls.** "Love this so much, but not right now." Eventual feature. Keep tenant boundaries intact (per-tenant `setlist_reader` bearer, per-workspace feed pin) so it stays possible.
- Ideas 11 (cues recall mixer scenes) and 12 (gold marks into overlays): not ruled on; parked with the above.

## Standing constraints restated

- Chart PDFs are third-party sheet music: bytes never enter shireishabbat, the public mirror, or any fork-facing surface. Metadata crosses; bytes do not.
- Liturgical text never enters .live: ids, names, pages only.
- Stage → confirm → commit for anything that binds, merges or deletes on Daniel's behalf.
- Only Daniel worries about dates. Handoffs state cost and shape, not schedules.
