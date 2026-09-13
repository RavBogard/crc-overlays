# Partner review of Claude's product plan

Date: 2026-09-13. Reviewer: Codex, for Daniel. Status: review recommendations; not a replacement for Daniel's approvals or a deployment authorization.

## Verdict

**Approve the overall direction. Continue implementation, with the amendments below incorporated before their affected features ship.** This is a sensible evolution toward a product Michael and Simone can use independently. It preserves the strongest earlier decisions: a browser editor that needs no AI, exact source provenance, separate publication and live control, independent congregational customization, and an honest distinction between software verification and real-service acceptance.

I would not restart this work or replace the architecture. I would tighten several feature contracts, particularly installation, emergency clearing, publication validation, and the later integrations. Those decisions are cheaper to settle now than after operators learn inconsistent behavior.

This is a plan and product review with targeted code inspection, **not a new browser audit, security certification, or approval to replace Singular**. Tests and screenshots mentioned below are Claude's recorded evidence; I did not rerun them or touch production.

## What I reviewed and how current it is

- `HANDOFF-CODE-2026-09-13.md`, including Revision 2, Daniel's rulings, and Phases A–E.
- Root `CLAUDE-HANDOFF.md`, Phase A2 return notes, the approved backlog/evidence ledger, beta task guide, and relay release procedure.
- Targeted inspection of output credential handling, console status, authoring review/publication, shared-library export, and the relay deployment script.
- Observed HEAD `f323fc2`; the working branch changed from `phase-a2` to `phase-b` while this review was underway. Claude is actively working. Do not treat this document as a claim that an issue remains after a later commit.

The handoff records A and A2 as built and tested but not deployed, and production at `5117d3…`. I did not independently probe production. The original Cowork artifact, “Overlays, reviewed from the outside,” is referenced as the specification of record but was not present in the reviewed planning folder. This review therefore assesses the detailed executable handoff, not unseen wording in that artifact. Export that artifact alongside the handoff so the next implementer can resolve discrepancies without reconstructing chat.

## Keep these decisions

- One coherent operator visual system, shared navigation, clear identity, friendly labels, and useful disconnected explanations.
- One form and one real preview, with optional appearance controls in a drawer. Michael's normal path should stay short.
- A siddur shelf plus direct search; paired Hebrew/transliteration; source-backed duplication; normal custom-text templates.
- Presets-first Companion setup, fixed module identities, and backward compatibility with installed buttons.
- Two separate congregational workspaces with shared published CRC material and independent local editing. No multi-tenant rewrite is needed for this project.
- A local rehearsal environment. The work already invested is valuable; it should now support feature delivery rather than become a second product.
- Conditional typography trials rather than changing published graphics simply because another font looks attractive.
- All explicitly declined items remain declined. This review does not reopen module-store submission, auto-out timers, a third workspace, nightly production synthetics, or a setlist-based deployment freeze.

## Amendments before the affected features ship

### 1. S1: design pairing around returning next week, not only the first connection

**Priority: release requirement; explicitly confirmed by Daniel on 2026-09-13: “pairing needs to be close to bulletproof and permanent.”**

Pair once, remain connected indefinitely during normal use. The ten-minute expiry applies only to the unused pairing code, never to the operator's ongoing device relationship. No scheduled re-pairing, inactivity expiry, weekly sign-in, or dependence on the administrator's browser session. If underlying credentials rotate, renewal must be automatic and tolerate interruptions without locking out a previously paired device.

Persist the connection in the actual host's durable configuration/storage; `sessionStorage` alone is insufficient. Preserve pairing across computer/compositor/Companion restarts, browser-source unload/reload, ordinary app and module updates, web/relay deployments, internet interruptions and long periods unused. Reconnect automatically and reconcile current authoritative state without replaying queued old Show commands. A named device remains paired until explicitly revoked or its durable configuration is lost. Storage deletion, a new machine or a revoked credential needs a short self-service replacement path, not developer intervention. Revocation must remain possible; permanent does not mean irrevocable.

Required acceptance matrix: both OBS and vMix, plus Companion, exercised through those lifecycle events; expired human login; an interruption during credential renewal if renewal is used; and an authoring-store outage followed by reconnect. Record actual results. Local simulations support this evidence but do not replace host restart tests. Keep this requirement open until those tests pass.

The plan specifies a short code entered inside the output browser and a resulting credential in `sessionStorage`. The current output also uses session storage and removes its credential fragment from the loaded page URL. That does not establish persistence through the actual OBS/vMix restart lifecycle. Requiring an operator to interact with a browser input is also a setup step that needs justification.

Recommended contract: the signed-in setup page creates a named output connection and gives Michael or Simone a single URL to paste into their compositor. Companion can use a short pairing code. If output pairing uses a device approval flow, let approval happen in the ordinary signed-in browser; avoid requiring keyboard interaction inside a production graphics input. Choose credential persistence only after testing the real hosts; do not assume a browser-tab storage test proves it.

