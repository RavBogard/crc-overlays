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
| `WORKSPACE_STAGE` | `trial` or `production` | `trial` |
| `WORKSPACE_SUPPORT_EMAIL` | Optional public support address | unset |
| `WORKSPACE_COMPANION_MODULE_PATH` | Optional local public module package | reviewed CRC package |
| `WORKSPACE_COMPANION_PAGE_PATHS` | Comma-separated local public page exports | two reviewed CRC pages |
| `WORKSPACE_ISOLATION_VERIFIED` | Public result of completed isolation acceptance | `false` |

Only local public paths are accepted for logos and downloads. The public workspace response intentionally excludes database URLs, relay details, credentials, OAuth configuration, private source packages, and membership data.

## Temple B'nai Israel prepared profile

The prepared second profile is `workspaces/temple-bnai-israel/workspace.json`. Official sources confirm Temple B'nai Israel in Kalamazoo and Rabbi Simone Schicker. Set only `WORKSPACE_ID=temple-bnai-israel-kalamazoo` to load this complete prepared identity; individual public settings may still override it for a deployment. The stored official-site artwork supplies the proposed product identity cue, and the profile records the source URLs and how each was used. It remains an official-public reference prepared for congregation review, not a claim that Temple B'nai Israel has approved the product or the asset treatment.

Unknown workspace IDs fail closed unless they supply a complete public identity. They cannot fall back to CRC artwork, colors, names, or downloads. The renderer also refuses to start when `/api/workspace` is unavailable or invalid, preventing a configured non-CRC output from quietly rendering CRC identity.

Its status is `prepared-not-provisioned`. It has no database, relay, credentials, public application deployment, or member invitation. Setup downloads also remain unconfigured so the deployment cannot leak CRC-specific files.

The companion `starter-collection.json` records the owner's approved private duplicate of the current 24 visible CRC cues. Run `node scripts/prepare-workspace.mjs --workspace temple-bnai-israel-kalamazoo` to produce an ignored staging package under `work/deploy-staging`. The package assigns new destination cue IDs, copies the selected source content, and retains the complete existing source provenance and license language on each cue. It does not change live CRC records and is not a public source-library release.

## Provisioning gate for the second deployment

Before inviting anyone or calling the workspace isolated:

1. Create a separate deployment, database, relay namespace, credentials, backups, and monitoring.
2. Configure and validate the prepared TBI identity.
3. Add destination-owned source content with suitable rights; do not place the restricted CRC source pack in the deployment bundle.
4. Build a TBI-specific Companion page pack whose placeholder targets only the TBI deployment.
5. Prove that CRC credentials, commands, catalogs, drafts, output URLs, and renderer tickets fail against TBI, and vice versa.
6. Rehearse the real TBI OBS, Companion, and Stream Deck computer.
7. Only then set `WORKSPACE_ISOLATION_VERIFIED=true` and invite exact known members through the product's membership flow.
