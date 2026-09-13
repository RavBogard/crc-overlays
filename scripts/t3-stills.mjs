// T3 book-faces comparison stills.
//
// Visits the read-only compare page (app/author/fit-check/faces) in its query mode
// once per (cue, faces, frame) combination, for every visible published graphic in the
// running rehearsal instance's catalog. Screenshots each render, composes a
// side-by-side comparison of the two faces at each frame width, and writes a manifest
// plus an HTML contact sheet.
//
// Usage (npm run rehearsal must already be running, or attach to the lead's instance):
//   node scripts/t3-stills.mjs                 full catalog
//   node scripts/t3-stills.mjs --dry-run        list the URLs it would visit, no browser
//   node scripts/t3-stills.mjs --only <cueId>   just one graphic
//   node scripts/t3-stills.mjs --out <dir>      output directory (default work/handoffs/phase-b/t3)
//
// Reads work/rehearsal/current.json for {baseUrl, controlKey}. Never prints the key.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_OUT_DIR = "work/handoffs/phase-b/t3";
export const REHEARSAL_STATE_FILE = path.join("work", "rehearsal", "current.json");
export const FRAME_WIDTHS = [1920, 480];
export const FACES = ["default", "book"];
const READY_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 1500;

export class UsageError extends Error {}

/** Parses argv (without the node/script entries) into {dryRun, only, out}. */
export function parseArgs(argv) {
  let dryRun = false;
  let only = null;
  let out = DEFAULT_OUT_DIR;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--only") {
      only = argv[++index];
      if (!only) throw new UsageError("--only requires a cue id");
    } else if (argument === "--out") {
      out = argv[++index];
      if (!out) throw new UsageError("--out requires a directory");
    } else {
      throw new UsageError(`unknown argument ${argument}; supported: --dry-run, --only <id>, --out <dir>`);
    }
  }
  return { dryRun, only, out };
}

/** The same "published, visible" rule the compare page and fit check apply. */
export function visibleCues(cues) {
  return (Array.isArray(cues) ? cues : []).filter((cue) => cue && !cue.hidden && !cue.aliasOf);
}

/** The compare page's query-mode URL for one (cue, faces, frame) combination. */
export function stillUrl(baseUrl, cueId, faces, frame) {
  return `${baseUrl}/author/fit-check/faces?cue=${encodeURIComponent(cueId)}&faces=${encodeURIComponent(faces)}&frame=${frame}`;
}

/** The output filenames for one cue, relative to the output directory. */
export function filesForCue(cueId) {
  return {
    default1920: `${cueId}-default-1920.png`,
    book1920: `${cueId}-book-1920.png`,
    sideBySide1920: `${cueId}-side-by-side-1920.png`,
    default480: `${cueId}-default-480.png`,
    book480: `${cueId}-book-480.png`,
    sideBySide480: `${cueId}-side-by-side-480.png`,
  };
}

/** One manifest row: id, name, layout, the files produced, fit verdicts, and any error. */
export function manifestEntry(cue, files, verdicts, error) {
  return {
    id: cue.id,
    name: cue.name,
    layout: cue.layout,
    files,
    fit: verdicts,
    error: error || null,
  };
}

