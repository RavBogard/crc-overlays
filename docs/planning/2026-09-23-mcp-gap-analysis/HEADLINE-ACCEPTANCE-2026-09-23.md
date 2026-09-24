# Headline acceptance receipt (2026-09-23)

Plan: [HANDOFF-CODE-2026-09-23-mcp.md](HANDOFF-CODE-2026-09-23-mcp.md), "Headline acceptance". Code at HEAD
`1bd7afe` (branch google-signin). Harness: `scripts/headline-acceptance.mts`.

**Result.** CRC passes every step. TBI passes steps 1 and 2 and `check_service_on_deck`. As specified, it fails
at `validate_deck`, so no export link is made. The cause is a product bug (Finding 1). A variant with one extra
read call avoids the bug, and in that variant TBI passes every step. No code, repo or release change was made
during steps 1-3.

**Re-run after the Finding 1 fix (same day).** The conversion now matches only graphics whose draft is not
archived, the same view `validate_deck` uses (lib/companion-deck/convert.ts, defaultDeps). TBI re-run as specified,
real Chrome fit, 88 calls (seed 2, convert 2, prepare 1, readiness 2, get_service 2, search_sources 16,
create_draft 16, ship_draft 16, resolve_coverage_row 20, sync 4, check 2, get_deck 3, validate 1, export 1):
conversion bound 192 (matching TBI-CONVERSION-REPORT.md), readiness 1/4/16 → 21/0/0, 16 of 16 ships passed,
`check_service_on_deck` 21 of 21 placed, `validate_deck` ok (0 errors, 0 warnings, 168 cues bound), and a signed
full export link was produced. **Both workspaces now pass every step as specified.** Findings 2-5 stand.

## Setup
- Setlist: centralreform.live `cd16ef0f-d874-47fc-9085-d85fdcc2054d`, "Shabbat Morning — Parashat Ha'azinu —
  September 19", book `crc-saturday`, 35 tracks. It was read once, earlier, through the centralreform.live MCP
  (read-only).
- Run: `node node_modules/tsx/dist/cli.mjs scripts/headline-acceptance.mts --workspace crc|tbi --setlist <file>
  [--skip-archived]`. The harness runs one process per workspace, with that workspace's built-in profile.
- Calls: every counted call is a JSON-RPC `tools/call` through the real `createAuthoringMcpHandler`. The calls
  are routed exactly as `authoringOperation` routes them. The deck, conversion and branding tools go through
  `authoringOperation` itself. All other tools go to an authoring service over the same in-memory stores. That
  service differs from the default one only in the server-fit origin.
- Not counted (harness setup, the "before" state):
  - Each in-memory store is seeded with the workspace's committed catalog snapshot.
  - CRC: `docs/planning/2026-09-23-overlay-consistency/companion/catalog-snapshot-2026-09-23.json`, 282 drafts
    (43 archived, 34 unpublished).
  - TBI: `tests/fixtures/tbi-catalog-2026-09-15.json`, 219 cues (8 whose draft is archived).
  - Production revision numbers are kept. Seeded drafts are dated 2026-09-01, before either deck's last sync.
  - `get_setlist` is answered from the file through the injected `liveSetlistDependencies` transport.
