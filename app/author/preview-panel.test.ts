import assert from "node:assert/strict";
import test from "node:test";
import { findFitErrors } from "./preview.ts";

// Only the DOM surface findFitErrors reads is stubbed: a right panel's base (right:16, width 640
// in native 1920x1080 px, so x 1264..1904) and one lone textMain box.
function rightPanelRoot(textLeft: number): HTMLElement {
  const base = { getBoundingClientRect: () => ({ left: 1264, top: 24, right: 1904, bottom: 1064, width: 640, height: 1040 }) };
  const box = { left: textLeft, top: 184, right: textLeft + 576, bottom: 1024, width: 576, height: 840 };
  const element = {
    dataset: { element: "textMain" },
    textContent: "Thank you for joining!",
    classList: { contains: (name: string) => name === "single-channel" },
    scrollWidth: 576, clientWidth: 576, scrollHeight: 840, clientHeight: 840,
    getBoundingClientRect: () => box,
  };
  return {
    ownerDocument: { createRange: () => ({ selectNodeContents() {}, getClientRects: () => [] }) },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }),
    querySelector: (selector: string) => selector === ".overlay" ? {} : selector === ".overlay.left .base, .overlay.right .base" ? base : null,
    querySelectorAll: (selector: string) => selector === ".overlay .part, .overlay .content-row, .overlay .prayer" ? [element] : [],
  } as unknown as HTMLElement;
}

test("side-panel copy that starts outside the panel fails even while it is inside the frame", () => {
  // The stale right-panel rule (right 72, width 600) put the box at x 1248, 16px left of the panel.
  assert.deepEqual(findFitErrors(rightPanelRoot(1248)), ["textMain extends beyond the panel."]);
});

test("side-panel copy inside the panel passes", () => {
  assert.deepEqual(findFitErrors(rightPanelRoot(1296)), []);
});
