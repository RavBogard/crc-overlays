# CRC authoring MCP

The hosted authoring endpoint is `https://crc-overlays.vercel.app/api/mcp`. It uses the MCP TypeScript SDK's stateless Streamable HTTP handler, OAuth 2.1 authorization code flow with PKCE S256, and the single `crc.authoring` scope. It exposes source-reference and draft operations only. It does not expose live overlay control or the web-only review operation.

## Server configuration

Apply `db/oauth.sql` to the same PostgreSQL database as the renderer. Configure `PUBLIC_BASE_URL=https://crc-overlays.vercel.app` and either `AUTHORING_KEY` or the existing `CONTROL_KEY`. `AUTHORING_KEY` takes precedence when both are set. Keys, authorization codes, access tokens, and refresh tokens must never be logged. The database stores SHA-256 hashes of all opaque credentials.

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

The consent form asks for the CRC authoring key in a POST body. It displays the registered callback destination, stores only an opaque request handle in the form, and never places a bootstrap key or bearer token in a URL. Requests have durable database rate limits and bounded bodies.

## Authoring workflow

Clients can search licensed CRC sources, inspect a source, list available cue templates, import an existing cue by ID, and create or update source-reference drafts. Draft content selects source and block IDs; MCP inputs do not accept arbitrary prayer text. Bilingual drafts require identical ordered source/block coverage in Hebrew and transliteration.

`preview_draft` returns an authenticated `previewPath` and a fit contract. It does not claim browser fit. Michael must open that preview in the authenticated CRC web UI, allow the renderer to measure it at 1920x1080 with fonts loaded, and approve it. `review_draft` is intentionally absent from MCP. `publish_draft` accepts only `{draftId, expectedVersion, previewId}` and the authoring service rejects it unless that exact preview/version/hash has a stored human review receipt.

## Server-side fit check (`fit_check_draft`)

`fit_check_draft` accepts `{draftId, expectedVersion, previewId}` and measures that exact preview in a real browser running on the server, so an MCP client gets the same verdict the editor computes. It launches headless Chromium, opens this deployment's own `/author/fit-stage` — an unlinked, data-free, credential-free page that mounts the real `Player` and calls the same `findFitErrors`, `findFitWarnings` and `panelFillRatio` the editor and `/author/fit-check` call — measures one 1920x1080 frame, and closes the browser. Nothing is published and nothing reaches live output.

Responses:

- `{verdict:'pass', fitErrors:[], warnings, fill, measuredAt, rendererVersion, message}` — `message` is "Checked in a browser on the server — no fit problems found."
- `{verdict:'fail', fitErrors, warnings, fill, measuredAt, rendererVersion}` — `fitErrors` are the renderer's own sentences, word for word.
- `{verdict:'unavailable', reason, fitCheckUrl, message}` — `message` is "The server could not open a browser to check this graphic. Open Fit check and review it yourself.", and `fitCheckUrl` is `/author/fit-check?draft=<id>`. `reason` is one of `browser_unavailable`, `deadline_exceeded`, `measurement_invalid`.

A `pass` or `fail` is stored on the preview record with `rendererVersion:'server-chromium/<playwright version>'`. The operation has a 25-second hard deadline; `POST /api/authoring` runs on the Node runtime with `maxDuration=60` to leave room for a cold Chromium start. `unavailable` is not a verdict about the graphic — it means the check could not run, and a human should open the fit-check link.

The browser is `playwright-core` driving `@sparticuz/chromium` on Linux (Vercel). Off Linux — a maintainer's own machine — the same `playwright-core` launches a locally installed Chrome instead: `PLAYWRIGHT_CHROMIUM_PATH` if it is set, otherwise the `chrome` channel. Both packages are `serverExternalPackages` in `next.config.ts` so the native pack is traced into the function rather than bundled.

## Server-attested fit measurement (D18, behaviour change)

Before this change, `review_draft` accepted a `browserMeasurement` **asserted by the caller**: an MCP client could claim `overflow:false` without rendering anything. It now depends on who is asking.

- **MCP actors** (the `mcp:` actors this OAuth server mints): only a stored, server-attested measurement counts — a `fit_check_draft` `pass` on that exact preview whose `rendererVersion` starts `server-chromium/`. An asserted measurement is ignored, and without the attestation the call is refused with `review_required` — "Exact-version browser fit review is required". `publish_draft` continues to refuse for the same reason.
- **The web dock** (a signed-in member measuring in their own browser) is unchanged.
- `humanApproved` keeps exactly today's meaning. Whether an agent may assert human approval is a separate question this change does not touch.

Existing agent scripts that asserted a measurement must now call `fit_check_draft` first.

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
