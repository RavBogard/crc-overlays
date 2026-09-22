# Implementation handoff — Companion cutover work

**Repo:** `crc-overlays` (Next.js app on Vercel, plus a Bitfocus Companion connection module under `companion/`)
**Date:** 2026-09-22
**For:** a Claude Code session with the full repo checked out
**From:** the Cowork research/synthesis session (owner: Daniel)

---

## How to read this document

Everything below was decided by the owner on 2026-09-22 after three research reports and a
code audit. Build what is described. Where a judgement is left open, the document says so
in one sentence.

I only had an excerpt of the repo. Every file path in this document is marked one of two
ways:

- **read** — I read the file and the line numbers are from the copy I read. Line numbers
  drift; treat them as a pointer, not a promise.
- **verify in repo** — I could not see the file. Do not assume it exists in the shape I
  describe. Look first.

Nothing in this document is invented from a file I could not see. Where I would have had
to guess, I say "verify in repo" instead.

---

## Who this is for and why it matters

**Michael is the operator.** He runs graphics for CRC from the booth on two Stream Deck
XLs driven by Bitfocus Companion 5.0.3. His Companion configuration has 99 pages and about
1,910 buttons; 908 of them talk to Singular Live through three connections. We are
replacing Singular with CRC Overlays.

**The specific pain this work fixes.** Per-service text today is typed twice by hand:
once into the Singular composition, and once into the Companion button label. Page 15 of
his configuration literally has a button labelled **"Student Name Noa"** next to one
labelled **"Student Name Ezra"**. Every b'nei mitzvah, every guest speaker, every funeral,
those labels get retyped. About 40 buttons are affected. That is the thing to retire.

**The owner's rulings, which constrain everything below:**

1. **Text for prayers is never typed.** Prayer text comes from the siddur through the
   authoring system. Nobody types liturgy into a box.
2. **Names and readings ARE typed.** A student's name, a guest's name, a Torah reader and
   portion — those are typed, per service, by a person.
3. **Michael prepares everything before a service**, on the booth laptop. There is no
   during-service authoring.
4. **The web console is a laptop surface.** Mobile is secondary. Design the "This service"
   page for a laptop with a keyboard.
5. **"Faster and better, not slower and more bureaucratic."** If a change adds a review
   step, an approval round trip or a second screen to a weekly task, it is the wrong
   change.
6. **Publish is one click.**
7. **No rehearsal mode, no staging workspace.** One live system.
8. **Single output.** One graphic on screen at a time, plus the scan card. This was ruled
   on 2026-09-22 and it is not reopened here.
9. **The module base version must stay at or below 2.1.x.** Companion 5.0.3 accepts module
   API `~0.6`, `1 – 1.14.x` and `2 – 2.1.x`. We are on `@companion-module/base` 2.0.4
   (`companion/package.json`, `companion/companion/manifest.json` — read). Bump it past
   2.1.x and Michael's Companion silently refuses to list the module.

**Michael has Administrator access** to the web console.

---

## The eight pieces of work, in order

Each section says what to build, how to know it is done, and which files are probably
involved.

---

## 1. Slot graphics ("This service")

### What to build and why

Today a name lives inside the graphic, so changing the name means re-authoring the
graphic, and the button that fires it gets relabelled by hand. Instead: a **fixed set of
graphics per service type whose text changes weekly but whose identity never changes.**
We call each one a **slot**. Michael's Companion button points at a slot's cue id forever.
Before a service, someone fills the slot's text on one console page, presses Save once, and
the graphic is different — with no button ever touched.

**The slot set to build now:**

| Service type | Slots |
| --- | --- |
| B'nei mitzvah | student name (one line); student names (two lines); Torah reading 1–7; Haftarah reading 1–3 |
| Shabbat | guest name |
| Funeral / Yizkor | Remember Them 1–3 |

That is 16 slot cues. The structure must leave room to add more slot sets later, because
the owner wants service **types**: Friday night, Saturday morning, b'nei mitzvah, High Holy
Days, funeral. Build the slot set as data (a list of slot definitions keyed by service
type), not as sixteen hard-coded pages of form fields.

### The id scheme — decision, and why

The module's catalog validator (`companion/src/catalog.ts:8-14` — read) accepts exactly two
shapes of cue id:

- a UUID, or
- `names:<collectionId>:<NN>` — the "Names for this service" panels, which are
  materialised into the **live catalog only** and are never published library cues.

**Recommendation: slots are simply regular, published, UUID cues.** Do not invent a
`slot:<key>` id namespace.

Why:

- The validator already accepts UUIDs. No module change, no relay change, no converter
  change is needed just to make a slot addressable.
- A published cue has the lifecycle we want: a stable id, revisions, rollback, fit-check,
  and it appears in `GET /api/catalog` like everything else. A Companion button pointing
  at it keeps working across every weekly edit, because a new revision does not change the
  id.
