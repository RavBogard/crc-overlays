import { waitForRenderedOverlayAssets } from "@/lib/overlay-assets";
import { BUG_RESERVED_RECT, type BugRect } from "@/lib/bug-layer";
import { layoutDefinition, type CardDefinition, type ResolvedLayouts } from "@/lib/layout-registry";

const WIDTH = 1920;
const HEIGHT = 1080;

// The bundled Noto Sans Hebrew font has a content area (ascent+descent ≈ 1.36 em)
// taller than the overlay line-heights (1.15-1.28), so each Hebrew line's
// Range.getClientRects() box and the element's scrollHeight/scrollWidth extend a
// few native px beyond the line box even when the rendering is visually correct
// (no clipping, no ink collision). This tolerance (in native 1920x1080 px)
// absorbs that font-metric overhang without masking real fit/overlap errors.
export const FONT_METRIC_TOLERANCE = 6;

function overflowTolerance(element: HTMLElement): number {
  // The tolerance is for Noto Sans Hebrew's glyph metrics. A single-channel English
  // panel has a real, fixed text box, so even a small scroll overflow there clips
  // authored copy and must fail the fit verdict.
  return element.classList.contains("single-channel") && !/[\u0590-\u05FF]/.test(element.textContent || "") ? 0 : FONT_METRIC_TOLERANCE;
}

export async function waitForPreviewAssets(root: HTMLElement) {
  await waitForRenderedOverlayAssets(root);
}

export interface OccupiedRect {
  name: string;
  owner: number;
  box: { left: number; top: number; right: number; bottom: number };
}

export function overlapErrors(occupied: OccupiedRect[], overlap: number): string[] {
  const errors: string[] = [];
  for (let left = 0; left < occupied.length; left++)
    for (let right = left + 1; right < occupied.length; right++) {
      const a = occupied[left],
        b = occupied[right];
      if (a.owner === b.owner) continue;
      if (
        a.box.right > b.box.left + overlap &&
        b.box.right > a.box.left + overlap &&
        a.box.bottom > b.box.top + overlap &&
        b.box.bottom > a.box.top + overlap
      ) {
        errors.push(`${a.name} overlaps ${b.name}.`);
      }
    }
  return [...new Set(errors)];
}

// The ink a graphic actually puts on the frame: every rendered text line's own client
// rects (so a same-owner wrap is never an overlap) plus the workspace logo. findFitErrors
// and findBugCollisions share it so the two verdicts cannot drift.
export function occupiedRects(root: HTMLElement): OccupiedRect[] {
  const owner = root.ownerDocument ?? document;
  const occupied: OccupiedRect[] = [];
  let ownerIndex = 0;
  for (const element of root.querySelectorAll<HTMLElement>(".overlay .title, .overlay .prayer")) {
    if (!element.textContent?.trim()) continue;
    const range = owner.createRange();
    range.selectNodeContents(element);
    const name = element.dataset.element || "Text";
    const index = ownerIndex++;
    for (const box of range.getClientRects()) occupied.push({ name, owner: index, box });
  }
  const logo = root.querySelector<HTMLElement>(".overlay .logo");
  if (logo) occupied.push({ name: "Workspace logo", owner: ownerIndex++, box: logo.getBoundingClientRect() });
  return occupied;
}

