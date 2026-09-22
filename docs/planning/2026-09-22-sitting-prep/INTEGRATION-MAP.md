# One CRC book, several working views

September 22 discovery and product synthesis. This task owns direction and integration decisions; implementation goes to separate tasks or bounded subagents per Daniel. Two external Claude discovery sessions remain active. No new implementation session has been started here.

**Later same-day update:** the two external sessions have advanced to Overlays A2 implementation and `.live` David's asks. Source Wave 3A at `6cde43e` already built the declaration channel/schema and additive `printing.source`; CORPUS-006 records adoption waiting on reader export. The newest order accepts exactly six fields and expressly withdraws the older “467” count. This supersedes the historical inventory below as an execution target. See [NEXT-SOURCE-BRIDGE.md](NEXT-SOURCE-BRIDGE.md) for the queued continuation of that existing order; it has not been dispatched.

## What already exists

The prior program is **One Service, Four Surfaces**, established September 14 and amended by the September 19 four-project audit and later returns. Continue that program, rather than introducing a competing service model or fresh chart-to-overlay pipeline.

| Surface | Existing responsibility | Evidence and current limits |
| --- | --- | --- |
| `shireishabbat` | Authoritative prayerbook family, source unit identities, compiled feeds/PDFs, printed-edition references, moment registry. | Current CLAUDE.md describes thirteen volumes. MOMENTS-001 is recorded live. Agreement checks were strengthened beyond matching ID sets to detecting wrong values on correct IDs. |
| `.live` (`CentralReform.live/sheet-music-app`) | Full service order, songs/arrangements/charts, musicians, service preparation and monitor controls. | Whole-service templates support fixed liturgy and book-specific references; band views can suppress non-musical rows. The author owns row order. Setlist Publish was explicitly retired: ordinary saved service data feeds today metadata; notifying the band is a separate action. |
| Reader (`shirei-tshuvah-web`) | Congregants' and daveners' book shelf, printed-page navigation, reading aids, offline use, approved chart access. | CHARTS-001 is recorded live in the current task record; older returns saying not started are historical. Reviewed presentation fields still have a documented source-to-reader migration dependency. Local reader branch is `wave/desktop-ux` with existing uncommitted edits; do not assume that checkout equals deployed/main. |
| Overlays (`crc-overlays-vercel`) | Viewer-facing text, operator controls, prepared services and operational cue history. | Already imports `.live` services and flags unmatched cues; consumes source/moment data. Companion 1.6.0 provides service-text slots. Proposed arbitrary cue-assignment banks would extend this, not replace the existing importer. |

Cross-surface links already designed/built:

- `momentId` identifies a service/prayer concept; source unit IDs and book occurrences locate actual text and editions. Neither a title string nor a page number alone is sufficient identity.
- `today.json` is metadata-only context for reader and Overlays. Later rulings supersede the original publish-trigger assumption; `.live` no longer has a Publish workflow.
- `.live` approved chart grants provide the reader's chart access; chart bytes are not copied into the prayerbook corpus.
- Overlays history feeds `.live` reconciliation into a separate performed version. The planned service is preserved; promotion is an explicit operation.
- Compiled artifacts and consumer-agreement checks already connect the repositories. Further checks should extend these instruments instead of duplicating them.

These findings are based on local code, task records and dated returns, plus the earlier successful `.live` library read. They are not a fresh end-to-end deployment certification.

## Most consequential unfinished connections

**1. Source-owned structure.** The September 20 round-trip design inventoried 467 reader-authored values, including 300 units with `renderStructure`, and proposed adopting them into the producer. The reader's later Wave 2 return says R-0919-audit-18 approved the design: source owns presentation metadata, reader `books/` becomes a pure build product, provenance splits into source/carry, and `edits: 0` becomes a release gate. Its implementation was waiting on producer fields. The design memo's earlier question to Daniel is therefore superseded; do not ask him to decide it again. These counts describe that inventory, not a new measurement today.

This directly intersects the sitting: source-declared stanzas, paragraphs and paired passages should inform both reading and overlay segmentation. Consumers still need different physical layouts and responsive rendering. Before implementing broad layout changes, establish which declarations are emitted today and whether the current source-adoption work has advanced beyond the return. Do not invent an Overlays-only copy of shared structural metadata.

**2. Arrangement/moment association.** The latest section of `.live`'s integration return says confirmed aliases reach the moments table but do not reach the binder, which reads book entries. Nine dry runs moved no rows. The recorded proposed remedy is a source-book alias carried through the build, rather than a competing matcher. The exact chart/arrangement still matters: a moment identifies a prayer family, not necessarily a musical version or lyric selection. Verify existing mapping fields before adding any new association store.

