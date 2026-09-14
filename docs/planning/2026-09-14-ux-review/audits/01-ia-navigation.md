# CRC Overlays — IA, navigation, findability

## 1. What the nine destinations actually are

| Nav pill | Route | What's really in it | Who needs it |
|---|---|---|---|
| Library | /author | Authoring: pick passages from the siddur, name, set layout/density/alignment/artwork, preview, publish. Also duplicate / archive / history / local wording. | Editor |
| Live control | / | The operator's entire job: find a graphic, preview, Show, Animate out, Clear now, scan card. | Operator |
| Prepared services | /services | A global search over all published graphics, plus optional "collections," plus import from centralreform.live. | Editor |
| Service log | /services/log | A one-way feedback form (issue / fallback / observation) with CSV export. No list of what was recorded. | Admin |
| Source review | /sources-review | Inbox of upstream siddur wording changes; currently empty with a 20-item "can't compare" banner. | Editor |
| Health | /health | Five system checks, plus a cloud-provider spend panel. | Admin |
| Setup | /setup | One-time, per-computer wizard: Companion, browser input, connection check, rehearsal. | Admin/Editor, once |
| Help | /help | Ten procedure cards — and the only place several real features are described. | Everyone |
| Account | /access | Personal settings (password, Google) **and** workspace administration (invites, roles, people, paired devices). | Mixed |

Three of nine pills (Service log, Source review, Health) are things Michael should never see. Two more (Setup, Help) are read-once. The operator's one destination is second in the order, behind the editor's.

**Same thing in two places.** "Show" exists as a row button and again as the big green CTA under the preview. The published-graphic list exists on Live control and again as the "Global graphic finder" on Prepared services — which then tells you "the full published list is on Live control." The vMix/OBS/Companion connection instructions live in the collapsed `<details>` at the bottom of Live control *and* as Setup step 3. The disconnect message appears three times on one screen: amber banner, status strip, and inside the LIVE NOW card. Account has a "Library" shortcut card and a "Set up this computer" card — shortcuts to two pills already visible six inches away. Health's Recovery block just points back at Help.

**One label, two meanings.** "Library" is a nav tab (the authoring app) and the `h2` of the right-hand column on Live control (the list of published graphics) — the operator's "library" and the editor's "Library" are different products. "Panel" is a layout (Left panel / Right panel) and a slide (Panel 1 / Panel 2 tabs, "+ Add panel", "Remove panel 1"). "Service" is a siddur filter dropdown, a field on a new collection, a prepared service, and a Saturday morning. "Published" is a left-rail count of 25, a header pill on a graphic, and a footer count of 24 — and the same graphic that says PUBLISHED offers "Review saved version → Publish this version," with a toast insisting "Nothing has been published yet."

**Hidden where nobody looks.** "Names for this service" is a real feature that lives inside a prepared service and is described only in Help — the operator who needs it is on Live control and will never find it. "Hide scan card" and "Next panel" are likewise Help-only. The Look card in the editor (layout, density, alignment, artwork — the settings people actually want to change) is collapsed behind an unnumbered one-line summary with a tiny green dot as its only affordance, sitting under two numbered steps. The legacy "Control key" path is exposed on the /author gate. And /author's hard-load gate bug means the first nav pill sometimes bounces a signed-in administrator to a sign-in card.

## 2. Proposed IA — four pills, filtered by role

**Order: Live · Library · Services · System.** Plus a right-side cluster: `?` (Help) and the user chip (Account). Operator sees **Live** only. Editor sees **Live · Library · Services**. Administrator sees all four.

That is the single biggest change: Michael's app becomes one page and a help button.

