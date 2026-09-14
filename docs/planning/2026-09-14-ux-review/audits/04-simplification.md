# CRC Overlays — Bloat Inventory and Cut List

The app does one thing on Saturday morning: put a prayer on the screen and take it off again. Everything captured here is measured against that. The count below is of *things the UI puts in front of a human* — cards, buttons, inputs, banners, dropdowns, checkboxes, helper paragraphs, status readouts. Nav pills count once each; a repeated row control (Preview/Show on 24 rows) counts as one pattern, not 48.

**Before: 168 exposed elements across 9 top-level pages. After: 54 elements across 3 top-level pages (plus Help as a footer link).** A 68% reduction, with no capability lost — the diagnostics move to the MCP server, where the owner already lives.

## Inventory

| # | Page / element | Verdict | Where it goes |
|---|---|---|---|
| **Global chrome (8)** |
| 1 | Org small-caps "CENTRAL REFORM CONGREGATION" | MERGE | into brand line, one row |
| 2 | Brand "CRC Overlays" | KEEP | |
| 3 | Large h1 page title | CUT | the nav pill already says it |
| 4 | Per-page one-sentence subtitle | CUT | all of them |
| 5 | User chip "Daniel · Administrator" | DEMOTE | small avatar → Account |
| 6 | Sign out | DEMOTE | inside Account |
| 7 | 9 nav pills | MERGE | → 3 pills (Live, Library, Account) |
| 8 | Header stack height (~170px) | CUT | one 44px bar |
| **Live control (32)** |
| 9 | "CRC TRIAL OUTPUT" pill | CUT | trial scaffolding |
| 10 | Amber disconnect banner (body copy) | MERGE | → one status dot + one line |
| 11 | Banner link "fallback steps" | DEMOTE | appears only when disconnected >60s |
| 12 | Banner button "Setup steps" | CUT | duplicate of Setup nav |
| 13 | Banner button "Service log" | CUT | page is going |
| 14 | Status strip DISCONNECTED pill | MERGE | → the one status dot |
| 15 | Status strip thumbnail | CUT | Live Now panel shows it |
| 16 | Status strip repeat of banner text | CUT | third statement of one fact |
| 17 | PREVIEW · NOT LIVE box | KEEP | |
| 18 | Empty-preview instruction paragraph | CUT | |
| 19 | "Preview only · output does not change…" | CUT | |
| 20 | Preview CTA "Show this graphic" | MERGE | one Show, in the row |
| 21 | LIVE NOW panel (artwork + text) | KEEP | |
| 22 | Right column h2 "Library" | CUT | name collision with nav tab |
| 23 | Animate out | KEEP | |
| 24 | Clear now (red) | MERGE | one "Out" control; hold for hard clear |
| 25 | Scan card h3 | MERGE | into the graphic list as a row |
| 26 | Show scan card button | MERGE | ditto |
| 27 | Scan card Page input | MERGE | inline on that row |
| 28 | "Clear now also removes the scan card." | CUT | |
| 29 | Find a graphic input | KEEP | should be autofocused |
| 30 | Placeholder "Name, spelling variant, Hebrew…" | KEEP | |
| 31 | Keyboard hint "↑↓ move · Enter previews" | DEMOTE | fades after first use |
| 32 | 24-row graphic list | KEEP | reordered to service order |
| 33 | Row: title | KEEP | |
| 34 | Row: layout subtitle | DEMOTE | tiny glyph, not words |
| 35 | Row: Preview button | MERGE | selection previews; no button |
| 36 | Row: Show button | KEEP | the one button that matters |
| 37 | Nested inner scroll region | CUT | page scrolls once |
| 38 | details "Connect vMix, OBS, or Companion" | CUT | duplicates Setup step 3 |
| 39 | Copy output URL (inside it) | DEMOTE | Account |
| 40 | Footer "24 graphics published, visible · Trial…" | CUT | |
| **Library / editor (44)** |
| 41 | /author sign-in gate (bug) | CUT | fix session on hard load |
| 42 | "Control key" legacy input | CUT | remove the path entirely |
| 43 | "Add from siddur" (left rail) | KEEP | |
| 44 | "New custom graphic" (left rail) | KEEP | |
| 45–46 | Same two buttons repeated in empty state | CUT | |
| 47 | "READY WHEN YOU ARE" empty-state card | CUT | |
| 48 | Segmented counts Published/Drafts/Archived | DEMOTE | Archived behind a filter |
| 49 | Search published | KEEP | |
| 50 | Card list (thumb + name + type) | KEEP | widen; names truncate today |
| 51 | Hover: duplicate icon | KEEP | |
| 52 | Hover: archive icon | KEEP | |
| 53 | PUBLISHED pill | KEEP | |
| 54 | "Saved version 1" | MERGE | into the pill |
| 55 | "The published version stays available…" | CUT | |
| 56 | undo / redo | KEEP | |
| 57 | Duplicate (toolbar) | MERGE | dup of rail hover action |
| 58 | Local wording | DEMOTE | Editor+ only, overflow menu |
| 59 | Archive (toolbar) | MERGE | dup of rail hover action |
| 60 | History | DEMOTE | overflow menu |
| 61 | STEP 1 card heading + helper | KEEP | drop the word "Step" |
| 62 | Prayer search input + Search button | KEEP | search-as-you-type, no button |
| 63 | BOOK dropdown (13 options) | MERGE | one "Source" filter |
| 64 | SERVICE dropdown (14 near-identical) | CUT | |
| 65 | Source breadcrumb | KEEP | |
| 66 | "Select all passages" | KEEP | |
| 67 | "Make slides from whole prayer" | DEMOTE | overflow |
| 68 | "Exact source text · view edition details" card | DEMOTE | link only |
| 69 | Hebrew + transliteration toggle | KEEP | |
| 70 | Panel 1 / Panel 2 tabs | KEEP | rename "Slide 1/2" — "panel" is overloaded |
| 71 | + Add panel | KEEP | as "Add slide" |
| 72 | Remove panel (red outline) | DEMOTE | into the tab's ⋯ |
| 73 | Passage checklist | KEEP | |
| 74 | STEP 2 heading + helper | KEEP | |
| 75 | Library name | KEEP | |
| 76 | On-screen title | KEEP | |
| 77 | Hebrew accent (optional) | DEMOTE | |
| 78 | Collapsed "Look" summary (unlabeled dot) | KEEP | label it, give it a chevron |
| 79 | 3 layout thumbnails | KEEP | |
| 80 | Text density (3) | KEEP | |
| 81 | Alignment (3) + helper | DEMOTE | inside Look, advanced |
| 82 | Line spacing (3) | MERGE | fold into Text density |
| 83 | Upper-right artwork + helper + Show archived | DEMOTE | Editor+, advanced |
| 84 | Reset visual settings to template | KEEP | |
| 85 | ISOLATED PREVIEW frame | KEEP | |
| 86 | "1920 × 1080 / PREVIEW ONLY" labels | MERGE | one label |
| 87 | Play in / Play out / Full screen | KEEP | |
| 88 | "Working preview" / "Exact saved preview" | CUT | |
| 89 | Fit-check status card | KEEP | |
| 90 | "This preview cannot issue live commands…" | CUT | |
| 91 | Sticky footer reassurance line | CUT | |
| 92 | Save draft (disabled) | KEEP | |
| 93 | "✨ Review saved version" → "✓ Publish this version" | MERGE | one **Publish** button |
| 94 | Persistent toast "Published output is unchanged" | CUT | |
| **Prepared services (17)** |
| 95 | h1 + subtitle | CUT | |
| 96 | ALWAYS AVAILABLE label | CUT | |
| 97 | Global graphic finder card | CUT | Live control already searches all 24 |
| 98 | "24 graphics published, visible" pill | CUT | |
| 99 | Search every published graphic | CUT | |
| 100 | Empty box "Search to find a graphic…" | CUT | |
| 101 | "0 selected" bar | CUT | |
| 102 | Add graphic | MERGE | → drag into today's order |
| 103 | Add as alternates | CUT | alternates = extra rows |
| 104 | Add as multipart | CUT | numbered titles already do this |
| 105 | OPTIONAL PREPARATION label | CUT | |
| 106 | Service collections card | MERGE | → "Today's order" on Live control |
| 107 | Show archived checkbox | CUT | |
| 108 | New collection: Name + Service + Create empty | MERGE | date-keyed, auto-created |
| 109 | "Start from current library" (starter) | CUT | |
| 110 | Coverage helper paragraph (3 sentences) | CUT | |
| 111 | Import from centralreform.live + 18-setlist dropdown | KEEP | the one good thing here |
| **Service log (9)** |
| 112 | BETA LEARNING label | CUT | trial scaffolding |
| 113 | Page + heading + helper | CUT | |
| 114 | Export CSV | CUT | MCP tool |
| 115 | What happened (3 options) | MERGE | → one free-text "Report a problem" |
| 116 | Impact (3 options) | CUT | |
| 117 | Graphic dropdown (25 options) | CUT | infer from live state |
| 118 | Moment or context | CUT | infer timestamp |
| 119 | Details | KEEP | the only field worth keeping |
| 120 | "This suggests a product gap" checkbox | CUT | |
| **Source review (6)** |
| 121 | Page + subtitle | CUT | top-level destination |
| 122 | Library / Check sources buttons (overlapping nav) | CUT | agent-triggered |
| 123 | "20 unopened baseline graphics…" banner | CUT | |
| 124 | Inbox (0) list | DEMOTE | badge on Library rail |
| 125 | Side-by-side diff pane | DEMOTE | opens from that badge |
| 126 | Empty state "Select a source change" | CUT | |
| **Health (15)** |
| 127 | Page + subtitle | CUT | top-level destination |
| 128 | SYSTEM CHECK amber banner | MERGE | → the status dot |
| 129 | Check now | KEEP | on the dot's popover |
| 130 | LIVE PLAYBACK card (+revision id) | CUT | MCP |
| 131 | GRAPHICS OUTPUT card | MERGE | → status dot |
| 132 | COMPANION CONTROL card (+log advice) | MERGE | → status dot |
| 133 | LIBRARY SYNCHRONIZATION card (+ hashes) | CUT | MCP |
| 134 | AUTHORING DATABASE card (6 stats) | CUT | MCP |
| 135 | ADMINISTRATOR VIEW budget header + 3 paragraphs | CUT | MCP |
| 136–138 | Vercel / Neon / Cloudflare cards | CUT | MCP |
| 139 | Open provider dashboard / Report current usage | CUT | MCP |
| 140 | RECOVERY card + Open Help | CUT | |
| 141 | "Last successful observation…" footer | CUT | |
| **Setup (17)** |
| 142 | Page + subtitle (Singular parallel-trial copy) | CUT | |
| 143 | Intro card (4-sentence scope paragraph) | CUT | |
| 144 | "Parallel trial" pill | CUT | |
| 145 | Step 1 "Protect the setup you already use" | CUT | trial-only |
| 146 | Step 1 checkbox "I saved a backup…" | CUT | |
| 147 | Step 2 Companion module package | KEEP | |
| 148 | Name this Companion computer | KEEP | |
| 149 | Pair this Companion | KEEP | |
| 150 | "Recreate CRC's exact button layout" | DEMOTE | Help |
| 151 | "Every preset is a toggle" helper | DEMOTE | Help |
| 152 | Step 3 vMix / OBS switch | KEEP | |
| 153 | Step 3 per-app instructions | KEEP | |
| 154 | Name this graphics computer | KEEP | |
| 155 | Create an output connection | KEEP | |
| 156 | Copy private output URL | KEEP | |
| 157 | Step 4 Check graphics connection | MERGE | into step 3, auto |
| 158 | Step 5 Rehearsal + checkbox | CUT | |
| 159 | READY card + Open Live control | CUT | |
| **Help (13)** |
| 160 | Guide version bar + Check workspace health | CUT | |
| 161 | 10 jump pills | MERGE | one scroll |
| 162–171 | 10 procedure cards | MERGE | → 5: Before / During / Scan card / Accounts / Fallback |
| | ("Return to Singular", "Backup and restore rehearsal" | CUT | trial-only) |
| **Account (12)** |
| 172 | SIGNED-IN card + 30-day session copy | MERGE | one line |
| 173 | Library shortcut card | CUT | it's in the nav |
| 174 | Set up this computer card | KEEP | this is where Setup lives now |
| 175 | Change your password (3 fields) | KEEP | |
| 176 | Google sign-in / Unlink | KEEP | |
| 177 | Paired devices | KEEP | |
| 178 | Invite: Name / Email | KEEP | |
| 179 | Invite: 3 role radios | KEEP | |
| 180 | Create private link | KEEP | |
| 181 | People with access + per-row role menu + Remove | KEEP | |

