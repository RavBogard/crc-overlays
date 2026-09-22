## Companion integration patterns for broadcast graphics — research report for CRC Overlays

I read module source (actions/feedbacks/presets/variables), HELP.md files, and product docs for each system below. Findings first, then a ranked "patterns worth borrowing" section.

---

## 1. Singular.live — what you're replacing

**Repo:** https://github.com/bitfocus/companion-module-singularlive-studio (root: `actions.js`, `index.js`, `lib/`, `companion/HELP.md`)
**HELP:** https://raw.githubusercontent.com/bitfocus/companion-module-singularlive-studio/master/companion/HELP.md
**Underlying API:** https://developer.singular.live/quick-start

**Actions (10, all in `actions.js`):**
| id | what it does |
|---|---|
| `animateIn` / `animateOut` | composition dropdown |
| `updateControlNode` | Control Node dropdown + **Value textinput with `useVariables: true`** (calls `parseVariablesInString` first) |
| `updateButtonNode` | "Activate button" |
| `updateCheckboxNode` | node + checkbox |
| `updateTimerNode` | node + play/pause/reset |
| `updateSelectionNode` | node + selection dropdown built from the node's options |
| `updateColorNode` | node + colour picker with alpha |
| `takeOutAllOutput` | no options |
| `refreshComposition` | no options |

**Can it set text?** Yes — `updateControlNode` sets one field's value, and it accepts Companion variables. But it's **one field per action**, even though the underlying Singular API can set several at once: `PATCH https://app.singular.live/apiv2/controlapps/:appToken/control` with `{"subCompositionId":"…","state":"In","payload":{"Header":"…","Main Text":"…"}}`.

**Presets: none. Variables: none. Feedbacks: none.** `index.js` only calls `setActionDefinitions()` — there is no `setFeedbackDefinitions`, `setVariableDefinitions` or `setPresetDefinitions` anywhere in the module.

**Dynamic content:** the composition and control-node dropdowns *are* built from the live account — `await this.SingularLive.getElements()` during `initSingularLive()`, bucketed by node type (buttons, timers, checkboxes, colours, selections). But that only runs at init/config-change; nothing streams back.

