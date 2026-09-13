# Approved product expansion backlog

Status: approved; implementation in progress, acceptance evidence still required
Scope: CRC plus one invited congregation
Updated: 2026-09-12

## Purpose and boundaries

This backlog turns the thirty approved product recommendations into bounded, testable outcomes. It plans the product experience rather than prescribing an implementation. An item is complete only when its acceptance evidence exists; passing protocol or browser tests cannot substitute for operator, program-output, or viewer evidence where those are required.

The current baseline is the September 12 product-expansion build. Neon service has been restored on Launch, and the relay still serves the last synchronized approved catalog without depending on Neon. Push clients, session access, setup, workspace identity, expanded source browsing, manual authoring, and local cue inspection now have implementation foundations. Physical Stream Deck operation, vMix/OBS compositing, camera-linked controls, restart/network recovery, a complete service-order run, and cross-workspace isolation remain unverified.

The initial expansion is intentionally limited to two congregations: CRC and one invited congregation led by the user's rabbi friend. Details of tenancy, invitation, identity, and installation are defined in companion planning workstreams. This backlog names their product dependencies without deciding those workstreams' design.

The invited congregation's known operating baseline is OBS plus Companion/Stream Deck. Its starting content model is a deliberately selected set of CRC materials that it may customize within established permission and provenance boundaries. The current deployment assumption is two isolated congregation deployments of one maintained product release, rather than two forked codebases. That remains a planning assumption until DEP-TENANT selects and validates the isolation model; this backlog does not authorize either deployment.

The following product constraints apply throughout:

- Michael's normal workflow remains spontaneous: stable Stream Deck locations, one-press cue selection, and immediate recovery. Preparing a weekly run of show is optional.
- Michael can create, edit, duplicate, and publish through a polished web experience without using AI. AI assistance remains optional and cannot be a prerequisite for any ordinary authoring task.
- **Add from siddur** is a primary manual action: browse/search the permitted siddur collection, select a prayer or passage, and insert paired language content with suggested readable panels. It must reach beyond prayers that already have overlays; see WEB-13 in `WEB-EDITOR.md`.
- Canonical prayer text is selected from an authorized source and is never silently rewritten, synthesized, or copied between language roles.
- Full-height side panels and the upper-right logo placement remain part of the accepted visual direction.
- Renderer acknowledgement means the browser matched requested state; it never claims that vMix/OBS placed the graphic on air.
- Sharing with the second congregation requires content permission and congregation/account isolation before its material is enabled.
- Existing Singular controls and graphics inputs remain available during CRC's parallel trial.

## Implementation status ledger

“Foundation” means the product behavior exists in the working tree and has automated evidence. It does not satisfy acceptance criteria that explicitly require Michael, the invited congregation, physical hardware, program output, viewing-distance review, permissions, or recovery drills.

| Outcome IDs | Current evidence | Status / remaining gate |
| --- | --- | --- |
| MANUAL-01–04, FEAT-03 | Web library, create/duplicate, canonical and custom content modes, autosave/conflict state, unsaved preview, exact-version review, publish, history, and rollback are implemented. | Foundation; complete Michael usability walkthrough and second-congregation access evidence. |
| FEAT-01 | Source-backed whole-prayer draft-set creation is in active implementation, with conservative block-preserving pagination planned. | In progress; multipart operating controls and operator validation remain. |
| FEAT-02, USE-03, UX-01 | Search now normalizes Hebrew niqqud and punctuation; source results rank familiar names/opening words; the console separates local **Inspect** from live **Show**. | Foundation; validate recognition and error rate with Michael. |
| USE-02, UX-02 | Web control exposes immediate cut/animate-out and distinguishes requested, rendered, disconnected, and no-output states. | Partial; emergency control on every physical page and operator comprehension remain. |
| UX-03, OWN-02, OWN-03 | Invitation/session access, workspace identity, setup/account links, scoped output URL, downloadable Companion assets, setup documentation, and sign-out are implemented. | Foundation; complete clean-machine install, package recovery, version-drift, and handoff drills. |
| ADAPT-01–02, LIT-01 | Server-side source library spans the imported authorized collections with source/feed/unit pins, exact blocks, book/service facets, presentation variants, and bounded browser responses. | Foundation; permissions for sharing, reviewer-facing provenance, and two-workspace evidence remain. |
| REL-01, OWN-01 | Neon has recovered; relay playback remains independent; push replaces steady state polling; payload limits, cost range, and operating alerts are documented in `HOSTING-COST-AND-RELIABILITY.md`. | Foundation; provider-dashboard monitoring, membership-query optimization, and outage drill remain. |
| GAP-01–03, USE-01, VIS-01–03, REL-02–03, LIT-02–03, A11Y-01–03 | Planning and acceptance criteria exist. Renderer/browser checks cover fit and protocol behavior. | Acceptance or implementation remains; do not report these outcomes complete. |
| ADAPT-03 | Reusable service collections remain optional. | Backlog; weekly preparation cannot become mandatory for live operation. |

## Dependency contracts

These contracts let this backlog remain usable while the detailed installation and two-congregation plans are developed elsewhere.

