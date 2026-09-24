# Overlay authoring MCP

Each congregation's deployment hosts its own authoring endpoint at `/api/mcp` (CRC: `https://overlays.centralreform.org/api/mcp`). It uses the MCP TypeScript SDK's stateless Streamable HTTP handler, OAuth 2.1 authorization code flow with PKCE S256, and the single `crc.authoring` scope. It exposes source, draft, publish and prepared-service operations. It does not expose live overlay control.

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

Authorization-server discovery advertises `offline_access` as optional refresh consent. The protected MCP resource still advertises and requires only `crc.authoring`; `offline_access` grants no CRC data or authoring permission. Existing clients that request only `crc.authoring` remain valid. Clients that request both scopes receive both in authorization and refresh token responses.

Production redirect URIs must use HTTPS. HTTP is accepted only for loopback callbacks such as `http://127.0.0.1:49152/callback`. Registered redirect URIs must match exactly during authorization and code exchange. Authorization codes are one-use and expire after five minutes. Access tokens expire after one hour. Refresh tokens expire after 30 days and rotate on every use; reuse or revocation invalidates every refresh and access token in that family.

## Consent

The consent page at `/oauth/authorize` names the registered client and its verified return destination and offers **Approve** and **Deny**. Who approves is the workspace session — the same Google or password sign-in as the rest of the site — and that member must be an Administrator or an Editor. There is no key field.

The session cookie is `SameSite=Strict`, so the first arrival from an MCP client (a cross-site navigation from claude.ai or a desktop app) carries no session even when the person is signed in. Pressing Approve on that page is a same-site form post, which does carry it: a signed-in author is done in one click. Without a session the request is parked in a ten-minute `HttpOnly` cookie scoped to `/oauth/authorize` and the person is sent to `/access?next=/oauth/authorize`; after signing in, `/access` returns them to the consent page, which now reads "Approving as *Name* (*email*)", and Approve issues the code. An Operator sees "Your role here can’t author graphics. Ask an administrator for Editor access." A return with nothing pending reads "Sign-in didn’t complete. Start the connection again from your MCP client."

The code, the access token and the refresh token all carry the approving member as their actor (`mcp:<client>:member:<id>`). Every MCP request and every refresh re-checks that member: removing them from the workspace, or moving them to Operator, ends their MCP access at the next request. Tokens minted before this change, whose actor names no member, are refused; those clients reconnect through the new consent. The page stores only the opaque request handle in the form and the cookie, and never places a bearer token in a URL. Requests have durable database rate limits and bounded bodies.

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

- **Leaner reads.** `list_drafts` is compact by default: rows sorted by name and then set order, each with `set {id, index, count}`, `published`, `dirty` (published, and the draft has changes the live graphic lacks), `archived`, and an `excerpt` of what it reads (custom text included). `includeArchived` adds archived drafts; `nextCursor` pages in name order. `compact:false` still returns every full record. `get_draft{view:'rendered'}` returns what the graphic reads on screen plus its version, set and publish state, without snapshots; the default view is the full record. `search_sources` is compact by default (no licence or pin blocks; `compact:false` restores the legacy summaries), takes `book` and `service` filters, and lists block ids with `includeBlocks:true`.
- **Looks.** `templateCueId` is optional on `create_draft`, `preview_content` and `create_source_draft_set`: left out, the layout's look tile (the one the editor offers first, `lib/template-looks.ts`) supplies it. `list_templates` adds `looks` (one per layout, with its template id and label; `mode` changes the labels) and `textSizes`. `textSize` (`comfortable`, `large` 42/35/34, `compact` 34/28/28) on `create_draft`, `update_draft`, `preview_content` and `compose_custom_draft` sets the three font sizes; explicit sizes in `presentation` win.
- **Custom forms.** `list_custom_templates` lists the speaker, announcement, scripture citation, service start and corner card forms with their fields; `compose_custom_draft{templateId, values}` makes the same unpublished custom-text draft the editor's form does. An unknown field or an overlong value is refused in a sentence naming the field.
- **Catalog and copies.** `list_catalog` lists baseline and published graphics, including ones nobody has opened (`query`, `layout` filters). `duplicate_draft{draftId|cueId, name?, expectedVersion?}` copies one into a new standalone draft.
- **Looking without a draft.** `preview_content` takes `create_draft`'s fields and stores nothing; `includePreviewImage:true` measures it in the server browser and returns the frame as an MCP image. That verdict is not stored and cannot stand in for `review_draft`.
- **Sources.** `list_source_facets` names the books and services; `list_book_units{book}` lists one book's printed outline (names and folios, never text).
- **Shared library.** `list_shared_library`, `preview_shared_cue` (copies the graphic's artwork here, so it is a write), `customize_shared_cue{expectedCueHash}`, `customize_shared_set{expectedCueHashes}` and `compare_shared_cue`, over the same shelf operations the editor uses.
- **Slots.** `list_slots{serviceType?}` returns each slot's graphic, text and draft version; `save_slots{serviceType, values, expectedVersions?}` is the "This service" Save: changed slots republish under their standing approval, and one overlong value or a stale `expectedVersions` entry refuses the whole Save before anything publishes.
- **Source changes.** `scan_source_changes`, `list_source_changes`, `get_source_change{id}` and `decide_source_change{id, expectedVersion, decision, reason?}` are the `/api/source-review` inbox. Accepting makes an unpublished draft on the new wording; defer and reject need a reason.

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
`book`, `folio`), the time, where the command came from, and the prepared service when one is
known. It is bounded to the last 2,000 commands or 14 days, whichever is smaller, and pages by
`seq`.

It is read-only in the strongest sense: it puts nothing on screen, changes nothing, and carries no
graphic names, no text and nobody's identity. Without the live relay it answers
`{ok:false, reason:"unavailable"}` rather than failing, because the legacy path keeps no history.