(Element IDs run past 181 because some rows cover repeated patterns; the deduplicated totals are **168 → 54**.)

## 1. The irreducible core

On Saturday morning the operator has exactly one loop: *find the next prayer, put it up, take it down, repeat, about forty times, while also running cameras.* Nothing else is core. Not versions, not coverage, not budget, not source diffs. The ideal Live control page is a single column on a single scroll: a thin bar with the congregation name, a status dot (green = output connected, amber = not), and a small avatar; then an always-focused search field; then the list of graphics — today's service order first if a service was imported, the full alphabetical library below it, one row each, title large, layout shown as a small glyph rather than the words "Lower third". Arrow keys move the selection and the selected row expands in place to show its artwork; Enter or the row's single **Show** button puts it on air, and the row stays visibly lit while it is live. One persistent control sits at the bottom of the viewport within thumb reach — **Out** — which animates out on press and hard-clears on hold. The scan card is just another row in the list with its page number inline. That is the whole app: one search, one list, one Show, one Out, one dot. Everything the operator needs is above the fold at 600px wide, which is what a phone in the booth actually is.

## 2. Pages that should stop being destinations

Nine pills go to three: **Live control**, **Library**, **Account**, with Help as a footer link. The current order is also wrong — authoring is first, the operator's entire job is second.

