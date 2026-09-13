# Build completion before the two-congregation beta

Daniel authorized completing all feasible product work before beta with Michael and Simone. This extends the deployed `180b88a` foundation. The scope remains two congregations, their existing graphics libraries, non-AI authoring, and the approved thirty-outcome roadmap.

## Definition of build complete

An operator can sign in, find or create a graphic, select exact siddur text or make an explicitly attributed local variant, adjust the supported design, organize and review every slide, recover mistakes, publish the reviewed version, and locate it for operation through the website. Congregations can reuse all current and future CRC publications while keeping their local edits independent. Owners can understand availability, recover data, manage access, and collect beta observations through maintained product surfaces.

The build must include working persistence and authorization, meaningful failure handling, automated checks against relevant real infrastructure, and browser verification. A planning document or a new navigation link does not complete a feature.

## Delivery workstreams

| Workstream | Required product outcomes |
| --- | --- |
| Visual authoring | Recognizable previews in the library; recoverable archive; multipart slide strip, ordering, duplication and whole-prayer review; explicit local variants and readable provenance; guided publication; bounded asset selection; useful alignment, spacing and reset controls. |
| Source review | Persisted detection of changed source passages, old/proposed text and impacted variants; accept into unpublished review work; defer/reject with reasons; stable source snapshots and local-variant attribution. |
| Service preparation and beta records | Optional reusable collections with alternates and multipart groups; maintained service-coverage records; unrestricted access to the global catalog; quick issue/fallback recording and export. |
| Ownership and recovery | Real authoring/relay/synchronization/presence status; honest usage freshness and unavailable states; affordable operation; recoverable backups and isolated restore verification; integrated setup, help and account access. |
| Operator and visual integration | Persistent emergency actions, clear requested/rendered/unknown states, collections and multipart context without mandatory weekly preparation, forgiving search and clean labels, consistent navigation, explicit Hebrew/Latin typography, keyboard/contrast checks. |
| Release and beta handoff | Same tested application release for CRC and TBI, protected published output, verified membership and sharing boundaries, reproducible migrations, complete product evidence and a short beta task guide. |

## Product boundaries

- Source text is never silently rewritten. A local variant is an explicit, attributed choice.
- Preview, service preparation, source acceptance and recovery rehearsal never issue live commands.
- Saving, publishing, delivery to the catalog, browser rendering and actual program output are different states.
- Collections are optional; spontaneous cue access and established Stream Deck positions remain available.
- Recovery must not use production outages or destructive production restores as a test.
- Missing provider measurements are unavailable, not zero. No speculative billing totals or additional purchases.
- General-purpose animation timelines, scripting and arbitrary layer/widget systems remain outside this bounded product.

## Evidence reserved for beta

Michael and Simone must still validate clean-computer installation, their actual OBS/vMix and Companion/Stream Deck controls, camera composition, viewing-distance readability, full-service coverage and restart/network/emergency recovery. These require their equipment and judgment. Build completion does not claim Singular replacement or on-air acceptance.

## Integration checkpoints

1. Agree API and ownership contracts before overlapping edits.
2. Complete features and focused tests, including real PostgreSQL coverage for new persistence behavior.
3. Review the connected browser workflows and fix observed usability problems.
4. Run integration checks, isolated recovery and degraded-state rehearsals.
5. Deploy the same clean source revision to both congregations and verify production boundaries without changing active graphics.
6. Record remaining beta-only observations separately from unresolved implementation defects.

## Build evidence 2026-09-13

This records what was actually checked on 2026-09-13. The work is **uncommitted** on `codex/product-expansion`; both congregations are still running commit `180b88a` in production. Nothing here claims Singular is replaced or that the beta is finished.

### Automated checks

- `tsc --noEmit` — clean.
- `npm test` (new aggregate script; a tsx runner over `tests/*.test.ts` and `app/author/*.test.ts`) — **207 tests, 201 pass, 0 fail, 6 environment skips.** The skips are environmental, not failures: three PostgreSQL suites self-skip without `TEST_DATABASE_URL`, one Windows symlink-privilege skip, one access rate-limit PostgreSQL skip, and one oauth-store skip.
- `npm run lint` — **0 errors, 0 warnings**, after `work/` and `relay/` were added to the eslint ignore list.
- Companion package audit — CRC and TBI each have 2 pages and 24 cue buttons, both have clear actions, neither embeds credentials, and the modules are byte-identical.
- `npm run build` (production, Next 16.2.6, Turbopack) — **exit 0 in about 18 seconds** with the dev server stopped. 27 static pages generated; the route table includes `/author/fit-check` and all new API routes.

### Browser rehearsal (isolated)

Run against the isolated PostgreSQL schema `crc_authoring_rehearsal` with a synthetic owner account ("Claude QA Reviewer") and the relay unset, so no live command was possible at any point. Verified by hand:

