# Release state

What is deployed right now. Update this file on every release — it is the one place that answers
"what is live", and it is short so it can be read under pressure. The history is in
`docs/planning/2026-09-deploys/` (25 deploy records, the release chain, the phase build notes).

**Last updated: 2026-10-09 Central.** The spinning logo's white outline is removed, alongside Michael's latest main-branch changes, in `overlays-2026-10-09-logo`. Resolve the paired source SHA with `git rev-parse overlays-2026-10-09-logo^{commit}`. Details and verification locations: `docs/planning/2026-10-09-logo-outline/STATE.md`.

## Web, per workspace

| Workspace | Host | Release | How it gets there |
|---|---|---|---|
| CRC | `overlays.centralreform.org` (alt `crc-overlays.vercel.app`) | `overlays-2026-10-09-logo` | main and paired production CLI |
| TBI | `overlays.templebnaiisrael.com` (alt `tbi-overlays.vercel.app`) | `overlays-2026-10-09-logo` | paired staged production CLI |

Both workspaces use the exact tag SHA. Deployment IDs, Ready status and SHA checks are recorded under ignored `work/overlay-batch-release/verified.json` in `C:/Users/dsbog/crc-overlays-release-20261009`, with the paired receipt in `work/deploy-staging/releases/<SHA>/release.json`.

### Release overlays-2026-10-09-logo: logo outline and Michael's latest changes

- Removes the resting logo's cream padding and the source JPEG's white margin; preserves its gold edge, size, corner position and rotation.
- Includes Michael's main-branch changes through `ec88956`: centered name plates, Hebrew lines for custom graphics, pixel line spacing and Match Hebrew spacing, custom line breaks and italics, and refresh when an old renderer cannot draw a catalog layout.
- Combined-release checks: 1,328 TS and 35 MJS tests pass (13 existing skips), TypeScript, lint, production build and diff check. Logs and production browser verification: ignored `work/logo-outline-release/`.
- Daniel authorized release after Michael finished streaming. No relay release, database migration, published graphic edits or remote browser-source refresh. Reload the browser source to pick up the logo styling.

### Release overlays-2026-10-09: Michael's name plate and transitions

- Preserves Michael's commits `1e9b091` and `d8459e0` on main. Adds the Name plate layout and guided form, with a larger name above Hebrew and transliteration. Left-to-left changes finish their word fade promptly and retain titles whose text and drawing match.
- Gates: TypeScript; 1,309 TS + 35 MJS tests pass (13 existing skips); lint zero errors/two existing warnings; production build; diff check. Live browser checks cover three name plate samples, retained shared-title opacity, and a roughly 0.52-second transition. Final paired browser and health evidence is in the release checkout's ignored `work/release-20261009/`.
- Direct CLI deployment of Michael's SHA was blocked by Vercel's commit-author permission check. The release-record commit uses Daniel's existing authorized identity without changing or rewriting Michael's work. Michael has GitHub write access but is not a member of the Vercel team; TBI also has no Git integration. See the state note for the concrete follow-up.
- No migrations, relay release, Companion source changes, or published graphic edits. Physical OBS/booth acceptance remains separate.

### Release overlays-2026-10-08: overlay round 2

- Daniel asked for this release on Oct 8.
- Lower-third columns are back to the pre-Oct-7 geometry. A per-graphic divider (`presentation.bottomSplit`, 20–80%) is set by a slider in the Look card.
- Stacked was rebuilt as tight rows: Latin rows left, Hebrew right, following the saved order. Changing the order no longer forces stacking.
- Side by side can put the translation on top. The lower third's Hebrew title is fitted by its glyph ink, so nikkud show. Left-to-left word changes have no lead-in pause.
- Gates: TypeScript; 1,304 TS + 35 MJS tests (12 existing skips); lint 0 errors (2 existing warnings); build; diff check. Renderer comparison against `ca3af00^` and the rehearsal editor are covered in the state note.
- Deployed with `scripts/deploy-workspaces.mjs` from the clean worktree `C:/Users/dsbog/crc-overlays-release-0481a93`. That worktree needed a copy of the git-ignored `next-env.d.ts` for staging. CRC: `4VAgpEV97t7ZLTzMNrrL3CrNd9oX`; TBI: `9sQZgeVxawwzBF7htFp1W3nAMJ61`.
- All four hosts return `/health` 200 and serve the new overlay CSS. No migrations, relay or Companion changes, and no published graphics were changed. Booth acceptance remains separate.

### Release overlays-2026-10-07: overlay batch

- Fixes bottom text alignment/top alignment, Hebrew title vowel clearance and exits, language ordering across layouts, and consistent 42px side titles independent of density.
- Bottom columns size to content and offer stacking; watermark appears only on side panels; corner logo/header are larger. Left-to-left transitions retain panel/background. Editor titlebar remains visible while scrolling.
- Publishing overlapping blocks asks for Publish/Cancel confirmation for the saved version, including bulk publishing. Other fit failures remain blocking.
- Includes PR #8's two generated source revisions. Source-review flow remains intact; no published graphics are rewritten by this merge.
- Gates passed: TypeScript; 1,300 TS tests and 35 script tests (13 optional skips in the clean release checkout); lint with two existing warnings; production build and diff check. Local browser acceptance is recorded in the batch state. The release also fixes the injected-clock mismatch in three rehearsal test fixtures, without changing relay behavior. No migrations, relay release or Companion source changes. Physical booth acceptance remains separate.
- All current remote work is integrated. Older local task branches are preserved; 35 have equivalent patches already integrated, and six retain older divergent versions of existing work.

### Release e0c19a8: resting logo rotation (2026-09-30)

- The separate bottom-right resting logo makes one smooth clockwise turn every 60 seconds. Its placement, scaling and visibility rules are preserved. Reduced-motion preference keeps it stationary.
- Integrated the already deployed Setup correction from `d21d00a` before releasing. No data, migrations or relay changes.
- TypeScript, 1,294 TypeScript + 35 MJS tests, 28 focused logo/Setup tests, lint (two existing warnings) and production build pass. Browser checks confirm the quarter/half/full-turn positions, stage scaling, hide behavior and reduced motion. Both live sites confirm 60-second linear infinite clockwise animation; both deployment SHAs verified Ready and four hosts health 200.

### Release d21d00a: Michael Companion setup (2026-09-30)

- Restored CRC's personal deck download by configuring the nine equipment connections from Michael's private backup. Existing Owner access includes Michael. Corrected Setup's Fri 1 test pick to the catalog's `bottom` layout.
- Rebuilt Michael's private preset; actual isolated Companion 5.0.5 import preserves all 1,460 buttons, six triggers, six custom variables and 3,513 non-internal actions/feedbacks. No physical equipment commands sent. On-site booth acceptance remains Michael's next step.
- Gates: TypeScript, 1,293 TypeScript + 35 MJS tests pass (13 optional environment/platform/fixture skips), lint zero errors/two existing warnings, package audit, build and diff check. Both production deployments Ready at the exact SHA; four hosts health 200. Browser confirms successful download and all three Setup test picks. No migrations or relay release.