- The `names:` namespace has the **wrong** lifecycle. Those entries exist only while a
  prepared service exists, and the quick-start doc is explicit that removing the names or
  archiving the service removes them (`docs/OPERATOR-QUICKSTART.md`, "Names for this
  service" — read). A permanently-targeted Stream Deck button must never point at
  something that can evaporate.
- It keeps the blast radius small: the only new field anywhere is an optional marker
  saying "this cue is a slot, and its key is X" (see section 2).

**Seed the slots from the four unpublished drafts created 2026-09-16 via MCP** (all four
are in `drafts-2026-09-22.json`, all `activeRevision: null`, all layout `bottom`, content
mode `custom`, all built on template cue `efa9fad4-f7d5-4091-a708-82103028861b` — the
Barechu template):

| Draft | id | Current title / text | Becomes |
| --- | --- | --- | --- |
| Name Card (one line) | `17db1877-425a-4ea7-b123-664a9756f2ae` | "Central Reform Congregation" / "Reader Name" | b'nei mitzvah **student name (one line)** |
| Name Card (two lines) | `25737a2e-167c-4049-81fb-9654cb54a8f1` | "Central Reform Congregation" / "First Name\nSecond Name" | b'nei mitzvah **student names (two lines)** |
| Torah Reading slate | `e3624fda-b7ff-44a0-b3ef-7add80524ef7` | "Torah Reading" / "Reader Name\nPortion · Chapter:Verse" | **Torah reading 1** |
| Haftarah Reading slate | `d2a51926-4b98-4e73-b1f4-9d016966fd52` | "Haftarah Reading" / (same shape) | **Haftarah reading 1** |

The remaining twelve slots (Torah 2–7, Haftarah 2–3, guest name, Remember Them 1–3) are new
cues made the same way — duplicate the matching seed draft, rename, publish. Record every
one of the sixteen ids in your report back (see the last section); they are the permanent
targets the converter and Michael's buttons depend on.

Slot cue **names** are what show in Companion's dropdowns and presets, so keep them short
and stable: "Student name", "Student names (two lines)", "Torah reading 1" … "Torah reading
7", "Haftarah reading 1"–"3", "Guest name", "Remember Them 1"–"3". The validator caps a
name at 80 characters and rejects angle brackets and control characters
(`companion/src/catalog.ts:24` — read).

### The "This service" page

One console page. Verify in repo where console pages live (`app/` — the excerpt only
contained `app/api/`).

- **Pick the service type** at the top. That chooses which slot fields are shown. Nothing
  else on the page changes.
- **Plain text inputs**, one per slot. The two-line student name card gets a two-line field
  (a small textarea, or two single-line fields joined with a newline — your call, but the
  value stored must be exactly two lines). Each reading slot gets **two fields**: reader
  name, and portion / chapter:verse. They are joined into the two-line graphic text the
  same way the seed drafts are shaped (`Reader Name\nPortion · Chapter:Verse`) — note the
  separator in the seed is a middle dot `·` (U+00B7), keep it.
- **One Save.** Save publishes a new revision of every slot cue that changed **and** syncs
  the live catalog. Reuse the existing publish path plus `POST /api/live-catalog`
  (`app/api/live-catalog/route.ts` — read; it calls `syncLiveCatalog()` from
  `lib/sync-live-catalog.ts`, **verify in repo**, and requires the `author` role). One
  click, no confirmation dialog, no second page.
- After Save, the graphic is different immediately and the module gets a catalog event over
  the realtime socket, which is what makes the Stream Deck labels update (section 2).

**One thing to check before you design the Save button.** The normal authoring flow in
`docs/OPERATOR-QUICKSTART.md` (read) is: save → generate preview → review the 1920×1080
render → approve that exact saved version → publish. That is right for authoring liturgy.
It is wrong for typing a name on a Friday afternoon, and it breaks the "Publish is one
click" ruling. The slot layout is fixed and already approved; only short plain text
changes. **Verify in repo how the publish path enforces the review receipt** (`lib/` was
not in my excerpt) and make the slot save bypass the per-edit review gate — a standing
approval on the slot's layout, not a fresh approval per name. Replace the review with a
cheap length guard: if a line is long enough to overflow the layout, say so on the page
and let the person shorten it. If the publish code cannot be made to accept a
standing approval without a wider refactor, stop and report it rather than building a
weekly four-click ritual.

### Empty slots — decision

**An empty slot must never put last week's name on air, and must never put placeholder text
like "Reader Name" on air.**

- Save publishes **every** slot in the chosen service type, including the ones left blank.
  A blank slot publishes with empty text.
- **On screen:** an empty slot shows nothing. Verify in repo what the renderer does with
  empty cue text (`docs/RENDERER.md` was in the excerpt only as a 23-line stub; the
  renderer itself was not). If an empty string is refused somewhere in the publish or
  render path, the fallback is to mark the empty slot `hidden: true` in the catalog — the
  catalog type already carries an optional `hidden` boolean (`companion/src/catalog.ts:5`
  — read) — and report which route you had to take.
- **On the deck:** the button shows the slot's short name and nothing under it, dimmed.
  See section 5(d) for how.
- Pressing an empty slot still sends the command. Do not add a new refusal path that only
  bites mid-service; a graphic that draws nothing is a smaller surprise than a button that
  stops working.

### Placement in the console navigation

**"This service", one menu level, next to Live control.** Not nested, not behind Prepared
services, not behind Author. Michael has Administrator access, so there is no permission
work — but confirm the page is reachable by an Editor too, since an Editor is who prepares
"Names for this service" today.

### Acceptance checks

1. Sixteen slot cues exist, published, each with a UUID id, and all sixteen ids are written
   down in the report back.
2. `GET /api/catalog` lists all sixteen.
3. "This service" is reachable from the main navigation in one click from Live control, as
   Administrator and as Editor.
4. Choosing "B'nei mitzvah" shows exactly: student name, student names (two lines), Torah
   reading 1–7 (reader + portion each), Haftarah reading 1–3 (reader + portion each).
   Choosing "Funeral" shows Remember Them 1–3. Choosing "Shabbat" shows guest name.
5. Typing a student name and pressing Save once: the page reports success, the published
   revision of that slot cue carries the new text, and `POST /api/live-catalog` ran (or the
   publish path's own sync ran — whichever the repo actually uses).
6. Firing that slot cue from Live control puts the new name on screen.
7. Clearing a slot's field and saving: the graphic shows nothing when fired. It does not
   show the previous week's text and it does not show "Reader Name".
8. Adding a new service type is a data change, not a new page: show this by adding one
   throwaway type in a test and deleting it again.

### Files likely involved (verify in repo)

- `app/` — the console pages; the excerpt only contained `app/api/`, so the page location,
  the layout component and the navigation file are all unverified.
- `app/api/live-catalog/route.ts` (read) and `lib/sync-live-catalog.ts` (verify in repo).
- The publish path and the review-receipt check — `lib/` entirely (verify in repo).
- Wherever slot definitions should live: a new `lib/slots.ts` with the service-type → slot
  list table is the obvious home (verify there is no existing home for it).
- `docs/OPERATOR-QUICKSTART.md` (read) — add a "This service" section beside "Names for
  this service".

---

## 2. Module: slot text variables

### What to build and why

The point of the slot is that Michael never relabels a button. For that, the button label
has to come from the app. Companion does this with variables: a button whose text is
`Student\n$(Overlays:slot_student_name)` reads "Student / Noa" on the deck, and changes by
itself when the slot changes.

**Add one variable per slot: `slot_<key>`.** Keys are lower-case, stable, and never reused:

| Slot | Variable |
| --- | --- |
| Student name (one line) | `slot_student_name` |
| Student names (two lines) | `slot_student_names` |
| Torah reading 1–7 | `slot_torah_1` … `slot_torah_7` |
| Haftarah reading 1–3 | `slot_haftarah_1` … `slot_haftarah_3` |
| Guest name | `slot_guest_name` |
| Remember Them 1–3 | `slot_remember_1` … `slot_remember_3` |

**Value rule, applied in the module, not on the web side:** take the slot's current text,
take everything before the first newline, trim it, and if it is longer than 24 characters
cut it to 23 and append `…`. A Stream Deck key is small; 24 characters is already
generous. Empty slot → empty string.

The variable definitions are dynamic: they must be re-declared with
`setVariableDefinitions()` whenever the catalog changes, in the same place the module
already re-declares actions, feedbacks and presets (`companion/src/main.ts:155` — read).
Today the definitions are only declared once in `init()` (`main.ts:83-94` — read); that has
to move or be repeated.

### Where the text comes from

The module does not have the slot text today. Two things are true and worth knowing:

- `OverlaySnapshot.cuePayload` is already parsed off the realtime snapshot and then
  **discarded** — the module never reads it (`companion/src/client.ts:7` for the type,
  `client.ts:339` in `parseSnapshot` — read; the audit confirms nothing consumes it). That
  is the payload of the *currently requested* cue only, so it cannot fill sixteen slot
  variables. Do not try to make it.
- The catalog fetch is where the slot text belongs, because all sixteen slots are in the
  catalog and the catalog already gets pushed on every change.

**Specify the API change as an opt-in envelope, mirroring the existing one.**
`app/api/catalog/route.ts` (read) already does exactly this pattern for the liturgy index,
and its comment (the "D14" note, lines 5-9) is explicit that the **default response must
stay a bare `Cue[]`, header for header**, because `/output`, the console and Companion all
validate it field by field. So:

```
GET /api/catalog?include=slots
→ { version, cues, slots: [ { cueId, key, text }, … ] }
```

Same header `X-CRC-Catalog-Version`. Same `Cache-Control: no-store`. Default response
unchanged. If you need both indexes at once later, `?include=liturgy,slots` is the natural
extension — but only build `slots` now.

The alternative — putting `slot: {key, text}` directly on each catalog entry — is simpler
to consume but changes the default response shape that three clients validate. Do not do
that.

**Module side:**

- `OverlayClient.catalogWithVersion()` (`companion/src/client.ts` around line 84 — read)
  fetches `/api/catalog`. Change it to request `?include=slots` and accept **either** shape
  back: the envelope `{version, cues, slots}`, or a bare array from a deployment that does
  not have the change yet. A module that hard-fails against an older server is a bad
  afternoon in the booth.
- `companion/src/catalog.ts` (read): `CatalogCue` gains an optional `slot?: { key: string }`
  (and see section 5 for `category`). Validate the key the same way everything else in that
  file is validated — a bounded, boring pattern such as `^[a-z][a-z0-9_]{0,39}$` — and
  reject the whole catalog on a bad one, which is the file's existing discipline
  (`catalog.ts:18-31` — read; a failed validation keeps the previous catalog,
  `main.ts:153` and `main.ts:248-252` — read).
- Keep the slot text separate from `CatalogCue` if that is cleaner; the store just has to
  hand the module a `key → text` map.

**Rate limit, for the record:** Companion 5.0 caps module variable updates at 50 Hz. Slots
change a few times a week. This is not a constraint on anything here; it is noted so nobody
later designs around a limit that does not bite.

### Also: `requested_cue_id`

`requested_cue` is mislabelled. It is documented as "Requested cue" but it holds the cue's
**name**, the same string as `requested_name` (`companion/src/variables.ts:47-48` — read).
It has been that way since 1.3.0 and buttons depend on it.

**Do not change `requested_cue`.** Add a new variable **`requested_cue_id`** holding the
actual id (the UUID or `names:` id), empty string when nothing is requested. Document both
rows in the variable table, and say plainly in HELP.md that `requested_cue` is a name kept
for compatibility and `requested_cue_id` is the id.

### Acceptance checks

1. `GET /api/catalog` with no query string returns byte-identical output to before the
   change (a bare array, same headers). Add a test that asserts this.
2. `GET /api/catalog?include=slots` returns the envelope with one entry per slot cue, each
   carrying `cueId`, `key` and the slot's current text.
3. With the module connected, the Companion variables panel lists `slot_student_name` and
   the other fifteen, plus `requested_cue_id`.
4. A slot Save on "This service" changes the matching variable's value in Companion without
   anyone pressing "Refresh cue catalog" — the catalog event on the realtime socket is what
   triggers it (`main.ts:174-177` — read).
5. Long text is truncated: a 40-character name shows as 23 characters plus `…`.
6. Two-line slot text yields only the first line.
7. An empty slot yields an empty variable.
8. Pointed at a server that returns the old bare-array catalog, the module still starts,
   still works, and simply has empty slot variables. Test this.

### Files likely involved

- `app/api/catalog/route.ts` (read).
- `lib/` — whatever `catalog()` is (verify in repo); the slot text has to be readable there.
- `companion/src/client.ts` (read) — the catalog fetch and its parsing.
- `companion/src/catalog.ts` (read) — the type and the validator.
- `companion/src/variables.ts` (read) — `OverlayVariables`, `overlayVariables()`.
- `companion/src/main.ts` (read) — variable definitions, `#publishFeedback`.
- `companion/tests/catalog.test.ts`, `companion/tests/client.test.ts` (read).
- `companion/companion/HELP.md` (read).

---

## 3. Module: send commands even when the live socket is down

### What to build and why

Today, if the realtime WebSocket is down, `#command` returns early and **sends nothing**:

```ts
if (!this.#transportConnected) {
  this.updateStatus(InstanceStatus.ConnectionFailure, 'Realtime connection required before sending commands')
  this.#publishFeedback()
  return
}
```

(`companion/src/main.ts:210-214` — read.)

There is no queue and no retry after reconnect. Reconnect backoff runs
`[1s, 2s, 4s, 8s, 16s, 30s]` (`client.ts` — read), so a press during a reconnect is lost
silently apart from a status line nobody is looking at mid-service. Michael's Singular
buttons never had this gate.

The HTTP command path does not need the socket. `POST /api/command` is an ordinary
authenticated HTTP request (`app/api/command/route.ts` — read).

**Change: send the command anyway.**

- Remove the early return. Call `client.activate(...)` as normal.
- Set the status to a **warning**, not a failure: `InstanceStatus.UnknownWarning` with a
  sentence an operator can act on, e.g. *"Sent without the live connection. Confirmation
  will follow when it reconnects."*
- **Keep the feedback truthful.** Do not fake it. `rendered` depends on fresh renderer
  presence, which arrives over the socket; with the socket down it stays false and the
  button will not light red until the socket is back. That is correct and it is the whole
  point of the feedback. The `disconnected` feedback keeps painting after its existing
  3-second grace window (`DISCONNECTED_GRACE_MS`, `main.ts:11` — read).
- Existing safety stays: `#cueCommand` still refuses a cue that is not in the current
  catalog (`main.ts:257-263` — read); command id and sequence identity across retries stays
  as it is (`client.ts:97-101` — read).
- If the HTTP request itself fails, the existing catch already sets `ConnectionFailure`
  with a scrubbed message (`main.ts:220-223` — read). Leave that.

### Acceptance checks

1. New test in `companion/tests/` (the module-level harness in `companion/tests/harness.ts`
   and the style in `companion/tests/module.test.ts` — both read — are the right pattern):
   with the socket closed, calling the toggle action produces a `POST /api/command` in the
   recorded requests. Today that request does not exist; the test should fail before the
   change and pass after.
2. Same test asserts the status becomes a warning, not a connection failure, and that the
   message names the situation.
3. A second test asserts `rendered` stays false while the socket is down — i.e. we did not
   buy reliability by lying.
4. `npm test` in `companion/` is green.

### Files likely involved

- `companion/src/main.ts` (read) — `#command`, around lines 206-225.
- `companion/tests/module.test.ts` and `companion/tests/harness.ts` (read).
- `companion/companion/HELP.md` (read) — one line saying a press during a reconnect is now
  sent, and confirmation arrives when the connection returns.
- `docs/OPERATOR-QUICKSTART.md` (read) — the "During the service" advice changes slightly.

---

## 4. Module: default feedback styles

### What to build and why

Michael has operated for years with one rule in his hands: **red means it is up.** That red
came from Companion's own "which step am I on" feedback (`bank_current_step`, `#ff0000`),
which never knew anything about Singular — it only knew he had pressed the button. We now
have a feedback that actually knows. Keep his colour; make it true.

**Changes:**

- **`rendered` default style becomes red:** `bgcolor` **16711680** (`#ff0000`,
  `combineRgb(255, 0, 0)`), `color` white **16777215**. It is green `rgb(0,130,70)` today
  (`companion/src/main.ts:360` — read).
- **`requested` stays amber** `rgb(180, 110, 0)` on white (`main.ts:359` — read). No change.
- **`disconnected` stays** red `rgb(175, 0, 0)` (`main.ts:362` — read). No change.
- Green also appears as an explicit per-preset style override, not just as the default
  style. **Change the per-cue preset's `rendered` override to the same red**
  (`main.ts:373` — read).
- **Leave the two clear buttons alone.** `animate_out` and `clear_now` attach
  `rendered {cue: ''}` — meaning "the output is confirmed clear" — with a green override
  (`main.ts:377` and `main.ts:378` — read). Painting *those* red would contradict the rule
  we are teaching, because nothing is on screen. Keep them green and note the exception in
  HELP.md. If the owner would rather they were neutral grey, that is a one-line change; ask
  rather than guess.

**HELP.md wording.** Replace the feedback description with plain language:

> **Red means the graphic is actually on screen.** **Amber means requested, not yet
> confirmed** — the system accepted the press but no graphics browser has reported the
> picture settled yet. A red outline with no graphic means the connection to the graphics
> browser is down.

### Acceptance checks

1. In Companion, a cue button shows amber the instant it is pressed and red once the
   graphics browser confirms; it goes back to unlit when cleared.
2. The red is `#ff0000`, matching the red on his untouched Singular buttons side by side.
3. The Animate out and Clear now presets still show green when the output is confirmed
   clear.
4. HELP.md carries the new wording and no longer describes green as "rendered".

### Files likely involved

- `companion/src/main.ts` (read) — `#defineFeedbacks` (355-365) and `#definePresets`
  (366-388).
- `companion/companion/HELP.md` (read) — the "Feedback" section.
- `docs/OPERATOR-QUICKSTART.md` (read) — if it repeats the colours anywhere, keep them in
  step.

---

## 5. Module: presets

Four separate changes. Keep preset `type: 'simple'` throughout. **Do not adopt layered
presets now** — Companion 5 supports them, but they are a bigger surface and nothing here
needs them.

### (a) Category colour

Every generated preset today is the same charcoal `rgb(35, 35, 35)` (`main.ts:369` — read).
Michael's deck is legible because his colours mean something. Two hundred identical
charcoal presets would be unusable.

**Preset background comes from a `category` on the catalog entry:**

| Category | Hex | `combineRgb` | Text |
| --- | --- | --- | --- |
| core liturgy | `#006699` | `combineRgb(0, 102, 153)` | white |
| sung liturgy | `#990033` | `combineRgb(153, 0, 51)` | white |
| readings | `#012a3e` | `combineRgb(1, 42, 62)` | white |
| alternates | `#59011f` | `combineRgb(89, 1, 31)` | white |
| section markers / closings | `#000066` | `combineRgb(0, 0, 102)` | white |
| name / slot cards | `#ffff40` | `combineRgb(255, 255, 64)` | **black** (`combineRgb(0,0,0)`) |

**Where the category comes from — verify first.** `GET /api/catalog?include=liturgy`
already returns a liturgy index (`app/api/catalog/route.ts:15` — read), but
`lib/liturgy-index.ts` was **not** in my excerpt and I could not see what it contains.

- **Verify `lib/liturgy-index.ts`. If it already carries a section or category per cue, map
  from it** to the six categories above and do not add a new field.
- **Otherwise, add an optional `category` field to the catalog entry**, defaulted to core
  liturgy, and set it on slot cues to "name / slot cards". Validate it in
  `companion/src/catalog.ts` the same bounded way as `layout`
  (`^[a-z][a-z0-9_-]{0,39}$`, `catalog.ts:15` — read), and treat an unknown value as core
  liturgy rather than rejecting the catalog.

Either way the module must survive a catalog with no category at all — a preset that is
charcoal is a cosmetic miss; a module that refuses the catalog is an outage.

### (b) Per-cue presets

The existing shape is already right: one preset per **visible** cue, single step, firing
`toggle_cue`, with feedbacks in the order `requested` → `rendered` → `disconnected`
(`main.ts:368-376` — read). Keep it. The only change is the colours from (a) and the red
from section 4.

Note the naming trap for whoever reads this next: the preset **id** is `show_<cueId>`
(`cuePresetId`, `companion/src/catalog.ts:57` — read) but the **action** it fires is
`toggle_cue`. Leave the id alone — changing it gains nothing — but do not write new code
that infers the action from the id.

### (c) Missing presets

The audit found these gaps. **One correction to the brief I was given:** `clear_now`
**already exists** as a preset, with text "CLEAR\nNOW" and background `rgb(120, 0, 0)`,
which is exactly `#780000` (`main.ts:378` — read). Verify it in the repo, confirm the
colour, and leave it. Do not add a second one.

**Genuinely missing, add all three:**

- **`previous_panel`** — mirror the existing `next_panel` preset (`main.ts:380` — read),
  text "Previous\npanel", same charcoal, same `set: ''` default, `disconnected` feedback.
- **`refresh_catalog`** — text "Refresh\ncatalog", fires the existing `refresh_catalog`
  action, `disconnected` feedback. This is the button Michael needs when a publish did not
  reach him.
- **`set_page`** — fires `set_page` with an empty default page. Its action already
  validates and trims the page locally before sending (`main.ts:305-316` — read).

If `clear_now` turns out to be absent in the current repo after all, add it with
`#780000` / `combineRgb(120, 0, 0)` and the text "CLEAR NOW".

### (d) Slot presets

One preset per slot cue, in addition to (b). The difference is the text:

```
<short label>\n$(<connection label>:slot_<key>)
```

The first line is the slot's short human label — "Student", "Torah 1", "Guest",
"Remember 1". The second is the variable. `<connection label>` is the module's own
connection name, resolved at definition time from `this.label`, exactly as the two existing
variable presets do (`main.ts:383-385` — read). Since the presets are regenerated on every
catalog change (`main.ts:155` — read), a rename mostly fixes itself, but the existing code
comment at `main.ts:381-382` claims more than the audit could verify — do not rely on a
rename alone re-emitting them.

Background: the name/slot card colour `#ffff40` with **black** text.

**Empty slot → dimmed button.** Add a boolean feedback, `slot_empty`, with a cue option,
true when that slot's text is empty. Attach it to each slot preset with a dim override
(dark grey background, mid-grey text). That way Michael can see at a glance, before a
service, which slots have not been filled in. This is also the mechanism promised in
section 1.

### Acceptance checks

1. In the Companion presets panel, cues in different categories are visibly different
   colours, and the name/slot cards are yellow with black text.
2. A preset dropped on a button looks like it belongs on Michael's deck without editing.
3. Presets exist for Previous panel, Refresh catalog and Set page. Clear now exists exactly
   once.
4. A slot preset dropped on a button reads "Student" over the current student name, and the
   second line changes by itself within a few seconds of a Save on "This service".
5. With the slot empty, that button is dimmed and shows only "Student".
6. A catalog with no category field anywhere still loads and still produces presets.
7. All presets are still `type: 'simple'`.

### Files likely involved

- `companion/src/main.ts` (read) — `#definePresets`, `#defineFeedbacks`.
- `companion/src/catalog.ts` (read) — the optional `category`, the validator.
- `lib/liturgy-index.ts` (**verify in repo** — not in my excerpt).
- `app/api/catalog/route.ts` (read).
- `companion/tests/` (read) — the audit notes no test touches presets beyond their
  existence; a small test that every visible cue yields a preset and that categories map to
  the right colours would be new coverage worth having.
- `companion/companion/HELP.md` (read) — the preset list at the bottom says "Four presets
  come ready to drop onto a button"; that count is already stale and will be more so.

---

## 6. Companion module packaging

### What to build and why

- **Bump the module version to 1.6.0** in both places that carry it:
  `companion/package.json` (`"version": "1.5.0"` today — read) and
  `companion/companion/manifest.json` (`"version": "1.5.0"` — read). They must match; the
  module reads its own version from whichever it finds first
  (`companion/src/version.ts` — read) and reports it in the realtime hello frame, which is
  what `/health` shows.
- **The base stays 2.0.4.** `@companion-module/base` in `companion/package.json`
  dependencies, and `runtime.apiVersion` in `companion/companion/manifest.json` — read,
  both `2.0.4` today. Anything at or under 2.1.x is fine; **2.2.0 and above is silently
  rejected by Companion 5.0.3**. Do not bump it as part of this work.
- Runtime stays `node22`. Node engine stays `>=22.20`.
- **Build the `.tgz` the same way as today.** `companion/package.json` has
  `"package": "npm run build && companion-module-build"` (read). The brief says
  `scripts/build-tbi-companion-module.mjs` exists for TBI — **the CRC equivalent was not in
  my excerpt** (`scripts/` contained only `convert-companion-singular.mjs` and
  `prepare-workspace-companion.mjs`). Verify in repo which script or npm target actually
  produces the shipped archive, and use that one rather than inventing a new path.
- **The TBI copy gets the same module.** Same build, same version. Nothing in this work is
  CRC-specific at the module level except the default base URL, which is already a config
  field (`main.ts:127` — read). The scan card is per-congregation and already handled —
  TBI has none, and the actions refuse in plain language.

### Acceptance checks

1. `companion/package.json` and `companion/companion/manifest.json` both say `1.6.0`.
2. `@companion-module/base` is still `2.0.4` and `runtime.apiVersion` is still `2.0.4`.
3. `npm run lint` and `npm test` in `companion/` are green.
4. The build produces a `.tgz` by the repo's existing route, and the archive carries the
   version metadata the module reads at runtime (`version.ts` looks for `package.json` or
   `companion/manifest.json` beside or one level above the entry point — read).
5. Importing the `.tgz` into Companion 5.0.3 lists the connection as version 1.6.0.

### Files likely involved

- `companion/package.json`, `companion/companion/manifest.json` (read).
- `scripts/` — the build script (**verify in repo**).
- `companion/README.md` (not in excerpt beyond the audit's quotation — verify) — its
  "Current limits" paragraph will need a line about slots.

---

## 7. Converter re-run

### What to build and why

Michael's 908 Singular buttons get converted to CRC Overlays buttons by
`scripts/convert-companion-singular.mjs` (read — 705 lines). After the slots are published,
re-run it against his latest export so the generated buttons point at slot cue ids and
carry slot-variable labels.

**The command:**

```
node scripts/convert-companion-singular.mjs \
  --in <Michael's latest export> \
  --out <output .companionconfig> \
  --catalog work/companion-conversion/catalog-map-<date>.json \
  --report work/companion-conversion/ \
  --slots work/companion-conversion/slots.json
```

**`--slots` is not in the copy of the converter I read.** Its argument parser handles
`--in`, `--catalog`, `--out` and `--report` only (around lines 656-659 — read). The brief
says the converter was updated today; verify in the repo. If `--slots` is genuinely absent,
add it — it is a small addition to the same parser and one lookup in the button-emitting
path.

**`slots.json` maps Singular composition names to slot cue ids and label templates.** The
composition names, exactly as they appear in Michael's export:

| Singular composition | Slot |
| --- | --- |
| `Student Name` | student name (one line) |
| `Student Name 2` | student name (one line) — his second student button |
| `Two Line Student Names` | student names (two lines) |
| `Torah Reading 1` … `Torah Reading 7` | Torah reading 1–7 |
| `Haftarah Reading 1` … `Haftarah Reading 3` | Haftarah reading 1–3 |
| `Guest Name` | guest name |
| `Remember Them 1` … `Remember Them 3` | Remember Them 1–3 |

Shape it as composition name → `{ cueId, label }`, where `label` is the button text
template, e.g.:

```json
{
  "Student Name":  { "cueId": "…", "label": "Student\n$(Overlays:slot_student_name)" },
  "Torah Reading 1": { "cueId": "…", "label": "Torah 1\n$(Overlays:slot_torah_1)" }
}
```

`Overlays` there is the **connection name in Michael's Companion**. Confirm what the
converter actually names the connection it creates and use that string; a mismatch produces
buttons showing the literal `$(Overlays:slot_torah_1)` on the deck, which is the most
likely way this goes wrong.

**Two things to fold in while you are there:**

- **Drop `bank_current_step` from generated cue buttons.** The converter attaches it today
  with `{ color: 16777215, bgcolor: 16711680 }` (lines 174 and 183 — read) — Companion's
  own step-red. With truthful `requested`/`rendered` feedback from the module, that red is
  redundant and competes with the module's colours. Michael's habit survives because
  section 4 gives him the same red for a truer reason. The converter already looks for
  `bank_current_step` when sampling his existing style (line 469 — read), so it knows where
  they are.
- Leave his cameras, X32, vMix, OBS, Reaper, VLC, triggers, custom variables, surfaces and
  image library untouched — the converter copies them through unchanged, and that must stay
  true.

### Why the converter deliberately emits the old button format

Worth stating clearly in the code comment and the report, because it looks like a bug:

Companion still stamps every export `version: 12`, including Companion 5.0.3 exports. On
import, Companion runs its upgrade chain, and the `v12 → v13` step converts any control
with the **old flat shape** (`type: "button"` with a flat `style: {text, size, color,
bgcolor, …}`) into the new layered button. It dispatches on the control's `type`, so a file
that mixes our old-shape buttons with Michael's untouched new-shape buttons imports
cleanly, and the later steps are idempotent.

The converter emits `type: "button"` with a flat style (lines 193-194 — read). That is on
purpose, and there are two payoffs:

1. It is the shape the converter already knows, and the only button shape with any
   real-world documentation — Companion's export format has **no published JSON schema**,
   and the two types that matter most are `Record<string, any>` in Companion's own source.
2. **Buttons that arrive this way land with "Allow style changes" switched ON.** Companion
   sets `canModifyStyleInApis: true` on every button it upgrades from the old shape, for
   backwards compatibility — while buttons created natively in Companion 5, and buttons
   dropped from a module preset, get `false`. With that switch off, every external style
   path is a silent no-op: the HTTP API, OSC, TCP, Ember+, **and** Companion's own internal
   `button_text` / `bgcolor` actions. So the old format is not a shortcut; it is the shape
   that keeps Michael's buttons restylable later.

This is read from Companion 5.0.3's source, and it is an implementation detail of an
upgrade path, so **re-test it after any Companion upgrade.**

### Acceptance checks

1. The converter runs to completion against Michael's latest export and writes a report
   into `work/companion-conversion/`.
2. Every composition in the slots table maps to a slot cue id; the report lists zero
   unmapped slot compositions.
3. A converted student-name button has no `bank_current_step` feedback, has the module's
   `requested`/`rendered`/`disconnected` feedbacks, and carries the label template with the
   right connection name.
4. Unmapped buttons (mostly High Holy Days, Seder, honouree cards) still point at Singular
   and are not marked dead. The three Singular connections stay in the file, enabled.
5. Cameras, X32, vMix, OBS, Reaper, VLC, triggers, custom variables, surfaces and image
   library come through byte for byte — diff them.
6. The output file still declares `version: 12` and still contains old-shape buttons for
   everything the converter generated.

### Files likely involved

- `scripts/convert-companion-singular.mjs` (read).
- `work/companion-conversion/` — output only; nothing to read.
- Michael's latest export (the excerpt carried `repo/michael-companion5-export.json`; use
  whatever is current).
- `scripts/prepare-workspace-companion.mjs` (present, not read) — check whether it needs the
  same slot awareness.

---

## 8. Verify on Michael's machine

This is a short checklist to hand back to the owner. It is four checks and it needs
Michael's computer; none of it can be done from the repo.

1. **The module is listed.** Open Companion 5.0.3 → Connections. The CRC Overlays
   connection appears and shows version **1.6.0**. (If it does not appear at all, the
   module API version is the first suspect.)
2. **"Allow style changes" is on.** After importing the converted file, open any converted
   button → options → confirm **Allow style changes** is switched on. Expected yes, because
   the buttons came in as old-shape controls. If it is off, the converter emitted the new
   shape and section 7 needs revisiting.
3. **The colours are true.** Press one converted cue button. It should go **amber**
   immediately and **red** a moment later once the graphics browser confirms the picture.
   Press again: it animates out and the red goes away. Amber that never becomes red means
   the renderer is not reporting — that is the feedback doing its job, not a bug.
4. **A slot edit reaches the deck.** On the web console, open "This service", change the
   student name, press Save once. The Stream Deck button's second line changes within a few
   seconds, with nobody touching Companion.

---

## Out of scope / ruled out

Do not build these. Each was considered and ruled out on 2026-09-22.

- **No second output layer.** Single output was ruled on 2026-09-22. Michael's
  "Starting Soon" lower-third-plus-side-panel buttons convert to the lower third alone; the
  side panel is dropped. The CRC logo under-layer becomes the scan card, as already ruled.
- **No next/previous-through-a-service.** No service cursor, no "what's next" navigation.
  Michael keeps his own pages, which are laid out in service order already. The existing
  `next_panel` / `previous_panel` actions stay exactly as they are — they step **within one
  multipart graphic**, which is a different thing and is not being extended.
- **No thumbnails or images on buttons.** At Stream Deck size a lower-third render is a
  coloured bar; text is what he reads.
- **No Satellite mirroring** of his Stream Deck into the web console. He is in the booth
  with the decks in front of him.
- **No publication to the Bitfocus module store.** The module ships as a `.tgz` we install.
- **No staging or rehearsal workspace.** One live system.
- **No layered presets**, and no `setCompositeElementDefinitions`. Companion 5 supports
  both; nothing here needs them.
- **No `advanced` feedbacks.** Companion's own source discourages them and says they will
  likely be removed.

---

## Return to Cowork

When the work is done, report back with:

1. **Files changed** — the actual list, with a one-line note on anything that turned out
   differently from this document.
2. **Module version** shipped, and confirmation that `@companion-module/base` and
   `runtime.apiVersion` are still 2.0.4.
3. **The sixteen slot cue ids**, as a table of slot name → UUID → variable key. These are
   permanent and everything downstream depends on them, so write them out in full rather
   than pointing at a file.
4. **The API shape you actually built** for slot text — the `?include=slots` envelope as
   specified, or something else, and why.
5. **What you could not verify**, explicitly. In particular:
   - what `lib/liturgy-index.ts` contains, and whether the category came from it or from a
     new field;
   - whether the publish path let a slot Save be one click, or whether the review receipt
     forced a compromise;
   - what the renderer does with empty slot text;
   - whether `--slots` already existed in the converter;
   - which script actually builds the `.tgz`.
6. **Anything you had to decide** that this document left open, and which way you went.

Then the owner runs the four checks in section 8 with Michael.
