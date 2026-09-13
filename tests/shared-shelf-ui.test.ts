import assert from "node:assert/strict";
import test from "node:test";
import {
  compareFlags,
  compareRows,
  compareSummary,
  expectedCueHashes,
  groupSharedEntries,
  localDraftsForCard,
  matchesShelfQuery,
  newestLocalDraft,
  partitionShelf,
  shelfBadgeCount,
  wholePrayerLabel,
  type ComparableCue,
  type SharedShelfEntry,
  type SharedShelfState,
} from "../app/author/shared-shelf-model.ts";

const entry = (id: string, state: SharedShelfState, extra: Partial<SharedShelfEntry> = {}): SharedShelfEntry => ({
  id, name: `Graphic ${id}`, title: `Title ${id}`, layout: "bottom", sourceIds: [], cueHash: `hash-${id}`, state, local: { drafts: [] }, ...extra,
});
const slide = (id: string, index: number, state: SharedShelfState, extra: Partial<SharedShelfEntry> = {}) =>
  entry(id, state, { set: { id: "set-1", index, count: 3, title: "Mi Chamocha" }, ...extra });

test("a whole prayer becomes one card, its slides in set order", () => {
  const cards = groupSharedEntries([slide("c", 2, "new"), entry("solo", "new"), slide("a", 0, "new"), slide("b", 1, "new")]);
  assert.equal(cards.length, 2);
  const set = cards[0];
  assert.equal(set.kind, "set");
  assert.equal(set.title, "Mi Chamocha");
  assert.deepEqual(set.members.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(set.lead.id, "a");
  assert.equal(wholePrayerLabel(set), "Whole prayer · 3 slides");
  assert.equal(cards[1].kind, "single");
  assert.equal(cards[1].title, "Graphic solo");
});

test("one changed slide makes the whole prayer an update", () => {
  const [card] = groupSharedEntries([slide("a", 0, "customized"), slide("b", 1, "updated"), slide("c", 2, "customized")]);
  assert.equal(card.state, "updated");
  const [fresh] = groupSharedEntries([slide("a", 0, "customized"), slide("b", 1, "new")]);
  assert.equal(fresh.state, "new");
});

test("sections come out as New, Updated, In your library and the badge counts only the first two", () => {
  const cards = groupSharedEntries([entry("1", "new"), entry("2", "updated"), entry("3", "customized"), entry("4", "new")]);
  const sections = partitionShelf(cards);
  assert.deepEqual(sections.fresh.map((card) => card.key), ["1", "4"]);
  assert.deepEqual(sections.updated.map((card) => card.key), ["2"]);
  assert.deepEqual(sections.mine.map((card) => card.key), ["3"]);
  assert.equal(shelfBadgeCount(cards), 3);
});

test("a customize of a whole prayer pins every slide hash", () => {
  const [card] = groupSharedEntries([slide("a", 0, "new"), slide("b", 1, "new")]);
  assert.deepEqual(expectedCueHashes(card), { a: "hash-a", b: "hash-b" });
});

test("the comparison runs against the newest local draft, listed without duplicates", () => {
  const drafts = [{ id: "d1", name: "Ours", activeRevision: 2, cueHash: "hash-a" }, { id: "d2", name: "Ours (2)", activeRevision: null, cueHash: "hash-a" }];
  const [card] = groupSharedEntries([slide("a", 0, "updated", { local: { drafts } }), slide("b", 1, "customized", { local: { drafts: [drafts[0]] } })]);
  assert.deepEqual(localDraftsForCard(card).map((item) => item.id), ["d1", "d2"]);
  assert.equal(newestLocalDraft(card)?.id, "d2");
  assert.equal(newestLocalDraft(groupSharedEntries([entry("x", "new")])[0]), null);
});

test("the shelf search looks at the card title and every slide", () => {
  const [card] = groupSharedEntries([slide("a", 0, "new"), slide("b", 1, "new")]);
  assert.equal(matchesShelfQuery(card, "  "), true);
  assert.equal(matchesShelfQuery(card, "chamocha"), true);
  assert.equal(matchesShelfQuery(card, "Title b"), true);
  assert.equal(matchesShelfQuery(card, "barchu"), false);
});

const before: ComparableCue = { layout: "left", texts: { textTitle: "Barchu", textMainEng: "Bar’chu et" }, contentRows: [{ he: "בָּרְכוּ", tr: "Bar’chu", en: "Bless" }] };
const after: ComparableCue = { layout: "left", texts: { textTitle: "Barchu", textMainEng: "Barechu et" }, contentRows: [{ he: "בָּרְכוּ", tr: "Barechu", en: "Bless" }] };

test("compare rows mark only the lines that moved and skip lines empty on both sides", () => {
  const rows = compareRows(after, before);
  assert.deepEqual(rows.map((row) => row.label), ["Title", "Transliteration", "Line 1 · Hebrew", "Line 1 · Transliteration", "Line 1 · Translation"]);
  assert.deepEqual(rows.filter((row) => row.changed).map((row) => row.label), ["Transliteration", "Line 1 · Transliteration"]);
  assert.equal(rows[0].before, "Barchu");
});

test("without a before, every row carries CRC's current text and nothing is marked changed", () => {
  const rows = compareRows(after);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.before === "" && !row.changed));
  assert.equal(compareSummary({ wording: true, layout: false, presentation: false }, false), "Comparison unavailable for graphics customized before this update");
});

test("a republish with no wording change says so and still lists the other flags", () => {
  assert.equal(compareSummary({ wording: false, layout: true, presentation: false }, true), "No wording changes — CRC republished it");
  assert.deepEqual(compareFlags({ wording: false, layout: true, presentation: false }), [
    { key: "wording", label: "Wording", changed: false },
    { key: "layout", label: "Layout", changed: true },
    { key: "presentation", label: "Presentation", changed: false },
  ]);
});

test("a custom graphic's single text block is labelled Text, never by its storage key", () => {
  const rows = compareRows({ layout: "bottom", texts: { textTitle: "Check", textMain: "New line" } }, { layout: "bottom", texts: { textTitle: "Check", textMain: "Old line" } });
  assert.deepEqual(rows.map((row) => [row.label, row.changed]), [["Title", false], ["Text", true]]);
});
