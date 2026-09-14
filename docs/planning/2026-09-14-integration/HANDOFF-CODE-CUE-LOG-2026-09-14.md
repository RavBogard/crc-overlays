# HANDOFF → Code (Overlays): the cue log — bounded per-service history

From: Cowork sitting with Daniel, 2026-09-14 (`RULINGS-INTEGRATION-2026-09-14.md` #7).
Repo: `crc-overlays-vercel` (`codex/product-expansion`). Relay: `relay/`. Consumer: centralreform.live (separate order, `HANDOFF-CODE-LIVE-AS-PERFORMED-2026-09-14.md`).

## The gap, measured

Every accepted command (`in` / `out` / `clear` / `cut`) is sequenced, durably committed and acknowledged — and then forgotten. Relay receipts are keyed on `(action, cue)` for de-duplication only; `/services/log` is a manual issue form with no `collectionId`; `docs/LIVE-ARCHITECTURE.md` describes revision state with no history. There is no machine-readable record of what a service actually did.

Daniel's ruling: keep one. Bounded, operational, about graphics and units — **never about people**. `TWO-CONGREGATIONS.md`'s line stands: "bounded operational history, not permanent personal surveillance."

## What to record

In the relay Durable Object, append one row per **accepted** command (after the CAS commit, before broadcast):

```
{ seq, at, action, cueId, unitId, momentId, book, folio, source: "control"|"companion"|"mcp", serviceRef? }
```

- `unitId / momentId / book / folio` from `liturgyForCue` at publish time (already carried in the catalog since G2). Custom graphics, names panels, title cards → all four null. **No cue title, no text, no operator identity, no renderer presence.** Same forbidden-key posture as `/api/now` (`tests/now-route.test.ts`).
- `serviceRef` is the prepared-service `collectionId` when one is loaded, else null; the .live `setlistId` is resolvable from the prepared service, so it is not duplicated here.
- **Bound:** a rolling window — 2,000 rows or 14 days, whichever is smaller — per workspace. Older rows are dropped, not archived. A "clear history" admin action exists and is logged as its own row.

## Expose

`GET /api/history?since=<ms>&until=<ms>` on Vercel, **authenticated**: the existing bearer pattern, readable by authoring members and by a new read-only credential kind `history_reader` that .live will hold (mirror of .live's `setlist_reader`). CORS off. Response: `{ workspace, rows[] }`, 256 KiB cap, paging by `seq`. Add an MCP tool `get_service_history({since, until})` with the same scope.

## Don'ts

No public endpoint. No names. No "now" semantics — `/api/now` stays dark (declined 9/10). Do not change command handling, ordering or acknowledgment; the append is a side effect after commit and a failure to append must never fail the command (log and continue).

## Verify

Extend `scripts/check-live-relay.mjs`: fire in/out/clear/cut, read history, assert order, nulls for a custom graphic, the window bound, and that a rehearsal-mode run (`npm run rehearsal`) shows the same rows locally. Forbidden-key walk over every row.

## Return

`RETURN-CODE-CUE-LOG-<date>.md` with a captured history from a rehearsal run and the relay release note (`docs/RELAY-RELEASE.md` procedure).
