# CRC Overlays — Companion module, web API, converter and operator-export audit

Prepared from the read-only excerpt at `scratchpad/repo` and the operator's real export
`michael-companion5-export.json` (Companion `5.0.3+9703-stable-2daa0d7670`, export format
`version: 12`, `type: "full"`, ~6.5 MB). Nothing in the repo was modified. All analysis
scripts written for this audit are in `scratchpad/audit/`.

Everything below marked **verified** was read out of the code or computed from the export.
Anything I could not see (the repo excerpt has no `lib/`, no `app/` pages, no relay source)
is marked **inference** or **not in this excerpt**.

---

## 1. MODULE INVENTORY

### 1.1 Package and runtime

| Fact | Value | Where |
| --- | --- | --- |
| npm package | `companion-module-crc-overlays` | `companion/package.json:2` |
| Version | `1.5.0` | `companion/package.json:3`, `companion/companion/manifest.json:8` |
| SDK | `@companion-module/base` **2.0.4** (exact pin, no caret) | `companion/package.json:18` |
| Node engine | `>=22.20` | `companion/package.json:14-16` |
| Runtime type | `node22`, API `nodejs-ipc`, `apiVersion 2.0.4` | `companion/companion/manifest.json:14-20` |
| Entry point | `../dist/main.js` | `manifest.json:18` |
| Module id | `crc-overlays`, type `connection`, `legacyIds: []` | `manifest.json:3-13` |
| Permissions | `{}` (none requested) | `manifest.json:19` |
| Dev deps | `@companion-module/tools ^3.0.1`, `typescript ~6.0.3`, `vitest ^4.1.9` | `package.json:20-25` |

The module is written against the Companion 5 typed-manifest API: `InstanceBase<Manifest>`
with a `Manifest extends InstanceTypes` that declares `config`, `secrets`, `actions`,
`feedbacks` and `variables` as types (`companion/src/main.ts:26-52`). It uses
`CompanionPresetSection` (`main.ts:386`) — a Companion 5 construct. This is a
Companion-5-native module, not a ported v4 one.

### 1.2 Actions (11)

All ids quoted exactly. Defined in `#defineActions()`, `companion/src/main.ts:333-354`.

| Action id | Name | Options | Behaviour |
| --- | --- | --- | --- |
| `show_cue` | Show cue | `cue`: dropdown over **visible** catalog cues | `POST /api/command {action:'in', cue}` (`main.ts:341`) |
| `toggle_cue` | Toggle cue | `cue`: dropdown, visible cues | `in`, or `out` if it is already the requested cue (`toggleAction`, `client.ts:291-293`) |
| `animate_out` | Animate cue out | `cue`: dropdown, visible cues | `action:'out'` with that cue; server clears only if it matches |
| `animate_clear` | Animate out | none | `action:'clear'`, whatever is requested |
| `clear_now` | Clear now | none | `action:'cut'` — immediate, cancels animation, also removes the scan card |
| `refresh_catalog` | Refresh cue catalog | none | `#refreshCatalog()` with `operatorRequested=true` |
| `bug_on` | Bug on | none | `action:'bug'`, `{on:true, page:<whatever the snapshot already has>}` |
| `bug_off` | Bug off | none | `action:'bug'`, `{on:false, page:null}` |
| `set_page` | Set page | `page`: textinput, regex `^$|^[A-Za-z0-9 .,\-–]{1,12}$` | trims, validates locally, then `{on:true, page: page||null}` (`main.ts:305-316`) |
| `next_panel` | Next panel | `set`: dropdown of panel sets + `''` = "None" | step +1 within the live cue's set, wrap; else panel 01 of the chosen set; else nothing |
| `previous_panel` | Previous panel | same `set` dropdown | step −1, wrap |

Cue dropdowns for actions use `visibleCatalogCues()` only (`main.ts:334`), so a `hidden`
catalog entry can never be chosen by hand or reached by panel navigation (`main.ts:324`).
The default cue is `choices[0]?.id ?? FALLBACK_CUES[0].id`.

`#cueCommand` refuses a cue that is not in the current catalog and sets an
`UnknownWarning` status instead of sending (`main.ts:257-263`).

### 1.3 Feedbacks (4)

`#defineFeedbacks()`, `companion/src/main.ts:355-365`.

| Feedback id | Type | Options | What it means | Default style |
| --- | --- | --- | --- | --- |
| `requested` | boolean | `cue`: dropdown over **all** catalog cues **plus** `''` = "Clear" | the API accepted this as the desired state — explicitly *not* proof of rendering | bg `rgb(180,110,0)` amber, fg white |
| `rendered` | boolean | same dropdown | a connected graphics browser reports *this exact requested revision* settled. Explicitly *not* an on-air/tally signal | bg `rgb(0,130,70)` green, fg white |
| `bug_visible` | boolean | none | the live state carries a scan card (`snapshot.bug.on === true`) | bg `rgb(0,90,140)` blue, fg white |
| `disconnected` | boolean | none | realtime subscription closed **or** no renderer presence for 30 s, after a 3 s grace window | bg `rgb(175,0,0)` red, fg white |

Note the asymmetry: **feedback dropdowns include hidden cues, action dropdowns do not**
(`main.ts:356` uses `this.#catalog.cues`; `main.ts:334` uses `visibleCatalogCues`). This is
deliberate — an old button pointing at a now-hidden alias keeps lighting up.

### 1.4 Variables (10)

Declared in `init()` (`main.ts:83-94`), populated by `overlayVariables()`
(`companion/src/variables.ts:45-58`).

| Variable | Label | Value |
| --- | --- | --- |
| `current_name` | Current graphic | the catalog **name** of the rendered graphic; blank unless `rendered` is true |
| `current_panel` | Current panel | panel number parsed out of `current_name` (`<title> — NN of MM`, em dash U+2014); blank otherwise |
| `panel_count` | Panels | panel total from the same parse |
| `connection` | Connection | `Connected` / `Reconnecting` / `Disconnected` |
| `requested_name` | Requested graphic | catalog **name** of the requested cue, or `Clear` |
| `requested_cue` | Requested cue | **the same string as `requested_name`** — a name, not an id (`variables.ts:47-48`). The 1.3.0 name kept for compatibility; the label is misleading |
| `revision` | Requested revision | `snapshot.revision`, `0` when there is no snapshot |
| `renderer_status` | Renderer status | `Disconnected` / `Rendered` / `Requested` |
| `bug` | Scan card | `On` / `Off` |
| `bug_page` | Scan card page | the ≤12-char page, or blank |

There is **no** variable for the cue id, no variable for the catalog size, no variable for
a service or position in a service, and no per-cue variables.

### 1.5 Presets

`#definePresets()`, `main.ts:366-388`. One section, `crc_overlay_controls`, labelled
**CRC Overlay Controls**.

- **One preset per visible catalog cue**, id `show_<cueId>` (`cuePresetId`, `catalog.ts:57`).
  Despite the id it fires `toggle_cue`, not `show_cue`. Style: cue name, size `14`, white on
  `rgb(35,35,35)`. Feedbacks attached: `requested` (amber), `rendered` (green),
  `disconnected` (red).
- `animate_out` — text "Animate\nOut", bg `rgb(65,65,65)`; fires `animate_clear`; feedbacks
  `rendered {cue:''}` and `disconnected`.
- `clear_now` — text "CLEAR\nNOW", bg `rgb(120,0,0)`; fires `clear_now`.
- `bug` — text "Scan\ncard", two steps (`bug_on` then `bug_off`); feedback `bug_visible`.
- `next_panel` — text "Next\npanel"; fires `next_panel` with `set:''`.
- `connection_status` — text `$(<label>:connection)\n$(<label>:current_name)`; no actions.
- `current_panel` — text `$(<label>:current_panel) of $(<label>:panel_count)`; no actions.

**There is no `previous_panel` preset, no `set_page` preset and no `refresh_catalog`
preset** (verified: `previous_panel` appears only as an action, `main.ts:351`). The two
variable presets resolve `this.label` at definition time (`main.ts:383`), so they are
re-emitted whenever the catalog is refreshed but *not* when only the connection is renamed
— a rename without a catalog refresh leaves stale `$(oldname:…)` text in the preset
definitions (**inference** from the code path; the comment at `main.ts:381-382` claims they
are "redefined whenever the connection is renamed", which I could not verify happens).

### 1.6 Config fields (5)

`getConfigFields()`, `main.ts:125-133`.

| id | Type | Notes |
| --- | --- | --- |
| `baseUrl` | textinput, width 12 | default `https://overlays.centralreform.org`, regex `^https?://.+` |
| `pairingCode` | textinput, width 6 | regex `^$|^[0-9]{6}$`; cleared once redeemed |
| `deviceToken` | **secret-text**, width 6 | written by the module, never typed |
| `controlKey` | **secret-text**, width 12 | the older shared key |
| `meaning` | static-text, width 12 | the "Rendered means…" disclaimer |

Type split: `interface Config { baseUrl, pairingCode }` and
`interface Secrets { controlKey, deviceToken }` (`main.ts:21-22`) — tokens live in
Companion 5's secrets store, not in the exportable config.

### 1.7 Authentication

Two credentials, one precedence rule (`main.ts:139-142`):
`this.#credential = this.#controlKey || this.#deviceToken` — **the shared control key wins
whenever it is set**, so a pre-1.4.0 connection upgrades untouched. With neither, the
instance goes `BadConfig` and sends nothing (`main.ts:144-146`).

Pairing (`companion/src/pairing.ts`, driven from `configUpdated`, `main.ts:102-119`):

1. Operator pastes six digits into `pairingCode`.
2. `redeemPairingCode` normalises away spaces and dashes (`pairing.ts:23-25`), checks
   `/^\d{6}$/`, and `POST`s `{code}` to `<baseUrl>/api/pairing/redeem` with an 8 s abort
   timeout. **This is the only request the module makes with no credential**.
3. On success (`{token, name, kind}`) the token is validated against
   `/^[\x21-\x7e]{8,400}$/` (`pairing.ts:7`), then `saveConfig` writes
   `{...config, pairingCode:''}` and `{...secrets, deviceToken: token}`.
4. A refusal writes **nothing** — the previous credential survives and the refusal text
   becomes the connection status (`main.ts:113-117`). Verified by `pairing.test.ts:26`.

Every later request carries `Authorization: Bearer <credential>` (`client.ts:113`). Secrets
are scrubbed from every error string before it reaches the log or the status line
(`#safeError`, `main.ts:264-268`).

### 1.8 How it learns the catalog — push, not polling

**Verified: there is no polling loop anywhere in the module.** The catalog is refreshed on
exactly three triggers:

1. **At subscribe time**, when the first realtime `snapshot` arrives and its
   `catalogVersion` differs from the stored one (`main.ts:165`).
2. **On a realtime `catalog` event** carrying a new version string (`main.ts:174-177`).
3. **On the `refresh_catalog` action** (`main.ts:346`).

The fetch itself is `GET /api/catalog` with `Accept: application/json`, and the version is
read from the **`X-CRC-Catalog-Version` response header**, which must be present and ≤200
chars or the whole response is rejected as a non-retryable `ApiError` (`client.ts:85-91`).

`CatalogRefreshCoordinator` (`client.ts:132-163`) coalesces concurrent requests: one
in-flight load at a time, and it loops again if a newer version was requested while the
fetch was running. Every fetched catalog is validated field by field before it replaces the
live list (`catalog.ts:18-31`): ids must be a UUID **or** exactly `names:<collectionId>:<NN>`
(`catalog.ts:8-14`), names ≤80 chars with no control characters or angle brackets, layouts
match `^[a-z][a-z0-9_-]{0,39}$`, ids unique, array non-empty. **A failed validation throws
and the previous catalog is retained** (`main.ts:153`, `main.ts:248-252`).

The realtime transport (`RealtimeSubscription`, `client.ts:176-289`):
`GET /api/realtime?role=control` returns `{url, ticket, heartbeatMs, staleMs, protocol:1}`,
validated including a URL check that permits `wss:` anywhere but `ws:` only on
localhost/127.0.0.1/[::1] (`client.ts:364-371`). The socket opens with subprotocols
`['crc-overlays-v1', 'ticket.<ticket>']`; a negotiated protocol other than
`crc-overlays-v1` closes 1002. A `hello` frame reports `{id, client:'companion', version}`.
Heartbeats run at `heartbeatMs`; if `now - lastFrameAt >= staleMs` the socket closes 4000.
A first `snapshot` must arrive within `HANDSHAKE_TIMEOUT_MS` = 10 s or the socket closes
4001. Messages >256 KiB close 1009; unparseable JSON closes 1002.

Seeded fallback: three hard-coded cues (Barechu, Modeh Ani (Bottom), Mah Tovu) at
`main.ts:15-19`, used only so the dropdowns are never empty before the first catalog.

### 1.9 How it reports requested vs rendered

`deriveFeedback`, `client.ts:303-310`. The "unhealthy" condition is:

    no snapshot  OR  transport not connected  OR  no presence ever received
    OR  now - presenceReceivedAt >= 30_000  OR  snapshot.renderers.length === 0

If unhealthy: `rendered:false`, `renderedCue:null`, and `disconnected` is true only once
the 3 s grace window (`DISCONNECTED_GRACE_MS`, `main.ts:11`) has elapsed. Otherwise
"rendered" requires a renderer where **all three** hold:

    renderer.phase === 'settled'
    && renderer.revision === snapshot.revision
    && renderer.cue === snapshot.cue

`requested` is a plain string compare of the feedback's `cue` option against
`snapshot.cue ?? ''` (`main.ts:359`) — `''` matches the cleared state.

`current_name` is set to the requested name **only when `rendered` is true**, and blank
otherwise (`main.ts:289`), so `current_*` never claims something unproven. `renderer_status`
collapses this to one word (`variables.ts:57`).

Presence ages independently of snapshots: `#markPresence` restarts a 30 s timer that
re-publishes feedback when it fires (`main.ts:236-243`), so the buttons go red on their own
without a new frame.

### 1.10 What happens on disconnect

- `onConnection('disconnected', detail)` sets `#transportConnected = false`, logs the close
  code/reason as a warning, and sets `InstanceStatus.ConnectionFailure` (`main.ts:182-187`).
- **Commands are blocked while the transport is down**: `#command` returns early with
  "Realtime connection required before sending commands" and sends no HTTP at all
  (`main.ts:210-214`). This is a deliberate refusal, not a queue — a press during a
  reconnect is simply lost.
- Reconnect backoff is `[1s, 2s, 4s, 8s, 16s, 30s]`, capped at the last entry
  (`client.ts:69`, `client.ts:264-275`), with a fresh ticket each attempt.
- The red indicator waits 3 s (`#publishFeedback`, `main.ts:272-282`), and `connection`
  reads `Reconnecting` during that window (`variables.ts:27-30`).
