# Event-driven live overlays

## Responsibilities

- Vercel hosts the controller, output renderer, authoring UI, and authenticated APIs.
- Neon stores the source-based authoring drafts and immutable published revisions.
- A Cloudflare SQLite Durable Object holds CRC's approved playback catalog and live state, serializes commands,
  and pushes updates to browser and Companion WebSocket connections.
- The browser renders graphics locally. Idle output connections do not query Neon.

The live relay is a separate deployment. `RELAY_URL` and `RELAY_SECRET` must be
configured on Vercel, with the same secret and allowed website origins on the relay.
No database connection string or full source corpus is installed in the relay. It
stores only the approved playback cues, with authenticated access. Drafts and source
texts remain in the authoring system.

The library may grow to 4 MiB without changing the live message budget. Each
selected-graphic snapshot stays below 256 KiB; publication rejects an individual
cue that would exceed that budget. Idle traffic contains only heartbeat and
presence metadata, not the cue library, images, or animation frames.

## Normal operation

A client obtains a short-lived, role-scoped connection ticket from `/api/realtime`.
It opens a WebSocket, receives the current state once, and downloads the cue catalog
on connection or a catalog-change notification. Vercel forwards a small cue-ID/action command. The relay resolves the reviewed
content from its stored catalog and durably commits the command before broadcasting
its new state. Command IDs and controller sequence numbers protect against duplicate or
out-of-order delivery. Neither cue selection nor a clear needs a Neon query.

Renderer acknowledgments and small connection heartbeats update transient presence,
not Postgres tables. Presence messages do not repeat the selected graphic. Preview
windows cannot report themselves as broadcast renderers. Controller and Companion
feedback report renderer acknowledgment, not an on-air guarantee.

Publication notifies connected clients to refresh their catalog. It never changes
the currently selected graphic. If that notification fails, the authoring operation
reports that its save succeeded but live refresh is pending. Use **Sync live library**
in the editor (authenticated `POST /api/live-catalog`) to retry the transfer; merely
reconnecting an output does not synchronize authoring changes. If synchronization is pending, live cue selection continues using the last
successfully synchronized approved catalog. A full catalog refresh is presently used on changes;
per-cue delta downloads are a possible further optimization, not an idle operation.

## Failure and lifecycle

Disconnects hold the last graphic. Reconnects use bounded exponential backoff and a
new ticket, then receive authoritative relay state; older snapshots cannot replay
an animation. There is no fallback to frequent HTTP database polling. Closing or
disconnecting a client stops its timers and connection. A hidden OBS/vMix browser
source must remain connected when it may still be used on air.

Cloudflare hibernation keeps idle sockets connected without an always-running
database listener. Presence expires after the documented timeout; a normal socket
close removes it immediately. Library editing and publishing require Neon availability; playing the synchronized
overlay library does not. A paid allowance is not a substitute for these
traffic controls.

## Migration and rollback

1. Deploy and test the relay separately, initially with test credentials.
2. Configure its production secret and website-origin allowlist.
3. Initialize it once from the existing pinned PostgreSQL state with
   `scripts/initialize-relay.mjs`, through `tsx` with explicit environment loading.
   Initialization includes the approved playback catalog and cannot overwrite an
   initialized room.
4. Configure Vercel's relay environment and deploy the push clients and API routing.
5. Refresh OBS/vMix browser sources once so they load the push client. Their existing
   output URLs remain valid. Upgrade Companion to the push-capable module.
6. Verify fanout, reconnect, acknowledgment, idempotency, and an idle traffic sample;
   disconnect temporary rehearsal clients afterward.

After later deployments that change baseline cues, run
`scripts/sync-relay-catalog.mjs` through `tsx` with the production environment
explicitly loaded. Catalog markers are refresh hints; they never invalidate the
exact graphic already selected by an accepted command.

Catalog synchronization uses compare-and-swap against the relay's current version.
A delayed older publisher cannot replace a newer synchronized library; a conflict
retries with fresh authoring content, at most three times.

Legacy state and acknowledgment endpoints proxy to the relay after configuration,
so an old browser does not keep reading Neon during the refresh window. Old clients
still issue unnecessary HTTP requests until refreshed.

Do not remove relay configuration as a casual rollback: PostgreSQL live state is
no longer authoritative after cutover. Restoring the old runtime requires explicitly
reconciling the latest relay state first, or it can resurrect an old graphic. Keep
the relay deployment and durable data when rolling back website code.

## Repeatable verification

- `tests/relay-routing.test.ts` makes every PostgreSQL query/connection throw and
  exercises state, catalog, cue selection, cut, and acknowledgments.
- `scripts/check-live-relay.mjs` refuses non-loopback URLs. It installs synthetic
  cues and checks signed tickets, three-role fanout, command ordering/retries,
  catalog publication/CAS, pinned content, role-specific presence, reconnects,
  and no repeated graphic payloads while idle. It closes its own clients.
- `tests/browser-realtime.test.ts` checks lifecycle, handshake deadlines, stale
  sockets/revisions, output versus preview acknowledgments, and catalog races.
- Companion's tests check the equivalent push connection, feedback, retry identity,
  first-snapshot timeout, and serialized catalog refresh.

Local verification is separate from Cloudflare deployment, OBS/vMix browser-source
verification, physical Stream Deck operation, and actual account usage metering.
Do not mark those surfaces verified from a synthetic protocol test.
