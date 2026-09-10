# Neon transfer allowance incident — 2026-09-10

The user received a 100% warning for the crc-overlays project's 5 GB monthly
network transfer allowance. Authenticated state/catalog requests and direct database
reads still succeeded during investigation. The allowance itself was not reset.

Every status poll previously fetched the pinned graphic payload and all published
cue payloads, even when unchanged. Output/preview browsers poll every 300 ms,
the controller every 700 ms, and Companion normally every second. Open clients
therefore continued transferring repeated content between services.

The fix checks live state revision on every request but omits the database payload
when that revision matches the process cache. Published cues use a compact database
fingerprint of active revision IDs; a changed fingerprint fetches an atomic snapshot
of content and signature. Cold processes fetch complete content. Commands, clears,
publication, rollback, and fresh renderer acknowledgments remain database-backed.
Browser retries back off up to 30 seconds only during outages.

A read-only production-database check measured these serialized query-result sizes:

| Query | Cold read | Unchanged warm read |
| --- | ---: | ---: |
| Live state | 10,166 bytes | 122 bytes |
| Renderer acknowledgments | 291 bytes | 291 bytes |
| Publication fingerprint | 50 bytes | 50 bytes |
| Published content | 6,406 bytes | No query |
| Total | 16,913 bytes | 463 bytes |

That is about 97% less result data in this unchanged warm-process sample, not a
measurement or guarantee of total Neon egress. PostgreSQL/TLS overhead, cold starts,
service activity and client counts still contribute. The same selected payload and
catalog version were returned to callers. No billing plan or production content was
changed. The consumed allowance remains consumed; this patch cannot prevent a
provider-enforced suspension for the existing overage.

The free allowance must not be treated as a verified production capacity budget.
Before service use, confirm provider availability and arrange a suitable allowance
or fallback. Close unused rehearsal output and control windows when rehearsal ends.

## Subsequent quota enforcement and playback recovery

On September 10, the production database began returning SQLSTATE `53000`:
"Your project has exceeded the data transfer quota." Fresh database export and
authoring operations were unavailable. The event-driven relay cutover restored
playback from the saved 29-cue production catalog without database queries. See
`LIVE-ARCHITECTURE.md` for deployed versions and verification. Authoring remains
blocked on database availability; no billing plan was changed.
