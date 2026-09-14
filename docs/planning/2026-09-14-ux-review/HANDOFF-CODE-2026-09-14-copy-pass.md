# Handoff for Code — Overlays copy pass (2026-09-14)

Worktree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion`. Preserve tracked modifications and untracked files. Do not reset or clean. Both workspaces (CRC and TBI) share this code; every change below applies to both unless it says otherwise.

This is the first of two handoffs from the 2026-09-14 UX review. It contains only the items that are copy, CSS, and one bug fix — nothing here depends on the layout decisions still being ruled on. Ship it as one PR. The owner's standing test applies: faster and better, never slower or more bureaucratic. Add no confirmations, modes, gates or steps.

## 1. Fix the `/author` hard-load gate (bug)

Reproduced twice in production: a full page load of `/author` (typed URL, refresh, or an invitation link) while signed in as an Administrator renders the "Open the library" card (Sign in / "or use the existing admin key" / Control key / Open the library). Client-side navigation to the same route from any other page opens the library normally. The route's session check is not seeing the session on a hard load.

Acceptance: refresh on `/author` while signed in opens the library. A new invitee opening their link lands on Live control (`/`), not the library. The "Control key" input and the "or use the existing admin key" divider are removed from every user-facing sign-in card; the control-key credential itself keeps working for devices and existing connections (Help already describes it as the transitional path) — it just stops being offered to people.

## 2. Say "output disconnected" exactly once on Live control

Today the same fact is stated four times on one screen: the amber `aside[status]` banner (four sentences, three CTAs), the red DISCONNECTED status strip with the same sentence, the DISCONNECTED chip on the LIVE NOW card header, and the footer's "Check graphics in vMix or OBS".

Keep one instance: a single amber line at the top of the content area reading

> **Output not connected** — Show still works; the graphic appears when it reconnects. [Fix]

`Fix` links to `/setup` (step 3 anchor if one exists). Remove the banner's "Setup steps" and "Service log" buttons and the "Only if a service is starting right now and this cannot be fixed: fallback steps" sentence; keep the `/help#fallback` link available from the Help page only. Delete the status strip's repeated sentence and thumbnail; keep a small DISCONNECTED chip on the on-air card header (that one is state, not prose). Delete the footer line "24 graphics published, visible · Trial · Check graphics in vMix or OBS" entirely.

Same rule on Health: the SYSTEM CHECK banner text "Playback and authoring answered, but no graphics output is connected in the current freshness window." becomes "No graphics output has been seen in the last 30 seconds."

## 3. Delete the reassurance copy

Remove every sentence whose only content is "this does not change what is live." A PREVIEW badge on preview frames and the PUBLISHED / DRAFT pill in the editor header carry that meaning. Verbatim strings to delete (search for each):

