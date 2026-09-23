import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksForMode,
  auditDraftSet,
  draftHasUnpublishedWork,
  draftReadableText,
  draftThumbnailCopy,
  editableFromForm,
  emptyForm,
  formFromDraft,
  formReady,
  libraryEmptyMessage,
  moveDraftId,
  parseRecovery,
  routeForDraft,
  selectWholeSource,
  shouldShowPanels,
  sourceDisplayCopy,
  sourceHeadline,
} from "./editor-state.ts";
import type { Source } from "./types.ts";

test("custom content is trimmed and requires an explicit template", () => {
  const form = {
    ...emptyForm,
    name: " Welcome ",
    title: " Shabbat Shalom ",
    templateCueId: "template-1",
    mode: "custom" as const,
    customText: "  Welcome to our community.  ",
  };
  assert.equal(formReady(form), true);
  assert.deepEqual(editableFromForm(form).content, {
    mode: "custom",
    text: "Welcome to our community.",
  });
});

test("a new bilingual form defaults to contiguous language blocks", () => {
  assert.equal(emptyForm.mode, "bilingual");
  assert.equal(emptyForm.arrangement, "blocks");
  const content = editableFromForm({ ...emptyForm, name: "Prayer", title: "Prayer", templateCueId: "template", groups: [{ sourceId: "source", blockIds: ["block"] }] }).content;
  assert.equal(content.mode, "bilingual");
  assert.equal(content.mode === "bilingual" ? content.arrangement : undefined, "blocks");
});

test("a historical bilingual draft with omitted arrangement still loads as together", () => {
  const historical = {
    id: "old", name: "Prayer", title: "Prayer", layout: "left" as const, templateCueId: "template",
    content: { mode: "bilingual" as const, hebrewGroups: [{ sourceId: "source", blockIds: ["block"] }], transliterationGroups: [{ sourceId: "source", blockIds: ["block"] }] },
    presentation: {}, version: 1, activeRevision: null, activeDraftVersion: null, updatedAt: 1,
  };
  assert.equal(formFromDraft(historical).arrangement, "together");
});

test("whole-prayer selection preserves source order", () => {
  assert.deepEqual(selectWholeSource("siddur-1", ["a", "b", "c"]), [
    { sourceId: "siddur-1", blockIds: ["a", "b", "c"] },
  ]);
});

test("whole-prayer slide ordering moves one ID without losing the complete set", () => {
  assert.deepEqual(moveDraftId(["one", "two", "three"], "two", -1), ["two", "one", "three"]);
  assert.deepEqual(moveDraftId(["one", "two", "three"], "one", -1), ["one", "two", "three"]);
});

test("whole-prayer audit detects duplicate, missing, and out-of-source-order passages", () => {
  const source = { id: "source-1", name: "Prayer", section: null, blocks: ["a", "b", "c"].map((id, index) => ({ id, index, kind: "source-en" as const, en: id.toUpperCase(), automatic: true })) };
  const make = (id: string, index: number, blockIds: string[]) => ({ id, name: id, title: "Prayer", layout: "left" as const, templateCueId: "template-1", content: { mode: "source-en" as const, englishGroups: [{ sourceId: source.id, blockIds }] }, presentation: {}, version: 1, activeRevision: null, activeDraftVersion: null, updatedAt: 1, draftSetId: "set-1", setIndex: index, setCount: 2, sourceSnapshots: [source] });
  assert.deepEqual(auditDraftSet([make("one", 1, ["a", "b"]), make("two", 2, ["c"])]), { complete: true, duplicateCount: 0, missingCount: 0, unexpectedCount: 0, sourceOrder: true, selectedCount: 3, expectedCount: 3 });
  const broken = auditDraftSet([make("two", 1, ["c"]), make("one", 2, ["a", "a"])]);
  assert.equal(broken?.complete, false);
  assert.equal(broken?.duplicateCount, 1);
  assert.equal(broken?.missingCount, 1);
  assert.equal(broken?.sourceOrder, false);
});

