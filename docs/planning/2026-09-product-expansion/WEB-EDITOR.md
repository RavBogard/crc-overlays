# Web creation and editing for Michael

Status: implemented foundation in release review; Michael and TBI operator acceptance still required.

## Product requirement

Michael uses Singular and does not currently use AI. He must be able to create a custom graphic, edit an existing graphic, duplicate it safely, organize multipart prayers, preview the result, and make it available to his buttons entirely through the website. AI is an optional assistant to the same drafts and tools, never a prerequisite or the route for missing manual features.

This is a first-class authoring product. It is not an administrative backend for a developer or AI agent.

The user's further explicit requirement is easy retrieval from the siddur library. **Add from siddur** is a primary creation/editing action and must reach the congregation's available siddur collection, not only prayers already represented by overlay templates or the initial morning source pack.

## Evidence and limits

The hosted editor returned 503 during the initial product review; that is historical evidence from before Neon service recovery and the current implementation. The current build has local browser evidence for custom drafting, exact review and publication, whole-prayer seven-slide creation, true duplication, isolated preview, and source browsing. Automated coverage verifies source-backed English, exact source snapshots, publication invariants, and independent TBI customization. These checks do not establish Michael usability timing, physical Companion/Stream Deck operation, OBS/vMix program output, or TBI operator acceptance.

Relevant evidence: `app/author/page.tsx`, `app/author/types.ts`, `app/author/preview.ts`, `app/author/author.css`, `lib/authoring-model.ts`, `docs/OPERATOR-QUICKSTART.md`, and `docs/AUTHORING-RELEASE.md`. See also [Singular comparison](SINGULAR-AUTHORING-COMPARISON.md) for externally researched familiar workflows.

## Historical baseline that motivated the implementation

The table below records the pre-expansion experience. Several rows are now implemented foundations; it remains here to preserve the problem statement rather than describe the current UI.

| Task | What exists | Gap for Michael |
| --- | --- | --- |
| Enter the editor | Paste a production control key stored in the tab | Should use the same invited-person sign-in as the library and setup |
| Find something to edit | Saved draft list plus a collapsed Import an existing cue selector | No unified thumbnail library of published graphics and drafts; opening a familiar published graphic requires understanding an import concept |
| Edit a graphic | Titles, layout selection, source selection, and three numeric font-size fields | Ordinary task language and visual manipulation are limited; no general body-text editor |
| Duplicate | Import adopts/opens a cue using its existing ID | This edits the original identity; it is not a true independent duplicate |
| Create a custom announcement | Body content must select canonical paired blocks or approved original-English source blocks | Original English reading does not mean Michael can type his own welcome, name, announcement, or reading |
| Choose a design | Lower third/left/right plus a second motion-template dropdown populated from named cues | Michael should choose a visual template once and inherit good defaults |
| See the result | Save, render the saved version, review exact preview | Feedback is deferred; edits clear the review/preview state rather than providing a continuously useful draft canvas |
| Publish | Separate save, render, approve, publish, plus explicit live-library synchronization recovery | The underlying safeguards are useful, but routine completion exposes too many internal stages |
| Correct a mistake | Published revision history and stale-write protection; browser unload warning for dirty work | No ordinary multi-step undo/redo or autosave. In-page New/import/open actions need explicit draft preservation coverage beyond a browser-unload warning |
| Assemble multipart prayers | Source groups and individual cue drafts | Source-selection groups are not a visible slide strip or complete prayer with ordered panels |
| Understand state | Version numbers, revisions, sync notices | Needs clear Draft, Saved, Ready for buttons, Update pending, and Currently displayed distinctions |

The existing review, source pairing, preview isolation, revision history, and pinned active graphic should be preserved. They are foundations to make simpler, not obstacles to remove.

## Current implemented foundation

The current release candidate provides invited-person sessions and returning email/password sign-in; a unified published/draft library; true independent duplication; typed custom content; continuous unsaved preview; undo/redo and recovery; exact-version review and publication; whole-prayer draft sets; and a 677-unit source browser across 12 books. Source English is distinct from original English, same-record bilingual English remains selectable, and 293 note-like blocks stay manually available while automatic whole-prayer creation omits them. TBI's CRC Library is read-only upstream content; Customize creates a TBI-owned draft with an embedded source snapshot, so future source-feed changes do not rewrite that copy.

## Proposed information architecture

Use three clear places: **Library**, **Editor**, and **Live control**. Setup and congregation settings remain accessible separately.

### Library

The landing view shows graphic thumbnails with name, prayer/service collection, panel count, and publication state. Search tolerates common prayer-name spellings. Published items and their working drafts are presented as one recognizable item with an update indicator rather than unrelated lists.