- "Nothing is sent to the output." (Live control preview empty state → the empty state becomes "Select a graphic to preview it.")
- "Preview only · the output does not change until you press Show"
- "Show still works and the graphic appears as soon as the browser is back." (folded into item 2's one line)
- "Sign in to create and prepare graphics without changing what is live." → "Sign in to edit graphics."
- "Prepare a graphic without touching live output." (library empty state; the READY WHEN YOU ARE card's duplicated Add from siddur / New custom graphic buttons also go — they exist in the left rail)
- "The published version stays available while you work."
- "ISOLATED PREVIEW" eyebrow → the frame keeps one badge: PREVIEW
- "This preview cannot issue live commands. A graphic already on screen remains unchanged."
- "Published output has not changed." (sticky footer; footer keeps only the save state, e.g. "Saved version 1")
- Toast "Opened “X”. Published output is unchanged." — remove the toast entirely; opening is not an event.
- "Working preview" / "Exact saved preview" labels under the preview frame
- "Collections are optional preparation aids; they never control the live output." and "Nothing is published by importing. This builds a prepared service you can review." (Prepared services — replace the page subtitle with "Group graphics for a service, ahead of time." and the import helper with "Import a planned service from centralreform.live.")
- "Nothing here changes a live graphic." (Source review subtitle)
- "Health checks never put a graphic on air." (Health)
- "Nothing on this page puts a graphic on air." (Setup, appears twice) and "Live control shows what is on air in its Live window and lets you Preview, Show, Animate out, and Clear now. Nothing on this setup page puts a graphic on air." (Setup READY card)

Toast behaviour everywhere: auto-dismiss after ~3 s, bottom-left, never over the editor's Look card. Toasts only for things that happened (saved, published, imported, invite created).

## 4. Scrub engineering vocabulary and eyebrow labels

Replace, everywhere they appear in UI text:

| Today | Replace with |
|---|---|
| "freshness window", "within the 30-second window" | "in the last 30 seconds" |
| "Revision 1789055589994" (Health, Live playback card) | remove from the card; keep behind a `Details` disclosure |
| "Live fe0996f32ae9a128 · Authoring fe0996f32ae9a128" | "Live and authoring match" (or "…differ"); hashes behind `Details` |
| "20 unopened baseline graphics predate retained source snapshots and cannot be compared exactly until opened or republished." | "20 older graphics have no saved source text. Open one to compare it." |
| "Relay" (Health row label) | "Playback" |
| "Device token" (Help) | "pairing code" where it means the code; "device credential" where it means the stored secret |
| "If the button turns red, open Companion's connection log and look for a line beginning Realtime closed (" | remove from Health; move to Help → Set up a computer once |
| "The entered-report sum is compared with the monthly plan only when all providers use the same window and were measured within 45 days." and "Monthly total unavailable · 0/3 providers reported in USD." | "Hosting cost: not reported. Target under $25/month." |
| "No current provider usage report is configured. This is unavailable, not zero." (×3) | "Not reported." |
| "Search to find a graphic. The full published list is on Live control." | "Search all published graphics." |
| "The starter includes published graphics and groups only complete numbered sets. Add source material to coverage only when your congregation actually uses it. This does not claim the service is complete." | "Starts with your published graphics. Add more as you need them." |

Delete these small-caps eyebrow labels (the card heading already names the card): ALWAYS AVAILABLE, OPTIONAL PREPARATION, BETA LEARNING, ISOLATED PREVIEW (becomes the PREVIEW badge), SYSTEM CHECK, ADMINISTRATOR VIEW, READY WHEN YOU ARE, SIGNED IN. Keep eyebrows only where they are functional state: PUBLISHED, PREVIEW · NOT LIVE → PREVIEW, LIVE NOW.

Button labels to normalise: "Show this graphic" → "Show"; "Clear now" → "Clear" (the Companion preset names can stay as they are); "Check now" / "Check sources" / "Check graphics connection" → "Check now"; "Record feedback" → "Save entry"; "Select all passages" → "Select all"; "Make slides from whole prayer" → "Add all as slides"; "Start from current library" → "Start from library"; "Create empty" → "Start empty". Do NOT rename Animate out, Preview, Publish, Save draft, Local wording, Duplicate, Archive, History in this pass.

Fix the Source review header: the page's own "Library" link and "Check sources" button currently render over the nav pills and cover "Account". Move page-level actions into their own right-aligned strip below the header on every page; on Source review that strip needs only "Check now" (Library is already a nav tab).

## 5. Remove every trace of the parallel trial (ruled 2026-09-14)

The parallel trial with Singular is how the rollout is described to people; the app is not about it. Remove, in both workspaces:

- Live control: the top-right "CRC TRIAL OUTPUT" pill; "· Trial ·" in the footer (footer is deleted anyway under item 2); the collapsed `<details>` "Connect vMix, OBS, or Companion" block at the bottom (duplicates Setup step 3; the "Copy output URL" it contains already exists on Setup).
- Setup: the "Parallel trial" pill; the subtitle "Add CRC Overlays beside your current graphics system. Your existing Singular setup, camera controls, and Companion pages stay in place during the trial." → "Connect Companion and the graphics browser on this computer."; the intro card's four-sentence scope paragraph → "About 10 minutes: one Companion connection and one browser input."; step 1 "Protect the setup you already use" and its checkbox (delete the step entirely and renumber); step 3's "…leave the existing Singular input in place for the trial." clause; step 5 "Rehearsal" and its checkbox (delete); the READY card (delete; the nav already offers Live control); footer "CRC workspace · Trial setup" → "CRC workspace". Fold step 4's connection check into the end of step 3 so the page is: 1 Companion, 2 Graphics output (with the check inline).
- Help: delete the cards "Return to Singular" and "Backup and restore rehearsal" and their jump pills; delete the bar "Guide version 2026.09.4 · For CRC · trial workspace"; in "Before a service" delete "Keep the existing Singular input available until the physical rehearsal has passed."; delete the closing paragraph "These guides describe the product workflow. A physical OBS/vMix, Companion, network, restart, and fallback rehearsal is still required before live use."; in "How the three parts fit together" delete the sentence "You need Overlays. You need centralreform.live only if you import a planned service. The web siddur needs nothing from you." (it also appears on Setup — delete there too).
- Service log: the "BETA LEARNING" eyebrow (covered in item 4) and the "This suggests a product gap" checkbox.
- Health: the RECOVERY card ("Need to act? Use the service fallback, backup, account, and restore rehearsal guides…") — delete.
- Source review: the "20 unopened baseline graphics" migration banner is reworded under item 4 here; whether it goes entirely is decided in the second handoff.
- Grep for "Singular", "trial", "Trial", "rehears", "parallel" in UI strings and Help content; anything not covered above, remove and list it in the PR description.

## Acceptance for the whole pass

- `/author` opens on refresh while signed in; no Control key field anywhere a person signs in.
- Live control shows the disconnect state in exactly one place when the output is down and in zero places when it is up.
- Grep of UI strings finds none of the deleted sentences in section 3, none of the left-column phrases in section 4, and no "Singular" / "trial".
- Source review header does not overlap the nav at 1100–1440px.
- Setup is two numbered steps plus the inline connection check.
- No new confirmation, mode, checkbox or step was added anywhere.
- Both `crc-overlays` and `tbi-overlays` deployments render the changes; TBI's copy says OBS where CRC's says vMix, as today.

## Not in this handoff (pending rulings)

Header collapse and role-filtered nav; Live control layout rebuild (list first, one on-air panel, one Show per row, thumbnails, opening-words subtitles, scan card as a row); one-click Publish; editor card restructure and BOOK/SERVICE merge and Panel→Slide; Prepared services → service order on Live control; folding Health / Service log / Source review / Setup out of the top nav.
