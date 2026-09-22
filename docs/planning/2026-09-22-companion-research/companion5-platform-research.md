# Companion 5.0.3 deep-integration research — what's possible, what isn't

**Method note:** I read the actual source, not just docs. I shallow-cloned `bitfocus/companion` and checked out the **exact `v5.0.3` tag** Michael runs (verified: `git describe` → `v5.0.3`, `package.json` → `5.0.3`), plus `bitfocus/companion-module-base` at main (base `2.1.3`, host `1.1.2`). Where docs and source disagree, I flag it — and they do disagree on two things that matter a lot.

Confidence labels: **[source]** = read in v5.0.3 code; **[docs]** = official documentation; **[inferred]** = my reasoning, not directly stated.

---

## The five findings that should drive the architecture decision

1. **The single biggest gotcha:** in Companion 5, every button has an **"Allow style changes"** switch that is **OFF by default on any button created in 5.x**. While it's off, *every* external way of setting a button's text/colour/image silently does nothing — HTTP, OSC, TCP/UDP, Ember+, *and* Companion's own internal "Button: set text" actions. Michael's ~1,900 buttons were imported from 4.x, so they were force-set to **ON** by the upgrade. New buttons he makes will be OFF. This is the difference between "the web console relabels buttons live" working and failing, and it's not in any documentation. **[source]**

2. **You *can* push an image to a button over HTTP** using `png64` — but this is **undocumented**; the official HTTP page doesn't list it. It works only on HTTP (not OSC/TCP). **[source]**

3. **A converter can safely emit the OLD 4.x flat-button format and let Companion 5 upgrade it.** This is a genuinely reliable path, not a hack — the upgrade scripts dispatch on `control.type`, so old-shaped buttons get converted and new-shaped ones are left alone. Bonus: buttons that arrive via this path get "Allow style changes" set to **true** automatically. **[source]**

4. **Your module can host its own web API inside Companion** at `/instance/<connection-label>/...`, CORS-enabled, no auth. This is probably the cleanest integration point you have and it's easy to miss. **[source + docs]**

5. **A browser page can act as a real Companion surface** via the Satellite API's per-button subscriptions — showing Michael's actual Stream Deck button bitmaps live in a web console. Companion 5.0.3 speaks Satellite API 1.12.0, which includes both subscriptions and PNG bitmaps. **[source]**

---

## 1. Module API (`@companion-module/base` 2.x)

### Version compatibility — your specific question, answered definitively

**A module built on `@companion-module/base` 2.0.4 with runtime `node22` runs on Companion 5.0.3. Confirmed.** **[source]**

The check lives in `shared-lib/lib/ModuleApiVersionCheck.ts`:

```js
export const MODULE_BASE_VERSIONS = ['1.14.0', '2.1.0', '2.1.2-nightly-main-...']
// each becomes `${major} - ${major}.${minor}.x`
const validModuleApiRange = new semver.Range(`~0.6 || ${moduleBaseRules.join(' || ')}`)
```

The accepted ranges are `~0.6`, `1 – 1.14.x`, and `2 – 2.1.x`. `2.0.4` falls inside `2 – 2.1.x`. **Ceiling to watch: 2.2.0 and above would be rejected by 5.0.3** — if you ever bump the module past 2.1.x, Companion 5.0.3 will silently refuse to list it. `https://github.com/bitfocus/companion/blob/v5.0.3/shared-lib/lib/ModuleApiVersionCheck.ts`

Runtime: `assets/nodejs-versions.json` in 5.0.3 ships `node18: 18.20.8`, `node22: 22.23.1`, `node26: 26.5.0`. `node22` is present and is the well-trodden path — it's also the only modern runtime that *doesn't* need the `--allow-net` permission flag, per `NodePath.ts`. **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Instance/NodePath.ts`

What Companion 5.0.3 itself ships: `@companion-module/host` **1.1.1**, plus `@companion-module/base-old` (`~1.14.1`) to run legacy 1.x modules. Modules bundle their own `base`; Companion supplies the host. Any module declaring API ≥ 2.0.0 is run through the newer child-process handler (`doesModuleUseNewChildHandler`). **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Instance/Connection/ApiVersions.ts`

### Presets — much more capable than in 4.x

Presets in 2.x are a genuine content-delivery mechanism, which matters if you want the overlay catalogue to appear as ready-made buttons. `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/preset/definition.ts`

**Possible: [source]**
- **Multi-step buttons** — `steps: CompanionButtonStepActions[]`, each with `down`, `up`, `rotate_left`, `rotate_right`, plus **long-press groups keyed by duration in ms** (`[duration: number]`, with a `runWhileHeld` option).
- **Two preset flavours.** `type: 'simple'` (flat style, like 4.x) and `type: 'layered'` — the latter carries a full Companion 5 element stack (`elements: SomeButtonGraphicsElement[]`) and per-feedback **`styleOverrides`**.
- **Images in presets: yes.** The simple style has `png64?: string`; the layered form has an `image` element with `base64Image`. `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/graphics.ts`
- **`alternatives`** — ship a rich layered variant *and* a simple fallback under one preset id; the host picks what it can render. Good hedge if you ever need to support both 4.x and 5.x.
- **Categories are now a two-level structure**: `CompanionPresetSection` → `CompanionPresetGroup` (each with id, name, description, keywords). `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/preset/structure.ts`
- **Template groups — the standout feature for your case.** `CompanionPresetGroupTemplate` takes one preset as a template plus a list of `templateValues`, and generates one preset per value by substituting a named local variable. One template definition → a button per prayer/overlay in the catalogue, without emitting 200 near-identical preset objects.
- **Presets can reference Companion's built-in `internal:*` actions** and logic building blocks (`internal:logicIf`, `internal:logicWhile`, `internal:actionGroup`, `internal:logicOperator`) with nested children. So a preset can ship real conditional logic, not just a flat action list.
- **Presets can define local variables**, either a fixed `startupValue` or a value driven by a feedback (`variableType: 'feedback'`).
- **`notes`** — copied onto the button, visible to the operator. Useful for "this button is generated, don't hand-edit".
- **Regenerating dynamically: yes.** Call `setPresetDefinitions(...)` again whenever your catalogue changes; it replaces the whole set. **[source, `base.ts`]**