export function findFitErrors(root: HTMLElement, layouts?: ResolvedLayouts) {
  const errors: string[] = [];
  const rootBox = root.getBoundingClientRect();
  if (!root.querySelector(".overlay")) return ["The graphic did not render."];
  const scale = rootBox.width / WIDTH || 1;
  // A side panel's copy must also sit inside the panel itself, not merely inside the frame: a
  // stale geometry rule once put a custom right panel's text 16px outside the panel's left edge.
  // The corner card is held to its own card the same way.
  const panel = root.querySelector<HTMLElement>(".overlay[data-contain] .base")?.getBoundingClientRect();
  for (const element of root.querySelectorAll<HTMLElement>(".overlay .part, .overlay .content-row, .overlay .prayer")) {
    const box = element.getBoundingClientRect();
    const name = element.dataset.element || "Graphic";
    if (
      box.left < rootBox.left - 0.5 ||
      box.top < rootBox.top - 0.5 ||
      box.right > rootBox.left + WIDTH * scale + 0.5 ||
      box.bottom > rootBox.top + HEIGHT * scale + 0.5
    )
      errors.push(`${name} extends beyond the frame.`);
    if (panel && (box.left < panel.left - 0.5 || box.right > panel.right + 0.5 || box.top < panel.top - 0.5 || box.bottom > panel.bottom + 0.5))
      errors.push(`${name} extends beyond the panel.`);
    const tolerance = overflowTolerance(element);
    if (element.scrollWidth > element.clientWidth + tolerance || element.scrollHeight > element.clientHeight + tolerance)
      errors.push(`${name} does not fit its box.`);
  }
  const bottomHeight = bottomPanelHeight(root);
  if (bottomHeight !== null && bottomHeight > BOTTOM_PANEL_MAX_HEIGHT + BOTTOM_PANEL_TOLERANCE)
    errors.push(`Lower third panel is ${Math.ceil(bottomHeight)}px tall; limit is ${BOTTOM_PANEL_MAX_HEIGHT}px. Reflow English paragraphs or split this graphic.`);
  // A card's own height ceiling, when its definition sets one (the corner card's height is fixed, so it sets none).
  const card = renderedCard(root, layouts);
  const ceiling = card?.fit.heightCeiling ?? null;
  const cardBase = ceiling === null ? null : root.querySelector<HTMLElement>(".overlay .base");
  if (ceiling !== null && cardBase && cardBase.getBoundingClientRect().height / scale > ceiling + BOTTOM_PANEL_TOLERANCE)
    errors.push(`The card is ${Math.ceil(cardBase.getBoundingClientRect().height / scale)}px tall; limit is ${ceiling}px.`);
  const occupied = occupiedRects(root);
  const overlap = FONT_METRIC_TOLERANCE * scale;
  errors.push(...overlapErrors(occupied, overlap));
  return [...new Set(errors)];
}

// Below this line: sparse-fill detection, layered on the same frame/scale
// convention as findFitErrors above (native 1920x1080 px, divided by the
// stage's render scale) but measuring how much of a panel a cue actually
// fills rather than whether it overflows it.
export const SPARSE_FILL = 0.35;
/** The visible lower-third panel (title plus body, never the decorative logo) must fit this native height. */
export const BOTTOM_PANEL_MAX_HEIGHT = 360;
export const BOTTOM_PANEL_TOLERANCE = 2;

