import assert from "node:assert/strict";
import test from "node:test";
import { FONT_METRIC_TOLERANCE, SPARSE_FILL, findFitWarnings, overlapErrors, panelFillRatio } from "./preview.ts";

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

/* ---------------------------------------------------------------------------
 * Sparse-fill detection: fakes just the DOM shape panelFillRatio queries
 * (root -> ".overlay" -> ".panel-rows" -> ".content-row" rows), following the
 * same stub-elements-with-getBoundingClientRect technique used elsewhere for
 * this frame/scale convention.
 * ------------------------------------------------------------------------ */

interface FakeElement {
  classList: { contains(name: string): boolean };
  getBoundingClientRect(): { height: number; width: number };
}

function fakeRow(height: number): FakeElement {
  return { classList: { contains: () => false }, getBoundingClientRect: () => ({ height, width: 576 }) };
}

function fakeRoot(options: { layout: "left" | "right" | "bottom"; rowHeights?: number[] }): HTMLElement {
  const overlay: FakeElement = { classList: { contains: (name) => name === options.layout }, getBoundingClientRect: () => ({ height: 1080, width: 1920 }) };
  const rows = (options.rowHeights ?? []).map(fakeRow);
  const root = {
    getBoundingClientRect: () => ({ height: 1080, width: 1920 }),
    querySelector: (selector: string) => (selector === ".overlay" ? overlay : null),
    querySelectorAll: (selector: string) => (selector === ".overlay .panel-rows .content-row" ? rows : []),
  };
  return root as unknown as HTMLElement;
}

test("paired content rows summing to 200px are below the sparse threshold and warn", () => {
  const root = fakeRoot({ layout: "left", rowHeights: [200] });
  assert.equal(panelFillRatio(root), 200 / 842);
  assert.ok((panelFillRatio(root) as number) < SPARSE_FILL);
  assert.deepEqual(findFitWarnings(root), ["Sparse — consider Lower third"]);
});

test("paired content rows summing to 400px are above the sparse threshold and do not warn", () => {
  const root = fakeRoot({ layout: "right", rowHeights: [200, 200] });
  assert.equal(panelFillRatio(root), 400 / 842);
  assert.ok((panelFillRatio(root) as number) >= SPARSE_FILL);
  assert.deepEqual(findFitWarnings(root), []);
});

test("a bottom layout root has no panel to measure and never warns", () => {
  const root = fakeRoot({ layout: "bottom", rowHeights: [200] });
  assert.equal(panelFillRatio(root), null);
  assert.deepEqual(findFitWarnings(root), []);
});
