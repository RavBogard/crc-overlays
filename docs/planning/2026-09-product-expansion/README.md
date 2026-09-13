# Product expansion plan: two congregations, simple setup

Date: September 12, 2026

## Approved direction

The user approved all 30 recommendations from the ten-category product review. This planning package preserves those outcomes and adds two concrete requirements:

- Support exactly two congregations: CRC uses vMix with Companion/Stream Deck; the friend congregation uses OBS with Companion/Stream Deck.
- The friend starts from selected CRC materials and customizes them. Each congregation's changes, controls, live output, and operating habits remain independent.
- Installing on an existing production computer should approach Singular's output-URL simplicity. Routine operation should require no repeat setup.
- Michael must be able to creappate, edit, duplicate, and publish graphics in a polished browser editor without AI, including easy passage retrieval from the permitted siddur library.

This turn produces investigation, product decisions, acceptance criteria, and a delivery sequence. No production code, accounts, permissions, content sharing, or hosting configuration was changed.

## Recommended decisions

| Topic | Direction |
| --- | --- |
| Product scope | One maintained product, two invitation-only congregation workspaces |
| Initial isolation | Two isolated deployments/data stores/live realms built from one maintained source revision; each loads only its permitted content and assets |
| Shared content | An explicit selected starter package, copied into the friend's independent library with provenance; future CRC changes are offered for review, never pushed into their published service |
| Identity | Individual human sign-in and small congregation-specific roles |
| Output connection | A named, independently revocable output URL pasted once into vMix or OBS; no login inside the program source |
| Companion connection | One generic module, congregation-aware pairing and presets; supported module/page installation flow |
| Current operating model | Preserve static button positions and spontaneous prayer selection; optional collections and next-panel actions |
| Design | Refine the existing CRC visual identity; introduce separate brand settings for the friend |
| Release standard | Complete-service coverage, real workstation rehearsal, independent emergency hide/fallback, and measured setup usability |

Two deployments are an initial engineering recommendation rather than the product definition. They add provisioning and maintenance work, which must be automated for the two named configurations. They isolate content and live state, but shared providers/accounts can still create common outages or quota limits. Do not promise otherwise.

## Read the plans

- [Two-congregation product plan](TWO-CONGREGATIONS.md): workspace boundaries, starter sharing, customization, deployment options, and cross-congregation acceptance.
- [Installation investigation](INSTALLATION.md): official Companion/vMix/OBS findings, current friction, proposed setup journey, and supported automation limits.
- [People and devices](AUTH-AND-DEVICE-EXPERIENCE.md): what human sign-in, OAuth, output URLs, and device pairing each solve.
- [Approved backlog](APPROVED-BACKLOG.md): all original recommendations mapped to acceptance criteria and dependencies.
- [Web editor](WEB-EDITOR.md): current authoring gaps, the manual creation/duplication journey, Add from siddur, custom content, preview, and recovery.
- [Singular authoring comparison](SINGULAR-AUTHORING-COMPARISON.md): familiar editing patterns to preserve and the boundary between everyday editing and advanced design.

## Product release sequence

This sequence coordinates the category backlog. It is not a calendar estimate; bounded technical discovery and actual operator rehearsals determine effort.

These release gates are the consolidated order. The backlog's Phases 0–4 group work by product maturity rather than naming these same gates; do not equate their numbers. CRC completion and editor work can progress in parallel with isolation and setup. The MANUAL-01..04 enabling epic maps to WEB-01..13 in the detailed editor plan; WEB-13 specifically covers the user's Add from siddur requirement.

### Release gate 0: reliable existing CRC trial

Restore authoring availability and distinguish it visibly from playback availability. Confirm the real cause of the outage before choosing a recovery or capacity change. Inventory the required ordinary service and Michael's existing buttons. Record authoritative catalog counts and current releases in one operator-facing status source. Correct setup instructions that describe retired module behavior.

Keep CRC's established output and cue IDs stable while the new onboarding is developed. Preserve its Singular parallel trial and independent switcher hide. Define evidence for readiness without calling a synthetic acknowledgement an on-air test.

In parallel, begin typography/visual review, prayer naming, library organization, **Add from siddur** coverage, the manual editor design, and a representative shared starter collection. Those planning/design activities do not depend on the login provider.

Exit: usable authoring, a prioritized service-coverage map, a tested recovery procedure, and an agreed set of setup acceptance tasks.