| Dependency | Contract this backlog relies on | Blocking effect |
| --- | --- | --- |
| **DEP-AUTHORING** | Restore dependable authoring, preview, approval, publication, history, and rollback. When unavailable, the product accurately reports that synchronized playback still works. | Blocks authoring-dependent acceptance and any second-congregation content publication. |
| **DEP-HARDWARE** | Complete staffed acceptance using Michael's actual Companion/Stream Deck and chosen vMix or OBS workstation, including program monitor evidence. | Blocks claiming CRC service readiness or replacement readiness. |
| **DEP-INSTALL** | Provide a Michael installation/onboarding path comparable in simplicity to opening a hosted service: establish identity/access, copy a congregation-scoped output URL into OBS/vMix, connect Companion, install a reviewed page package, verify health, and make recovery discoverable. OAuth is a candidate mechanism, not a predetermined requirement. The same path must account for the invited congregation's known OBS plus Companion/Stream Deck environment. | Blocks rollout beyond the current manually configured workstation and informs setup/status UX. |
| **DEP-TENANT** | Define invitation, identity, role, congregation isolation, output/control authorization, content ownership, offboarding, and support boundaries for exactly two congregations. Evaluate the working model of two isolated deployments on one maintained release without allowing configuration or code forks to drift. | Blocks enabling the invited congregation. |
| **DEP-SOURCES** | Establish the invited congregation's authorized source corpus, permissions, attribution, and change authority. | Blocks its prayer authoring and publication. |
| **DEP-WEB-EDITOR** | Deliver the manual web-authoring epic below: familiar library/create/duplicate entry points, clear sacred-source versus local-variant treatment, resilient editing, exact visual review, and unambiguous publication. | Blocks treating authoring as a usable product for Michael or the invited congregation. |

## Cross-cutting enabling epic: manual web authoring

This epic is additional enabling work discovered while planning the approved recommendations. Its four tasks do not replace or renumber the thirty approved outcomes below. Detailed interaction design belongs in the companion web-editor plan; these are the backlog contracts that the approved outcomes depend on.

### MANUAL-01 — Familiar library, create, and duplicate entry points

**Outcome:** Michael can begin from the library, create an appropriate new graphic, or duplicate an existing one without understanding source records, cue IDs, revisions, or AI tools.

**Acceptance criteria:**

- The library provides obvious **Create** and **Duplicate** actions using language familiar from Singular-style graphics workflows.
- Creating begins by choosing a useful content/layout starting point; duplicating begins from the exact visible approved graphic and never alters it.
- Prayer/source graphics, local variants, and custom non-liturgical slides are distinct choices with a short explanation at the point of choice.
- Michael creates one source-backed prayer variant and one custom non-liturgical slide from the web UI without AI or developer assistance.
- The invited congregation can start from the selected shareable CRC materials without seeing unshared CRC content.

**Priority / phase / dependencies:** P1; Phase 2, required before Phase 3; DEP-AUTHORING, DEP-TENANT, DEP-SOURCES. Enables FEAT-02, FEAT-03, ADAPT-01, and ADAPT-02.

### MANUAL-02 — Sacred source, labeled local variant, and custom text

**Outcome:** The editor supports both canonical liturgical material and ordinary custom slides while making their authority unmistakable.

**Acceptance criteria:**

- Canonical source text is visibly protected from inline rewriting and retains the provenance required by LIT-01.
- A congregation may create a labeled local liturgical variant only through the permission and review path defined for that source; the label remains visible through review and history.
- An editor can create non-liturgical custom text such as an announcement, welcome, or authorized reading without pretending it came from the sacred source corpus.
- Duplicating a source-backed cue does not silently convert its text into unrestricted custom text.
- Reviewers can tell canonical, authorized translation/original, local variant, and non-liturgical custom content apart before publication.

**Priority / phase / dependencies:** P1; Phases 2–3; DEP-AUTHORING, DEP-TENANT, DEP-SOURCES, LIT-01. Enables FEAT-03, ADAPT-01, and LIT-02.

### MANUAL-03 — Resilient direct editing

**Outcome:** Routine visual editing is forgiving and recoverable for a nontechnical user.

**Acceptance criteria:**

- Editable fields and visual properties use direct labels and controls; ordinary work does not require JSON, source selectors, prompt writing, or technical IDs.
- Autosave clearly distinguishes saved, saving, offline/failed, and conflict states and never claims a failed save succeeded.
- Undo/redo covers the current editing session, while retained draft/revision history covers return after closing or publishing.
- Concurrent or stale changes cannot silently overwrite another editor; the resolution view explains the conflict in user terms.
- Leaving with unsaved or failed changes cannot discard them without a clear warning and recovery choice.

**Priority / phase / dependencies:** P1; Phase 2; DEP-AUTHORING, REL-01. Enables FEAT-03 and OWN-02.

### MANUAL-04 — Exact visual review and clear publication effect

**Outcome:** An editor understands what the graphic looks like and exactly when changes can affect live operation.

**Acceptance criteria:**

- The editor provides a continuously useful visual composition view plus an exact 1920×1080 review of the saved version.
- Preview remains isolated: editing or previewing cannot issue a live command or acknowledge as a broadcast renderer.
- Any edit after approval invalidates that approval, and publication identifies the exact approved version being published.
- The UI states plainly that publication changes future selections, does not replace the currently selected graphic, and may still require live-library synchronization or Companion catalog/page refresh.
- After publication, the next selection of that cue is verified against the published revision without putting it on program during authoring.

**Priority / phase / dependencies:** P0/P1; Phases 0–2; DEP-AUTHORING, UX-01, REL-01. Enables FEAT-03, ADAPT-01, LIT-02, and OWN-03.

## Priorities and phases

- **P0 — restore/prove:** a present blocker to safe operation or truthful product status.
- **P1 — CRC-ready:** required before treating CRC's ordinary service as operationally complete.
- **P2 — two-congregation pilot:** required before or during the invited congregation's bounded pilot.
- **P3 — sustain/extend:** valuable after the two-congregation operating model is proven.

Phases are gates, not dates:

| Phase | Exit condition |
| --- | --- |
| **0. Restore and measure** | Authoring is dependable or accurately degraded; service coverage is known; setup and hardware acceptance can be run; health language is truthful. |
| **1. Complete CRC ordinary service** | One ordinary service can be run end to end through stable controls with program-output evidence, safe fallback, readable approved graphics, and no known required cue gaps. |
| **2. Mature the product experience** | Manual web creation/editing, cue finding, variants, preview, visual consistency, provenance, source-change review, and maintained operator guidance form a coherent product rather than separate engineering tools. |
| **3. Pilot the invited congregation** | The second congregation can be invited, onboarded, isolated, supplied with authorized sources and variants, and operated without affecting CRC. |
| **4. Sustain two congregations** | Health, capacity, recoverability, maintained documentation, and feedback from both congregations support continued operation. |

