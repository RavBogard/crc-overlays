# Return — Companion cutover

**Repo:** `crc-overlays` · **Branch:** `google-signin` (== `main`) · **Date:** 2026-09-22
**Answering:** `HANDOFF-CODE-2026-09-22-companion-cutover.md`
**Released:** `603e5936` to both production workspaces.

All eight sections were built, both workspaces are released, and **all sixteen slot graphics
are published**. Getting the last ten out took hours longer than it should have, because the
production fit-check stage — the gate in front of every publish in this system — refuses
after about five checks in a row. That is a real production problem and it is written up in
§3; it is not a problem with anything built here.

The one thing genuinely still owed is a person's: the sixteen are published carrying their
placeholder text and want blanking through "This service" before Michael imports his deck.
See §8.

---

## 1. Files changed

Three commits on top of `273ec83`:

- `523178c` — the slots themselves: the page, the API, the module, the packaging.
- `4a61f2d` — the converter run, and two bugs it exposed.
- `603e593` — a `.gitignore` line for the Claude desktop drop folder, which was blocking
  the release script.

| File | What changed |
| --- | --- |
| `lib/slots.ts` | **New.** The slot table and the service-type table, the field shapes, the length guard, and the two functions that turn fields into the graphic's text and back. Pure and client-safe: the page imports it directly. |
| `lib/slot-catalog.ts` | **New.** The `key -> cue id` register (`content/slot-cues.json`), the slot index, the category classifier, and the cue markers the envelope carries. |
| `content/slot-cues.json` | **New.** Which published graphic each slot is. These sixteen ids are permanent. |
| `app/this-service/page.tsx`, `layout.tsx`, `this-service.css` | **New.** The "This service" page. |
| `app/api/slots/route.ts` | **New.** `GET` the slot table and its current values; `POST` one Save. |
| `app/api/catalog/route.ts` | `?include=slots` added beside `?include=liturgy`. Default response untouched. |
| `components/workspace-nav-model.ts` | A fourth destination, "This service", beside Live. |
| `lib/authoring.ts` | The `save_slots` operation, the `publishSlotText` helper, `standingApproval` on the review receipt, and the publish gate that accepts it for a slot and nothing else. `save_slots` joins the operations that sync the live library. |
| `lib/authoring-model.ts` | `content.mode:'custom'` accepts an empty string; `buildCue` then writes no main text layer at all; `previewValidation` takes an `allowEmptyText` flag only the slot path passes. |
| `companion/src/catalog.ts` | `category` and `slot` on `CatalogCue`, the slot index and its validator, the category colour table, the Stream Deck line rule. |
| `companion/src/client.ts` | The catalog fetch asks for `?include=slots` and reads either shape back. |
| `companion/src/variables.ts` | `requested_cue_id`. |
| `companion/src/main.ts` | Variables redeclared on every catalog change; slot values; the `slot_empty` feedback; red `rendered`; the whole preset block; and the command path no longer refuses to send while the socket is down. |
| `companion/tests/slots.test.ts`, `tests/slots.test.ts` | **New**, 12 + 14 tests. |
| `companion/package.json`, `companion/companion/manifest.json` | 1.5.0 → 1.6.0. |
| `companion/companion/HELP.md`, `companion/README.md`, `docs/OPERATOR-QUICKSTART.md` | The colours, the slots, the page, and the new behaviour of a press during a reconnect. |
| `public/downloads/crc-overlays-1.6.0.tgz`, `public/workspaces/.../tbi-overlays-1.6.0.tgz` | The built archives. |
| `lib/workspace.ts`, `.env.example`, `workspaces/temple-bnai-israel/workspace.json`, `scripts/build-tbi-companion-module.mjs`, `scripts/stage-workspace-source.mjs` | The download links and build paths follow the version. 1.5.0 stays downloadable for anyone still running it. |
| `scripts/convert-companion-singular.mjs` | The Windows CLI-guard fix, the stale "Guest Name" note, and `MODULE_VERSION`. |
| `scripts/refresh-companion-catalog.mjs` | Landed from the worktree, untracked until now. |
| `tests/services-split.test.ts`, `tests/authoring-names.test.ts`, `companion/tests/*` | Updated for the four-pill nav, the new variable, the new feedback, and the optional measurement. |

