# Workspace deployment identity

`lib/workspace.ts` defines the public, validated workspace identity used by `/setup` and `/api/workspace`. CRC is the safe default for the existing deployment. A second congregation uses the same release with its own deployment configuration.

This foundation provides public branding and setup labels. It does not by itself isolate data, live state, relay storage, authoring, or credentials. `WORKSPACE_ISOLATION_VERIFIED=true` may be set only after the deployment, database, relay, credentials, backups, and cross-workspace denial tests have been completed.

## Public settings

| Setting | Purpose | CRC default |
| --- | --- | --- |
| `WORKSPACE_ID` | Stable lowercase deployment identity | `crc` |
| `WORKSPACE_ORGANIZATION_NAME` | Full congregation name | Central Reform Congregation |
| `WORKSPACE_SHORT_NAME` | Short label used in tight UI | CRC |
| `WORKSPACE_PRODUCT_NAME` | Product label | CRC Overlays |
| `WORKSPACE_OUTPUT_NAME` | Suggested vMix/OBS source name | CRC graphics |
| `WORKSPACE_LOGO_PATH` | Public local asset path | CRC artwork |
| `WORKSPACE_LOGO_ALT` | Accessible description | CRC artwork description |
| `WORKSPACE_PRIMARY_COLOR` | Six-digit hex highlight | CRC turquoise |
| `WORKSPACE_DEEP_COLOR` | Six-digit hex panel color | CRC blue |
| `WORKSPACE_ACCENT_COLOR` | Six-digit hex focus/accent | CRC gold |
| `WORKSPACE_DEFAULT_COMPOSITOR` | Compositor this congregation is set up for (`vmix` or `obs`) | `vmix` |
| `WORKSPACE_STAGE` | `trial` or `production` | `trial` |
| `WORKSPACE_SUPPORT_EMAIL` | Optional public support address | unset |
| `WORKSPACE_COMPANION_MODULE_PATH` | Optional local public module package | reviewed CRC package |
| `WORKSPACE_COMPANION_PAGE_PATHS` | Comma-separated local public page exports | two reviewed CRC pages |
| `WORKSPACE_ISOLATION_VERIFIED` | Public result of completed isolation acceptance | `false` |

Only local public paths are accepted for logos and downloads. The public workspace response intentionally excludes database URLs, relay details, credentials, OAuth configuration, private source packages, and membership data.

## Optional deployment flags

| Setting | Purpose | Default |
| --- | --- | --- |
| `OVERLAYS_PUBLIC_NOW` | Set to `1` to serve `GET /api/now`, the public, credential-free reading of which unit of which book is on the screen. Unset, the endpoint answers `404`. | unset on both congregations |
| `CRC_LIVE_BASE_URL` | The https origin of centralreform.live (`https://www.centralreform.live`). With `CRC_LIVE_READ_TOKEN` it enables **Import from centralreform.live** on `/services` and the `prepare_service_from_setlist` MCP tool. | CRC only |
| `CRC_LIVE_READ_TOKEN` | A `setlist_reader` bearer minted on centralreform.live: read-only, allowed exactly `list_setlists`, `get_setlist` and `get_congregation_context`, no expiry, revocable there. Stored as a sensitive variable; never copied through chat. | CRC only |
| `PUBLIC_ALTERNATE_ORIGINS` | Comma-separated https origins that also serve this workspace, beside `PUBLIC_BASE_URL` (a custom domain and the Vercel hostname at once). The site answers as whichever configured origin a request arrived on — Google sign-in, MCP consent and the OAuth issuer follow it — and an unknown host still resolves to `PUBLIC_BASE_URL`, which alone is used where no request exists (server fit check, links in MCP results). Each origin must also be registered with Google and allowed by the relay (`relay/wrangler.jsonc` `ALLOWED_ORIGINS`). A newly attached custom domain also needs a certificate: if HTTPS fails with a TLS handshake error once DNS resolves, run `vercel certs issue <host>` (CRC needed this on 2026-09-15). | The hostname that is not `PUBLIC_BASE_URL`. TBI since 2026-09-14: primary `https://overlays.templebnaiisrael.com`, alternate `https://tbi-overlays.vercel.app`. CRC since 2026-09-15: primary `https://overlays.centralreform.org`, alternate `https://crc-overlays.vercel.app` |

`OVERLAYS_PUBLIC_NOW` stays unset until the congregation's web siddur is ready to follow the service and Daniel asks for it. The endpoint publishes a unit, a book, a page number and a timestamp; it never publishes a name, a title, any text, or anything that identifies a person or a graphic. The contract handed to the web siddur is `docs/planning/2026-09-13-product-review/HANDOFF-WEBAPP-FOLLOW-SERVICE.md`.

**The suggestion on that panel needs no credential.** When the import panel is shown, the server also reads centralreform.live's public `https://www.centralreform.live/today.json` — no bearer, a 3 s deadline, a 64 KB cap — and highlights the listed service whose `startsAt` is nearest now, keyed on `setlistId`. It only ever suggests: the picker moves to that service and Import remains a tap. A 404, an empty `services`, an unreadable body, an unreachable host or an id that is not in the listing all produce no highlight and no message, so the panel behaves exactly as it did before. Nothing is read from `today.json` but the id, the name and the start.

**CRC only — setlist import (optional).** With either of `CRC_LIVE_BASE_URL` and `CRC_LIVE_READ_TOKEN` unset the import is completely absent — no panel on `/services`, and the MCP tool answers "not set up for this congregation". Temple B'nai Israel does not set them. The token is minted host-side in the centralreform.live repository (`scripts/mint-setlist-reader.mjs` there, run by an administrator's root bearer) and written straight into the Vercel project; the raw value never passes through a person or a chat. Revoke it there with `revoke_setlist_reader_bearer`.

