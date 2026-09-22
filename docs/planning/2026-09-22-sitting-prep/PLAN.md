# Overlays visual and workflow revision

Status: plan grounded in Daniel's September 22 sitting; two Claude discovery sessions running. [AUTHORIZATION.md](AUTHORIZATION.md) records Daniel's subsequent authorization for coordinated implementation and hosted changes across associated projects. The product is not in active use.

Source: `C:/Users/dsbog/Downloads/Overlay Design and Workflow Updates_otter_ai.zip`, complete transcript, 00:01–12:17. The recording is requirements evidence; questions and tentative suggestions are not treated as settled implementation decisions. Otter's prayer names require matching against actual button labels and cue IDs.

## Outcome and scope

Daniel's source decision: the existing CRC siddur supplies the default wording and service context for this revision. Shirei Shabbat Friday-night adoption is a later phase. Preserve this distinction in cue provenance, defaults, titles and service/deck choices. Complete verse options requested in the sitting remain part of the current work, but supplemental variants must be labeled and must not silently replace CRC wording.

A complete new visual draft of the overlay catalog, applying the sitting's general critiques everywhere relevant. First acceptance milestone: CRC Friday evening/Kabbalat Shabbat and Saturday morning, including the applicable Shirei Shabbat material. Review the rest of the catalog in a second bounded pass using the same rules; do not let that larger pass delay the first milestone.

Daniel's clarification after the sitting: derive Michael's organizing logic and build a replacement workflow; exact current button positions are not a requirement. Infer his patterns from repeated page structures, service progression, color and label conventions, continuation placement, navigation, and graphics combined with camera/switching actions. Distinguish consistent habits from historical accidents, with evidence and confidence for each inference. Preserve familiar operating concepts, toggle behavior and truthful requested/rendered feedback while allowing subtle, justified improvements to grouping, placement, navigation and continuation sequences.

New Overlays pages become the primary working set; retain the old set as an accessible fallback. Propose a coherent page design rather than copying each existing page literally. Explain consequential moves in a before/after map, and verify navigation and references. Preserve camera, audio, switching, triggers and other unrelated functionality; any repositioned combined control must retain its complete action sequence and timing.

## Stated direction

- Prefer lower thirds whenever the content remains readable. Inspect every side-panel cue; split long material into coherent continuation panels rather than shrinking it to force a fit. Record reasons for retained side panels.
- Group Hebrew and transliteration into coherent paragraphs/stanzas rather than alternating individual lines. Where stacked, Hebrew precedes transliteration. English-left / Hebrew-right lower thirds are a praised pattern to retain. For side-by-side language columns, align the tops. Otter includes a side-by-side suggestion too: do not interpret “Hebrew on top” as requiring one universal geometry for every layout.
- Give titles clear space from the decorative circle/logo. Improve readable scale and use of available panel space. Preserve Hebrew order, punctuation and source wording.
- Provide complete prayer/song sequences and corresponding buttons, following Michael's existing naming/color/order conventions. “Full” must be checked against the intended source/version, not guessed from a similarly named prayer.
- Replace the CRC logo button's current scan-card behavior with a small Siona image at bottom right. Daniel confirmed the Siona image replaces the former hands image; the existing asset is `public/assets/siona-floor.jpg`. Use an unobtrusive treatment without a surrounding scan-card panel; the JPEG itself has no alpha transparency, so verify the crop/mask treatment visually rather than assuming a transparent source. When enabled, hide it for any active overlay and restore it when the overlay clears. Michael can disable it persistently.
- Keep invitations brief and warm. Proposed healing copy: “To include someone in our healing blessing, please share their name in the chat.” Proposed memorial copy: “To remember someone during Kaddish, please share their name in the chat.” These are draft editorial choices.

## Specific review ledger

All names below are transcript interpretations until matched to source/button IDs. The first two workers must return exact mappings and mark ambiguity rather than silently choosing.

| Transcript location | Requested review |
| --- | --- |
| 00:01–06:16 | Hineni title spacing; Light These Lights and Yedid Nefesh lower-third feasibility; verify all Shiru l'Adonai verses; Shalom Aleichem and garbled “yomses / Ozium” language grouping and legibility. |
| 00:01–06:16 | Mizmor L'David split with separate buttons; all L'cha Dodi verses; add missing “Am I Awake” words to its Barechu variant from the correct source. |
| 00:01–06:16 | Ma'ariv Aravim blocks; diagnose “How Awesome” Shema; diagnose We Are Loved 1/2 sharing behavior and unreadable layout; identify “Avatar” and apply paragraph treatment; Hebrew above transliteration in V'ahavta; remove visible HTML from “Psalms ish” 1/2 after identifying the cues. |
| 06:16–12:17 | Hashkiveinu Randy panel fill/readability; Hashkiveinu Daniel lower third; V'shamru blocks; Sanctuary/Adonai S'fatai line breaks; R'tzei grouping; identify/rework “Odivo”; Olam Chesed Hebrew/transliteration and lower third. |
| 06:16–12:17 | Healing invitation; identify “Mishra” and missing Hebrew; diagnose Silent Prayer; Refa'einu Hebrew formatting; El Na R'fa Na La lower third; Aleinu grouping; memorial invitation; Kaddish language order; Adon Olam blocks. |
| 06:16–12:17 | Priestly Blessing: three Hebrew lines, one per blessing, honoring their growing word lengths; Shehecheyanu and short Kiddush column alignment; source-complete full Kiddush; diagnose Thank You. |
| Throughout | Preserve successful patterns: House of Prayer, Hinei Mah Tov, Ana B'choach, Candle Blessing, basic Shema, much of L'cha Dodi/V'ahavta, praised English/Hebrew lower thirds, Motzi, announcements and Awake and Arise. Identify exact cues before treating these as comparison references. |

