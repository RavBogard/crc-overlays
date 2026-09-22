# Proposed chart-to-overlay and Companion assignment extension

Status: design proposal, not an implemented or approved API contract. Prepared independently of the two Claude discovery packets; it must not delay the first Shabbat visual draft.

Follow-up integration discovery: read [INTEGRATION-MAP.md](INTEGRATION-MAP.md) before implementation. The family already has a moment registry, confirmed aliases, book-based binding, reader charts and planned/performed reconciliation. Extend those contracts; do not interpret the observations below about the Overlays matcher as absence of family-wide mapping. `.live` setlist Publish was retired; overlay revision publication remains a separate concept. The source-owned presentation migration is already approved in later rulings, not a new decision to solicit.

## Evidence collected

- CentralReform.live MCP library search is connected in this Codex session. A read-only query for Olam Chesed returned `olam_chesed_chord_chart_Cm`, ID `upload-6c6cb367-f875-47d9-a66c-287f2f259d53`, with enrichment pending. This demonstrates access to a specific catalog record, not a verified Hebrew/lyric source or complete chart-to-overlay bond.
- `lib/live-setlists.ts` already imports setlists through a restricted read transport and matches rows to cues. Its input type accepts `songId` and `liturgyRef`; the inspected matcher references liturgy and title/candidate matching, not an explicit persistent song-to-overlay arrangement bond.
- `lib/mcp.ts` exposes `prepare_service_from_setlist`: prepare existing published graphics and return unresolved rows for review, without publishing or showing anything.
- `lib/service-collections.ts` handles the prepared-service import; `lib/live-today.ts` can suggest a service from `setlistId` and start time.
- Existing slot-name graphics and live labels are already part of Companion 1.6.0. They establish a useful operator pattern, but editable slot text is not the same as assigning an arbitrary multi-panel cue sequence to a stable button bank.

These are local code and one connector-read findings. Deployment configuration, production connectivity, chart contents and end-to-end authoring were not verified in this pass.

## Recommended user flow

1. Daniel selects a service and a particular song/arrangement in CentralReform.live.
2. Prepare Overlays from that service using the existing importer. Reuse confirmed overlay matches; show missing or ambiguous items with the actual arrangement and version.
3. For a missing item, create a source-grounded overlay draft, review its complete panel sequence, then publish it through the existing authoring process.
4. Review a proposed assignment of published cues to a bounded bank of Michael's Companion buttons. The bank follows the page conventions identified by Packet B.
5. Apply the prepared assignment. Michael sees updated labels and uses familiar presses to show/dismiss graphics. Changing a chart or preparing a draft never sends an on-air command.

Retain the option to expand this pattern after the pilot; a small bank is a recommended first test, not a user-imposed cap.

## Proposed identity and update rules

Persist an explicit reviewed association between workspace, setlist/track identity, song/arrangement identity, source-text version, and ordered published cue revisions. A title alone is insufficient: differently arranged songs can share a title, and a key change need not imply a lyric change. Confirm available upstream identifiers/revisions before choosing storage fields.

Companion controls address stable assignment slots; an assignment revision binds those slots to labels and cue targets. Publish the complete bank revision atomically so labels and actions cannot describe different targets. Validate cue availability and workspace ownership, and retain a previous revision for rollback. The module can receive changes through its existing outbound connection; this design does not assume a hosted server can reach Companion on the booth LAN.

Protect the currently displayed cue. Proposed pilot rule: defer changes to a bank with an active assigned cue until that cue is dismissed. Continue identifying and clearing the actual displayed cue using its retained identity, never by re-resolving a newly assigned slot. Make pending changes visible. Later designs may support immediate future-press reassignment, but must demonstrate unambiguous toggle behavior first.

## Pilot acceptance

- One existing service, a small bank sized from Packet B's evidence, and one confirmed arrangement.
- Include one multi-panel item, an empty slot, and an ambiguous source match.
- Ambiguity/missing text produces an actionable review state; no guessed automatic publication.
- Labels, target IDs and ordering change together. Stale edits are rejected or explicitly reconciled.
- Repeated requests do not duplicate drafts or assignments.
- Assignment during active output leaves the current picture and its dismissal behavior intact.
- Disconnect/reconnect restores the current assignment revision; an empty slot cannot trigger a stale prior target.
- Rollback restores the previous bank assignment without touching unrelated camera/audio controls.

Before implementing, confirm upstream arrangement identifiers, the existing authoring revision behavior, bank placement, permission boundaries, and whether the deployed setlist-read connection is configured. Use connector reads for live source facts; no setlist, chart, monitor, library or publish writes occurred during this investigation.
