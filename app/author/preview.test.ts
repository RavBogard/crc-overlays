import assert from "node:assert/strict";
import test from "node:test";
import { FONT_METRIC_TOLERANCE, overlapErrors } from "./preview.ts";

test("same-owner overlapping rects produce no error", () => {
  const errors = overlapErrors(
    [
      { name: "textMainheb", owner: 0, box: { left: 0, top: 0, right: 100, bottom: 40 } },
      { name: "textMainheb", owner: 0, box: { left: 0, top: 36, right: 100, bottom: 76 } },
    ],
    2,
  );
  assert.deepEqual(errors, []);
});

test("different-owner overlapping rects produce an overlap error", () => {
  const errors = overlapErrors(
    [
      { name: "A", owner: 0, box: { left: 0, top: 0, right: 100, bottom: 40 } },
      { name: "B", owner: 1, box: { left: 50, top: 10, right: 150, bottom: 60 } },
    ],
    2,
  );
  assert.deepEqual(errors, ["A overlaps B."]);
});

test("rects touching within the overlap tolerance produce no error", () => {
  const errors = overlapErrors(
    [
      { name: "A", owner: 0, box: { left: 0, top: 0, right: 100, bottom: 40 } },
      { name: "B", owner: 1, box: { left: 101, top: 0, right: 200, bottom: 40 } },
    ],
    FONT_METRIC_TOLERANCE,
  );
  assert.deepEqual(errors, []);
});

test("different-owner rects overlapping by exactly the tolerance produce no error, one px more errors", () => {
  const noError = overlapErrors(
    [
      { name: "A", owner: 0, box: { left: 0, top: 0, right: 100, bottom: 40 } },
      { name: "B", owner: 1, box: { left: 95, top: 0, right: 195, bottom: 40 } },
    ],
    FONT_METRIC_TOLERANCE,
  );
  assert.deepEqual(noError, []);

  const withError = overlapErrors(
    [
      { name: "A", owner: 0, box: { left: 0, top: 0, right: 100, bottom: 40 } },
      { name: "B", owner: 1, box: { left: 93, top: 0, right: 193, bottom: 40 } },
    ],
    FONT_METRIC_TOLERANCE,
  );
  assert.deepEqual(withError, ["A overlaps B."]);
});

test("three owners report only the one colliding pair, deduplicated", () => {
  const errors = overlapErrors(
    [
      { name: "A", owner: 0, box: { left: 0, top: 0, right: 100, bottom: 40 } },
      { name: "A", owner: 0, box: { left: 0, top: 36, right: 100, bottom: 76 } },
      { name: "B", owner: 1, box: { left: 50, top: 0, right: 150, bottom: 40 } },
      { name: "C", owner: 2, box: { left: 500, top: 500, right: 600, bottom: 540 } },
    ],
    2,
  );
  assert.deepEqual(errors, ["A overlaps B."]);
});
