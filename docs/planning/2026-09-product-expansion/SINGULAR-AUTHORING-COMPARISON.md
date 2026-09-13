# Singular authoring comparison and manual creation plan

## Recommendation

Build a fully manual, web-based authoring experience that borrows Singular's most useful boundary: ordinary users edit instances of approved templates, while a smaller group changes the templates themselves. Michael should never need AI, a layer tree, an animation timeline, source code, or a prompt to create, duplicate, edit, preview, and publish a graphic.

The product should have two plainly named workspaces:

1. **Graphics library** for Michael and other operators: find a graphic, duplicate it, fill in exposed fields, preview it, and publish it. This should handle nearly every weekly need.
2. **Template studio** for Daniel and congregation owners/designers: clone an approved template, change its visual system and motion within guardrails, test it against representative content, and publish a new template version.

Do not recreate all of Singular Composer. Its broad tree, widget, data-node, script, and timeline model serves arbitrary broadcast graphics. This project serves two congregations and can provide a smaller set of purposeful layouts with much safer customization.

## Evidence boundary

This comparison is based on Singular's current official support and developer documentation and on a source review of the current CRC editor in `app/author/page.tsx`. It is not a hands-on evaluation inside Michael's current Singular account or a logged-in trial of the current Singular interface. Labels, locations, and behavior described below are therefore documentation-backed; Michael's exact habits, most-used commands, and current account configuration still require a short observed workflow interview.

## The useful model in Singular

Singular separates **creating the visual template** from **preparing and operating individual graphics**:

- A **Composition** is a package of overlay designs. Composer exposes a composition tree, property panel, output preview, and data/control interface. Designers build graphics from widgets and groups, expose selected properties through Control Nodes, assign logic layers, and define animations.
- A **Control Application**, usually Studio, creates individual overlay pages from those designs. The operator selects a page in a playlist, edits only the properties exposed by the composition, sees a Preview and a separate Output, and takes the page in or out.
- Studio supports duplicating the selected overlay with `Ctrl/Cmd+D`, renaming, deleting, and moving through overlays with the keyboard. This makes “make another one like this” a first-class workflow.
- Editing an on-air overlay in Studio does not automatically change the output unless a field was deliberately configured for immediate update; the operator normally presses Update. This is a valuable protection against accidental live changes.
- Basic theme customization happens through exposed controls in the control app. Core design changes happen in Composer. Singular's own support guidance explicitly distinguishes those levels.
- Composer includes undo/redo, auto-save, explicit revisions, visual In/Out testing, and the ability to preview output on a clean page. These are useful safety and inspection patterns even though CRC should use a simpler design model.

The central lesson is not the exact Singular screen layout. It is the contract between template author and operator: the designer decides which fields are safe to edit; the operator works quickly inside those boundaries.

## Comparison with the current CRC editor

| Area | Singular pattern | Current CRC editor, from source | Recommended direction |
| --- | --- | --- | --- |
| Everyday organization | Studio playlist of prepared overlay instances | Left rail of saved drafts, with a separate import-existing-cue selector | Use a searchable graphics library with Published, Drafts, and Templates views; a weekly playlist may remain optional |
| Duplicate | Selected Studio overlay can be duplicated directly | No visible duplicate action | Add **Duplicate** beside Edit and Preview; make it the primary custom-graphic path |
| Editable fields | Only Composer Control Nodes appear in Studio | Source selection, title, accent title, layout, motion template, and three numeric font sizes appear together | Let each template declare friendly fields and constraints; hide numeric design controls under Advanced |
| Text model | Control nodes can expose text, images, colors, and other properties | Bilingual text is selected from authorized paired blocks; original English comes from authorized source blocks | Preserve authoritative-source mode and add an explicitly labelled manual Custom Text mode for appropriate non-canonical graphics |
| Preview/output | Selected page appears in Preview; on-air state has a separate Output window | Excellent isolated 1920 x 1080 preview, fit checks, and explicit note that it cannot control live output | Preserve isolation and fit checks; add camera-background preview and In/Out playback |
| Save/update | Studio content changes require Update to affect on-air content unless immediate update is enabled | Save version, render saved version, approve exact preview, then publish | Keep draft/live separation, but present one continuous edit-and-preview screen with a clear **Publish changes** action |
| Design editing | Composer tree, properties, control nodes, logic layers, timeline, and scripts | Layout and motion are selected from existing cue templates; font sizes are exposed | Build a constrained Template Studio, not a general widget/script environment |
| Recovery | Composer auto-saves and supports explicit revisions; undo/redo is session-bounded | Saved draft versions, exact preview approval, published revision history, and rollback | Retain the stronger CRC publication history; add immediate undo for unsaved edits and automatic draft recovery |