**3. Plan versus performed.** Reconciliation and promote-by-clone already exist. The audit says the UI was held while the history stream was empty, and identifies an upstream cue-source-ID filtering defect. Overlays' current release state separately lists unavailable history-reader access and incomplete end-to-end evidence. Trace the current chain in a separate implementation/verification task; neither assume the old defect persists nor claim the chain works from fixture tests. With Daniel's unused-system clarification, a controlled rehearsal can supply evidence without waiting for an actual service.

**4. Reliable source carry and operator preparation.** A complete book requires source updates to preserve reading aids, structural metadata, folios and provenance across consumers. Complete the approved source round-trip and agreement checks alongside the source-dependent overlay work. Fix repeated batch fit-check failures before relying on a catalog-wide publication process. Slot assignment should reuse prepared-service identities and maintain a coherent label/action revision.

## Product direction: one book, appropriate views

The shared object should be the **service**, tied to its book edition and ordered moments, with songs/arrangements, text selections, personnel, chart references and output choices associated with those moments. This extends the existing full-service setlist concept. It does not require a single enormous application or a single screen for everyone.

| Person | The view should answer |
| --- | --- |
| Rabbi / service leader | What are we doing, in what order, using which text/version, with whom? What changes when we choose an alternate? |
| Staff / service preparer | Are names, readers, announcements, resources and service details ready? Which unresolved item needs a human choice? |
| Musician | Which arrangement/key/chart is next, and what are the relevant notes? Can the chart remain available offline? |
| Sound / broadcast operator | Which clear, familiar control produces the intended cue or sequence? Are graphics actually rendered? How do I clear or recover? |
| Congregant / davener | Which service/book am I in, where is the called page or chosen passage, and can I read it comfortably with my preferred aids? |

Recommended common qualities: recognizable service/book identity across views; stable links to a specific moment or passage; clear alternatives rather than fuzzy title guesses; preparation without duplicate typing; complete offline/printed fallbacks where appropriate; role-specific detail without exposing internal IDs in the ordinary interface.

Automatic reader-following is not assumed. Earlier rulings explicitly deferred `/api/now` and live follow mode and declined automatic stream page numbers. Current openness to integration invites a future proposal, but does not by itself settle those interaction choices. A congregant's place should remain theirs unless a deliberate follow feature is chosen.

## Suggested bounded next work

1. Finish the current two returns and representative overlay/page-design draft. Read the source-structure findings into the implementation brief before assigning catalog-wide edits.
2. Open a separate cross-repository implementation task to determine the current round-trip migration state, finish the approved producer/reader contract where still needed, and expose the same structure to Overlays. Give it explicit non-overlapping ownership after checking active sessions.
3. Complete one vertical Shabbat rehearsal: choose the service/book in `.live`; resolve moments and arrangements; open the reader at the correct passage; prepare a complete overlay sequence and Companion pages; exercise cue history and reconciliation. Include a Saturday example, alternate musical setting, missing match and offline reader/chart case. Record code/local/deployed/hardware evidence separately.
4. Pilot dynamic Companion assignment using the established service and source identities, after its bank layout is grounded in Michael's conventions. Expand only after the pilot removes real preparation work and preserves clear operator behavior.

Useful acceptance test for the whole family: change one intended service choice once and see every affected view offer the correct corresponding material, with explicit unresolved choices and no silent reordering, wrong edition, lost reading aid or on-air surprise.

## Evidence to resume from

- `.live/docs/planning/2026-09-14-integration/PLAN-INTEGRATION-MASTER-2026-09-14.md` — original program and handoffs.
- `.live/docs/planning/2026-09-19-audit/RULINGS-AUDIT-2026-09-19.md` — superseding decisions, including retiring Publish.
- `.live/docs/planning/2026-09-14-integration/RETURN-CODE-LIVE-INTEGRATION-2026-09-14.md`, final “Still waiting on you” section — alias/binder gap.
- `.live/docs/planning/2026-09-19-audit/HANDOFF-CODE-AUDIT-2026-09-19.md`, Wave 3 — planned/performed evidence and UI dependency.
- `shireishabbat/planning/2026-09-19-audit/RETURN-CODE-FEED-ROUNDTRIP-DESIGN-2026-09-20.md` — field ownership and migration design.
- `shirei-tshuvah-web/docs/planning/2026-09-19-audit/RETURN-CODE-AUDIT-2026-09-19-W2.md`, Wave 3 — later approval and producer dependency.
- `shireishabbat/ops/tasks/MOMENTS-001.json`, `CHARTS-001.json` — current recorded states; large histories should be read selectively.
- Overlays `RELEASE-STATE.md` and this folder's PLAN/ACCEPTANCE/DYNAMIC-WORKFLOW notes — current cutover and sitting.

Here `.live` means `C:/Users/dsbog/CentralReform.live/sheet-music-app`; other repo names are sibling folders under `C:/Users/dsbog`.
