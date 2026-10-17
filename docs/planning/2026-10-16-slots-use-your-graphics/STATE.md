# Slots that fill your own graphics

Michael (Oct 16): the b'nei mitzvah "This service" flow did not work. The student name plate and Torah readings 1–3 were rebuilt by hand. He wants it to work as intended.

## What was wrong

- A slot was bound in code (content/slot-cues.json) to one seed graphic: a lower third with a fixed title, holding up to 2 lines of 40 characters. When better graphics were designed in the Library (Student Name Plate as a name plate, Torah Reading 1–3 as left panels titled by verses with the Hebrew book name), This service kept filling the old seeds, now renamed "XTorah reading…".
- The slot could not set the graphic's title or Hebrew title, which is exactly what changes each week on a reading.

## Decisions (Michael, Oct 16)

- **Binding:** each slot can be pointed at any published Library graphic from This service. The choice is stored per workspace as a build key `draft` → `slot:<key>` (db/build-keys.sql, already live, so no migration). It overrides the committed register. The graphic keeps its own design; This service writes only the slot's fields into it.
- **Student name** (`student_name`, kind `nameplate`): Heading, Name, Hebrew name, Hebrew name in English letters. Composed like the Name plate form: heading → title, then "Name" over "Hebrew | transliteration".
- **Torah and Haftarah readings** (`torah_1..7`, `haftarah_1..3`, kind `verses`): Verses → title, plus the Hebrew **book** name → Hebrew title. The book is filled automatically from the verses (Genesis → בְּרֵאשִׁית, Haftarah books too) and is editable. The reading text stays as authored in the Library.
- **Fit:** these slots publish through the same server fit check as Publish (ship_draft). A slot whose words do not fit is not published: its graphic is put back and the page says why. The others still save. Slots of the old kinds (line, two lines) keep their standing approval.
- **Empty slots:** an empty designed slot leaves its graphic as it is. An empty plain slot still draws nothing, as before.
- **Companion:** buttons fire a specific graphic, so after re-pointing a slot, the saved deck's buttons are re-pointed (bind_cue) and the booth re-imports. This is not automatic in code for now.

## Work

lib/slots.ts (kinds, fields ↔ graphic, Hebrew books), lib/slot-bindings.ts (resolved register, bind), lib/authoring.ts (list_slots, save_slots, bind_slot), lib/slot-catalog.ts (summary text per kind), app/api/slots, app/api/catalog, app/this-service (fields, auto Hebrew book, graphic picker, refusals).

## Evidence

- tests/slots-designed.test.ts covers binding (wins over committed, refusals), list_slots reading fields back from the graphic, Save writing a name plate and a reading into their own graphics while keeping the design and the reading text, unchanged and empty slots, and fit refusal that puts the graphic back while the other slot still saves. tests/slots.test.ts covers fields, summaries and Hebrew books; the publishing tests moved to plain slots (Remember Them).
- Rehearsal in headless Chrome: a name plate and a Torah reading are published; on This service, "Fills" chooses each; the name plate's fields load from it; "Exodus 12:1-20" fills שְׁמוֹת; Save publishes both through the server fit check ("2 graphics are on the new text"); the name plate keeps center alignment and the reading keeps its paragraph; `/api/catalog?include=slots` reports "Gavin Stein" and "Exodus 12:1-20" for the deck.
- tsc, npm test, lint, build.

## Open

- After release: bind student_name → Student Name Plate and torah_1..3 → Torah Reading 1–3 in CRC, re-point the deck keys, and retire the "X…" seeds if Michael agrees.
