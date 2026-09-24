# Overlay authoring MCP

Each congregation's deployment hosts its own authoring endpoint at `/api/mcp` (CRC: `https://overlays.centralreform.org/api/mcp`). It uses the MCP TypeScript SDK's stateless Streamable HTTP handler, OAuth 2.1 authorization code flow with PKCE S256, and two resource scopes: `crc.authoring` and the opt-in `crc.live` (see "Scopes" below). It exposes source, draft, publish and prepared-service operations. No live-control tool is registered yet (Track V3); the scope, the consent line and the per-tool gate are in place for them.

## Server configuration

Apply `db/oauth.sql` to the same PostgreSQL database as the renderer. Configure `PUBLIC_BASE_URL=https://overlays.centralreform.org`. No shared key takes part in consent: the person approving a connection is a signed-in workspace member (see "Consent" below), and `AUTHORING_KEY`/`CONTROL_KEY` are not read by the OAuth routes. Authorization codes, access tokens, and refresh tokens must never be logged. The database stores SHA-256 hashes of all opaque credentials.

Discovery endpoints:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-authorization-server`

OAuth endpoints:

- `/oauth/register` for public-client dynamic registration
- `/oauth/authorize` for user consent and PKCE authorization
- `/oauth/token` for authorization-code and refresh-token grants
- `/oauth/revoke` for access-token revocation or refresh-family revocation

Authorization-server discovery advertises `crc.authoring`, `crc.live` and `offline_access` (optional refresh consent). The protected resource advertises `crc.authoring` and `crc.live`; `offline_access` grants no CRC data or permission of its own.

## Scopes

- A request may ask for any subset of `crc.authoring`, `crc.live` and `offline_access` that holds at least one of the first two. A request with no `scope` still means `crc.authoring`. Scopes are stored in one canonical order (`crc.authoring crc.live offline_access`), so every row written before `crc.live` existed (`crc.authoring`, `crc.authoring offline_access`) is unchanged and still validates; existing connections keep working without reconnecting.
- The grant is what was requested, intersected with what the person consented to and what their role allows. `crc.authoring` needs an Administrator or Editor. `crc.live` needs one of the explicit roles Administrator, Editor or Operator (`owner`/`editor`/`operator`), checked against that list rather than the web's `control` permission, so a role added later does not inherit live control. The token response's `scope` says what was granted.
- Every request and every refresh re-reads the approving member: a scope their role no longer allows stops at the next request (an Editor moved to Operator keeps live control and loses authoring), a refresh rotates to the narrowed scope, and a grant with no resource scope left is refused as an invalid token.
- The endpoint accepts a token holding either resource scope. Its 401 challenge still names `scope="crc.authoring"`, as before. Every tool is listed whatever the token holds; each tool group declares the scope it needs (`lib/mcp.ts`: the live group needs `crc.live`, every other group `crc.authoring`; `get_workspace` needs neither), and a call without it is refused before anything runs, in a sentence ending `(insufficient_scope: needs crc.live)`, for example "This CRC connection wasn’t granted live control, so show_graphic can’t run. Nothing was changed. To use it, reconnect the CRC connector and allow live control when you approve." Whether Claude or ChatGPT step up on that refusal is unverified.
- A connection's live commands go through the same core as `POST /api/command` (`lib/live-command.ts`) with `source:'mcp'`, one relay controller id per token family (stable across refreshes, derived from but never equal to the family hash) and a clock-based sequence. The caller's `commandId` is kept, so a retried call replays rather than pressing twice; `ifRevision`/`ifCue` pass through to the relay, and its `outcome`, `originalOutcome` and `lastPress` are read back (docs/RELAY-RELEASE.md).

Production redirect URIs must use HTTPS. HTTP is accepted only for loopback callbacks such as `http://127.0.0.1:49152/callback`. Registered redirect URIs must match exactly during authorization and code exchange. Authorization codes are one-use and expire after five minutes. Access tokens expire after one hour. Refresh tokens expire after 30 days and rotate on every use; reuse or revocation invalidates every refresh and access token in that family.

