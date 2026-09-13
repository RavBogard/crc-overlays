# Hosting cost and reliability audit

Status: implementation evidence and operating recommendations
Scope: two isolated congregation deployments of one maintained release
Updated: 2026-09-12

## Finding

The old polling design is a credible cause of Neon's unexpected 6.29 GB transfer in three days, but the repository alone cannot prove database attribution. Before the push cutover, the output and its embedded preview each fetched `/api/state` every 300 ms, the console did so every 700 ms, and the output posted an acknowledgement every 1.2 seconds. One continuously open control workstation therefore made about 2.1 million state requests and 216,000 acknowledgement requests in three days. Each legacy state read queried state and renderers and checked the published authoring signature; a cold server instance could also load the roughly 195 KB published cue aggregate. Neon defines transfer as data sent from the database to clients and specifically identifies large query results as a driver, which matches this mechanism. Exact attribution still requires the Neon transfer dashboard or query logs. [Neon network transfer documentation](https://neon.com/docs/introduction/network-transfer)

The current push path removes that steady database work. With `RELAY_URL` configured, `/api/state` and `/api/catalog` read Cloudflare relay state, browser and Companion clients receive one initial snapshot and then WebSocket updates, and catalog data is refreshed only when its version marker changes. Legacy playback keys bypass member-database authorization. An authoring database outage therefore does not prevent a previously synchronized service from continuing.

## Verified payload boundaries

Measurements are from the September 12 working tree and production build, without production credentials or database access.

| Object | Measured or enforced size | Browser behavior |
| --- | ---: | --- |
| Complete siddur source file | 3,559,410 bytes (3.40 MiB) | Server-only; absent from static browser chunks |
| Runtime source pack | 3,173,276 bytes, 743 sources | Server-only |
| Effective playback catalog | about 195 KB JSON | Loaded once, then only after version change |
| Largest measured complete source | about 20 KB including authority | Requested individually in the editor |
| Source browse/search response | hard limit 128 KiB | Summaries only; reports truncation |
| Individual source response | hard limit 128 KiB | Oversize source rejected with HTTP 413 |
| Relay cue payload | hard limit about 252 KiB | Selected cue only |
| Relay snapshot | hard limit 256 KiB | Selected state and cue only |
| Relay catalog | hard limit 4 MiB | Current catalog is under 0.2 MiB |

The production build contains no expanded source IDs in `.next/static`; the large corpus appears only in an authoring server chunk. `lib/server.ts` now loads authoring dynamically only when a database-backed authoring catalog is actually requested. Relay playback routes no longer load the source-library dependency as a side effect. This protects server memory and cold-start transfer as well as preventing accidental client bundling.

## Remaining database traffic

Interactive authoring still uses Neon by design. Every cookie-authenticated request currently checks session membership. Unsaved preview may run after a short edit debounce, so a continuously typing editor can create several authorization queries per second. Add a bounded 15–30 second membership cache keyed by the session hash, while retaining role checks and a documented maximum disable delay. Alternatively, lengthen preview debounce after usability testing. This is an authoring efficiency change; playback must remain independent of this cache.

Run these reliability gates before calling the new operating model complete:

- With no authoring activity, confirm Neon reaches scale-to-zero and records zero application queries over a five-minute idle window.
- Keep a synchronized cue live while Neon is unavailable; control, animate out, cut, renderer acknowledgements, and reconnect must continue through the relay.
- Open the authoring library and inspect browser network responses. No response or static asset may contain the complete 3.56 MB source file.
- Exercise search across every source facet, retrieve one source, preview, save, review, publish, and synchronize. Confirm no source response exceeds 128 KiB and the live catalog stays under 1 MiB.
- Reload the output, console, and Companion connection after a relay interruption. Each must recover from a fresh ticket without HTTP state polling.
- Complete the same test separately in both congregation deployments and confirm that credentials, catalog, output URL, branding, and presence never cross workspaces.