**Not possible / caveats:**
- Regenerating presets **does not touch buttons the user already placed on the grid.** A preset is a template that's copied at drag time; changing the preset later leaves existing buttons untouched. **[inferred — nothing in the code propagates preset edits to placed controls, and presets are explicitly described as "copied to the button"]** This is the central limitation if you were hoping to update 1,900 buttons by updating presets.
- **No bulk drag.** `PresetDragItem` carries exactly one `{connectionId, presetId, variableValues}`. Presets go onto the grid one at a time. **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/webui/src/Buttons/Presets/PresetDragItem.tsx`

### New in 2.x: modules can define button graphics elements

`setCompositeElementDefinitions()` lets a module publish reusable **composite graphics elements** — named, option-driven bundles of layers that the user can add to any button from the element picker. **[source]** `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/graphics-composite.ts`

This is the most interesting Companion 5 capability for a graphics team: you could ship a "Prayer Overlay Status" element that draws the right thing, and let Michael drop it onto any button rather than hand-building layers. Element primitives available: `text`, `image`, `box`, `line`, `circle`, `gauge`, `group`, `composite`, plus the `canvas` base and a `reference` element that reuses another button's drawing.

### Variables

- `setVariableDefinitions()`, `setVariableValues()`, `getVariableValue()`. **[source, `base.ts`]**
- **Rate limit worth knowing:** Companion 5.0 added "rate limit variables updates from modules to be at most 50hz". Bursty per-frame updates will be coalesced. **[docs — v5.0.0 release notes]**
- Variables work in layered button text: text elements take `CompanionGraphicsElementValue`, i.e. either a literal or an expression. **[source]**
- **Local variables** (per-button) and **expression variables** (named, computed) are new user-facing concepts in 5.0; modules feed them via `value` feedbacks and action results rather than defining them directly. **[source + docs]**

### Feedbacks

Three types now (`boolean` | `value` | `advanced`): **[source]** `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/feedback.ts`

- **`boolean`** — returns true/false, carries `defaultStyle`. The type you should use. In v5 these drive **style overrides** on individual elements.
- **`value`** — *new in 2.x.* Returns any JSON value; this is what backs feedback-driven local variables. Very useful for pushing structured state onto a button without a style.
- **`advanced`** — returns a full style object and can return `imageBuffer` (base64 raw pixels, `RGB`/`RGBA`/`ARGB`, with position and `drawScale`) or `png64`. **Explicitly discouraged in the source:** *"It is discouraged to use this type of feedback… This type will likely be removed in a future major version of the module API."* **Do not build new work on advanced feedbacks.** **[source]**
- `learn` + `learnTimeout` (default 5s) on both actions and feedbacks. Note the 2.0 behaviour change: return **only** the learned values, so expressions in untouched fields survive. **[source]**
- `subscribe` / `unsubscribe` on both actions and feedbacks. **[source]** `https://github.com/bitfocus/companion-module-base/wiki/Subscribe-unsubscribe-flow`

### Actions

- **Actions can now return a result** (`hasResult: true`), and the user can store that result into a local or custom variable. **[source + docs]** This is new in 5.0 and is a clean way for the graphics system to hand data back into Companion (e.g. "which overlay is live" → variable) without polling.
- **Dynamic dropdown choices: yes, but coarse.** `choices` is a plain array on the definition; to change it you call `setActionDefinitions()` again with the whole set. There's no per-field refresh callback. `allowCustom` lets users type a value not in the list — worth enabling so a stale catalogue doesn't block them. **[source]** `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/input.ts`
- `recordAction(action, uniquenessId?)` — **action recorder is supported**, so Michael could record overlay operations into a button. **[source, `base.ts`]**

### Config, secrets, status, logging, OSC, HTTP

- `getConfigFields()`; input types include `static-text`, `textinput`, `dropdown`, `multidropdown`, `checkbox`, `number`, `colorpicker`, `custom-variable`, `bonjour-device`, and **`secret-text`**. Secrets are a first-class, separately-stored concept (`saveConfig(config, secrets)`, `init(config, isFirstInit, secrets)`). **[source]**
- `updateStatus(InstanceStatus, message?)`, `log(level, message)`. **[source]**
- `oscSend(host, port, path, args)` for outbound OSC; `createSharedUdpSocket()` for inbound UDP shared across connections. **[source]**
- **Upgrade scripts**: `upgrade.ts` provides the per-connection migration mechanism; Companion tracks `lastUpgradeIndex` per connection. **[source]** `https://github.com/bitfocus/companion-module-base/wiki/Upgrade-scripts`

