const HEBREW_SAMPLE = "שְׁמַע יִשְׂרָאֵל";
export const OVERLAY_ASSET_TIMEOUT_MS = 8000;

export function overlayAssetUrl(cue: { presentation?: { imageAssetId?: string } }, audience: "preview" | "content") {
  const id = cue.presentation?.imageAssetId;
  return id && /^asset_[a-f0-9]{64}$/.test(id) ? `/api/assets/${encodeURIComponent(id)}/${audience}` : undefined;
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
    const loads = [
      document.fonts.load('400 40px "Noto Sans Hebrew"', HEBREW_SAMPLE),
      document.fonts.load('500 40px "Noto Sans Hebrew"', HEBREW_SAMPLE),
      document.fonts.load('400 40px "WorkRefresh"', "Shabbat Shalom"),
      document.fonts.load('500 40px "WorkRefresh"', "Shabbat Shalom"),
    ];
    // The book faces are a typography trial layered over the required faces. A missing or
    // broken book face must never keep the output page from starting, so their loads are
    // awaited but swallowed: the CSS font stack falls back to the default faces.
    const bookLoads = faces === 'book'
      ? [
          document.fonts.load('400 40px "David Libre"', HEBREW_SAMPLE),
          document.fonts.load('500 40px "David Libre"', HEBREW_SAMPLE),
          document.fonts.load('400 40px "Frank Ruhl Libre"', "Shabbat Shalom"),
          document.fonts.load('500 40px "Frank Ruhl Libre"', "Shabbat Shalom"),
        ].map((load) => load.catch(() => []))
      : [];
    await bounded(Promise.all([...loads, ...bookLoads]), "Overlay font loading", deadline);
    await bounded(document.fonts.ready, "Overlay font readiness", deadline);
    if (!document.fonts.check('400 40px "Noto Sans Hebrew"', HEBREW_SAMPLE))
      throw Error("The Hebrew overlay font is not ready.");
    if (!document.fonts.check('400 40px "WorkRefresh"', "Shabbat Shalom"))
      throw Error("The overlay font is not ready.");
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

export async function waitForRenderedOverlayAssets(root: HTMLElement, signal?: AbortSignal, faces: 'default' | 'book' = 'default') {
  await withDeadline(signal, async (deadline) => {
    await waitForOverlayFonts(deadline, faces);
    const logo = root.querySelector<HTMLImageElement>("img.logo");
    if (!logo) throw Error("The workspace logo did not render.");
    if (!logo.complete)
      await settledImage(logo, "The workspace logo could not be loaded.", "Workspace logo loading", deadline);
    await bounded(logo.decode(), "Workspace logo decoding", deadline);
    await bounded(new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), "Overlay layout readiness", deadline);
    if (!logo.complete || !logo.naturalWidth) throw Error("The workspace logo is not ready.");
  });
}
