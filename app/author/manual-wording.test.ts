import assert from "node:assert/strict";
import test from "node:test";
import { insertLineBreak, keepSelectionTogether } from "./manual-wording.ts";

test("manual line break replaces a selection at the caret", () => {
  assert.deepEqual(insertLineBreak("Baruch amen", 6, 7), { text: "Baruch\namen", cursor: 7 });
});

test("keep together changes only selected wrapping characters", () => {
  assert.deepEqual(keepSelectionTogether("a ha-olam and b", 2, 9), { text: "a ha‑olam and b", start: 2, end: 9 });
  assert.deepEqual(keepSelectionTogether("a two words b", 2, 11), { text: "a two words b", start: 2, end: 11 });
  assert.equal(keepSelectionTogether("a two words b", 2, 2), null);
});