## Consent

The consent page at `/oauth/authorize` names the registered client and its verified return destination and offers **Approve** and **Deny**. Who approves is the workspace session — the same Google or password sign-in as the rest of the site — and that member must be an Administrator or an Editor for authoring (an Operator may approve live control only; see below). There is no key field.

The session cookie is `SameSite=Strict`, so the first arrival from an MCP client (a cross-site navigation from claude.ai or a desktop app) carries no session even when the person is signed in. Pressing Approve on that page is a same-site form post, which does carry it: a signed-in author is done in one click. Without a session the request is parked in a ten-minute `HttpOnly` cookie scoped to `/oauth/authorize` and the person is sent to `/access?next=/oauth/authorize`; after signing in, `/access` returns them to the consent page, which now reads "Approving as *Name* (*email*)", and Approve issues the code. An Operator sees "Your role here can’t author graphics. Ask an administrator for Editor access." A return with nothing pending reads "Sign-in didn’t complete. Start the connection again from your MCP client."

When the client asked for `crc.live`, the form carries one more line, a checkbox that is off until the person ticks it: "Live control: also let this connection show, take out and clear graphics on the CRC output, as the console does." It is offered only to the three live roles (before sign-in the role is unknown, and the post re-checks it). Unticked, the connection gets authoring only. An Operator can approve a live-only connection; an Operator approving a request for both without ticking the line reads "Your role here can’t author graphics, so this connection can have live control only. Tick Live control to allow it, or Deny." A live-only request approved without the tick reads "Nothing was chosen to allow. Tick Live control to connect, or Deny." A request for authoring alone shows the page exactly as before.

The code, the access token and the refresh token all carry the approving member as their actor (`mcp:<client>:member:<id>`). Every MCP request and every refresh re-checks that member: removing them from the workspace ends their MCP access at the next request, and moving them to Operator ends authoring (and live control stays only if it was granted). Tokens minted before this change, whose actor names no member, are refused; those clients reconnect through the new consent. The page stores only the opaque request handle in the form and the cookie, and never places a bearer token in a URL. Requests have durable database rate limits and bounded bodies.

## Which congregation (`get_workspace`)

Each deployment has its own database, OAuth issuer and relay, so a token reaches one congregation only. An editor at both congregations holds two connectors, so the connection says who it is everywhere an agent looks:

- The server name is `<short name> Overlay Authoring` (`CRC Overlay Authoring`, `TBI Overlay Authoring`), the consent page reads "Connect <short name> authoring", and tool descriptions name the congregation.
- `initialize` returns `instructions`: which congregation this is, the authoring workflow, and the layout house rules (corner takes a bottom template; text needing more than two lower thirds becomes a left panel sequence; use `create_source_draft_set`, not `split_draft_into_set`, for a long prayer in parts).
- `get_workspace` returns `{workspaceId, shortName, host, organizationName, rehearsal, rehearsalLabel}`.
- Every result starts with `{workspaceId, shortName, host}`.
- Every tool that changes anything takes a required `workspace` argument: the workspace id (`crc`, `temple-bnai-israel-kalamazoo`) or the short name. A call naming a different congregation is refused before anything runs: "This connection serves CRC (workspace 'crc' at overlays.centralreform.org), not '…'. Nothing was changed. Use the connector for '…', or pass workspace:'crc' if you meant CRC." Reads accept the same argument optionally and refuse a mismatch the same way.

## Authoring workflow

Clients can search licensed sources, inspect a source, list available cue templates, import an existing cue by ID, and create or update drafts. Source-backed content selects source and block IDs; bilingual drafts require identical ordered source/block coverage in Hebrew and transliteration. Content mode `custom` takes free text (up to 4,000 characters) for announcements and other graphics that come from no source.

The shortest source-backed path is two calls: `search_sources{query, includeBlocks:true}` returns each unit's block ids with their kind and first words, and `create_draft` takes those ids with no `templateCueId` (below). Neither `get_source` nor `list_templates` is needed when the defaults suit.

### Reads, looks and the editor's other operations (packet A1)