- **Live** (`/`) — unchanged in function, first in order because it is the only thing under time pressure. Its right column is renamed **Graphics** so the word "Library" stops meaning two things.
- **Library** (`/author`) — authoring, and **Source review folds in as a "Source changes" filter in the left rail**, beside Published / Drafts / Archived. Source review's own words are "choose what becomes new draft work" — that is the first step of authoring, not a separate department, and as a standalone pill it is an empty page 95% of the time.
- **Services** (`/services`) — prepared services, the import from centralreform.live, and "Names for this service" promoted to a visible section rather than a Help paragraph. The "Global graphic finder" is deleted; it is a worse copy of the Live control search. Drop "collections" as a separate noun: a prepared service *is* the collection.
- **System** (`/system`) — four tabs: **Status** (Health), **People** (invites, roles, paired devices — moved out of Account), **Setup**, **Log**. Reasoning: all four are administrator-only, all four are visited rarely, and none is worth a permanent pill. Setup belongs here rather than in Account because it configures a *computer*, not a person; People belongs here because inviting an editor is workspace administration, not a personal setting.
- **Account** (chip menu) — password, Google sign-in, sign out. Nothing else. Delete the two shortcut cards.
- **Help** (`?`) — same content, reached from every page, with deep links from the places that need it (the disconnect banner already links `/help#fallback`; keep that, drop the rest).

Provider spend (Vercel / Neon / Cloudflare) is not health. Put it at the bottom of System → Status as a collapsed "Costs" block, or drop it from the app — it currently reports "unavailable" three times and teaches the administrator to ignore the page.

## 3. Vocabulary — nine words

Current competing terms: graphic, overlay, cue, bug, slide, panel (layout), panel (slide), passage, collection, service collection, prepared service, prepared parts, set, numbered set, multipart, alternates, coverage, starter, scan card, source, snapshot, baseline, draft, saved version, revision, published, published-visible, review saved version, publish this version, local wording, history, archive.

| Keep | Absorbs |
|---|---|
| **Graphic** | overlay, cue, bug, scan card (it *is* a graphic — list it with the others) |
| **Slide** | panel-as-tab (Panel 1/2), multipart, numbered set |
| **Layout** | panel-as-shape (keep the names Lower third / Left panel / Right panel as *values* of Layout) |
| **Passage** | — (unchanged; the unit selected from the siddur) |
| **Source** | book, edition, snapshot, baseline, source change |
| **Service** | prepared service, collection, service collection, set, prepared parts, coverage, starter |
| **Draft** | working copy, local wording (call it "Draft — edited wording") |
| **Published** | published-visible, live version |
| **Version** | saved version, revision, history entry, snapshot-of-a-graphic |

Retire outright: *alternates* (two graphics in one slot — just show them stacked), *multipart* (a graphic with more than one slide), *coverage*, *starter*, *global finder*, *baseline*. And retire the word **"optional"** — it appears four times on Prepared services and reads as an apology.

## 4. Top eight findability fixes

1. **Nine pills → four, role-filtered.** *On screen:* Michael signs in and sees one nav item; Daniel sees four instead of nine.
2. **Fix the /author hard-load gate.** *On screen:* typing the Library URL opens the Library instead of a sign-in card, and the legacy Control key input disappears.
3. **One primary button in the editor: "Publish."** The two-step "Review saved version → Publish this version" is a step the owner's rule forbids; the exact-saved preview can swap in on hover/click of the same button. *On screen:* one green Publish in the footer, no contradictory toast.
4. **Collapse the header stack.** Org name and brand line become one small line; page title sits on the nav row. *On screen:* the graphics list on Live control starts ~100px higher, and the Source review header stops overlapping the Account pill.
5. **One disconnect message, not three.** Keep the amber banner with two buttons; delete the status-strip repeat and the in-card repeat. *On screen:* the first fold of Live control shows the preview and the list.
6. **Live control list: search box pinned to the top of the column, grouped by service order, scan card as a row.** *On screen:* the search field is the first thing in the Graphics column; the separate Scan card block is gone.
7. **Open the Look card by default and number it Step 3.** *On screen:* layout, density, alignment and artwork are visible when a graphic opens, instead of behind an unlabeled green dot.
8. **Cut reassurance copy from six instances to one, and dismiss the toast automatically.** *On screen:* "PREVIEW ONLY" on the frame, and nothing else — the toast stops covering the Look card.

Cost shape: 1, 4, 5, 7, 8 are layout and copy edits — an afternoon each at most. 2 is a session-handling bug fix. 3 and 6 touch real logic; 6 needs a service-order field the prepared service already implies. The System page (folding in Health, Log, Setup, People) is the one multi-day item, and it is mostly moving existing pages under tabs.