Define workspace and capability scope, atomic single-use redemption, expiry, attempt limits, device revocation, and credential renewal. An output credential must not edit or control graphics; a Companion credential must not become an owner account. Explain what continues working during an authoring-database outage, including reconnects and revocation propagation. Device credentials must not accidentally remove the existing separation between playback and authoring availability.

Acceptance: connect each host, restart the compositor and computer, reopen the saved scene/project, and reconnect without Daniel or a pasted administrator key. Revoke only the test device and verify the other devices still work. Test expired/wrong-workspace/reused codes locally.

OAuth is not itself the product requirement. The standard device authorization flow is a useful reference for authorization on input-constrained devices through a separate browser, including short-code abuse controls. It does not require adding a social-login provider merely to make setup easy. [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)

### 2. F1: a persistent QR layer must preserve an unambiguous emergency clear

**Priority: high; explicitly approved by Daniel on 2026-09-13.**

Daniel confirmed: **Clear now removes every overlay layer**, including QR/bug and page chip, on both web and Companion. Ordinary Animate out affects the prayer layer. The QR/bug is an optional tool, **off by default**, enabled explicitly when wanted; Daniel does not expect it to be normally displayed. This supersedes the original plan's exemption of the bug from Clear now.

Specify layer state, reconnect behavior, acknowledgement, and what the operator sees when only the QR remains. A renderer marked clear cannot still contain an unreported layer. Test combined prayer/artwork/QR/page-chip layouts, including long text. Make QR destination and page reference workspace-specific; TBI must not inherit a CRC link unintentionally.

Acceptance: Show a prayer and the QR, invoke the emergency action from both interfaces, verify a transparent output, then reconnect and confirm the dismissed layer does not unexpectedly reappear.

### 3. R7: move the publish-validation contract into Phase B

**Priority: high; confidence: 95%.**

The plan already recognizes inconsistent enforcement, but leaves the fix late in Phase D. Current `lib/authoring.ts` validates an exact-version review receipt yet accepts caller-supplied browser measurement fields. That is stronger than having no gate, but is not an independent rendering verdict. Do not describe it as server-verified fit.

Define one publish contract for editor, API and MCP now: a verdict bound to the exact draft/content, renderer version, branding, and relevant assets. Rendering success does not replace human approval of wording or readability. A timeout or unknown result must not become a pass. Keep validation separate from live output.

Implement the approved headless-rendering path if practical. The stated browser-review fallback also needs a defined trust boundary: returning a link while still accepting arbitrary asserted measurements does not close that gap. If the deliberate choice is trusted-editor attestation, label it honestly and prevent automation from claiming a human review occurred.

Acceptance: edited text, changed artwork, changed branding, stale review and an API/MCP request with asserted success cannot reuse an inapplicable verdict. Preserve already-published live payloads.

### 4. G1/G2/G3/F6: split Phase D into explicit, testable contracts

**Priority: high; confidence: 90%.**

Phase D combines separate repositories, authentication, public state, live layering and private names. Its features are approved, but the current ordering understates their dependencies.

- **Setlist matching:** book + folio is not necessarily a unique passage or language/layout variant; fuzzy song search is a suggestion, not proof of coverage. Show Exact match, Choose among matches, and Missing. Confirm the proposed mapping before creating a prepared service. Reimport must not silently duplicate entries or overwrite local edits. “Not applicable” needs an explicit decision.
- **Congregation scope:** a read-only token is not automatically congregation-scoped. The instruction to store one CRC service token in both projects needs an explicit data boundary. Sharing overlays does not establish permission to expose every CRC setlist's personnel, notes or context to TBI. Prefer per-congregation scope, or a deliberately limited shared service-template representation.
- **Follow the service:** specify whether `/api/now` reports requested or rendered content. Neither proves OBS/vMix program output. Include enough state to represent clear, stale/disconnected and an unmapped graphic; clear old references promptly. A request for a new prayer should not silently be advertised as confirmed participation state. Map folios to an edition, and retain multiple references where needed.
- **Private names:** “per collection and purged with it” needs real deletion semantics. Define archive versus deletion, retention, backup handling, and the minimum private rendering/relay path. Keep names out of the shared library, public `/api/now`, immutable public artwork, and generic logs. Editing a names list must not immediately replace what is on screen. Define who can see and show it, and how pagination is reviewed.

Acceptance: an ambiguous folio prompts a choice; TBI cannot retrieve unintended CRC service data; public state exposes no private names; deleting a test names collection follows the documented retention behavior; editing or importing never sends a live command.

### 5. ADAPT: add an explicit continuing-sharing experience for Simone