Items may begin earlier, but they cannot be accepted before their dependencies and evidence gates are satisfied.

## 1. Gaps and completeness

### GAP-01 — Service coverage map

**Approved outcome:** For every prayer, reading, recurring non-prayer graphic, alternate, and service close used in the target ordinary service, show whether it is ready, incomplete, awaiting visual review, awaiting operational review, or intentionally omitted.

**Known baseline:** The production relay has 24 visible cues plus five compatibility records. The remaining archived graphics and camera-linked buttons have not been reconciled against what Michael actually uses. Archive count does not establish service coverage.

**New work:** Build a product-facing inventory around service needs and actual operator usage. Preserve distinctions among missing content, intentionally omitted content, visual review, and operational review.

**Acceptance criteria:**

- A named ordinary CRC service has a reviewed inventory covering every point at which Michael may reasonably show a prayer, reading, announcement, transition, or close.
- Every inventory row has an owner, explicit status, source/content decision, and link or identifier for the corresponding approved cue when one exists.
- Michael reviews the inventory and identifies any graphics he still expects to reach through Singular.
- An intentionally omitted item records the reason and does not count as complete by absence.
- The map can filter the set still blocking an end-to-end service and reports visible cues separately from compatibility aliases.

**Priority / phase / dependencies:** P0; Phase 0; no implementation dependency. Feeds GAP-02, GAP-03, FEAT-01, ADAPT-03, and OWN-03.

### GAP-02 — Complete one ordinary service end to end

**Approved outcome:** Make the system sufficient for one ordinary CRC service, including alternates, multipart prayers, spontaneous jumps, closing graphics, and accompanying camera workflows.

**Known baseline:** A morning subset exists and browser fit checks have passed. A complete service-order run and camera-linked workflow have not been rehearsed.

**New work:** Close all blocking rows from GAP-01, place approved cues into stable operator controls, and validate a whole service in realistic operating conditions.

**Acceptance criteria:**

- GAP-01 has no unresolved blocker for the selected ordinary service.
- Michael can select any required cue directly without first building a weekly run of show.
- Multipart and alternate content can be entered at the correct panel directly, and the closing state is unambiguous.
- A staffed rehearsal runs the entire service order, including at least two spontaneous jumps and representative camera changes, with program-output evidence.
- Every observed return to Singular is classified as intentional fallback or a tracked product gap.

**Priority / phase / dependencies:** P1; Phase 1; DEP-AUTHORING, DEP-HARDWARE, GAP-01, FEAT-01, USE-01, REL-02.

### GAP-03 — Parallel-trial replacement decision

**Approved outcome:** Make the one-month parallel trial produce a clear, evidence-based decision about replacing Singular for the approved CRC service scope.

**Known baseline:** The rollout plan preserves Singular pages, connections, camera controls, and graphics inputs. No shared definition of trial success or record of fallback moments exists.

**New work:** Define lightweight service observation and a decision review that focuses on operator behavior, missing product capability, reliability, and viewer quality rather than raw cue count.

**Acceptance criteria:**

- Before the trial, CRC agrees on measurable decision questions: service coverage, operator confidence, recovery, readability, visual quality, and operational burden.
- Each fallback to Singular records the cue/context, reason, impact, and whether it reveals a product gap; recording takes less than one minute after service and does not burden live operation.
- At least two complete ordinary services are observed after GAP-02 acceptance.
- The trial review produces one explicit decision: replace for the approved scope, extend with named blockers and a date, or retain Singular with named reasons.
- No retirement or removal of Singular assets is implied by a positive decision; that is a separate authorized action.

**Priority / phase / dependencies:** P1; Phases 1–2; GAP-02, DEP-HARDWARE, REL-01, REL-02, REL-03.

## 2. Feature base

### FEAT-01 — Prayer-centered multipart controls

**Approved outcome:** Present multipart prayers as one prayer with clear panel position, direct access to any panel, and an optional next-panel action.

**Known baseline:** Multipart prayers are represented by separate cue records and visible Companion buttons. Some sequences have hidden compatibility aliases after density consolidation.

**New work:** Add a prayer-level product model and operator presentation while retaining stable cue IDs and direct spontaneous access.

**Acceptance criteria:**

- Every multipart prayer is identified by one recognizable prayer name and displays “panel n of total” wherever panel context matters.
- Michael can go directly to any panel without advancing through earlier panels.
- A next-panel control is available where useful, but services can be run without using it.
- Stable existing cue IDs and accepted button positions remain valid through migration.
- The final panel cannot silently advance into another prayer; its next action is absent or explicitly identified.

**Priority / phase / dependencies:** P1; Phase 1; GAP-01, USE-01, LIT-03.

### FEAT-02 — Visual cue library

**Approved outcome:** Provide a library in which operators and editors recognize cues from thumbnails, opening words, prayer grouping, layout, language roles, and variants.

**Known baseline:** The control page exposes a searchable catalog list. Cue recognition still depends substantially on inherited names and operator memory.

**New work:** Define visual browsing and recognition around user language without exposing compatibility aliases as ordinary choices.

**Acceptance criteria:**

- Each visible cue has a representative thumbnail from its approved revision, recognizable title, opening words, layout, language roles, and prayer/panel grouping.
- Hidden compatibility aliases do not appear as duplicate library choices.
- Operators can find a cue by prayer, visual recognition, or search without knowing its technical ID.
- A newly published revision refreshes its library representation without changing the currently selected graphic.
- Michael and a second-congregation operator each complete a representative cue-finding exercise with no coaching after onboarding.

**Priority / phase / dependencies:** P2; Phases 2–3; DEP-AUTHORING, DEP-WEB-EDITOR, FEAT-01, USE-03, DEP-TENANT.

### FEAT-03 — First-class variant creation

**Approved outcome:** Create a new presentation or passage variant from an approved cue while preserving the original and its operator controls.