**Health** disappears entirely. The operator needs one bit of information (is the browser output connected?) and that is the status dot; clicking it offers "Check now" and a one-line fallback link. Everything else on that page — relay revision IDs, library hash comparison, database size, Vercel/Neon/Cloudflare spend against the $25/month target — is diagnostic data an agent should fetch on request. It is strictly better there: an agent can compare it across weeks and tell the owner *"Companion hasn't connected since the 6th,"* which the page cannot.

**Service log** disappears. Three dropdowns, a checkbox and a CSV export to capture a fact a human is trying to record while a service is going wrong is exactly backwards. Replace with one line in the status-dot popover: "Something's wrong" → a single text box → timestamp, currently-live graphic and connection state are attached automatically. Reading and triaging the log is an agent job.

**Source review** disappears. Nothing there is time-sensitive and the inbox reads 0. Make it a badge on the Library rail — "3 sources changed" — that opens the diff in the editor where the fix happens anyway. The "20 unopened baseline graphics" banner is a one-time migration message; delete it.

**Setup** disappears as a pill and becomes the "Set up this computer" card that already exists on Account. It runs once per machine, ever. Strip steps 1 and 5 (protect-your-Singular-pages, rehearsal) and the READY card, fold step 4's connection check into step 3 so it verifies itself, and it is a two-step page.

