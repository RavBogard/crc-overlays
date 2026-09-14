# Handoff for Code — Overlays layout and navigation pass (2026-09-14)

Worktree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion`. Preserve tracked modifications and untracked files. Do not reset or clean. Applies to both workspaces (CRC and TBI).

This is the second handoff from the 2026-09-14 UX review. Handoff #1 (`HANDOFF-CODE-2026-09-14-copy-pass.md`) is copy, CSS and one bug fix and should land first; this one changes structure. Rulings from the owner on 2026-09-14 are baked in: the operator surface is a laptop in the booth (mobile is very secondary — no separate phone design work); Health becomes a status dot plus an admin-only System page; Publish is one click; Prepared services is demoted, not rebuilt. Standing test for everything below: faster and better, never slower or more bureaucratic. Add no confirmations, modes, gates or steps.

Suggested order: A (header + nav + roles) → B (Live control) → C (editor) → D (System page and demotions). Each is independently shippable.

## A. One header bar, role-filtered navigation

Today every page stacks: small-caps org name → brand → large h1 → optional subtitle → user chip row → nine equal-weight nav pills. That is ~170px before the pills and ~440px on Live control before the first graphic is reachable (with the disconnect banner and strip, both already reduced in handoff #1).

Replace with a single ~56px bar:

- Left: `CRC Overlays` wordmark (TBI: its own name). The org name moves to the document `<title>` only.
- Nav, as text with a 2px brand-green underline on the active item (not pills), in task order: **Live · Library · System**. Help is a `?` icon at the right end of the nav.
- Right: the status dot (see D1) and an avatar/initial button whose menu holds: name and role, Account, Sign out.
- Delete the per-page h1 and subtitle on Live, Library and System; the active nav item is the title. Pages that can be arrived at cold by URL (Account, Setup, Help) may keep a small h1.

Role filtering:

| Role | Nav items | Also reachable |
|---|---|---|
| Operator | Live · `?` | avatar menu: Account (password, Google), Sign out |
| Editor | Live · Library · `?` | avatar menu as above; Prepared services under Library (see D4) |
| Administrator | Live · Library · System · `?` | avatar menu as above |

Rename the right-hand column heading on Live control from "Library" to **Graphics** so the word Library means only the authoring area.

Acceptance: Michael (Administrator today) still sees all three items; an account set to Operator sees only Live. Nothing that was reachable becomes unreachable for its role — it moves, it does not disappear.

## B. Live control, rebuilt for a booth laptop

Two columns at every width ≥ 1000px. Below that, the on-air panel stacks above the list; no further phone work.

**Left column (~60%) — the graphics list.** Starts at the top of the content area, directly under the bar. Search field first, autofocused on page load, existing behaviour (instant filter; name, spelling variant, Hebrew, opening words). Then the rows. No nested inner scroll region — the page scrolls. Rows are ~44px:

- small thumbnail of the graphic's rendered artwork (left)
- title, and under it in small text the graphic's **opening words** (first line of the on-screen text) instead of the layout name — this is what distinguishes "Mourners Kaddish 1" from "Mourners Kaddish 2"; the layout (Lower third / Left panel / Right panel) becomes a tiny right-aligned tag or glyph
- one button: **Show**, green. The per-row Preview button is removed; clicking or arrowing onto a row previews it (Enter already does).
- the row that is currently on air stays visibly lit.

The **scan card** becomes the pinned first row of the list: title "Scan card", its `Page` field inline in the row, and a Show/Hide toggle in place of Show. Its separate block, heading and the note "Clear now also removes the scan card" are removed (the note becomes a tooltip on Clear).

Keep the existing default order for now (Prepared services is demoted, not wired into Live — see D4).

**Right column (~40%) — one sticky "On air" panel.** Replaces both today's empty PREVIEW box and the LIVE NOW box. It shows, in one 16:9 frame:

- when nothing is selected: the graphic that is on air, with its title and the small DISCONNECTED chip when applicable; if nothing is on air, a short "Nothing on air" line — not a 500×270 void
- when a row is selected: the selected graphic's render badged PREVIEW, with a green **Show** under it (this is the same action as the row's Show, same label), and a one-line "On air: <title>" beneath so the operator never loses track of what the congregation is seeing

Directly under the frame, always visible: **Animate out** (primary) and **Clear** (red, secondary). These are the only two out actions and they never scroll away.

Delete: the collapsed "Connect vMix, OBS, or Companion" details block (already in handoff #1), the footer, the "↑ ↓ move · Enter previews" hint after first use (or keep as a tooltip on the search field).

Acceptance: at 1280×800 with the output disconnected, the search field and at least eight graphic rows are visible without scrolling, and Animate out / Clear are visible at every scroll position. Button count on the page with 24 graphics is 24 Show + Animate out + Clear + scan-card toggle. No element says "disconnected" more than once.

## C. Editor

C1. **Three cards, same treatment.** `1 · Text` (siddur search and passages), `2 · Name` (library name, on-screen title, Hebrew accent), `3 · Look` (layout, density, alignment, spacing, artwork). All three numbered, all collapsible with a real chevron; the collapsed Look card keeps its useful one-line summary ("Lower third · Comfortable · Template alignment · No artwork") but loses the unlabelled green dot as its only affordance. Look opens expanded by default when a graphic is opened.

C2. **One source filter.** The BOOK (13 options) and SERVICE (14 near-identical options) dropdowns become one `Source` select (or a single combobox that searches both). Search filters as you type; the separate Search button goes if it is not needed for a server round-trip.

C3. **"Slide", not "Panel".** `Panel 1 / Panel 2 / + Add panel / Remove panel 1` → `Slide 1 / Slide 2 / + Add slide / Remove slide` so "panel" means only the layout (Left panel / Right panel). `Make slides from whole prayer` (renamed "Add all as slides" in handoff #1) is now consistent with that.

C4. **Toolbar → overflow.** Duplicate and Archive already exist as hover actions on the left-rail cards; History and Local wording are rare. Toolbar keeps undo / redo; Duplicate, Local wording…, History, Archive move into a single `⋯` menu.

C5. **One-click Publish (ruled).** The footer has one primary button, **Publish**, enabled when there is a saved version newer than the published one. The preview frame always shows the exact saved render (what "Review saved version" used to reveal), so the check happens by default. Remove: the "✨ Review saved version" state, the "✓ Publish this version" relabel, the "Reviewing exact saved version N. Nothing has been published yet." toast, and the "Working preview / Exact saved preview" labels. `Save draft` stays as the secondary. After Publish, the header pill reads PUBLISHED with the version number and a 3-second toast says "Published version N."

C6. **Text layers and arrangement (requested and ruled 2026-09-14).** Today one toggle, "Hebrew + transliteration", collapses two decisions — which layers are present and how they are arranged. Replace it with two controls in the `1 · Text` card, directly above the passage list:

- **Layer chips**, three toggles in this order: **Hebrew · Transliteration · Translation**. Any combination; at least one stays on (the last lit chip does not toggle off — no error, it simply stays). Translation comes from the shireishabbat feed, which carries English for every passage in every siddur, so no "unavailable" state is needed. Default for new graphics: Hebrew + Transliteration (today's behaviour). Saved per graphic.
- **Arrangement switch**, two values, shown only when two or more layers are on: **Together** — each passage renders its Hebrew line, then its transliteration, then its translation, grouped (today's behaviour); **In blocks** — all the slide's Hebrew, then all its transliteration, then all its translation (the earlier Singular style). Block scope is **within a slide**: each slide shows its own blocks; a block never spans slides. Layer order within either arrangement is fixed as Hebrew → Transliteration → Translation. Default: Together.

The preview frame re-renders live on every change. The existing fit check must surface in the Text card as well as under the preview when all three layers overflow a lower third, since that will now be common; keep it as the same one-line status, not a modal. Existing graphics migrate as: toggle on → Hebrew + Transliteration, Together; toggle off → Hebrew only. Companion presets and the output renderer are unaffected beyond rendering the additional layer.

Acceptance: opening a graphic shows three numbered cards and one dropdown under Text; the Text card offers exactly three layer chips and, when two or more are lit, a Together / In blocks switch, and the preview reflects each change without a save; a slide with all three layers in blocks shows three blocks, and the next slide starts its own blocks; publishing an edit is one click from a saved draft; at no point do PUBLISHED and "nothing has been published" appear on the same screen.

## D. System page, status dot, and demotions

D1. **Status dot** in the header bar for every role: green when a graphics output has acknowledged within the last 30 seconds, amber otherwise (grey while unknown). Its popover: one line of state ("Output connected · Companion connected" or "No output seen in the last 30 seconds"), **Check now**, a link to Setup, the fallback link, and — replacing the Service log form — a single text box **Something's wrong?** with a Send button that records the note with timestamp, on-air graphic and connection state attached automatically. That is the whole operator-facing Health and Service log.

D2. **System page** (Administrator only, nav item), four tabs:

- **Status** — today's Health cards (Live playback, Graphics output, Companion control, Library synchronization, Authoring database) with the copy fixes from handoff #1; raw IDs and hashes behind a `Details` disclosure per card. The provider usage/budget section stays here at the bottom under an ADMIN badge (the one eyebrow that survives), with the shortened copy from handoff #1.
- **People** — moved out of Account: Invite someone, People with access, Paired devices, Copy output URL. Account (avatar menu) keeps only password and Google sign-in.
- **Setup** — the current Setup page after handoff #1's cuts (two steps + inline check). Also reachable from the status-dot popover for any role, so an Editor can still connect a new booth computer without System access — keep the route public to Editor+ even though the nav item is admin-only.
- **Log** — the list of Service log entries (which today has no on-screen list at all) with Export CSV. The entry form itself is gone from here; entries come from the status-dot box.

D3. **Source review** leaves the top nav. It becomes a filter in the Library left rail beside Published / Drafts / Archived — **Source changes (N)** — shown only when N > 0, opening the existing side-by-side diff in the editor's centre column. The "Check sources" action moves into the rail's `⋯` menu. The "20 unopened baseline graphics…" banner (reworded in handoff #1) shows once, inside that filter view, not on every visit.

D4. **Prepared services** (ruled: demote, don't rebuild). Leaves the top nav; becomes an entry **Prepared services** in the Library left rail below the filters (Editor+ only). The page itself is unchanged except: delete the Global graphic finder card (it duplicates Live control search; its "Add graphic / Add as alternates / Add as multipart" bar moves into the collection view where a collection is open), and apply the copy fixes from handoff #1. No service-order chip on Live control. Do not invest further here.

Acceptance: an Operator's whole app is Live, the status dot, and `?`. An Administrator reaches every readout that exists today, one level down. No route returns 404 for a role that could use it before.

## Explicitly not in scope

Anything on the owner's do-not-build list: Bitfocus module-store publication; human-facing rehearsal mode or staging workspace; timed auto-out; test card; setlist-keyed deploy freeze; nightly production check. Also: no phone-specific layout work; no changes to the Companion module's preset names; no rebuild of Prepared services into a service-order feature.