Things that turned out differently from the handoff are marked **▲** below.

---

## 2. Module version

- `companion/package.json` and `companion/companion/manifest.json` both say **1.6.0**.
- `@companion-module/base` is **2.0.4**, unchanged.
- `runtime.apiVersion` is **2.0.4**, unchanged.
- Runtime `node22`, engine `>=22.20`, unchanged.
- Built by the repo's existing route — `npm run package` in `companion/`, which is
  `tsc -p tsconfig.build.json && companion-module-build`. **▲** The handoff asked which
  script produces the archive: it is that npm target, not a script in `scripts/`.
  `scripts/build-tbi-companion-module.mjs` then derives the TBI archive from the reviewed
  CRC one, and `scripts/audit-companion-packages.mjs` re-derives it and checks it byte for
  byte. Both were run; the audit passes.
- `crc-overlays-1.6.0.tgz` sha256 `7be292ff79882219a93ea820444a8c82445f6def7d3d53c2f549929917d8480a`;
  `tbi-overlays-1.6.0.tgz` sha256 `44c0aa85ed7fa981f43987f9d56cae1d6d3ebaae97281029d19a7d3be4ecbdce`.

---

## 3. The sixteen slot cue ids

These are permanent. `content/slot-cues.json` holds the same table, and
`work/companion-conversion/2026-09-22/slots.json` maps Michael's Singular composition names
onto them.

| Slot | Cue id | Variable | Published |
| --- | --- | --- | --- |
| Student name | `17db1877-425a-4ea7-b123-664a9756f2ae` | `slot_student_name` | yes, rev 1 |
| Student names (two lines) | `25737a2e-167c-4049-81fb-9654cb54a8f1` | `slot_student_names` | yes, rev 1 |
| Torah reading 1 | `e3624fda-b7ff-44a0-b3ef-7add80524ef7` | `slot_torah_1` | yes, rev 1 |
| Torah reading 2 | `643fb791-9836-4ae3-bec9-52b6d43759a8` | `slot_torah_2` | yes, rev 1 |
| Torah reading 3 | `319439b3-3e2f-47e4-a2b0-36645fb9239c` | `slot_torah_3` | yes, rev 1 |
| Torah reading 4 | `53240623-4182-4a65-bd01-ceaebc951f17` | `slot_torah_4` | yes, rev 1 |
| Torah reading 5 | `09651fcc-3ba7-438f-bd9b-b77e8095ff84` | `slot_torah_5` | yes, rev 1 |
| Torah reading 6 | `f976ce13-8388-413d-bb8d-8b67906fc36d` | `slot_torah_6` | yes, rev 1 |
| Torah reading 7 | `42c78ed3-40d2-451b-8401-17a582b0e63f` | `slot_torah_7` | yes, rev 1 |
| Haftarah reading 1 | `d2a51926-4b98-4e73-b1f4-9d016966fd52` | `slot_haftarah_1` | yes, rev 1 |
| Haftarah reading 2 | `8a20aa8a-4515-4b6e-9c1f-27f6a4e76e2f` | `slot_haftarah_2` | yes, rev 1 |
| Haftarah reading 3 | `92e23dc6-f7f4-40b6-8495-0a4605f321a8` | `slot_haftarah_3` | yes, rev 1 |
| Guest name | `bb52a63a-e892-4518-b7c2-a59e8ce730b9` | `slot_guest_name` | yes, rev 1 |
| Remember Them 1 | `35aba7f2-eba6-4373-80d7-513713192b72` | `slot_remember_1` | yes, rev 1 |
| Remember Them 2 | `4e67f479-357f-46d4-aab0-84bd0f6ce7de` | `slot_remember_2` | yes, rev 1 |
| Remember Them 3 | `16533b7f-017a-417a-a676-b457f53d8ea6` | `slot_remember_3` | yes, rev 1 |

The four drafts of 16 September became Student name, Student names (two lines), Torah
reading 1 and Haftarah reading 1, as the handoff planned. The other twelve were created the
same way — a `custom` lower third on the Barechu template.

**All sixteen are published, at revision 1.** Getting there was the hard part, and the
reason is worth recording because it will happen to the next person.