**Prepared services** disappears into Live control (see below).

**Help** survives as content but not as a pill — five cards, not ten. "Return to Singular" and "Backup and restore rehearsal" are trial scaffolding and go when the trial ends, along with the "CRC TRIAL OUTPUT" pill, the "BETA LEARNING" label, the "Parallel trial" pill and the footer's "· Trial ·".

## 3. Prepared services, replaced

The current page invents eleven pieces of vocabulary — prepared services, prepared parts, collections, service collections, coverage, starter, alternates, multipart, numbered sets, global finder, "Names for this service" — and then says "optional" four times, which is the page admitting it isn't sure why it exists. The global finder is a second, worse copy of the search already on Live control.

Replace all of it with **Today's order**: an ordered list of graphics attached to a date, shown at the top of the Live control list. It is created one of two ways — the owner imports the setlist from centralreform.live (keep this; it is the one genuinely valuable thing on the page), or he drags graphics up from the library list below. That's it. *Alternates* are just two rows sitting next to each other; the operator picks one and skips the other. *Multipart* is already solved by the naming convention in the library (Mourners Kaddish 1, Mourners Kaddish 2). *Coverage* and *starter* answer a question nobody asks on Saturday and should be deleted outright. *Names for this service* — the one real recurring need — becomes a single row in today's order whose text is editable inline; type the names, it renders as a custom graphic. If no service was imported, the list is just the library, alphabetical, exactly as today. No modes, no empty states, no "create empty".

