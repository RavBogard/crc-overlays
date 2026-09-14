# Handoff → web siddur: "Follow the service"

From: Overlays (`crc-overlays`), Phase D Release 2, G3 / plan items D15 and D16.
To: whoever builds the congregation-facing web siddur.
Status: the endpoint is built, tested and deployed **switched off**. Nothing changes for anyone until Daniel sets one environment variable.

Overlays now knows, at every moment of a service, which unit of which book is on the screen. This document is the whole contract for reading that from the web siddur, plus the budget behind it and the escape hatch if the congregation ever outgrows it.

---

## The endpoint

```
GET https://crc-overlays.vercel.app/api/now
```

Public. No credential, no key, no sign-in, no cookie. `GET` only.

```json
{"unitId":"frontmatter.peace-services@legacy-shabbat-evening","momentId":null,"book":"legacy-shabbat-evening","folio":1,"updatedAt":1757000000000,"pollSeconds":5}
```

| Field | Meaning |
| --- | --- |
| `unitId` | The shireishabbat unit the graphic on screen was built from, exactly as the source feed names it. `null` when nothing on screen comes from the library. |
| `momentId` | The named moment of the service, when the shireishabbat producer has published one for that unit in `content/moments.json`. `null` until they do — it is empty today, so expect `null` and treat the field as additive. |
| `book` | The feed slug the unit belongs to, for example `legacy-shabbat-evening`. `null` with `unitId`. |
| `folio` | The first printed page of that unit, as a number. `null` when the source records no page. |
| `updatedAt` | Milliseconds since the epoch, when the screen last changed. Always present and always live, including when every other field is `null`. |
| `pollSeconds` | `5`. Read it; do not hard-code the interval. If we ever need you to poll more slowly, this number changes and nothing else does. |

Responses:

- `200` — the object above, with `Cache-Control: public, max-age=2, s-maxage=2, stale-while-revalidate=10` and `Access-Control-Allow-Origin: *`. It is cross-origin readable from a browser on purpose.
- `404 {"error":"not_found"}` — the feature is off for this congregation. It answers `404` rather than `403` so the endpoint does not advertise itself before anybody is ready for it.
- `503` — Overlays cannot reach live state right now, with `Cache-Control: no-store` so a failure is never cached anywhere. Keep showing whatever you were showing and try again on the next poll.

### What you must do

1. **Poll every 5 seconds**, taken from `pollSeconds`. Not every 2. The whole budget below assumes 5.
2. **Stop polling when the page is hidden** (`document.visibilityState`), and stop after the service. A phone in a pocket should not be asking.
3. **Treat all-nulls as "nothing to follow" and leave the reader where they are.** All-nulls is normal and frequent: it is what a custom graphic, a names panel, a title card, or a cleared screen answers. It is not an error and it is not "the service ended".
4. **Never make following mandatory.** It is a toggle the reader turns on, and turning it off must stop the polling.
5. **Back off on failure** — on a `503` or a network error, wait and retry; do not tighten the loop.
6. Match on `unitId` first, and fall back to `book` + `folio` when a unit is not one you render. `momentId` is the field to key on later, once the producer publishes the moment table; build for it now, do not wait for it.

### What the endpoint will never tell you

By design (plan item D16), the response is exactly the six fields above. It carries **no name, no title, no text, no graphic identity, no revision, no renderer or operator presence, and no catalog version**. Nothing in it identifies a person or a graphic:

- A names list — the sick, the mourned, a Mi Shebeirach — is on screen as an ordinary graphic and answers **all nulls**. There is no field it could reach.
- A custom graphic, a template, a title card and a cleared screen also answer all nulls.
- Only a graphic built from the published siddur library resolves to a unit, and a unit is a page of a printed book, not a person.

This is a standing property of the endpoint, verified in `tests/now-route.test.ts` by walking the whole response object for forbidden keys. If you ever need something more than these six fields, ask — it is a decision, not a patch.

---

## The flag, and who turns it on

The endpoint is gated on `OVERLAYS_PUBLIC_NOW=1`, set on the CRC Vercel project only. It is **unset today, and it stays unset until the web siddur side is ready and Daniel says so.** Until then every request answers `404`, which is exactly what your development against this contract should expect to see first.

Build against the shape, tell Daniel when you are ready to read it, and he flips it. He can also flip it back — treat `404` as a state you can return to at any time, not a one-way door.

---

## The budget this shape was chosen for (plan item D15, verbatim)

| audience @ 2 s | req/hour | per 2-hour service | per month (4 services) | peak rate |
|---|---|---|---|---|
| 200 phones | 360,000 | 720,000 | 2,880,000 | 100 req/s |
| 1000 phones | 1,800,000 | 3,600,000 | 14,400,000 | 500 req/s |

*Uncached (every request invokes the function):* ~$0.60/M invocations + ~5 ms Active CPU each → about **$2/month at 200 phones and $10/month at 1000**, against a $25 combined cap. The dollars are survivable; the **shape is not**. An uncached handler that reads live state would push 500 req/s into one Cloudflare Durable Object, which is at or past a single DO's practical throughput, and would take the live relay down with it during a service.

*Cached (`Cache-Control: public, max-age=2, s-maxage=2, stale-while-revalidate=10`):* function invocations collapse to at most one per 2 s per PoP — under 50,000/month at eight service-hours, under $0.05 of compute, and at most ~1,800 relay reads/hour regardless of audience. What now scales with the congregation is **Vercel Edge Requests**: 2.88M/month at 200 phones (inside Pro's included 10M) and 14.4M/month at 1000 (≈ **$8.80/month** of overage at $2/M). Payload is ~120 bytes; 14.4M × ~400 B on the wire ≈ 5.8 GB/month, far inside the included transfer.

The table is written at 2-second polling because that is the worst case it had to survive. **Polling at 5 seconds divides every number in it by 2.5**, which puts even 1000 sustained phones inside the included tier. That is why item 1 above is not a suggestion.

Behind the edge cache there is also a 2-second in-process memo, so a burst of cold edge locations cannot fan out into the live relay: ten simultaneous requests make one read.

---

## The escape hatch, if the congregation outgrows it

*Relay-served alternative:* a public `/now` on the worker answered from the Workers Cache API with a 2 s TTL costs, on the Workers Paid plan already being paid for Durable Objects, $0 marginal at 200 phones and about **$1.32/month at 1000** — cheaper, but it requires a new unauthenticated public surface on the relay, CORS, a relay release, and a way to get the liturgy mapping into a worker that holds only cue payloads.

It buys roughly $8/month in a scenario CRC has never seen, so it was not built. **The trigger for building it is sustained audience above about 350 phones polling at 2 seconds** (or the equivalent — roughly 900 phones at 5 seconds). If you are planning something that would put the congregation there, say so before it happens; the fix is a relay release and this same response shape at a different origin, and the client change would be one base URL.

Measured request rates from the first real service go in the ledger.

---

## Ownership

The endpoint, its flag, its cache headers and this contract belong to the Overlays repository (`app/api/now/route.ts`, `lib/liturgy-index.ts`, `lib/server.ts`, tests in `tests/now-route.test.ts` and `tests/liturgy-index.test.ts`). The moment table it reads, `content/moments.json`, is data published by the shireishabbat producer: `{"schemaVersion":1,"moments":[{"momentId":"…","unitId":"…"}]}`, one entry per unit, and a moment may name several units.

Changes to the six fields are a decision for Daniel, not a pull request.