- **Leaner reads.** `list_drafts` is compact by default: rows sorted by name and then set order, each with `set {id, index, count}`, `published`, `dirty` (published, and the draft has changes the live graphic lacks), `archived`, and an `excerpt` of what it reads (custom text included). `includeArchived` adds archived drafts; `nextCursor` pages in name order. `compact:false` still returns every full record. `get_draft{view:'rendered'}` returns what the graphic reads on screen plus its version, set and publish state, without snapshots; the default view is the full record. `search_sources` is compact by default (no licence or pin blocks; `compact:false` restores the legacy summaries), takes `book`, `service` and (T2) `page` filters, and lists block ids with `includeBlocks:true`.
- **Looks.** `templateCueId` is optional on `create_draft`, `preview_content` and `create_source_draft_set`: left out, the layout's look tile (the one the editor offers first, `lib/template-looks.ts`) supplies it. `list_templates` adds `looks` (one per layout, with its template id and label; `mode` changes the labels) and `textSizes`. `textSize` (`comfortable`, `large` 42/35/34, `compact` 34/28/28) on `create_draft`, `update_draft`, `preview_content` and `compose_custom_draft` sets the three font sizes; explicit sizes in `presentation` win.
- **Custom forms.** `list_custom_templates` lists the speaker, announcement, scripture citation, service start and corner card forms with their fields; `compose_custom_draft{templateId, values}` makes the same unpublished custom-text draft the editor's form does. An unknown field or an overlong value is refused in a sentence naming the field.
- **Catalog and copies.** `list_catalog` lists baseline and published graphics, including ones nobody has opened (`query`, `layout` filters). `duplicate_draft{draftId|cueId, name?, expectedVersion?}` copies one into a new standalone draft.
- **Looking without a draft.** `preview_content` takes `create_draft`'s fields and stores nothing; `includePreviewImage:true` measures it in the server browser and returns the frame as an MCP image. That verdict is not stored and cannot stand in for `review_draft`.
- **Sources.** `list_source_facets` names the books and services; `list_book_units{book}` lists one book's printed outline (names and folios, never text).
- **Shared library.** `list_shared_library`, `preview_shared_cue` (copies the graphic's artwork here, so it is a write), `customize_shared_cue{expectedCueHash}`, `customize_shared_set{expectedCueHashes}` and `compare_shared_cue`, over the same shelf operations the editor uses.
- **Slots.** `list_slots{serviceType?}` returns each slot's graphic, text and draft version; `save_slots{serviceType, values, expectedVersions?}` is the "This service" Save: changed slots republish under their standing approval, and one overlong value or a stale `expectedVersions` entry refuses the whole Save before anything publishes.
- **Source changes.** `scan_source_changes`, `list_source_changes`, `get_source_change{id}` and `decide_source_change{id, expectedVersion, decision, reason?}` are the `/api/source-review` inbox. Accepting makes an unpublished draft on the new wording; defer and reject need a reason.

### Workspace-owned sources (packet T2)

A congregation enters its own readings (a Mishkan T'filah page, a song setting) once, as sources, and authors from them exactly as from the corpus. `lib/local-sources.ts`; storage `db/local-sources.sql` (per workspace, optimistic version; not yet applied), in memory under rehearsal.

- **`add_local_source{name, book, page, section?, service?, attribution, licence?, aliases?, blocks}`.** Each block is `{he, tr}` (Hebrew with its transliteration, optionally `en`, its translation) or `{en}` alone (an English reading). Up to 48 blocks, 2000 characters a channel, 20000 in all. `attribution` is required and `licence` optional; both are stored exactly as given and nothing is inferred about coverage. The same name on the same book and page is refused; a page may hold several sources. Ids are `local:<uuid>`.
- **`update_local_source{sourceId, expectedVersion, ...}`.** Fields left out stay; `blocks` replaces every block; `null` clears `section`, `service` or `licence`. A stale `expectedVersion` is refused and writes nothing; a no-op write keeps the version. Any change to what the unit says or where it sits (name, book, page, section, attribution, licence, blocks) moves its `unitSha256`; aliases and service only help search.
- **`list_local_sources{query?, book?, page?, limit?}`.** Each source with its version, attribution, licence, block ids, and `usedBy` (the drafts that pin it, `stale` when a draft pins an earlier wording).
- **Merged into the corpus this workspace sees.** `search_sources` finds them by text and by `book` (printed title or slug, e.g. `mishkan-tfilah`) with the new `page` filter (which narrows corpus units by folio too); compact rows mark them `local:true` with their `attribution`. `get_source` returns one with its own authority (its licence text, never the corpus licence) and `local{book, page, attribution, licence, version}`. `list_book_units` and `list_source_facets` include them. `create_draft`, `create_source_draft_set`, `preview_content` and `update_draft` accept their block ids.
- **Source-backed like corpus drafts.** A draft pins the unit and block hashes and keeps a snapshot; `create_draft` and `preview_draft` return `provenance[]` (book, page, attribution, licence) and the published cue carries the snapshot, so the graphic carries its attribution as data. It is not drawn on screen; to show a credit, enter it as a final `{en:'~ Attribution'}` block (a marked attribution, which `create_source_draft_set` keeps with the text before it on a lower third). After an edit, pinned drafts keep their wording until refreshed: `scan_source_changes` records the change in the source-change inbox, and `update_draft{refreshSourceIds:[id], patch:{content}}` rebases one. `rollback_draft` checks a local revision against the current unit, as for the corpus.
- **Book and page matching.** A published graphic built on a local source reports its position (`liturgyForCue`: book slug and page) from the snapshot it pins, so `prepare_service_from_setlist` matches a setlist row's `{book, folio}` to it. Setlist books now match ignoring case and punctuation, so `Mishkan T'filah` and `mishkan-tfilah` meet. Deck conversion can use `localSourcesAt(units, book, page)` / `findLocalSourcesAt(repo, book, page)`.
- **Never shared upstream.** The shared-library export skips every graphic built on a local source, so neither it, its wording nor its attribution leaves the workspace (tests/local-sources.test.ts).

`preview_draft` returns an authenticated `previewPath` and a fit contract. `fit_check_draft` measures that exact preview in a browser on the server (below). `review_draft` is registered for MCP: it records approval of a preview this actor has already fit-checked on the server, and takes no measurement of its own. `publish_draft` accepts only `{draftId, expectedVersion, previewId}` (plus `workspace`) and the authoring service rejects it unless that exact preview/version/hash has a stored review receipt.

## Server-side fit check (`fit_check_draft`)

`fit_check_draft` accepts `{draftId, expectedVersion, previewId}` and measures that exact preview in a real browser running on the server, so an MCP client gets the same verdict the editor computes. It launches headless Chromium, opens this deployment's own `/author/fit-stage` — an unlinked, data-free, credential-free page that mounts the real `Player` and calls the same `findFitErrors`, `findFitWarnings` and `panelFillRatio` the editor and `/author/fit-check` call — measures one 1920x1080 frame, and closes the browser. Nothing is published and nothing reaches live output.

Responses:

- `{verdict:'pass', fitErrors:[], warnings, fill, artwork, measuredAt, rendererVersion, message}` — `message` is "Checked in a browser on the server — no fit problems found.", or, when `artwork` is `'not-loaded'`, "Checked in a browser on the server — no fit problems found. The artwork was not loaded on the server; confirm it in the editor."
- `{verdict:'fail', fitErrors, warnings, fill, measuredAt, rendererVersion}` — `fitErrors` are the renderer's own sentences, word for word.
- `{verdict:'unavailable', reason, fitCheckUrl, message}` — `message` is "The server could not open a browser to check this graphic. Open Fit check and review it yourself.", and `fitCheckUrl` is `/author/fit-check?draft=<id>`. `reason` is one of `browser_unavailable`, `deadline_exceeded`, `measurement_invalid`.

A server fit check does not check artwork: the stage loads artwork through `/api/assets/<id>/preview`, which requires author authorization that a browser on the server does not have, so `artwork` reports `none` (the cue has no image), `loaded` or `not-loaded` as a label and never as a gate — `findFitErrors` does not evaluate artwork, so the verdict is the same either way.

A `pass` or `fail` is stored on the preview record with `rendererVersion:'server-chromium/<playwright version>'`. The operation has a 25-second hard deadline; `POST /api/authoring` runs on the Node runtime with `maxDuration=60` to leave room for a cold Chromium start. `unavailable` is not a verdict about the graphic — it means the check could not run, and a human should open the fit-check link.

The browser is `playwright-core` driving `@sparticuz/chromium` on Linux (Vercel). Off Linux — a maintainer's own machine — the same `playwright-core` launches a locally installed Chrome instead: `PLAYWRIGHT_CHROMIUM_PATH` if it is set, otherwise the `chrome` channel. Both packages are `serverExternalPackages` in `next.config.ts` so the native pack is traced into the function rather than bundled.

## Server-attested fit measurement (D18, behaviour change)

Before this change, `review_draft` accepted a `browserMeasurement` **asserted by the caller**: an MCP client could claim `overflow:false` without rendering anything. It now depends on who is asking.

- **MCP actors** (the `mcp:` actors this OAuth server mints): only a stored, server-attested measurement counts — a `fit_check_draft` `pass` on that exact preview whose `rendererVersion` starts `server-chromium/`. An asserted measurement is ignored, and without the attestation the call is refused with `review_required` — "Exact-version browser fit review is required". `publish_draft` continues to refuse for the same reason.
- **The web dock** (a signed-in member measuring in their own browser) is unchanged.
- `humanApproved` keeps exactly today's meaning. Whether an agent may assert human approval is a separate question this change does not touch.

Existing agent scripts that asserted a measurement must now call `fit_check_draft` first.

## Preparing a service from centralreform.live (`prepare_service_from_setlist`)

`prepare_service_from_setlist({setlistId, name?, service?})` builds a prepared service on `/services` from a planned service on centralreform.live. Each setlist row is matched to a published graphic — by liturgy page (`{book, folio}`) where the row carries one, otherwise by the console's forgiving title search — and the result is an ordinary service collection with a coverage row per row of the setlist: *Covered*, *Needs review*, *Needs a graphic*, or *Not needed*. Rows that could not be settled come back in `unmatched` with the reason for each.

Where two published graphics share the same liturgy page, the tool never picks one: the row is *Needs review*, owned by "Unassigned", with both graphics named, and the entry holds both as alternates for a person to choose between.

**It never publishes anything, never changes a published graphic, and never puts anything on screen.** It writes exactly one thing: a new prepared service you can open and edit on `/services`.

Requires an authoring member. On a congregation without the centralreform.live credential it returns a plain refusal — `{"ok": false, "reason": "unconfigured", "message": "Importing from centralreform.live is not set up for this congregation."}` — not an error. The credential and its two variables are described in `docs/WORKSPACE-DEPLOYMENT.md`; the same import is offered on `/services` as **Import from centralreform.live**.

## Editing prepared services (S2)

A prepared service is an ordered list of **rows**. A row may hold graphics (an *entry*: one graphic, alternates, or a multipart sequence) and a coverage decision (*Covered*, *Needs review*, *Needs a graphic*, *Intentional fallback*, *Not needed*), plus an optional button label, camera hint and note. Tools address rows by `rowId` (from `get_service`); `/services` keeps showing entries and coverage, reordered to follow the rows.

| Tool | Does | Web equivalent on `/services` |
|---|---|---|
| `list_services` | Services, newest first, with row counts by readiness | the collection list |
| `get_service` | One compact line per row; `view:'full'` returns the stored record | opening a collection |
| `service_readiness` | Per row: covered / needs review / needs a graphic / not needed, with the next step | the coverage map summary |
| `list_live_setlists` | Recent centralreform.live setlists to import | Import from centralreform.live |
| `create_service` | Empty, `from:'library'`, or from `rows` in order | Start empty / Start from library |
| `rename_service` | New name or service label | editing the collection title |
| `add_entry` | Graphics as a new row at `position`, or onto a row that has none | Add graphic / as alternates / as multipart |
| `remove_entry` | Removes a row's graphics; a row with a coverage decision keeps its place | Remove on an entry |
| `reorder_entries` | Full `orderedRowIds`, or `rowId` + `toIndex` | the ↑ ↓ buttons |
| `swap_graphic` | Replaces one graphic on a row (and the matching coverage graphic) | remove + add |
| `resolve_coverage_row` | Settles a row with one graphic; rewrites its entry to that graphic | editing a Needs review item |
| `set_coverage_row` | Adds or edits a coverage decision and row details; `clear:true` removes the decision | Add / Edit / Remove coverage item |
| `set_names` / `clear_names` | The service's names list; clearing is refused while a names panel is on air | Names for this service |
| `archive_service` / `restore_service` | Archive (removes the names list; refused while on air) and restore | Archive / Restore |
| `refresh_from_setlist` | Re-imports from the stored origin; **dry run by default** | none (new) |

`refresh_from_setlist` matches rows by setlist track id. A row a person decided (covered, not needed, intentional fallback, or graphics on a row without coverage) is never changed; a row still waiting on a decision takes the new match; new setlist rows are inserted in setlist order; rows added by hand keep their place after the row they followed; rows no longer on the setlist are kept and reported unless `removeMissing:true`.

Every change takes `expectedVersion` (the version `get_service` returned) and returns the new `version`; a stale version is refused with a sentence and writes nothing. Unresolved coverage rows default their owner to "Unassigned", as the importer does. `get_service` reports `serviceRef`, the id a deck button generated from the service sends with its commands so the cue log attributes them (R-S3; the deck side is Track C). The web's `search_coverage_sources` is covered by `search_sources`, and feedback (`record_feedback`, `update_feedback`, the CSV) lives on `/services/log` and is not an MCP tool. None of these tools publishes a graphic or puts anything on screen.

## Client status

The routes implement the standards used by remote MCP clients, including protected-resource discovery, authorization-server discovery, dynamic public-client registration, PKCE, bearer challenges, refresh, and revocation. The automated smoke test exercises Streamable HTTP initialization, tool discovery, tool invocation, input boundaries, audience/scope constraints, redirects, PKCE, and chunked body limits. A real ChatGPT or Claude connection still requires deployment and provider-side testing; this repository does not claim that either client has been connected.

Current provider setup references:

- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta): enable developer mode for an eligible web account, create an app using this endpoint, choose OAuth with DCR, scan tools, and complete consent. OpenAI recommends advertising `offline_access` when refresh tokens are issued.
- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): individual users add the endpoint under Customize > Connectors; Team and Enterprise Owners add it for the organization before members connect.
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication): Claude supports DCR, PKCE S256, rotating refresh tokens, and Streamable HTTP. Its hosted callback is `https://claude.ai/api/mcp/auth_callback`.

Creating either account connection changes provider account state and requires an authenticated user. Browser automation can navigate the setup and scan the endpoint after explicit authorization, but login, organization role, consent, and publishing remain account-side prerequisites.

Run focused tests with:

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/oauth.test.ts tests/mcp.test.ts
```

## Reading what a service did (`get_service_history`)

`get_service_history({since, until, after, limit})` reads this workspace's cue log: one row per
accepted live command, with the graphic's id, its liturgical position (`unitId`, `momentId`,
`book`, `folio`), the time, where the command came from (`control`, `companion` or `mcp`; the
console's own WebMCP tools send `mcp`), the prepared service when one is known, and the command's
`commandId` (ruling 10: the caller's correlation id, `null` on rows recorded before the relay kept
it), so an agent can find the row its own command wrote. It is bounded to the last 2,000 commands or 14 days, whichever is smaller, and pages by
`seq`.

It is read-only in the strongest sense: it puts nothing on screen, changes nothing, and carries no
graphic names, no text and nobody's identity. Without the live relay it answers
`{ok:false, reason:"unavailable"}` rather than failing, because the legacy path keeps no history.
