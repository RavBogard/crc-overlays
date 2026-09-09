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

Production redirect URIs must use HTTPS. HTTP is accepted only for loopback callbacks such as `http://127.0.0.1:49152/callback`. Registered redirect URIs must match exactly during authorization and code exchange. Authorization codes are one-use and expire after five minutes. Access tokens expire after one hour. Refresh tokens expire after 30 days and rotate on every use; reuse or revocation invalidates every refresh and access token in that family.

The consent form asks for the CRC authoring key in a POST body. It displays the registered callback destination, stores only an opaque request handle in the form, and never places a bootstrap key or bearer token in a URL. Requests have durable database rate limits and bounded bodies.

## Authoring workflow

Clients can search licensed CRC sources, inspect a source, list available cue templates, import an existing cue by ID, and create or update source-reference drafts. Draft content selects source and block IDs; MCP inputs do not accept arbitrary prayer text. Bilingual drafts require identical ordered source/block coverage in Hebrew and transliteration.

`preview_draft` returns an authenticated `previewPath` and a fit contract. It does not claim browser fit. Michael must open that preview in the authenticated CRC web UI, allow the renderer to measure it at 1920x1080 with fonts loaded, and approve it. `review_draft` is intentionally absent from MCP. `publish_draft` accepts only `{draftId, expectedVersion, previewId}` and the authoring service rejects it unless that exact preview/version/hash has a stored human review receipt.

## Client status

The routes implement the standards used by remote MCP clients, including protected-resource discovery, authorization-server discovery, dynamic public-client registration, PKCE, bearer challenges, refresh, and revocation. The automated smoke test exercises Streamable HTTP initialization, tool discovery, tool invocation, input boundaries, audience/scope constraints, redirects, PKCE, and chunked body limits. A real ChatGPT or Claude connection still requires deployment and provider-side testing; this repository does not claim that either client has been connected.

Run focused tests with:

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/oauth.test.ts tests/mcp.test.ts
```
