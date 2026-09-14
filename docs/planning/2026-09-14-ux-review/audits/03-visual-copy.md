# Visual, layout and copy audit — CRC Overlays

Working only from the captures in `/scratchpad/capture/`. The owner's read ("bloated, overly complicated") is correct and the cause is measurable: on every page, chrome and reassurance occupy the space where the work should be. The app is not missing anything. It is saying everything twice and giving every noun a card.

---

## 1. Header and chrome

On Live control at 1440×900 the stack before the first usable control is: small-caps `CENTRAL REFORM CONGREGATION` → green `CRC Overlays` → h1 `Live control` → user chip `Daniel · Administrator (Sign out)` → a row of 9 nav pills → the amber banner (four sentences, three CTAs) → the red status strip repeating the same message. The capture puts the header block alone at ~170px; adding the pill row (~44px), the banner (~160px) and the strip (~70px) gives roughly **440px of a 900px fold — about half the screen — consumed before the operator can touch a graphic.** Total page height is 1934px, so the library list the operator actually uses starts around the fold line and then scrolls inside its own nested region.

Four things in that stack are redundant. The org name and the brand name say the same thing to an audience of four people who know where they are. The h1 restates the active nav pill. The subtitle restates the h1. And on Live control there is a third identity marker, the top-right `CRC TRIAL OUTPUT` pill, plus a footer that says "Trial" again.

**Proposed header: one 56px bar.** Left: `CRC Overlays` wordmark only (the org name becomes a tooltip/`<title>`, nothing more). Centre or left-adjacent: the nav, reduced from 9 pills to 5 — **Live control · Library · Services · Health · Setup** — with Service log folded into Services, Source review folded into Library, Help into a `?` icon at the right end, and Account into the user chip itself. Right: the user chip collapses to an avatar/initial button; name, role, Sign out and Account all live in its menu. The active tab reads as the only item with full-contrast text plus a 2px underline in the brand green — today the active pill is "only slightly lighter," which is not a state, it is a rounding error. Drop the h1 entirely on Live control and Library (the tab is the title); keep an h1 only on pages you can arrive at cold with a shareable URL. Nav order should be task order: Live control first.

**Source review collision.** A second "Library" link and a `Check sources` button render on top of the nav pills, overlapping "Account". This is a page-level action bar being laid out in the header's row. Fix by giving every page one action strip *below* the header, right-aligned, never in the header grid — and on Source review that strip needs only `Check sources`, since Library is already a nav tab.

Also: "Library" is simultaneously a nav destination (/author) and the h2 of the right-hand column on Live control. Rename the Live control column **Graphics** and the collision disappears.

---

## 2. Live control

The operator's job is: find a graphic, put it up, take it down. Today, at 1440, that job is third in the visual order behind two disconnect warnings and an empty 500×270 rectangle.

**Wide (1440+): two columns, graphics first.**

- Kill the amber banner as a banner. Connection state is one thing, said once, in one place: a **status chip in the page action strip** — `● Output disconnected` in amber with a `Fix` link to /setup#3. The red strip and the amber banner are the same fact; keep the strip, delete the banner.
- **Left column (~60%) is the graphics list**, at the top of the page, no nested scroll — let the page scroll. 24 rows fit in roughly two screens and the operator uses search, not scrolling, to get there ("kaddish" → 4 rows, instantly).
- **Right column (~40%) is a single sticky "On air" panel**: the live graphic's artwork, its title, and directly under it the two out actions — `Animate out` and `Clear now`. When nothing is live, this panel is a short line ("Nothing on air"), not a 500×270 void. The preview renders *into this same panel*, clearly badged, so one region answers "what's on screen / what am I about to put on screen." Two big 16:9 boxes stacked (empty Preview + Live now) is the single largest waste of the fold.

**Laptop (1100–1280):** same two columns but the On-air panel drops to ~340px and the preview inside it shrinks; if width < 1000 the panel moves *above* the list as a 120px-tall strip (thumbnail + title + the two out buttons inline), so the library is never pushed below the fold — which is exactly what happens today at 600px.

