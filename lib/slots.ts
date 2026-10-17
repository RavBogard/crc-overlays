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
  | 'reading'
  /**
   * The student's name plate (Oct 16): heading, name, Hebrew name and its transliteration, written
   * into the graphic the slot uses the way the Name plate form composes them. The graphic keeps
   * its own design; publishing goes through the fit check.
   */
  | 'nameplate'
  /**
   * A reading (Oct 16): the verses become the graphic's title and the Hebrew book name its Hebrew
   * title. The reading's own text stays as it was authored. Fit-checked like `nameplate`.
   */
  | 'verses';

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
  key, name, title, kind: 'verses',
  labels: ['Verses', 'Hebrew book'],
  placeholders: title.startsWith('Haftarah') ? ['Isaiah 42:5–21', 'יְשַׁעְיָהוּ'] : ['Genesis 1:1–13', 'בְּרֵאשִׁית'],
});

export const SLOTS: readonly SlotDefinition[] = [
  { key: 'student_name', name: 'Student name', title: 'Central Reform Congregation', kind: 'nameplate', labels: ['Heading', 'Name', 'Hebrew name', 'Hebrew name in English letters'], placeholders: ['Bat Mitzvah of', 'Eliana Levine', 'שָׁרוֹן', 'Sharon'] },
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
  { id: 'bnei-mitzvah', name: "B'nei mitzvah", slotKeys: ['student_name', 'torah_1', 'torah_2', 'torah_3', 'torah_4', 'torah_5', 'torah_6', 'torah_7', 'haftarah_1', 'haftarah_2', 'haftarah_3'] },
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

/** A slot that writes its fields into a graphic designed in the Library, fit-checked on publish. */
export function isDesignedSlot(definition: SlotDefinition): boolean {
  return definition.kind === 'nameplate' || definition.kind === 'verses';
}
/** A designed slot's fields: a heading or verses line is longer than a name, so it gets more room. */
export const DESIGNED_FIELD_MAX = 60;

/** Problems an editor can act on, in their own words. An empty slot is never a problem. */
export function slotTextProblems(definition: SlotDefinition, text: string): string[] {
  if (!text) return [];
  if (isDesignedSlot(definition)) {
    const fields = slotFieldsFromText(definition, text);
    const problems: string[] = [];
    if (text.split('\n').length > definition.labels.length) problems.push(`${definition.name} has more fields than its form.`);
    fields.forEach((value, index) => {
      if (value.length > DESIGNED_FIELD_MAX) problems.push(`${definition.name}: ${definition.labels[index]} is ${value.length} characters; shorten it to ${DESIGNED_FIELD_MAX} or fewer.`);
    });
    // The field a reader would miss: a name plate needs a name, a reading needs its verses.
    const primary = definition.kind === 'nameplate' ? 1 : 0;
    if (!fields[primary]) problems.push(`${definition.name}: type the ${definition.labels[primary].toLowerCase()}, or clear every field to leave the graphic as it is.`);
    return problems;
  }
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
  // A designed slot's fields keep their places - the third line is always the Hebrew name -
  // and all of them blank is the empty string, which leaves the graphic as it is.
  if (isDesignedSlot(definition)) {
    const values = fieldCount(definition).map((_, index) => (fields[index] ?? '').replace(/\s+/g, ' ').trim());
    return values.some(Boolean) ? values.join('\n') : '';
  }
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
  return new Array(definition.kind === 'line' ? 1 : definition.kind === 'nameplate' ? 4 : 2).fill(undefined);
}

/** The words of a graphic, as a designed slot reads and writes them. */
export type SlotGraphicWords = { title: string; accentTitle?: string | null; text: string };

const HEBREW = /[֐-׿]/;
/**
 * The slot's fields as the graphic it fills says them now, so the page opens on what is on
 * screen. A name plate's text is "Name" over "Hebrew | transliteration" (lib/custom-templates.ts).
 */
export function slotFieldsFromGraphic(definition: SlotDefinition, words: SlotGraphicWords): string[] {
  if (definition.kind === 'verses') return [words.title, words.accentTitle ?? ''];
  if (definition.kind === 'nameplate') {
    const [name = '', detail = ''] = words.text.split('\n');
    const parts = detail.split(' | ').map(part => part.trim()).filter(Boolean);
    const hebrew = parts.find(part => HEBREW.test(part)) ?? '';
    const latin = parts.find(part => part !== hebrew) ?? '';
    return [words.title, name.trim(), hebrew, latin];
  }
  return slotFieldsFromText(definition, words.text);
}

/** The line a Stream Deck key shows for a slot: the name, the verses, or the plain slot's text. */
export function slotSummary(definition: SlotDefinition, words: SlotGraphicWords): string {
  if (!isDesignedSlot(definition)) return words.text;
  const fields = slotFieldsFromGraphic(definition, words);
  return definition.kind === 'nameplate' ? fields[1] : fields[0];
}

/**
 * The Hebrew name of the book a reading comes from, from its verses: "Genesis 1:1–13" is
 * בְּרֵאשִׁית. Torah books by English or transliterated name, and the prophets a Haftarah is read
 * from. Undefined when the verses do not start with a book this knows.
 */
const BOOKS: ReadonlyArray<[RegExp, string]> = [
  [/^(genesis|gen\.?|bereshit|bereishit|b'reishit|breishit)\b/i, 'בְּרֵאשִׁית'],
  [/^(exodus|exod?\.?|shemot|sh'mot|shmot)\b/i, 'שְׁמוֹת'],
  [/^(leviticus|lev\.?|vayikra|vayyikra)\b/i, 'וַיִּקְרָא'],
  [/^(numbers|num\.?|bamidbar|b'midbar|bemidbar)\b/i, 'בְּמִדְבַּר'],
  [/^(deuteronomy|deut?\.?|devarim|d'varim)\b/i, 'דְּבָרִים'],
  [/^(joshua|josh\.?)\b/i, 'יְהוֹשֻׁעַ'],
  [/^(judges|judg\.?)\b/i, 'שׁוֹפְטִים'],
  [/^(1|i|first)\s*(samuel|sam\.?)\b/i, 'שְׁמוּאֵל א׳'],
  [/^(2|ii|second)\s*(samuel|sam\.?)\b/i, 'שְׁמוּאֵל ב׳'],
  [/^(1|i|first)\s*(kings|kgs\.?)\b/i, 'מְלָכִים א׳'],
  [/^(2|ii|second)\s*(kings|kgs\.?)\b/i, 'מְלָכִים ב׳'],
  [/^(isaiah|isa\.?)\b/i, 'יְשַׁעְיָהוּ'],
  [/^(jeremiah|jer\.?)\b/i, 'יִרְמְיָהוּ'],
  [/^(ezekiel|ezek\.?)\b/i, 'יְחֶזְקֵאל'],
  [/^(hosea|hos\.?)\b/i, 'הוֹשֵׁעַ'],
  [/^joel\b/i, 'יוֹאֵל'],
  [/^amos\b/i, 'עָמוֹס'],
  [/^(obadiah|obad\.?)\b/i, 'עֹבַדְיָה'],
  [/^jonah\b/i, 'יוֹנָה'],
  [/^(micah|mic\.?)\b/i, 'מִיכָה'],
  [/^(nahum|nah\.?)\b/i, 'נַחוּם'],
  [/^(habakkuk|hab\.?)\b/i, 'חֲבַקּוּק'],
  [/^(zephaniah|zeph\.?)\b/i, 'צְפַנְיָה'],
  [/^(haggai|hag\.?)\b/i, 'חַגַּי'],
  [/^(zechariah|zech\.?)\b/i, 'זְכַרְיָה'],
  [/^(malachi|mal\.?)\b/i, 'מַלְאָכִי'],
];
export function hebrewBookFor(verses: string): string | undefined {
  const text = verses.trim();
  return BOOKS.find(([pattern]) => pattern.test(text))?.[1];
}