### Release d970220: Michael follow-up (2026-09-30)

- Daniel authorized pushing/deploying the verified result. Fixes manual hard breaks, immediate title sizing, explicit corner title size, and watermark/logo overlap. New graphics start top-aligned with protected hyphens, Noto Sans Hebrew body and Frank Ruhl Libre watermark. Adds persistent workspace folders and alphabetical/newest/oldest sorting.
- Applied only `db/library-folders.sql` on each production public schema. No graphic data changed during that additive migration; no relay software release.
- Settings rollout: CRC 240 active drafts (239 published), TBI 213 active graphics (all published, including seven imported built-ins). Backups and undo records are in ignored `work/michael-followup/*-release-plan.json*`. Exact draft/live snapshot checks passed. All 260 inactive records unchanged; text, manual breaks, groups, translations and unrelated presentation fields preserved.
- Live catalogs synchronized and verified using existing alias resolution: CRC 239 published records, including four historical hidden aliases; TBI 213. Catalog versions CRC `c9fda3c3dd82b233`, TBI `3e4f9a4af25a3921`.
- Gates: 1,294 TypeScript + 35 MJS tests pass, 12 existing skips; TypeScript, build, diff check pass; lint zero errors/two existing warnings. Production renderer acceptance passes on both custom domains; four hosts health 200 and unauthenticated folders 401. Deployment metadata confirms both exact SHAs.

### Release 2f4c765: typography, wording and explicit grouping (2026-09-30 UTC)

- Daniel authorized deployment after local verification. Independent typography controls, optional serif Hebrew/classic title styling and alignment, Large Print without silent shrinking, manual breaks/keep-together, Birchot English editing, and separate controls for visual groups and slide pages. Existing defaults and source prayer wording preserved.
- Gates: TypeScript, 1,281 TypeScript + 35 MJS tests pass (12 existing skips), lint zero errors (two existing warnings), build, diff check. Twelve baseline layout stills pixel-identical; focused editor and renderer browser checks pass.
- Both deployments Ready with exact SHA verified through deployment metadata. Production renderer acceptance passed on both custom domains; all four hosts returned HTTP 200 from `/health` after redirect.
- No database migrations, prayer source changes, or relay release. Release logs and production browser evidence under ignored `work/michael-notes/`.

### Release c965df8: G11, batch_refit on stored graphics (2026-09-24 UTC)

- batch_refit compared cueHash of the built draft with cueHash of the live cue as Postgres returns it; jsonb reorders keys, so every stored graphic was skipped as differs_from_live. It now compares them as content (keys sorted, numbers at 12 significant digits). cueHash and stored hashes unchanged. Record: `docs/planning/2026-09-24-tbi-redo-tools/STATE.md`.
- No migration, no relay change. Gates at `c965df8`: `tsc --noEmit`; `npm test` 1266 + 35 pass, 0 fail; lint 0 errors (2 known warnings); `npm run build` (run before the last one-token import removal, re-built by both deployments).
- Verified: CRC `dpl_69gnCA2f7vUG4kzN67EGnsDEXBfQ`, TBI `dpl_CmjGaTc1Ut4XcXBbQiZ8LogJHJo3` Ready; four hosts `/health` 200 after its redirect; CRC live batch_refit dry run 237 of 238 would refit, 1 skipped (built-in "Thank you"). TBI's dry run is the TBI thread's call (expected 94 / 3 with accentTitleOnly). `main` fast-forwarded to `c965df8`.

### Release 608d530: setlist unit ids, and /setup S1-S3 (2026-09-24 UTC)

