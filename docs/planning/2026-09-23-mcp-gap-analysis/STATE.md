# MCP completeness: current state

Gap analysis: [GAP-ANALYSIS.md](GAP-ANALYSIS.md) (recommendation IDs R-F*, R-A*, R-H*, R-L*, R-B*, R-S*, R-V*, R-C*).
Code order: [HANDOFF-CODE-2026-09-23-mcp.md](HANDOFF-CODE-2026-09-23-mcp.md).
TBI source deck (contains connection config; gitignored, never copy out):
`work/companion-conversion/tbi-2026-09-14/TBIComputer-2026-09-14-1618-source.companionconfig`.

## Goal
Any editor at CRC or TBI can create, modify, pull, publish, retire and run overlays, and keep the Companion
deck in step with them, through the MCP, with no code change and no novel workaround.

## Decisions (Daniel, 2026-09-23, answered in session)
1. Users: any editor at both congregations. Every tool is workspace-aware and self-explaining.
2. Live control is in the MCP under a separate opt-in scope `crc.live`, offered to every role that has
   `control` on the web today (Admin, Editor, Operator). Matches the web; nothing tightened.
3. Live target: `target:'live'` is required; `'rehearsal'` is refused in plain words. A rehearsal relay
   room is a later, separate plan.
4. Agents yield to the deck: while a Companion pressed a button within the guard window, agent live
   calls are refused unless `override:true` with a reason; agent commands are visible on the deck.
5. Publish end-to-end on a server fit pass plus the server-rendered image; every agent publish lands in
   a review list with the image and a rollback.
6. Retire removes a cue everywhere: editor library, Companion's picker and the relay catalog. Relay
   behaviour is tested before the change ships.
7. Layouts as data for Corner and every new layout (card primitive, pixel-identical Corner first). The
   existing lower third, left and right panels stay built-in until golden stills prove a migration.
8. Companion: a stored per-workspace deck model owning the whole deck (camera, vMix, X32 included),
   plus richer module presets. Decks are complete, stable libraries, changed occasionally for big
   changes; Michael and Simone keep every option in front of them and decide while leading. No weekly
   service page; no `generate_service_page`.
9. TBI: convert Simone's Singular deck to TBI Overlays inside this plan, keeping her layout and colours,
   adding Rendered feedback lights, and surfacing Needs review / Needs a graphic and deck defects.
   Simone is already on Companion 5.0.5.
10. Privacy: the cue log may store each command's `commandId` (correlation id; no member or connection
    identity). Agents may set and clear names lists (same on-air refusal as the web).
11. In scope: structured custom content, branding as data (with the font registry), asset tools.
12. Headline acceptance test: centralreform.live setlist → prepared service → missing graphics
    authored and published → deck check shows every graphic the service needs is placed on its
    standing service page → full-deck export ready for the next big import. Both workspaces.

## Work
Packets, ownership and acceptance: the Code handoff. Shape: a small foundation wave (MCP module split,
identity, registry, font registry, TBI derivation), then five tracks that can run side by side —
publish pipeline, layouts, services, live, Companion — with hygiene and branding after their
prerequisites.

## Progress (branch google-signin; nothing released)
- Wave 0 done 2026-09-23. P0 d5e185b/f4aa64c (lib/mcp/{catalog,authoring,services,...}.ts behind the
  tool-list snapshot tests/fixtures/mcp-tools.json; regenerate only with MCP_TOOL_SNAPSHOT=write).
  P1 256d33a (names its congregation; required `workspace` on every change, optional-but-checked on reads;
  get_workspace; instructions). P3 150c85a (lib/font-registry.ts). P4 bf38f41 (TBI module derivation by
  replacement, not counts). P2 d6b0a32 (lib/layout-registry.ts; Player sets `data-contain`).
  Gate at d6b0a32: tsc clean; npm test 896+38 pass, 0 fail; lint 0 errors; build ok;
  audit-companion-packages ok; renderer tests 31 pass.
- GATE: tools/list snapshot compares tools sorted by name, not registration order — proceeded because MCP
  clients attach no meaning to list order and the split necessarily reorders two authoring tools.
- GATE: P1 accepts the short name as well as the id for `workspace`, and reads take it optionally —
  proceeded because it removes friction without weakening the mismatch refusal.
- GATE: both "layout must be" refusals now list layouts in registry order (bottom, left, right, or corner);
  one test updated — proceeded because it is an error sentence, not product copy.
- P2 touches lib/player.ts (adds an inert `data-contain` attribute); it rides the next paired web release.
- Next: open the tracks with A1, L1, S1, V1, C1 as the first packet of each.

## Evidence
Four read-only audits (MCP surface, layouts/renderer, Companion, live/services/access) plus a
structural read of Simone's export; synthesis and file/line references in GAP-ANALYSIS.md.

## Open questions
- Consent page copy (lib/oauth-http.ts) still says "Publishing still requires an exact preview reviewed in
  the <congregation> web UI." Since D18 an MCP actor can review (after a server fit pass) and publish, so the
  sentence understates the grant. Wording needs Daniel; P1 only replaced "CRC" with the workspace name.
- Release authority for this plan's releases (relay first, then paired web): not granted by this file.
- Guard window length for decision 4 (proposed: 5 minutes since the last Companion press).
- Michael's installed Companion build and connection labels (OPEN-QUESTIONS Q3/Q4 of the preset work)
  before any deck import.