The current editor already has the right safety foundation: authoritative source selection, exact isolated preview, fit validation, explicit publication, stable published revisions, and rollback. Its main usability gap is that it feels like a publication pipeline for a specialist. It does not yet provide Michael's familiar “duplicate this graphic and change a few fields” path.

## Proposed graphics-library experience

### Library screen

Open directly to a visual library, not an empty multi-panel authoring form. Each item shows a thumbnail, display name, type, congregation, published/draft status, last changed time, and where it appears in Companion. Search should accept common prayer names, opening words, Hebrew names, and congregation-specific tags.

Selecting an item opens a detail drawer or page with the actions:

- **Preview**
- **Edit**
- **Duplicate**
- **Revision history**
- **Add to Companion page** or clear instructions for refreshing/placing its preset

The primary creation button should be **Add from siddur**. Beside it, a smaller **New** menu should offer the other creation paths:

1. **Add from siddur**
2. **Duplicate an existing graphic**
3. **Create custom text from a template**

There should be no prompt box and no AI prerequisite. If AI assistance is added later, it may suggest names, line breaks, or template choices, but every function must remain available through direct controls.

### Duplicate an existing graphic

This should be the fastest and most familiar path:

1. Choose a published graphic and press **Duplicate**.
2. A draft opens with the same template, content, titles, text sizing, and congregation ownership.
3. The name begins as `Copy of …` and is selected so Michael can immediately type a useful name.
4. The duplicate receives a new cue ID. The original and its Companion button remain unchanged.
5. Edit exposed fields while the preview updates.
6. Press **Review and publish**, inspect the exact animation, then **Publish**.
7. The new cue appears in the web library and as a Companion preset after catalog refresh. It does not silently occupy or rearrange a Stream Deck button.

Offer an explicit **Duplicate into another congregation** action only to members with appropriate access to both and only for material included in the permitted sharing selection. Membership alone does not grant access to all source/artwork rights. It must create an independent copy with recorded provenance; later edits must not cross congregation boundaries.

### Edit an existing graphic

Editing should preserve the cue ID so Michael's existing Companion button remains valid:

1. Open the graphic and press **Edit**.
2. A working draft appears with a prominent `Published version remains available` status. Do not label it live or on air without actual output evidence.
3. Change exposed content fields. For a prayer, select authoritative blocks and see paired Hebrew/transliteration together. For an announcement or one-off reading, choose Custom Text and type directly.
4. Preview the complete frame and In/Out motion. Fit and missing-asset issues appear next to the affected field and in the preview.
5. Publish the reviewed draft. Publication changes the version selected on the next take; it does not mutate a graphic that is already on air.
6. If an immediate live correction is required, provide a separate, clearly labelled **Update current output** control available only while the exact cue is selected and after a valid preview. Do not make ordinary typing immediate-to-air.

The current four conceptual stages—content, appearance, preview, publish—can remain in the data model without occupying four simultaneous panels. Michael should experience one form beside one large preview, with a concise readiness checklist near the Publish button.

### Create from a template