- Server fit: **real**. `measureCueOnServer` (the deployment's own runner) opened local Chrome on
  `/author/fit-stage` of `next dev --webpack --port 5193`. The dev server ran with the workspace's own
  `WORKSPACE_ID`, `DATABASE_URL` empty and rehearsal storage. It was stopped after each workspace.

## CRC: pass (75 calls)
| Step | Calls |
|---|---|
| 1 | `prepare_service_from_setlist` 1, `service_readiness` 1 |
| 2 | `get_service` 1, `search_sources` 14, `create_draft` 14, `ship_draft` 14, `resolve_coverage_row` 19, `service_readiness` 1 |
| 3 | `sync_deck_with_catalog` 3 (dry, dry with placements, apply), `check_service_on_deck` 2, `get_deck` 2, `get_service` 1, `validate_deck` 1, `export_deck_config` 1 |

- Readiness before: 27 rows. 3 covered, 5 need review, 14 need a graphic, 5 not needed.
- Readiness after: 22 covered, 0 need review, 0 need a graphic, 5 not needed ("Every row is covered or needs no
  graphic.").
- Graphics authored and shipped: 14 of 14. Every fit was a real pass (renderer server-chromium/1.63.0, fill
  0.44-0.57, 1.1-1.5 s each). No duplicate names.
  - Eleven are lower thirds made from the first bilingual block of the matching source: Modah Ani (Halpert),
    Elohai N'shamah (Pourmorady), P'sukei D'zimrah, Chatzi Kaddish, V'ha-eir Eineinu (Carlebach), Sh'ma
    (major), Mi Chamocha (Moshav), Adonai S'fatai (trad), Mi Shebeirach, Eitz Chayim (Weisenberg) and Closing
    Blessing.
  - Three are custom title cards, because no source has a bilingual block for them: Ma Tovu / Hinei Ma Tov
    (trad), Bar'chu Walkdown and Hakafah — Oseh Shalom (Nava Tehila).
- Review rows: 5, each settled with its first candidate (Avot 2, Gevurot 1, Vshamru, Bsefer Chayim, Torah
  reading 5). A person would choose these.
- `check_service_on_deck`: ready, 22 of 22 needed graphics placed on the Sat pages (chain 10-16).
- `validate_deck`: ok, 0 errors, 0 warnings, 249 cues bound (the seed has 235).
- `export_deck_config{scope:'full'}`: a signed link was produced. It expires 15 minutes after it was made
  (02:34 UTC on 2026-09-24).

## TBI: fails as specified (88 calls); passes in the variant (89 calls)
- Setlist source: TBI has no centralreform.live setlist. The same CRC setlist went through the same transport.
  The importer did not refuse it. The service was matched against TBI's catalog.
- Step 0, deck onboarding through the MCP (counted):
  - `seed_deck_from_export{useCommittedSeed:true}`, a dry run, then the apply (deck version 1).
  - `convert_singular_deck`, a dry run: 195 Covered, 46 Needs review, 13 Needs a graphic.
  - `convert_singular_deck` apply, binding the Covered rows.
  - The variant also calls `list_archived_drafts` once.

| Step | Calls |
|---|---|
| 0 | `seed_deck_from_export` 2, `convert_singular_deck` 2 (+ `list_archived_drafts` 1 in the variant) |
| 1 | `prepare_service_from_setlist` 1, `service_readiness` 1 |
| 2 | `get_service` 1, `search_sources` 16, `create_draft` 16, `ship_draft` 16, `resolve_coverage_row` 20, `service_readiness` 1 |
| 3 | `sync_deck_with_catalog` 4, `check_service_on_deck` 2, `get_deck` 3, `get_service` 1, `validate_deck` 1, `export_deck_config` 1 |

- Readiness before: 27 rows. 1 covered, 4 need review, 16 need a graphic, 6 not needed.
- Readiness after: 21 covered, 0 need review, 0 need a graphic, 6 not needed.
- Graphics shipped: 16 of 16, every one a real pass (TBI profile on the stage).
  - These are the same 14 as CRC, plus Avot v'Imahot, V'shamru and Hoda'ah.
  - Mi Shebeirach was a review row here, not a missing graphic, so TBI did not author it.
  - The same three rows are custom title cards.
- Review rows: 4 (Gevurot 2, Sim Shalom 2, Blessing BEFORE Torah Reading, Mi Shebeirach Arian 2).
- Sync applied: 17 placed, 0 not placed. `check_service_on_deck`: ready, 21 of 21.
- As specified: `validate_deck` fails with 7 errors, and `export_deck_config` refuses:
  > The deck has 7 errors, so it was not exported. Page 2 "PAGE", row 0 column 3 ("Lecha Dodi 1") is bound to
  > cue "L'cha Dodi 1" (9176c6cd-…), which is not published. Publish it or bind a published cue. …
- Variant (`--skip-archived`): the harness leaves 7 Covered rows unbound (188 bound) because their graphic's
  draft is archived. Then `validate_deck` is ok (0 errors, 165 cues bound), and a signed link was produced. It
  expires 15 minutes after it was made (02:35 UTC on 2026-09-24).

## Findings
1. **Conversion and validation disagreed about "published" (bug; fixed, see the re-run above).** An archived draft that still
   has an active revision stays in the live catalog. The production SQL and the memory store both keep it.
   - `convert_singular_deck` matches against that catalog. It marks 7 of Simone's buttons Covered, and binds
     them, to such graphics (L'cha Dodi 1, Shalom Aleicheim, Hineih Mah Tov, Kedusha Friday Night, SP - Rav
     Nachman, Olam Chesed Yibaneh, Shofar Blessings).
   - `validate_deck` and `sync_deck_with_catalog` count archived as unpublished ("Its cue is no longer
     published. Bind a published cue (bind_cue) or remove the key.").
   - So a bind the conversion offers makes the deck unexportable. Fix it one way or the other: the conversion
     skips archived drafts, or the catalog drops them.
   - The C4 report's "both decks pass" validated the unbound seed only.
2. **The grammar alone placed none of CRC's 14 new graphics.**
   - The default `sync_deck_with_catalog` dry run: "0 placed … 14 not placed".
   - Some reasons were "No page holds its slot yet (no key names the same prayer or song) …". Others were "It
     shares a slot with keys on N pages, and nothing in its name says which service it is for."
   - `check_service_on_deck` passes the service name as a hint, and it gave a `wouldGo` for only 2.
   - The harness chose a page for the other 12 and passed placements with the page only; the grammar chose the
     cell. The harness's rule: the page of the nearest earlier service row already on the deck, within the chain
     that holds most of the service's graphics, moving along the chain when a page is full.
   - This is agent judgment that the MCP does not supply.
3. **TBI has no standing pages the MCP can name.** Simone's pages are all named "PAGE", and the deck has no
   chains. "Standing page" came from where the service's other graphics already sit (pages 3, 96, 98, 99).
   Whether those are the right pages is Simone's call.
4. **The default sync scope on a deck never synced is the whole catalog.** On TBI, the first default dry run
   proposed 79 cues (17 placed, 62 not placed). The service scope (the `cueIds` from `check_service_on_deck`) is
   what an agent must pass. This is noted, not a bug.
5. **The setlist's book does not narrow a source search.** `search_sources{book:'crc-saturday', page:<folio>}`
   returns nothing for the setlist's own folios, so the search went by title. The matched sources come from
   several books (Shirei Tshuvah, CRC Shabbat Morning, CRC Beit Mitzvah). A person should pick the book.

## Limitations
- The stores are in memory. The seeded graphics carry each cue's real id, name, title, layout and revision,
  but not its words. So readiness matching ran on names only; production may cover more rows by body text.
- centralreform.live was not called by the server. The transport was injected. The TBI setlist is CRC's.
- The migrations these tools need are not applied anywhere: companion-decks, authoring preview images,
  authoring-defaults, local-sources, assets, layout-definitions, workspace-branding and singular-references.
  On a deployment without them, the deck tools refuse "store not set up".
- The fit ran on a local dev server with local Chrome, not on Vercel. A cold start there is not measured.
- Authoring policy: each new graphic is one opening lower third or a title card, not the whole prayer. Every
  review row took its first candidate. The export signing key was a throwaway key for this run. The link and
  signature are not recorded.
- Hardware follow-up is not claimable here: Michael imports the CRC export and Simone the TBI export in a
  staffed rehearsal, and both confirm every option and the Rendered lights.