Every publish in this system requires a fit check measured by a real browser on the server,
and that stage gives out: `stage_unavailable` — *"The server could not open a browser to
check this graphic."*

The pattern, from a day of it: it serves about five or six fit checks in a row and then
refuses. Waiting does not reliably clear it — twenty minutes of spaced retries did nothing,
and so did a further fifteen. What does clear it is a deployment, and what also works is
simply **retrying the same preview immediately**: several checks passed on the second or
third attempt seconds after failing.

The refusal reason matters, and it is in the response. `lib/server-fit.ts` reports
`browser_unavailable` when Chromium never launched, `stage_unavailable` when Chromium
launched but `/author/fit-stage` never answered, and `deadline_exceeded` at the 25-second
wall. Today's failures were **`stage_unavailable` and `deadline_exceeded`, not
`browser_unavailable`** — so Chromium starts fine and the page it loads is the problem.
Fetched from outside, `/author/fit-stage` answers 200 in 0.1–0.2 s every time, so it is not
the route. That leaves the function's own network path to its public origin, or the stage's
client JavaScript not reaching `__measureCue` inside a warm reused instance.

Nothing was ever wrong with the drafts: the sixteen are identical in shape, and once the
stage was answering they passed first time, every time.

**If it happens again**, the way out that does not depend on the server is the web fit check:
`/author/fit-check?draft=<id>` measures in the person's own browser, and `review_draft` from
a web session takes that measurement rather than the server's. The server stage is only the
MCP path's substitute for a person.

Worth knowing about the shape of the system either way: a slot with no published graphic is
simply not a slot. It is absent from the catalog's slot index, the module declares no
variable and generates no preset for it, and "This service" greys the field and names it.
That is why the half-finished state was harmless rather than broken, and it is how the
sixteen were able to land one at a time.

**One thing to decide.** All sixteen carry a review receipt whose
`humanApproved` is true and whose measurement is the server's own attested fit check — the
D18 path, which is what an MCP actor has always used and which ignores any claimed
measurement. No person looked at those six renders. They are placeholder text on an approved
layout, so this is within what D18 means, but if the intent is that a human eye sees every
first publish, they want a look before a service.

---

## 4. The API shape actually built

As specified, with one addition:

```
GET /api/catalog?include=slots
→ { version, cues, slots: [ { cueId, key, text }, … ] }
```

Same `X-CRC-Catalog-Version` header, same `Cache-Control: no-store`, and the default
response — no query string — is unchanged, byte for byte. There is a test that asserts the
markers are never written back onto the catalog the default response returns.

**▲ The addition, and why.** Section 5(a) asked for an optional `category` on the catalog
entry, and section 2 asked for an optional `slot` on it. Both would have moved the default
response that `/output`, the console and Companion each validate field by field, which
section 2 forbids. So both fields ride on the **envelope's copies** of the cues rather than
on the cues themselves: `?include=slots` returns each cue with `category`, and a slot cue
additionally with `slot: {key}`. The module gets exactly the shape the handoff described and
the bare array never moves. `?include=liturgy,slots` is still the natural extension; only
`slots` was built.

The module reads either shape back: the envelope, or the bare array from a deployment that
does not have the change. There is a test for that, and it asserts the module starts, works,
and simply has no slot variables.

---

## 5. What could not be verified, explicitly

**`lib/liturgy-index.ts` carries no category, so the category is a new field.** It is a
derived index of liturgical *position* — `unitId`, `momentId`, `book`, `folio` — computed
from a cue's pinned source ids against the committed siddur library. There is nothing in it
that says "sung liturgy" or "alternates".

So the category is computed in `lib/slot-catalog.ts`, and **only two of the six categories
can honestly be derived from what the library records today**: a slot or a `names:` panel is
a name card, and everything else is core liturgy. The full six-colour table exists in the
module, an unknown category reads as core liturgy rather than being refused, and adding the
other four later is a change to one function — but today Michael's presets will be yellow
for the slots and blue for everything else, not six colours. **Nothing anywhere in this repo
distinguishes sung liturgy, readings, alternates or section markers.** If those matter, they
need a source of truth that does not exist yet, and that is a decision for Daniel.