**Priority: medium-high; discovery shelf explicitly approved by Daniel on 2026-09-13.**

The current shared-library code exports visible published CRC graphics with source mappings; that is a sound foundation. The new plan focuses much more on integration than on how Simone discovers what CRC adds next month.

Add New from CRC / Updated from CRC, a real TBI-branded preview, and one-click Customize. For a previously customized item, show the upstream change and offer an independent new draft; preserve Simone's wording and layout. Preserve complete multipart prayers when importing. An unavailable CRC feed must not break existing TBI material.

Daniel chose the **New from CRC shelf with one-click customization**, not automatic creation of TBI library copies. New and updated CRC material appears on the shelf; Simone chooses what to customize into an independent TBI draft. Never overwrite local edits. Do not add a selective sharing-approval gate: all current and future published CRC overlays are already approved to share.

Acceptance: publish a synthetic new CRC graphic, discover and customize it in TBI, revise the CRC original, and demonstrate both visibility of the update and preservation of the TBI customization.

### 6. R8/U2: qualify availability claims and record partial releases

**Priority: high for release recording; confidence: 95%.**

The relay deploy script checks a gate file once, deploys the two workers sequentially, and writes a success record only after both succeed. If the second deployment fails, the first may already be deployed with no record from this invocation. Write progress before mutation, record each worker's result/version as it completes, and retain partial-failure evidence with a recovery instruction. Refresh the read-only idle check immediately before each deployment when the earlier observation is no longer current.

Zero connected renderers is useful evidence, not proof nobody intends to use the system or that an output has not temporarily lost its connection. Keep the already-approved quiet-window practice; this does not require the rejected setlist-freeze feature.

The handoff says a three-second grace absorbs reconnects, and identical console/module timing means they never disagree. Those are goals, not guarantees across separate connections and hosts. Say “Reconnecting” during the grace period, never preserve green without current acknowledgement, and document slower recovery. Do not declare the red-pulse cause proven by a short probe that failed to reproduce it.

Acceptance: simulate first-worker success/second-worker failure without deploying production; retain an accurate release record. Exercise transient loss, sustained loss, mismatched revisions and reconnect in rehearsal.

## Recommendations across the ten product categories

Confidence estimates below are judgments from Daniel's stated preferences, not measured probabilities. The proposed additions exceed 80% confidence; subjective choices remain choices.

| Category | Recommended addition or adjustment | Confidence |
|---|---|---:|
| Gaps / service coverage | Keep a manual whole-service coverage checklist while G1 is built. An imported setlist cannot prove every spoken, spontaneous or fallback moment is covered. | 95% |
| Feature base | Finish custom announcements, speaker cards, scripture references and full multipart duplication before polishing cross-product integrations. Give each a real user task and completion evidence. | 95% |
| Usability | Put recent/frequently used books and a direct opening-words search above the full shelf. Avoid making Michael traverse twelve books to retrieve a prayer he knows. Preserve his last useful filters. | 90% |
| UX/UI | Make Save, Review, Publish and Show visibly distinct. After publish, distinguish “Published” from “Ready in live library” when synchronization is pending or failed. Recoverable errors preserve typed work. | 95% |
| Beauty | Judge complete camera composites and small stream views, not only dark-page consistency or full-size stills. Test a representative bilingual panel, long English reading, lower third, artwork and QR combination. Sparse text can be intentional; avoid nagging short-text templates with under-fill warnings. | 90% |
| Adaptability | Make continuing CRC sharing visible and easy, with TBI branding, independent revisions and workspace-specific external links. Simulate a CRC-feed outage with TBI still usable. | 95% |
| Reliability | Add restart-proof pairing, universal emergency-clear semantics, exact-version fit review, and partial-release recovery as explicit acceptance checks. | 95% |
| Liturgical integrity | Pair Hebrew/transliteration by source units, not merely similar line length. Preserve edition/folio and canonical wording; repagination and source updates produce reviewable revisions. | 95% |
| Accessibility / participation | Carry keyboard focus, visible focus indicators, text status in addition to color, drawer focus behavior, zoom and Hebrew reading order through the new UI. Keep arrow-key navigation out of text fields. Real Hebrew/transliteration readability remains human acceptance. | 90% |
| Ownership / cost | Make normal use and recovery possible without Daniel's terminal. Include sign-in recovery, device replacement, retained restore evidence and an actual two-workspace cost worksheet for new recurring services. | 95% |

For G3's budget check, calculate a workload before choosing infrastructure: 100 viewers polling every two seconds for a two-hour service produce 360,000 requests; four such services produce 1.44 million. These are illustrative request counts, not a price quote. Account separately for edge requests, uncached origin work, database activity, Chromium publication work and both congregations. Do not infer a bill from a provider's free-tier headline.

## Suggested execution order