### `handleHttpRequest` — a module can serve HTTP on Companion's own web server

**Confirmed, and more permissive than I expected.** **[source + docs]**

```ts
handleHttpRequest?(request: CompanionHTTPRequest): CompanionHTTPResponse | Promise<CompanionHTTPResponse>
```

Mounted in `UI/Express.ts`:
```js
// CORS is enabled here as this is part of the intentionally cross-origin accessible HTTP api.
this.app.use('/instance', cors(), async (r, s, n) => this.#connectionApiRouter(r, s, n))
```
and routed by **connection label** in `Instance/Controller.ts` (`/:label` → `connection.executeHttpRequest`). Unknown label → 404 JSON.

- URL: `http://<companion-host>:8000/instance/<connection-label>/<anything>`
- **CORS is wide open** — a browser page on any origin can call it.
- **There is no authentication on it.**
- Request gives you `method`, `path`, `query`, `headers`, `body`, `ip`, `hostname`, `baseUrl`, `originalUrl`. Response is `{status, headers, body}`.
- **Limitation:** no WebSocket/streaming — request/response only, and only a subset of Express request properties are forwarded to the module child process. **[docs]**

`https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/UI/Express.ts` · `https://companion.free/for-developers/module-development/connection-advanced/http-handler`

Practical read: this is the natural place to put a "what's on air / set this overlay" API, because it's cross-origin accessible from the browser *and* it runs inside your module where all the state already is. The catch is no auth and no push — the browser must poll.

---

## 2. Companion's own remote-control APIs

### HTTP REST — enabled by default

`http_api_enabled: true` by default in 5.0.3 (the legacy `/press/bank/...` API is `false` by default). TCP, UDP, OSC and Artnet are **all `false` by default** and must be switched on in Settings. **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Data/UserConfig.ts`

Routes registered in `HttpApi.ts` (verbatim from v5.0.3 source): **[source]**

```
POST /api/location/:page/:row/:column/press
POST /api/location/:page/:row/:column/down
POST /api/location/:page/:row/:column/up
POST /api/location/:page/:row/:column/rotate-left
POST /api/location/:page/:row/:column/rotate-right
POST /api/location/:page/:row/:column/step
POST /api/location/:page/:row/:column/style
POST /api/custom-variable/:name/value
GET  /api/custom-variable/:name/value
GET  /api/variable/:label/:name/value
POST /api/surfaces/rescan
GET  /api/connections
GET  /api/connections/:id/status
POST /api/connections/:id/restart
POST /api/connections/:id/enable
POST /api/connections/:id/disable
```

**Can an external system set the TEXT of a button at page/row/column? Yes — subject to the gate in §3.** **[source]**

```
POST /api/location/2/1/4/style
Content-Type: application/json
{ "text": "TEST", "bgcolor": "#ffffff", "color": "#000000", "size": 28 }
```

**Can it push an image? Yes — via `png64`, which is undocumented.** **[source]** Reading `#locationStyle` in v5.0.3, the accepted fields are broader than the docs admit:

| field | accepted values | documented? |
|---|---|---|
| `text` | string | yes |
| `color` | hex or `rgb(r,g,b)` | yes |
| `bgcolor` | hex or `rgb(r,g,b)` | yes |
| `size` | number or `"auto"` | in examples only |
| **`png64`** | **`data:image/png;base64,...`; empty string clears it** | **no** |
| **`alignment`** | e.g. `center:center` | **no** |
| **`pngalignment`** | e.g. `center:center` | **no** |

All can be sent as query params or JSON body. The handler validates `png64` with `png64.match(/data:.*?image\/png/)` — so it must be a PNG data URL. `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Service/HttpApi.ts`

**CORS:** `/api` is mounted with `cors()` and the comment *"CORS is enabled here as this is part of the intentionally cross-origin accessible HTTP api."* **A browser web app can call `/api/...` directly, cross-origin, with no auth.** **[source]**

### What the HTTP API cannot do

- **Cannot change the page on a surface.** No such route exists. This is TCP/UDP-only. **[source]**
- **Cannot import or export configs.** No route. **[source]**
- **Cannot trigger a trigger directly.** Workaround: set a custom variable and have a "variable changed" trigger fire. **[inferred]**
- **Cannot read a button's current style back** — the handler literally has `// TODO - return style` and replies `'ok'`. **[source]**

### TCP / UDP (default port 16759, both off by default)

```
SURFACE <surface id> PAGE-SET <page number>     ← the only way to change a surface's page remotely
SURFACE <surface id> PAGE-UP | PAGE-DOWN
LOCATION <page>/<row>/<column> PRESS | DOWN | UP | ROTATE-LEFT | ROTATE-RIGHT
LOCATION <page>/<row>/<column> SET-STEP <step>
LOCATION <page>/<row>/<column> STYLE TEXT <text>
LOCATION <page>/<row>/<column> STYLE COLOR <hex>
LOCATION <page>/<row>/<column> STYLE BGCOLOR <hex>
CUSTOM-VARIABLE <name> SET-VALUE <value>
CUSTOM-VARIABLE <name> GET-VALUE
SURFACES RESCAN
```
TCP lines must end `\n` or `\r\n`. **No image support here — text/color/bgcolor only.** **[docs, matches source]** `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/tcp-udp.md`