**The publish path did let a slot Save be one click, but it needed a real change.** The gate
is enforced in the repository, not the caller: `validatePublishPreview` runs inside both
`MemoryAuthoringRepository.publish` and `PgAuthoringRepository.publish`, so no caller can
route around it. It required an exact-version preview carrying a review receipt with a
browser measurement showing no overflow and fonts loaded.

A slot Save now writes a receipt carrying `standingApproval: "slot:<key>"` **instead of** a
measurement, and the gate accepts that and only that in place of one. The receipt does not
claim a measurement nobody took; `browserMeasurement` is simply absent, and there is a test
asserting so, and another asserting an ordinary graphic still cannot publish without a
browser that looked at it. This is a widening of a load-bearing safety gate and it is worth
a second pair of eyes.

**The renderer draws nothing for an empty slot, and I did not have to fall back to
`hidden`.** Three things were in the way and all three were narrow to fix: `parseContent`
refused an empty `custom` text (it accepts one now, and only in that mode); `buildCue` would
have written an empty `textMain` (it now omits the layer entirely); and `previewValidation`
called a title-only graphic "no text yet" (it takes an `allowEmptyText` flag that only the
slot path passes). `textParts` in the renderer already skips a falsy channel, so a slot with
no text draws its title bar and nothing else. **▲** Strictly, "shows nothing" means the
title bar still draws — *Torah Reading* with no reader under it, or the CRC name card with
no name. The graphic's title is a required field and is not something a person types weekly,
so there is no way to make the card literally empty without a second layout. It is never
last week's name and never *Reader Name*, which is what the ruling was protecting.

**`--slots` already existed in the converter.** The session that left the converter in this
worktree had already added it, along with the `bank_current_step` drop, the toggle collapse
and the side-panel drop. Its diff is now committed.

**Two things that were not in the handoff and are worth knowing:**

- **The converter's CLI never ran on Windows.** Its entry guard was
  `import.meta.url === \`file://${process.argv[1]}\``, which is never true when the path is
  `C:\...`. It exited 0 and wrote nothing at all, silently. Fixed to compare resolved file
  URLs. Anything anyone believed they had run from a Windows shell, they had not.
- **Installing the upgrade-check tooling wrote five packages into the app's production
  dependencies** and bumped `zod`, because that folder had no `package.json` of its own and
  npm walked up. Reverted, and the folder has one now.

**The fit check does not fail on a long name, so the length guard is a legibility rule, not
an overflow rule.** I measured this: a Torah slate with a 39-character reader and a
38-character portion passes, and so does one with 78 and 85 characters, because
`fitBottomText` shrinks the text until it fits. The guard is **two lines, forty characters
each**, and that number is my judgement about what stays readable on a projector, not
something measured. The deck itself only shows the first 24 characters of a slot. If Daniel
wants a different number it is one constant in `lib/slots.ts`.

---

## 6. What I decided that the handoff left open

- **The middle dot.** A reading slot has two fields, *Reader* and *Portion and verses*, and
  the second is typed whole — the placeholder shows `Vayera · 18:1–33`, so the dot is a
  convention the person follows rather than something the page inserts. Splitting it into
  three fields would have made a weekly form longer for no gain.
- **Remember Them is one line.** The handoff did not say; a memorial card is a name.
- **Blank fields collapse rather than publish an empty line.** A two-line card with only the
  second name filled in reads as one line, not as a gap above a name.
- **Service type ids** are `bnei-mitzvah`, `shabbat`, `funeral`. Adding Friday night or High
  Holy Days is a row in `SERVICE_TYPES` and rows in `SLOTS`; there is a test that adding a
  type is a data change.
- **Slot presets are additional**, not a replacement: a slot cue gets both the ordinary
  per-cue preset and a slot preset carrying its variable. The slot preset's id is
  `slot_<cueId>`, beside the established `show_<cueId>`.
- **The two clear buttons stay green.** The handoff offered to ask; the reasoning in it is
  right — they mean "the output is confirmed clear", and red there would say the opposite of
  what red says everywhere else. HELP.md names the exception. **If Daniel would rather they
  were neutral grey, it is two lines.**
