import { fontWaits } from "./font-registry.ts";

const HEBREW_SAMPLE = "שְׁמַע יִשְׂרָאֵל";
const LATIN_SAMPLE = "Shabbat Shalom";
export const OVERLAY_ASSET_TIMEOUT_MS = 8000;

export function overlayAssetUrl(cue: { presentation?: { imageAssetId?: string } }, audience: "preview" | "content") {
  const id = cue.presentation?.imageAssetId;
  return id && /^asset_[a-f0-9]{64}$/.test(id) ? `/api/assets/${encodeURIComponent(id)}/${audience}` : undefined;
}

// R-B1 - the server fit stage holds no session, so it is handed a signed read link for the cue's
// artwork (lib/assets.ts signedAssetReadPath). It is used only when it is a same-origin signed
// link for this cue's own asset; anything else falls back to the private preview route.
export function stageArtworkUrl(cue: { presentation?: { imageAssetId?: string } }, signed?: string) {
  const id = cue.presentation?.imageAssetId;
  if (id && signed && /^asset_[a-f0-9]{64}$/.test(id) && new RegExp(`^/api/assets/${id}/signed\\?exp=\\d{1,12}&sig=[A-Za-z0-9_-]{43}$`).test(signed)) return signed;
  return overlayAssetUrl(cue, "preview");
}

// One deadline is shared by every stage of a single wait, so the worst case is the
// total budget rather than the budget multiplied by the number of serial stages.
function overlayDeadline(budgetMs = OVERLAY_ASSET_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  return { signal: controller.signal, release: () => clearTimeout(timer) };
}

async function withDeadline<T>(signal: AbortSignal | undefined, run: (deadline: AbortSignal) => Promise<T>) {
  if (signal) return await run(signal);
  const deadline = overlayDeadline();
  try {
    return await run(deadline.signal);
  } finally {
    deadline.release();
  }
}

function bounded<T>(promise: Promise<T>, label: string, deadline: AbortSignal) {
  if (deadline.aborted) return Promise.reject(Error(`${label} timed out`));
  let onAbort: (() => void) | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      onAbort = () => reject(Error(`${label} timed out`));
      deadline.addEventListener("abort", onAbort, { once: true });
    }),
  ]).finally(() => {
    if (onAbort) deadline.removeEventListener("abort", onAbort);
  });
}

// Every exit path — load, error, and the shared deadline expiring — runs the same
// cleanup, so a timed-out image never leaves listeners attached to a live element.
function settledImage(image: HTMLImageElement, failure: string, label: string, deadline: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
      deadline.removeEventListener("abort", timedOut);
    };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(Error(failure)); };
    const timedOut = () => { cleanup(); reject(Error(`${label} timed out`)); };
    if (deadline.aborted) { reject(Error(`${label} timed out`)); return; }
    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
    deadline.addEventListener("abort", timedOut, { once: true });
  });
}

export async function waitForOverlayFonts(signal?: AbortSignal, faces: 'default' | 'book' = 'default') {
  await withDeadline(signal, async (deadline) => {
    const sample = (script: 'hebrew' | 'latin') => script === 'hebrew' ? HEBREW_SAMPLE : LATIN_SAMPLE;
    const load = ({family, weight, sample: script}: ReturnType<typeof fontWaits>[number]) => document.fonts.load(`${weight} 40px "${family}"`, sample(script));
    const loads = fontWaits('default').map(load);
    // The book faces are a typography trial layered over the required faces. A missing or
    // broken book face must never keep the output page from starting, so their loads are
    // awaited but swallowed: the CSS font stack falls back to the default faces.
    const bookLoads = faces === 'book' ? fontWaits('book').map((face) => load(face).catch(() => [])) : [];
    await bounded(Promise.all([...loads, ...bookLoads]), "Overlay font loading", deadline);
    await bounded(document.fonts.ready, "Overlay font readiness", deadline);
    // One check per required family at its regular weight.
    for (const {family, sample: script} of fontWaits('default').filter(({weight}) => weight === '400'))
      if (!document.fonts.check(`400 40px "${family}"`, sample(script)))
        throw Error(script === 'hebrew' ? "The Hebrew overlay font is not ready." : "The overlay font is not ready.");
  });
}

export async function preloadOverlayImage(src: string, label = "Workspace artwork", signal?: AbortSignal) {
  await withDeadline(signal, async (deadline) => {
    const image = new Image();
    const settled = settledImage(image, `${label} unavailable`, label, deadline);
    image.src = src;
    await settled;
    await bounded(image.decode(), `${label} decoding`, deadline);
    if (!image.naturalWidth) throw Error(`${label} unavailable`);
  });
}

// G10 - a branded accent title may draw at a weight the default set does not load up front (Noto
// Sans Hebrew 600 or 700, lib/font-registry.ts). Its own face is loaded here, at the weight and
// family it computes to, so no frame is measured or shown with a synthesised bold or a fallback.
// With no branded weight this is the 500 face waitForOverlayFonts already loaded.
async function waitForAccentTitleFace(root: HTMLElement, deadline: AbortSignal) {
  if (typeof root.querySelectorAll !== "function" || typeof getComputedStyle !== "function") return;
  const specs = [...new Set(Array.from(root.querySelectorAll<HTMLElement>(".title-accent"), (element) => {
    const style = getComputedStyle(element);
    return `${style.fontWeight} 40px ${style.fontFamily}`;
  }))];
  if (!specs.length) return;
  await bounded(Promise.all(specs.map((spec) => document.fonts.load(spec, HEBREW_SAMPLE))), "Accent title font loading", deadline);
  for (const spec of specs) if (!document.fonts.check(spec, HEBREW_SAMPLE)) throw Error("The accent title's font is not ready.");
}

export async function waitForRenderedOverlayAssets(root: HTMLElement, signal?: AbortSignal, faces: 'default' | 'book' = 'default') {
  await withDeadline(signal, async (deadline) => {
    await waitForOverlayFonts(deadline, faces);
    await waitForAccentTitleFace(root, deadline);
    const logo = root.querySelector<HTMLImageElement>("img.logo");
    if (!logo) throw Error("The workspace logo did not render.");
    if (!logo.complete)
      await settledImage(logo, "The workspace logo could not be loaded.", "Workspace logo loading", deadline);
    await bounded(logo.decode(), "Workspace logo decoding", deadline);
    await bounded(new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), "Overlay layout readiness", deadline);
    if (!logo.complete || !logo.naturalWidth) throw Error("The workspace logo is not ready.");
  });
}
