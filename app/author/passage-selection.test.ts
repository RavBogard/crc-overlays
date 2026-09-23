import test from "node:test";
import assert from "node:assert/strict";
import { passageRun, slideHolding, togglePassage, type PickerBlock } from "./passage-selection.ts";

// Birchot HaShachar's shape: each blessing is two passages plus the English that covers both.
const S = "birchot";
const blocks: PickerBlock[] = [
  { id: "b0", kind: "bilingual" }, { id: "b1", kind: "bilingual" }, { id: "b2", kind: "translation-en", pairedBlockIds: ["b0", "b1"] },
  { id: "b3", kind: "bilingual" }, { id: "b4", kind: "bilingual" }, { id: "b5", kind: "translation-en", pairedBlockIds: ["b3", "b4"] },
  { id: "b6", kind: "bilingual" }, { id: "b7", kind: "bilingual" }, { id: "b8", kind: "translation-en", pairedBlockIds: ["b6", "b7"] },
];
const base = { sourceId: S, blocks, withTranslation: true };

test("checking half of a translated blessing selects the whole blessing (the refused half-pair preview)", () => {
  const result = togglePassage({ ...base, groups: [{ sourceId: S, blockIds: ["b0", "b1"] }, { sourceId: S, blockIds: ["b3", "b4"] }], activeGroup: 1, blockId: "b6", checked: true });
  assert.deepEqual(result.groups[1].blockIds, ["b3", "b4", "b6", "b7"]);
  assert.deepEqual(result.changed, ["b6", "b7"]);
  assert.deepEqual(result.movedFrom, []);
});

test("unchecking one passage of a translated blessing removes the whole blessing", () => {
  const result = togglePassage({ ...base, groups: [{ sourceId: S, blockIds: ["b0", "b1", "b3", "b4"] }], activeGroup: 0, blockId: "b4", checked: false });
  assert.deepEqual(result.groups[0].blockIds, ["b0", "b1"]);
});

test("without the English layer a passage is checked on its own", () => {
  assert.deepEqual(passageRun(blocks, "b6", false), ["b6"]);
  const result = togglePassage({ ...base, withTranslation: false, groups: [{ sourceId: S, blockIds: [] }], activeGroup: 0, blockId: "b6", checked: true });
  assert.deepEqual(result.groups[0].blockIds, ["b6"]);
});

test("checking a passage another slide holds moves it instead of selecting it twice (the repeated_source_block refusal)", () => {
  const groups = [{ sourceId: S, blockIds: ["b0", "b1"] }, { sourceId: S, blockIds: ["b3", "b4"] }];
  assert.equal(slideHolding(groups, 0, S, "b3"), 1);
  assert.equal(slideHolding(groups, 1, S, "b3"), -1);
  const result = togglePassage({ ...base, groups, activeGroup: 0, blockId: "b3", checked: true });
  assert.deepEqual(result.groups, [{ sourceId: S, blockIds: ["b0", "b1", "b3", "b4"] }], "the emptied slide is removed");
  assert.deepEqual(result.movedFrom, [1]);
  assert.equal(result.activeGroup, 0);
  assert.deepEqual(groups[1].blockIds, ["b3", "b4"], "the input groups are not mutated");
});

test("selection stays in source order", () => {
  const result = togglePassage({ ...base, groups: [{ sourceId: S, blockIds: ["b6", "b7"] }], activeGroup: 0, blockId: "b0", checked: true });
  assert.deepEqual(result.groups[0].blockIds, ["b0", "b1", "b6", "b7"]);
});

test("removing an emptied slide before the active one keeps the active slide selected", () => {
  const groups = [{ sourceId: S, blockIds: ["b0", "b1"] }, { sourceId: S, blockIds: ["b3", "b4"] }];
  const result = togglePassage({ ...base, groups, activeGroup: 1, blockId: "b0", checked: true });
  assert.deepEqual(result.groups, [{ sourceId: S, blockIds: ["b0", "b1", "b3", "b4"] }]);
  assert.equal(result.activeGroup, 0);
});