**Rows and buttons.** 24 rows × 2 buttons = 48 buttons is wrong twice over: it is visual noise, and it makes `Show` (irreversible, goes to air) look identical in weight to `Preview` (harmless). Proposal: **one button per row — `Show` — plus row-click/Enter = preview.** The row is already keyboard-previewable ("↑ ↓ move · Enter previews"); make click do the same. Then `Show` under the preview stays as the confirming action, and there is no duplicate: the row's `Show` is the fast path for the operator who knows the graphic, the panel's `Show` is the path for the operator who looked first. Both are `Show`, same green, same word. Add a **32×18 thumbnail per row** — for prayer graphics the artwork is the fastest recognition cue and it costs nothing in height if rows are 40px. Keep the layout subtitle (Lower third / Left panel / Right panel) as a small right-aligned tag, not a second line.

**Scan card** does not belong between the global out controls and the search box. It is a special graphic; put it as a pinned first row in the list (`Scan card` + a page number field inline). Its footnote "Clear now also removes the scan card" becomes a tooltip on Clear now.

The collapsed `Connect vMix, OBS, or Companion` details block at the bottom duplicates Setup step 3 verbatim. Delete it; the disconnect chip's `Fix` link already goes there.

---

## 3. Editor

The editor has three numbered-ish cards, but the third is unnumbered, collapsed, and its only affordance is a tiny green dot on the line `Look · Lower third · Comfortable · Template alignment · No artwork`. That line is a summary pretending to be a header. Meanwhile there are three nested scroll regions, a sticky preview column, a sticky footer, and a toast that sits on top of the Look card until dismissed.

**Proposal.** Keep two columns: work on the left, preview on the right. Make the left column **three consistently-treated sections, all numbered, all collapsible, with a real chevron and a real label**: `1 · Text` (siddur search + passages), `2 · Name` (library name, on-screen title, Hebrew accent), `3 · Look` (layout, density, alignment, spacing, artwork). Section 3 collapsed shows the same summary string it shows now — that summary is good, it just needs a number, a chevron and the same card chrome as 1 and 2.

- **Merge BOOK and SERVICE into one dropdown.** Two 13/14-option lists that are "nearly identical" is a filter that filters nothing; make it one `Source` select, or a single combobox that searches both.
- **Fix the "panel" collision.** `Panel 1 / Panel 2` tabs mean slides; `Left panel / Right panel` means layout. Rename the tabs **`Slide 1 / Slide 2 / + Add slide`** — which also makes `Make slides from whole prayer` finally consistent with something.
- **Sticky footer:** keep, but reduce to one line — save state on the left, one primary button on the right. Delete "Published output has not changed" from it.
- **Toast:** never persistent, never over content. Auto-dismiss in 3s, bottom-left, and only for things that actually happened (saved, published). "Opened 'Barechu'" is not an event worth a toast; the h1 already says it.
- **Publish:** `Review saved version` → `Publish this version` is a two-step flow whose first step is labelled like a read-only action and whose toast contradicts the `PUBLISHED` pill on the same screen. Make it one button, `Publish`, opening a small confirm sheet showing the exact saved render. Drop the sparkle.

---

## 4. Copy audit

**Count of "this is not live" reassurance.** On Live control, **4** distinct instances: the eyebrow `PREVIEW · NOT LIVE`; "Nothing is sent to the output."; "Preview only · the output does not change until you press Show"; and, in the amber banner, "Show still works and the graphic appears as soon as the browser is back."

In the editor (including the library gate and empty state), **10**: "Sign in to create and prepare graphics without changing what is live."; "Prepare a graphic without touching live output."; "The published version stays available while you work."; the eyebrow `ISOLATED PREVIEW`; the frame badge `PREVIEW ONLY`; "This preview cannot issue live commands."; "A graphic already on screen remains unchanged."; "Published output has not changed." (footer); "Published output is unchanged." (toast); "Nothing has been published yet." (publish toast).

Across the whole app the same promise is made **~19 times**, including "they never control the live output" and "Nothing is published by importing" (/services), "Nothing here changes a live graphic." (/sources-review), "Health checks never put a graphic on air." (/health), "Nothing on this page puts a graphic on air." (/setup). Repeated reassurance stops reassuring and starts implying the opposite. **Rule: one badge per surface, no sentences.** A `PREVIEW` badge on the preview frame and a `DRAFT`/`PUBLISHED` pill in the editor header carry all of it; every sentence above can be deleted.