**Known baseline:** Existing cues can be imported into drafts while keeping IDs; drafts can change title, grouping, template, and type size. A clear product action for making a distinct variant is not established.

**New work:** Define variants as related, independently reviewable products with explicit inheritance and their own stable identifiers.

**Acceptance criteria:**

- An editor can start from an approved cue, choose what is shared, and create a distinct draft without altering the source cue or its current button.
- The new variant receives its own stable identifier and records the cue/revision from which it began.
- Canonical text selectors, language roles, and permissions remain explicit; presentation changes never imply text rewriting.
- Preview, approval, publication, rollback, and live-library sync apply independently to each variant.
- Library and operator surfaces show a human-readable relationship among variants without presenting them as duplicate prayers.

**Priority / phase / dependencies:** P2; Phase 2; DEP-AUTHORING, DEP-WEB-EDITOR, ADAPT-01, LIT-01, DEP-TENANT for congregation-owned variants.

## 3. Usability

### USE-01 — Stable button positions and familiar prayer groupings

**Approved outcome:** Preserve Michael's muscle memory as the library grows.

**Known baseline:** Companion pages 2 and 3 preserve clear/navigation positions and use native cue actions; current additions require page management. Physical hardware behavior remains unverified.

**New work:** Establish a stable control-layout contract and a deliberate change path for visible prayer controls.

**Acceptance criteria:**

- Existing approved control positions do not move as a side effect of catalog sorting, publication, hidden aliases, or adding another congregation.
- Prayer groupings and labels are reviewed with Michael and documented as the CRC default layout.
- Any proposed move of an established control is previewed as a layout change and requires explicit operator review before import/apply.
- Catalog refresh cannot create a button, remove a mixed-action button, or overwrite camera/other actions without surfacing the exact proposed change.
- Physical Stream Deck acceptance confirms readable labels, navigation, cue feedback, clear, and animate-out from the operating position.

**Priority / phase / dependencies:** P1; Phase 1; DEP-HARDWARE, DEP-INSTALL, FEAT-01.

### USE-02 — Universal emergency removal

**Approved outcome:** Make immediate removal available from every operating page.

**Known baseline:** Clear is present on the first rehearsal page; later-page direct operation may require navigation or adding controls. The web controller also exposes clear/cut behavior.

**New work:** Treat “Clear now” as a universal operating control with consistent name, location logic, and feedback.

**Acceptance criteria:**

- Every Stream Deck/Companion page from which a cue can be shown has an immediately reachable **Clear now** control without leaving that page.
- The web operating surface keeps **Clear now** visible during cue search, selection, disconnected state, and multipart navigation.
- Physical and program-output rehearsal proves one press clears immediately during entrance, hold, exit, and rapid replacement.
- A clear cancels pending animation and stale acknowledgements cannot make the removed graphic reappear.
- The control is visually and tactually distinguishable from normal animate-out and page navigation.

**Priority / phase / dependencies:** P0; Phase 1; DEP-HARDWARE, USE-01, REL-02.

### USE-03 — Forgiving search and recognizable labels

**Approved outcome:** Find cues through common spellings, Hebrew names, opening words, and clear labels while keeping historical identifiers behind the scenes.

**Known baseline:** Search exists, but labels include inherited or defective names such as “Ahava Rabbah Ahavtanu (ncomplete).” Technical IDs and archive naming influence recognition.

**New work:** Define human-facing naming, aliases, typo tolerance, and opening-word search for both congregations.

**Acceptance criteria:**

- The approved catalog contains no visible truncated, misspelled, unexplained, or technical-only label.
- A cue can be found by at least its approved English name, common transliteration variants, Hebrew title when available, and displayed opening words.
- Search tolerates common punctuation, apostrophe, capitalization, spacing, and modest spelling differences.
- Congregation-specific aliases can differ while referring to the appropriate congregation-owned cue or shared prayer concept.
- A search usability check built from actual service vocabulary is completed by Michael and the invited congregation's operator.

**Priority / phase / dependencies:** P1; Phase 2; GAP-01, FEAT-02, DEP-TENANT.

## 4. UX/UI

### UX-01 — Separate inspect-next from show-graphic

**Approved outcome:** Let an operator inspect a cue without changing broadcast output while preserving immediate one-button Stream Deck operation.

**Known baseline:** The authoring preview is isolated, but the controller's operating preview follows selected output. Stream Deck cue presses intentionally show immediately.

**New work:** Define an inspect interaction and vocabulary distinct from live selection.

**Acceptance criteria:**

- The web surface labels and visually separates **Inspect** from **Show**.
- Inspecting any cue cannot issue a live command, change relay state, acknowledge as an output renderer, or alter program output.
- The inspect view displays the exact approved revision that **Show** would select and exposes prayer/panel context.
- Stream Deck native cue buttons remain one-press live actions; no confirmation or preview step is inserted.
- A usability check confirms an operator can tell which graphic is live, which is merely inspected, and what will happen on the next action.

**Priority / phase / dependencies:** P1; Phase 2; REL-01, FEAT-02.

### UX-02 — Coherent operating status area

**Approved outcome:** Show connection health, requested cue, acknowledged rendering, and known/unknown on-air visibility in one truthful status area.

**Known baseline:** Requested and rendered states are distinguished, and presence exists. Renderer acknowledgement is correctly documented as not proving program tally. Product wording and state hierarchy are not yet accepted with operators.

**New work:** Define a common status model for web and Companion with explicit unknown states and action-oriented recovery.

**Acceptance criteria:**

- The status area distinguishes at least controller connection, output-renderer connection, requested cue, acknowledged cue, live-library sync, and on-air visibility knowledge.
- No green state, “live,” or “on air” label appears solely because the browser acknowledged a cue.
- Disagreement between requested and acknowledged cue is visible and time-qualified without requiring an engineering log.
- Degraded authoring does not imply degraded playback, and pending live-library sync is distinct from both.
- Michael correctly interprets connected, delayed, disconnected, authoring-offline, and on-air-unknown examples in acceptance review.