- Invitation redeem and sign-in; navigation filtered by role, resolving the role itself; the signed-out invitation page shows only Live control.
- Library thumbnails. **Add from siddur** clears the old `?draft=` id.
- English-only source search and retrieval ("Unending Love"); passage selection; template selection.
- Alignment and line spacing apply live; **Reset** restores template defaults without touching the text.
- Save writes the draft id into the URL; reload preserves Centered alignment.
- SVG upload rejected server-side with the form input retained; PNG accepted as a content-addressed asset.
- An unpublished asset's content route returns 404 while the authenticated preview returns 200 `private, no-store`.
- Publication gated on zero fit errors and loaded assets. After publishing a fitting version, the asset became published, the content route returned 200 public/immutable, and the catalog payload carried `imageAssetId` only — no URLs.
- Artwork **Archive** kept the content route serving for historical outputs; **Restore** returned the tile; archiving the currently selected artwork marked the draft unsaved and switched the preview to the congregation logo with an explanatory message.
- Console **Inspect** via `/?inspect=` issued no command; **Show** and **Clear** were disabled with the relay disconnected; the uploaded artwork rendered.
- Health page: relay **Not configured**; output presence "unavailable, not zero"; Neon 24/25 USD owner-reported warning; aggregate unavailable with 1 of 3 providers.
- Services: degraded entries retained for missing references, optional collections, and the feedback CSV export link.
- Multipart: **Make slides from whole prayer** on Mourner's Kaddish (Shirei Shabbat) produced an atomic 3-slide set with the URL on slide 1; **Move later** reordered slides; **Duplicate slide** produced 4 slides; **Review whole prayer** flagged "duplicated (2)".
- Source review: the scan found the rehearsal fixture change for Mah Tovu and showed the exact previous and proposed text with revision hashes. **Accept** created a new unpublished draft ("Source review rehearsal — source update"; draft count 9 → 10) and left the original untouched. 21 unopened baseline graphics were honestly reported as not comparable.

### Recovery drill

Export produced 19 checked files and verified. Restore ran into the isolated schema `recovery_1789306559735_c9c2c2d7`: 9 drafts, 7 revisions, 2 collections, 1 feedback record, 1 usage report, and 1 asset whose restored bytes hash to its own asset id (byte-exact) with its published flag preserved. No existing table was touched. The schema was retained, with its exact cleanup statement in the evidence file under `work/recovery/rehearsal-drill-20260913`.

### Rendered catalog fit check

A new author-only page, **/author/fit-check** ("Rendered catalog fit check"), renders every published cue with the real renderer at 1920×1080 and reports the editor's fit errors. It is read-only: it never publishes and never sends output.

Two checker bugs were fixed first — it no longer compares a paragraph's own line boxes against each other, and it now allows a 6 px font-metric tolerance, because Noto Sans Hebrew's content area exceeds its line box. Current CRC-branded result after those fixes, run against the rehearsal schema's published catalog: **26 of 26 published graphics fit at 1920×1080 with the bundled fonts; 0 need attention.** This is a rehearsal-schema count, not a production catalog count.

For the record, the pre-fix run reported 23 of 26. The three then flagged were Birchot Hashachar 1 and 2 — four-row panels with a 2 px content-area overhang, visually verified correct at full size — and a rehearsal-only test cue.

The check was then re-run with the dev server started as `WORKSPACE_ID=temple-bnai-israel-kalamazoo`, against the same rehearsal schema with the TBI catalog map applied: **29 of 29 published graphics fit at 1920×1080 with the bundled fonts; 0 need attention.** A TBI-branded Mah Tovu was also inspected visually through console **Inspect** at 1920 wide — the TBI logo and palette rendered and the text was legible. This is TBI *branding* evidence against a rehearsal-schema catalog; it is not cross-workspace isolation evidence.

### Fixes landed today

Text fit is now measured after bundled fonts and artwork settle, with an idempotent `applyFit` and one shared 8 s asset deadline. Artwork load failure falls back to the congregation logo instead of an error state. The MCP draft schema accepts `alignment`, `lineSpacing` and `imageAssetId`. Workspace navigation filters by role and resolves the role itself. Health never renders unknown output presence as zero. The services **409** conflict refreshes the collection while keeping typed input. The prepared-collection selector defaults to "No prepared service". The console Inspect preview renders uploaded artwork, and prayer text ink color is now defined at the overlay level — a pre-existing production bug that made the Inspect stage render text white-on-cream. Alignment and line-spacing controls were relabelled (Template default / Logical start / Centered; Template default / Compact / Spacious) with `aria-pressed`. New-draft route clearing was extracted into a tested helper. The asset picker gained Archive, Restore and Show archived, and the quota message now says archived artwork counts. The publish dock says "Fix fit issues to publish" when a reviewed version has fit errors, and starting new work clears the stale preview. Shared-asset import tolerates malformed remote labels.

### Not yet done

- Production migration and the paired deployment of both workspaces.
- Commit of this work. Nothing is deployed.

**Known limitation:** the publication fit gate is client-side only. MCP and API publishes are not fit-checked server-side, because rendering requires a browser.

### Still beta-only

Michael's and Simone's own machines, OBS/vMix composition, Stream Deck behavior, viewing-distance readability, full-service coverage, and the restart/network/fallback rehearsal. Cross-workspace isolation remains operationally unverified — `WORKSPACE_ISOLATION_VERIFIED` stays **false**. No accounts or invitations exist for Michael or Simone; Daniel must create invitations from `/access` when ready. Singular stays available.
