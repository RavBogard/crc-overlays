/**
 * Slots — the graphics whose words change every week and whose identity never does.
 *
 * Today a name lives inside a graphic, so changing the name means re-authoring the graphic,
 * and the Stream Deck button that fires it gets relabelled by hand. Page 15 of the booth
 * configuration literally carries a button reading "Student Name Noa" beside one reading
 * "Student Name Ezra". A slot retires that: Michael's button points at the slot's cue id
 * forever, somebody fills the slot's text on one console page before the service, and the
 * graphic is different with no button ever touched.
 *
 * A slot is an ordinary published cue with an ordinary UUID. There is no `slot:` id
 * namespace, because a published cue already has the lifecycle a permanently-targeted
 * button needs — a stable id, revisions, rollback, and a place in `GET /api/catalog` —
 * while the `names:` namespace has the wrong one: those entries vanish with the service
 * that made them.
 *
 * The slot set is data, not sixteen hard-coded pages of form fields, because the owner
 * wants service *types*: Friday night, Saturday morning, b'nei mitzvah, High Holy Days,
 * funeral. Adding one is a change to the two tables below.
 *
 * This module is pure and client-safe: the "This service" page imports it directly.
 */

/** How one slot is typed on the page, and how those fields become the graphic's text. */
export type SlotFieldKind =
  /** One line: a name. */
  | 'line'
  /** Two lines: two names on one card. */
  | 'lines2'
  /** Two fields — the reader, then the portion — becoming the two lines of a reading slate. */
  | 'reading';

export type SlotDefinition = {
  /** Stable, never reused. It becomes the Companion variable `slot_<key>`. */
  key: string;
  /** The published cue's name, which is what shows in Companion's dropdowns and presets. */
  name: string;
  /** The graphic's title bar. Fixed; a person never types it. */
  title: string;
  kind: SlotFieldKind;
  /** What the field(s) are called on the page. */
  labels: string[];
  /** A worked example, shown as the field's placeholder. */
  placeholders: string[];
};

export type ServiceTypeDefinition = { id: string; name: string; slotKeys: readonly string[] };

/** The separator the seed drafts use between a portion and its chapter:verse. U+00B7. */
export const PORTION_SEPARATOR = '·';

const reading = (key: string, name: string, title: string): SlotDefinition => ({
  key, name, title, kind: 'reading',
  labels: ['Reader', 'Portion and verses'],
  placeholders: ['Noa Bogard', `Vayera ${PORTION_SEPARATOR} 18:1–33`],
});

export const SLOTS: readonly SlotDefinition[] = [
  { key: 'student_name', name: 'Student name', title: 'Central Reform Congregation', kind: 'line', labels: ['Student'], placeholders: ['Noa Bogard'] },
  { key: 'student_names', name: 'Student names (two lines)', title: 'Central Reform Congregation', kind: 'lines2', labels: ['First student', 'Second student'], placeholders: ['Noa Bogard', 'Ezra Bogard'] },
  reading('torah_1', 'Torah reading 1', 'Torah Reading'),
  reading('torah_2', 'Torah reading 2', 'Torah Reading'),
  reading('torah_3', 'Torah reading 3', 'Torah Reading'),
  reading('torah_4', 'Torah reading 4', 'Torah Reading'),
  reading('torah_5', 'Torah reading 5', 'Torah Reading'),
  reading('torah_6', 'Torah reading 6', 'Torah Reading'),
  reading('torah_7', 'Torah reading 7', 'Torah Reading'),
  reading('haftarah_1', 'Haftarah reading 1', 'Haftarah Reading'),
  reading('haftarah_2', 'Haftarah reading 2', 'Haftarah Reading'),
  reading('haftarah_3', 'Haftarah reading 3', 'Haftarah Reading'),
  { key: 'guest_name', name: 'Guest name', title: 'Central Reform Congregation', kind: 'line', labels: ['Guest'], placeholders: ['Rabbi Susan Talve'] },
  { key: 'remember_1', name: 'Remember Them 1', title: 'Remember Them', kind: 'line', labels: ['Name'], placeholders: ['Miriam Cohen'] },
  { key: 'remember_2', name: 'Remember Them 2', title: 'Remember Them', kind: 'line', labels: ['Name'], placeholders: ['Miriam Cohen'] },
  { key: 'remember_3', name: 'Remember Them 3', title: 'Remember Them', kind: 'line', labels: ['Name'], placeholders: ['Miriam Cohen'] },
];

export const SERVICE_TYPES: readonly ServiceTypeDefinition[] = [
  { id: 'bnei-mitzvah', name: "B'nei mitzvah", slotKeys: ['student_name', 'student_names', 'torah_1', 'torah_2', 'torah_3', 'torah_4', 'torah_5', 'torah_6', 'torah_7', 'haftarah_1', 'haftarah_2', 'haftarah_3'] },
  { id: 'shabbat', name: 'Shabbat', slotKeys: ['guest_name'] },
  { id: 'funeral', name: 'Funeral / Yizkor', slotKeys: ['remember_1', 'remember_2', 'remember_3'] },
];

const byKey = new Map(SLOTS.map(slot => [slot.key, slot]));
export function slotDefinition(key: string): SlotDefinition | undefined { return byKey.get(key); }
export function slotsForServiceType(id: string): SlotDefinition[] {
  return (SERVICE_TYPES.find(type => type.id === id)?.slotKeys ?? []).map(key => byKey.get(key)!).filter(Boolean);
}

/** Every slot cue carries this category, which is what colours its Companion preset yellow. */
export const SLOT_CATEGORY = 'names';

/**
 * The cheap guard that stands in for the per-edit browser review. The slot's layout is
 * fixed and was approved once; only short plain text changes, so what is left to check is
 * that the words fit the bar. Two lines, forty characters each: the deck itself only shows
 * the first twenty-four, and a name longer than forty overflows the lower third.
 */
export const SLOT_LINE_MAX = 40;
export const SLOT_LINES_MAX = 2;

/** Problems an editor can act on, in their own words. An empty slot is never a problem. */
export function slotTextProblems(definition: SlotDefinition, text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const problems: string[] = [];
  if (lines.length > SLOT_LINES_MAX) problems.push(`${definition.name} has ${lines.length} lines; this graphic holds ${SLOT_LINES_MAX}.`);
  lines.forEach((line, index) => {
    if (line.length > SLOT_LINE_MAX) problems.push(`${definition.name}${lines.length > 1 ? ` line ${index + 1}` : ''} is ${line.length} characters; shorten it to ${SLOT_LINE_MAX} or fewer so it fits on screen.`);
  });
  return problems;
}

/** What one slot's fields hold on the page. Missing entries are empty. */
export type SlotFields = readonly string[];

/**
 * The fields of a slot joined into the graphic's text. A slot with nothing typed in it is
 * the empty string, which publishes a graphic that draws no text at all — never last
 * week's name, and never the placeholder "Reader Name".
 */
export function slotTextFromFields(definition: SlotDefinition, fields: SlotFields): string {
  // A blank field is dropped rather than published as an empty line: a card with only a
  // second name typed in should read as one line, not as a gap above it.
  return fieldCount(definition)
    .map((_, index) => (fields[index] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** The reverse: the stored text split back into the page's fields. */
export function slotFieldsFromText(definition: SlotDefinition, text: string): string[] {
  const lines = text.split('\n');
  return fieldCount(definition).map((_, index) => lines[index] ?? '');
}

function fieldCount(definition: SlotDefinition): undefined[] {
  return new Array(definition.kind === 'line' ? 1 : 2).fill(undefined);
}