- `prepare_service_from_setlist` / `refresh_from_setlist` match a centralreform.live row by `liturgyRef.unitId` first (one cue covers, several go to review as alternates, none falls to page then title); `liturgyRef.stale` rows match by title and say so; the import is unconfigured on any workspace but CRC. Order and dry run: `docs/planning/2026-09-24-setlist-unit-ids/STATE.md` (Ha'azinu: covered 3 -> 6, review 6 -> 10, needs a graphic 14 -> 7).
- Also on this commit (setup pages, `docs/planning/2026-09-24-setup-pages/STATE.md`): `/setup` as each operator's install flow, the Owner-only personal Companion download (stays refused with a sentence until `COMPANION_CONNECTION_VALUES` is set and the deck validates clean; not set yet), the durable graphics URL, the siddur card on System, and validate_deck's style and placeholder checks.
- Migration `db/setup-output.sql` (`device_credentials.sealed_token`) applied to both databases before the web release: CRC 282 drafts / 5 devices, TBI 419 drafts / 0 devices, unchanged; column present after on both. No relay change.
- Gates at `608d530`: `tsc --noEmit`; `npm test` 1265 + 35 pass, 0 fail; lint 0 errors (2 known warnings); `npm run build`. (`audit-companion-packages` ok at the S3 merge.)
- Verified: CRC `dpl_CEJgLkPEaALHEjz3TTxyz3t3LZSA`, TBI `dpl_4q4daBp8uxpGqEKHGsPUbjLFoYGM` Ready; four hosts `/health` 307 to `/system#status` then 200 (the long-standing redirect), `/setup` 200, `/api/setup/deck` 401 signed out. `main` fast-forwarded to `608d530`.

### Release 9bd67bc: TBI redo tools G10 (2026-09-24 UTC)

- Branding `typography.accentTitle {scale, weight}` drawn through CSS variables only when stored; Noto Sans Hebrew SemiBold and Bold added (notofonts hinted TTF, pinned); `batch_refit` (133 MCP tools). CRC with nothing stored: 12 layout stills and 16 corner stills pixel-identical to 250c21a; cue hashes unchanged.
- No migration, no relay change. Gates at `9bd67bc`: `tsc --noEmit`; `npm test` 1242 + 35 pass, 0 fail, 12 skipped; lint; `npm run build`.
- Verified: CRC `dpl_De5FNNZonmoUALq1zifdgecXTG7R`, TBI `dpl_241sQmuFAG4ALSkF6GzNnJFyNMzW` Ready; four hosts 200 on `/health` and `/assets/NotoSansHebrew-Bold.ttf`. `main` fast-forwarded to `9bd67bc`.

### Release 186aa14: TBI redo tools G9 (2026-09-24 UTC)

- G9: a bilingual graphic may carry English-only passages as their own rows in block order (side panels together or in blocks; lower third English line; card layouts refuse). Only selections refused before reach the new path, so no existing cue changes; pinned cue and unit hashes unchanged.
- No migration, no relay change. Gates at `186aa14`: `tsc --noEmit`; `npm test` 1229 + 35 pass, 0 fail, 12 skipped; lint; `npm run build`.
- Verified: CRC `dpl_4RbF5w3zCqZx7coDF4BNfLwHcVGr`, TBI `dpl_14VvL3Ui1rScQ587MSJt6WiJAUL6` Ready; four hosts 200 on `/health`. `main` fast-forwarded to `186aa14`.

### Release db34734: TBI redo tools G7 and G8 (2026-09-24 UTC)

- G7: Raleway (OFL, @fontsource/raleway 5.3.0 woff2, 400/500, latin + latin-ext) in the font registry, selectable as the Latin font by update_branding; panel transliteration/translation rows follow the branding's Latin font. CRC golden stills 16/16 pixel-identical. G8: `batch_retire` (up to 200, dry run by default); find_catalog_issues gives its input. 132 MCP tools.
- No migration, no relay change. Gates at `db34734`: `tsc --noEmit`; `npm test` 1221 + 35 pass, 0 fail, 12 skipped; lint; `npm run build`; `audit-companion-packages` ok.
- Verified: CRC `dpl_ATybVbsGZLEDwz5vMHBD5Gdc5pf7`, TBI `dpl_4gqp82Vgs5RC7jsjJq5eoTzZFSJ1` Ready; four hosts 200 on `/health` and on `/assets/raleway-latin-400-normal.woff2` (font/woff2; sha256 2318962e… on TBI, as pinned). `main` fast-forwarded to `db34734`.

### Release 0c2e895: TBI redo tools G1-G6 (2026-09-24 UTC)

- Plan: `docs/planning/2026-09-24-tbi-redo-tools/STATE.md`. Adds file intake (open_import_dropzone, get_import, list_imports, the `/import/<token>` page), upload_asset by importId or allowlisted url with server downscale (sharp 0.35.4), local sources with kind / no page / transliteration-only blocks / no credit, import_local_sources, batch_create_drafts, apply_deck_plan. 131 MCP tools.
- Migrations first, same procedure as 6b76cbd: `public` 38 -> 40 on both (`workspace_imports`, `build_keys`). Rows unchanged: CRC 282 drafts / 457 revisions, TBI 265 / 205.
- `relay/` unchanged since `e512d86`: no relay release.
- Gates at `e7d77e1` (code identical to `0c2e895`): `tsc --noEmit`; `npm test` 1210 + 35 pass, 0 fail, 12 skipped; lint (known warnings); `npm run build`; `audit-companion-packages` ok. The CRC upload was type-checked as a `.vercelignore`-filtered copy.
- Verified: CRC `dpl_4N2DYBckX3dFQH1W28hfZ77rTxtD`, TBI `dpl_2dn5RTJ1AmgijMU2vu32N5PoNM1r` Ready; four hosts 200 on `/health` and on `/import/<token>` (an unknown token shows "This link has expired or is not valid", with `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`). `main` fast-forwarded to `0c2e895`.
- Not verified here: sharp loading on Vercel (the first large upload proves it), and the tools over OAuth (the TBI redo thread's next calls).

### Release 6b76cbd: the MCP completeness plan (2026-09-24 UTC)

- Authority: Daniel, 2026-09-24 ("go live ... everything can push to live"). Plan: `docs/planning/2026-09-23-mcp-gap-analysis/STATE.md`. The MCP now has 125 tools (29 in production before).
- Order: migrations, then relays, then web, then `main`. Released from a clean detached worktree (`crc-overlays-release`, beside this checkout) because this checkout holds another thread's untracked folder.
- Migrations: `scripts/migrate-authoring.mjs` (now lists every `db/*.sql` file) once per workspace with only that workspace's `DATABASE_URL` (CRC from the ignored local production env, TBI from a `vercel env pull` into the session scratchpad, deleted afterward). Both "Authoring schema ready", exit 0. `public` 28 -> 38 tables on both: `authoring_preview_images`, `workspace_asset_uploads`, `authoring_defaults`, `local_sources`, `workspace_branding`, `layout_definitions`, `review_boards`, `review_board_answers`, `companion_decks`, `singular_references`. Rows unchanged: CRC 282 drafts / 457 revisions, TBI 220 / 205. Additive and `IF NOT EXISTS`; the old web ignored them.
- Relays: gate read-only at 15:03 UTC, CRC 0 renderers / 1 controller, TBI 0 / 0 (a cue selected on each, nobody rendering). Clean `--dry-run`, then `deploy-relays.mjs --commit e512d86...`: status `complete`; `crc-live-relay` `b0aca062-84f1-4fea-b83a-714c15abcf5e`, `tbi-overlays-live-relay` `110aeed8-1fee-476e-bdcc-b7836a6d4d1a`. Re-probe: state kept, `lastPress` now answered. `relay/` is identical at `6b76cbd`.
- Web: three attempts stopped before any deploy, and one CRC build failed on Vercel (not promoted; production stayed on `ebd4be4`). A fresh checkout lacks the generated `next-env.d.ts` the TBI staging copies; TBI staging lacked the deck tools' JSON (`companion/definitions*.json`, the preset `CUE-MANIFEST.json`); CRC's `.vercelignore` left out those and the `companion/scripts` / `companion/tests` files `tests/cue-roles.test.ts` imports. Fixed in `1539b69` and `6b76cbd`, checked by type-checking a copy of exactly the files `.vercelignore` uploads. Then `deploy-workspaces.mjs --commit 6b76cbd...`, exit 0.
- Verified: all four hosts 200 on `/health` and `/api/workspace` (CRC `crc`, TBI `temple-bnai-israel-kalamazoo`); `/api/catalog?include=layouts` answers the new `{version,cues,layouts}` envelope on both custom domains (CRC 248 cues, TBI 219); `/author/publications` 200 on both.
- `main` fast-forwarded `c5497ab..6b76cbd` (the hazard below is closed; the Git integration rebuilds the same tree). Companion module stays 1.7.0: 1.8.0 waits on Daniel confirming its preset section names.
- Gates at `e512d86`: `tsc --noEmit`; `npm test` 1166 + 35 pass, 0 fail, 12 skipped (the first full run had two server-fit timing failures under load; 3/3 alone and a full rerun passed); lint (known warnings); `npm run build`; relay 86; `audit-companion-packages` ok.
- Not verified here: the MCP tool list over OAuth (needs a connector session; the TBI redo thread's entry gate checks it), hardware, and a publish end to end on the new build.

### Release ebd4be4 (2026-09-23 UTC)

- Released exact SHA `ebd4be4022d3b7a207b3f6bbe13ee2e6e4e5ae41`. CRC `dpl_9eT5dbGBiJpCNfaNm1jqcVpiJPmA`, TBI `dpl_F9qerggQiJ8D53kGTPdjFU6T9yHA`; four hosts 200 with those ids. The siddur picker's tabs for parts of one graphic say Group (Daniel); Slide still means a separate graphic in a set. Gates: tsc, npm test (886 + 32 pass, 0 fail), lint (2 known warnings), build.

### Release 3636857 (2026-09-23 UTC)

- Released exact SHA `363685785f5f8916b6ea1be6bc3f29f2fa7ae3b5`. CRC `dpl_H9vc1Yg55YAU3tQbZPnbEAMpVe9t` and TBI `dpl_pYumE83i9ZM2vH7LDsSijzggDoBX` Ready; all four hosts returned HTTP 200 from `/health` with those deployment ids; Arabic face 200 on both custom domains.
- Contents (plan: `docs/planning/2026-09-23-michael-review/STATE.md`): new `corner` layout (640x200, bottom-right 48px inset); per-graphic `rowOrder`; inline wording edits saved as local-variant content, listed at `/author/wording-changes` and by the MCP tool `list_wording_changes`; lower-third Hebrew accent title right-justified; the siddur picker checks translated blessings whole, moves passages between slides, and shows "Preview unavailable" with the reason.
- After release: published corner cards El Na R'fa Na `44ae41a4`, V'imru Amen `b06f734d`, Thank you `d39673be` (server fit pass).
- Gates: `tsc --noEmit`; `npm test` exit 0 (886 TypeScript pass, 0 fail, 11 skipped; 32 MJS pass); `npm run lint` (two existing warnings); `npm run build`; `audit-companion-packages`; `audit-companion-preset` PASS.

### Release f753093 (2026-09-23 UTC)

- Released exact SHA `f753093026f487b8e4f592bbb55ec893c41647d7`. CRC `dpl_BBa71ioKwDdswQHyVsKquyH67weR` and TBI `dpl_7gtBaHhpfM5qYiYBg4yTU7T7LkSk` Ready; all four hosts returned HTTP 200 from `/health` and 200 (234,892 bytes) for `/assets/NotoSansArabic-Regular.ttf`. Logs: `work/sitting-2026-09-23/tbi-arabic-staging-release/`.
- The TBI staging allowlist now carries the Arabic face; a test checks every stylesheet font face is staged. Also records the catalog receipts (packets 9-17, typo fixes).
- Gates: `tsc --noEmit`; `npm test` exit 0 (848 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass); `npm run lint` (two existing warnings); `npm run build`.

### Release 01eb7a1 (2026-09-23 UTC)

- Released exact SHA `01eb7a14c3a16d39a1d2f5b8ba5ebeb1d498a59b`. CRC `dpl_9eGwTEQn9UnScLwSwUjA9PcQhk82` and TBI `dpl_G12tYZ6XV1pLnSoYnQhDxUwUkQqn` Ready; all four hosts returned HTTP 200 from `/health`. Logs: `work/sitting-2026-09-23/right-panel-arabic-release/`.
- Custom right-panel text now sits inside the panel (gap H; the stale `.right .prayer` rule put it 16px outside); the fit check reports side-panel copy outside `.base`. Noto Sans Arabic (OFL) backs the overlay text stacks (gap I). Live proof on CRC: Thank you, Passing the Torah and Silent Prayer render inside the panel; Od Yavo Shalom shows سلام.
- Defect found after release: TBI's staged build copies an allowlist of `public/assets` files that did not include the Arabic face, so TBI served 404 for it (both TBI hosts). Fixed in the next release.
- Gates: `tsc --noEmit`; `npm test` exit 0 (847 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass); `npm run lint` (two existing warnings); `npm run build`.

### Release 5f149da (2026-09-23 UTC)

- Released exact SHA `5f149dab1c8e91048729613ee060f2f5cf611026`. CRC `dpl_A7mB3xfnRCGWnsxQAF7XdLH9aay6` and TBI `dpl_GLNFjByjTgQydFA66kctkjQC6wje` Ready; both custom domains serve those ids; all four hosts returned HTTP 200 from `/health`. Logs: `work/sitting-2026-09-23/stale-pin-rebase-release/`.
- `update_draft` no longer refuses the explicit rebase a stale pin asks for (gap D): without `refreshSourceIds` a stale-pinned draft is refused as before; with a refresh it proceeds only when every stale source it keeps is refreshed or dropped, and the pin is rebuilt from current sources. Also ships the catalog inventory and work queue (docs only).
- Gates: `tsc --noEmit`; `npm test` exit 0 (843 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass); `npm run lint` (two existing warnings); `npm run build`.

### Release e0e80ea (2026-09-23 UTC)

- Released exact SHA `e0e80eab11bc95ff4240a1d00e734efbdc6bcc5b` (code in `933557d`; `e0e80ea` adds receipts/docs). CRC `dpl_8RdUMaNdi9srxKNV5ZQAvd3uMMyb` and TBI `dpl_9y7p7DXz1kJotK7u7omL7MhSMNPK` Ready; both custom domains serve those ids; all four hosts returned HTTP 200 from `/health`. Logs: `work/sitting-2026-09-23/accent-flag-compact2-release/`.
- Compact `list_drafts` rows carry `accentTitle` and `flags.accentTitleSharedWith` (gap F review prompt). MCP publish results name the repeated cue once; set results summarize member manifests (gap G round 2). Live proof: compact Mi Chamocha rows show accentTitle and the flag.
- Gates: `tsc --noEmit`; `npm test` exit 0 (840 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass); `npm run lint` (two existing warnings); `npm run build`.

### Release 4673402 (2026-09-23 UTC)

- Released exact SHA `4673402af7f409f9bd85931fae8b486ed2890baa`. CRC `dpl_C7b2jJYbmTsbTKcbPAEBfRexzj5x` and TBI `dpl_Bjy6HXQgGas5eTLPWcP1C9HAxouL` Ready; both custom domains serve those ids; all four hosts returned HTTP 200 from `/health` (after its redirect). Logs: `work/sitting-2026-09-23/compact-mcp-results-release/`.
- Non-read MCP results drop embedded source snapshots, animation tracks, opening words and per-block pin hashes and name `get_draft` as the full record (gap G). Live proof: update_draft results fell from ~12-25 KB to ~1.5 KB.
- Gates: `tsc --noEmit`; `npm test` first run had one timing failure in `tests/rehearsal-relay.test.ts` (stale-deadline websocket `refused` vs `open` under load); isolated 3/3 pass and a full rerun passed (837 TypeScript, 0 fail, 11 skipped; 24 MJS). `npm run lint` (two existing warnings); `npm run build`.
- Upload note: one untracked documentation file (`docs/planning/2026-09-23-overlay-consistency/WORKER-PROTOCOL.md`) was written after the script's clean-tree check and may be in the CRC upload; it is not imported by app code and was committed in the following ledger commit.

### Release 8f36dd8 (2026-09-23 UTC)

- Released exact SHA `8f36dd841a0c9f6fb1fa3235dcea66843d93166e`. CRC `dpl_5xETWdEHtsWtqSE7aQpwttEMmryt` and TBI `dpl_AvbDFWEsj4kGgHB1EjKMT9HCfYoy` both reported Ready; both custom domains serve those deployment ids. The two custom domains and two Vercel aliases returned HTTP 200 from `/health` (after its redirect to `/system#status`). Receipt: `work/deploy-staging/releases/8f36dd841a0c9f6fb1fa3235dcea66843d93166e/release.json`; gate, deploy and health logs: `work/sitting-2026-09-23/edge-phrase-group-join-release/`.
- Blocks arrangement: selection groups of one source that skip no block join with a line break instead of a blank line (legacy drafts that cut one source into slices no longer overflow); a source change or skipped block keeps the blank line. Phrase display: an edge newline no longer becomes a dangling separator. Source selections, pins and text unchanged. Live proof: Psukei D'Zimrah 1 refit from fail (fill 1.077) to pass (0.997) and published as revision 2. Gap log: `docs/planning/2026-09-23-overlay-consistency/GAP-LOG.md` (A, B).
- Gates: `tsc --noEmit`; `npm test` exit 0 (836 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass, 0 fail); `npm run lint` exit 0 (two existing unused-type warnings); `npm run build`.

### Release 9c4efa5 (2026-09-23 UTC)

- Released exact SHA `9c4efa584358ddb0dea77efa6e90d214ef46e99a`. CRC `dpl_GwdL4XfXh4EpwkFCTXZMpACjB48J` and TBI `dpl_AHpCFvM1q5nPuKFzyaiNvSQt9oZY` both reported Ready. The two custom domains and two Vercel aliases returned HTTP 200 from `/health`. Receipt: `work/deploy-staging/releases/9c4efa584358ddb0dea77efa6e90d214ef46e99a/release.json`; deployment and health logs: `work/sitting-2026-09-23/phrases-blocks-release/`.
- Adds the optional source-preserving Latin `phrases` presentation (soft Latin line breaks display as separators while stanza and Hebrew boundaries remain intact) and compiles `blocks` arrangements into contiguous Hebrew, transliteration, and English paragraphs without changing source selections, snapshots, or published drafts.
- Gates: `tsc --noEmit`; `npm test` exit 0 (832 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass, 0 fail); `npm run lint` exit 0; and `npm run build` (42 routes). The final test-only commit updates two stale block-row assertions to the reviewed contiguous-row behavior.

### Release c8d7d92 (2026-09-23 UTC)

- Released exact SHA `c8d7d92a4bdc20e879b3bf4bb0bb357e91af7a4d`. CRC `dpl_AQuJHztCnTzccBYsrAB14BGXYc7N` and TBI `dpl_23tr7omUtWMB3qdzi64FtLVAxNR4` both reported Ready. The two custom domains and two Vercel aliases returned HTTP 200 from `/health`. Receipt: `work/deploy-staging/releases/c8d7d92a4bdc20e879b3bf4bb0bb357e91af7a4d/release.json`; gate and health logs: `work/sitting-2026-09-23/reflow-split-core-release/`.
- Adds source-preserving Latin paragraph display, including mixed legacy text bodies with Hebrew boundaries retained; a lower-third title-and-body height budget with actionable fit errors; and Linux Chromium core-dump prevention plus safe screenshot failure diagnostics. It also includes the reviewed authoring/MCP wiring and split tooling from the integrated release chain. Source strings, source pins, Hebrew text, and draft publication state are unchanged by the presentation path.
- Gates: `tsc --noEmit`; `npm test` exit 0 (831 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass, 0 fail); `npm run lint` exit 0 (two existing unused-type warnings in `lib/authoring.ts`); and `npm run build` (42 routes).

### Release cf87ba9 (2026-09-23 UTC)

- Released exact SHA `cf87ba95685b9befdc04d1f4b8364d9ca7561d43` from the clean paired-release guard at `2026-09-23T15:38:22.319Z`. CRC `dpl_DAYrVVEp4w8ZEL5pfAZP9WFsDveL` and TBI `dpl_5KRUjUQ9QtVVpprH12ZpskfbBKBS` both reported Ready. The two custom domains and two Vercel aliases returned HTTP 200 from `/health`. Receipt: `work/deploy-staging/releases/cf87ba95685b9befdc04d1f4b8364d9ca7561d43/release.json`.
- Aligns bilingual lower-third English and Hebrew text at their shared top edge while retaining lone-channel centering, the 250px title position, title accent lane, translations, and artwork geometry. Adds compact catalog language availability/warnings without source text, and imports the supported Thank You baseline as exact local custom text while refusing unrepresentable text channels; prayer-source imports and pins are unchanged.
- Gates: `tsc --noEmit`; `npm test` exit 0 (818 TypeScript pass, 0 fail, 11 skipped; 24 MJS pass, 0 fail); `npm run lint`; and `npm run build` (42 routes). Logs: `work/sitting-2026-09-23/combined-catalog-nonliturgical/`.

### Release ef77ea9 (2026-09-23 UTC)

- Released exact SHA `ef77ea9188ae556e94273f9abf9dc614564ef0c2`. CRC `dpl_5AATtKGtKMWopKBTzEefsfGrSAmb` is Ready and aliases `overlays.centralreform.org` and `crc-overlays.vercel.app`. The original paired-release orchestrator stopped after CRC while its remote build completed; TBI was resumed from that run's already validated staged workspace, and `dpl_7o1BKv1q9UAVDorEtPE6u1xaUXWj` is Ready with alias `tbi-overlays.vercel.app`. All four custom/alias `/health` endpoints returned HTTP 200 after completion. TBI receipt: `work/sitting-2026-09-23/title-clearance-release-ef77ea9/tbi-resume.log`.
- Restores the lower-third main title to x=250px with 10px clearance after the title medallion. The separate accent lane and body/artwork geometry remain unchanged. A live CRC image check of Light These Lights confirmed the restored title position and fit pass.
- Gates: `tsc --noEmit`; `npm test` exit 0 (814 TypeScript pass, 0 fail; 24 MJS pass, 0 fail); `npm run lint`; and `npm run build` (42 routes). Logs: `work/sitting-2026-09-23/title-clearance-release-ef77ea9/`.
### Release e13c9dc (2026-09-23 UTC)

- Released from clean exact-SHA guard `e13c9dc6eb9e16f34717318481323b6a7d4a518e` at `2026-09-23T14:56:53.400Z`. CRC `dpl_89tmVoKYcZ414iEZ6Xy1MYWeG65C` and TBI `dpl_EKT9aAGwwtWCcoGXAZ7DKhv4Qjou` both reported Ready. CRC, TBI alias, and TBI custom `/health` each returned HTTP 200 after release. Receipt: `work/deploy-staging/releases/e13c9dc6eb9e16f34717318481323b6a7d4a518e/release.json`.
- Adds bounded compact `list_drafts` inspection, dry-run-first `style_draft`, creation-only bilingual block defaults (including source-set panels), and opt-in ephemeral MCP fit images. Existing draft reads, imports, duplicates, and updates retain their historical arrangement behavior; image bytes are not persisted.
- Gates: `tsc --noEmit`; `npm test` exit 0 (814 TypeScript pass, 0 fail; 24 MJS pass, 0 fail); `npm run lint`; and `npm run build` (42 routes). Logs: `work/sitting-2026-09-23/mcp-catalog-release-d66687d/`.

### Release 43b9c8b (2026-09-23 UTC)

- `43b9c8b` is the reviewed JSON logging fix `d040865`, cherry-picked onto `088379e`. Released from clean exact-SHA guard `43b9c8b2a81ab608d63459601db15c7ffc667d65`. CRC `dpl_4pguDygcJi1w7oLxdmmWWtUhzmeS` and TBI `dpl_5oTbzWg7hMjqMLA8Tvjdq7RsTng9` are Ready; the two custom and two Vercel aliases returned HTTP 200 from `/health`.
- The read-only server-fit census and verdict behavior are unchanged. The `server-fit released` and residue lines now carry JSON strings, preventing Vercel console formatting from collapsing nested census categories, instance attribution, held files, or largest-other data to `[Object]`. No source, publication, relay, or hosted-fit action ran.
- Gates: `tsc --noEmit`; `npm test` (24 MJS checks included); `npm run lint`; and `npm run build` (42 routes). Logs: `work/sitting-2026-09-22/census-json-release-43b9c8b/`.
### Release 80c9371 (2026-09-23 UTC)

- `80c9371` is the reviewed census commit `ddcf197` cherry-picked (patch-identical) onto `642f878`.
  Released from clean exact-SHA guard `80c937139347b9d133f15b56d0dcc7a81cd86b5c`. CRC
  `dpl_DgnHxhQAK2zXJ7heqTgpRFtHQQM7` and TBI `dpl_8L4bn5cbzp9k7zt99EPEn4QPAcBj` are Ready; both
  custom domains resolve to them and all four aliases return HTTP 200.
- Adds a read-only `census {before, after}` of /tmp to each `server-fit released` line (Vercel
  only; caller latency capped at 250 ms, though a timed-out scan is not cancelled). Verdicts are
  unchanged. No source, publication, relay or human-review action ran.
- **Known defect, found after deploy:** Vercel records `console.info`, which prints nested objects
  only two levels deep. The census's `instance`, `files`, `held` and `largestOther` therefore log as
  `[Object]`; only `free`, `used`, `unattributed` and `ms` survive. Fix `d040865` (branch
  `codex/fit-census-log`, logs the line as JSON) awaits review. The hosted fit series is held until
  then.
- Gates: `tsc --noEmit`; `npm test` (787 pass, 11 skipped; 24 MJS pass); `npm run lint`;
  `npm run build` (42 routes). Logs: `work/sitting-2026-09-22/census-release-80c9371/`.

### Release 74f2051 (2026-09-23 UTC)

- Released from clean exact-SHA guard `74f20513063a5f7b562e3ab6462b9a8c39f5757c`.
  CRC `dpl_7y3jnWdf98JA3G1mJfLL3HVqgoSE` and TBI `dpl_3TxGsHmHGBpSQpJDzhmdp5vLGuNB`
  both reported Ready; custom and alternate aliases returned HTTP 200.
- Left/right single-channel copy now starts at its panel body's top edge beneath the title.
  Bilingual stacks, structured rows, and lower-thirds remain unchanged. No source, hosted
  authoring, fit, relay, publication, or human-review action ran in this release.
- Gates: `tsc --noEmit`; `npm test` (784 pass, 9 skipped; 24 MJS pass); `npm run lint`; and
  `npm run build` (42 routes). Logs: `work/sitting-2026-09-22/single-channel-top-align-release/`.

### Release 608f495 (2026-09-23 UTC)

- Released from a clean exact-SHA guard: `608f495682300f9fb0c8aee02bdda7d48192c3fc`. The paired
  CLI release record completed at `2026-09-23T01:23:37.259Z`; both custom-domain aliases are
  Ready on the deployment ids above. Required local gates were green before release. No relay
  change, push, publication, or hosted authoring refresh was performed by this release.
- `update_draft.refreshSourceIds` is now deployed. It permits an explicitly selected source
  snapshot refresh with optimistic version matching; it does not silently re-pin cosmetic edits.
- Root ran the exact 16 sequential checks on unchanged published Mah Tovu v1 / its existing
  preview: **16/16 pass**, fill `0.8040008907363421`, `server-chromium/1.63.0`. This is server
  fit evidence only; it is not human review or publication approval.
- The persistent profile/residue accounting did **not** establish that `/tmp` loss is fixed.
  Every release line reported `owned: 1`, `survivors: 0`, `heldBytes: 0`, `stillAlive: 0`, and
  scratch about 5.17 MB, yet free space fell across instances: `538333184→317767680`,
  `538333184→195379200`, then `195379200→73695232→41811968→37511168`; the final seven checks
  remained at `37511168`. No further fits were run. Evidence:
  `work/sitting-2026-09-22/fit-residue-integration/{hosted-fit-results.json,production-logs.jsonl}`.

### Release 9ab8f7b (2026-09-23 UTC)

- Released from the active `google-signin` checkout, clean, HEAD = `9ab8f7b8d61ece034b5208718f53c325d78acc36`
  (the script refuses any other HEAD or a dirty tree). Both builds 42/42 pages. Custom domains resolve to
  the two deployment ids above, both Ready/production. CLI deployments carry no git metadata, so the sha
  proof is the script guard plus served content: all five checked source `unitSha256` values equal this
  commit's `content/authoring-sources.json`. `relay/` is unchanged since `8954415`; no relay release.
  `main` was not moved and nothing was pushed (the `origin/main` hazard below still stands, now further behind).
- Sources (authenticated `get_source`): Unending Love and Yotzer Or serve the canonical parent `#block-0`
  plus `/slice-0` and `/slice-1` children carrying `canonicalParentBlockId`; the three private
  original-English sources (G'vurot interpretation, Am I Awake, How Awesome / Shema) are present with
  archive provenance.
- Hosted fit, 16 checks on the unchanged published draft "Mah Tovu" `bbd7c98b…` v1, existing preview
  `3d242037…`: **14 pass (fill 0.804, `server-chromium/1.63.0`), checks 7–8 `unavailable /
  stage_unavailable`**, no false `fail`, no retry. Checks 9 and 10 were sent together and may have
  overlapped; all others strictly serial. Failures: `phase: 'measure'`, `Target page, context or browser
  has been closed`, `tmpFreeBefore` 21.1 MB and 16.9 MB. Every check logged 0 survivors and 66 KB left in
  its scratch dir, but free `/tmp` fell 318 → 318 → 217 → 92 → 37 → 21 → 17 MB on the first instance and
  185 (×5) → 60 → 41 → 41 MB on the second. So the per-check scratch fix holds, and the remaining
  consumption is outside the scratch dir. Candidate, unverified: Playwright makes its
  `playwright_chromiumdev_profile-*` and `playwright-artifacts-*` dirs in the Node process's
  `os.tmpdir()`, not the browser's `TMPDIR`. **The server fit stage is improved (from 10/12) but not
  fixed**; the web fit check remains the fallback. Return and details:
  `crc-coordination/claude-1/STATUS.md`.

The mechanism that produced the 09-16 split is still there and will produce another:

> **A push to `main` deploys CRC production by itself.** `crc-overlays` has Vercel's Git
> integration enabled on `main`. TBI has no Git integration and is released by CLI only. So any
> push to `main` moves CRC and leaves TBI behind until someone runs the CLI release.

**TBI keeps the CLI release.** The Git-integration recommendation was withdrawn on 2026-09-20
(rulings addendum 2, correction): TBI deploys from a staged, allowlisted source tree that
`scripts/deploy-workspaces.mjs` builds, not from the raw repository, so a plain Git integration
would deploy the wrong tree. So **every release records both shas in this table**, and a release
is not finished while they differ.

**Ahead of production: nothing but documentation** (as of `9ab8f7b`; the paragraph below describes the
earlier `8954415` release). Released on 2026-09-22 from `google-signin` —
`main` was **not** moved, so CRC's Git integration has not built this and will not until `main` is
brought forward. Commits released, in order past `603e593`: `c5497ab` (slot graphics), `fa008ac` (A1,
one overlay stylesheet), `d1ab609` (server fit-stage readiness hardening, another session's),
`91a35a9` (A2, the Siona resting logo, module 1.7.0), `85e881d`, `9159d7c`, `6fc8bc3`, `2668bfd`
(documents), `8954415` (keeps TBI's 1.6.0 archive in the staging allowlist; the first web attempt was
refused by staging, before any deploy, for its absence).

> **Closed 2026-09-24: `main` was fast-forwarded to `6b76cbd`, the released commit.** Historical: **Hazard: `origin/main` is at `c5497ab`, behind production.** Any push to `main` of that line, or
> a redeploy of CRC's latest Git build, would put CRC back on `c5497ab` — without the resting logo,
> A1's stylesheet or the fit hardening, and under a Companion 1.7.0 whose logo buttons it would refuse.
> The fix is a fast-forward: `git push origin be8e7da:main` (`origin/main` is an ancestor). The
> Git integration then rebuilds the same tree. The releasing session's sandbox refused that push as
> a production deploy, so it has not been done. Nothing is pushed: `origin/google-signin` is still
> `ebcc893`.

Owed after this release, recorded in RETURN-A2 §8: the resting logo has not yet been exercised on the
production output — the releasing session's sandbox refused authenticated production commands — and
the server fit stage still fails at `measure` after ten rapid checks (10/12 passed; checks 11–12
`stage_unavailable`, `Target page, context or browser has been closed`).
(`d33408c`) was held back over Kol Nidre and Yom Kippur and merged on 2026-09-20 once Daniel confirmed
the overlays are not used for either service and do not go live until the following week; it has been
on `main` and in production since then, and the 2026-09-22 order to merge it found nothing left to do.

**Three more commits released on 2026-09-22 at 15:00 UTC**, in order: `273ec83` (the Cowork handoff),
`523178c` (slots, "This service", Companion module 1.6.0) and `603e593` (a `.gitignore` line the
release script needed). `4a61f2d`, the converter run, touches only `scripts/` and `docs/` and is
carried along. `relay/` did not change, so no relay release was owed. Both hosts answer 200, `/author`
renders, and `/this-service` answers 200 on both.

The Companion module archives: **1.7.0** is served and `WORKSPACE_COMPANION_MODULE_PATH` points at
it on both — CRC `public/downloads/crc-overlays-1.7.0.tgz` (sha256 `63ba9093…6555`), TBI
`public/workspaces/temple-bnai-israel/downloads/tbi-overlays-1.7.0.tgz` (sha256 `b2435a42…6c90`), both
verified byte-identical as served. 1.6.0 and earlier stay downloadable. `@companion-module/base` and `runtime.apiVersion` are still 2.0.4 — Companion 5.0.3 silently
refuses 2.2.0 and above.

**Earlier on 2026-09-22, three commits**, in order: `c5b8b96` (the author-page split), `d15a163` (the
source-commit stamp) and `6ac07d2` (four Companion research documents another session left untracked
in this worktree, landed so the release ran from a clean tree). `relay/` did not change, so no relay
release was owed. Both hosts answer 200 and `/author` renders.

**Five releases on 2026-09-20**, in order: `96cd715` (Wave 2 commits), `4d80925` (library at
shireishabbat `425f52f`), `a0913a4` (the shadcn strip and the staging fix it required), `c05e244`
(library at shireishabbat `ad89282`), `70ad8bb` (this file, taken for parity). `relay/` did not change, so no relay release was owed.

## Relay workers

Both workers ship from the same commit, and they ship **before** the web (`docs/RELAY-RELEASE.md`).
Released with `node scripts/deploy-relays.mjs --commit <sha> --confirm-production --gate-file <path>`;
the gate requires `renderers: 0` on both.

| Worker | Environment | Version id | Commit |
|---|---|---|---|
| `crc-live-relay` | default | `b0aca062-84f1-4fea-b83a-714c15abcf5e` | `e512d86` |
| `tbi-overlays-live-relay` | `tbi` | `110aeed8-1fee-476e-bdcc-b7836a6d4d1a` | `e512d86` |

Released 2026-09-24 15:03 UTC (V1 command outcome, preconditions and lastPress; A3 out-of-pinned-cue; L2 approved layouts; seventh relay release; rollback target `00f3c73f...` / `dd1e9899...` from `2668bfd`). Before it: released 2026-09-22 19:44 UTC (the resting logo's `logo` action and state field; sixth relay release).
Gate, taken by Daniel read-only at 19:43: CRC 0 renderers / 1 controller, TBI 0 / 0. Record:
`work/deploy-staging/releases/2668bfd…/relay.json`, `status: complete`. `relay/` is identical at the
web commit `8954415`. Previous: `c013c8eb…` / `47f7d260…` from `0fb6514` (2026-09-20), which is the
relay rollback target; the new relay serves the old web unchanged.

## Environment deltas

- CRC only (2026-09-30): `COMPANION_CONNECTION_VALUES` now carries Michael's nine backup-derived equipment connections. CRC Setup's personal deck download is available to its signed-in Owners. Configuration release and real Companion 5.0.5 import evidence: `docs/planning/2026-09-30-michael-companion/STATE.md`.
- Both: `PUBLIC_BASE_URL` is the congregation's own custom domain, `PUBLIC_ALTERNATE_ORIGINS` its
  Vercel hostname. CRC swapped 2026-09-15; TBI 2026-09-14. All four hosts answer.
- CRC only: `CRC_LIVE_BASE_URL`, `CRC_LIVE_READ_TOKEN` (setlist import from centralreform.live),
  `SHARED_LIBRARY_EXPORT_KEY`.
- TBI only: `CRC_SHARED_LIBRARY_URL`, `SHARED_LIBRARY_IMPORT_KEY`.
- Both: `OVERLAYS_PUBLIC_NOW` is **unset**, and stays unset. `/api/now` answers 404 by design.
- Every name is listed with a placeholder in `.env.example`.

## Databases

Neon, one per workspace, 38 tables each since 2026-09-24 (see Release 6b76cbd). 40 since release 0c2e895 (`workspace_imports`, `build_keys`). **No migration is pending.**

One ran on 2026-09-22, before the release that needed it, from `scripts/migrate-authoring.mjs`:
`authoring_revisions` gained `source_commits text[]` on both, 9 columns to 10. `ADD COLUMN IF NOT
EXISTS`, nullable, no default, so no table was rewritten and no row was touched — CRC 193 revisions /
217 drafts and TBI 205 revisions / 220 drafts, unchanged either side, 28 tables still. Every existing
row is NULL and nothing backfills them; the stamp starts with the next publish. Reversible with
`DROP COLUMN`.

## Known-open, carried here so it is not lost

- `isolationVerified` is `false` on both workspaces and has been since the first deploy. It is set
  honestly after the rehearsal with Michael, not before.
- The MCP publish chain has never been watched end to end against the deployed function
  (Deploy record 25, "Not verified end to end"). It needs an authoring-scope MCP session, which
  only Daniel can consent to.
- **The source-commit stamp still has not been seen carrying anything.** Seven real revisions were
  published into CRC's production library on 2026-09-22 (the slot graphics), so the write path has now
  run for real — and every one recorded `sourceCommits: null`, correctly: a slot is a local custom
  graphic with no pinned library sources, so there is nothing to stamp. A published revision of a
  graphic built from the siddur is still what would show it.
- **All sixteen slot graphics are published, and all sixteen still carry placeholder text.** They were
  minted with *Reader Name* / *Guest Name* / *Name* because the fit check needs something to measure
  and the MCP surface refuses an empty string. Nothing is on air — no button points at a slot until
  Michael's converted deck is imported — but they want blanking through "This service" first. See the
  return document, §8.
- **The fit-check stage refuses after about five checks in a row.** It is the gate on every publish
  in the system, not just slots. The refusals are `stage_unavailable` and `deadline_exceeded`, never
  `browser_unavailable`, so Chromium launches and the `/author/fit-stage` page it loads is what fails
  — that page answers 200 in 0.1 s from outside. Retrying the same preview immediately often gets
  through; a deployment always clears it. Anyone publishing a batch should expect it.
- **`save_slots` has not been exercised against Postgres.** Its tests run against the in-memory
  repository. The publish gate it widens is the same function in both repositories, and the six
  published slots went through the Postgres path by the ordinary route, but the one-click slot Save
  itself has only been proven in memory. The first real Save on "This service" is the test.
- **`app/author/page.tsx` is 870 lines, not the under-500 the order asked for.** W2B §5's six
  extractions are all done and are what shipped; the remaining ~370 lines are the thirty async
  handlers and the 130-line return, and lifting them means either action hooks with ten to sixteen
  injected dependencies or splitting `AuthorPage` into a library view and an editor view. The second
  is the right answer and is a redesign, not a lift. See the commit message on `c5b8b96`.
- **Nothing automated covers the authoring editor's behaviour.** The three test files that mention
  `app/author/page.tsx` read it as text and assert on markup. Undo/redo, recovery copies, draft sets
  and the shared shelf have no coverage at all, which is why the split above stopped where it did, and
  why §5's own verification asks for a manual pass and a `fit_check_draft` comparison that only Daniel
  can run.
- **CRC's database carries three extra schemas holding copies of authoring data**:
  `crc_authoring_rehearsal`, `recovery_1789266627016_4533dca5` and `recovery_1789306559735_c9c2c2d7`.
  The last two are retained restores from `scripts/restore-recovery-rehearsal.mjs`, which prints a
  `DROP SCHEMA … CASCADE` and leaves the schema for inspection. They are inert and were not touched by
  the 09-22 migration, which alters `public` only. TBI has `public` alone. Dropping them is Daniel's
  call.
- `GET /api/history` cannot be read by anyone here: it answers an authoring member or a
  `history_reader` credential, and no `history_reader` has been minted. A `CONTROL_KEY` is
  refused. This is what stands between here and the Wave 3 confirmation.
- ~~`content/siddur-library.json` and `content/moments.json` are behind the upstream rulings.~~
  **Closed 2026-09-20.** Both were regenerated from shireishabbat `425f52f` and merged (PR #6,
  `4d80925`): four ruled-retired unit ids out, four successors in, two changed, and the moments
  table now matches the producer's exactly. On deployed production 153 of 206 cues carry a
  position, including the three Kedusha cues and the five High Holy Day cues whose pins the
  regeneration retired — those five forward through `content/retired-units.json`. Regenerated again
  the same evening from `ad89282` (PR #7, `c05e244`): no unit id added or removed, 26 Rosh Hashanah
  morning units changed — 28 Hebrew strings recomposed into canonical order, byte-different and
  NFC-identical, no wording touched — and four folios shifted down one where a page came out
  upstream.
- ~~`SHIREISHABBAT_TOKEN` cannot read the source repository's Actions.~~ **Closed 2026-09-20.**
  Daniel granted `Actions: read`, and run 35526355940 took the published `dist-app` artifact
  directly — 22.8 MB from the producer's run 35524500710, which concluded `failure` while its
  `publish-app-surface` job succeeded, the exact case the fetcher was written for. The checkout
  fallback stays in the workflow and is now the path nothing uses.

## Two things the 2026-09-20 evening release found

- **The TBI staging allowlist required `hooks/`**, which the shadcn strip emptied, so the first
  release after it refused before touching anything. `scripts/stage-workspace-source.mjs` now copies
  that one directory when present. CRC deploys from the repository and never saw it; only the staged
  workspace did, which is the whole reason the two paths are worth keeping honest about each other.
- **The Tests workflow had never run.** It declared `permissions: {}`, which grants a job token
  nothing — not even `contents: read` — so `actions/checkout` could not read this private repository
  and all twelve runs since 2026-09-19 died before a single test. Fixed in `1d217d4`; the first
  green run on `main` is 35526516798, all three jobs. Anything merged to `main` between 09-19 and
  09-20 was covered by local runs only.
