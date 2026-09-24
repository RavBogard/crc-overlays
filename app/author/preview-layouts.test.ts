import assert from "node:assert/strict";
import test from "node:test";
import { findFitErrors, panelFillRatio } from "./preview.ts";
import { CORNER_CARD, type ResolvedLayouts } from "../../lib/layout-registry.ts";

// L3 - a card in a data layout is known to the fit stage only from the definitions the cue was
// rendered with, so the card's own ceiling and fill come from those, not from the registry.
const tall = { ...structuredClone(CORNER_CARD), fit: { ...CORNER_CARD.fit, fill: { denominator: 100, sparseBelow: 0.2 }, heightCeiling: 250 } };
const layouts: ResolvedLayouts = { "tall@2": { id: "tall", version: 2, sha256: "c".repeat(64), document: { label: "Tall", capabilities: { sets: false, translation: false, oneBlockPerSlide: true }, card: tall, motion: { preset: "fade" } } } };

function dataCardRoot(): HTMLElement {
  const base = { getBoundingClientRect: () => ({ left: 1232, top: 700, right: 1872, bottom: 1000, width: 640, height: 300 }) };
  const prayer = { dataset: { element: "textMain" }, textContent: "Vaimru Amen", classList: { contains: () => false }, scrollWidth: 10, clientWidth: 10, scrollHeight: 10, clientHeight: 10, getBoundingClientRect: () => ({ left: 1264, top: 760, right: 1848, bottom: 820, width: 584, height: 60 }) };
  const range = { selectNodeContents() {}, getClientRects: () => [{ top: 760, bottom: 820, left: 1264, right: 1848 }] };
  (globalThis as unknown as { document: unknown }).document = { createRange: () => range };
  return {
    ownerDocument: { createRange: () => range },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }),
    querySelector: (selector: string) => selector === ".overlay" ? { classList: { contains: () => false } } : selector === ".overlay[data-card]" ? { dataset: { card: "tall" } } : selector === ".overlay .base" || selector === ".overlay[data-contain] .base" ? base : null,
    querySelectorAll: (selector: string) => selector === ".overlay .part, .overlay .content-row, .overlay .prayer" || selector === ".overlay .prayer" ? [prayer] : [],
  } as unknown as HTMLElement;
}

test("a data-layout card is held to the height ceiling of the definition it was rendered with", () => {
  assert.deepEqual(findFitErrors(dataCardRoot()), [], "without its definition the stage knows no ceiling for it");
  assert.deepEqual(findFitErrors(dataCardRoot(), layouts), ["The card is 300px tall; limit is 250px."]);
});

test("a data-layout card measures its fill against its own definition", () => {
  assert.equal(panelFillRatio(dataCardRoot()), null);
  assert.equal(panelFillRatio(dataCardRoot(), layouts), 60 / 100);
});
