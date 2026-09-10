# Event-driven live overlays

## Responsibilities

- Vercel hosts the controller, output renderer, authoring UI, and authenticated APIs.
- Neon stores the source-based authoring drafts and immutable published revisions.
- A Cloudflare SQLite Durable Object holds CRC's live state, serializes commands,
  and pushes updates to browser and Companion WebSocket connections.
- The browser renders graphics locally. Idle output connections do not query Neon.

The live relay is a separate deployment. `RELAY_URL` and `RELAY_SECRET` must be
configured on Vercel, with the same secret and allowed website origins on the relay.
No database connection string or source corpus is installed in the relay. Only the
selected graphic is sent to it. The complete library remains an authenticated app
resource.

## Normal operation

A client obtains a short-lived, role-scoped connection ticket from `/api/realtime`.
It opens a WebSocket, receives the current state once, and downloads the cue catalog
on connection or a catalog-change notification. A command selects reviewed content
through Vercel, then the relay durably commits the command before broadcasting its
new state. Command IDs and controller sequence numbers protect against duplicate or
out-of-order delivery. A clear does not need a Neon query.

Renderer acknowledgments and small connection heartbeats update transient presence,
not Postgres tables. Presence messages do not repeat the selected graphic. Preview
windows cannot report themselves as broadcast renderers. Controller and Companion
feedback report renderer acknowledgment, not an on-air guarantee.

Publication notifies connected clients to refresh their catalog. It never changes
the currently selected graphic. If that notification fails, the authoring operation
reports that its save succeeded but live refresh is pending; reconnecting or an
explicit catalog refresh obtains current content. Selecting a later cue also carries
the current catalog version. A full catalog refresh is presently used on changes;
per-cue delta downloads are a possible further optimization, not an idle operation.

## Failure and lifecycle

Disconnects hold the last graphic. Reconnects use bounded exponential backoff and a
new ticket, then receive authoritative relay state; older snapshots cannot replay
an animation. There is no fallback to frequent HTTP database polling. Closing or
disconnecting a client stops its timers and connection. A hidden OBS/vMix browser
source must remain connected when it may still be used on air.

Cloudflare hibernation keeps idle sockets connected without an always-running
database listener. Presence expires after the documented timeout; a normal socket
close removes it immediately. Library editing or selecting newly published content
still requires Neon availability. A paid allowance is not a substitute for these
traffic controls.

## Migration and rollback

1. Deploy and test the relay separately, initially with test credentials.
2. Configure its production secret and website-origin allowlist.
3. Initialize it once from the existing pinned PostgreSQL state with
   `scripts/initialize-relay.mjs`, through `tsx` with explicit environment loading.
   Initialization cannot overwrite an initialized room.
4. Configure Vercel's relay environment and deploy the push clients and API routing.
5. Refresh OBS/vMix browser sources once so they load the push client. Their existing
   output URLs remain valid. Upgrade Companion to the push-capable module.
6. Verify fanout, reconnect, acknowledgment, idempotency, and an idle traffic sample;
   disconnect temporary rehearsal clients afterward.

After later deployments that change baseline cues, run
`scripts/sync-relay-catalog.mjs` through `tsx` with the production environment
explicitly loaded. Catalog markers are refresh hints; they never invalidate the
exact graphic already selected by an accepted command.

Legacy state and acknowledgment endpoints proxy to the relay after configuration,
so an old browser does not keep reading Neon during the refresh window. Old clients
still issue unnecessary HTTP requests until refreshed.

Do not remove relay configuration as a casual rollback: PostgreSQL live state is
no longer authoritative after cutover. Restoring the old runtime requires explicitly
reconciling the latest relay state first, or it can resurrect an old graphic. Keep
the relay deployment and durable data when rolling back website code.