## Cost model for two congregations

These are planning ranges, not invoices. They assume two congregations, about three simultaneous WebSocket clients each, four service hours per week per congregation, occasional browser authoring, one Vercel Pro team, one Cloudflare Workers Paid account, and a small Neon Launch database. Extra seats, domains, tax, media storage, unusually long authoring sessions, and support labor are excluded.

| Service | Assumption | Expected monthly cost |
| --- | --- | ---: |
| Vercel Pro | $20 platform fee includes one deployment seat and $20 usage credit; current traffic and function use should remain inside the credit | $20 |
| Cloudflare Workers Paid | $5 minimum; estimated relay use is far below included Durable Object request, duration, row-read, and row-write allowances | $5 |
| Neon Launch | Event-driven authoring with scale-to-zero; $0.106 per CU-hour plus storage/history | $1–$15 |
| **Expected total** | Shared platform for two isolated deployments | **$26–$40/month** |

Vercel documents the Pro fee, included credit, and Flat-rate CDN allowance; its current iad1 Fluid Compute rates are $0.128 per active CPU hour and $0.0106 per provisioned GB-hour. [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan) [Vercel Functions pricing](https://vercel.com/docs/functions/usage-and-pricing) [Vercel regional pricing](https://vercel.com/docs/pricing/regional-pricing)

Neon lists Launch compute at $0.106 per CU-hour, storage at $0.35 per GB-month, and history storage at $0.20 per GB-month. A continuously awake 0.25 CU database would cost roughly $19.35/month in compute; 1 CU continuously awake would be about $77/month, so scale-to-zero matters more than the measured 6.29 GB transfer. Neon announced 500 GB of public network transfer included per paid plan beginning June 1, 2026. The 6.29 GB incident therefore should not itself create a transfer overage on Launch, but it remains a strong signal of unnecessary work and possible compute cost. [Neon pricing](https://neon.com/pricing) [Neon paid-plan transfer update](https://neon.com/blog/more-data-transfer-on-paid-plans)

Cloudflare Workers Paid has a $5 monthly minimum. Durable Objects include one million request units, 400,000 GB-seconds, 25 billion SQLite rows read, 50 million rows written, and 5 GB stored; WebSocket messages are billed as requests at a 20:1 ratio. At the stated usage, heartbeat traffic is about 75,000 incoming messages per month, or roughly 3,750 request units, plus about 25,000 alarm-related writes. Hibernation is already used, so inactive sockets do not continuously accrue duration. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) [Durable Objects WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## Operating limits and alerts

Use warnings before hard shutdowns; graphics playback should never stop because a budget alarm fired.

| Signal | Warning | Hard application boundary / response |
| --- | ---: | --- |
| Neon transfer | More than 1 GB/day or 10 GB in rolling 30 days | Investigate query logs; do not interrupt live relay playback |
| Neon compute | More than 20 CU-hours/month | Check idle scaling, session checks, preview frequency, and cold starts |
| Authoring query rate | More than 5 queries/second sustained for 5 minutes | Identify client/action; rate-limit abusive authoring requests only |
| Source search/get | More than 128 KiB | Truncate summaries or reject an individual source with 413 |
| Published catalog | Warning at 1 MiB | Existing relay hard limit 4 MiB; stop publication/sync before exceeding it |
| Selected cue | Warning at 200 KiB | Existing relay hard limit about 252 KiB |
| Cloudflare Durable Object use | More than 50,000 request equivalents or 50,000 writes/day | Investigate reconnect or alarm loops |
| Vercel usage | 50% of included credit or projected $10 overage | Investigate; use a $25 above-base spend notification/cap where account controls permit |

Review these indicators weekly during the two-congregation pilot, then monthly after four stable weeks. Record deployment version, workspace, query/transfer totals, relay request and error totals, catalog size, reconnect rate, and any authoring outage. A transfer spike with zero authoring should be treated as a regression because steady playback is designed to avoid Neon entirely.