The template gallery should use large visual thumbnails and plain descriptions such as **Bilingual side panel**, **English reading panel**, **Lower third**, **Speaker name**, and **Announcement**. Each template defines:

- which fields the operator may edit;
- which content modes are valid;
- character, line, and pairing rules;
- allowed density choices;
- allowed imagery or logo choices;
- preview cases required before publication;
- the logic/output layer and standard In/Out motion.

After choosing a template, the operator fills a short form. Avoid asking for internal terms such as motion template, template cue ID, source ID, pixel type size, or layout implementation. Replace the current numeric font sizes with tested density choices such as **Comfortable**, **Compact**, and **Large print**. Keep exact numeric control under an Advanced disclosure for designers.

### Add from siddur

This is an AI-free primary workflow, not an advanced source-mapping tool. It should begin with a familiar library browser:

1. Choose a siddur, then browse its services and sections, or search across the available siddur library.
2. Search recognizes the prayer's display name, Hebrew name, common alternate spellings, transliterations, opening Hebrew words, opening transliterated words, and English opening words where approved English is available.
3. Open a prayer in a readable passage view that resembles reading a prayer, not inspecting source records. Hebrew and transliteration remain visibly paired. Approved English appears with the corresponding blessing or passage when available.
4. Select complete stanzas, paragraphs, or paired passage units. The interface prevents selecting only one side of an authoritative Hebrew/transliteration pair.
5. Choose **Use complete prayer** or **Choose passages**. If the prayer needs multiple panels, show the proposed boundaries and total count before continuing.
6. The product recommends compatible templates based on language, amount of text, and number of panels. Michael may choose another compatible visual template from thumbnails.
7. Adjust title and panel boundaries; do not retype authoritative wording.
8. Preview every panel as an ordered sequence, including In, Replace/Next, and Out behavior, then publish.

For the friend's congregation, source results and permissions must reflect that congregation's copied or independently maintained material. CRC's private drafts and non-shared sources do not appear.

The current editor already searches a CRC source library and preserves paired blocks, but the checked-in authoring sources are a bounded set assembled for the present morning-service work. Product copy and progress reports must not call that the complete siddur library until coverage has been measured. Build and display a coverage index by siddur, service, section, prayer, language pairing, and approved-English availability. Missing material should be labelled `Not yet available for overlays` and create an owner-visible coverage request; it must not silently disappear or invite Michael to work around it by retyping canonical text.

### Create custom text

Some graphics legitimately begin with typed text: guest names, program notes, announcements, timely readings, or a community-specific passage. Manual Custom Text mode should support:

- title and optional accent title;
- body text with deliberate line and paragraph breaks;
- optional paired columns when the user supplies both sides;
- optional image selected from the congregation's approved media library;
- template-compatible emphasis, such as one highlighted line;
- a required content-origin label: `Custom congregation text`, optionally with a source note.

Do not present typed custom text as authoritative siddur text. If Michael starts from an authorized prayer, wording edits should require **Convert to custom text**, explain that the source link will be broken, and create a new independent draft.

## Proposed Template Studio

Template Studio should satisfy meaningful visual customization without exposing an arbitrary webpage builder. A designer starts by cloning a system template or a congregation template. The screen contains:

- a component list limited to the template's known regions, such as artwork, title, Hebrew text, transliteration, English text, and background surface;
- a large 1920 x 1080 stage with safe-area guides and representative camera backgrounds;
- a property inspector for typography, colors, padding, alignment, border treatment, artwork, and visibility;
- tested layout variants rather than unrestricted nesting;
- an animation panel with named motion presets, duration, delay, direction, and easing;
- In, Out, Replace, and rapid-replacement preview controls;
- device-size and overflow tests using short, typical, and worst-case sample content;
- undo/redo, autosaved draft recovery, named versions, comparison with the active version, and rollback.

The designer may expose chosen options to the Graphics Library as operator fields, analogous to Singular Control Nodes. For example, a template can allow the operator to choose left/right placement and density while locking brand colors, logo geometry, safe margins, and animation timing.