**Priority / phase / dependencies:** P0; Phase 0; DEP-AUTHORING, DEP-INSTALL, REL-01, REL-03.

### UX-03 — Obvious setup and operating mode

**Approved outcome:** Make connection setup discoverable and make rehearsal/trial/production context explicit.

**Known baseline:** The private output URL is found under an expandable “Connect vMix, OBS, or Companion” section and a private connection sheet. Existing labels such as rehearsal/test can leave current operating status ambiguous.

**New work:** Define onboarding entry points and persistent context labels that align with DEP-INSTALL.

**Acceptance criteria:**

- A new authorized operator can find the renderer-connection action and Companion setup from the product's first-use path without a private document hunt.
- The product clearly identifies congregation, environment/mode, and whether a surface can affect live output.
- Test/rehearsal output is visually unmistakable from the congregation's production output without placing implementation details in the live viewer graphic.
- Copying or revealing a key-bearing output address requires the appropriate role and provides safe handling guidance at the point of use.
- A clean-machine onboarding test completes the product-guided portion without developer intervention: authenticate or otherwise establish scoped access, copy the scoped output URL into OBS/vMix, connect Companion, install the reviewed page package, and verify healthy test output. Any remaining external-app step and its owner are explicit.

**Priority / phase / dependencies:** P0; Phases 0–1; DEP-INSTALL, DEP-TENANT, UX-02.

## 5. Beauty and visual identity

### BEAUTY-01 — Deliberate Hebrew/Latin typography system

**Approved outcome:** Approve fonts, weights, vowel-mark behavior, line spacing, and title/body relationships as one readable system.

**Known baseline:** Work Sans 400/500 is declared. The archive does not identify the production Hebrew fallback, so Hebrew font equivalence remains unverified. Existing fit measurements prove containment, not typographic quality.

**New work:** Establish and document a cross-language type system, with representative dense and sparse content reviewed on real viewing surfaces.

**Acceptance criteria:**

- Named Hebrew and Latin font families, available weights, fallbacks, punctuation behavior, and line-height ranges are approved for production rendering.
- Hebrew with vowels/cantillation, transliteration, English, titles, numerals, and mixed-direction samples render without clipping, misplaced marks, or font substitution surprises on supported output browsers.
- Dense prayer samples meet ACCESS-01 without shrinking below the accepted readability floor.
- Typography approval includes a television/program monitor and a small stream window, not only 1920×1080 browser screenshots.
- The invited congregation can adopt the shared type system or an explicitly approved congregation variant without changing canonical text.

**Priority / phase / dependencies:** P1; Phases 1–3; DEP-HARDWARE, ACCESS-01, DEP-TENANT.

### BEAUTY-02 — Coherent layout family

**Approved outcome:** Finish a small, coherent family of lower-third, left-panel, and right-panel layouts with consistent proportions, margins, artwork, borders, and motion.

**Known baseline:** The renderer has refreshed lower-third and full-height side panels using CRC-owned artwork, deep blue/turquoise, warm gold, and high-contrast reading surfaces. Full-height geometry and upper-right logo are accepted. Exact legacy fidelity is not the goal.

**New work:** Create a visual specification and approve representative states across the bounded layout family.

**Acceptance criteria:**

- Lower-third, panel-left, and panel-right each have an approved purpose, grid, safe area, title relationship, artwork scale, border treatment, and entrance/exit behavior.
- Full-height side panels and the upper-right logo placement are preserved.
- The CRC family feels visibly related across short, medium, dense, multipart, bilingual, and original-English examples.
- Variations are limited to content or congregation needs recorded in the design system; one-off visual drift is rejected in review.
- Approval records include entrance, hold, rapid replacement, animate-out, and clear states.

**Priority / phase / dependencies:** P1; Phase 1; BEAUTY-01, ACCESS-01, LIT-03.

### BEAUTY-03 — Camera-composite visual approval

**Approved outcome:** Judge graphic balance and beauty over representative CRC camera shots throughout motion.

**Known baseline:** Transparent output and browser fit have been reviewed. OBS/vMix were not running during workstation inspection, and actual camera composites remain unverified.

**New work:** Define a small representative camera/background set and use program-output review for visual sign-off.

**Acceptance criteria:**

- CRC identifies representative wide, medium, close, bright, dark, and visually busy camera shots used in ordinary services.
- Each layout family is reviewed over those shots for subject obstruction, visual weight, logo placement, contrast, safe margins, and motion.
- Review includes still hold plus entrance, exit, replacement, and camera switch while a graphic remains present.
- Issues are classified as layout, camera-composition, operator-use, or content-density concerns, with an owner and disposition.
- Final acceptance comes from program-output evidence viewed at service scale.

**Priority / phase / dependencies:** P1; Phase 1; DEP-HARDWARE, BEAUTY-02, ACCESS-01.

## 6. Adaptability

### ADAPT-01 — Shared prayer, multiple presentation variants

**Approved outcome:** Let one approved prayer support left, right, lower-third, and congregation-appropriate presentation variants while sharing authoritative text.

**Known baseline:** Templates support lower-third, panel-left, and panel-right; cue text is source selected. Each cue is currently curated as an individual playback record.

**New work:** Separate the approved prayer/content selection from independently approved presentation variants and pagination.

**Acceptance criteria:**

- A prayer's source selection and provenance can be reused by multiple presentation variants without copying editable prayer text.
- Each variant has independent layout, line breaks, pagination, visual review, publication, rollback, and congregation availability.
- A source change identifies every affected variant through LIT-02.
- An editor can tell whether two variants share content, differ in selected passage, or belong to different congregations.
- Publishing or rolling back one variant cannot alter another variant or the currently selected live payload.

**Priority / phase / dependencies:** P2; Phases 2–3; DEP-AUTHORING, DEP-WEB-EDITOR, FEAT-03, LIT-01, LIT-02, DEP-TENANT.