### OSC (default port 12321, off by default)

```
/location/<page>/<row>/<column>/press | down | up | rotate-left | rotate-right | step
/location/<page>/<row>/<column>/style/text <text>
/location/<page>/<row>/<column>/style/color <r> <g> <b>  (or css string)
/location/<page>/<row>/<column>/style/bgcolor <r> <g> <b>
/custom-variable/<name>/value <value>
/surfaces/rescan
```
**No image support, no page-set.** **[docs]** `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/osc-control.md`

### Artnet / DMX (off by default)

Buttons map sequentially to DMX channels from a configured start channel, row by row. Non-zero value = press+release. Input only — no style, no feedback. A GrandMA2 fixture file is offered in Settings. **[docs]**

### Ember+ and RossTalk

Ember+ exposes button text/color/bgcolor as settable parameters — and routes through the **same** `setStyleFields` path, so the same gate applies. RossTalk exists for press-style control. **[source, `companion/lib/Service/EmberPlus.ts`]**

### The tRPC/WebSocket API — powerful, but effectively closed to browsers

Companion's own web UI talks over tRPC on a WebSocket at **`/trpc`**. This is where the *real* power lives (imports, page imports, image library, everything the UI can do).

Two facts from `UI/Handler.ts`: **[source]**
- **There is no authentication.** Source comment: *"The tRPC api has no authentication, so without this any web page the user visits could open a…"*
- The only protection is a **strict same-origin check** on the WebSocket upgrade (`isOriginAllowed`), added in 5.0 as part of the cross-site hardening. A browser page on a different origin is **rejected**.

**But:** *"Clients that send no Origin header (non-browser tooling, tests) are allowed."* So a **server-side** process (Node, Python, curl-equivalent) can use the full tRPC API unauthenticated. **[source]**

`https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/UI/Handler.ts`

**Architecture implication:** your browser console gets `/api` + `/instance/<label>` only. Anything richer (page import, image library) needs a small server-side helper that speaks tRPC — or must go through your module. There's also an optional `admin_password` user config (default empty) which gates the web UI, not the REST API. **[source]**

---

## 3. Companion 5 specifics

### What changed in 5.0

From the official release notes (`https://github.com/bitfocus/companion/blob/main/docs/user-guide/9_whatsnew/v5-0-0.md`, also `https://companion.free/whats-new/v5-0-0/`): **[docs]**

- **Graphics overhaul** — buttons are a stack of elements (text, image, box, line, circle, gauge, group, composite, reference) on a canvas. Non-square rendering on Stream Decks that need it. Lazy rendering of inactive pages (real CPU win at 99 pages). Text gained two separate font-size properties.
- **Image Library** — images are first-class assets, organised in collections, referenced by many buttons; update once, updates everywhere. Direct per-button upload still works.
- **Expressions** — real control flow (`if`/`else`, loops, statements, functions) with an operation limit so runaway loops abort instead of hanging Companion.
- **Local variables** (per-button, now readable from *other* buttons), **feedback-based local variables**, **expression variables**, and **actions that return results into variables**.
- **Security** — shell commands and remote module installation **off by default**; cross-site protections; DoS protections on oversized/malformed data; DNS-rebinding guard; stricter origin validation.
- **Elgato plugin server removed** — the Stream Deck software plugin now connects over the **Satellite API**.
- Surface brightness action + variable; enable/monitor remote surfaces; mdns announce of satellite ports; compressed images over Satellite; "never lock" reworked onto surface groups.
- Triggers: **rate limiting when responding to rapid variable changes**.
- Platform: macOS 13.5+, Windows ARM64 native, configurable timezone.

Surface groups, connection collections, trigger collections and the module store all predate 5.0 (4.1–4.3) but are present. **[source — collection types in `ExportModel.ts` carry "Added in v4.1"/"v4.3" comments]**

### The "Allow style changes" gate — the thing to plan around

This is the most consequential undocumented behaviour I found. **[source]**

In `Layered.ts`:
```ts
layeredStyleUpdateFromLegacyProperties(diff) {
  return this.drawing.updateFromLegacyProperties(diff, this.options.canModifyStyleInApis)
}
```
In `LayeredButtonStyleEditor.ts`:
```ts
updateFromLegacyProperties(diff, canModifyStyleInApis) {
  if (!canModifyStyleInApis) return false   // silent no-op
  ...
}
```

Defaults, which is where it gets sharp:

| How the button was created | `canModifyStyleInApis` | Source |
|---|---|---|
| New button made in Companion 5 | **`false`** | `Layered.ts:132` |
| Button upgraded from 4.x (v12→v13 import) | **`true`** — commented `// Backwards compatibility` | `v12tov13.ts:66` |
| Placed from a module preset | **`false`** | `Thread/Presets.ts:333,368` |
| Page nav buttons | `false` | `PageButton.ts:130` |

Every external style path funnels through this one function: HTTP `/api/.../style`, OSC `/style/text`, TCP `STYLE TEXT`, Ember+, **and** the internal `button_text` / `bgcolor` / `textcolor` actions (verified in `Internal/Controls.ts`). So when the switch is off, a trigger inside Companion can't restyle the button either.

