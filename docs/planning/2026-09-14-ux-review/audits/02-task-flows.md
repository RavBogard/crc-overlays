# CRC Overlays — task-flow and time-to-action audit

Scope: the five flows requested, walked from the captures only. Throughout, "step" means an
action the user takes (click, keypress-group, scroll) or a block of text they must read before
they can act. Reading is counted because on Saturday morning reading *is* the cost.

---

## A. Operator: show and clear a graphic under time pressure

### Current walk — "Mourners Kaddish 1" on and off

1. Load `/`. Before any control is visible the page presents: small-caps org name, brand name,
   h1 "Live control", a subtitle, the user chip, and **nine nav pills of equal weight**. ~170px of
   chrome that changes on no Saturday, ever.
2. Read the amber banner. It is five sentences and carries three CTAs (Setup steps, Service log,
   `/help#fallback`). It owns the first fold.
3. Read the status strip immediately under it, which restates the same disconnect sentence.
4. Scroll. The Library — the operator's entire job — is the *right* column, and its head sits below
   the banner and strip.
5. Locate the search field. It is not at the top of the library column: above it sit **Animate out**,
   **Clear now**, and the whole Scan card block (button + Page input + a note about Clear now).
6. Type "kaddish" (4 rows) or "mourn" (2 rows).
7. Disambiguate **Mourners Kaddish 1** vs **2**. The row subtitle says only "Lower third". Nothing
   on screen says which is which. This is a genuine stop.
8. Choose **Preview** or **Show**. Preview is safe but costs a second click ("Show this graphic"
   appears under the preview), so Show now exists in two places with different consequences.
9. Click **Show**.
10. To take it off: scroll the library column back to its head and choose between **Animate out**
    and **Clear now** (red). The only explanation anywhere is a fragment under the Scan card:
    "Clear now also removes the scan card."

**Current: ~10 steps, two hard forks (Kaddish 1 vs 2; Animate out vs Clear now), three reads that
carry no Saturday-morning information.**

### The rabbi skips ahead

The search box is the one genuinely good affordance here — it accepts spelling variants, Hebrew and
opening words, and filters instantly. But it only helps if Michael knows the *name*. The 24 rows are
in neither alphabetical nor service order (Barechu, Modeh Ani, Mah Tovu, Thank you, Oseh Shalom,
Mourners Kaddish 1…), so scanning fails and he must recall a title cold. Worse: everything the editor
prepared for *this* service lives on `/services`, which "never control[s] the live output" and is not
represented on Live control at all. The preparation is invisible at the only moment it matters.
Wrong-turn risk: he clicks the "Prepared services" nav pill mid-service looking for the running order
and loses the page he was on.

### "Something looks wrong on the stream"

What he needs: *is the thing I think is live actually on air, and how do I kill it.* What the app gives
him: a LIVE NOW card showing what the app *believes* is live (with a DISCONNECTED chip), a preview box
that explicitly cannot tell him anything about air, a `/help#fallback` deep link inside the banner,
a Service log form on another page, and a Health page with a raw revision number. Three pages, no
answer. The one correct action — **Clear now** — is present but sits mid-column above the fold line he
has scrolled past, and is visually indistinguishable in importance from the Scan card controls.

### Narrow / laptop width

At ~600px everything stacks in source order: banner → status strip → preview → live now → library.
The library is several screens down, and **Animate out / Clear now sit inside it**, so there is no
width at which the panic button is reachable without scrolling. The preview box — an empty ~500×270
dark rectangle when nothing is selected — is pure vertical cost on a narrow screen.

### Redesigned flow

Load `/` → library and search are the top of the page, with a sticky one-line top bar carrying the
live graphic's name and a single **Take off air** button → type → Enter shows the highlighted row.

1. Load. 2. Type. 3. Enter (show). 4. Click **Take off air** (always on screen).
**New: 4 steps, no forks.** Preview stays as a per-row secondary. Row subtitles carry the opening
words rather than the layout name, which resolves Kaddish 1 vs 2 without a second source.

---

## B. Operator arrives to a disconnected output

The same disconnect message is stated **three times on one screen**, four if you count the footer:
the amber banner (five sentences, three CTAs), the red DISCONNECTED status strip with the same
sentence again, the DISCONNECTED chip on the LIVE NOW card header, and the page footer's
"Check graphics in vMix or OBS". It repeats again on `/health` as both a system-check banner and a
GRAPHICS OUTPUT card.