### ADAPT-02 — Additional authorized service collections

**Approved outcome:** Make additional CRC services and the invited congregation's authorized sources available through the same review workflow.

**Known baseline:** Authoring searches a bounded legacy CRC Shabbat-morning source map. The release is CRC-only; another congregation's permissions and isolation are not established.

**New work:** Define how source collections are added, named, permissioned, reviewed, and exposed to editors without carrying CRC assumptions into the invited congregation.

**Acceptance criteria:**

- At least one additional CRC service collection and one authorized invited-congregation collection can be searched through the same source-to-draft workflow.
- Every collection identifies congregation, service, source authority, permission basis, version/revision, language roles, and change owner.
- Editors see only collections allowed by their role and congregation; a cross-congregation access test demonstrates isolation.
- Adding a collection cannot silently publish cues or expose raw server-only source packages to the relay.
- Source and role validation fails closed when a requested block or permission is missing.

**Priority / phase / dependencies:** P2; Phase 3; DEP-AUTHORING, DEP-WEB-EDITOR, DEP-TENANT, DEP-SOURCES, LIT-01.

### ADAPT-03 — Optional reusable service collections

**Approved outcome:** Offer recognizable reusable service groupings while preserving direct access to any prayer and spontaneous operation.

**Known baseline:** Companion pages provide a manually arranged morning library. No formal product-level service collection exists.

**New work:** Define saved collections as optional views/layout aids, not mandatory weekly preparation or fixed run-of-show sequences.

**Acceptance criteria:**

- CRC and the invited congregation can each maintain a reusable ordinary-service collection of approved cues.
- Opening a collection never hides global search or direct cue access.
- A collection can contain alternates and multipart prayers without forcing a single linear next action.
- Updating a collection cannot show a graphic, republish a cue, or silently rearrange an established Stream Deck layout.
- Michael can operate an ordinary service from stable familiar controls without opening or preparing a collection that week.

**Priority / phase / dependencies:** P2; Phase 3; GAP-01, FEAT-01, USE-01, DEP-TENANT.

## 7. Reliability

### REL-01 — Dependable authoring and accurate partial availability

**Approved outcome:** Restore authoring and tell users plainly when approved playback works but editing or publication does not.

**Known baseline:** Neon transfer exhaustion currently prevents editing and publishing. The relay continues playing the last synchronized catalog. Publication sync already distinguishes saved content from a pending live refresh at the API-contract level.

**New work:** Treat authoring restoration, degraded-mode communication, retry/recovery, and data-preservation evidence as a product reliability gate.

**Acceptance criteria:**

- DEP-AUTHORING's authoring, preview, approval, publish, history, and rollback functions pass against the production-class environment.
- During a simulated authoring-store outage, playback of the synchronized library, cue selection, and clear remain available and are reported as available.
- Editor and operator surfaces state which functions are unavailable, what remains safe to use, whether a live-library sync is pending, and who can act.
- Failed publication cannot appear successful; a saved-but-unsynchronized publication remains recoverable and has a bounded retry path.
- Recovery evidence confirms no loss or silent overwrite of drafts, approvals, published revisions, or history.

**Priority / phase / dependencies:** P0; Phase 0; DEP-AUTHORING, UX-02, OWN-01.

### REL-02 — Switcher-side emergency fallback

**Approved outcome:** Let Michael remove the CRC overlay and return to Singular even if the overlay service or connection is unavailable.

**Known baseline:** The operator guide instructs the operator to hide the browser source if recovery is not immediate, and Singular remains present during the trial. The exact physical switcher-side recovery path is unverified.

**New work:** Establish a rehearsed fallback owned by the switcher/Companion environment rather than depending on a cloud clear command.

**Acceptance criteria:**

- A documented, immediately reachable switcher or Companion action hides/removes the CRC input without requiring the CRC service, renderer connection, or authoring system.
- The operator can then return to the retained Singular workflow without rebuilding connections during service.
- Staffed rehearsal covers wrong cue, frozen graphic, renderer disconnect, control disconnect, and cloud-service unavailability.
- Program-output evidence records maximum time to a clean picture and then to a usable Singular graphic; target times are agreed before the trial.
- Recovery instructions state when to attempt reconnection and when to remain on Singular for the rest of the service.

**Priority / phase / dependencies:** P0; Phase 1; DEP-HARDWARE, DEP-INSTALL, USE-02.

### REL-03 — Real service acceptance

**Approved outcome:** Verify physical controls, compositor behavior, rapid selection, restart, and network recovery through the actual production setup.

**Known baseline:** Hosted and local protocol checks passed, including relay fanout, acknowledgements, reconnection, and idle behavior. These are explicitly not OBS/vMix, physical Stream Deck, camera, or on-air acceptance.

**New work:** Run and retain an operator-facing readiness record based on the existing rehearsal sequence and DEP-HARDWARE.

**Acceptance criteria:**

- The named production workstation, Companion version/module, physical control surface, compositor, browser input, and output dimensions are recorded.
- Staffed rehearsal passes representative layouts, animate-out, clear, rapid selections, camera switching, browser reload, network interruption/recovery, and final clean output.
- The final pressed cue becomes the final rendered graphic under rapid selection, and the program monitor confirms what viewers receive.
- Restart and reconnect tests establish expected hold/return behavior and prevent stale animation or stale state from replacing newer state.
- Failures are recorded with owner and severity; no open critical issue remains when readiness is declared.

**Priority / phase / dependencies:** P0; Phase 1; DEP-HARDWARE, UX-02, USE-02, REL-02.

## 8. Liturgical integrity

### LIT-01 — Readable source provenance

**Approved outcome:** Let an editor identify source congregation/service, prayer, selected passage, language role, and source revision without interpreting technical identifiers.

**Known baseline:** Source maps pin feed, selected units, archive compositions, and generated text objects. Bilingual pairing and original-English roles are validated, but provenance is primarily technical.