## 4. Role gating

**Operator (Michael, and Simone at TBI).** Sees one page: Live control. Search, the graphic list with today's order on top, Show, Out, the scan card row with its page field, the status dot with Check-now and the fallback link, and a "Something's wrong" box. No Library pill, no Account pill beyond a sign-out in the avatar menu, no publishing, no Setup, no versions, no Help beyond During-a-service and Fallback. Roughly 14 elements. An operator should never see the word "draft", "version", "archived" or "coverage".

**Editor (Daniel, David).** Everything the Operator sees, plus the Library pill and full editor: add from siddur, new custom, passage selection, naming, Look (density, layout, artwork, reset), preview and fit check, Save draft, Publish, undo/redo, duplicate, archive, History and Local wording in an overflow menu, the source-changed badge, and the import-from-centralreform.live control on today's order. Not: people, invites, devices, provider spend.

**Administrator (Daniel, Michael).** Everything above plus the Account page's workspace half — invite someone with the three role radios, People with access with per-row role and Remove, paired devices, the output URL, and "Set up this computer". Provider budget is *not* an admin UI feature; it's an agent question.

## 5. Five cuts he'll approve, three he'll fight

**Confident.** (1) The triple disconnect message — banner, status strip, and the row under it all say the same sentence; keep one dot and one line. (2) The whole trial apparatus: CRC TRIAL OUTPUT, Parallel trial, BETA LEARNING, Setup steps 1 and 5, "Return to Singular", the trial footer — this is scaffolding with a known expiry. (3) The reassurance copy: "published output is unchanged / not live / preview only / cannot issue live commands" appears six-plus times on the editor screen and once more as a toast that covers a card. It reads as anxiety, and it makes a confident tool feel fragile. (4) The duplicate "Connect vMix, OBS, or Companion" disclosure on Live control, which restates Setup step 3. (5) The /author sign-in gate that appears on hard load for a signed-in administrator and exposes a legacy Control-key field — that one is a bug and a security smell, not a feature.

**Pushback expected.** (1) *Killing the Health page.* He built it, the provider-budget section is genuinely his, and "I want to see it's working" is a real feeling. The argument: he reads it through an agent already, and the operator has never once needed the library hash. (2) *Collapsing "Review saved version" → "Publish this version" into one Publish button.* The two-step exists deliberately, but it currently produces a screen where the header pill says PUBLISHED, the rail counts the graphic under Published 25, and the toast says "Nothing has been published yet" — three contradictory states. It is a confirmation step, and his own rule forbids those. (3) *Deleting alternates, multipart, coverage and starter.* Real design thinking went into them, and he'll argue they encode liturgical structure. They do — but the operator's need is an ordered list, and every one of those concepts is expressible as a row in it.