### Release gate 1: one product, two explicit congregation configurations

Introduce neutral product identity and congregation-specific brand/source settings. Use synthetic second-congregation content first. Design individual membership, output/device credentials, migration from the current shared keys, and scoped MCP authoring. Prove that the friend's actions cannot affect CRC before granting outside access.

Choose the selected CRC starter materials and record which may be shared. User-owned, explicitly selected materials use the user's sharing authority; externally restricted text/artwork requires its own permission basis. Sharing is a discrete copy into an independent library, not a live dependency on CRC publications.

Exit: two distinguishable, isolated rehearsal workspaces, permitted source packages, and a verified old-to-new CRC connection migration.

### Release gate 2: simple setup on both production stacks

Ship an invited-person entry point and a short **Set up this computer** flow. Provide a named output URL, vMix/OBS-specific instructions, a supported Companion install/connect route, and the congregation's reviewed pages. Prove any automatic page installation against the supported Companion version before including it in the promised journey.

Targets for an existing workstation: graphics connected in under three minutes, all controls connected in under ten, and no terminal commands or persistent control-key handling. These are usability targets, not measured results. Installation does not replace a staffed rehearsal.

Exit: Michael and a second operator can independently complete the flow, reboot, reconnect, and retain unrelated Companion/camera configurations. No login or setup screen can appear on program output.

### Release gate 3: complete and polished service operation

The first web-editor slice is a parallel priority, not work postponed until the installation flow is finished: direct editing, Add from siddur, true duplicate, local custom text, undo/draft recovery, and immediate visual feedback. A non-AI operator must be able to complete these tasks unaided.

Complete the highest-use service library. Deliver prayer/panel grouping, forgiving search, thumbnails, safe inspection of a prospective cue, stable controls, and removal access on every page. Finish readable typography, phrase relationships, consistent layouts/motion, and visual review over realistic camera shots.

Extend source-based authoring with clear provenance, complete-pagination review, safe variants, optional collections, and a source-change review inbox. Preserve the full-height side panels and elevated logo placement. Adding a congregation must not force uniform wording, branding, or service order.

Exit: a whole ordinary CRC service works through its actual Stream Deck/vMix setup, including spontaneous jumps, restarts, and fallback. Dense prayers are readable at realistic viewing sizes, not merely free of overflow.

### Release gate 4: friend pilot and maintainable ownership

Invite the friend and their operator into the isolated OBS workspace. Import the approved starter collection, apply their brand, and review their customized text/variants. Complete their required service coverage and rehearse both congregations operating concurrently.

Provide named support ownership, bounded incident reports, per-congregation usage visibility, recoverable content/device configuration, and a release procedure exercised against both configurations. Later starter updates show differences and require receiving-congregation review. An update must not move existing buttons or replace local edits silently.

Exit: the friend can independently customize, publish, run, and recover their own service. Cross-congregation commands, source access, and revocations are denied. Each congregation has a tested backup/restore path and an operator-maintained setup guide.

## Bounded discovery tasks before implementation commitments

1. Verify the actual Companion versions on both production machines, supported module distribution, browser authorization/callback capability, secret persistence, and page import API/preview support. Preserve the supported manual import fallback.
2. Choose a maintained human identity approach based on invitation/email reliability, session behavior, account recovery, cost, and existing OAuth integration. Do not confuse provider sign-in with output access or promise Google/Microsoft setup before configuring it.
3. Validate how a named output credential survives source reloads and restarts, and how revocation affects active sockets and retained frames. Keep public login errors out of program output.
4. Measure actual provider usage and shared quota boundaries for two deployments. Confirm authoring recovery and the costs of the second environment without purchasing a plan as part of planning.
5. Identify exact starter prayers/artwork and the friend's initial service coverage. The known product choice is selected CRC materials followed by customization; the particular selection remains to be made.

## Beyond the two-congregation scope

Do not add public signup, subscription billing, an open content marketplace, unlimited congregation administration, or a native desktop overlay installer to this release. Revisit shared multi-tenant infrastructure when the number of congregations or measured maintenance effort warrants it.

## Evidence boundary

The preceding product review verified a hosted catalog of 29 records/24 visible cues, an available state endpoint, and an unavailable authoring endpoint. Existing records document the September 10 quota incident and restored playback. They do not demonstrate current authoring recovery, physical Stream Deck acceptance, actual OBS/vMix output, or installation timing. These remain delivery acceptance tasks.