Visible actions: **New graphic**, **Edit**, **Duplicate**, **Preview**, **Add to collection**, and **Archive**. Archive is recoverable. If a published cue has existing Companion use, explain the consequence before removing it from new selections; do not silently recycle its ID or replace its content with another cue.

New graphic offers three starting points:

1. **From a prayer**: select a maintained source prayer and the desired passage.
2. **From a template**: choose a welcome/announcement, speaker name, reading, or other approved graphic template; type local content.
3. **Duplicate a graphic**: copy an existing graphic or multipart prayer into an independent draft.

For TBI, add **CRC Library** showing the complete current and future published CRC overlay library. Shared items remain read-only. **Customize** creates a local TBI draft with independent identity and retained provenance; upstream updates never overwrite it.

### Editor

Place the actual 16:9 graphic prominently in the center. Use a small thumbnail strip for panels on the left and a focused properties area on the right. A single graphic gets the same editor with one panel. A top bar identifies the congregation, graphic name, save state, undo/redo, preview controls, and **Review and publish**.

Clicking editable title/body regions selects the matching field. Provide reliable form fields and keyboard navigation as an equivalent path. Source prayer fields show the chosen passage and a clear **Change passage** action; local custom fields can be typed and pasted directly. Keep the display title separate from the internal library/button label, but explain both in normal language.

Provide visually illustrated template choices and defaults. Everyday controls are layout, text size/readability, alignment, spacing, and a few approved motion choices with **Play entrance/exit**. Resetting to the congregation default is easy. Advanced layout adjustment may expose a small number of named text/image regions, alignment guides, and size/position controls; a general animation timeline, scripting system, arbitrary widget ecosystem, and unrestricted layer editor are deferred until actual tasks justify them.

Use opaque reading surfaces, real source text, and the actual renderer in preview. Offer a neutral background and representative camera stills for checking composition. Backgrounds used for inspection never become part of the broadcast output unless explicitly selected as graphic content.

### Add from siddur

The entry point is available from New graphic, an existing graphic's text field, and the panel strip. Open a readable library browser rather than a technical source selector:

1. Choose a siddur and service, or search across the congregation's available library. Search prayer names, common transliterations, Hebrew, and opening words; filter to a service when names repeat.
2. See prayer names, opening lines, source/service identity, and available language channels. A prayer does not need an existing overlay to appear here.
3. Read the prayer and choose **Whole prayer**, complete stanzas/blessings, or a continuous passage with obvious start/end points. The interface keeps corresponding Hebrew/transliteration blocks together without asking Michael to select both independently.
4. Choose the available languages/presentation and see suggested panel breaks using the actual overlay template. English is offered when the source provides available English; missing translations are stated, never silently generated. An original English reading is clearly distinguished from translation.
5. Choose **Insert as new graphic**, **Add panels**, or **Replace this passage** according to the entry point. Replacement shows what will change, preserves undo, and never affects current program output.

Show normal source labels in the editor, with edition/revision details available on demand. If multiple siddurs contain similar prayers, identify them instead of silently choosing one. Retrieval should show the exact authorized version and preserve phrase/paragraph boundaries. Suggestions about panel count must meet the readability floor and remain adjustable; shortening must not omit content.

Search and insertion are manual browser capabilities. Optional AI may help find a passage, but both operators must be able to perform every step without it. TBI's CRC Library exposes all current and future published CRC material as a read-only upstream. TBI's own siddurs use the same browser once added to that workspace and remain private.

Because the current authoring source pack is bounded, full collection browsing requires inventorying and connecting the existing maintained siddur repositories. Treat retrieval coverage as a product acceptance matrix by siddur/service/language, not an assumption that a search box already exposes all available books.

### Completion and publication

Continuously autosave working drafts and update the local draft preview. Visible states distinguish Saving, Saved, Connection lost (changes retained), and Conflict needs attention. Never show Saved for a failed write. Preserve a recoverable working copy through navigation and retry; clear cached content appropriately when switching congregation or signing out on a shared computer.

**Review and publish** opens a focused final review of the exact latest saved content. Confirm fit/font readiness, show any material warnings and what changed from the published version, then offer **Publish**. Saving, authoritative preview generation, and version consistency happen behind that journey. A changed draft invalidates the final review automatically. Do not create four mandatory buttons for what Michael experiences as one finishing action.

After publication, show **Ready in Companion** when live-library delivery is confirmed, or **Published; sending to devices** / **Delivery needs attention** when it is pending. The existing active graphic stays unchanged until selected again. Any later explicitly offered **Show now** belongs to live control and must clearly identify the congregation and output; editing and preview must never issue that action implicitly.

## Text and ownership model

Support three clear content origins without requiring AI:

- **Source prayer**: exact selected maintained text, with Hebrew/transliteration pairing and readable provenance.
- **Local content**: Michael can type/paste an announcement, speaker name, original reading, or other custom content. Support Hebrew/RTL and multilingual fields where needed. These are congregation-owned drafts, not silent additions to the canonical siddur.
- **Local variant of a prayer**: an explicitly chosen copy that can be edited while retaining its source attribution and recording local deviations. Show the difference from the source. Never silently rewrite the maintained original or the other congregation's copy.

The ordinary editor can preserve source text by default without making custom slides impossible. A local variant is distinguishable from verbatim canonical content in the editor and publication history. All review rights are assigned through the small membership role model; Michael may have editor/publisher rights if the owner wants him to author independently.

Images/logos used in custom graphics should come from the congregation's asset library or a supported upload action with immediate visual feedback. Keep a bounded set of file formats and size limits in the design acceptance; don't require Michael to supply hosted image URLs, CSS, or repository paths. CRC Library items retain their source and attribution metadata. TBI-private assets and sources never enter the CRC upstream.

## Planned stories and acceptance

| ID | Story | Acceptance |
| --- | --- | --- |
| WEB-01 | Enter through one account and find a familiar graphic | Michael signs in, recognizes a graphic by thumbnail/name, and opens it directly; no key/import/MCP steps |
| WEB-02 | Duplicate safely | A duplicate has a new identity, recognizable suggested name, copied content/layout, and no publication or button reassignment; original output and history unchanged |
| WEB-03 | Create a custom announcement | Choose template, type title/body, optionally choose an asset, inspect, and publish entirely in browser; no AI or source-repository work |
| WEB-04 | Edit source prayers and create local variants | Passage selection preserves paired text; local editing is explicitly identified, retains origin, and never overwrites the source or another congregation |
| WEB-05 | Make a multipart prayer | Add/duplicate/reorder panels in a strip; review all content and panel boundaries; existing prayer/panel IDs and buttons are preserved during safe edits |
| WEB-06 | See changes immediately | Titles, fields, layout, and size update a draft preview without publication/live commands; saved vs unsaved rendering is unambiguous |
| WEB-07 | Recover ordinary mistakes | Multi-step undo/redo, recoverable archive, autosave, and draft recovery work across in-page navigation and transient failure; no false Saved state |
| WEB-08 | Adjust design without becoming a designer | Visual templates/defaults, accessible field controls, alignment/spacing, reset, and motion preview cover representative custom-graphic tasks |
| WEB-09 | Finish with one coherent review journey | Exact saved-version final preview, actionable fit issues, publication and device-delivery state; no stale preview can be approved/published |
| WEB-10 | Return to an earlier version | Visual comparison and readable history identify the old content; restore preserves identity and doesn't unexpectedly change the currently displayed frame |
| WEB-11 | Customize a CRC Library item in TBI | The complete upstream library is searchable; one-click Customize creates a local identity and history, accepts TBI branding/text, and later upstream changes never overwrite local edits |
| WEB-12 | Operate without AI and prove usability | Michael completes benchmark tasks unaided in-browser; optional AI creates/updates the same draft model without privileged publishing shortcuts |
| WEB-13 | Pull text directly from the siddur library | Browse/search available siddurs and services, locate a prayer without an existing overlay, select a whole prayer or passage, insert paired text with readable proposed panel breaks, and retain provenance entirely in browser |

## Benchmark tasks

Measure these with Michael on his ordinary editing computer after authoring is restored. Targets below are product goals, not tested performance claims.

1. Find and duplicate a familiar graphic, change its title/body, and publish it in under three minutes; original unchanged.
2. Create a branded custom welcome/announcement from a template in under five minutes without AI.
3. Build a two-panel prayer from maintained text, reorder panels, and review the complete reading in under ten minutes.
4. Make an accidental edit, undo it, navigate away, return, and identify which version is saved and which is ready for buttons.
5. Preview and publish while another cue is selected on the output; prove the active frame did not change.
6. Encounter a fit warning and correct it using readable guidance; no developer knowledge or numerically guessed CSS required.
7. Lose connectivity during editing; recover the draft without false publication success or silent loss of typing.
8. Have the second congregation customize a CRC Library item and verify CRC's original, published content, and buttons remain unchanged.
9. Find a prayer by its opening words in a different siddur/service, select a passage, and create an overlay in under three minutes after source availability is established; demonstrate Hebrew/transliteration pairing and correct source identity without AI.

## Delivery priority

First restore authoring, then deliver direct library editing, **Add from siddur**, true duplicate, local custom content, continuous preview, and save/recovery behavior as the first editor slice. Expand siddur retrieval coverage alongside the source inventory. Follow with multipart editing and consolidated publication/delivery feedback. Add limited advanced design tools after representative tasks reveal what Michael actually needs.

Editor work runs alongside installation simplification and congregation isolation. It is an explicit release gate before calling the product a practical Singular replacement. A complete AI connector does not satisfy any manual-authoring acceptance criterion.