export function buildManifest(entries) {
  return {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    failed: entries.filter((entry) => entry.error).length,
    entries,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/** Relative-path, self-contained contact sheet: one section per cue, both composites. */
export function buildIndexHtml(entries) {
  const sections = entries
    .map((entry) => {
      const heading = `${escapeHtml(entry.name)} <small>${escapeHtml(entry.layout)}</small>`;
      const body = entry.error
        ? `<p class="error">${escapeHtml(entry.error)}</p>`
        : `<img src="${entry.files.sideBySide1920}" alt="${escapeHtml(entry.name)} default vs book faces at 1920 wide" loading="lazy">
      <img src="${entry.files.sideBySide480}" alt="${escapeHtml(entry.name)} default vs book faces at 480 wide" loading="lazy">`;
      return `<section><h2>${heading}</h2>${body}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<title>T3 book faces stills</title>
<style>
  body { margin: 0; padding: 24px; background: #0b1413; color: #edf5f1; font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; }
  section { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #2b423c; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  h2 small { display: block; color: #9eafa9; font-weight: 400; font-size: 12px; }
  img { display: block; max-width: 100%; margin-bottom: 10px; border: 1px solid #2b423c; }
  .error { color: #ffaaa2; }
</style>
<h1>T3 book faces stills</h1>
${sections}
`;
}

async function readRehearsalState() {
  let raw;
  try {
    raw = await readFile(REHEARSAL_STATE_FILE, "utf8");
  } catch (error) {
    if (error.code === "ENOENT")
      throw Error(`No rehearsal instance recorded at ${REHEARSAL_STATE_FILE} — start one with npm run rehearsal, or wait for the lead's instance.`);
    throw error;
  }
  const state = JSON.parse(raw);
  if (!state?.baseUrl || !state?.controlKey) throw Error(`${REHEARSAL_STATE_FILE} is missing baseUrl or controlKey.`);
  return state;
}

async function fetchCatalog(baseUrl, controlKey) {
  const response = await fetch(`${baseUrl}/api/catalog`, {
    headers: { Authorization: `Bearer ${controlKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw Error(`GET /api/catalog returned ${response.status}`);
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `work` once; on failure, waits and retries exactly once (dev-server HMR restarts). */
async function withOneRetry(work) {
  try {
    return await work();
  } catch (firstError) {
    await sleep(RETRY_DELAY_MS);
    try {
      return await work();
    } catch (secondError) {
      const detail = secondError instanceof Error ? secondError.message : String(secondError);
      const firstDetail = firstError instanceof Error ? firstError.message : String(firstError);
      throw Error(`${detail} (retry after: ${firstDetail})`);
    }
  }
}

async function launchChromium(playwrightCore) {
  try {
    return { browser: await playwrightCore.chromium.launch(), via: "bundled Chromium" };
  } catch (bundledError) {
    try {
      const browser = await playwrightCore.chromium.launch({ channel: "chrome" });
      return { browser, via: "system Chrome (channel: chrome) — bundled Chromium was unavailable" };
    } catch {
      throw bundledError;
    }
  }
}

/** One (cue, faces, frame) screenshot: opens a page, waits for [data-ready="1"], captures it. */
async function captureStage(browser, { baseUrl, controlKey, cueId, faces, frame, outPath }) {
  const height = frame === 480 ? 270 : 1080;
  const context = await browser.newContext({ viewport: { width: frame, height } });
  await context.addInitScript((key) => {
    sessionStorage.setItem("crc-control-key", key);
  }, controlKey);
  const page = await context.newPage();
  try {
    await page.goto(stillUrl(baseUrl, cueId, faces, frame), { waitUntil: "domcontentloaded" });
    const stage = page.locator('[data-ready="1"]');
    await stage.waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
    const verdict = await stage.getAttribute("data-fit");
    await stage.screenshot({ path: outPath });
    return verdict;
  } finally {
    await context.close();
  }
}

async function composeSideBySide(browser, { leftPath, rightPath, outPath, frame }) {
  const cellWidth = frame === 480 ? 480 : 960;
  const cellHeight = frame === 480 ? 270 : 540;
  const totalWidth = cellWidth * 2;
  const page = await browser.newPage({ viewport: { width: totalWidth, height: cellHeight } });
  try {
    // Inline as data: URIs rather than file:// src — a page.setContent() document has no
    // file:// origin of its own, so Chromium refuses to load local file:// image sources
    // into it ("Not allowed to load local resource"); data: URIs have no such restriction.
    const [leftBytes, rightBytes] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
    const left = `data:image/png;base64,${leftBytes.toString("base64")}`;
    const right = `data:image/png;base64,${rightBytes.toString("base64")}`;
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}
       .row{display:flex;width:${totalWidth}px;height:${cellHeight}px}
       .row img{display:block;width:${cellWidth}px;height:${cellHeight}px;object-fit:contain}</style>
       <div class="row"><img id="l" src="${left}"><img id="r" src="${right}"></div>`,
    );
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll("img"));
      return images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0);
    });
    await page.screenshot({ path: outPath });
  } finally {
    await page.close();
  }
}

async function processCue(browser, { baseUrl, controlKey, cue, outDir }) {
  const files = filesForCue(cue.id);
  const verdicts = {};
  for (const frame of FRAME_WIDTHS) {
    for (const faces of FACES) {
      const key = `${faces}${frame}`;
      const outPath = path.join(outDir, files[key]);
      verdicts[key] = await withOneRetry(() => captureStage(browser, { baseUrl, controlKey, cueId: cue.id, faces, frame, outPath }));
    }
    const sideBySideKey = `sideBySide${frame}`;
    await withOneRetry(() =>
      composeSideBySide(browser, {
        leftPath: path.join(outDir, files[`default${frame}`]),
        rightPath: path.join(outDir, files[`book${frame}`]),
        outPath: path.join(outDir, files[sideBySideKey]),
        frame,
      }),
    );
  }
  return manifestEntry(cue, files, verdicts, null);
}

async function run({ dryRun, only, out }) {
  const state = await readRehearsalState();
  const catalog = visibleCues(await fetchCatalog(state.baseUrl, state.controlKey));
  const cues = only ? catalog.filter((cue) => cue.id === only) : catalog;
  if (only && !cues.length) throw Error(`no visible published graphic with id ${only}`);

  if (dryRun) {
    for (const cue of cues) {
      for (const frame of FRAME_WIDTHS) {
        for (const faces of FACES) {
          console.log(stillUrl(state.baseUrl, cue.id, faces, frame));
        }
      }
    }
    console.log(`${cues.length} graphic(s), ${cues.length * FRAME_WIDTHS.length * FACES.length} render(s) — dry run, no browser launched.`);
    return 0;
  }

  const playwrightCore = await import("playwright-core");
  const { browser, via } = await launchChromium(playwrightCore);
  console.log(`Chromium: ${via}`);
  await mkdir(out, { recursive: true });
  const entries = [];
  try {
    for (const cue of cues) {
      try {
        entries.push(await processCue(browser, { baseUrl: state.baseUrl, controlKey: state.controlKey, cue, outDir: out }));
        console.log(`ok   ${cue.id}  ${cue.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        entries.push(manifestEntry(cue, filesForCue(cue.id), {}, message));
        console.log(`FAIL ${cue.id}  ${cue.name}: ${message}`);
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = buildManifest(entries);
  await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(out, "index.html"), buildIndexHtml(entries));
  console.log(`${entries.length - manifest.failed}/${entries.length} graphics captured cleanly. Wrote ${out}/manifest.json and ${out}/index.html.`);
  return manifest.failed ? 1 : 0;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.log(`FAIL arguments: ${error.message}`);
    return 1;
  }
  try {
    return await run(args);
  } catch (error) {
    console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] || "").href;
  } catch {
    return false;
  }
})();
if (isEntryPoint) process.exitCode = await main();