## Execution sequence

### 1. Two bounded discovery handoffs

Run Packet A and Packet B concurrently if desired. They write separate return documents only. A maps visual rules to rendering/authoring contracts; B inventories source completeness, cue identities and Michael's deck. Neither changes application code or live data. This prevents parallel workers from independently editing shared catalogs or working over the existing converter changes.

### 2. Astra integration and representative visual draft

Combine the returns into one cue/page ledger. Resolve language layouts, approved logo asset, source variants, page relocation map and ownership. Implement shared presentation rules first, then prove them on representative examples: short lower third, long bilingual prayer, mixed English/Hebrew, multi-panel song, names invitation, and three-line Priestly Blessing. Keep existing successful cues as regression comparisons. Determine whether content comes from generated files, published authoring revisions, or both before editing it; a JSON edit alone must not be mistaken for a change to the live library.

Logo acceptance includes cue switching and exit animation, operator-off behavior, reconnect/reload, and emergency clear semantics. Proposed emergency rule: CLEAR NOW blanks all output; ordinary cue dismissal restores an enabled resting logo. Verify compatibility with existing commands before finalizing. Audit scan-card controls, reserved fit rectangle, feedback and workspace configuration; do not replace TBI branding with CRC's logo.

### 3. Catalog-wide application, priority services first

Apply approved patterns and source-completeness corrections to every priority cue. Check exact source blocks and variants; never reconstruct sacred text from Otter spellings or memory. Complete missing verses and continuations with distinct cue IDs and buttons. Diagnose linked We Are Loved buttons at both cue mapping and action levels. Render every affected panel in a review gallery/contact sheet with source/cue IDs and pass/fail annotations; fit checks alone do not establish readability.

Once shared presentation contracts are stable, content revision and deck conversion may be separate worker packets with non-overlapping ownership. Repeat for remaining catalog categories and report outstanding coverage explicitly.

### 4. Michael's replacement deck and rehearsal

Reconcile the existing converter diff without discarding its changes. Use the verified current export as evidence of Michael's habits and as the functional baseline. Retain a full original backup, build the new primary set around the inferred page logic, and place the old pages at documented fallback positions. Produce a before/after page/button map explaining improvements and consequential moves. Favor predictable placement of recurring actions, readable labels, sensible continuation sequences and fewer unnecessary page changes when the evidence supports them. Do not equate an existing inconsistency with a preference or redesign for novelty. Recheck internal references, multi-action sequences and timing, continuation reachability, aliases and preserved non-graphics functionality. Resolve contradictory import-sheet instructions against the actual setup UI.

Workflow acceptance: walk representative services using the proposed pages, including alternate verses, long-prayer continuations, name cards, clearing and returning to the service. Compare navigation burden and discoverability with the original; document intentional tradeoffs and confirm Michael can understand the evolved conventions during rehearsal.

Verify with the existing deck checker and Companion 5.0.3 upgrade harness. Clear slot placeholders and exercise real Save before import under the agreed live-data workflow. Hardware acceptance must cover rendered confirmation, repeated toggles, clearing, reconnection, fallback and operator readability; a home-computer preview does not prove cameras or vMix.

### 5. Dynamic assignments and CentralReform.live: design proposal

The sitting asks whether Claude can assign/change Companion blocks while preserving Michael's experience. Recommended first design: a small reserved bank of stable button slots whose server-side cue assignments and labels can be edited through authenticated authoring tools. Keep commands resolving stable slots, with visible assignment previews, versioned changes and rollback. Decide what happens when an assignment changes while its old cue is live. Do not rewrite all of Michael's buttons as the first experiment.

For chart-to-overlay workflow, investigate existing CentralReform.live capabilities and source identifiers before promising automation. Proposed flow: select chart/song and intended text variant → create or update overlay draft → source/fit review → publish → assign to a prepared slot. Generating a chart should not silently publish or change the on-air cue. This stage needs a separate contract and bounded pilot, after core Shabbat acceptance.

## Verification and release boundaries

Focused tests during changes; at integration run TypeScript, npm test, lint and build (stop shared dev server first). Companion changes require package audit and relevant module/deck tests. Browser verification must include all affected layout families and a complete priority-service visual coverage ledger. Preserve source provenance, IDs, Hebrew correctness, and workspace isolation.

Repeated fit-stage publishing failures are an existing blocker to reliable batch publication. Investigate and verify recovery for catalog-wide publishing; preview work can proceed independently. Use before/after previews and focused checks as engineering evidence, not as a separate user-permission gate for hosted changes. Daniel has authorized changes and deployment across associated resources; see AUTHORIZATION.md. Record both workspace SHAs for releases and distinguish local, deployed and hardware-accepted status. Unused deployments do not require preserving obsolete contracts merely to avoid changing a live system; coordinate their consumers when evolving them.

## Open decisions

1. Resolved: Daniel specified the Siona image, replacing the former hands image; use existing `public/assets/siona-floor.jpg`. Final size/crop remains a visual-preview decision.
2. Ambiguous transcript names and versions: resolve from the export and existing source library first, then ask only for remaining content choices.
3. Fallback page destinations and new continuation positions: propose from occupied-page inventory before moving anything.
4. Reserved dynamic bank size and live reassignment behavior: decide after the core revision draft.

## Next action

Daniel can relay Packet A and Packet B below to two Claude Code sessions. Returns remain local for Astra to read; no transcript or private source material needs to be pasted into an external service beyond the authorized local coding workflow.