**In the UI:** button editor → options → **"Allow style changes"**, help text *"Allow the external APIs and internal actions to modify the style of this button"*. `https://github.com/bitfocus/companion/blob/v5.0.3/webui/src/Buttons/EditButton/LayeredButtonEditor/ControlOptionsEditor.tsx`

**How the legacy fields map onto layers** (`updateFromLegacyProperties`): Companion finds the layer *tagged with the matching usage* — `Text` for text/size/color/alignment, `Color` (a box element) for bgcolor, `Image` for png64/pngalignment — and edits that one. **If the button has no text layer, setting text silently does nothing even with the switch on.** So a button whose text was replaced with, say, a gauge is not relabellable from outside. **[source]**

### Export format v12 — and the converter question

**`FILE_VERSION = 12` in 5.0.3, confirmed** — and it's *still* 12 on the 5.1 main branch. Michael's observation is correct. **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/ImportExport/Constants.ts`

Note the internal DB version is separate and reaches **16** in 5.0.3 (17 on 5.1). Export files are stamped 12 regardless. **[source]**

**Is the schema documented?** **No.** There is no published JSON schema. The authoritative description is the TypeScript types: `https://github.com/bitfocus/companion/blob/v5.0.3/shared-lib/lib/Model/ExportModel.ts` — and note that the two types that matter most are deliberately untyped escape hatches:
```ts
export type ExportControlv6 = Record<string, any>       // TODO
export type ExportTriggerContentv6 = Record<string, any> // TODO
```
So even the source doesn't pin down a button's shape. You'd be reverse-engineering from real exports. **[source]**

Top-level shape: `full` (pages, triggers, custom_variables, expressionVariables, instances, collections, surfaces, `imageLibrary`) / `page` (single page + instances + `oldPageNumber`) / `trigger_list`. Page content is `controls: Record<row, Record<column, ExportControlv6>>` plus `name` and `gridSize`.

**Upgrade code location:** `companion/lib/Data/Upgrade.ts` (orchestrator) and `companion/lib/Data/Upgrades/vNtovN+1.ts` (15 scripts, v1→v16). Each exports `{upgradeStartup, upgradeImport}`. `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Data/Upgrade.ts`

**Can a converter emit the OLD format and let Companion upgrade it? Yes — and I'd recommend it.** **[source, high confidence]**

`upgradeImport()` runs every script from the file's declared `version` up to the internal target:
```ts
export function upgradeImport(obj, userConfig) {
  const currentVersion = obj.version || 1
  for (let i = currentVersion; i < targetVersion; i++) {
    if (allUpgrades[i - 1].upgradeImport !== undefined)
      obj = allUpgrades[i - 1].upgradeImport(obj, logger, userConfig)
  }
  obj.version = targetVersion
  return obj
}
```

The reason this is safe rather than fragile: **the converters dispatch on the control's `type` field, not just the file version.**

- `v12tov13` (the graphics overhaul) only touches `control.type === 'button'` — the old flat shape — and rewrites it to `'button-layered'` via `ConvertLegacyStyleToElements`. Anything already `'button-layered'` is skipped.
- `v13tov14` only touches `'button-layered'`, and is explicitly idempotent: `if ('fontsizeAllowShrink' in element) return`.

That's why Companion can stamp every export as `version: 12` and re-run the chain harmlessly. It also means:

> **A converter can emit `version: 12` with old-style `type: 'button'` controls carrying a flat `style: {text, size, color, bgcolor, png64, alignment, pngalignment}`, and Companion 5.0.3 will convert them to proper layered buttons on import — and set `canModifyStyleInApis: true` on every one.**

That last part is a real bonus: buttons produced this way arrive **relabellable by the web console**, whereas natively-authored v5 buttons do not. Emitting the old format is both *easier* (flat style, well understood from 4.x, and the only shape with any real-world documentation) and *better-behaved* for your use case than trying to author element stacks by hand against an undocumented schema.