- `destroy()` sets `#destroyed`, bumps `#generation`, drops the client and stops the
  subscription (`main.ts:98`). Every async callback checks
  `generation !== this.#generation || this.#destroyed` before touching state, so a delayed
  response from an old configuration can never land.
- `isNewerSnapshot` (`client.ts:312-314`) rejects a snapshot with a lower revision, so a
  delayed frame cannot roll the display backwards.

Command safety: each activation gets a `randomUUID()` command id and a monotonic sequence
seeded from `Date.now()*1000` (`client.ts:97-101`); retries reuse **both** (`client.ts:104-127`).
Retry policy: `retryDelays [150, 400]`, only for POST `/api/command`, and only on 5xx or a
timeout — a 4xx throws immediately. Request timeout 4 s.

### 1.11 Half-built, unused or inconsistent

All **verified** by reading the source:

- `OverlayClient.catalog()` (`client.ts:84`) is dead in production — only `catalogWithVersion`
  is called; `catalog()` appears solely in `tests/client.test.ts:40`.
- `CatalogStore.refresh()` (`catalog.ts:48-54`) is never called from `main.ts`; the module
  uses `CatalogRefreshCoordinator` + `CatalogStore.replace` instead. Only
  `tests/catalog.test.ts` exercises it.
- `FeedbackState.renderedCue` (`client.ts:9`) is computed but never read by any feedback,
  variable or preset.
- `OverlaySnapshot.cuePayload` (`client.ts:7`, `client.ts:339`) is parsed and carried but
  never used — the module never reads the cue's content, only its id and name.
- `RealtimeSubscription.#connected` (`client.ts:186, 240, 278`) is written in three places
  and read nowhere.
- `pong` frames are parsed (`client.ts:328`) but produce no handler call; they only refresh
  `lastFrameAt` as a side effect of any message arriving.
- `/api/command` accepts a `serviceRef` field (`app/api/command/route.ts:38`) — **the module
  never sends it.** `grep serviceRef companion/` returns nothing. So the cue log records
  Companion commands with `serviceRef: null` and cannot attribute a Companion press to a
  prepared service.
- `requested_cue` is documented as "Requested cue" but holds the same *name* string as
  `requested_name` (`variables.ts:47-48`). Nothing exposes the cue id.
- No `previous_panel` preset, no `set_page` preset, no `refresh_catalog` preset.
- README "Current limits" (`companion/README.md`) states the scope explicitly:
  *"CRC-first single-output operation only. Catalog refresh is explicit rather than
  periodic. Physical Stream Deck operation, broadcast tally, vMix/OBS integration, and
  failure rehearsal remain outside this milestone."*

Test coverage is substantial — 7 spec files, ~90 cases (`companion/tests/`) covering
ordering, retry identity, handshake deadlines, stale sockets, grace window, bug page
validation, panel navigation including hidden panels, pairing precedence and version
reporting. No tests touch presets beyond their existence.

---

## 2. WEB API INVENTORY

`lib/` is **not in this excerpt**, so `authorizeRequest`, `relayRequest`, `snapshot()`,
`catalog()`, `publicNow()` and `deviceStore` are read only through their call sites.

### 2.1 `POST /api/command` — the one write path

`app/api/command/route.ts`

- **Auth**: `authorizeRequest(r, 'control')` → 401 `{error:'Control key required'}`.
  A device token whose actor id starts with `device:` is logged as `source:'companion'`;
  anything else (member session, legacy shared key) is `source:'control'` (line 11).
- **Body** (≤4096 bytes, checked twice — `content-length` and the actual text, lines 12):
  `{action, cue?, bug?, commandId?, clientId?, sequence?, serviceRef?}`.
- `action` ∈ `in | out | clear | cut | bug` (line 16). For `in`/`out`, `cue` must be a
  string ≤160 chars; without a relay it must also exist in the catalog.
- `bug` requires `cue` absent/null, the workspace's `bug.enabled` true (else 400 *"The scan
  card is not set up for this congregation."*), `on` a boolean, a valid `page`, and a
  configured relay (else 503 *"The scan card needs the live connection."*) — lines 19-30.
- `commandId` must match `^[a-zA-Z0-9_-]{8,80}$`; `clientId` the same, and when present
  `sequence` must be a safe non-negative integer (lines 31-33).