function textRangeHeight(elements: HTMLElement[]): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (const element of elements) {
    if (!element.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(element);
    for (const box of range.getClientRects()) {
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return top <= bottom ? bottom - top : 0;
}

function bottomPanelHeight(root: HTMLElement): number | null {
  const overlay = root.querySelector<HTMLElement>(".overlay");
  if (!overlay?.classList?.contains("bottom")) return null;
  const base = root.querySelector<HTMLElement>(".overlay .base");
  const title = root.querySelector<HTMLElement>(".overlay .titlebar");
  if (!base || !title) return null;
  const rootBox = root.getBoundingClientRect();
  const scale = rootBox.width / WIDTH || 1;
  const body = base.getBoundingClientRect(), titleBox = title.getBoundingClientRect();
  return (Math.max(body.bottom, titleBox.bottom) - Math.min(body.top, titleBox.top)) / scale;
}

/**
 * The card definition of the rendered graphic, when it is drawn as a card (the Player sets data-card
 * to its layout id). A data layout (L3) is known here only from the definitions the cue was
 * rendered with - the fit stage has no registry entry for it - so those are read first.
 */
function renderedCard(root: HTMLElement, layouts?: ResolvedLayouts): CardDefinition | undefined {
  const id = root.querySelector<HTMLElement>(".overlay[data-card]")?.dataset?.card;
  if (!id) return undefined;
  const given = Object.values(layouts ?? {}).filter((item) => item.id === id).sort((a, b) => b.version - a.version)[0];
  return given?.document.card ?? layoutDefinition(id)?.card;
}

export function panelFillRatio(root: HTMLElement, layouts?: ResolvedLayouts): number | null {
  const overlay = root.querySelector<HTMLElement>(".overlay");
  if (!overlay) return null;
  // A card measures its fill against its own definition. The corner card defines none: it is
  // meant to hold a line or two, so it reports no ratio and is never warned sparse (as before).
  const card = renderedCard(root, layouts);
  if (card) {
    if (!card.fit.fill) return null;
    const scale = root.getBoundingClientRect().width / WIDTH || 1;
    return textRangeHeight(Array.from(root.querySelectorAll<HTMLElement>(".overlay .prayer"))) / scale / card.fit.fill.denominator;
  }
  const bottomHeight = bottomPanelHeight(root);
  if (bottomHeight !== null) return bottomHeight / BOTTOM_PANEL_MAX_HEIGHT;
  if (!(overlay.classList.contains("left") || overlay.classList.contains("right"))) return null;
  const rootBox = root.getBoundingClientRect();
  const scale = rootBox.width / WIDTH || 1;
  const rows = root.querySelectorAll<HTMLElement>(".overlay .panel-rows .content-row");
  if (rows.length)
    return Array.from(rows).reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) / scale / 842;
  const english = root.querySelector<HTMLElement>(".overlay .english:not(.single-channel)");
  const hebrew = root.querySelector<HTMLElement>(".overlay .hebrew:not(.single-channel)");
  if (english && hebrew) return textRangeHeight([english, hebrew]) / scale / 840;
  const single = root.querySelector<HTMLElement>(".overlay .prayer.single-channel");
  if (single) return textRangeHeight([single]) / scale / 840;
  return null;
}

export function findFitWarnings(root: HTMLElement, layouts?: ResolvedLayouts): string[] {
  const ratio = panelFillRatio(root, layouts);
  const threshold = renderedCard(root, layouts)?.fit.fill?.sparseBelow ?? SPARSE_FILL;
  if (ratio !== null && ratio < threshold) return ["Sparse — consider Lower third"];
  return [];
}

// D6 - the reserved scan-card corner, measured rather than asserted. The card is a fixed
// rectangle in 1920x1080 stage coordinates (BUG_RESERVED_RECT); this scales it into the
// measurement stage's own coordinates and runs it through the same overlap machinery, with
// the same FONT_METRIC_TOLERANCE slack, that findFitErrors uses. A graphic that reaches into
// the corner is reported, not silently re-cut.
export const BUG_RESERVED_NAME = "Scan card corner";

export function findBugCollisions(root: HTMLElement, rect: BugRect = BUG_RESERVED_RECT): string[] {
  if (!root.querySelector(".overlay")) return [];
  const rootBox = root.getBoundingClientRect();
  const scale = rootBox.width / WIDTH || 1;
  const reserved: OccupiedRect = {
    name: BUG_RESERVED_NAME,
    owner: -1,
    box: {
      left: rootBox.left + rect.left * scale,
      top: rootBox.top + rect.top * scale,
      right: rootBox.left + rect.right * scale,
      bottom: rootBox.top + rect.bottom * scale,
    },
  };
  return bugCollisionErrors(occupiedRects(root), reserved, FONT_METRIC_TOLERANCE * scale);
}

/** The pure half: which of `occupied` reaches into the reserved rectangle. */
export function bugCollisionErrors(occupied: OccupiedRect[], reserved: OccupiedRect, overlap: number): string[] {
  return overlapErrors([...occupied, reserved], overlap).filter((error) => error.includes(reserved.name));
}