**New work:** Define a human-readable provenance view carried through draft, preview, publication, revision history, and variants.

**Acceptance criteria:**

- Every authored cue displays congregation, service/source collection, prayer, selected blocks in reading order, language/source roles, source revision, and publication revision.
- Editors can inspect the exact source text alongside the rendered arrangement without editing it in place.
- Original English, authorized translation, transliteration, and Hebrew are visibly distinguished by role.
- Provenance remains available in revision history and rollback review.
- A reviewer can answer “where did every displayed line come from?” using the product alone for a sampled cue from each congregation.

**Priority / phase / dependencies:** P1; Phase 2; DEP-AUTHORING, DEP-SOURCES, DEP-TENANT, FEAT-03.

### LIT-02 — Source-change review inbox

**Approved outcome:** When an authorized source changes, identify affected overlays and let a reviewer accept, defer, or reject updates without silently changing live graphics.

**Known baseline:** Generation fails closed on source drift. Published revisions and rollback exist, but there is no documented editor workflow for understanding and applying source changes.

**New work:** Define impact detection, readable differences, review decisions, and publication boundaries across all variants.

**Acceptance criteria:**

- A source revision identifies every affected draft, published cue, presentation variant, and service collection.
- Review shows the prior and proposed text in context, including language-pair relationships and pagination impact.
- Reviewers can accept, defer with a reason, or reject as inapplicable; no choice changes live output by itself.
- Accepted changes create new draft/review work and require the normal exact-preview approval and publication path.
- Each congregation's authorized reviewer sees and decides only its permitted source changes, with a retained audit record.

**Priority / phase / dependencies:** P2; Phases 2–3; DEP-AUTHORING, ADAPT-01, ADAPT-02, LIT-01, DEP-TENANT.

### LIT-03 — Complete pagination review

**Approved outcome:** Prove that panel consolidation and re-pagination omit and duplicate nothing and preserve meaningful reading boundaries.

**Known baseline:** Four sequence consolidations passed source and browser checks; Readers Kaddish, Yotzer Or, and Vahavta remained multipart based on density evidence. Fit checks do not alone prove congregational usability or liturgical boundaries.

**New work:** Define a whole-prayer review comparing canonical sequence with proposed panels, language alignment, and viewing readability.

**Acceptance criteria:**

- Review presents the complete canonical prayer sequence and all proposed panels together, in reading order.
- Automated or equivalent exact comparison proves each selected source unit appears once, in order, in every required language role.
- A qualified content reviewer approves panel boundaries for meaning, congregation practice, and language correspondence.
- ACCESS-01 decides whether consolidation remains readable; reducing panel count is never itself a success criterion.
- Re-pagination produces a new approved revision and preserves the prior published revision for rollback.

**Priority / phase / dependencies:** P1; Phases 1–2; DEP-AUTHORING, LIT-01, ACCESS-01.

## 9. Accessibility and viewer participation

### ACCESS-01 — Readability floor at realistic sizes

**Approved outcome:** Set a practical readability floor for televisions and smaller stream windows, retaining additional panels when needed.

**Known baseline:** All 29 catalog records passed browser text, collision, overflow, and side-body boundary checks. Several sequence decisions used measured pixel height and character density. Containment does not establish comfortable reading at viewing distance.

**New work:** Agree on viewing scenarios, minimum usable type/spacing, reading-time expectations, and a repeatable viewer review.

**Acceptance criteria:**

- CRC names representative sanctuary display size/distance and streamed-video window size; the invited congregation supplies its scenarios before its pilot.
- An approved readability rubric covers type size, line length, spacing, display duration, safe areas, motion, and obstruction by typical video framing.
- Dense, sparse, bilingual, English-only, title-heavy, and multipart samples pass human review in each supported scenario.
- A panel that fails cannot be accepted merely because it has no browser overflow; it is re-paginated, restyled within the accepted system, or excluded from that scenario.
- Accepted lower bounds are recorded as product constraints for authoring preview and review.

**Priority / phase / dependencies:** P1; Phases 1–3; DEP-HARDWARE for CRC, DEP-TENANT for the invited congregation; BEAUTY-01 and LIT-03 consume the result.

### ACCESS-02 — Hebrew/transliteration correspondence

**Approved outcome:** Help viewers keep their place by aligning phrases or stanzas where practical while preserving approved wording and natural reading order.

**Known baseline:** Source validation ensures paired block coverage for ordinary bilingual cues. Existing lower-third and panels visually separate language blocks but do not define phrase-level correspondence.

**New work:** Establish layout and pagination guidance for semantic alignment that respects different word order and text density.

**Acceptance criteria:**

- Each bilingual layout identifies how corresponding units are signaled: aligned rows/stanzas, spacing, repeated landmarks, or another reviewed method.
- Alignment never changes canonical wording, word order, punctuation, or source block order solely to make columns match.
- When close alignment would harm readability or meaning, the review records the chosen alternative and provides clear visual landmarks.
- Representative readers who use Hebrew and transliteration can recover their place after looking away in a realistic viewing test.
- Alignment decisions remain intact across responsive preview and the fixed 1920×1080 output.

**Priority / phase / dependencies:** P1; Phase 2; LIT-03, ACCESS-01, BEAUTY-01.

### ACCESS-03 — Contrast and non-color status cues

**Approved outcome:** Make viewer text and operator state understandable with sufficient contrast and without relying on color alone.

**Known baseline:** Prayer surfaces are designed for high contrast and operational feedback uses state colors/labels. A documented product-wide contrast and non-color acceptance record is absent.

**New work:** Apply a shared accessibility review to rendered graphics and operator/setup surfaces, using established web contrast guidance as a baseline plus broadcast viewing tests.

**Acceptance criteria:**