test("English from the siddur stays distinct from an original English reading", () => {
  const shared = {
    ...emptyForm,
    name: "Mah Tovu in English",
    title: "Mah Tovu",
    templateCueId: "template-1",
    groups: [{ sourceId: "siddur-1", blockIds: ["english-1"] }],
  };
  assert.deepEqual(editableFromForm({ ...shared, mode: "source-en" }).content, {
    mode: "source-en",
    englishGroups: shared.groups,
  });
  assert.deepEqual(editableFromForm({ ...shared, mode: "original-en" }).content, {
    mode: "original-en",
    englishGroups: shared.groups,
  });
});

test("source English includes exact English embedded in a paired source block", () => {
  const source = {
    id: "siddur-1", name: "Seasonal line", section: null,
    blocks: [
      { id: "paired", index: 0, kind: "bilingual", he: "גשם", tr: "geshem", en: "rain", englishRole: "translation", automatic: true },
      { id: "english", index: 1, kind: "source-en", en: "English text", englishRole: "unclassified", automatic: true },
      { id: "original", index: 2, kind: "original-en", en: "Original reading", role: "original" },
    ],
  } satisfies Source;
  assert.deepEqual(blocksForMode(source, "source-en").map((block) => block.id), ["paired", "english"]);
  assert.deepEqual(blocksForMode(source, "original-en").map((block) => block.id), ["original"]);
});

test("library thumbnails use exact draft words without changing source text", () => {
  const draft = {
    id: "draft-1", name: "Mah Tovu", title: "Mah Tovu", layout: "left", templateCueId: "template-1",
    content: { mode: "bilingual", hebrewGroups: [{ sourceId: "source-1", blockIds: ["block-1"] }], transliterationGroups: [{ sourceId: "source-1", blockIds: ["block-1"] }] },
    presentation: {}, version: 1, activeRevision: null, activeDraftVersion: null, updatedAt: 1,
    sourceSnapshots: [{ id: "source-1", name: "Mah Tovu", section: "Morning", blocks: [{ id: "block-1", index: 0, kind: "bilingual", he: "מַה טֹּבוּ", tr: "Mah tovu" }] }],
  } satisfies import("./types.ts").Draft;
  assert.deepEqual(draftThumbnailCopy(draft), { title: "Mah Tovu", accent: undefined, body: "מַה טֹּבוּ" });
  assert.equal(draftReadableText(draft), "מַה טֹּבוּ\nMah tovu");
});

test("local variant editing retains exact source text beside local wording", () => {
  const sourceText = "מַה טֹּבוּ";
  const form = {
    ...emptyForm,
    name: "Our Mah Tovu",
    title: "Mah Tovu",
    templateCueId: "template-1",
    mode: "local-variant" as const,
    groups: [{ sourceId: "source-1", blockIds: ["block-1"] }],
    variantLabel: "Our congregation wording",
    variantBase: { mode: "bilingual" as const, hebrewGroups: [{ sourceId: "source-1", blockIds: ["block-1"] }], transliterationGroups: [{ sourceId: "source-1", blockIds: ["block-1"] }] },
    variantOverrides: [{ sourceId: "source-1", blockId: "block-1", channel: "he" as const, sourceText, localText: "מה טובו" }],
  };
  const content = editableFromForm(form).content;
  assert.equal(content.mode, "local-variant");
  if (content.mode !== "local-variant") return;
  assert.equal(content.overrides[0].sourceText, sourceText);
  assert.equal(content.overrides[0].localText, "מה טובו");
  assert.equal(formReady(form), true);
});

test("recovery parser rejects incomplete browser data", () => {
  assert.equal(parseRecovery('{"savedAt":1}'), null);
  assert.equal(parseRecovery("not json"), null);
});

test("published drafts reveal newer unpublished work", () => {
  const draft = {
    id: "draft-1",
    name: "Test",
    title: "Test",
    layout: "left" as const,
    templateCueId: "template-1",
    content: { mode: "custom" as const, text: "Text" },
    presentation: {},
    version: 3,
    activeRevision: 2,
    activeDraftVersion: 2,
    updatedAt: 1,
  };
  assert.equal(draftHasUnpublishedWork(draft), true);
  assert.equal(draftHasUnpublishedWork({ ...draft, activeDraftVersion: 3 }), false);
});

