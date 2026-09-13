import assert from "node:assert/strict";
import test from "node:test";
import {
  draftHasUnpublishedWork,
  editableFromForm,
  emptyForm,
  formReady,
  parseRecovery,
  selectWholeSource,
} from "./editor-state.ts";

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