### The 15 worst sentences

| # | Verbatim | Rewrite |
|---|---|---|
| 1 | "No graphics browser is connected. Usually OBS or vMix is not open, or the Overlays browser input is missing, disabled, or still loading. Open OBS or vMix and turn the browser input on; this notice clears by itself once it connects. Show still works and the graphic appears as soon as the browser is back. Only if a service is starting right now and this cannot be fixed: fallback steps." | **"Output disconnected — open OBS or vMix with the Overlays browser input on. [Fix] [Fallback]"** |
| 2 | "Select Preview beside a graphic to see its complete artwork here. Nothing is sent to the output." | **"Select a graphic to preview it."** |
| 3 | "Preview only · the output does not change until you press Show" | Delete (the `PREVIEW` badge says it). |
| 4 | "This preview cannot issue live commands. A graphic already on screen remains unchanged." | Delete. |
| 5 | "The published version stays available while you work." | Delete (the `PUBLISHED` pill says it). |
| 6 | "Opened "Barechu". Published output is unchanged." | Delete the toast. |
| 7 | "Reviewing exact saved version 1. Nothing has been published yet." | **"Publish version 1?"** on the confirm sheet. |
| 8 | "Plan the prepared parts and keep every graphic within reach. Collections are optional preparation aids; they never control the live output." | **"Group graphics for a service, ahead of time."** |
| 9 | "The starter includes published graphics and groups only complete numbered sets. Add source material to coverage only when your congregation actually uses it. This does not claim the service is complete." | **"Starts with your published graphics. Add more as you need them."** |
| 10 | "Nothing is published by importing. This builds a prepared service you can review." | **"Import a planned service from centralreform.live."** |
| 11 | "20 unopened baseline graphics predate retained source snapshots and cannot be compared exactly until opened or republished." | **"20 older graphics have no saved source text. Open one to compare it."** |
| 12 | "Both congregations combined: target under $25/month; review before $50/month. Monthly total unavailable · 0/3 providers reported in USD. The entered-report sum is compared with the monthly plan only when all providers use the same window and were measured within 45 days." | **"Hosting cost: not reported. Target under $25/month. [Report usage]"** |
| 13 | "Playback and authoring answered, but no graphics output is connected in the current freshness window." | **"No graphics output has been seen in the last 30 seconds."** |
| 14 | "Allow about 10 minutes. You will add one Companion connection and one new browser input. Nothing on this page puts a graphic on air. You need Overlays. You need centralreform.live only if you import a planned service. The web siddur needs nothing from you." | **"About 10 minutes: one Companion connection and one browser input."** |
| 15 | "Search to find a graphic. The full published list is on Live control." | **"Search all 24 published graphics."** |

### Engineering vocabulary leaking into the UI

All of the following should not be visible to an operator or an editor: **"freshness window"** (→ "in the last 30 seconds"); **"Revision 1789055589994"** (→ drop, or show a timestamp); **"Live fe0996f32ae9a128 · Authoring fe0996f32ae9a128"** (→ "Live and authoring match"); **"retained source snapshots"** (→ "saved source text"); **"baseline graphics"** (→ "older graphics"); **"Realtime closed ("** (→ move the whole Companion log instruction into Help); **"relay"** (→ "playback"); **"Device token"** (→ "pairing code"). Keep the hashes and revision IDs behind a `Details` disclosure on Health for the one person who ever needs them — that is Daniel, once a year.

---

## 5. Labels and buttons

The verbs are inconsistent in three ways: same action two names, same name two actions, and nouns used as buttons.

| Today | Final |
|---|---|
| Show / Show this graphic | **Show** (both places) |
| Preview (row button) | row click / Enter — no button |
| Animate out / Clear now | **Animate out** / **Clear** |
| Review saved version → Publish this version | **Publish** (one button + confirm) |
| Save draft | **Save** |
| Local wording | **Local wording…** (keep — it is a real, specific concept; make it a menu item, not a toolbar pill) |
| Make slides from whole prayer | **Add all as slides** |
| Select all passages | **Select all** |
| Add as alternates / Add as multipart | **Add as alternates** / **Add as a set** |
| Start from current library / Create empty | **Start from library** / **Start empty** |
| Record feedback | **Save entry** |
| Check now / Check sources / Check graphics connection | **Check now** everywhere |