test("routeForDraft returns the plain author route when no draft is open", () => {
  assert.equal(routeForDraft(null), "/author");
  assert.equal(routeForDraft(undefined), "/author");
  assert.equal(routeForDraft(""), "/author");
});

test("routeForDraft points at the given draft", () => {
  assert.equal(routeForDraft("draft_123"), "/author?draft=draft_123");
});

test("routeForDraft encodes identifiers that need escaping", () => {
  assert.equal(routeForDraft("draft 1&2?x=3"), "/author?draft=draft%201%262%3Fx%3D3");
  assert.equal(routeForDraft("שבת/1"), `/author?draft=${encodeURIComponent("שבת/1")}`);
});

test("a source keeps the printed display block the server sent", () => {
  const display = { bookTitle: "Mishkan T\u2019filah", folio: "p. 70", sectionTitle: "Evening service", edition: "1,024-page printing" };
  assert.deepEqual(sourceDisplayCopy({ display, book: "legacy-shabbat-morning" }), display);
  assert.equal(sourceHeadline(display), "Mishkan T\u2019filah \u00b7 p. 70");
});

test("a stored source snapshot never falls back to a slug", () => {
  const display = sourceDisplayCopy({ book: "legacy-shabbat-morning", metadata: { folios: [5, 6] } });
  assert.equal(display.bookTitle, "Unlabeled book");
  assert.equal(display.folio, "pp. 5\u20136");
  assert.equal(sourceHeadline(display), "Unlabeled book \u00b7 pp. 5\u20136");
});

test("a stored source snapshot reads its printed metadata", () => {
  assert.deepEqual(sourceDisplayCopy({
    book: "mishkan-tfilah",
    section: "17",
    metadata: { bookTitle: "Mishkan T\u2019filah", sectionTitle: "Evening service", familyLabel: "CRC printing", folios: [70] },
  }), { bookTitle: "Mishkan T\u2019filah", folio: "p. 70", sectionTitle: "Evening service", edition: "CRC printing" });
  assert.equal(sourceDisplayCopy({ metadata: { folios: [3, 9] } }).folio, "pp. 3, 9");
});

test("an empty library tab does not blame the search box", () => {
  assert.equal(libraryEmptyMessage("drafts", false), "No drafts yet");
  assert.equal(libraryEmptyMessage("published", false), "No published graphics yet");
  assert.equal(libraryEmptyMessage("archived", false), "No archived graphics");
  assert.equal(libraryEmptyMessage("shared", false), "Nothing shared yet");
  assert.equal(libraryEmptyMessage("drafts", true), "No matching drafts");
  assert.equal(libraryEmptyMessage("published", true), "No matching published graphics");
  assert.equal(libraryEmptyMessage("archived", true), "No matching archived graphics");
  assert.equal(libraryEmptyMessage("shared", true), "No matching shared graphics");
});

test("panels are named only once a draft has more than one, or the selection needs one", () => {
  const short = [{ he: "א", tr: "a" }];
  assert.equal(shouldShowPanels([], short, "bilingual", "left"), false);
  assert.equal(shouldShowPanels([{ sourceId: "s", blockIds: ["a"] }], short, "bilingual", "left"), false);
  assert.equal(
    shouldShowPanels(
      [{ sourceId: "s", blockIds: ["a"] }, { sourceId: "s", blockIds: ["b"] }],
      short,
      "bilingual",
      "left",
    ),
    true,
  );
  // One long block is never split, so it still fits a single panel.
  assert.equal(shouldShowPanels([], [{ he: "א".repeat(900), tr: "" }], "bilingual", "left"), false);
  // Four blocks cannot.
  assert.equal(shouldShowPanels([], [short[0], short[0], short[0], short[0]], "bilingual", "left"), true);
  // A lower third carries exactly one block.
  assert.equal(shouldShowPanels([], [short[0], short[0]], "bilingual", "bottom"), true);
  // Custom and local-variant drafts have no blocks to measure.
  assert.equal(shouldShowPanels([], [], "custom", "bottom"), false);
  assert.equal(shouldShowPanels([], [], "local-variant", "left"), false);
});