- Text and essential interface controls meet the agreed contrast thresholds in their normal, hover/focus, selected, disabled, warning, and disconnected states.
- Requested, rendered, delayed, disconnected, degraded, and unknown states each have a text label or icon/shape distinction in addition to color.
- Viewer graphics remain legible over representative video backgrounds, with the reading surface evaluated as part of the composite.
- Keyboard focus and error/warning indications are visibly distinguishable on web operating and authoring surfaces.
- Exceptions require a recorded reason and real viewing evidence; brand colors alone do not justify unreadable treatment.

**Priority / phase / dependencies:** P1; Phases 1–2; UX-02, BEAUTY-02, BEAUTY-03.

## 10. Operational ownership and cost

### OWN-01 — Operating health and usage view

**Approved outcome:** Let an authorized owner understand playback, editing, synchronization, connections, capacity, and upcoming cost/capacity concerns without inspecting hosting dashboards.

**Known baseline:** Relay presence, catalog/version state, authoring health, and hosting usage exist in separate systems. Neon transfer exhaustion caused an authoring outage; local protocol idle traffic measurements are not provider billing evidence.

**New work:** Define a product-level owner view with actionable state, provenance of measurements, and congregation scope.

**Acceptance criteria:**

- The owner view separately reports playback relay health, authoring-store health, current live-library synchronization, output/controller presence, and most recent successful publication/sync.
- Usage/capacity data identifies provider, measurement window, freshness, threshold, and congregation attribution where technically meaningful; unavailable data is shown as unavailable, not zero.
- Thresholds produce an owner action before service-threatening exhaustion, with a named destination and runbook link.
- CRC and invited-congregation operators see only the operational detail needed for their role; cross-congregation sensitive usage or credentials remain isolated.
- A simulated authoring outage, relay outage, pending sync, and approaching capacity threshold each produce a correct, understandable status.

**Priority / phase / dependencies:** P0; Phases 0 and 4; UX-02, REL-01, DEP-TENANT.

### OWN-02 — Recoverable documented package

**Approved outcome:** Preserve the assets and knowledge needed for an authorized person to restore the two-congregation service.

**Known baseline:** Code/templates are in a private repository; source packages are server-only; authoring state/history is in the database; approved playback state is in the relay. Companion exports and key-bearing connection material are deliberately excluded from Git.

**New work:** Define a secure recovery package, ownership, cadence, and proof-of-restore without placing secrets or restricted source material in inappropriate storage.

**Acceptance criteria:**

- The recovery inventory covers application release/configuration, approved content and revisions, canonical-source references/packages according to permission, artwork/licenses, relay catalog/state recovery, Companion page exports, tenant/account configuration, and operator/setup guides.
- Every component names its system of record, backup location, owner, access role, backup cadence, retention, and restore order.
- Secrets and key-bearing URLs are recoverable through an approved secret process and are absent from ordinary documentation and shared screenshots.
- A clean recovery exercise restores a non-production rehearsal instance and verifies one approved cue per congregation without affecting live outputs.
- Offboarding or loss of one operator account does not make the system unrecoverable.

**Priority / phase / dependencies:** P1; Phases 2–4; REL-01, DEP-INSTALL, DEP-TENANT, DEP-SOURCES.

### OWN-03 — Maintained operator handoff

**Approved outcome:** Turn Michael's setup and recovery material into a maintained, versioned product surface for each congregation.

**Known baseline:** CRC has an operator quick start, rehearsal guide, connection sheet, Companion page names, module/version details, and recovery instructions. They already contain version drift (README cites module 1.1.1 while the rehearsal inventory records 1.1.0) and assume manual setup knowledge.

**New work:** Define release ownership and in-product access for role-specific setup, operation, rehearsal, and recovery instructions aligned with DEP-INSTALL.

**Acceptance criteria:**

- Each congregation has a current quick start covering start-of-service checks, spontaneous operation, clear/animate-out, fallback, end-of-service state, and who to contact.
- Setup guidance identifies supported Companion/module, browser/compositor settings, mode, congregation, and the exact point at which program-monitor verification is required.
- Product/release changes that alter setup, controls, status, recovery, or supported versions cannot be accepted until their handoff content is reviewed.
- The product displays the applicable guide/version from setup and operating surfaces without exposing secrets.
- Michael and the invited congregation's operator each complete a guided setup/recovery exercise and identify no undocumented blocking step.

**Priority / phase / dependencies:** P1; Phases 1–4; DEP-INSTALL, DEP-HARDWARE, DEP-TENANT, REL-02, REL-03.

## Traceability and release gates

The thirty approved recommendations are represented exactly once:

| Category | Items |
| --- | --- |
| Gaps and completeness | GAP-01, GAP-02, GAP-03 |
| Feature base | FEAT-01, FEAT-02, FEAT-03 |
| Usability | USE-01, USE-02, USE-03 |
| UX/UI | UX-01, UX-02, UX-03 |
| Beauty and visual identity | BEAUTY-01, BEAUTY-02, BEAUTY-03 |
| Adaptability | ADAPT-01, ADAPT-02, ADAPT-03 |
| Reliability | REL-01, REL-02, REL-03 |
| Liturgical integrity | LIT-01, LIT-02, LIT-03 |
| Accessibility and viewer participation | ACCESS-01, ACCESS-02, ACCESS-03 |
| Operational ownership and cost | OWN-01, OWN-02, OWN-03 |

No release may claim **CRC ordinary-service ready** until GAP-02, USE-01, USE-02, UX-02, REL-02, REL-03, ACCESS-01, and all blocking GAP-01 rows are accepted with hardware/program-output evidence. No release may claim **self-service authoring ready** until DEP-WEB-EDITOR and MANUAL-01 through MANUAL-04 are accepted by a user who does not use AI. No release may claim **ready for the invited congregation** until DEP-TENANT, DEP-SOURCES, DEP-INSTALL, DEP-WEB-EDITOR, ADAPT-02, OWN-02, and the congregation-specific portions of accessibility and handoff acceptance are complete.

The parallel trial remains the decision mechanism for Singular replacement. The second-congregation pilot remains bounded to one invited congregation until the Phase 4 evidence supports a separate expansion decision.