Caveat: this relies on 5.0.3's conversion behaviour. It's a supported, exercised code path (it's how every 4.x user upgraded), but it is an implementation detail, so re-test after any Companion upgrade. **[inferred]**

### Partial page import

**Via the UI: yes.** Upload a file, preview it, then import a chosen source page into a chosen target page slot. **[source]**

**Via an API: yes, over tRPC** — `importSinglePage`: **[source]**
```ts
importSinglePage: publicProcedure.input(z.object({
  targetPage: z.number().int().min(1).or(z.literal(-1)), // -1 = append a new page at the end
  sourcePage: z.number().int().min(1),
  connectionIdRemapping: z.record(z.string(), z.string().optional()),
}))
```
Siblings: `importTriggers` (select trigger ids, `replaceExisting`) and `importFull` (with per-section `unchanged` / `reset` / `reset-and-import`). There's also `controlPreview`, which renders a PNG of any button in a *pending* import — handy for a confirmation UI.

Important: this is a **stateful two-step flow**. The file is uploaded first and held as `ctx.pendingImport`; the import mutations fail with *"No in-progress import object"* without it. And `connectionIdRemapping` lets you map the file's connection ids onto Michael's existing ones — essential so an imported page binds to his real `crc-overlays` connection.

`https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/ImportExport/Controller.ts`

**Restriction that shapes the design:** tRPC is same-origin-only for browsers. So **a page-import button inside your web console cannot call this directly** — it needs a server-side helper (no `Origin` header → allowed), or Michael does it by hand in Companion's UI. **[source]**

**Export formats:** `json-gz` (default, the `.companionconfig` file), plain `json`, and `yaml`. Import accepts all three; limits are 1 GiB for JSON/gz uploads. **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/ImportExport/Util.ts`

---

## 4. Triggers

The complete event list in 5.0.3, from `companion/lib/Resources/EventDefinitions.ts`: **[source]**

| id | name |
|---|---|
| `interval` | Time Interval: Fixed |
| `intervalRandom` | Time Interval: Random |
| `timeofday` | Time of Day (uses configured timezone) |
| `specificDate` | Once on Specific Date & Time |
| `sun_event` | On Sunrise/Sunset (lat/long) |
| `startup` | Startup |
| `client_connect` | Web client connect |
| `button_press` | On any button press |
| `button_release` | On any button release |
| `condition_true` | On condition becoming true |
| `condition_false` | On condition becoming false |
| `variable_changed` | On variable change |
| *(computer locked/unlocked — sub-options of the lock event)* | |

`https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Resources/EventDefinitions.ts`

Internal event bus (`TriggerEvents.ts`): `tick`, `startup`, `client_connect`, `locked`, `trigger_enabled`, `trigger_collections_enabled`, `control_press`, `variables_changed`. **[source]**

**Can a module supply its own trigger event types? No.** `EventDefinitions` is a fixed internal record, and there is **no** `setEventDefinitions` or equivalent anywhere in `@companion-module/base` (I grepped the whole module API surface — nothing). **[source, high confidence]**

**Can triggers run actions on an external event like "graphic went on air"? Yes, indirectly — and it works well.** Two routes: **[inferred from confirmed primitives]**

1. **Module variable + `variable_changed`.** Your module sets a variable (e.g. `$(crc-overlays:on_air_cue)`); a trigger watches it. Cleanest, and the module already has the state.
2. **Custom variable over HTTP + `variable_changed`.** The graphics system does `POST /api/custom-variable/on_air/value?value=lowerthird_12`. No module code needed, works cross-origin from a browser.

Either way you get the *effect* of a module-supplied trigger. Note the 5.0 change: **triggers are rate-limited when responding to rapid variable changes**, so a variable updating at video rate won't fire a trigger per change. **[docs]**

Also note `condition_true` / `condition_false` let a trigger fire on a **feedback** turning true — so a module feedback ("cue N is live") can drive a trigger without any variable at all. **[source]**

---

## 5. Satellite API, emulator and web buttons

### Could a web page be a real Companion surface? Yes.

**Companion 5.0.3 implements Satellite API version 1.12.0** (`API_VERSION = '1.12.0'` in `SatelliteApi.ts`). **[source]** `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Service/Satellite/SatelliteApi.ts`

That version number decides exactly which features Michael's install has:

| Feature | Introduced | In 5.0.3? |
|---|---|---|
| Core surface, bitmaps, brightness | 1.0–1.5 | **yes** |
| Encoder rotation `KEY-ROTATE` | 1.3.0 | **yes** |
| Input/output variables | 1.7.0 | **yes** |
| Pincode input | 1.8.0 | **yes** |
| `LAYOUT_MANIFEST` advanced mode | 1.9.0 | **yes** |
| **Button subscriptions (`ADD-SUB`)** | 1.10.0 | **yes** |
| `SERIAL`, `CONFIG_FIELDS`, `CAN_CHANGE_PAGE`, `LOCATION` | 1.10.0 | **yes** |
| Non-square buttons | 1.11.0 | **yes** |
| **`BITMAP_FORMAT` png/webp** | 1.12.0 | **yes** |
| LED rings/strips | 1.13.0 | **no** |
| `ROTARY_AMOUNT` (signed magnitude) | 1.14.0 | **no** (5.1+) |

**Transports:** TCP **16622**, WebSocket **16623** (WebSocket since 3.5). A browser can therefore speak Satellite **directly over WebSocket** — no server-side shim needed. **[docs]**

**Protocol shape:** newline-terminated text lines, `COMMAND-NAME ARG1=VAL1 ARG2="VAL with spaces"\n`. Server opens with `BEGIN CompanionVersion=X ApiVersion=1.12.0`, then `CAPS SUBSCRIPTIONS=1 ... BITMAP_FORMATS=rgb,png,webp`. Server sends periodic `PING`; client must `PONG`. **[docs]**

**Two ways to use it, and for your case the second is much better:**

**(a) Register a full surface** — `ADD-DEVICE DEVICEID=... PRODUCT_NAME="Graphics Console" KEYS_TOTAL=32 KEYS_PER_ROW=8 BITMAPS=72 BITMAP_FORMAT=png CAN_CHANGE_PAGE="Page"`. You get `KEY-STATE` messages with bitmaps; you send `KEY-PRESS`/`KEY-ROTATE`/`CHANGE-PAGE`. This creates a *new, independent* surface that appears in Companion's Surfaces list with its own page position — it does **not** mirror Michael's Stream Deck XLs.

**(b) Subscribe to specific buttons** — `ADD-SUB SUBID=<id> LOCATION=1/2/3`, replied to with `SUB-STATE SUBID=<id> TYPE=BUTTON BITMAP=... COLOR=... TEXT=...`; press back with `SUB-PRESS SUBID=<id> PRESSED=true`. Unsubscribe with `REMOVE-SUB`.

**(b) is the answer to "show Michael's actual Stream Deck pages in a browser."** You subscribe to the page/row/column coordinates his XLs are showing and get the *same rendered bitmaps* Companion is sending to the hardware, live, as PNG data URLs — trivially droppable into `<img src>`. No polling, no re-implementing Companion's renderer, and presses from the browser hit the same controls. **[source + docs, high confidence]**

Caveat: subscriptions are per-*location*, not per-*surface*, so if you want the browser to follow the XL as Michael pages around, you have to track which page that surface is on and re-subscribe. There's no "mirror surface X" command. **[inferred]**

Full spec: `https://companion.free/for-developers/Satellite-API` · user docs: `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/satellite.md`

Worth flagging: since 5.0 the **Elgato Stream Deck software plugin connects over this same Satellite API** — the old dedicated plugin server was removed. If Michael uses that plugin it must be up to date. **[docs]**

### Built-in browser surfaces

**Emulator** — `http://<host>:8000/emulator/<emulatorId>`. **[source, route `/_standalone/emulator/$emulatorId`]** A real surface: appears in Surfaces, has its own page position, follows page-change actions, supports keyboard hotkeys and pincode lock. None exist on a fresh install; create in Surfaces. Multiple emulators allowed; one emulator viewed from several browsers shares a page. Addressable from TCP as e.g. `SURFACE emulator PAGE-SET 23`. **[docs]** `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/6_interactive-buttons/emulator.md`

**Web buttons / tablet view** — `http://<host>:8000/tablet`. Shows buttons across pages in one scrollable view; configured via the cog and **persisted as URL parameters**, so a configured view is just a bookmarkable URL. **[source + docs]**

> **Explicit limitation, straight from the docs:** *"The Web buttons view does not appear to Companion as a Surface, so it cannot follow page changes you set up on buttons."*

So: tablet view = quick and zero-code but not a surface; emulator = a real surface but its own page position; Satellite subscriptions = the only way to mirror what a *specific existing* Stream Deck is showing. **[docs + source]**

---

## Consolidated: possible vs. not

**Possible**
- Press/release/rotate/set-step any button by page/row/column over HTTP, OSC, TCP, UDP, Artnet **[source]**
- Set button text, text colour, bg colour, size, alignment over HTTP/OSC/TCP/Ember+ — **if "Allow style changes" is on** **[source]**
- **Push a PNG to a button** via HTTP `png64` (undocumented, HTTP only) — same gate **[source]**
- Get/set custom variables; read module variables over HTTP **[source]**
- List/enable/disable/restart connections and read status over HTTP **[source]**
- Rescan USB surfaces **[source]**
- Change a surface's page — **TCP/UDP only** **[source]**
- Module serves a CORS-open HTTP API at `/instance/<label>/` **[source + docs]**
- Module publishes presets (multi-step, long-press, layered, images, local variables, template-generated) and regenerates them at runtime **[source]**
- Module publishes composite button graphics elements (new in 5.0) **[source]**
- Module reports state via variables/feedbacks → triggers react → actions fire **[source]**
- Action recorder, learn, subscribe/unsubscribe, upgrade scripts, secrets **[source]**
- Partial single-page import into a chosen slot, with connection remapping — UI, or tRPC from a non-browser client **[source]**
- A converter emitting **old-format `version: 12` `type: 'button'`** controls that Companion 5 upgrades on import — and which land with style-changes **enabled** **[source]**
- A browser acting as a Companion surface, or mirroring specific buttons' live bitmaps, over Satellite WebSocket (port 16623, API 1.12.0) **[source + docs]**

**Not possible**
- Changing style on a v5-authored button from outside **without** first enabling "Allow style changes" — fails silently, no error **[source]**
- Setting text on a button that has no text layer — silently does nothing **[source]**
- Changing a surface's page over HTTP REST or OSC **[source]**
- Reading a button's current style back over HTTP (`// TODO - return style`) **[source]**
- Import/export, image library, or page import over the REST API **[source]**
- Any tRPC call from a cross-origin browser page (same-origin enforced since 5.0) **[source]**
- A module defining new trigger event types **[source]**
- Firing a trigger directly by id from outside (go via a variable) **[inferred]**
- Bulk-dragging presets — one at a time **[source]**
- Updating already-placed buttons by changing preset definitions **[inferred]**
- Pushing images over OSC/TCP/UDP **[source]**
- LED rings and signed-magnitude rotation over Satellite (needs 5.1) **[source]**
- Any authentication on the REST, `/instance`, or tRPC APIs — network-level control is the only protection **[source]**

---

## Two things to verify on Michael's actual machine

1. **Spot-check `canModifyStyleInApis` on a real button.** My claim that his 1,900 imported buttons have it `true` rests on the v12→v13 upgrade path. Open one button's options and confirm "Allow style changes" is on. If his config took a different route into 5.0, the whole live-relabelling design changes shape.
2. **Confirm `png64` over HTTP against his install** before designing around it. It's undocumented, which means it's untested by the maintainers as a public contract and could change without a release note.

## One caveat on this report

Everything version-specific is read from the `v5.0.3` tag, so it's accurate for Michael today. But two of the most useful findings — the `png64` field and the old-format import trick — are **undocumented implementation details**, not published API. They're low-risk to use and easy to re-verify, but they should be written down in your own notes as "re-test on Companion upgrade," because a release note will never tell you when they change.

---

## Sources

**Companion source, pinned at the `v5.0.3` tag (Michael's exact version):**
- `https://github.com/bitfocus/companion/blob/v5.0.3/shared-lib/lib/ModuleApiVersionCheck.ts` — module API version range
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Instance/Connection/ApiVersions.ts` — API capability gates
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Instance/NodePath.ts` — node18/node22/node26 runtimes, permission flags
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Service/HttpApi.ts` — REST routes, `png64`/alignment style fields
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Service/ServiceApi.ts` — `setStyleFields` → `layeredStyleUpdateFromLegacyProperties`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Service/OscApi.ts`, `.../TcpUdpApi.ts`, `.../EmberPlus.ts` — other remote-control surfaces
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Service/Satellite/SatelliteApi.ts` — `API_VERSION = '1.12.0'`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Controls/ControlTypes/Button/Layered.ts` — layered button model, `canModifyStyleInApis` default `false`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Controls/ControlTypes/Button/LayeredButtonStyleEditor.ts` — `updateFromLegacyProperties`, the silent no-op gate
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Internal/Controls.ts` — internal `button_text`/`bgcolor`/`textcolor` actions use the same gated path
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/ImportExport/Constants.ts` — `FILE_VERSION = 12`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/ImportExport/Controller.ts` — `importSinglePage`, `importTriggers`, `importFull`, `controlPreview`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/ImportExport/Util.ts` — json-gz / json / yaml export formats
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Data/Upgrade.ts` — `upgradeImport` orchestrator, `targetVersion`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Data/Upgrades/v12tov13.ts` — graphics overhaul, `canModifyStyleInApis: true // Backwards compatibility`
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Data/Upgrades/v13tov14.ts` — idempotency guard
- `https://github.com/bitfocus/companion/blob/v5.0.3/shared-lib/lib/Model/ExportModel.ts` — export schema types
- `https://github.com/bitfocus/companion/blob/v5.0.3/shared-lib/lib/Model/ButtonModel.ts` — `canModifyStyleInApis` field
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Resources/EventDefinitions.ts` — trigger event types
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Controls/TriggerEvents.ts` — internal event bus
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/UI/Express.ts` — `/api` and `/instance` CORS mounts
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/UI/Handler.ts` — tRPC on `/trpc`, no auth, same-origin enforcement
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Instance/Controller.ts` — `/instance/:label` routing to module HTTP handler
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Data/UserConfig.ts` — API enable defaults
- `https://github.com/bitfocus/companion/blob/v5.0.3/companion/lib/Graphics/ImageLibrary.ts` — image library tRPC procedures
- `https://github.com/bitfocus/companion/blob/v5.0.3/webui/src/Buttons/EditButton/LayeredButtonEditor/ControlOptionsEditor.tsx` — "Allow style changes" UI label
- `https://github.com/bitfocus/companion/blob/v5.0.3/webui/src/Buttons/Presets/PresetDragItem.tsx` — single-preset drag

**Companion user documentation (v5.0.3 tree):**
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/http-remote-control.md`
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/tcp-udp.md`
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/osc-control.md`
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/artnet-dmx-control.md`
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/5_remote-control/satellite.md`
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/6_interactive-buttons/emulator.md`
- `https://github.com/bitfocus/companion/blob/v5.0.3/docs/user-guide/6_interactive-buttons/web-buttons.md`

**Release notes:**
- `https://github.com/bitfocus/companion/blob/main/docs/user-guide/9_whatsnew/v5-0-0.md`
- `https://companion.free/whats-new/v5-0-0/`
- `https://github.com/bitfocus/companion/releases`
- `https://raw.githubusercontent.com/bitfocus/companion/master/CHANGELOG.md`

**Module API (`@companion-module/base`, main branch — base 2.1.3 / host 1.1.2):**
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/base.ts` — `InstanceBase` surface
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/preset/definition.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/preset/definition-graphics.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/preset/structure.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/feedback.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/action.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/input.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/graphics.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/graphics-composite.ts`
- `https://github.com/bitfocus/companion-module-base/blob/main/packages/base/src/module-api/http.ts`

**Module developer documentation:**
- `https://github.com/bitfocus/companion-module-base/wiki` — wiki index
- `https://companion.free/for-developers/module-development/connection-advanced/http-handler` — HTTP handler (wiki page has moved here)
- `https://companion.free/for-developers/Satellite-API` — full Satellite protocol specification
- `https://github.com/bitfocus/companion-module-base/wiki/Presets`
- `https://github.com/bitfocus/companion-module-base/wiki/Feedbacks`
- `https://github.com/bitfocus/companion-module-base/wiki/Actions`
- `https://github.com/bitfocus/companion-module-base/wiki/Variables`
- `https://github.com/bitfocus/companion-module-base/wiki/Upgrade-scripts`
- `https://github.com/bitfocus/companion-module-base/wiki/Subscribe-unsubscribe-flow`
- `https://github.com/bitfocus/companion-module-base/wiki/Learn-action-feedback-values`
- `https://github.com/bitfocus/companion-module-base/wiki/Module-configuration`
- `https://github.com/bitfocus/companion-module-base/wiki/Input-Field-Types`
- `https://github.com/bitfocus/companion-module-base/wiki/manifest.json`
- `https://github.com/bitfocus/companion-module-base/wiki/Companion-module-library-versioning`
