import assert from "node:assert/strict";
import test from "node:test";
import { BUG_RESERVED_NAME, FONT_METRIC_TOLERANCE, SPARSE_FILL, findBugCollisions, findFitErrors, findFitWarnings, overlapErrors, panelFillRatio } from "./preview.ts";
import { BUG_RESERVED_RECT } from "../../lib/bug-layer.ts";

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

function singleChannelRoot(text: string, scrollHeight: number, clientHeight: number): HTMLElement {
  const box = { left: 48, top: 184, right: 624, bottom: 1024, width: 576, height: 840 };
  const element = {
    dataset: { element: "textMain" },
    textContent: text,
    classList: { contains: (name: string) => name === "single-channel" },
    scrollWidth: 576,
    clientWidth: 576,
    scrollHeight,
    clientHeight,
    getBoundingClientRect: () => box,
    rects: [box],
  };
  const createRange = () => {
    let current: typeof element | null = null;
    return { selectNodeContents(next: typeof element) { current = next; }, getClientRects() { return current ? current.rects : []; } };
  };
  return {
    ownerDocument: { createRange },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }),
    querySelector: (selector: string) => selector === ".overlay" ? {} : null,
    querySelectorAll: (selector: string) => selector === ".overlay .part, .overlay .content-row, .overlay .prayer" || selector === ".overlay .title, .overlay .prayer" ? [element] : [],
  } as unknown as HTMLElement;
}

test("a single-channel English panel fails when its constrained text box scrolls by 6px", () => {
  const root = singleChannelRoot("English interpretation", 846, 840);
  assert.deepEqual(findFitErrors(root), ["textMain does not fit its box."]);
});

test("a single-channel English panel exactly fitting its constrained box still passes", () => {
  const root = singleChannelRoot("English interpretation", 840, 840);
  assert.deepEqual(findFitErrors(root), []);
});

test("a Hebrew single-channel panel retains the approved 6px metric tolerance", () => {
  const root = singleChannelRoot("גְּבוּרוֹת", 846, 840);
  assert.deepEqual(findFitErrors(root), []);
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

/* ---------------------------------------------------------------------------
 * D6: the reserved scan-card corner. Same technique as the sparse-fill fakes
 * above - only the DOM surface occupiedRects() reads is stubbed, including the
 * root's own document so the text ranges can be handed back as fixed boxes.
 * The stage is a true 1920x1080 frame, so scale is 1 and the numbers below are
 * stage coordinates.
 * ------------------------------------------------------------------------ */

type Box = { left: number; top: number; right: number; bottom: number };

function cueRoot(lines: Array<{ name: string; box: Box }>): HTMLElement {
  const elements = lines.map((line) => ({
    dataset: { element: line.name },
    textContent: line.name,
    rects: [line.box],
    getBoundingClientRect: () => line.box,
  }));
  const createRange = () => {
    let current: { rects: Box[] } | null = null;
    return {
      selectNodeContents(element: { rects: Box[] }) { current = element; },
      getClientRects() { return current ? current.rects : []; },
    };
  };
  return {
    ownerDocument: { createRange },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }),
    querySelector: (selector: string) => (selector === ".overlay" ? {} : null),
    querySelectorAll: (selector: string) => (selector === ".overlay .title, .overlay .prayer" ? elements : []),
  } as unknown as HTMLElement;
}

test("a graphic whose text reaches into the reserved corner is reported", () => {
  const root = cueRoot([
    { name: "textTitle", box: { left: 48, top: 42, right: 624, bottom: 92 } },
    { name: "textMaineng", box: { left: 1264, top: 800, right: 1900, bottom: 900 } },
  ]);
  assert.deepEqual(findBugCollisions(root), [`textMaineng overlaps ${BUG_RESERVED_NAME}.`]);
});

test("a graphic that leaves the corner alone passes, and the corner is the one from lib/bug-layer", () => {
  const root = cueRoot([
    { name: "textTitle", box: { left: 48, top: 42, right: 624, bottom: 92 } },
    { name: "textMainheb", box: { left: 48, top: 184, right: 624, bottom: 1024 } },
  ]);
  assert.deepEqual(findBugCollisions(root), []);
  assert.deepEqual(findBugCollisions(root, BUG_RESERVED_RECT), []);
});

test("the corner uses the same font-metric tolerance as every other overlap verdict", () => {
  const touching = cueRoot([
    { name: "textMaineng", box: { left: 1000, top: 800, right: BUG_RESERVED_RECT.left + FONT_METRIC_TOLERANCE, bottom: 900 } },
  ]);
  assert.deepEqual(findBugCollisions(touching), []);
  const overlapping = cueRoot([
    { name: "textMaineng", box: { left: 1000, top: 800, right: BUG_RESERVED_RECT.left + FONT_METRIC_TOLERANCE + 2, bottom: 900 } },
  ]);
  assert.deepEqual(findBugCollisions(overlapping), [`textMaineng overlaps ${BUG_RESERVED_NAME}.`]);
});

test("a stage with no rendered graphic reports no corner collision rather than guessing", () => {
  const empty = { querySelector: () => null } as unknown as HTMLElement;
  assert.deepEqual(findBugCollisions(empty), []);
});