For two congregations, theme customization should be token-based where possible: logo, palette, type family, panel surface, decorative artwork, corner/border treatment, and motion character. The friend's congregation can clone the CRC visual system and replace these tokens without forking renderer code. Per-template overrides remain available when a specific graphic needs a different structure.

Do not include in the initial Template Studio:

- arbitrary JavaScript or CSS;
- an unrestricted HTML/widget tree;
- external live-data node graphs;
- custom animation keyframe timelines;
- responsive layouts for unrelated output formats;
- scripting or AI-only actions.

Those are valuable in a general platform like Singular, but they increase failure modes and make operator support harder. Add one only after a real requirement from one of the two congregations cannot be met with components, tokens, and named motion presets.

## Interaction patterns to keep from Singular

- **Template instances:** many graphic pages can share one visual template while keeping different content.
- **Explicitly exposed fields:** operators see only safe, meaningful controls.
- **Duplicate as a primary action:** creating a variation begins from a known-good graphic.
- **Preview separate from output:** selection and editing never imply on-air change.
- **Update/take are intentional:** live output does not change because someone is typing.
- **Visual library or playlist:** graphics are recognized by name, order, and thumbnail.
- **In/Out preview controls:** motion is evaluated, not inferred from a still frame.
- **Undo and versions:** experimentation is recoverable.
- **Logic-layer replacement:** selecting another graphic in the same layer replaces the first cleanly rather than stacking them.

## Interaction patterns to improve

- Use ordinary language such as template, graphic, field, preview, and publish. Avoid exposing composition, sub-composition, widget, control node, payload, and logic-layer terms.
- Combine draft saving and exact preview into a responsive editing surface. Keep explicit publication as the live boundary.
- Show fit problems at the field that caused them and offer safe choices, such as another panel or a denser approved setting.
- Display the Companion consequence before publication: existing button remains linked, new preset will appear, or a page update is needed.
- Make provenance visible beside text. Michael should immediately know whether a passage is authoritative, copied from CRC, or custom.
- Use permissions to keep Template Studio out of the normal operator path.
- Keep weekly operation in Companion. The authoring site creates and maintains graphics; it should not become a second required live-control surface for Michael.

## Acceptance tests

### Michael's manual workflows

- Without AI or written documentation, Michael duplicates a known graphic, renames it, changes its exposed text, previews In and Out, and publishes it in three minutes or less.
- Without AI or raw source identifiers, Michael finds a prayer by siddur browsing, a common alternate spelling, and its opening words; each route opens the same authoritative passage.
- Michael selects a complete paired passage, reviews proposed pagination, previews all panels in order, and publishes it in five minutes or less.
- Michael edits an existing published cue without changing its cue ID or Companion button.
- Michael creates an announcement from a template using typed text and publishes it in five minutes or less.
- Michael can identify whether text is authoritative or custom before editing and before publication.
- The library reports source coverage honestly; a missing prayer is distinguishable from an empty search result or permissions problem.
- Typing, autosave, preview selection, and draft publication do not change the currently rendered or on-air graphic.
- Michael can undo an unsaved change, restore the last autosaved draft after closing the tab, and activate an earlier published revision.

### Preview and publication safety

- Preview uses the exact renderer, fonts, artwork, dimensions, and animation code intended for output.
- Short, typical, and worst-case samples pass fit tests for every published template and density option.
- The preview can play In, Out, and replacement repeatedly without touching live state.
- Publication is blocked when assets are missing, text overflows, paired source blocks are incomplete, or the preview is stale.
- Publishing a revised cue changes future selections while a currently displayed revision remains stable until an explicit update or retake.

### Template customization