**Bottom line:** Singular gives you playback triggers and blind text pokes. Companion has **no idea what is on air** and the buttons can't show the text they will fire. Per-service text editing actually happens in Singular's separate web Control App (https://support.singular.live/hc/en-us/articles/360001652991-Control-Application), not on the Stream Deck. Your existing feedbacks (requested vs rendered) are already ahead of it.

---

## 2. H2R Graphics — the strongest example, and the closest analogue to CRC Overlays

**Repo:** https://github.com/bitfocus/companion-module-h2r-graphics (`src/actions.js`, `src/feedback.js`, `src/presets.js`, `src/tcp.js`, `src/utils.js`)
**Product docs:** https://h2r.graphics/docs/api/companion/ · https://h2r.graphics/docs/control/variables/ · https://h2r.graphics/docs/api/http/

**Transport (`src/tcp.js`):** Socket.IO over WebSocket to `http://<host>:<portV2>`. It listens for one event, `'updateFrontend'`, which carries the **whole project** — graphics/cues, media, themes, text variables, lists. On every such message it runs:

```
self.setVariableDefinitions(variables)
self.setVariableValues(variableValues)
self.updateActions()
self.updatePresets()
self.updateFeedbacks()
self.checkFeedbacks('graphic_status')
```

That is the architectural centrepiece: **actions, presets, variables and feedbacks are all regenerated whenever the project changes.**

**Variables:** `graphic_<id>_contents`, `graphic_<id>_label`, `graphic_<id>_status` for every graphic, plus type-specific ones (lower-third lines, timers, scores, social), plus the project's own text variables.

**Actions — yes, you can edit graphic text from Companion.** A whole family of "Update content — …" actions, each with `graphicId` (dynamic dropdown) plus the fields that type actually has:
- `updateContentLowerThird` → `line_one`, `line_two`, `line_three`
- `updateContentLowerThirdAnimated` → animation dropdown + two lines
- `updateContentMessage`, `updateContentTicker` (title + items), `updateContentWebpage`, `updateContentUtilityLargeText`, `updateContentTime`, `updateContentBigTimer`, `updateContentImage`
- `updateBuildText` and `updateCustomHtmlTemplate` — **option fields generated per graphic** from that graphic's own template properties
- `setTextVariable` — sets a *project-level* text variable (posts to `updateVariableText/<id>`)
- plus `showHide`, `showHideGraphicWithVariable`, position/scale/theme, transition override, telestrator, speaker timer, `addVariableListItem`, `addVariableSelectRow`, `googleSheetSelectRow`, `googleSheetRefresh`

**Dynamic dropdowns, all populated from the running app:** `graphicId` from `SELECTED_PROJECT_GRAPHICS.map()` via `graphicToReadableLabel(c)`; images from `SELECTED_PROJECT_MEDIA`; themes from `SELECTED_PROJECT_THEMES`; Google Sheets tabs from `SELECTED_PROJECT_GOOGLE_SHEETS`; the text-variable dropdown filters project variables with `/^text\.\d+$/`.

**Feedback:** one boolean, `graphic_status`, with a **seven-state lifecycle** — Ready, Cue on, Coming on air, On air, Going off air, Cue off, Off air — plus a graphic dropdown that accepts a typed/variable ID.

**Presets — generated per graphic:**
```js
SELECTED_PROJECT_GRAPHICS.forEach((graphic) => {
  if (graphic.type === 'section') return null
  presets[graphic.id] = createPresetShowHide('Show/Hide', graphic)
})
```
and critically the **button label is pulled from the app, not typed in Companion**:
```js
text: `$(${self.config.label}:graphic_${item.id}_${labelSource})`
```
where `labelSource` is a config choice between the graphic's `label` field and its live `contents` (`useLabelForPresets`).

**Text variables (the per-service-text mechanism):** graphics embed tokens like `[text.1]`, and lists as `[list1.row1.cell1]`. Set via `POST http://<ip>:4001/api/<project-id>/updateVariableText/<variable-id>` with `{"text": "…"}` (https://h2r.graphics/docs/api/http/). Lists import from CSV; v3 added unlimited text variables and pasting a Google Sheet ID into the Variables tab (https://h2r.graphics/posts/20260116-new-in-v3/). Change the token once → every graphic using it updates.

---

## 3. vMix titles (companion-module-studiocoast-vmix)

**Repo:** https://github.com/bitfocus/companion-module-studiocoast-vmix — `src/` split into `actions/`, `feedbacks/`, `presets/`, `variables/`.

**Title actions** (`src/actions/titleActions.ts`): `setText` ("Title - Adjust title text"), `setTextColor`, `setTextVisible`, `setColor`, `setImage`, `setImageVisible`, `selectTitlePreset`, `titlePreset` (next/prev), `titleBeginAnimation`, `titleRender`, `setTickerSpeed`, plus a countdown family (`controlCountdown`, `setCountdown`, `changeCountdown`, `adjustCountdown`).

Each takes an `input` and a `selectedIndex` — "Layer Index or Name", `useVariables: true`, resolved as `isNaN(parseInt(index,10)) ? 'SelectedName' : 'SelectedIndex'`. **These field lists are *not* populated from vMix** — you type the layer index or name yourself. `setText` also has an `encode` checkbox for special characters.

**Variables** (`src/variables/inputVariables.ts`): vMix reports title text *back*:
```ts
inputSet.set(`input_${type}_layer_${textLayer.index}_titletext`, …)
inputSet.set(`input_${type}_layer_${sanitizedName}_titletext`, …)
```
(behind config flags `variablesShowInputTitleIndex` / `variablesShowInputTitleName`; same for `titleimage`, `titlecolor`). `src/variables/dynamicVariables.ts` maintains four "dynamic input" slots (0–3) with name/type/GUID/playing/duration/volume/text-layer values — the classic "point a slot at an input, then all your buttons work on the slot" pattern.

**Presets** (`src/presets/titleGraphicsPresets.ts`): **static.** Hardcoded `for (let i = 0; i < 5; i++) titleGraphicsDefinitions[\`title_preset${i}\`]` and a fixed `countdowns` array. Not generated from the live input list.

**Data Sources** (`src/actions/dataSourceActions.ts`): `dataSourceAutoNext`, `dataSourceNextRow`, `dataSourcePreviousRow`, `dataSourceSelectRow` (0-indexed), `dataSourcePlayPause`. vMix binds title fields to Google Sheets / Excel / CSV / XML columns (https://www.vmix.com/help23/DataSources.html) — so the *spreadsheet* is the text-editing surface and Companion only walks rows. This is how the vMix world solves "a different name every week."

---

## 4. SPX Graphics Controller (formerly spx-gc)

**Repo:** https://github.com/bitfocus/companion-module-spx-graphics-controller (root `actions.js`, `feedbacks.js`, `presets.js`, `variables.js`, `main.js`)
**HELP:** https://github.com/bitfocus/companion-bundled-modules/blob/main/spx-graphics-controller/companion/HELP.md

**Actions:** `play`, `play_ID`, `continue`, `continue_ID`, `stop`, `stop_ID`, `focusFirst/Next/Previous/Last`, `stopAllLayers`, `openRundown`, `controlRundownItem` (project/file + ID + play/stop/continue), `directplayout` (raw JSON body), `invokeTemplateFunction` (nine text fields: playserver/playchannel/playlayer/webplayout/prepopulated/relpath/command/customFunction/params).

**No action sets item text.** `variables.js` is effectively empty (`initVariables` with an empty array). Text editing lives entirely in SPX's own web UI.

**Presets — hybrid, and the dynamic half is worth stealing:** static transport buttons, plus it calls `GET /api/v1/rundown/get`, reduces each item to `{itemID, title}` (taking **the item's first text field as the title**), and emits one preset per rundown item bound to `play_ID`. Simple, ~40 lines, and it means the buttons are always the current show.

---

## 5. CasparCG, Ross XPression, Viz Flowics, Chyron, NewBlue

**CasparCG Server** (https://github.com/bitfocus/companion-bundled-modules/blob/main/casparcg-server/companion/HELP.md): AMCP passthrough — `LOADBG/LOAD/PLAY/PAUSE/RESUME/STOP/CLEAR/GOTO/CALL/SWAP`, `CG ADD / CG UPDATE / CG PLAY / CG STOP`, plus free-text AMCP. `CG UPDATE` carries template data JSON so text *is* settable, but as a raw command string: no field-aware options, no template list, no variables, no feedback.

**Ross XPression** (https://github.com/bitfocus/companion-module-rossvideo-xpression, `src/actions.js`): 22 sequencer/framebuffer actions — `CLRA`, `CLFB`, `CLFB_L`, `SWAP`, `SWAP_A`, `SEQI`, `TAKE`, `CUE`, `UNCUE`, `UNCUEALL`, `UP`, `DOWN`, `FOCUS`, `UPNEXT`, `READ`, `NEXT`, `SEQO`, `RESUME`, `RESUME_L`, `LAYEROFF`, `GPI`, `CUSTOM`. **No text-set action** and the repo has no presets/feedbacks/variables files. XPression's model is: the text is authored in the sequencer rundown, Companion just moves focus and takes. Shallow integration, deep product.

**Viz Flowics** (https://support.flowics.com/en/articles/8872364-integrating-viz-flowics-with-bitfocus-companion): **no module at all** — documented as Generic HTTP Request, `PUT https://api.flowics.com/graphics/<TOKEN>/control/overlays/transition` with body `[{"id":"n41","transition":"toggle"}]` (`toggle`/`in`/`out`). No text setting documented.

**Chyron PRIME:** only an open module request (https://github.com/bitfocus/companion-module-requests/issues/1470). **Loopic / Uno Graphics:** no Companion module (uno is Singular's own control-app product line — https://support.singular.live/hc/en-us/articles/4407694777485-uno-Control-Apps-Overview). The graphics modules Bitfocus actually lists are Brainstorm, H2R Graphics, H2R Layouts, Ross XPression, NewBlue Titler Live, NewBlue Captivate, Singular.live Studio, VICREO Broadcast Titles (https://bitfocus.io/connections).

**NewBlue Titler Live (companion-module-newbluefx-titler) — the one product that PUSHES to Companion.** Repo: https://github.com/bitfocus/companion-module-newbluefx-titler (`lib/actions.js`, `lib/feedbacks.js`, `lib/presets.js`, `contrib/qwebchannel/`).
- **Actions are fetched from the app at runtime:** `fetch('http://${config.host}:8000/companion/actions')` (or `requestCompanionDefinition("actions")` over QWebChannel). The module doesn't hardcode an action list at all.
- **Presets too:** `fetch('http://${config.host}:8000/companion/presets')`, and then:
```js
if (preset.bank != undefined && preset.bank.imageName != undefined) { … preset.bank.png64 = imageData; … }
```
Titler Live **ships the button artwork** (image names resolved to base64 PNGs) along with the labels. NewBlue's own page notes it "utilizes rich and unique icons for button presets" (https://newbluefx.zendesk.com/hc/en-us/articles/17192854026267-Bitfocus-Companion-Setup).
- Execution is a generic passthrough: `POST http://localhost:8000/companion/action/<action>` with the options object as JSON — so any field, including text, round-trips.

---

## 6. ProPresenter — the church-world analogue

**Legacy module** (https://github.com/bitfocus/companion-module-renewedvision-propresenter, `actions.js`, HELP at `companion/HELP.md`): next/previous/specific slide (with variable support and relative `+2`/`-1`), "Specific Slide With Label", "Specific Slide In A Group", looks, macros, props, media, timers, timeline. Variables: `$(propresenter:current_slide)`, `total_slides`, `presentation_name`, `connection_status`, `pro7_clock_n`.
Text *is* settable — the `messageSend` action:
```js
{ type:'textinput', label:'Comma Separated List Of Message Token Names',  id:'messageKeys' },
{ type:'textinput', label:'Comma Separated List Of Message Token Values', id:'messageValues' }
```
with `,,` as the escape for a literal comma. That's ProPresenter's lower-third-text mechanism: named tokens in the template, values pushed from the button.

**Current module** (https://github.com/bitfocus/companion-module-renewedvision-propresenter-api, ProPresenter 7.9+ public API):
- **Variables** (`src/variables.ts`, 70+): `active_presentation_current_slide_text`, **`active_presentation_next_slide_text`**, current/next slide *notes*, slide index/count/remaining, slide image UUIDs, playlist info, timers, capture status, stage layouts. There's a `variableValuesCache` and `ResetVariablesFromLocalCache()` so values survive re-definition.
- **Dynamic action options** (`src/actions.ts`): after actions are defined, dropdown `.choices` are swapped for live state — `instance.propresenterStateStore.looksChoices`, `macroChoices`, `propChoices`, `timerChoices`, `videoInputChoices`, `stageScreenChoices`, `stageScreenLayoutChoices`, `proGroups.map(g => ({id:g.id.name, label:g.id.name}))`. **Every one of them appends a "manual" choice** backed by a text input with variable expansion — the escape hatch.
- **Targeting model** (HELP.md): ACTIVE (the presentation with a triggered slide) vs FOCUSED (what the operator is looking at) vs SPECIFIED (by UUID, name, or zero-based index). UUIDs are permanent, names are friendly-but-ambiguous, index is positional.
- **Presets** (`src/presets.ts`): mostly static categories "ready for you to simply drag and drop onto your StreamDeck pages." HELP claims dynamic presets auto-generate for user-defined groups; in source the dynamic part is mostly *defaults* sourced from state (`clearGroupChoices[0]?.id`) plus variable-driven button text like `'Stop\n\n\n$(Propresenter-API:capture_time)'`.

---

## 7. Companion platform mechanisms (relevant to "can the app push to Companion?")

**Yes — three supported routes.**

1. **Module-side push (best).** Any module may call `setVariableDefinitions` / `setVariableValues` / `setActionDefinitions` / `setPresetDefinitions` / `setFeedbackDefinitions` as often as it likes. H2R re-runs all five on every `updateFrontend`; NewBlue fetches its whole action+preset catalogue from the app. There is no API restriction — the docs (https://companion.free/for-developers/module-development/connection-basics/presets/) present presets as init-time, but that's convention, not a limit.
2. **HTTP remote control** (https://companion.free/user-guide/v4.2/remote-control/http-remote-control/) — an outside app can poke Companion directly:
   - `POST /api/location/<page>/<row>/<column>/style?text=<text>` (also `bgcolor=`, `color=`; JSON body variant available)
   - `POST /api/custom-variable/<name>/value?value=<value>` and `GET` the same path
   - `GET /api/variable/<Connection Label>/<name>/value`
   Note: in v4 the style endpoint covers **text and colours only** — no `png64` image push over HTTP. Button artwork can only come from a module's preset definitions (as NewBlue does).
3. **Custom variables** (https://companion.free/user-guide/v4.1/secondary_admin_controls/custom_variables/): `$(custom:name)`, settable by internal actions, by modules, or over HTTP; they hold strings, numbers, booleans, and JSON objects/arrays.

Also relevant: **local variables** `$(this:page)`, `$(this:row)`, `$(this:column)`, `$(this:step)`, `$(this:page_name)`, `$(this:surface_id)` (https://companion.free/user-guide/v4.1/secondary_admin_controls/local_variables/), and **preset template groups** in API 2.x, which let one preset template emit many variations by overriding local variables — the intended way to ship hundreds of near-identical presets.

---

## 8. How churches and synagogues actually handle per-service text

Short version: **almost nobody types the name into Companion.** I could not find a single documented Stream Deck workflow where the operator enters a person's name on a button. What's documented instead:

- **Technically Church**, the main church Companion guide (https://technicallychurch.com/2024/04/how-to-use-stream-deck-with-companion-to-control-propresenter-a-complete-guide/): connect by IP/port/password, build buttons around "Cue Specific Slide" with `PlaylistNumber:ItemNumber` paths. Nothing about text.
- **Churchfront's full Stream Deck walkthrough** (https://churchfront.com/2025/12/18/streamline-your-service-with-stream-decks-full-church-stream-deck-walkthrough/): pages organised by *function* — lighting, Waves Tune key changes, booth, four PTZ sections with six presets each, ATEM row. Lower thirds are just "toggle on and off." Explicitly preset-recall, not text editing.
- **Crazy Amazing Designs** (https://www.crazyamazingdesigns.com/knowledge-base/bitfocus-companion-streamdeck-church-production): Companion as a cross-system macro bridge — one "Worship Set Start" button chains ProPresenter + ATEM + X32 + lighting. Again no variable text.
- The two places the problem *is* solved: **vMix Data Sources** (Google Sheets/Excel/CSV/XML mapped into title fields — https://www.vmix.com/help23/DataSources.html, https://www.vmix.com/knowledgebase/article.aspx/224/how-to-use-google-sheets-with-vmix-data-sources), and **H2R text/list variables + Google Sheets**. Both put the *text* in a document and leave Companion to step rows.
- OBS-world equivalent: Kukoon's Animated Lower Thirds (https://github.com/Kukoon/Animated-Lower-Thirds) ships a **dockable browser control panel** next to the browser source, with 4 lower thirds × 10 slots, talking to the overlay via BroadcastChannel. No Companion integration.

This is a useful validation: the correct place for the bar mitzvah student's name is a **prep surface** (the CRC Overlays web UI, or a sheet), and Companion's job is to make the 900 buttons *reflect* that prep, not to be the editor.

---

# Patterns worth borrowing — ranked for "900 pre-set buttons + per-service editable text"

**1. Named text tokens that cues reference, set once, applied everywhere.** *(H2R `[text.1]` + `setTextVariable` + `POST /updateVariableText/<id>`; Singular's `payload` object keyed by field name.)* Define tokens in cue text — `{{bnai_mitzvah_name}}`, `{{torah_portion}}`, `{{aliyah}}` — and add one Companion action `set_text_var(name, value)` with `useVariables: true`. Every one of the 900 buttons keeps working untouched, and the whole per-service edit is a handful of pokes. This is the single highest-leverage thing on the list, and it's also the cheapest: one endpoint, one action. Give the dropdown of token names the H2R treatment — populated from the service's actual tokens, with a "manual" entry.

**2. Regenerate everything from a live push.** *(H2R `src/tcp.js`: on `'updateFrontend'` → `setVariableDefinitions` + `setVariableValues` + `updateActions()` + `updatePresets()` + `updateFeedbacks()` + `checkFeedbacks()`.)* Your renderer already has a server. Have the Companion module hold a websocket to it and rebuild its action option lists, variables, presets and feedbacks whenever the active service changes. Without this, everything below decays the moment a cue is renamed.

**3. Button labels come from the app, not from Companion.** *(H2R preset text `$(label:graphic_<id>_<labelSource>)`, with a config toggle between the graphic's label and its live contents.)* Expose `cue_<id>_label` and `cue_<id>_text` variables and make presets use them. With 900 buttons this is transformative: the operator never re-labels anything, and a button for "Torah Blessing" visibly shows *this week's* name baked into it before it's pressed.

**4. Generate presets per library item, categorised the way the operator thinks.** *(H2R `SELECTED_PROJECT_GRAPHICS.forEach` → one show/hide preset each, skipping `section` rows; SPX `GET /api/v1/rundown/get` → one `play_ID` preset per item, titled from the item's first text field.)* Emit one preset per cue with `category` = the service. Rebuilding a service's page becomes drag-and-drop from the presets panel instead of 900 hand-authored buttons. Note SPX's trick of skipping structural rows and deriving the title from the first text field — you'll want the same for section headers in a service.

**5. A single status feedback with a lifecycle enum.** *(H2R `graphic_status`: Ready / Cue on / Coming on air / On air / Going off air / Cue off / Off air.)* You already distinguish requested vs rendered — formalise it as one boolean feedback taking a status dropdown plus a cue dropdown *that also accepts a typed or variable ID*, and mirror it as `cue_<id>_status`. One feedback definition covers 900 buttons, and the in-transition states ("coming on air", "going off air") are what stop an operator double-pressing during an animation.

**6. Dynamic dropdowns with a manual escape hatch.** *(ProPresenter API module: `.choices` replaced from `propresenterStateStore`, then `.concat(manual_*_choice)` backed by a variable-expanded text input.)* Every cue/service dropdown should be live-populated **and** keep a "Specify by ID/name…" entry. This is what keeps 900 buttons from breaking when content is re-authored, and it's what lets you build a handful of *generic* buttons that act on `$(custom:selected_cue)`.

**7. Sheet-as-editor, Companion-as-row-stepper.** *(vMix `dataSourceSelectRow` / `NextRow` / `PreviousRow` / `AutoNext` over Google Sheets-bound title fields; H2R list variables `[list1.row1.cell1]` + `addVariableSelectRow` + `googleSheetSelectRow` + CSV import + paste-a-Sheet-ID.)* For anything tabular — Torah reading passages, aliyot, honourees — bind the cue to a list and give Companion next/prev/select-row. The gabbai edits a sheet; the operator presses one button per aliyah. This is exactly how the vMix church world solves your problem and it scales past what token-substitution handles.

**8. An explicit targeting model so a few buttons can replace many.** *(ProPresenter HELP.md: ACTIVE vs FOCUSED vs SPECIFIED; identify by UUID / name / zero-based index.)* Add `animate_out_active`, `show_focused`, `next_cue`/`prev_cue` alongside the per-cue buttons. UUIDs are stable, names are friendly but ambiguous, index is positional — say which you guarantee, because your 900 buttons depend on that promise.

**9. "What's on now / what's next" as text variables.** *(ProPresenter `active_presentation_current_slide_text` and `active_presentation_next_slide_text`, plus current/next *notes*.)* `current_cue_text` / `next_cue_text` on one big status button lets the operator read the name that is about to appear before committing. Cheap to add, and it's the confidence check that a synagogue operator running an unfamiliar service most needs. ProPresenter's `variableValuesCache` / `ResetVariablesFromLocalCache()` is worth copying too — values survive a re-definition sweep instead of blanking.

**10. One action, many fields.** *(H2R `updateContentLowerThird` with `line_one`/`line_two`/`line_three`; H2R `updateBuildText` / `updateCustomHtmlTemplate` generating option fields **per graphic** from its template; Singular's `payload` object.)* Let `show_cue` accept per-field overrides, so a button can carry "…and set line 2 to this" inline. The per-graphic generated option fields are the advanced version and depend on pattern 2.

**11. Push text and labels into Companion from the prep app.** *(NewBlue: module fetches its whole action and preset catalogue from `http://<host>:8000/companion/actions|presets`, resolving `bank.imageName` into `preset.bank.png64`; Companion HTTP API: `POST /api/custom-variable/<name>/value?value=…` and `POST /api/location/<page>/<row>/<column>/style?text=…`.)* Once the name is entered in the CRC Overlays web UI, have it `POST` to Companion's custom-variable endpoint so `$(custom:bnai_mitzvah_name)` is available on any button. Prefer custom variables over the `/style` endpoint — style writes are per-button-position and fragile across 900 buttons, whereas a custom variable flows into every button that references it. If you ever want per-cue button artwork, note that the **only** route is module-supplied preset PNGs, NewBlue-style; the v4 HTTP API can push text and colours but not images.

**12. Ship the 900 as preset templates, not 900 preset objects.** *(Companion API 2.x "template" preset groups, which override local variables per instance; `$(this:page)`, `$(this:row)`, `$(this:column)`, `$(this:step)`.)* One template per cue *type* × a service's cue list beats emitting 900 fully-expanded definitions, and it keeps the presets panel navigable.

### One anti-pattern to name explicitly
Singular's module is the counter-example: rich product, thin integration. No feedbacks, no variables, no presets; dropdowns refreshed only at init and via a manual "Refresh Composition" button; text settable only one field at a time, blind. If CRC Overlays keeps its feedbacks and adds patterns 1–4, the home-built system is genuinely better integrated than the commercial product it replaces — and the gap is almost entirely in the *module*, not the renderer.

---

### Sources
- https://github.com/bitfocus/companion-module-singularlive-studio · https://raw.githubusercontent.com/bitfocus/companion-module-singularlive-studio/master/actions.js · https://raw.githubusercontent.com/bitfocus/companion-module-singularlive-studio/master/index.js · https://raw.githubusercontent.com/bitfocus/companion-module-singularlive-studio/master/companion/HELP.md
- https://developer.singular.live/quick-start · https://support.singular.live/hc/en-us/articles/360001652991-Control-Application · https://support.singular.live/hc/en-us/articles/4407694777485-uno-Control-Apps-Overview
- https://github.com/bitfocus/companion-module-h2r-graphics · `.../master/src/actions.js` · `.../master/src/presets.js` · `.../master/src/feedback.js` · `.../master/src/tcp.js` · `.../master/src/utils.js` · `.../master/companion/HELP.md`
- https://h2r.graphics/docs/api/companion/ · https://h2r.graphics/docs/control/variables/ · https://h2r.graphics/docs/api/http/ · https://h2r.graphics/posts/20260116-new-in-v3/
- https://github.com/bitfocus/companion-module-studiocoast-vmix · `.../master/src/actions/titleActions.ts` · `.../master/src/actions/dataSourceActions.ts` · `.../master/src/presets/titleGraphicsPresets.ts` · `.../master/src/variables/inputVariables.ts` · `.../master/src/variables/dynamicVariables.ts` · `.../master/companion/HELP.md`
- https://www.vmix.com/help23/DataSources.html · https://www.vmix.com/knowledgebase/article.aspx/224/how-to-use-google-sheets-with-vmix-data-sources
- https://github.com/bitfocus/companion-module-spx-graphics-controller · `.../master/actions.js` · `.../master/presets.js` · `.../master/variables.js` · https://github.com/bitfocus/companion-bundled-modules/blob/main/spx-graphics-controller/companion/HELP.md · https://github.com/TuomoKu/SPX-GC
- https://github.com/bitfocus/companion-bundled-modules/blob/main/casparcg-server/companion/HELP.md
- https://github.com/bitfocus/companion-module-rossvideo-xpression · `.../master/src/actions.js`
- https://github.com/bitfocus/companion-module-newbluefx-titler · `.../master/lib/presets.js` · `.../master/lib/actions.js` · https://newbluefx.zendesk.com/hc/en-us/articles/17192854026267-Bitfocus-Companion-Setup
- https://support.flowics.com/en/articles/8872364-integrating-viz-flowics-with-bitfocus-companion · https://github.com/bitfocus/companion-module-requests/issues/1470 · https://bitfocus.io/connections
- https://github.com/bitfocus/companion-module-renewedvision-propresenter · `.../master/actions.js` · `.../master/companion/HELP.md`
- https://github.com/bitfocus/companion-module-renewedvision-propresenter-api · `.../main/src/variables.ts` · `.../main/src/actions.ts` · `.../main/src/presets.ts` · `.../main/companion/HELP.md`
- https://companion.free/user-guide/v4.2/remote-control/http-remote-control/ · https://companion.free/user-guide/v4.1/secondary_admin_controls/custom_variables/ · https://companion.free/user-guide/v4.1/secondary_admin_controls/local_variables/ · https://companion.free/for-developers/module-development/connection-basics/presets/ · https://companion.free/user-guide/v4.2/config/buttons/creating/
- https://technicallychurch.com/2024/04/how-to-use-stream-deck-with-companion-to-control-propresenter-a-complete-guide/ · https://churchfront.com/2025/12/18/streamline-your-service-with-stream-decks-full-church-stream-deck-walkthrough/ · https://www.crazyamazingdesigns.com/knowledge-base/bitfocus-companion-streamdeck-church-production · https://github.com/Kukoon/Animated-Lower-Thirds · https://qlab.app/cookbook/more-advanced-companion/