- `serviceRef` is an optional UUID naming the prepared service (line 38).
- **Response**: the relay's JSON verbatim with its status, or on the legacy Postgres path
  `{commandId, ...snapshot()}`. Errors: 400 / 401 / 409 (*"Command ID already used for a
  different command"*) / 413 / 503.
- Idempotency and ordering are enforced in SQL on the legacy path (lines 43-59):
  `SELECT … FOR UPDATE` on the single state row, a `commands` table keyed by id, and a
  `controllers` table holding the last sequence per client so an out-of-order arrival is
  dropped.

**(a) Change the text of a graphic — NO.** This route selects a pre-published cue by id.
Nothing in it accepts text. Text lives in the authoring system (Neon drafts, published
revisions) and reaches the relay only through publication + `POST /api/live-catalog`.

### 2.2 `GET /api/catalog` — the ordered-ish cue list

`app/api/catalog/route.ts`

- **Auth**: `authorizeRequest(r, 'read')` → 401.
- **Response (default)**: a bare `Cue[]` JSON array, plus header
  **`X-CRC-Catalog-Version`**, `Cache-Control: no-store`.
- **`?include=liturgy`**: `{version, cues, liturgy: liturgyIndex(cues)}` — an additive,
  opt-in envelope (the D14 comment, lines 5-9). `lib/liturgy-index.ts` is not in this
  excerpt, so **what the liturgy index contains is unverified**.

**(b) Learn the ordered cue list for a service — PARTIALLY.** This is the whole approved
*library*, in catalog order, not a per-service running order. The only service-shaped thing
the module can see is the multipart naming convention `<title> — NN of MM` and the
`names:<collectionId>:<NN>` id namespace. A "prepared service" exists on the web side
(`/services`, `prepare_service_from_setlist` in `docs/MCP.md`) but **no route in this
excerpt exposes its ordered contents to an external client.**

### 2.3 `GET /api/state`

`app/api/state/route.ts` — three lines. `authorizeRequest(r,'read')` → 401
`{error:'Access key required'}`; otherwise `json(await snapshot())`, 503 on failure.
This is the legacy/polling shape; **the Companion module never calls it** (verified: no
`/api/state` in `companion/src`).

### 2.4 `GET /api/realtime?role=control|output|preview`

`app/api/realtime/route.ts`

- Unknown role → 400. Role `control` requires `'control'`; the others require `'read'`.
- `{freshDevice:true}` bypasses the positive device cache so a **revoked device is refused
  at its next reconnection** (lines 8-11).
- No relay configured → 503 *"Live relay is not configured. Rehearsal is disconnected."*
- Otherwise returns `relayConnection(role)` — the `{url, ticket, heartbeatMs, staleMs,
  protocol}` bootstrap.

**(c) Know what is on air right now — PARTIALLY, and carefully hedged.** The realtime
`snapshot` gives the *requested* cue plus `renderers[]` presence, from which the module
derives "rendered". Both the code and the docs say repeatedly this is browser render state,
**not** a switcher/program tally (`main.ts:131`, `main.ts:360`, `README.md`,
`docs/LIVE-ARCHITECTURE.md`).

**(d) Push events — YES, one way.** The relay pushes `snapshot`, `presence`, `catalog` and
`pong` over the WebSocket. There is **no webhook, no outbound callback, and no way for an
external service to push an event *into* the system** other than by calling
`POST /api/command` with a control credential.

### 2.5 `GET /api/now` — the public "what's on" feed

`app/api/now/route.ts`

- **No credential at all**, and **off by default**: 404 unless `OVERLAYS_PUBLIC_NOW=1`
  (line 25) — 404 rather than 403 so the endpoint does not advertise itself.
- **Any query string is refused** with the same 404 (line 26) so exactly one edge-cache key
  exists.
- 200 is `Cache-Control: public, max-age=2, s-maxage=2, stale-while-revalidate=10`;
  503 is `no-store`. CORS `Access-Control-Allow-Origin: *`.
- Body is `publicNow()` — **not in this excerpt**. The doc comment says it carries a
  `pollSeconds` hint of 5 s for the web siddur, and `docs/LIVE-ARCHITECTURE.md` describes a
  "forbidden-key posture" (no names, no text, no operator identity).

This is the closest thing to "(c) what's on air" for a public client.

### 2.6 `POST /api/live-catalog`

`app/api/live-catalog/route.ts` — `authorizeRequest(request,'author')` → 401; 503 if no
relay. On success `{synced:true, ...syncLiveCatalog()}`. Explicit recovery for a
publication saved while the relay was unreachable ("Sync live library" in the editor).

### 2.7 `GET`/`POST /api/devices`

`app/api/devices/route.ts`

- `GET`: `author` **and not a legacy shared-key actor** (line 22) → `{devices:[…]}`.
- `POST`: requires `sameSiteWrite` (403 *"Open this action from the same website."*), body
  ≤8192. Actions:
  - `pair_code` — `author`; `kind` must be `companion`; returns `{code, expiresAt}` 201.
  - `create_output` — `author`; returns `{url:'<origin>/output#device=<token>', credential}` 201.
  - `create_history_reader` — **owner**; returns `{token, credential}` 201. Cue-log read only.
  - `revoke` — **owner**; `{ok:true}`; also drops the per-instance verified-token cache
    (lines 67-73), with the real enforcement at the realtime route's fresh check.
- A legacy `CONTROL_KEY` actor is refused for every one of these (line 40) so a leaked
  shared key cannot mint permanent device credentials.
- `DeviceLimitError` → 409.

### 2.8 `POST /api/pairing/redeem`

`app/api/pairing/redeem/route.ts` — **credential-free by necessity**: the module sends no
`Origin`, so the same-site guard cannot apply. Protections instead: a per-address limiter
(`accessStore.allowAttempt('pairing:ip:…')` → 429 *"Please wait a minute before trying
again."*), body ≤1024, the code's own 10-minute expiry, single use and five-attempt cap.
Success: 201 `{token, name, kind}`. Refusal: 400 *"That pairing code has expired or was
already used. Ask for a new code."*

### 2.9 `GET /api/bug/qr.svg`

`app/api/bug/qr.svg/route.ts` — public, credential-free, `image/svg+xml`,
`Content-Security-Policy: default-src 'none'`,
`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`. 404 when the
workspace has no scan card configured. Encoded server-side from the workspace's configured
URL, so re-pointing the card is a config edit, not a graphics re-cut.

### 2.10 Referenced but not in this excerpt

`GET /api/history` (the cue log, ten permitted keys, described in
`docs/LIVE-ARCHITECTURE.md`), `/api/mcp` (OAuth, scope `crc.authoring`, tools listed in
`docs/MCP.md`), `/output`, `/setup`, `/access`, `/author`, `/services`, `/health`.

### 2.11 Summary against the four questions

| Capability | Today |
| --- | --- |
| **(a) change the text of a graphic** | **No.** No route accepts text. Text is authored in `/author` or MCP, published, then synced to the relay. |
| **(b) ordered cue list for a service** | **No** — only the whole library (`GET /api/catalog`), plus the `— NN of MM` naming convention and `names:<id>:<NN>` panels. Prepared services exist but are not exposed. |
| **(c) what is on air now** | **Requested + rendered-acknowledged**, over the realtime socket (authenticated) or `GET /api/now` (public, flag-gated, coarse). Never a program tally. |
| **(d) push events** | **Inbound only.** The relay pushes to subscribers; nothing pushes out to a third party. `POST /api/command` is the only way in. |

---

## 3. CONVERTER INVENTORY — `scripts/convert-companion-singular.mjs`

705 lines, Node 22, plain ESM, node built-ins only, marked *"One-off migration tool"*
(line 5). It was written against a **Companion 4.2.6** export and every structural
assumption in it is a Companion-4 assumption.

### 3.1 What it does, step by step

**Inputs** (`parseArgs`, lines 651-674): `--in`, `--catalog`, `--out`, `--report` all
required; optional `--label` (default `Overlays`), `--base-url` (default
`https://overlays.centralreform.org`), `--bug-names` (default `['CRC Logo']`, comma list),
`--new-page` (default `53`).

**Catalog map format** (`buildCatalogIndex`, lines 53-68). A JSON object keyed by Singular
composition name. Each value is either a bare cue-id string, or an object
`{cueId, aliasOf?, newButton?, status?, source?}`. Keys are indexed lower-cased and trimmed
(`normName`, line 46). `lookupCue` (70-76) tries the normalised name, then the hard-coded
`NAME_ALIASES` map — which today holds exactly one entry,
`'ahava rabbah ahavtanu (ncomplete)' → 'ahava rabbah ahavtanu (partial)'` (line 50), i.e. a
typo fix in Michael's Singular naming.

**Step 1 — read** (`readConfig`, 31-36). Sniffs the gzip magic `1f 8b` (`isGzip`, 27-29),
gunzips if needed, `JSON.parse`. The output is written back in the same form (38-42).

**Step 2 — find the Singular connections** (365-368). Any instance with
`instance_type === 'singularlive-studio' || moduleId === 'singularlive-studio'`. Note this
detection *does* handle both Companion 4 and 5 key names.

**Step 3 — create the new connection** (`buildConnection`, 84-104; called at 369-372). A
fresh 21-char nanoid-style id (`makeId`, 18-23) that does not collide, then a record with
`instance_type: 'crc-overlays'`, `sortOrder = max+1`, the given label, `isFirstInit:false`,
`config: {baseUrl, pairingCode:'', controlKey:''}`, `lastUpgradeIndex:-1`, `enabled:true`.
Optional keys are mirrored only if a sibling in the same file has them:
`moduleVersionId:'1.1.0'`, `updatePolicy:'stable'`, `secrets:{}`,
`moduleInstanceType:'connection'` (99-102). **The three Singular connections are left in
place and enabled** (stated in the report, line 550).

**Step 4 — walk every page, row, cell** (395-511). For each button it walks every step and
every action set, recursing into `action.children` for internal `action_group` /
`logic_if` wrappers (`convertActionArray`, 291-351).

**Step 5 — rewrite actions** (300-349), for actions whose `connectionId` is a Singular one:

| Singular action | Becomes | Options written |
| --- | --- | --- |
| `takeOutAllOutput` | `animate_clear` | `{}` (318-325) |
| `animateIn` on a `--bug-names` comp | `bug_on` | `{}` (320-329) |
| `animateOut` on a `--bug-names` comp | `bug_off` | `{}` |
| `animateIn` with a catalog hit | `show_cue` | `{cue: hit.cueId}` (331-342) |
| `animateOut` with a catalog hit | `animate_out` | `{cue: hit.cueId}` |
| anything else | **dropped entirely** (344-348) |

`connectionId` is repointed to the new connection each time. The action object is mutated
in place and re-emitted; dropped actions are simply not pushed.

**Step 6 — harvest a "house" style** (463-476), from the *first* converted prayer button
that gained at least one cue: `house.bgcolor = btn.style.bgcolor` (if it is a number and
not `0x333333`) and `house.bankCurrentStep` = a structured clone of that button's
`bank_current_step` feedback with its `id` deleted. Fallback `DEFAULT_HOUSE` (171-187):
bg `10027059` (= `#990033`, Michael's rose) and a `bank_current_step` feedback with options
`{location_target:'this', location_text:'$(this:page)/$(this:row)/$(this:column)',
location_expression:"concat(…)", step:2}` and `style:{color:16777215, bgcolor:16711680}`.

**Step 7 — add feedbacks** (478-491). For each cue gained in **step 0 `down` only**
(the gate at 436-445 reverts gains recorded anywhere else), push a `requested` feedback
(`{bgcolor:16711680, color:16777215}` red/white, line 108) and a `rendered` feedback
(`{bgcolor:65280, color:0}` green/black, line 109); if the bug was gained, push
`bug_visible` (`{bgcolor:16711680, color:16777215}`, line 110). They are `unshift`ed to the
**front** of `btn.feedbacks` (489).

**Step 8 — mark dead buttons** (493-500). Only when **every** Singular action on the button
was unmapped: append `' ⚠'` to `btn.style.text` (idempotently) and set
`btn.style.bgcolor = 0x333333`.

**Step 9 — aliases** (453-461, 585-595). When a catalog entry carries `aliasOf`, the button
keeps its own label but the report records `{name, aliasOf, buttons}` under
*"These buttons keep their old name but now show the surviving graphic."*

**Step 10 — new buttons** (`placeNewButtons`, 237-283; called 524-538). Every catalog entry
flagged `newButton`, de-duplicated by `cueId`, is placed on the **first page at or after
`--new-page` that has no non-navigation control** (`pageHasContent` / `isNavControl`,
131-144). Cells are taken in row-then-column order from `gridCells` (162-169, default grid
0-3 × 0-7). The chosen page is renamed to `'Overlays — part 2'` (`NEW_PAGE_NAME`, 127,
applied at 280). Entries that do not fit go into `result.skipped`. If no empty page is
found at or after the requested one, **nothing is placed at all** (260).

`makeNewButton` (189-231) emits a two-step latch button: step 0 `down` = `show_cue`,
step 1 `down` = `animate_out`; feedbacks `requested`, `rendered`, and the harvested
`bank_current_step`; style `{text: wrapLabel(name), textExpression:false, size:'14',
png64:null, alignment:'center:center', pngalignment:'center:center', color:16777215,
bgcolor: house.bgcolor, show_topbar:'default', png:null, latch:true}`.
`wrapLabel` (147-159) breaks a name >10 chars at the last space that fits, else splits the
word down the middle.

**Step 11 — report** (`buildReport`, 545-623 Markdown; `buildReportJson`, 625-647). The
Markdown has: Totals; New buttons (with a page/row/column table and a note if the page
moved); Aliased to another graphic; Unmapped compositions (buttons/actions/pages); Per-page
coverage with a mapped/total percentage; and a "Publish next" list of unmapped names sorted
by button count. `main` (676-701) writes `<report>.md` and `<report>.json` and prints a
five-line summary.

### 3.2 Every Companion-4 schema assumption, and what the v5 export actually contains

Verified against `michael-companion5-export.json` with `scratchpad/audit/an11.py`:

- every content control is `type: "button-layered"` (1,689 of them); there is **not one**
  `type: "button"` in the file;
- **0** layered buttons carry a flat `style.text` or `style.bgcolor`; all 1,689 carry
  `style.layers`;
- **5,484** action option values are `{value, isExpression}` objects and **0** are plain;
- **0** feedbacks carry a legacy `style` key; all 873 carry `styleOverrides`;
- **no** instance carries `instance_type`; all 16 carry `moduleId`.

| # | Line(s) | Assumption | What v5 has | Consequence |
| --- | --- | --- | --- | --- |
| **C1** | **308** `const comp = action.options?.comp` | `options.comp` is a plain string | `{"comp":{"value":"Hareini","isExpression":false}}` | **Catastrophic.** `normName(comp)` = `String({})` = `"[object object]"`. Every one of the 1,990 `animateIn`/`animateOut` actions misses the catalog, is counted unmapped and **deleted**; all ~902 prayer buttons are marked dead ⚠ and greyed. The report would claim 0 conversions and ~1 "unmapped composition" called `[object Object]`. |
| **C2** | **324, 335** `action.options = { cue: hit.cueId }` | action options are plain values | v5 requires `{cue:{value:'<id>',isExpression:false}}` | Even if C1 were fixed, the written option is unreadable by Companion 5; the cue reads as empty. |
| **C3** | **318, 323** `action.options = {}` | ditto, for no-option actions | v5 tolerates `{}` for genuinely optionless actions | Harmless. |
| **C4** | **112-122** `feedback()` returns `{…, style, isInverted:false}` | feedback styling is a flat `style:{color,bgcolor}` and `isInverted` is a bare boolean | v5: `styleOverrides:[{overrideId, elementId, elementProperty, override:{value,isExpression}}]`, `isInverted:{value,isExpression}`, `children:{}` | Every injected `requested` / `rendered` / `bug_visible` feedback renders **no colour at all**. The feedback still evaluates; the button just never changes. |
| **C5** | **108-110** `FB_REQUESTED_STYLE = {bgcolor:16711680, color:16777215}` etc. | same flat style shape | as C4 | Dead constants under v5. Also note `requested` is coloured **red**, which collides with Michael's own red `bank_current_step` step-2 override. |
| **C6** | **112-122** feedback `options` passed through raw (`{cue}` / `{}`) | plain option values | v5 wraps | `requested`/`rendered` feedbacks would carry an unreadable cue option. |
| **C7** | **183** `style: { color: 16777215, bgcolor: 16711680 }` inside `DEFAULT_HOUSE.bankCurrentStep` | flat feedback style | v5 `styleOverrides` with `elementId:'text0'`/`'box0'` and `elementProperty:'color'` | The fallback step-2 red indicator does nothing. (When harvesting succeeds the *cloned* v5 feedback is correct — see C15.) |
| **C8** | **176-182** `bank_current_step` options `location_target`, `location_text`, `location_expression`, `step:2` | Companion 4 option names | v5 uses exactly `{"step":{"value":2,"isExpression":false},"location":{"value":"$(this:location)","isExpression":false}}` — confirmed on all 694 of Michael's instances | The fallback feedback would not even resolve its own location. |
| **C9** | **192** `type: 'button'` in `makeNewButton` | v4 button type | v5 uses `button-layered` | Every generated new button is an unknown control type. |
| **C10** | **193-206** `style: {text, textExpression, size, png64, alignment, pngalignment, color, bgcolor, show_topbar, png, latch}` | flat v4 style block | v5 `style: {layers:[canvas, box0, image0, text0]}` where text lives at `layers[3].text.value` and background at `layers[1].color.value` | The button renders blank/default. Note `latch:true` is also a v4 concept; v5 uses `options.stepProgression:'auto'` (which the script *also* sets, line 207 — belt and braces from two different eras). |
| **C11** | **147-159** `wrapLabel(name, 10)` inserting a literal `\n` | v4 fixed-size text needed manual wrapping | v5 has `fontsize` + `fontsizeAllowShrink`; Michael uses `fontsize: 100` with shrink on for 491 of his buttons and lets Companion autosize | Generated labels would be hand-wrapped where the operator's own are not — a cosmetic mismatch even once C10 is fixed. |
| **C12** | **207** `options: {stepProgression, stepExpression, rotaryActions}` | v4 option set | v5 adds `canModifyStyleInApis` and `notes` on every button | Minor; Companion likely defaults them. |
| **C13** | **465-467** `typeof btn.style?.bgcolor === 'number'` (house harvest) | flat style | v5 has no `style.bgcolor` (**0 occurrences**) | `house.bgcolor` stays `null` forever → `DEFAULT_HOUSE.bgcolor` (`10027059` = `#990033`) is used for *every* generated button, discarding Michael's real per-category colouring. |
| **C14** | **496-499** dead-button marking writes `btn.style.text` and `btn.style.bgcolor` | flat style | layered | Adds two junk sibling keys next to `layers`. **The ⚠ warning the operator is meant to see never appears** — the very buttons most in need of the marker under C1. |
| **C15** | **468-474** harvesting `bank_current_step` from `btn.feedbacks` | v4 feedback object | it *does* find one (694 exist), but the clone carries v5 `styleOverrides` + v5 option shape | The clone is then embedded in a v4-shaped button (C9/C10) whose `elementId:'text0'`/`'box0'` targets do not exist. Mixed-era output. |
| **C16** | **91** `instance_type: NEW_MODULE`, and **no** `moduleId` | v4 instance key | all 16 v5 instances use `moduleId` (0 use `instance_type`) | The new connection imports as an unresolvable module. `moduleInstanceType:'connection'` *is* mirrored (102) but that is not the module identity. |
| **C17** | **99** `conn.moduleVersionId = '1.1.0'` | hard-coded | the module is **1.5.0** | Pins an ancient version that is not installed. |
| **C18** | **94** `config: {baseUrl, pairingCode:'', controlKey:''}` | v4 put everything in `config` | module 1.5.0 declares `controlKey` and `deviceToken` as `secret-text`, i.e. **secrets**, and `secrets: {}` is written empty at line 101 | `controlKey` lands in the wrong store. Compare `scripts/prepare-workspace-companion.mjs:66`, which correctly writes `instance.secrets = {controlKey:''}`. |
| **C19** | **89-103** no `collectionId` | v4 had no connection collections | v5 has `connectionCollections` with a group literally labelled **"Overlays"** (`id: xGoEHbt6nc8oevcexi8cC`) | The new connection lands ungrouped, outside the group that appears to have been made for it. |
| **C20** | **395** loop over `config.pages` only | v4 stored button actions only under pages | v5 also has top-level `triggers`, and `expressionVariables[*].localVariables`, and per-button `localVariables[]`, any of which can hold connection-scoped entities | In *this* export no trigger references a Singular connection (verified), so no data is lost today — but the converter would silently leave one behind if it existed. |
| **C21** | **31-36** no check of `version` / `type` | v4 exports had neither in this shape | v5 carries `version: 12`, `type: "full"`, `companionBuild` | The script will happily chew a format it cannot handle and produce a broken file with a confident-looking report. |
| **C22** | **249-266** `config.pages[pageId]`, `page.controls[r][c]`, `page.gridSize` | v4 page shape | v5 pages also carry `id` (a nanoid), used by `surfaces[*].groupConfig.startup_page_id` | Renaming page 53 at line 280 is fine, but nothing updates surface page references. Harmless here. |
| **C23** | **126** `NEW_PAGE_DEFAULT = 53` | assumed empty | **verified still correct**: pages `53`–`69`, `71`, `73`, `74` contain only `pageup`/`pagenum`/`pagedown` | The placement logic would work — if anything else did. |
| **C24** | **131-134** `NAV_TYPES = {pageup, pagedown, pagenum}` | v4 control types | **verified unchanged in v5** (99 `pageup`, 23 `pagenum`, 99 `pagedown`) | Correct. |
| **C25** | **162-169** default grid `{0..3, 0..7}` | v4 default | **verified**: every one of the 99 pages is `{minColumn:0, maxColumn:7, minRow:0, maxRow:3}` | Correct. |
| **C26** | **293-297** recursion into `action.children` | v4 `action_group` children | **verified correct in v5**: `action_group` uses `children.default`, `logic_if` uses `children.condition` / `children.actions` / `children.else_actions`; the generic `Object.keys` walk handles all of them | Correct. |
| **C27** | **436-445** feedback gains counted only from step `'0'` `'down'` | v4 step keys | **verified**: v5 still uses string step keys `'0'`, `'1'` and `action_sets.down` / `.up` | Correct. |
| **C28** | **300** `ctx.singularConnections.has(action.connectionId)` | — | **verified correct**; detection at 365-366 handles both key names | Correct. |

**Net verdict.** Run as-is against `michael-companion5-export.json` the converter would
delete all 1,990 Singular prayer actions, create ~902 buttons with no actions and no
visible warning, attach ~1,800 colourless feedbacks, add an unresolvable connection, and
emit a report claiming 0 successful conversions. The two blockers to fix first are **C1**
(unwrap `options.comp`) and **C2** (wrap written options); after those, **C4/C9/C10/C16**
determine whether anything is visible or importable.

A working precedent already exists in this repo: `scripts/prepare-workspace-companion.mjs`
lines 22-30 define `unwrapOption` / `setOption` that handle exactly the
`{value, isExpression}` wrapper the converter ignores.

---

## 4. OPERATOR EXPORT INVENTORY — `michael-companion5-export.json`

Companion `5.0.3+9703-stable-2daa0d7670`, export `version: 12`, `type: "full"`.
**99 pages**, **1,910 controls** = 1,689 `button-layered` + 99 `pageup` + 23 `pagenum` +
99 `pagedown`.

### 4.1 Connections (16)

Two collections: **Main** (`2CdGjTx9b7r20R3jjoJCr`) and **Overlays**
(`xGoEHbt6nc8oevcexi8cC`). All 16 are enabled.

| Label | Module | Role |
| --- | --- | --- |
| `Master_Composition__All_Overlays_` | `singularlive-studio` | the main graphics composition |
| `HHD` | `singularlive-studio` | High Holy Days composition |
| `Special` | `singularlive-studio` | per-service / one-off compositions |
| `vmix` | `studiocoast-vmix` | switcher |
| `obs` | `obs-studio` | streaming |
| `Center`, `Left`, `Free_Cam__dorothy_`, `Door_Cam__steve_`, `Black_Cam__bima_`, `Birddog` | `birddog-ptz` | six PTZ cameras |
| `BirdDog_NDI` | `birddog-converters` | NDI converters |
| `x32` | `behringer-x32` | audio desk |
| `reaper` | `cockos-reaper` | music recording |
| `Spotify_WIP`, `vlc` | `spotify-remote`, `videolan-vlc` | playback |

Singular action totals across the whole file:

| Connection | `animateIn` | `animateOut` | `takeOutAllOutput` |
| --- | ---: | ---: | ---: |
| `Master_Composition__All_Overlays_` | 733 | 740 | 4 |
| `HHD` | 196 | 194 | 0 |
| `Special` | 64 | 63 | 2 |
| **Total** | **993** | **997** | **6** |

`animateIn`/`animateOut` take exactly one option, `comp` (the composition name);
`takeOutAllOutput` takes none. **908 buttons** touch at least one Singular connection.

### 4.2 Per page — number, name, button count, connections used

Counts are `button-layered` controls (nav controls excluded). Connection counts are
action + feedback references, `internal` omitted.

| # | Name | Buttons | Connections used (references) |
| --- | --- | ---: | --- |
| 1 | 1 Home | 17 | vmix(10), x32(9), reaper(4), Door_Cam__steve_(2), Special(2), Master_Composition__All_Overlays_(2), HHD(1), Center(1), Left(1), Black_Cam__bima_(1) |
| 2 | Kab Shab 1 | 24 | Master_Composition__All_Overlays_(38), x32(9), Special(6), vmix(1) |
| 3 | Kab Shab 2 | 23 | Master_Composition__All_Overlays_(40), x32(9), vmix(1) |
| 4 | Kab Shab 3 | 25 | Master_Composition__All_Overlays_(44), x32(9), vmix(1) |
| 5 | Kab Shab 4 | 22 | Master_Composition__All_Overlays_(39), x32(9), vmix(1) |
| 6 | space | 21 | Master_Composition__All_Overlays_(32), x32(13), Special(2) |
| 7 | Shab Morn 1 | 25 | Master_Composition__All_Overlays_(42), x32(9), HHD(2), Special(2), vmix(1) |
| 8 | Shab Morn 2 | 20 | Master_Composition__All_Overlays_(34), x32(9), vmix(1) |
| 9 | Shab Morn 3 | 24 | Master_Composition__All_Overlays_(42), x32(9), vmix(1) |
| 10 | Shab Morn 4 | 19 | Master_Composition__All_Overlays_(30), x32(9), Special(2), vmix(1) |
| 11 | Shab Morn 5 | 22 | Master_Composition__All_Overlays_(44), x32(9), vmix(1) |
| 12 | BMitzvah 1 | 28 | Master_Composition__All_Overlays_(46), x32(9), Special(4), HHD(2), vmix(1) |
| 13 | BMitzvah 2 | 25 | Master_Composition__All_Overlays_(40), x32(9), Special(4), vmix(1) |
| 14 | BMitzvah 3 | 27 | Master_Composition__All_Overlays_(44), x32(9), Special(4), vmix(1) |
| 15 | BMitzvah 4 | 30 | Master_Composition__All_Overlays_(30), Special(24), x32(9), vmix(1) |
| 16 | BMitzvah 5 | 25 | Master_Composition__All_Overlays_(38), x32(18), Special(4), vmix(1) |
| 17 | BM Havdala | 19 | Master_Composition__All_Overlays_(28), x32(9), Special(4), vmix(1) |
| 18 | Funeral Cams | 30 | vmix(13), Left(9), Center(9), Door_Cam__steve_(9), Black_Cam__bima_(1) |
| 19 | Funerals | 22 | Master_Composition__All_Overlays_(20), x32(9), Special(8), Left(2), Black_Cam__bima_(1), Center(1), Door_Cam__steve_(1), vmix(1) |
| 20 | space | 7 | x32(15), Special(4) |
| 21 | Second Seder | 24 | Special(32), Master_Composition__All_Overlays_(14), vmix(4) |
| 22 | Space | 2 | HHD(2) |
| 23 | Tisha Bav | 14 | Master_Composition__All_Overlays_(20), x32(9), HHD(2) |
| 24 | Space | 1 | — |
| 25 | Slichot | 26 | HHD(36), Master_Composition__All_Overlays_(12), x32(9), Special(2) |
| 26 | Erev Rosh 1 | 26 | Master_Composition__All_Overlays_(24), HHD(22), x32(9), Special(2) |
| 27 | Erev Rosh 2 | 20 | HHD(18), Master_Composition__All_Overlays_(16), x32(9) |
| 28 | Erev Rosh 3 | 14 | Master_Composition__All_Overlays_(14), HHD(10), x32(9) |
| 29 | Rosh Hash 1 | 24 | Master_Composition__All_Overlays_(38), x32(9), HHD(8), Special(2) |
| 30 | Rosh Hash 2 | 28 | HHD(32), Master_Composition__All_Overlays_(20), x32(9) |
| 31 | Rosh Hash 3 | 29 | Master_Composition__All_Overlays_(28), HHD(24), x32(9) |
| 32 | RH day 2 | 19 | Master_Composition__All_Overlays_(26), x32(9), HHD(8), Special(2) |
| 33 | PAGE | 7 | x32(9), Master_Composition__All_Overlays_(8), HHD(2) |
| 34 | Kol Nidre 1 | 26 | Master_Composition__All_Overlays_(26), HHD(16), x32(9), Special(2) |
| 35 | Kol Nidre 2 | 28 | HHD(26), Master_Composition__All_Overlays_(22), x32(9) |
| 36 | Yom Kip 1 | 27 | Master_Composition__All_Overlays_(40), HHD(10), x32(9), Special(2) |
| 37 | Yom Kip 2 | 26 | HHD(34), Master_Composition__All_Overlays_(10), x32(9) |
| 38 | Yom Kip 3 | 25 | HHD(22), Master_Composition__All_Overlays_(22), x32(9) |
| 39 | Yikzor | 19 | Master_Composition__All_Overlays_(14), x32(9), Special(8), HHD(8) |
| 40 | Neilah 1 | 24 | Master_Composition__All_Overlays_(22), HHD(22), x32(9), Special(2) |
| 41 | Neilah 2 | 24 | Master_Composition__All_Overlays_(30), HHD(12), x32(9) |
| 42 | PAGE | 2 | — |
| 43 | right cam | 10 | Door_Cam__steve_(17) |
| 44 | left cam | 10 | Left(17) |
| 45 | HHD Special | 29 | HHD(52), Master_Composition__All_Overlays_(6) |
| 46 | HHD Beginning | 24 | Master_Composition__All_Overlays_(68), x32(24) |
| 47 | HHD Shema | 27 | Master_Composition__All_Overlays_(74), x32(24), HHD(1) |
| 48 | HHD Amidah | 23 | Master_Composition__All_Overlays_(60), x32(24), HHD(2) |
| 49 | HHD Torah | 24 | Master_Composition__All_Overlays_(74), x32(24) |
| 50 | HHD Closing | 29 | Master_Composition__All_Overlays_(66), x32(24), HHD(12) |
| 51 | Anytime | 16 | Master_Composition__All_Overlays_(24), HHD(4) |
| 52 | PAGE | 1 | — |
| 53 | PAGE | 0 | — |
| 54 | PAGE | 0 | — |
| 55 | PAGE | 0 | — |
| 56 | PAGE | 0 | — |
| 57 | PAGE | 0 | — |
| 58 | PAGE | 0 | — |
| 59 | PAGE | 0 | — |
| 60 | PAGE | 0 | — |
| 61 | PAGE | 0 | — |
| 62 | PAGE | 0 | — |
| 63 | PAGE | 0 | — |
| 64 | PAGE | 0 | — |
| 65 | PAGE | 0 | — |
| 66 | PAGE | 0 | — |
| 67 | PAGE | 0 | — |
| 68 | PAGE | 0 | — |
| 69 | PAGE | 0 | — |
| 70 | Page Map | 1 | — |
| 71 | PAGE | 0 | — |
| 72 | PAGE | 6 | vmix(6) |
| 73 | PAGE | 0 | — |
| 74 | PAGE | 0 | — |
| 75 | Daniel Self Production Buttons | 8 | x32(24), vmix(12), Door_Cam__steve_(2), Master_Composition__All_Overlays_(2) |
| 76 | Kab Shab 1 | 19 | Master_Composition__All_Overlays_(24), vmix(14), Left(3), Door_Cam__steve_(3), Center(2) |
| 77 | Kab Shab 2 | 15 | Master_Composition__All_Overlays_(20), vmix(16), Door_Cam__steve_(7), Center(6) |
| 78 | Kab Shab 3 | 11 | vmix(14), Master_Composition__All_Overlays_(12), Door_Cam__steve_(6), Center(5) |
| 79 | PAGE | 6 | x32(21), Master_Composition__All_Overlays_(2), Special(2), Left(2), Door_Cam__steve_(1), Center(1) |
| 80 | Rainbow 2 | 24 | vmix(13), Left(8), Center(8), Door_Cam__steve_(8), Black_Cam__bima_(1) |
| 81 | Rainbow | 30 | vmix(13), Left(9), Center(9), Door_Cam__steve_(9), Black_Cam__bima_(1) |
| 82 | Right Oneg | 30 | Door_Cam__steve_(25), vmix(11), Free_Cam__dorothy_(1), Center(1), Left(1), Black_Cam__bima_(1) |
| 83 | Media Player | 10 | vlc(15) |
| 84 | Shir Shabbat | 17 | Free_Cam__dorothy_(8), vmix(3), Door_Cam__steve_(1), Center(1) |
| 85 | Oneg | 29 | Center(12), Door_Cam__steve_(12), vmix(4) |
| 86 | Dorothy Spin | 29 | Free_Cam__dorothy_(24), vmix(10) |
| 87 | Adv CC | 26 | Center(9), Door_Cam__steve_(8), Left(3), Black_Cam__bima_(3), vmix(1) |
| 88 | Dorothy | 26 | vmix(25), Free_Cam__dorothy_(12), Center(1), Left(1), Door_Cam__steve_(1), Black_Cam__bima_(1) |
| 89 | Black | 30 | Black_Cam__bima_(25), vmix(12), Center(1), Left(1), Door_Cam__steve_(1) |
| 90 | Right | 30 | Door_Cam__steve_(30), vmix(13), Center(1), Left(1), Black_Cam__bima_(1) |
| 91 | Center | 30 | Center(33), vmix(13), Left(1), Door_Cam__steve_(1), Black_Cam__bima_(1) |
| 92 | Left | 30 | Left(25), vmix(12), Center(1), Door_Cam__steve_(1), Black_Cam__bima_(1) |
| 93 | Bmitzva+ | 25 | vmix(17), Door_Cam__steve_(7), Left(5), Black_Cam__bima_(5), Free_Cam__dorothy_(4), Center(3) |
| 94 | BMitzva Cams | 30 | vmix(13), Left(9), Center(9), Door_Cam__steve_(9), Black_Cam__bima_(1) |
| 95 | Torah Cams | 30 | vmix(13), Left(9), Center(9), Door_Cam__steve_(9), Black_Cam__bima_(1) |
| 96 | Morning Cams | 30 | vmix(13), Center(11), Left(9), Door_Cam__steve_(9), Black_Cam__bima_(1) |
| 97 | space | 27 | vmix(11), x32(9), Left(6), Center(4), Free_Cam__dorothy_(4), Black_Cam__bima_(4), Door_Cam__steve_(3) |
| 98 | Evening Cams | 30 | vmix(13), Left(9), Center(9), Door_Cam__steve_(9), Black_Cam__bima_(1) |
| 99 | AV Buttons | 27 | vmix(36), x32(20), Master_Composition__All_Overlays_(6), Special(3), obs(3), Free_Cam__dorothy_(2), Door_Cam__steve_(2), Black_Cam__bima_(1), Left(1) |

Page-name groupings: Shabbat evening 2–6, Shabbat morning 7–11, B'nei mitzvah 12–17,
funerals 18–19, Second Seder 21, Tisha B'Av 23, High Holy Days 25–50 (with 43/44 camera
pages and 45–50 a re-cut "HHD Beginning / Shema / Amidah / Torah / Closing / Special"
arrangement), "Anytime" 51, empty spares 53–69 + 71 + 73 + 74, "Page Map" 70, surface page
selector 72, "Daniel Self Production Buttons" 75, a **second Kabbalat Shabbat set 76–78**,
79 a startup spare, 80–98 camera/oneg/room pages, 99 "AV Buttons".

### 4.3 The typical prayer button

**676 of the 908 Singular buttons (74%) are exactly the canonical two-step toggle.** Shape,
taken from page 2 row 0 column 0 ("Hareini"):

```
type: "button-layered"
style.layers: [ canvas, box0 (color 10027059 = #990033), image0 (base64Image null),
                text0 (text "Hareini", color 16777215, fontsize 35.1,
                       fontsizeAllowShrink true, font "companion-sans",
                       halign/valign center, outlineColor 4278190080) ]
options: { stepProgression:"auto", stepExpression:"", rotaryActions:false,
           canModifyStyleInApis:true, notes:"" }
feedbacks: [ { definitionId:"bank_current_step", connectionId:"internal",
               options:{ step:{value:2}, location:{value:"$(this:location)"} },
               isInverted:{value:false},
               styleOverrides:[ {elementId:"text0", elementProperty:"color",
                                 override:{value:16777215}},
                                {elementId:"box0",  elementProperty:"color",
                                 override:{value:16711680}} ],
               children:{} } ]
steps: { "0": { action_sets: { down:[ animateIn  [Master…] {comp:{value:"Hareini"}} ], up:[] } },
         "1": { action_sets: { down:[ animateOut [Master…] {comp:{value:"Hareini"}} ], up:[] } } }
localVariables: []
```

Press once → step 0 fires `animateIn`, `stepProgression:"auto"` advances to step 1,
`bank_current_step {step:2}` goes true and the **box turns red `#ff0000` with white text**.
Press again → `animateOut`, back to step 1 (i.e. step index 0), colour returns to the
category background. The step is the operator's only on/off memory — there is no
confirmation from Singular.

All **694** `bank_current_step` feedbacks in the file use the identical pair of overrides
(`text0.color → 16777215`, `box0.color → 16711680`). Only **676 + 18 = 694** buttons carry
one; **214 Singular buttons carry no step feedback at all**, most notably the entire
pages 46–50 HHD re-cut, where the operator relies on step position alone.

### 4.4 Other button patterns involving the three Singular connections

Counted by shape `(steps, animateIn, animateOut, takeOutAllOutput, distinct comps,
Singular connections, has bank_current_step, drives other modules)`:

| Pattern | Count | Example |
| --- | ---: | --- |
| canonical 2-step, 1 comp, with step feedback | **676** | p2 r0c0 "Hareini" |
| canonical 2-step, 1 comp, **no** step feedback | **96** | p1 r3c6 "Toggle Logo" (CRC Logo) |
| 2-step, **2 comps in / 2 out**, no step feedback | **54** | p46 r0c1 "Ma Tovu": step0 `animateIn Mah Tovu` + `animateOut CRC Logo`; step1 `animateOut Mah Tovu` + `animateIn CRC Logo` |
| 2-step, 1 comp, also drives cameras/vMix | **20** | pages 76–78 (see below) |
| 2-step, 1 in / 2 out | **15** | p46 r0c2 "Birchot Hasha 1" — brings the logo down on entry but does not restore it |
| 2-step, 2 in / 1 out | **14** | p46 r2c2 "Birchot Hasha 3" — restores the logo on exit only |
| 2-step, 2 comps, 2 Singular connections, with step feedback | **11** | "Starting Soon" — `Starting Soon` on Master **and** `Start soon right` on Special, fired together |
| 1-step fire-and-forget with other modules | **3 + 3** | "Start HHD", "Push to Start/Stop Stream", "Start/Stop Stream" |
| 2-step, **3 comps** | **3** | p46 r1c3 "Yedid Nefesh", p49 r1c1 "Shalom Rav", p49 r2c1 "Od Yavo Shalom" |
| panic / `takeOutAllOutput` | **3** | see 4.4.4 |
| 3 in / 5 out, 3 comps, with waits | **1** | p11 r1c1 "Aleinu 2" |
| assorted one-offs | **9** | e.g. p23 "El Malei Rachamim" fires `El Mei Rachamim` in and `El Malei TRANSLIT` out |

**The "CRC Logo under-layer" idiom (pages 45–50).** On the HHD re-cut pages the CRC logo is
treated as a resting graphic: showing a prayer *takes the logo out*, and clearing the
prayer *brings the logo back*. Roughly 86 buttons do some version of this, and it is
inconsistently applied — some restore the logo, some do not (the 15-vs-14 split above).

#### 4.4.1 Buttons with `wait` actions (27)

All are combined camera/graphic or startup buttons. The dominant idiom, from
**pages 76–78** (the "second set" Kabbalat Shabbat pages, 20 buttons):

```
step0.down:  animateIn [Master] {comp:"Barechu"}
             recallPset [Door_Cam__steve_] {val:5}
             wait [internal] {time:1300}
             command [vmix] {"merge input=right cam 3&duration=1000"}
step1.down:  animateOut [Master] {comp:"Barechu"}
             recallPset [Center] {val:1}
             wait [internal] {time:1300}
             command [vmix] {"merge input=center cam 1&duration=1000"}
```

One press = show the prayer text, move a PTZ to a preset, wait 1.3 s for the move, then
dissolve the switcher to that camera. The reverse on the way out. **This is a single
operator gesture that spans graphics, camera and switcher**, and 1,300 ms is the hand-tuned
constant throughout. Other waits: 100/90/10/1900 ms on p1 "Security Cam", 200 ms on p1
"No Prod Start Stream", 1 ms and 20/30/120 ms in the p99 startup groups, 5 s in p1 "MUSIC REC".

#### 4.4.2 Buttons with `action_group` (7)

`p11 "Aleinu 2"`, `p75 "Push to Start Stream"`, `p79 "Start Up v2"`, `p99 "Start Up"`,
`p99 "Re connect"`, `p99 "Stop Stream"`, `p99 "Delay Stop Stream"`. Groups run
`execution_mode: "concurrent" | "sequential" | "inherit"`; `p99 "Start Up"` uses nine of
them, most `concurrent`, to disable-and-re-enable each connection (`instance_control`)
in parallel while a `sequential` group performs the audio and graphics take-down.

#### 4.4.3 Buttons that fire several compositions

106 buttons touch more than one composition. Families:

- **"Starting Soon"** (11 pages) — `Starting Soon` on `Master` + `Start soon right` on
  `Special`, in and out together. One is a lower third, one a side panel.
- **The logo pairing** on pages 45–50 (~86 buttons), above.
- **p29 "Starting Soon"** is the only three-connection button: `Starting Soon` (Master),
  `Start soon right` (Special) and `Money pls` (HHD).
- **p47 "Mi Chamocha (Friday)"** — `Mi Chamocha (Friday)` + `CRC Logo` (Master) +
  `HHD Logo` (HHD).
- **p11 "Aleinu 2"** — a three-panel walk: step 0 animates in `Aleinu 2`, waits, out
  `Aleinu 2` / in `Aleinu 3`, waits, out `Aleinu 3` / in `Aleinu 4`.
- **p5 "Aleinu 3"**, **p26 / p34 "Shehecheyanu"**, **p46 "Yedid Nefesh"**,
  **p49 "Shalom Rav" / "Od Yavo Shalom"**, **p37 "Massa"** (`Hertz` + `Massa`),
  **p23 "El Malei Rachamim"** (`El Mei Rachamim` in, `El Malei TRANSLIT` out — almost
  certainly a mistake).

#### 4.4.4 Buttons that combine camera + graphic

27 buttons. Pages 76–78 (20 of them) are the choreographed pattern in 4.4.1.
The rest are startup/shutdown macros:

- **p1 r0c3 "Start HHD"** — `recallPset Door_Cam__steve_ 5`, vMix `startstreaming`,
  `animateIn HHD {Money pls}`, vMix StartRecording + StartStreaming, then
  `button_pressrelease 99/2/1` and `99/2/4`.
- **p75 "Push to Start Stream" / "Push to Stop Stream"** — Daniel's self-production
  buttons; show/hide the `Siddurim` graphic plus camera, vMix and x32 work.
- **p99 r2c0 "Start Stream"**, **p99 r3c0 "Stop Stream"**, **p99 r3c1 "Delay Stop Stream"**.

#### 4.4.5 `takeOutAllOutput` panic buttons — only 3, and none is a bare panic

| Page | Button | What it does |
| --- | --- | --- |
| 99 r0c0 | **"Start Up"** | the big startup macro; inside a `sequential` group it does `animateOut Thank you`, x32 clear-solo/solo, then `takeOutAllOutput` on **Master** and on **Special**; a later `concurrent` group calls `takeOutAllOutput` on Master again — 3 calls |
| 99 r0c1 | **"Re connect"** | cycles every connection with `instance_control` and calls `takeOutAllOutput` on Master and Special — 2 calls |
| 79 r0c0 | **"Start Up v2"** | the spare-page copy; `animateOut Thank you` + one `takeOutAllOutput` |

So *"clear everything"* is only ever reached as part of a startup/reconnect sequence.
**There is no standalone red "panic" button in the whole export** — the closest thing an
operator has mid-service is pressing a lit prayer button again.

#### 4.4.6 Triggers referencing Singular — none

**Verified: zero.** All six triggers are camera-loop machinery (4.7).

### 4.5 Distinct Singular composition names — 283

The task brief expected ~284; the exact count of distinct `comp` values across all
1,990 `animateIn`/`animateOut` actions is **283**. Grouped by the page category in which
each name **first** appears (a name is listed once, under its earliest group; the full page
list follows each entry in `scratchpad/audit/compositions.txt`).

```
--- Shabbat evening (pages 2-6): 99 compositions ---
   Adon Olam 1  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 23 Tisha Bav, 32 RH day 2, 49 HHD Torah
   Adon Olam 2  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 23 Tisha Bav, 32 RH day 2, 49 HHD Torah
   Adon Olam 3  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5
   Adonai Sifatai  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 26 Erev Rosh 1, 29 Rosh Hash 1, 34 Kol Nidre 1, 36 Yom Kip 1, 40 Neilah 1, 48 HHD Amidah, 78 Kab Shab 3
   Ahavat Olam 1  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 13 BMitzvah 2
   Ahavat Olam 2  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 13 BMitzvah 2
   Aleinu 1  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 41 Neilah 2, 50 HHD Closing
   Aleinu 2  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 41 Neilah 2, 50 HHD Closing
   Aleinu 3  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 41 Neilah 2, 50 HHD Closing
   Aleinu 4  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 41 Neilah 2
   Am I Awake  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 7 Shab Morn 1, 12 BMitzvah 1, 47 HHD Shema
   Ana Bakoach  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Announcements  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 28 Erev Rosh 3, 31 Rosh Hash 3, 35 Kol Nidre 2, 38 Yom Kip 3, 41 Neilah 2, 50 HHD Closing
   As We Bless  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 7 Shab Morn 1, 12 BMitzvah 1, 47 HHD Shema
   Avodah  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 27 Erev Rosh 2, 48 HHD Amidah
   Awaken, Arise  [Master_Composition__All_Overlays_]  pages: 6 space
   Barcheinu  [Master_Composition__All_Overlays_]  pages: 6 space, 49 HHD Torah
   Barechu  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 7 Shab Morn 1, 12 BMitzvah 1, 26 Erev Rosh 1, 29 Rosh Hash 1, 32 RH day 2, 34 Kol Nidre 1, 36 Yom Kip 1, 47 HHD Shema, 77 Kab Shab 2
   Birkat Kohanim  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 17 BM Havdala, 21 Second Seder, 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 35 Kol Nidre 2, 38 Yom Kip 3, 41 Neilah 2, 50 HHD Closing, 51 Anytime
   Candle LIghting  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 76 Kab Shab 1
   CRC Logo  [Master_Composition__All_Overlays_]  pages: 1 1 Home, 5 Kab Shab 4, 19 Funerals, 21 Second Seder, 26 Erev Rosh 1, 34 Kol Nidre 1, 45 HHD Special, 46 HHD Beginning, 47 HHD Shema, 48 HHD Amidah, 49 HHD Torah, 50 HHD Closing
   El Na R'fa Na  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 10 Shab Morn 4, 15 BMitzvah 4, 50 HHD Closing
   Hallelu 1  [Master_Composition__All_Overlays_]  pages: 6 space, 46 HHD Beginning
   Hallelu 2  [Master_Composition__All_Overlays_]  pages: 6 space, 46 HHD Beginning
   Hallelu 3  [Master_Composition__All_Overlays_]  pages: 6 space, 46 HHD Beginning
   Hareini  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 7 Shab Morn 1, 12 BMitzvah 1, 46 HHD Beginning, 76 Kab Shab 1
   Hashkiveinu (Daniel)  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 13 BMitzvah 2
   Hashkiveinu (Jim)  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3
   Hashkiveinu (plain)  [Master_Composition__All_Overlays_]  pages: 6 space, 48 HHD Amidah, 77 Kab Shab 2
   Hashkiveinu (Randy)  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 13 BMitzvah 2, 48 HHD Amidah, 49 HHD Torah, 51 Anytime
   Hinei Ma Tov  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 7 Shab Morn 1, 12 BMitzvah 1, 21 Second Seder, 29 Rosh Hash 1, 46 HHD Beginning
   Hoda-Ah  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 35 Kol Nidre 2, 48 HHD Amidah, 49 HHD Torah
   Hodu  [Master_Composition__All_Overlays_]  pages: 6 space, 46 HHD Beginning
   House of Prayer  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 46 HHD Beginning
   How Awesome / Shema  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 47 HHD Shema
   Jim Mi Sheb  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 10 Shab Morn 4
   Kiddush (long)  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 41 Neilah 2
   Kiddush (short)  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 31 Rosh Hash 3, 41 Neilah 2, 50 HHD Closing
   L'cha Dodi 1  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 76 Kab Shab 1
   L'cha Dodi 2  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 76 Kab Shab 1
   L'cha Dodi 3  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 76 Kab Shab 1
   L'cha Dodi 4  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 76 Kab Shab 1
   Lev Tahor  [Master_Composition__All_Overlays_]  pages: 6 space, 46 HHD Beginning
   Light These Lights  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 26 Erev Rosh 1
   Maariv Arevim (Evening)  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 13 BMitzvah 2, 17 BM Havdala
   Maariv Arevim (Roll into Dark)  [Master_Composition__All_Overlays_]  pages: 6 space, 13 BMitzvah 2, 17 BM Havdala
   Maariv Arevim 1  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 13 BMitzvah 2, 17 BM Havdala
   Maariv Arevim 2  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 13 BMitzvah 2, 17 BM Havdala
   Mi Chamocha (Friday) 1  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 26 Erev Rosh 1, 77 Kab Shab 2
   Mi Chamocha (Friday) 2  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 13 BMitzvah 2, 77 Kab Shab 2
   Mi Chamocha (short)  [Master_Composition__All_Overlays_]  pages: 6 space
   Mi Sheberach  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 10 Shab Morn 4, 15 BMitzvah 4, 23 Tisha Bav, 31 Rosh Hash 3, 38 Yom Kip 3, 50 HHD Closing, 78 Kab Shab 3
   Mizmor L'David  [Special]  pages: 2 Kab Shab 1
   Motzi  [Master_Composition__All_Overlays_/Special]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 21 Second Seder, 28 Erev Rosh 3, 31 Rosh Hash 3, 41 Neilah 2, 50 HHD Closing
   Mourners Kaddish 1  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 19 Funerals, 23 Tisha Bav, 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 33 PAGE, 35 Kol Nidre 2, 39 Yikzor, 50 HHD Closing, 51 Anytime
   Mourners Kaddish 2  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 19 Funerals, 23 Tisha Bav, 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 33 PAGE, 35 Kol Nidre 2, 39 Yikzor, 50 HHD Closing, 51 Anytime
   Mourners Kaddish 3  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 19 Funerals, 23 Tisha Bav, 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 33 PAGE, 35 Kol Nidre 2, 39 Yikzor, 50 HHD Closing, 51 Anytime
   Od Yavo Shalom  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 49 HHD Torah
   Olam Chesed Yibaneh  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 40 Neilah 1, 49 HHD Torah
   One Love  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2
   Or Zarua  [Special]  pages: 2 Kab Shab 1
   Oseh Shalom  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 5 Kab Shab 4, 9 Shab Morn 3, 11 Shab Morn 5, 14 BMitzvah 3, 16 BMitzvah 5, 19 Funerals, 21 Second Seder, 23 Tisha Bav, 27 Erev Rosh 2, 30 Rosh Hash 2, 35 Kol Nidre 2, 49 HHD Torah, 50 HHD Closing, 78 Kab Shab 3
   Ozi vzimrat  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Psalm-ish 1  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 7 Shab Morn 1
   Psalm-ish 2  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 7 Shab Morn 1
   Readers Kaddish 1  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 7 Shab Morn 1, 12 BMitzvah 1, 26 Erev Rosh 1, 29 Rosh Hash 1, 34 Kol Nidre 1, 36 Yom Kip 1, 40 Neilah 1, 47 HHD Shema
   Readers Kaddish 2  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 7 Shab Morn 1, 12 BMitzvah 1, 26 Erev Rosh 1, 29 Rosh Hash 1, 34 Kol Nidre 1, 36 Yom Kip 1, 40 Neilah 1, 47 HHD Shema
   Refa Tziri 1  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 10 Shab Morn 4
   Refa Tziri 2  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 10 Shab Morn 4
   Sanctuary/Adonai Sifatai  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 48 HHD Amidah
   Send Healing Names  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 10 Shab Morn 4, 15 BMitzvah 4, 50 HHD Closing
   Send Kaddish Names  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 50 HHD Closing
   Shalom Alechem small  [Special]  pages: 6 space
   Shalom Aleichem 2  [Master_Composition__All_Overlays_]  pages: 6 space, 76 Kab Shab 1
   Shalom Aleichem 3  [Master_Composition__All_Overlays_]  pages: 6 space, 76 Kab Shab 1
   Shalom Aleichem 4  [Master_Composition__All_Overlays_]  pages: 6 space, 76 Kab Shab 1
   Shalom Aleichem all  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Shalom Rav  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 14 BMitzvah 3, 27 Erev Rosh 2, 49 HHD Torah, 78 Kab Shab 3
   Shehechiyanu  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 15 BMitzvah 4, 26 Erev Rosh 1, 31 Rosh Hash 3, 34 Kol Nidre 1, 46 HHD Beginning, 49 HHD Torah, 51 Anytime
   Shema  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 13 BMitzvah 2, 26 Erev Rosh 1, 29 Rosh Hash 1, 32 RH day 2, 34 Kol Nidre 1, 36 Yom Kip 1, 47 HHD Shema, 77 Kab Shab 2
   Shiru La'Donai 1  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Shiru La'Donai 2  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Silent Prayer  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3, 15 BMitzvah 4, 27 Erev Rosh 2, 30 Rosh Hash 2, 35 Kol Nidre 2, 37 Yom Kip 2, 40 Neilah 1, 48 HHD Amidah, 78 Kab Shab 3
   Siyahamba  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 13 BMitzvah 2, 47 HHD Shema, 77 Kab Shab 2
   Start soon right  [Special]  pages: 2 Kab Shab 1, 7 Shab Morn 1, 12 BMitzvah 1, 19 Funerals, 21 Second Seder, 25 Slichot, 26 Erev Rosh 1, 29 Rosh Hash 1, 32 RH day 2, 34 Kol Nidre 1, 36 Yom Kip 1, 39 Yikzor, 40 Neilah 1, 99 AV Buttons
   Starting Soon  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 7 Shab Morn 1, 12 BMitzvah 1, 19 Funerals, 21 Second Seder, 25 Slichot, 26 Erev Rosh 1, 29 Rosh Hash 1, 32 RH day 2, 34 Kol Nidre 1, 36 Yom Kip 1, 39 Yikzor, 40 Neilah 1
   Thank you  [Master_Composition__All_Overlays_]  pages: 5 Kab Shab 4, 11 Shab Morn 5, 16 BMitzvah 5, 17 BM Havdala, 21 Second Seder, 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 33 PAGE, 35 Kol Nidre 2, 38 Yom Kip 3, 41 Neilah 2, 50 HHD Closing, 79 PAGE, 99 AV Buttons
   Thou Shalt Love  [Master_Composition__All_Overlays_]  pages: 6 space, 47 HHD Shema
   Thou Shalt Love 2  [Master_Composition__All_Overlays_]  pages: 6 space, 47 HHD Shema
   Vahavta 1  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 13 BMitzvah 2, 26 Erev Rosh 1, 29 Rosh Hash 1, 34 Kol Nidre 1, 36 Yom Kip 1
   Vahavta 2  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 13 BMitzvah 2, 26 Erev Rosh 1, 29 Rosh Hash 1, 34 Kol Nidre 1, 36 Yom Kip 1
   Vshamru  [Master_Composition__All_Overlays_]  pages: 4 Kab Shab 3, 9 Shab Morn 3, 14 BMitzvah 3
   We Are Loved 1  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 13 BMitzvah 2, 47 HHD Shema
   We Are Loved 2  [Master_Composition__All_Overlays_]  pages: 3 Kab Shab 2, 8 Shab Morn 2, 13 BMitzvah 2, 47 HHD Shema
   Yedid Nefesh  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1, 46 HHD Beginning
   Yihyu  [HHD/Master_Composition__All_Overlays_]  pages: 6 space, 27 Erev Rosh 2, 30 Rosh Hash 2, 35 Kol Nidre 2, 45 HHD Special, 48 HHD Amidah, 49 HHD Torah
   Yom Zeh lYisrael  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Yom Zeh lYisrael 2  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1
   Yom Zeh lYisrael 3  [Master_Composition__All_Overlays_]  pages: 2 Kab Shab 1

--- Shabbat morning (7-11): 44 compositions ---
   Ahava Rabbah Ahavtanu (ncomplete)  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 13 BMitzvah 2, 29 Rosh Hash 1, 36 Yom Kip 1
   Ahavah Raba (short)  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 13 BMitzvah 2, 47 HHD Shema
   Aliyah Blessing AFTER  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 31 Rosh Hash 3, 38 Yom Kip 3, 49 HHD Torah, 51 Anytime
   Aliyah Blessing BEFORE  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 31 Rosh Hash 3, 38 Yom Kip 3, 49 HHD Torah, 51 Anytime
   Avot 1  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 27 Erev Rosh 2, 30 Rosh Hash 2, 34 Kol Nidre 1, 36 Yom Kip 1, 40 Neilah 1, 48 HHD Amidah
   Avot 2  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 27 Erev Rosh 2, 30 Rosh Hash 2, 34 Kol Nidre 1, 36 Yom Kip 1, 40 Neilah 1, 48 HHD Amidah
   Avot interp 1  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3
   Avot interp 2  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3
   Birchot Hashachar 1  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1, 36 Yom Kip 1, 46 HHD Beginning
   Birchot Hashachar 2  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1, 36 Yom Kip 1, 46 HHD Beginning
   Birchot Hashachar 3  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1, 36 Yom Kip 1, 46 HHD Beginning
   Birchot Hashachar 4  [HHD/Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1, 36 Yom Kip 1
   Eitz Chayim  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 31 Rosh Hash 3, 38 Yom Kip 3, 50 HHD Closing
   Elohai Nshama  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 32 RH day 2
   Esah Einai  [HHD]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 26 Erev Rosh 1, 39 Yikzor
   Gevurot 1  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 27 Erev Rosh 2, 30 Rosh Hash 2, 35 Kol Nidre 2, 36 Yom Kip 1, 48 HHD Amidah
   Gevurot 2  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 27 Erev Rosh 2, 30 Rosh Hash 2, 35 Kol Nidre 2, 36 Yom Kip 1, 48 HHD Amidah
   Gevurot Trans  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3
   Guest Name  [Special]  pages: 1 1 Home, 10 Shab Morn 4
   Haftarah Blessing AFTER 1  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 38 Yom Kip 3, 49 HHD Torah
   Haftarah Blessing AFTER 2  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 38 Yom Kip 3, 49 HHD Torah
   Haftarah Blessing AFTER 3  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 38 Yom Kip 3
   Haftarah Blessing BEFORE  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 38 Yom Kip 3, 49 HHD Torah
   Hagbahah  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4
   Kedusha 1  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 30 Rosh Hash 2, 32 RH day 2, 37 Yom Kip 2, 40 Neilah 1
   Kedusha 2  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 30 Rosh Hash 2, 32 RH day 2, 37 Yom Kip 2, 40 Neilah 1
   Kedusha 3  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 30 Rosh Hash 2, 32 RH day 2, 37 Yom Kip 2, 40 Neilah 1
   Mah Tovu  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1, 32 RH day 2, 36 Yom Kip 1, 46 HHD Beginning, 76 Kab Shab 1
   Mazel Tov  [Master_Composition__All_Overlays_]  pages: 11 Shab Morn 5, 16 BMitzvah 5, 51 Anytime
   Mi Chamocha (Sat 1)  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 13 BMitzvah 2, 29 Rosh Hash 1, 32 RH day 2, 34 Kol Nidre 1, 36 Yom Kip 1, 47 HHD Shema
   Mi Chamocha (Sat 2)  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 13 BMitzvah 2, 29 Rosh Hash 1, 32 RH day 2, 36 Yom Kip 1, 47 HHD Shema
   Modeh Ani (Bottom)  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1, 32 RH day 2, 36 Yom Kip 1, 46 HHD Beginning
   Modim Anachnu Lach  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3
   Psalm 150  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1
   Psukei DZimrah 1  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1
   Psukei DZimrah 2  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 29 Rosh Hash 1
   Sim Shalom  [Master_Composition__All_Overlays_]  pages: 9 Shab Morn 3, 14 BMitzvah 3, 30 Rosh Hash 2, 49 HHD Torah
   Tallit Blessing  [Master_Composition__All_Overlays_]  pages: 7 Shab Morn 1, 12 BMitzvah 1, 46 HHD Beginning
   Torah Shema  [Master_Composition__All_Overlays_]  pages: 10 Shab Morn 4, 15 BMitzvah 4, 31 Rosh Hash 3, 37 Yom Kip 2, 49 HHD Torah, 51 Anytime
   Yotzer Or (short)  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 12 BMitzvah 1, 47 HHD Shema
   Yotzer Or 1  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 12 BMitzvah 1, 47 HHD Shema
   Yotzer Or 2  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 12 BMitzvah 1, 47 HHD Shema
   Yotzer Or Interp 1  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 12 BMitzvah 1
   Yotzer Or Interp 2  [Master_Composition__All_Overlays_]  pages: 8 Shab Morn 2, 12 BMitzvah 1

--- B'nei mitzvah (12-17): 24 compositions ---
   Avodah Trans  [Master_Composition__All_Overlays_]  pages: 14 BMitzvah 3
   Be Right Back  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala, 19 Funerals, 21 Second Seder, 23 Tisha Bav, 39 Yikzor, 46 HHD Beginning, 48 HHD Amidah, 49 HHD Torah, 50 HHD Closing, 51 Anytime, 76 Kab Shab 1, 77 Kab Shab 2, 78 Kab Shab 3
   Eliyahu Hanavi  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala, 41 Neilah 2
   Haftarah Reading 1  [Special]  pages: 15 BMitzvah 4
   Haftarah Reading 2  [Special]  pages: 15 BMitzvah 4
   Haftarah Reading 3  [Special]  pages: 15 BMitzvah 4
   Havd 1  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala, 41 Neilah 2
   Havd 2  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala, 41 Neilah 2
   Havd 3  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala, 41 Neilah 2
   Havd 4  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala, 41 Neilah 2
   Miryam Han'viah  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala
   Passing the Torah  [Master_Composition__All_Overlays_]  pages: 15 BMitzvah 4
   Shavua Tov  [Master_Composition__All_Overlays_]  pages: 17 BM Havdala
   Student Name  [Special]  pages: 12 BMitzvah 1, 13 BMitzvah 2, 14 BMitzvah 3, 15 BMitzvah 4, 16 BMitzvah 5, 17 BM Havdala
   Student Name 2  [Special]  pages: 15 BMitzvah 4
   Torah Reading 1  [Special]  pages: 15 BMitzvah 4
   Torah Reading 2  [Special]  pages: 15 BMitzvah 4
   Torah Reading 3  [Special]  pages: 15 BMitzvah 4
   Torah Reading 4  [Special]  pages: 15 BMitzvah 4
   Torah Reading 5  [Special]  pages: 15 BMitzvah 4
   Torah Reading 6  [Special]  pages: 15 BMitzvah 4
   Torah Reading 7  [Special]  pages: 15 BMitzvah 4
   Two Line Student Names  [Special]  pages: 13 BMitzvah 2, 14 BMitzvah 3, 16 BMitzvah 5, 17 BM Havdala
   Vahavta trans  [Master_Composition__All_Overlays_]  pages: 13 BMitzvah 2

--- Funerals (18-19): 6 compositions ---
   El Malei TRANSLIT  [Master_Composition__All_Overlays_]  pages: 19 Funerals, 23 Tisha Bav, 39 Yikzor
   El Mei Rachamim  [Master_Composition__All_Overlays_]  pages: 19 Funerals, 23 Tisha Bav
   psalm 23  [Master_Composition__All_Overlays_]  pages: 19 Funerals, 39 Yikzor
   Remember Them 1  [Special]  pages: 19 Funerals, 39 Yikzor
   Remember Them 2  [Special]  pages: 19 Funerals, 39 Yikzor
   Remember Them 3  [Special]  pages: 19 Funerals, 39 Yikzor

--- space 20: 2 compositions ---
   Chanukah 1  [Special]  pages: 20 space
   Chanukah 2  [Special]  pages: 20 space

--- Seder (21): 14 compositions ---
   Avadim Hayinu  [Special]  pages: 21 Second Seder
   Birkat Hamazon  [Special]  pages: 21 Second Seder
   Dayenu  [Special]  pages: 21 Second Seder
   Eliyahu  [Special]  pages: 21 Second Seder
   In Every Gen 1  [Special]  pages: 21 Second Seder
   In Every Gen 2  [Special]  pages: 21 Second Seder
   Karpas  [Special]  pages: 21 Second Seder
   Kol Hanshemah  [Special]  pages: 21 Second Seder
   Matzah Blessing  [Special]  pages: 21 Second Seder
   Plagues  [Special]  pages: 21 Second Seder
   shehecheyanu  [Special]  pages: 21 Second Seder
   Wine Blessing  [Special]  pages: 21 Second Seder
   Yachatz  [Special]  pages: 21 Second Seder
   Yom Tov Candles  [HHD/Special]  pages: 21 Second Seder, 45 HHD Special

--- 22: 1 compositions ---
   Avinu Malkeinu Short  [HHD]  pages: 22 Space, 30 Rosh Hash 2, 37 Yom Kip 2

--- Tisha B'Av (23): 1 compositions ---
   May the Memory  [HHD]  pages: 23 Tisha Bav, 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 35 Kol Nidre 2, 39 Yikzor, 45 HHD Special, 50 HHD Closing, 51 Anytime

--- 24: 0 compositions ---

--- HHD (25-50): 88 compositions ---
   13 Attributes  [HHD]  pages: 37 Yom Kip 2, 45 HHD Special
   Ahavah Rabbah Ahavtanu  [Master_Composition__All_Overlays_]  pages: 47 HHD Shema
   Al Cheit Refrain  [HHD]  pages: 37 Yom Kip 2, 45 HHD Special
   aleinu bot 1  [HHD]  pages: 25 Slichot, 27 Erev Rosh 2, 31 Rosh Hash 3, 35 Kol Nidre 2, 50 HHD Closing
   aleinu bot 2  [HHD]  pages: 25 Slichot, 27 Erev Rosh 2, 31 Rosh Hash 3, 35 Kol Nidre 2, 50 HHD Closing
   Alter  [HHD]  pages: 31 Rosh Hash 3
   Ashamnu  [HHD]  pages: 41 Neilah 2, 45 HHD Special
   Avinu Malkeinu 1  [HHD]  pages: 25 Slichot, 27 Erev Rosh 2, 32 RH day 2, 35 Kol Nidre 2, 40 Neilah 1, 45 HHD Special
   Avinu Malkeinu 2  [HHD]  pages: 25 Slichot, 27 Erev Rosh 2, 32 RH day 2, 35 Kol Nidre 2, 40 Neilah 1, 45 HHD Special
   B'rosh Hashanah  [HHD]  pages: 30 Rosh Hash 2
   Benediction  [HHD]  pages: 28 Erev Rosh 3, 31 Rosh Hash 3, 41 Neilah 2
   Bennetts  [HHD]  pages: 30 Rosh Hash 2
   Bsefer Chayim  [HHD]  pages: 25 Slichot, 27 Erev Rosh 2, 35 Kol Nidre 2, 40 Neilah 1, 45 HHD Special
   Candle Lighting RH  [HHD]  pages: 26 Erev Rosh 1
   Candle Lighting YK  [HHD]  pages: 34 Kol Nidre 1
   El Malei Rachamim  [HHD]  pages: 39 Yikzor, 45 HHD Special
   Elohai Neshama  [Master_Composition__All_Overlays_]  pages: 46 HHD Beginning
   Exec Committee  [HHD]  pages: 26 Erev Rosh 1
   Festival Kiddsuh  [HHD]  pages: 28 Erev Rosh 3, 50 HHD Closing
   Garden  [HHD]  pages: 37 Yom Kip 2
   Gilbert  [HHD]  pages: 27 Erev Rosh 2
   Goldman  [HHD]  pages: 38 Yom Kip 3
   Good Year  [HHD]  pages: 28 Erev Rosh 3, 31 Rosh Hash 3, 41 Neilah 2
   Harris  [HHD]  pages: 29 Rosh Hash 1
   Hashiveinu  [HHD]  pages: 25 Slichot, 32 RH day 2, 36 Yom Kip 1, 40 Neilah 1
   Hashkiveinu HHD 1  [HHD]  pages: 26 Erev Rosh 1, 34 Kol Nidre 1, 40 Neilah 1
   Hashkiveinu HHD 2  [HHD]  pages: 26 Erev Rosh 1, 34 Kol Nidre 1, 40 Neilah 1
   Hayom  [HHD]  pages: 38 Yom Kip 3, 45 HHD Special
   Hayom 2  [HHD]  pages: 38 Yom Kip 3
   Hertz  [HHD]  pages: 37 Yom Kip 2
   HHD Benediction  [HHD]  pages: 50 HHD Closing
   HHD Logo  [HHD]  pages: 47 HHD Shema
   If It Be Your Will 1  [HHD]  pages: 40 Neilah 1, 45 HHD Special
   If It Be Your Will 2  [HHD]  pages: 40 Neilah 1, 45 HHD Special
   Keddusha 1  [Master_Composition__All_Overlays_]  pages: 48 HHD Amidah
   Keddusha 2  [Master_Composition__All_Overlays_]  pages: 48 HHD Amidah
   Keddusha 3  [Master_Composition__All_Overlays_]  pages: 48 HHD Amidah
   Ki Anu Amecha 1  [HHD]  pages: 25 Slichot
   Ki Anu Amecha 2  [HHD]  pages: 25 Slichot
   Kol Nidre  [HHD]  pages: 34 Kol Nidre 1, 45 HHD Special
   Lazaroff Hanes  [HHD]  pages: 38 Yom Kip 3
   Levy  [HHD]  pages: 30 Rosh Hash 2
   Massa  [HHD]  pages: 37 Yom Kip 2
   May the Doors  [HHD]  pages: 25 Slichot, 26 Erev Rosh 1, 45 HHD Special
   Mi Chamocha (Friday)  [Master_Composition__All_Overlays_]  pages: 47 HHD Shema
   Mi Chamochah 2 HHD evening  [HHD]  pages: 26 Erev Rosh 1, 34 Kol Nidre 1
   Money pls  [HHD]  pages: 1 1 Home, 29 Rosh Hash 1
   Mourning Families  [HHD]  pages: 34 Kol Nidre 1
   Nelson-Zoole  [HHD]  pages: 30 Rosh Hash 2
   Penrod  [HHD]  pages: 26 Erev Rosh 1
   Pitchu Li  [HHD]  pages: 40 Neilah 1, 45 HHD Special
   President  [HHD]  pages: 26 Erev Rosh 1, 36 Yom Kip 1
   Presidential Families  [HHD]  pages: 34 Kol Nidre 1
   Psukei d'Zimrah  [Master_Composition__All_Overlays_]  pages: 46 HHD Beginning
   Rehbein  [HHD]  pages: 38 Yom Kip 3
   Remember Us  [HHD]  pages: 27 Erev Rosh 2, 30 Rosh Hash 2
   Return Again  [HHD]  pages: 25 Slichot, 32 RH day 2, 40 Neilah 1
   Roccia  [HHD]  pages: 29 Rosh Hash 1
   Sacred Assembly  [HHD]  pages: 26 Erev Rosh 1, 45 HHD Special
   Select composition  [Master_Composition__All_Overlays_]  pages: 49 HHD Torah
   Shofar Blessing  [HHD]  pages: 31 Rosh Hash 3, 33 PAGE, 41 Neilah 2, 45 HHD Special
   Shofar Call 1.1  [HHD]  pages: 31 Rosh Hash 3
   Shofar Call 2  [HHD]  pages: 31 Rosh Hash 3
   Shofar Call 3  [HHD]  pages: 31 Rosh Hash 3
   Sim Shalom 1  [HHD]  pages: 30 Rosh Hash 2, 37 Yom Kip 2
   Sim Shalom 2  [HHD]  pages: 30 Rosh Hash 2, 37 Yom Kip 2
   Sim Shalom 3  [HHD]  pages: 30 Rosh Hash 2, 37 Yom Kip 2
   Speigel Corps  [HHD]  pages: 37 Yom Kip 2
   Tefilati  [HHD]  pages: 45 HHD Special
   Teshuvah  [HHD]  pages: 30 Rosh Hash 2
   This Year  [HHD]  pages: 26 Erev Rosh 1
   Torah From Scratch  [HHD]  pages: 37 Yom Kip 2
   Undressers  [HHD]  pages: 37 Yom Kip 2
   Unetane (Eng) 1  [HHD]  pages: 25 Slichot, 37 Yom Kip 2, 45 HHD Special
   Unetane (Eng) 2  [HHD]  pages: 25 Slichot, 37 Yom Kip 2, 45 HHD Special
   Unetane Tokef  [HHD]  pages: 30 Rosh Hash 2, 37 Yom Kip 2, 45 HHD Special
   Ve'Al Kulam  [HHD]  pages: 25 Slichot, 35 Kol Nidre 2, 37 Yom Kip 2, 41 Neilah 2
   Veehavta 1  [Master_Composition__All_Overlays_]  pages: 47 HHD Shema, 77 Kab Shab 2
   Veehavta 2  [Master_Composition__All_Overlays_]  pages: 47 HHD Shema, 77 Kab Shab 2
   Veshamru  [Master_Composition__All_Overlays_]  pages: 48 HHD Amidah, 77 Kab Shab 2
   Vidui  [HHD]  pages: 35 Kol Nidre 2, 37 Yom Kip 2, 41 Neilah 2, 45 HHD Special
   Vimru Amen  [HHD]  pages: 25 Slichot, 28 Erev Rosh 3, 31 Rosh Hash 3, 35 Kol Nidre 2, 39 Yikzor, 51 Anytime
   Who By Fire 1  [HHD]  pages: 25 Slichot, 30 Rosh Hash 2, 35 Kol Nidre 2, 45 HHD Special
   Who By Fire 2  [HHD]  pages: 25 Slichot, 30 Rosh Hash 2, 35 Kol Nidre 2, 45 HHD Special
   Who By Fire 3  [HHD]  pages: 25 Slichot, 30 Rosh Hash 2, 35 Kol Nidre 2, 45 HHD Special
   Wirthing-Mass  [HHD]  pages: 31 Rosh Hash 3
   Young  [HHD]  pages: 36 Yom Kip 1
   Zochreinu  [HHD]  pages: 27 Erev Rosh 2, 30 Rosh Hash 2, 34 Kol Nidre 1, 36 Yom Kip 1, 40 Neilah 1, 45 HHD Special, 48 HHD Amidah, 50 HHD Closing

--- Anytime (51): 1 compositions ---
   L'chi Lach  [Master_Composition__All_Overlays_]  pages: 51 Anytime

--- Daniel (75): 1 compositions ---
   Siddurim  [Master_Composition__All_Overlays_]  pages: 75 Daniel Self Production Buttons

--- Second set Kab Shab (76-78): 1 compositions ---
   Shalom Aleichem 1  [Master_Composition__All_Overlays_]  pages: 76 Kab Shab 1

--- 79 PAGE: 1 compositions ---
   Center  [Special]  pages: 79 PAGE

--- 99 AV Buttons: 0 compositions ---

--- 1 Home: 0 compositions ---

--- ungrouped: 0 ---
```


Notes on the grouping: names like `Oseh Shalom`, `Mourners Kaddish 1–3`, `Birkat Kohanim`,
`Thank you`, `Be Right Back` and `Announcements` appear on 10–15 pages each — they are the
shared spine of every service. `Select composition` (p49) is a Singular placeholder left in
by accident. Spelling drifts across connections and pages —
`Kedusha 1` vs `Keddusha 1`, `Vahavta 1` vs `Veehavta 1`, `Mi Sheberach` vs `Mi Shebeirach`,
`Shehechiyanu` vs `shehecheyanu`, `Elohai Nshama` vs `Elohai Neshama`,
`Ahava Rabbah Ahavtanu (ncomplete)` vs `Ahavah Rabbah Ahavtanu`,
`Candle LIghting` (capital I) — which matters because the converter matches on the
lower-cased name.

The Special connection carries the **per-service, editable** graphics: `Student Name`,
`Student Name 2`, `Two Line Student Names`, `Guest Name`, `Torah Reading 1–7`,
`Haftarah Reading 1–3`, `Remember Them 1–3`, and the whole Seder set. The HHD connection
carries the High Holy Day liturgy plus ~15 **family surnames** (`Harris`, `Roccia`,
`Bennetts`, `Levy`, `Goldman`, `Rehbein`, `Penrod`, `Gilbert`, `Young`, `Alter`,
`Nelson-Zoole`, `Wirthing-Mass`, `Lazaroff Hanes`, `Speigel Corps`, `Hertz`, `Garden`,
`Massa`, `Undressers`) — donor/honoree cards rebuilt each year.

### 4.6 Page navigation

**Navigation controls.** Every page has `pageup` at row 0 column 7 (99×) and `pagedown` at
row 2 column 7 (99×). The stock `pagenum` at row 1 column 7 survives on only **23** pages —
the empty spares 53–69/71/73/74, plus 1, 70 and 72. On the other **76** pages Michael has
replaced it with a hand-built **home button**:

```
text:  "$(this:page) $(this:page_name)"   (a few pages: "$(this:page_name)" only)
box0:  #0f0f0f,  fontsize 25–30
step0.down:  set_page [internal] { page: 1, surfaceId: "self" }
```

So the top-right column is a fixed three-key strip: **up / "12 BMitzvah 1" → Home /
down**. Wayfinding is the button's own label, printed from `$(this:…)`.

**`set_page` actions: 99 in total.**

- 76 are the home buttons above (`page: 1`, `surfaceId: "self"`).
- **Page 1 "1 Home" is the hub**, with nine jump buttons:
  `HHD Cams → 92`, `Adv. Cam Control → 87`, `Sat → 7`, `HHD → 29`, `BMit Cams → 94`,
  `Oneg Cams → 85`, `Any → 51`, `BMit → 12`, `F (funerals) → 19`.
- Lateral jumps elsewhere: `p51 "Sat" → 7`; `p84 "Left cam" → 92`;
  `p87 "Morning Cams" → 96`, `"BMit Cams" → 94`, `"HHD Cams" → 92`, `"Evening Cams" → 98`;
  `p93 / p97 "Adv. Cam Control" → 87`.
- **Page 72** is a cross-surface remote: five buttons `F1…F5` that set pages 92, 91, 90, 89, 88
  on `surfaceId: "streamdeck:CL35J1A03614"` — one Stream Deck driving the other's page.
- **Page 70 "Page Map"** is effectively empty: a single button labelled "Page Map" whose
  only action is `set_page → 70` (itself). It is a bookmark, not a map. **No button on any
  page carries a `notes` field** (verified: 0 of 1,689), so there is no written index of the
  99 pages anywhere in the export.

Michael therefore moves between pages three ways: the physical up/down strip, the Home
button back to page 1, and page 1's nine category jumps. There is no next/previous *within
a service* — ordering is spatial (reading order across the 4×8 grid, continued onto
"Kab Shab 2", "Kab Shab 3"…).

### 4.7 Custom variables, expression variables and triggers

**Custom variables (6):** `Center`, `Left`, `Right`, `Bima`, `Dorothy` — described as
"<name> SC Loop", default `"0"`, `persistCurrentValue:false` — plus `CenterAuto` (default
`""`, unused description).

**Triggers (6),** all the same shape, all camera automation, **none touching Singular**:

| Trigger | Enabled | vMix key | Loop period |
| --- | --- | --- | --- |
| Center Loop | yes | `NumPad1` | 56 s |
| Left Loop | yes | `NumPad2` | 71 s |
| Right Loop | yes | `NumPad3` | 47 s |
| Bimah Loop | yes | `NumPad4` | 93 s |
| Dorothy Loop Long | yes | `NumPad5` | 122 s |
| Dorothy Loop Short | **no** | `NumPad5` | 71 s |

Each fires on a change of its custom variable, runs only while the variable is `> 0`, and
then: press the vMix numpad shortcut → `wait` the loop period → if the variable is still
`> 0`, increment it, which re-fires the trigger. A self-sustaining shot-rotation loop that
stops when the operator sets the variable back to 0.

**Expression variables (1):** `C-ECL` (`expression_value`, expression currently empty) with
one local variable `CECL` bound to the `Center` camera's `exposureCompLvl` at level `-12`.
Half-built.

### 4.8 Surfaces

Two **Elgato Stream Deck XL** units, both 8 × 4, brightness 100, rotation 0, no group:

| Serial | Name | Startup page | Use last page | Last page |
| --- | --- | --- | --- | --- |
| `streamdeck:CL35J1A03614` | **Right** | 1 (`1 Home`) | **true** | 29 (`Rosh Hash 1`) |
| `streamdeck:CL35J1A03706` | **Left** | 1 (`1 Home`) | **false** | 1 |

Neither restricts pages (`restrict_pages:false`, `allowed_pages:[]`) and neither is locked
(`never_lock:false`). Both sit in the implicit "Auto group". The **Right** deck resumes
wherever it was left; the **Left** deck always comes up on page 1. Every page's grid is
exactly the XL's 4 × 8, so a page is literally one deck-face.

`surfaceInstances` lists three built-in surface drivers: `elgato-stream-deck` (builtin),
`xkeys` (builtin) and `mirabox-stream-dock` (1.2.0).

### 4.9 Image library (3 entries)

| Internal name | Description | Type | Original size |
| --- | --- | --- | ---: |
| `1U9wE7R881ESG53stGvY7` | **Camera** | image/png | 11,640 B |
| `nGtj_LxNpTLi2fsZ2iSZu` | **Shofar** | image/png | 4,592 B |
| `ninety-buses-accept` | **Shofar 2** | image/png | 496,502 B |

All three have `backgroundColor: "rgba(0,0,0,0)"`. Only **Shofar 2** is actually referenced
from buttons, via `$(image:ninety-buses-accept)` in the `image0` layer of the three
**"Shofar Blessing"** buttons (pages 31, 33, 41). The other 45 image-bearing buttons embed
a `data:image/png;base64,…` blob directly in the layer — camera thumbnails on pages 43, 44,
88; page-corner icons on 18, 80–82, 89–96; media icons on 83; two on page 45.

### 4.10 Style conventions — how to make a generated button look like Michael's

Every content button is `button-layered` with the identical four-layer stack
`canvas → box0 → image0 → text0` (verified: 908/908 Singular buttons). Text is white
(`16777215`) on 862 of 908; black (`0`) on 44; `#484848` on 2. Font is `companion-sans`,
`halign`/`valign` centre, `outlineColor 4278190080`, `fontsizeAllowShrink: true`.

**Font sizes.** `100` on 491 buttons — that is the autosize idiom (shrink-to-fit). The
remaining ~400 carry a hand-set value, mostly 29–52, with many odd decimals (`35.1`,
`32.8`, `30.7`) from dragging the slider. A generated button should use
**`fontsize: 100` with `fontsizeAllowShrink: true`** to match the majority.

**Background colour by category** (`box0.color`, decimal → hex):

| Hex | Decimal | Meaning in this deck |
| --- | ---: | --- |
| `#006699` | 26265 | the most common prayer colour — core liturgy |
| `#990033` | 10027059 | the second prayer colour — songs / sung liturgy |
| `#012a3e` | 76350 | deep navy — Torah/Haftarah readings and alternates |
| `#59011f` | 5833503 | dark rose — alternates and "space"-page spares |
| `#000066` | 102 | navy — "Be Right Back", closings, section markers |
| `#000099` | 153 | brighter navy — silent prayer, passing the Torah |
| `#ffff40` | 16776768 | yellow — HHD honorees / family cards / guest names |
| `#663300` | 6697728 | brown — the HHD-page corner button |
| `#660000`, `#990000`, `#ff0000` | — | reds: security, startup, stream control |
| `#ffffff`, `#484848` | — | white / grey — the **Student Name** buttons |
| `#0f0f0f` | 986895 | the home button at row 1 column 7 |
| `#000000` | 0 | page-jump buttons on page 1 |

Per-page mixes are in the table produced by `scratchpad/audit/an9.py`; e.g. page 2 is
9 × `#006699`, 4 × `#990033`, 4 × `#012a3e`, 3 × `#59011f`, 1 × `#000066`.

**Step feedback.** To match, attach exactly:

```json
{ "definitionId": "bank_current_step", "connectionId": "internal",
  "options": { "step": {"value":2,"isExpression":false},
               "location": {"value":"$(this:location)","isExpression":false} },
  "type": "feedback", "isInverted": {"value":false,"isExpression":false},
  "styleOverrides": [
    {"overrideId":"<nanoid>","elementId":"text0","elementProperty":"color",
     "override":{"value":16777215,"isExpression":false}},
    {"overrideId":"<nanoid>","elementId":"box0","elementProperty":"color",
     "override":{"value":16711680,"isExpression":false}} ],
  "children": {} }
```

**Layout.** 4 rows × 8 columns. Column 7 is reserved: row 0 `pageup`, row 1 the home
button, row 2 `pagedown`, row 3 usually a page-specific extra (a camera icon, a mute
toggle). Content therefore occupies columns 0–6, 28 cells, filled in reading order.

---

## 5. GAPS AND OBSERVATIONS

Each item says what was **verified** in code or in the export, and marks **inference**
where I am reasoning past what I could read.

### 5.1 Editing per-service text — the biggest gap

**Verified.** No route in this excerpt accepts graphic text. `POST /api/command` takes an
action and a cue id only (`app/api/command/route.ts:6`); the module has no text option on
any action (`main.ts:333-354`) and no variable carrying text.

**Verified in the export, what the operator actually does today:** page 15 row 1 column 6 is
labelled **"Student Name Noa"** and fires `animateIn [Special] {comp:"Student Name"}`; row 2
column 6 is **"Student Name Ezra"** firing `{comp:"Student Name 2"}`. The child's name lives
inside the Singular composition; the Companion button label is **retyped by hand** every
b'nei mitzvah. The same pattern covers `Guest Name` (page 1), `Two Line Student Names`,
`Torah Reading 1–7`, `Haftarah Reading 1–3`, `Remember Them 1–3`, and the ~18 HHD family
surname cards.

The CRC system's answer today is **"Names for this service"** — an editor types names on
`/services`, they become catalog cues `names:<collectionId>:<NN>` published as
`<title> — 01 of 03` (`catalog.ts:13`, `docs/OPERATOR-QUICKSTART.md` "Names for this
service"). That covers Mi Shebeirach / Kaddish name lists. It does **not** cover a single
short substitution like a student's name, a guest speaker's name or a donor family card,
and it requires a web editor, not the operator at the deck. **Inference:** a
`set_cue_text`-style action (cue + field + value), or a variable-substitution field on the
cue, is the smallest thing that would retire ~40 of Michael's hand-relabelled buttons.

### 5.2 Ordered "next / previous through a service"

**Verified.** The only ordering the module understands is **within one multipart graphic**:
`next_panel` / `previous_panel` parse `<title> — NN of MM` out of the live cue's name and
step inside that set, wrapping at the ends (`panel.ts:128-142`). The comment at
`panel.ts:113-115` is explicit: *"the server keeps no cursor."* There is no action, no
variable and no API route for "next item in tonight's service".

**Verified** that the pieces exist elsewhere: `/api/command` accepts a `serviceRef`
(`route.ts:38`) which the module never sends; `docs/MCP.md` and the rulings describe
`prepare_service_from_setlist`; ruling R11-b in
`docs/planning/2026-09-14-integration/RULINGS-INTEGRATION-2026-09-14.md` asserts that
**row order is the author's** and that *"every setlist view (edit, Perform, service sheet,
gig packet, today.json, Overlays import) renders rows in stored `order`"*. So an ordered
service exists upstream on centralreform.live; **nothing in this excerpt exposes it to
Companion.**

**Verified** that the same rulings file records this was considered and deferred —
*"Idea 3 — Companion 'Today's order' slot buttons. Michael's page 1 as permanent slot
buttons whose labels/targets resolve through module variables filled from the prepared
service. Not now; changes are infrequent and the lift is not worth it yet. Michael keeps
his own pages."*

**Verified** that Michael's own workaround is spatial, not sequential: 99 pages laid out in
service order, left-to-right / top-to-bottom, continued across "Kab Shab 1/2/3/4",
"Shab Morn 1–5", etc., with a fixed up/down/home strip in column 7. He has no cursor either.

### 5.3 Presets

**Verified.** Presets exist and are regenerated on every catalog refresh (`main.ts:155`),
one per **visible** cue plus seven fixed ones. But:

- The per-cue preset is `type: 'simple'` with a flat `style: {text, size, color, bgcolor}`
  and `feedbacks: [{feedbackId, options, style:{bgcolor}}]` (`main.ts:368-376`). That is
  the SDK preset shape, not the export shape; **inference**: `@companion-module/base` 2.0.4
  translates it into a layered button, but nothing in the module lets the author specify
  layers, a font size, an image or per-layer overrides, so a dropped preset cannot
  reproduce Michael's four-layer look or his `fontsize: 100 + allowShrink` idiom.
- Every cue preset is the same charcoal `rgb(35,35,35)`. **There is no category colouring**,
  so 200+ presets would arrive visually identical, against a deck whose whole legibility
  rests on `#006699` vs `#990033` vs `#012a3e`.
- `previous_panel`, `set_page` and `refresh_catalog` have no preset (verified).
- The preset id is `show_<cueId>` but the action is `toggle_cue` (`catalog.ts:57`,
  `main.ts:370`) — a naming trap for anyone matching on preset ids later.

### 5.4 Variables in button text

**Verified, and it works.** Ten variables are published and two presets already use
`$(label:connection)`, `$(label:current_name)`, `$(label:current_panel)`,
`$(label:panel_count)` (`main.ts:384-385`). Michael already uses Companion's own
`$(this:page)`, `$(this:page_name)`, `$(this:location)` and `$(image:…)` on 76 home buttons
and 3 shofar buttons, so the idiom is familiar to him.

Gaps: there is **no variable carrying the cue id** (`requested_cue` is a name — verified,
`variables.ts:47-48`); no variable for the catalog size or version; no per-cue variable, so
a button cannot say "am *I* the live one" in text; and no service/position variables.
`$(this:page)`-style local variables on buttons (`localVariables: []`, present on all 1,689
of Michael's buttons) are untouched by the module.

### 5.5 Thumbnails / images on buttons

**Verified.** The module never sets an image. Preset styles carry only `text`, `size`,
`color`, `bgcolor` (`main.ts:369`). `OverlaySnapshot.cuePayload` is parsed and then ignored
(`client.ts:7, 339`) — the module already receives the cue's content and throws it away.
The web side *can* render a 1920 × 1080 still (`/author/fit-check`, `scripts/t3-stills.mjs`
in `docs/RENDERER.md`), so the raw material exists. **Inference:** a per-cue PNG served from
the catalog and set as an `image0` layer would be a large legibility win on a 4×8 deck where
`Birchot Hasha 1` and `Birchot Hasha 3` are otherwise indistinguishable — and Michael
already puts images on 48 buttons, so the idiom fits.

### 5.6 Relabelling buttons from the web console

**Verified: not possible.** There is no route in this excerpt that writes to Companion, and
Companion's own HTTP/API surface is not called from anywhere in the repo excerpt. All
control flows Companion → web. The only tooling that touches Michael's buttons is offline
file surgery: `scripts/convert-companion-singular.mjs` (a `.companionconfig` in, a
`.companionconfig` out) and `scripts/prepare-workspace-companion.mjs`. Both require an
export/import cycle and a Companion restart-equivalent. **Every label change is manual
typing at the console today**, which is exactly why "Student Name Noa" is baked into a
button.

### 5.7 Other verified gaps and observations

1. **Commands are dropped while the socket is down.** `#command` refuses outright when
   `#transportConnected` is false (`main.ts:210-214`). There is no queue and no retry after
   reconnect. During a 1–30 s backoff window a press is lost silently apart from the status
   line. Michael's Singular buttons have no such gate.
2. **Catalog refresh is push-only or manual.** No timer anywhere (verified). If the relay's
   `catalog` event is missed and no snapshot arrives with a changed version, the module runs
   on a stale list until someone presses **Refresh cue catalog**.
3. **No `serviceRef` from Companion** (verified: absent from `companion/src`), so the cue
   log (`docs/LIVE-ARCHITECTURE.md`, "The cue log") records `source:'companion'` with a null
   service — history cannot be joined to a prepared service for the surface that fires the
   most cues.
4. **One output.** README: *"CRC-first single-output operation only."* Michael runs three
   Singular compositions simultaneously (Master + HHD + Special) and 11 buttons deliberately
   fire two of them at once. **Verified** there is no layer or channel concept in the module
   or in `/api/command` — one `cue` at a time, `revision` monotonic, `out` clears. The
   "Starting Soon" lower-third-plus-side-panel idiom and the "CRC Logo under-layer" idiom
   (~97 buttons) **have no equivalent** in the CRC model. The scan card (`bug`) is the only
   second layer, and it is a fixed 300 × 300 QR corner (`docs/RENDERER.md`).
5. **No "all clear" that is distinct from "clear".** `animate_clear` and `clear_now` both
   clear the single output, which is fine given (4) — but the converter maps
   `takeOutAllOutput` → `animate_clear` (`convert…mjs:311-317`), which is only correct
   because there is one output. Worth recording as an assumption if layering is ever added.
6. **Hidden cues are reachable by feedback but not by action** (verified,
   `main.ts:334` vs `main.ts:356`). Intentional, but a source of confusion: a button can
   light up for a cue no action can select.
7. **`requested_cue` is mislabelled** (verified) — it publishes a name under a label that
   says "cue". Anything built on it later will assume an id.
8. **Feedback-to-style mapping is the module's, not the operator's.** The three default
   styles are amber `rgb(180,110,0)`, green `rgb(0,130,70)`, red `rgb(175,0,0)`
   (`main.ts:359-362`). Michael's existing red is `#ff0000` on `bank_current_step`, so an
   imported cue button would carry **two competing red-ish states** (module `requested`
   amber + module `rendered` green + internal step red) unless the step feedback is dropped.
   **Inference:** with real `requested`/`rendered` feedback available, `bank_current_step`
   becomes redundant and should be removed from generated buttons — that is a genuine
   improvement over Singular, where the step was the only confirmation.
9. **Naming drift will cost a migration.** 283 composition names with inconsistent
   spellings (§4.5) all have to map to catalog entries by hand; the converter's
   `NAME_ALIASES` table has exactly one entry today (`convert…mjs:49-51`).
10. **The "second set" pages 76–78 are a different operating model.** 20 buttons there
    couple graphic + PTZ preset + 1,300 ms wait + vMix dissolve in one press. **Inference:**
    if CRC Overlays is ever to replace Singular on those pages, the graphic action has to
    remain an ordinary Companion action that the operator can sandwich between camera and
    switcher actions — i.e. keep actions atomic and fast, and do not move the wait inside
    the module.
11. **No page/layout awareness at all.** The module publishes nothing about where a cue
    "belongs" (service, section, category), so any import must invent the 4 × 8 layout.
    The catalog's optional `?include=liturgy` envelope (`app/api/catalog/route.ts:15`)
    might carry that — `lib/liturgy-index.ts` is **not in this excerpt** and I could not
    verify what it returns.
12. **Volume.** 99 pages, 1,910 controls, 908 Singular buttons, 283 compositions. Any
    "regenerate Michael's deck" tooling is a bulk operation; there is no incremental or
    per-button path today, and the one bulk tool that exists (§3) does not parse the
    export format he is on.

### 5.8 Things that already work well and should not be broken

- Credential handling: pairing with single-use codes, durable device tokens in Companion 5's
  secrets store, control-key precedence for in-place upgrade, secret scrubbing from every
  error (`main.ts:264-268`), revocation biting at the next realtime reconnect
  (`app/api/realtime/route.ts:11`).
- Command identity: stable `commandId` + monotonic sequence preserved across retries
  (`client.ts:97-101`), server-side idempotency and out-of-order rejection
  (`app/api/command/route.ts:48-56`).
- Truthfulness: "rendered" is a three-way match (phase + revision + cue) and the code and
  every doc refuse to call it "on air".
- Catalog validation: a malformed catalog is rejected wholesale and the previous list is
  retained (`main.ts:153`, `catalog.ts:18-31`).
- Push, not poll: zero idle HTTP; `docs/LIVE-ARCHITECTURE.md` records a measured 20.25 s
  idle sample with zero HTTP requests and 1,350 bytes received.

---

*Scripts and intermediate data for this audit: `scratchpad/audit/an1.py` … `an11.py`,
`compositions.txt`, `page_table.md`, `page1_70.txt`.*
