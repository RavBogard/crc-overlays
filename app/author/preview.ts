import { branding } from "@/lib/branding";

const WIDTH = 1920;
const HEIGHT = 1080;

export async function waitForPreviewAssets(root: HTMLElement) {
  await document.fonts.ready;
  let logo = root.querySelector<HTMLImageElement>("img.logo");
  if (!logo) {
    logo = new Image();
    logo.src = branding.logo;
  }
  if (!logo.complete)
    await new Promise<void>((resolve, reject) => {
      logo!.addEventListener("load", () => resolve(), { once: true });
      logo!.addEventListener(
        "error",
        () => reject(Error("The CRC logo could not be loaded.")),
        { once: true },
      );
    });
  await logo.decode().catch(() => undefined);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  if (document.fonts.status !== "loaded")
    throw Error("The overlay fonts are not ready.");
  if (!logo.complete || !logo.naturalWidth)
    throw Error("The CRC logo is not ready.");
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
      element.scrollWidth > element.clientWidth + 1 ||
      element.scrollHeight > element.clientHeight + 1
    )
      errors.push(`${name} does not fit its box.`);
  }
  const occupied: Array<{ name: string; box: DOMRect }> = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    ".overlay .title, .overlay .prayer",
  )) {
    if (!element.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(element);
    for (const box of range.getClientRects())
      occupied.push({ name: element.dataset.element || "Text", box });
  }
  const logo = root.querySelector<HTMLElement>(".overlay .logo");
  if (logo)
    occupied.push({ name: "CRC logo", box: logo.getBoundingClientRect() });
  const overlap = 2 * scale;
  for (let left = 0; left < occupied.length; left++)
    for (let right = left + 1; right < occupied.length; right++) {
      const a = occupied[left],
        b = occupied[right];
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
