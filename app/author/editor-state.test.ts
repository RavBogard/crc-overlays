import assert from "node:assert/strict";
import test from "node:test";
import {
  blocksForMode,
  draftHasUnpublishedWork,
  editableFromForm,
  emptyForm,
  formReady,
  parseRecovery,
  selectWholeSource,
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

test("whole-prayer selection preserves source order", () => {
  assert.deepEqual(selectWholeSource("siddur-1", ["a", "b", "c"]), [
    { sourceId: "siddur-1", blockIds: ["a", "b", "c"] },
  ]);
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