1. Preserve completed A/A2 work and its release sequence. Resolve the partial-deployment record issue before using the relay release procedure.
2. Continue B. Include the publish contract, visible synchronization outcome, accessible editor behavior and Simone's sharing flow. Do not block B on a font preference.
3. Deliver C with real restart/reconnect acceptance. A successful first pairing alone is insufficient.
4. Break D into small releases: source identifiers/matching; private names and layer-state contracts; optional QR; congregation-scoped setlist integration; public participation endpoint; cross-repo feed/MCP bridge. Respect their actual dependencies. Existing manual source and service workflows remain usable while other repositories catch up.
5. Move E's page split earlier if it makes the Services workflow clearer; it need not wait for every integration.

This sequencing retains approved scope. “Feature complete before beta” should mean all agreed software behavior is built and has evidence, with the specifically human/hardware questions reserved for beta. It should not imply that local tests have already answered those questions.

## Release-to-beta evidence

Use the existing ledger rather than create another competing tracker. Add these scenarios and record observed results, not just checkmarks:

- Michael finds a siddur passage, creates and duplicates a graphic, changes its look, reviews and publishes it without AI or Daniel's intervention.
- Simone customizes a CRC graphic with TBI branding, then receives a later upstream change without losing her version.
- Both complete setup from their own saved OBS/vMix projects, restart, and recover connection. Record time and assistance needed; proposed usability targets are a first custom graphic within ten minutes and ordinary retrieval within thirty seconds, subject to Daniel's judgment.
- Both distinguish Inspect, published availability, requested output, rendered output and actual program video.
- Every emergency clear removes the intended layers; an unavailable cloud connection has a practiced compositor-side fallback.
- Automated checks cover workspace boundaries, stale review, pairing scope, lost connections and release failure; physical cross-workspace operation remains in the human beta ledger.
- Each congregation rehearses a representative full service, including a spontaneous graphic, with Singular available.

## Open decisions and implementation handback

### Approved addition: Google sign-in

Daniel approved this addition after the review on 2026-09-13. Build before beta, with permanent device pairing taking priority. This is an approved requirement, not a pending suggestion.

- Make **Continue with Google** the primary human sign-in option; keep existing password access and recovery available, including for people who do not use Google. Preserve current accounts, drafts, ownership and roles through the migration.
- Use Google OpenID Connect for basic identity (`openid email profile`) only. Do not request Gmail, Drive or Calendar access. Google identifies the person; the application's invitation and membership system determines congregation access. No open registration, domain-wide auto-admission or inferred administrator rights.
- Bind a validated Google issuer/subject to the existing member. Use an authenticated account-linking or valid invitation flow to establish that binding; do not silently attach a Google account to a privileged existing account solely because an email string matches. Handle different invited and Google email addresses explicitly without inventing new memberships. Validate tokens and the sign-in transaction with a maintained implementation, including issuer, audience, expiry and applicable anti-forgery checks.
- Create the normal application session after sign-in. Keep memberships independent across CRC and TBI, even when one Google identity belongs to both. Disabled membership must remain disabled regardless of a successful Google sign-in.
- **Device pairing is independent:** Google sign-out, human session expiry, password changes and Google unavailability must not revoke or interrupt already-paired outputs/controllers. Devices never use a human Google access token as their permanent connection credential. Explicit device revocation remains a separate supported operation.
- Keep the existing Overlays MCP OAuth service intact. Google as a human identity provider and Overlays as an OAuth provider to MCP clients are distinct responsibilities.
- Configure the Google application's audience to support invited users from both congregations; do not restrict it to CRC's Google organization. Register explicit callback URLs for both workspaces and appropriate local development. Store provider credentials only in the existing secret-management paths. Record configuration ownership and recovery steps, with no secret values in documentation. If a Google dashboard action requires Daniel, prepare the code and exact remaining setup instructions first.

Acceptance: existing owner links and returns through Google without duplicate membership; an invited editor receives only the assigned role; an uninvited Google user receives no access; an account can have different roles in the two workspaces; revoked/disabled membership cannot sign back in through Google; the password/recovery path still works; canceled sign-in returns cleanly; human logout/expiry leaves paired devices operating and able to reconnect. Record real Google callback evidence separately from mocked local tests. Google documentation: [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

### Product choices resolved

Daniel answered both questions on 2026-09-13: Clear now removes all layers; QR/bug is optional and off by default. Simone gets a New from CRC shelf with one-click customization. These decisions are also recorded in the canonical build handoff. Neither question remains pending.

For Claude: reconcile this review against commits made after `f323fc2`; mark each amendment accepted, already addressed (with evidence), or disputed with a reason in your next return note. Amend the canonical plan once decisions are settled. Do not rebuild completed Phase A/A2 work merely because it is mentioned here. This review changed no implementation, credentials, deployment or live output.
