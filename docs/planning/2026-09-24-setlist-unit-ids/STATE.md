# Setlist rows matched by liturgy unit id: state

Order: docs/planning/2026-09-24-setlist-asks-return/HANDOFF-CODE-2026-09-24-setlist-unit-ids.md (Cowork's,
untracked, never staged by Code). Source note: centralreform.live
sheet-music-app/docs/planning/2026-09-24-overlays-asks/RETURN-OVERLAYS-ASKS-2026-09-24.md. CRC only.

NEXT: none. Released as web 608d530 on both workspaces (with the setup-pages S1-S3 work and its migration); RELEASE-STATE.md updated; main fast-forwarded.

## Done

- `matchSetlist` (lib/live-setlists.ts) matches a row by `liturgyRef.unitId` first: one published cue
  whose LiturgyRef carries that unit covers it; several go to needs-review as alternates with every
  candidate named; none falls through to the folio branch (kept, unchanged, for local sources) and then
  the title search, whose reason names the unit and page it looked for.
- No `crc-*` book is mapped to a feed slug and no printed page is added here (printed page belongs in the
  feed as `printedFolio`; moment merges in shireishabbat's emit_moments.py).
- `liturgyRef.stale: true`: the row has no liturgy, is matched by title, and its reason says
  "centralreform.live could not find this row’s page after the service changed books, so it was matched
  by name." It is reported as a song/other row, not a liturgy row.
- Kept: `eventDate` is the service date; `transition` is a performance row; header and note are skipped.
- TBI: `liveSetlistsAvailability` and `createLiveTransport` now also require `WORKSPACE_ID` unset or `crc`,
  so a copied credential on TBI still answers `unconfigured` with the same sentence and never fetches.
  Vercel env names checked 2026-09-24: tbi-overlays carries no `CRC_LIVE_*` in any environment;
  crc-overlays production carries `CRC_LIVE_BASE_URL` and `CRC_LIVE_READ_TOKEN`.
- docs/MCP.md "Preparing a service from centralreform.live" describes the order and the stale rule.
- Tests: tests/live-setlists.test.ts (Ha'azinu shape: by id, two cues to review with both named, stale to
  title with its reason, header/note skipped, an unknown id to title; TBI unconfigured with the variables
  copied). tests/service-rows.test.ts compares decisions with the pre-S1 import and the two liturgy
  reasons as reworded.

## Evidence

- Gates: tsc 0; npm test 1265 pass / 0 fail (+35 .mjs); lint 0 errors (2 known warnings); build 0.
- Dry run, read-only (2026-09-24): Ha'azinu `cd16ef0f-d874-47fc-9085-d85fdcc2054d` read fresh (version 4,
  35 tracks, 27 performance rows, 13 with a unitId) through the claude.ai CRC Music connector; CRC's
  published catalog read from `/api/catalog` (248 cues, 202 with a unitId, catalog version
  d9b911e99f8f5fc9). Old matcher (HEAD before this change) vs new, nothing written:

  | | before | after |
  |---|---|---|
  | covered by id | 0 | 6 |
  | covered by page | 0 | 0 |
  | covered by title | 3 | 0 |
  | needs review | 6 | 10 |
  | needs a graphic | 14 | 7 |
  | not needed (song) | 4 | 4 |

  Covered by id: Modah Ani, Elohai N'shamah, Bar'chu Walkdown, Avodah, Sim Shalom, Eitz Chayim. To review
  by id: Chatzi Kaddish (Readers Kaddish 1, 2), Mi Chamocha (Sat 1, Sat 2, short), Avot (1, 2), Gevurot
  (1, 2), Kedushah (1, 2, 3), Hoda'ah (Modim Anachnu Lach, Hoda-Ah). Two ids no published cue carries:
  shma.the-shma (Sh'ma, still needs a graphic) and torah.mi-shebeirach-healing (review, "Mi Sheberach" by
  name).
- GATE: Hoda'ah moves from covered (by name, "Hoda-Ah") to needs review, because two published graphics
  carry amidah.modim — proceeded because the order says several cues on one unit go to review with every
  candidate named, and a silent pick between them is what the matcher exists to prevent.
- Credential check (item 5), from session transcripts only, no secret opened: the Ha'azinu read was not
  made with the setlist_reader. It was `get_setlist` through the claude.ai "CRC Music" connector (Daniel's
  own signed-in session) from this overlays session on 2026-09-24 02:05 UTC (and again today for the dry
  run); the headline acceptance then injected that answer (HEADLINE-ACCEPTANCE-2026-09-23.md: "the
  server's read token was not used"). No production `prepare_service_from_setlist` or
  `list_live_setlists` call appears in any session. "The 19th" is the service date, not the read. The
  one earlier read through another MCP server (2026-09-14 23:07 UTC, a centralreform.live session, a
  different setlist) matches the setlist_reader's lastUsedAt of 2026-09-14.

## For Daniel

- The Sh'ma 63/64 split is ruled (R-0924-overlays-1: p.64); .live's DECISIONS-LOG entry is appended but not
  committed there.
