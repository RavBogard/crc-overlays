import { waitForRenderedOverlayAssets } from "@/lib/overlay-assets";

const WIDTH = 1920;
const HEIGHT = 1080;

// The bundled Noto Sans Hebrew font has a content area (ascent+descent ≈ 1.36 em)
// taller than the overlay line-heights (1.15-1.28), so each Hebrew line's
// Range.getClientRects() box and the element's scrollHeight/scrollWidth extend a
// few native px beyond the line box even when the rendering is visually correct
// (no clipping, no ink collision). This tolerance (in native 1920x1080 px)
// absorbs that font-metric overhang without masking real fit/overlap errors.
export const FONT_METRIC_TOLERANCE = 6;

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

export function findFitErrors(root: HTMLElement) {
  const errors: string[] = [];
  const rootBox = root.getBoundingClientRect();
  if (!root.querySelector(".overlay")) return ["The graphic did not render."];
  const scale = rootBox.width / WIDTH || 1;
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
    if (
      element.scrollWidth > element.clientWidth + FONT_METRIC_TOLERANCE ||
      element.scrollHeight > element.clientHeight + FONT_METRIC_TOLERANCE
    )
      errors.push(`${name} does not fit its box.`);
  }
  const occupied: OccupiedRect[] = [];
  let ownerIndex = 0;
  for (const element of root.querySelectorAll<HTMLElement>(
    ".overlay .title, .overlay .prayer",
  )) {
    if (!element.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(element);
    const name = element.dataset.element || "Text";
    const owner = ownerIndex++;
    for (const box of range.getClientRects()) occupied.push({ name, owner, box });
  }
  const logo = root.querySelector<HTMLElement>(".overlay .logo");
  if (logo)
    occupied.push({
      name: "Workspace logo",
      owner: ownerIndex++,
      box: logo.getBoundingClientRect(),
    });
  const overlap = FONT_METRIC_TOLERANCE * scale;
  errors.push(...overlapErrors(occupied, overlap));
  return [...new Set(errors)];
}