**Siddur library regeneration.** `content/siddur-library.json` is generated, never hand-edited: the **Siddur library** GitHub Actions workflow (`.github/workflows/siddur-library.yml`) runs every Monday at 09:00 UTC and on dispatch, checks out `RavBogard/ShireiShabbat` with the read-only `SHIREISHABBAT_TOKEN` repository secret, rebuilds that repo's `dist-app/` surface with its own `build/build-app.sh` (it is gitignored upstream, so it must be produced rather than fetched), reruns `scripts/build-siddur-library.py`, and opens a pull request on `siddur-library/regenerate` only when the generated file changes — merging that PR feeds the regenerated sources into the source-review inbox and publishes nothing on its own. With the secret absent, or with `dry_run` set on a manual run, the same job builds against the synthetic `tests/fixtures/siddur-source` fixture and opens nothing, so the workflow is safe to dispatch before any credential exists. The builder reads `SIDDUR_SOURCE_ROOT` when `--source-root` is not given. Its output is deterministic for identical text: the upstream feeds carry a `builtAt` timestamp, which the builder strips before hashing (`stable_sha256`) and omits from the authorities' `printing` block, so two builds of the same sources are byte-identical and the Monday run opens a pull request only when a source actually changed.

## Temple B'nai Israel prepared profile

The prepared second profile is `workspaces/temple-bnai-israel/workspace.json`. Official sources confirm Temple B'nai Israel in Kalamazoo and Rabbi Simone Schicker. Set only `WORKSPACE_ID=temple-bnai-israel-kalamazoo` to load this complete prepared identity; individual public settings may still override it for a deployment. The stored official-site artwork supplies the proposed product identity cue, and the profile records the source URLs and how each was used. It remains an official-public reference prepared for congregation review, not a claim that Temple B'nai Israel has approved the product or the asset treatment.

Unknown workspace IDs fail closed unless they supply a complete public identity. They cannot fall back to CRC artwork, colors, names, or downloads. The renderer also refuses to start when `/api/workspace` is unavailable or invalid, preventing a configured non-CRC output from quietly rendering CRC identity.

Its status is `infrastructure-prepared-release-pending`. It has its own database, relay, deployment, and credentials. Its dedicated Companion downloads target only the TBI application and contain no control key. The owner account is prepared separately from any invitation for Rabbi Schicker or Michael.

The companion `starter-collection.json` records the initial 24-button Companion set. Run `node scripts/prepare-workspace.mjs --workspace temple-bnai-israel-kalamazoo` to produce an ignored staging package under `work/deploy-staging`. The package assigns new destination cue IDs and retains the complete existing source provenance and license language on each cue. The TBI deployment receives the complete current authoring and expanded source libraries plus owner-authorized future CRC additions; TBI-owned edits and publications remain independent. It does not change live CRC records.

## Provisioning gate for the second deployment

Before inviting anyone or calling the workspace isolated:

1. Create a separate deployment, database, relay namespace, credentials, backups, and monitoring.
2. Configure and validate the prepared TBI identity.
3. Include the complete current CRC source library and preserve its existing attribution and license metadata. Future owner-authorized CRC additions must become available without overwriting TBI-owned edits.

   **Licensed units travel, and there is no filter (R-0919-audit-7).** Daniel's standing
   authorization is that Simone and Temple B'nai Israel may use all current and future CRC
   overlays and source material, *including* units whose licence line reads "not licensed for
   redistribution". So `buildSharedLibraryPayload` in `lib/shared-library.ts` deliberately has
   no licence filter, and the attribution and licence metadata that travels with each unit is
   what records the provenance. This is written down because it looks like an oversight to
   anyone reading the export for the first time, and it has been raised more than once. It is a
   decision, not a gap; if it is ever revisited, that is Daniel's call and not a bug fix.
4. Build a TBI-specific Companion page pack whose placeholder targets only the TBI deployment.
5. Prove that CRC credentials, commands, catalogs, drafts, output URLs, and renderer tickets fail against TBI, and vice versa.
6. Rehearse the real TBI OBS, Companion, and Stream Deck computer.
7. Only then set `WORKSPACE_ISOLATION_VERIFIED=true` and invite exact known members through the product's membership flow.

## Keep both congregations on one release

After a release is merged, deploy both workspaces from the same clean commit with:

```powershell
node scripts/deploy-workspaces.mjs --commit <full-40-character-commit-sha> --confirm-production
```

The command refuses a dirty checkout or a different `HEAD`, builds a fresh allowlisted TBI source tree containing the complete current library, deploys CRC from that commit, and deploys TBI from the matching staged source. It creates the TBI Vercel link only inside ignored release staging and never replaces the repository's CRC `.vercel` link. The release record under `work/deploy-staging/releases/<sha>/release.json` ties both production deployments to the same source revision.

Use this command for future releases that add CRC overlays or library material. Shared CRC items become discoverable in TBI through the read-only shared-library connection. Choosing **Customize** creates an independent TBI draft; existing TBI drafts and publications remain unchanged.

## The cue log needs no new Overlays variable

The bounded command history lives in the relay's Durable Object and is read through
`GET /api/history` with an existing credential, so neither Vercel project gains an environment
variable for it. The relay workers each gained one plain `vars` entry, `WORKSPACE` (`crc` / `tbi`),
so a reader can tell the two congregations apart in an answer; it is configuration, never a secret.

The token travels the other way. An Administrator mints a `history_reader` credential here (see
`docs/ACCESS.md`) and it is installed on the *consumer* — centralreform.live — as that project's
own sensitive variable. Nothing about that token is stored in this repository or in either Vercel
project.