- **"This service" is a fourth navigation pill**, which the 2026-09-14 layout pass had
  deliberately cut to three. Filling in the week's names is a task on the way to a service,
  not authoring, so nesting it under Library would have buried it; it is an `author` pill,
  so an Editor sees it and an Operator does not.
- **`GET /api/slots` is its own route** rather than another `operation` on `/api/authoring`,
  because the page needs one small answer and not the whole catalog. The Save goes through
  `authoringOperation` like every other publish, so it gets the live-library sync for free.

---

## 7. The converter run

Run against Michael's 16 September export with the real `slots.json`:

- **832 of 908** graphics buttons moved to Overlays, up from 803. **76** left on Singular,
  down from 105 — the High Holy Day name and honouree cards, Seder, Who By Fire. The
  per-service buttons are all across.
- The report's "slot buttons waiting for a second run" section is **empty**: every slot
  composition in his export maps to a slot cue id.
- `verify-deck.py`: **24 checks, 0 failed.** It learned `--slots` (a slot cue id is not in
  the catalog map and used to read as unpublished) and takes the module version as a flag
  rather than a literal.
- `upgrade-check.mjs`, running **Companion 5.0.3's own import upgrade chain**: all 842
  converter-written buttons come out as proper layered buttons, the 857 untouched ones come
  out unchanged, and **every converted button lands with `canModifyStyleInApis: true`** —
  "Allow style changes" ON. That is the whole reason the converter emits the old flat button
  shape, and it is now checked rather than asserted. Section 8's check 2 is therefore already
  answered in code; confirming it on Michael's machine is a formality.
- A converted student-name button reads `Student\n$(Overlays:slot_student_name)`, fires a
  single-step `toggle_cue`, carries `requested`/`rendered`/`disconnected` and no
  `bank_current_step`. The connection is labelled **Overlays**, module version 1.6.0, and it
  joins the existing Overlays connection collection. The three Singular connections are
  still present and enabled.
- Cameras, X32, vMix, OBS, Reaper, VLC, triggers, custom variables, surfaces and the image
  library: 1078 controls carried through unchanged, byte for byte, which `verify-deck.py`
  checks.
- The file still declares `version: 12` and the generated buttons are still old-shape.

The deliverable is
`work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16.overlays.companionconfig`,
with `MICHAEL-IMPORT-SHEET.md` beside it, updated for the new numbers and for what the slot
buttons now do.

`upgrade-check.mjs` needs a clone of `bitfocus/companion` at `v5.0.3` and an esbuild bundle
of its upgrade scripts. Both stay out of the repo; `tools/build.mjs` builds the bundle and
`tools/package.json` keeps its dependencies out of the app's.

---

## 8. Still owed, and by whom

**Daniel / the server:**

1. **The fit-check stage gives out after about five checks in a row.** No slot is waiting on
   it any more, but this is the gate on *every* publish in the system, for every graphic — an
   authoring session that publishes half a dozen cues in a sitting will hit the same wall, and
   what it shows a person is "open Fit check and review it yourself", which reads like their
   problem rather than the server's. The refusals are `stage_unavailable` and
   `deadline_exceeded`, never `browser_unavailable`, so Chromium is launching and the stage
   page it loads is what fails; that same page answers 200 in 0.1 s from outside. An immediate
   retry of the same preview often gets through, and a deployment always clears it. Worth a
   look at what a warm, reused Fluid instance does to the function's request for its own
   public origin.
2. The four checks of the handoff's section 8, with Michael. Check 2 is already answered in
   code (see §7) but is cheap to confirm.
3. Whether the six already-published slots want a human eye (§3).
4. Whether the category scheme is worth a source of truth for the other four colours (§5).
5. Whether the clear buttons stay green (§6).

**Whoever picks this up next:**

- **Blank all sixteen through "This service"** before the converted deck is imported. Every
  slot is published carrying placeholder text — *Reader Name*, *Guest Name*, *Name* —
  because the fit check needs something to measure and the MCP surface refuses an empty
  string. Open `/this-service`, clear the fields for each of the three service types, and
  press Save: one click per type. It is also the first real exercise of the `save_slots` path
  against Postgres, so it doubles as the test.
- Nothing is on air in the meantime — no button points at a slot until the converted file is
  imported — but the deck should not be imported before the blanking.