Is it helpful? The *content* is — it names the likely cause and says Show still works. The *treatment*
is noise, for three reasons. It is the steady state whenever OBS isn't open yet, so Michael sees it
most times he opens the page and learns to scroll past it; it consumes the fold that the library
should own; and it offers three navigations away from Live control at the moment he least wants to
leave. The banner is written for someone with ten minutes, shown to someone with thirty seconds.

**What the page should do instead:** collapse to one amber line in the sticky top bar —
"Output not connected — Show still works; the graphic appears when it reconnects" — with the fix
detail behind a single inline disclosure. Keep exactly one instance. It clears itself already, so it
never needs to be loud. **Current: 3–4 reads before first action. Redesigned: one glance, zero steps.**

---

## C. Editor: add, name, check, publish "Ahavat Olam"

### Current walk

1. Navigate to Library — and if he typed `/author` or refreshed, hit the gate bug (see E).
2. Click **Add from siddur** (offered twice: left rail and centre empty state).
3. Read Step 1. Type into "Search prayers and readings", press **Search** (not live-filtering, unlike
   Live control's search — inconsistent).
4. Decide between two near-identical dropdowns, **BOOK** (13 options) and **SERVICE** (14 options),
   with overlapping labels and counts. Hesitation point with no recovery cue.
5. Select the source; read the edition card and the "Exact source text" line.
6. Decide about **Select all passages** vs **Make slides from whole prayer** — two unexplained bulk
   actions.
7. Tick the passages in the checklist.
8. Parse **Panel 1 / Panel 2 / + Add panel** tabs while the layout options below call things
   "Left panel / Right panel". The word *panel* means two different things within 400px.
9. Step 2: Library name, On-screen title, optional Hebrew accent.
10. Find the third card. It is collapsed, unnumbered, and summarised as
    "Look · Lower third · Comfortable · Template alignment · No artwork" with an unlabeled green dot
    as its only affordance. Several editors will never open it.
11. Expand and set density / alignment / spacing / artwork.
12. Check the isolated preview and its fit status.
13. **Save draft**.
14. Footer primary: **✨ Review saved version**.
15. Read the toast: "Reviewing exact saved version 1. Nothing has been published yet."
16. Footer primary becomes **✓ Publish this version**. Click.
17. Dismiss the persistent toast, which covers the Look card.

**Current: ~17 steps, two of them purely ceremonial (14–16).**

### The contradiction

While the toast says "Nothing has been published yet", the header pill on the same graphic reads
**PUBLISHED** and the left rail counts it under **Published 25**. "Published" is being used for two
things — the graphic's lifecycle state, and this editing session's outcome. An editor reasonably
concludes either that his edit went live already or that the app has lost track.

The vocabulary in play on one screen: Published, Saved version, Draft, Review saved version,
Publish this version, History, Local wording, Archive, Duplicate. Nine terms for two ideas
(what exists, what is on air).

### Reassurance count

"Nothing is live" is asserted **seven times** on the editor screen: header subtitle, centre empty
state, "PREVIEW ONLY" frame label, "Working preview", "This preview cannot issue live commands. A
graphic already on screen remains unchanged", the sticky footer's "Published output has not changed",
and the toast "Published output is unchanged" — plus an eighth on the review toast. Daniel already
knows. This is the single densest patch of text in the product and it says nothing.

### Redesigned flow

One source picker (a single filter, not BOOK+SERVICE), three visible numbered cards, one **Publish**
button that swaps the preview to the exact saved render *in place* rather than through a toast-and-
relabel dance. Steps 14–16 collapse to one. Reassurance drops to one line in the footer.
**New: ~11 steps, no state contradiction.**

---

## D. Editor: prepare next Saturday by importing from centralreform.live

### Current walk

1. `/services`. 2. Read subtitle ("Collections are optional preparation aids; they never control the
live output"). 3. Scroll past the ALWAYS AVAILABLE "Global graphic finder" card — which duplicates
Live control's search and whose own empty state admits "The full published list is on Live control".
4. Reach "Service collections" (OPTIONAL PREPARATION). 5. Read the "New collection" form. 6. Scroll
past it to find **Import from centralreform.live**. 7. Open the dropdown of 18 setlists and pick
between *RH Day 2*, *Rosh Hashanah Day 2*, *RH Day Alt*, *Rosh Hashanah Day*, *Alt Rosh Hashanah Day*
— five confusable names with no date, so he cannot tell which is next Saturday's. 8. Import.
9. Review in the right-hand card.

**Current: ~9 steps, with the import — the actual purpose — buried third in a card labelled
"optional".**

### Is the vocabulary understandable without Help?

No. The page introduces *prepared services, prepared parts, collections, service collections, coverage,
starter, alternates, multipart, numbered sets,* and *global finder*, and says "optional" four times.
**Collections** is guessable. **Starter** and **coverage** are only defined in one run-on helper
sentence ("The starter includes published graphics and groups only complete numbered sets. Add source
material to coverage only when your congregation actually uses it."). **Alternates** and **multipart**
are buttons that are disabled until something is selected, so their meaning is never demonstrated.
Help compounds this by describing "Names for this service", which lives inside a prepared service but
is not visible on this page.

### Simplest version

A list of upcoming services, newest first, each showing its date and an ordered list of graphics.
One primary action at the top: **Import a service from centralreform.live**, with the dropdown showing
*date + name* so the five Rosh Hashanah entries disambiguate themselves. Drop the global finder
(Live control already is it). Make *alternates* and *multipart* row-level affordances inside a service
("add an alternate", "split into parts") so they're learned in place; retire *collections*, *coverage*
and *starter* as nouns. Then — the point — surface the imported service as a grouping on Live control.
**New: 3 steps (open, pick dated service, import), and the operator actually benefits from it.**

---

## E. Admin: invite an operator and get them connected

### Current walk

1. `/access`. The page mixes personal settings (password, Google) with workspace administration
   (invites, people, devices) on one long scroll, so step 1 is really "scroll past your own password".
2. Reach **Invite someone**. 3. Name. 4. Email. 5. Choose a role from three radio options whose
   descriptions overlap ("Editor — create, publish, and operate" vs "Operator — use approved graphics").
6. **Create private link**. 7. Copy it. 8. Send it by some other channel — the app appears not to send
   it. 9. Invitee opens it within **8 hours** (the David Lazaroff row shows "link expires in 8 h"),
   which for a weekday-evening volunteer is a coin flip.
10. Invitee lands in the app and, at any point where they type or refresh a URL, hits the `/author`
    hard-load gate.

**Current: ~10 admin steps plus a 5-step Setup page with two self-attested checkboxes.**

### The `/author` bug and its consequence

Per `03-other-pages.txt` (reproduced twice): a full page load of `/author` while signed in as
Administrator shows the "Open the library" gate, offering **Sign in** *and* a legacy **Control key**
field. Client-side navigation from another page works fine. Consequences for an invitee: the first
thing a new user does with a link is open it fresh, i.e. a hard load. They are told to sign in when
they are already signed in, so they either sign in again (fine, confusing) or reach for the Control
key — a credential they don't have, shouldn't know exists, and which quietly advertises a bypass path
to every ordinary user. A new operator's first impression of the app is a locked door.

### Redesigned flow

Split personal settings from People. Invite = name, email, role, **Send invite** (app-sent), link
valid 7 days. Fix the session check on `/author` and remove the Control key from any user-facing gate.
Land invitees on Live control, not the library. **New: 4 admin steps, no dead end.**

---

## The ten changes that most reduce time-to-action

| # | Change | What changes on screen | Size |
|---|---|---|---|
| 1 | Library first on Live control | Search box + graphic rows move to the top of the page; preview and LIVE NOW move below or beside | M |
| 2 | Sticky live bar with one **Take off air** | A thin always-visible bar shows the live graphic's name and one out button at every width; Clear now moves to a secondary beside it | S |
| 3 | Collapse the disconnect notice to one line | Amber banner and status strip merge into a single line in the sticky bar; the LIVE NOW chip and footer nudge are removed | S |
| 4 | Fix the `/author` hard-load gate; delete the Control key field | A refresh of Library opens the library; the gate card no longer shows a key input | S |
| 5 | Row subtitles show opening words, not layout | "Mourners Kaddish 1 · Yitgadal v'yitkadash…" instead of "· Lower third" | S |
| 6 | Show the prepared service on Live control | A service chip above the search filters the 24 rows to next Saturday's order; "All graphics" clears it | M |
| 7 | One-click publish | Footer shows **Publish**; the exact-saved render swaps into the preview frame in place; the "Review saved version" step and its toast disappear | M |
| 8 | Cut reassurance copy to one line | Six of the seven "nothing is live" statements deleted, keeping the footer line | S |
| 9 | Merge BOOK + SERVICE; number and expand the Look card | One source filter; a visible "3 · Look" card with a normal chevron | S |
| 10 | Simplify Prepared services to dated services + Import | Import is the top primary action, dropdown shows dates, collections/coverage/starter language retired | M |

Everything above removes steps or text. Nothing here adds a confirmation, a mode, or a gate — items 2,
3 and 7 each delete one decision the user currently has to make under time pressure.
