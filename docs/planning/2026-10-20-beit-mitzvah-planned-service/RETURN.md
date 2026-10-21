# Planned-service preparation and refresh

Current implementation: branch `codex/beit-mitzvah-planned-service`, isolated checkout `C:/Users/dsbog/crc-overlays-beit-mitzvah-service`, based on `origin/main` `6e225d7`. Verified the deployed `498c719` is its ancestor. The dirty `google-signin` primary checkout was preserved. No Overlays deployment, database mutation, live command, Companion edit, renderer change, or new credential occurred.

## Delivered

The portal staff link `/services?setlistId=<ID>` now expresses a source selection without treating the query as authority. Only the existing author-authorized source listing can validate it. If the linked ID is outside the recent 20-service picker, the same server-side scoped CRC reader resolves that exact ID and appends a metadata-only summary. Unknown IDs, foreign organizations, mismatched replies, and refusals never choose an unrelated service. Unconfigured workspaces, TBI, and non-authors still see no integration information.

A unique prepared collection with `origin.setlistId` opens automatically for a validated link, including an archived preparation. Several matches require an explicit choice. Existing preparations expose **Preview changes**, rather than importing another copy by default. A new source exposes **Prepare service**, which remains an explicit operator action. Immediately before creating, the browser rechecks saved collections and reuses work that appeared since the panel loaded. This is not a new cross-process uniqueness constraint: the existing repository permits intentional duplicate collections, and simultaneous imports in separate clients can still require choosing between preparations afterward.

Preview and apply use the existing author session and `/api/authoring` `refresh_from_setlist` domain. No authentication route was added or loosened. The preview includes changed matches, retained choices, missing rows kept for review, and the resulting order, including changes that affect only order. The web always applies `removeMissing:false` and submits the preview's `expectedVersion` and opaque `expectedSourceRevision`. A source fingerprint binds the service ID/version, the fetched source identity/metadata, stable matched row/graphic/coverage inputs, and the missing-row policy. It excludes generated IDs and transient timestamps. The same single fetched match is validated and applied; a different source/match produces `source_conflict`, and operator edits produce `version_conflict`. Both require another preview. Existing direct MCP apply behavior remains compatible when no optional fingerprint is supplied, per parent direction.

Source order drives refresh. Existing operator graphic choices, manual rows, and missing rows retain the domain's established merge behavior. Names remain on the existing explicit controls. Preparing, previewing, or refreshing does not publish a graphic or put anything on screen.

## Files

- `app/services/page.tsx`, `setlist-import.tsx`, `services-data.ts`, `services.css`, and `planned-service.ts`: source validation/selection, archived-aware prepared reuse, explicit preparation, and reviewed refresh UI.
- `lib/service-collections.ts`: optional `requestedSetlistId` exact lookup through the existing author-only listing operation and scoped reader.
- `lib/service-tool-schemas.ts` and `lib/service-tools.ts`: optional preview fingerprint, stable validation, order preview, existing refresh writer.
- `tests/planned-service.test.ts`, `tests/live-setlists.test.ts`, `tests/mcp-services.test.ts`, and `tests/fixtures/mcp-tools.json`: source-selection and metadata boundaries, far-future lookup, stable/stale refresh, source ordering, and the deliberate five-line optional-schema addition.

## Verification

Measured in this checkout using synthetic/in-memory inputs only:

- Focused command: `node node_modules/tsx/dist/cli.mjs --test tests/planned-service.test.ts tests/mcp-services.test.ts tests/live-setlists.test.ts`: 33 tests passed. Cases include known/unknown/foreign/malformed query IDs, ambiguous/archived preparations, exact future lookup, refused/mismatched/foreign metadata, unconfigured no-transport behavior, generated-ID-independent fingerprints, stale source/version refusal, retained decisions/manual rows/missing rows, and order-only refresh.
- Browser fixtures against the actual Next services page at 390 px and 1280 px: ten scenarios passed. Covered existing reuse, unavailable link without fallback, explicit new preparation, ambiguous archived match choice, unconfigured and operator absence, stale-source and stale-version feedback, and a distant-future linked service. No import/refresh occurred on mount; previews sent no apply request; applies sent the preview version/fingerprint. No live-command or Names mutation request occurred. No horizontal overflow. Current screenshots are in `visual/`.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed. Full `npm test`: 1,356 TypeScript tests (1,343 passed, 13 existing skips, zero failures) and all 35 MJS tests passed. `npm run lint`: zero errors and the two existing unused-import warnings in `lib/authoring.ts`. `npm run build`: passed, including its TypeScript check and static route generation. The dev server was stopped before builds.
- Impeccable mechanical scan reported the pre-existing unused `.setlist-import-suggested` three-pixel accent-border rule in the incumbent stylesheet. No new detector finding was introduced. That old selector is not rendered by this workflow; unrelated styling was preserved.

The first focused run found test-fixture typing/method errors and an effect-based preview-reset lint error; those were corrected. The first full suite then found the expected MCP schema snapshot mismatch from the optional fingerprint. Regenerated only that five-line fixture addition with `MCP_TOOL_SNAPSHOT=write`, then reran the gate. No failure was omitted. Verbose evidence remains under ignored `work/beit-planned-service/`.

The repository's primary dependency directory was empty. The session-created junction to it was preserved under ignored `work/beit-planned-service/empty-primary-dependencies`, and `npm ci` installed the isolated checkout's own dependencies. No primary dependency files were changed.

## Remaining and next action

Parent Astra owns final integration. Independent review should inspect query authorization, the existing author-route boundary, preview binding, and the remaining multi-client duplicate-import limitation. This local pass does not validate deployed credentials, a live centralreform.live read, real database writes, physical booth hardware, or operator acceptance. Complete the repository's existing release checks and paired-workspace process before any authorized deployment; do not release this branch automatically.