---

## 6. Visual system

**Pills everywhere is the core problem.** Nav items, status, counts, roles, layout names, filters and buttons all render as the same rounded chip, so nothing tells you which ones do something. Split into three shapes and hold the line: **buttons are rectangles with 6px radius** (actions), **pills are pills only for state** (`PUBLISHED`, `DISCONNECTED`, counts), **nav is text with an underline**. That one rule removes most of the "bloated" feeling without deleting a single feature.

**Card-in-card.** The editor has cards inside cards inside a scroll region inside a page; Prepared services has a card whose body is two more cards. Allow **one level of card.** Inside a card, group with a hairline rule and a bold label, not a nested surface. Kill the nested scroll regions everywhere — let the page scroll; only the preview panel is sticky.

**Colour semantics are actually good** and should be stated as a rule and then enforced: green = goes to air (Show, Publish), red = removes/destroys (Clear, Remove panel), amber = needs attention (disconnected, health), lavender = the live graphic's title. The one violation is that `Preview` and `Show` currently sit side by side at equal weight — Show must be the only green thing in a row. Also make sure red is reserved: `Remove panel 1` and `Clear` should not be the same red intensity, since one is undoable and one hits the broadcast.

**Small-caps eyebrows — drop most of them.** `ALWAYS AVAILABLE`, `OPTIONAL PREPARATION`, `BETA LEARNING`, `ISOLATED PREVIEW`, `SYSTEM CHECK`, `ADMINISTRATOR VIEW`, `READY WHEN YOU ARE`. These are editorial commentary on the card below, not labels, and they add a line of height plus a tone of apology to every card. **Keep exactly two**, as functional badges rather than eyebrows: `PREVIEW` (on the preview frame) and `ADMIN` (on the provider-usage card, because it genuinely marks a different audience). Delete the rest — the card's own heading already names it.

---

## The 10 highest-impact changes, ranked

| # | Change | What changes on screen | Size |
|---|---|---|---|
| 1 | Collapse header to one 56px bar; 9 nav pills → 5; user chip → avatar menu; drop org name, h1 and subtitles | ~300px of every page returns to content; the library is above the fold | M |
| 2 | Live control: graphics list left and on top; one sticky "On air" panel right that also hosts the preview | The empty 500×270 box and the second 16:9 box become one panel; operator sees graphics first | L |
| 3 | Amber banner + red strip → a single amber status chip with `Fix` | Four sentences and three CTAs become one line | S |
| 4 | One button per row (`Show`), row-click previews, add row thumbnails | 48 buttons → 24; rows become scannable by artwork | M |
| 5 | Delete all 19 "not live / nothing is sent" sentences; keep a `PREVIEW` badge and a `PUBLISHED` pill | Every page loses 1–3 lines of apology | S |
| 6 | Editor: three consistently numbered, collapsible cards; merge BOOK+SERVICE; `Panel` tabs → `Slide` | The unlabelled dot-line becomes `3 · Look`; one dropdown instead of two | M |
| 7 | `Review saved version` → one `Publish` with a confirm sheet; kill the persistent toast | Footer has one clear primary; content is no longer covered | M |
| 8 | Enforce pill-vs-button-vs-nav shapes; one level of card; no nested scrollbars | The "everything is a chip" haze lifts; page scrolls as one | M |
| 9 | Fix the Source review header collision — page actions in their own strip below the header | "Account" stops being overlapped by "Library" | S |
| 10 | Replace the eight engineering strings (freshness window, revision IDs, hashes, relay, device token) with plain equivalents; hide raw IDs behind `Details` | Health reads as a status page, not a log | S |

Items 3, 5, 9 and 10 are copy-and-CSS only and deliver a disproportionate share of the "less bloated" feeling — do them first, in one pass, before anyone refactors a layout.