- A congregation owner clones an approved template, changes congregation logo, palette, typography, artwork, and a named motion preset without code.
- A template author exposes an allowed field and it appears in the operator editor with its label, type, default, and validation.
- A template author cannot remove a field used by published cues without a migration report and explicit resolution.
- Publishing a new template version shows every affected cue and representative before/after previews; it does not silently alter the other congregation.
- The friend's theme and custom graphics remain independent of CRC after starting from approved shared material.

## Delivery order

1. Make **Add from siddur** the primary entry point and build an honest siddur/service/prayer coverage index around the existing authoritative-source foundation.
2. Add **Duplicate** and stable-ID **Edit** workflows to the existing library model.
3. Replace implementation-oriented appearance inputs in the operator view with template-declared fields and tested density choices.
4. Add manual Custom Text mode with clear provenance and conversion away from authoritative source text.
5. Consolidate edit, autosave, exact preview, readiness, and publish into one focused workspace while preserving revision safety.
6. Add visual thumbnails, search, status filters, and the Companion consequence/status to the library.
7. Add animated camera-background preview and sequence preview for multipart prayers.
8. Build congregation theme tokens and template cloning.
9. Build the constrained Template Studio only after the operator workflows are validated with Michael and the second rabbi.

## Questions for the observed Michael workflow session

- Does Michael normally duplicate an existing page, add another page from the same template, or edit a fixed set of pages in place?
- Which fields does he change most often: title, body text, Hebrew/transliteration, speaker name, image, layout, or duration?
- Does he prepare changes ahead of the service, during rehearsal, or while another graphic is on air?
- Does he rely on playlist order, search, thumbnails, keyboard shortcuts, or Stream Deck buttons to find the page he wants?
- Does he ever use Composer, or are all of his successful customizations made in Studio's exposed fields?
- When he says “custom slide,” does he mean new words in an existing design, a duplicated prayer panel, or a genuinely new visual layout?

These answers affect defaults and prioritization, but they do not block Duplicate, manual fields, safe preview, custom-text provenance, or the operator/designer split.

## Primary sources

- [Singular Control Application](https://support.singular.live/hc/en-us/articles/360001652991-Control-Application) — control apps create uniquely edited overlays from templates and output them.
- [Singular Studio user interface](https://support.singular.live/hc/en-us/articles/360002293711-Studio-User-Interface) — documents playlists, editable overlay fields, separate Preview and Output, In/Out, Update, and immediate-update behavior.
- [Singular Studio keyboard shortcuts](https://support.singular.live/hc/en-us/articles/360035022732-Studio-Keyboard-Shortcuts) — documents duplicate, rename, delete, take In/Out, and list navigation commands.
- [How to edit a Singular theme](https://support.singular.live/hc/en-us/articles/360048837772-How-do-I-edit-a-theme-in-Singular) — explicitly separates basic Studio customization from core Composer design changes.
- [Singular Composer reference](https://developer.singular.live/singular-basics/building-overlays-in-composer/composer-reference) — documents Composer's tree, properties, preview, data/control panel, copy/paste, undo/redo, and In/Out testing.
- [Building overlays in Composer](https://developer.singular.live/singular-basics/building-overlays-in-composer) — documents widgets, control nodes, data nodes, scripts, logic layers, and composition structure.
- [Setting up Control Nodes](https://developer.singular.live/singular-basics/building-overlays-in-composer/how-to-set-up-control-nodes-to-make-widget-properties-available-to-a-control-app) — documents the mechanism for exposing selected template properties to a control app.
- [Singular Composer revisions](https://support.singular.live/hc/en-us/articles/360027746952-Revisions-in-Composer) and [Composer saving](https://support.singular.live/hc/en-us/articles/360027977291-How-do-I-save-in-Composer) — document cloud autosave, named revisions, restore, and reference URLs.
- [Beginner's Guide to Composer](https://support.singular.live/hc/en-us/articles/360028255772-Beginner-s-Guide-to-Composer-Building-Custom-Graphics) — documents sub-compositions, logic layers, widgets, control nodes, animation timelines, and opening the result in Studio.
