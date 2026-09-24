// Golden stills for the lower third and the two side panels (packet G10): proves a change to the
// title lanes, the accent title or its branding leaves every bottom, left and right graphic
// pixel-identical when nothing new is stored. The corner card has its own (corner-golden-stills.mjs);
// this is the same recipe for the built-in layouts, each with and without a Hebrew accent title.
//
// Opens the inert measurement stage (/author/fit-stage) of a running dev server in a real Chrome
// at 1920x1080, renders each case through the stage's own `window.__measureCue`, and records per
// case the sha256 of the decoded RGBA pixels of the whole frame, the sha256 of a dump of every
// part's box and computed type, and the fit verdict.
//
// Usage (a dev server must already be running; stop it before `npm run build`):
//   npx next dev --webpack --port 5193
//   node scripts/layout-golden-stills.mjs --write <file.json>  record a baseline
//   node scripts/layout-golden-stills.mjs --check <file.json>  compare against one; exit 1 on any change
//   options: --base-url http://localhost:5193   --png-dir <dir> (keep the PNGs)
//            --typography '<json>'  draw with the workspace's branding plus this typography (for
//                                   example {"accentTitle":{"scale":1.3,"weight":600}}), as
//                                   preview_branding would; the dump then shows what moved
//
// Chrome: PLAYWRIGHT_CHROMIUM_PATH if set, otherwise the installed `chrome` channel.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const ACCENT = "עָלֵינוּ";
const HEBREW = "עָלֵינוּ לְשַׁבֵּחַ לַאֲדוֹן הַכֹּל לָתֵת גְּדֻלָּה לְיוֹצֵר בְּרֵאשִׁית";
const TRANSLIT = "Aleinu l'shabei'ach la'adon hakol, lateit g'dulah l'yotzeir b'reishit";
const ROWS = [
  { he: "עָלֵינוּ לְשַׁבֵּחַ לַאֲדוֹן הַכֹּל", tr: "Aleinu l'shabei'ach la'adon hakol", en: "It is ours to praise the Ruler of all" },
  { he: "לָתֵת גְּדֻלָּה לְיוֹצֵר בְּרֵאשִׁית", tr: "lateit g'dulah l'yotzeir b'reishit", en: "to acclaim the Creator of the world" },
];

/** Each built-in layout, with and without an accent title. */
const BASE_CASES = [
  { id: "bottom-two-columns", layout: "bottom", texts: { textTitle: "Aleinu", textMainheb: "עָלֵינוּ לְשַׁבֵּחַ לַאֲדוֹן הַכֹּל", textMainEng: "Aleinu l'shabei'ach la'adon hakol" } },
  { id: "bottom-single", layout: "bottom", texts: { textTitle: "Welcome", textMain: "Welcome to our service. Please rise." } },
  { id: "left-two-channel", layout: "left", texts: { textTitle: "Aleinu", textMainheb: HEBREW, textMainEng: TRANSLIT } },
  { id: "left-rows", layout: "left", texts: { textTitle: "Aleinu" }, contentRows: ROWS },
  { id: "right-two-channel", layout: "right", texts: { textTitle: "Aleinu", textMainheb: HEBREW, textMainEng: TRANSLIT } },
  { id: "right-rows", layout: "right", texts: { textTitle: "Aleinu" }, contentRows: ROWS },
];
export const CASES = BASE_CASES.flatMap((spec) => [spec, { ...spec, id: `${spec.id}-accent`, texts: { ...spec.texts, accentTextTitle: ACCENT } }]);

function parseArgs(argv) {
  const options = { baseUrl: "http://localhost:5193", write: null, check: null, pngDir: null, typography: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index], value = argv[index + 1];
    if (argument === "--base-url") options.baseUrl = value;
    else if (argument === "--write") options.write = value;
    else if (argument === "--check") options.check = value;
    else if (argument === "--png-dir") options.pngDir = value;
    else if (argument === "--typography") options.typography = JSON.parse(value);
    else throw new Error(`unknown argument ${argument}; supported: --base-url, --write, --check, --png-dir, --typography`);
    index++;
  }
  if (!options.write === !options.check) throw new Error("pass exactly one of --write <file> or --check <file>");
  return options;
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const cueFor = (spec) => ({ id: `golden-${spec.id}`, name: spec.id, layout: spec.layout, texts: spec.texts, animations: [], duration: { In: 0.5, Out: 0.5 }, ...(spec.contentRows ? { contentRows: spec.contentRows } : {}) });

/** The workspace's own branding as the stage builds it (lib/branding.ts), plus a candidate typography. */
async function brandingWith(baseUrl, typography) {
  if (!typography) return undefined;
  const workspace = await (await fetch(new URL("/api/workspace", baseUrl))).json();
  const stored = workspace.branding ?? {};
  return { name: workspace.shortName, organizationName: workspace.organizationName, titleColor: workspace.colors.primary, titleShade: workspace.colors.deep, accentColor: workspace.colors.accent, logo: workspace.logo.src, logoAlt: workspace.logo.alt, ...(stored.palette ? { palette: stored.palette } : {}), ...(stored.fonts && Object.keys(stored.fonts).length ? { fonts: stored.fonts } : {}), typography };
}

async function launch() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return executablePath ? chromium.launch({ executablePath, headless: true }) : chromium.launch({ channel: "chrome", headless: true });
}

async function capture(options) {
  const branding = await brandingWith(options.baseUrl, options.typography);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(new URL("/author/fit-stage", options.baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction('typeof window.__measureCue === "function"', undefined, { timeout: 120_000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    // Warm-up render, as corner-golden-stills.mjs: a fresh page's first logo paint resamples differently.
    await page.evaluate(async ({ cue, branding }) => { await window.__measureCue(cue, { retainRenderedCue: true, ...(branding ? { branding } : {}) }); await new Promise((resolve) => setTimeout(resolve, 250)); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.__disposeMeasuredCue?.(); }, { cue: cueFor(CASES[0]), branding });
    await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    const results = [];
    for (const spec of CASES) {
      const measurement = await page.evaluate(({ cue, branding }) => window.__measureCue(cue, { retainRenderedCue: true, ...(branding ? { branding } : {}) }), { cue: cueFor(spec), branding });
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.querySelectorAll("[data-fit-stage] img"), (image) => image.decode().catch(() => {})));
        await new Promise((resolve) => setTimeout(resolve, 250));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const dump = await page.evaluate(() => {
        const box = document.querySelector("[data-fit-stage] .overlay");
        const parts = Array.from(box?.querySelectorAll(".part") ?? []).map((element) => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          return {
            element: element.dataset.element, className: element.className,
            box: [rect.left, rect.top, rect.width, rect.height],
            fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, textAlign: style.textAlign, direction: style.direction,
            justifyContent: style.justifyContent, display: style.display, fontFamily: style.fontFamily,
            scroll: [element.scrollWidth, element.scrollHeight, element.clientWidth, element.clientHeight],
          };
        });
        return { className: box?.className ?? null, fit: box?.dataset.fit ?? null, parts };
      });
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      const pixelSha256 = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const digest = await crypto.subtle.digest("SHA-256", context.getImageData(0, 0, canvas.width, canvas.height).data);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }, Buffer.from(png).toString("base64"));
      await page.evaluate(() => window.__disposeMeasuredCue?.());
      if (options.pngDir) { await mkdir(options.pngDir, { recursive: true }); await writeFile(path.join(options.pngDir, `${spec.id}.png`), png); }
      results.push({ id: spec.id, pixelSha256, domSha256: sha256(JSON.stringify(dump)), fit: dump.fit, fitErrors: measurement.fitErrors, warnings: measurement.warnings, fill: measurement.fill, dump });
    }
    return { browser: browser.version(), baseUrl: options.baseUrl, cases: results };
  } finally {
    await browser.close();
  }
}

const options = parseArgs(process.argv.slice(2));
const summary = (result) => ({ id: result.id, pixelSha256: result.pixelSha256, domSha256: result.domSha256, fit: result.fit, fitErrors: result.fitErrors, warnings: result.warnings, fill: result.fill });
const baseline = options.check ? JSON.parse(await readFile(options.check, "utf8")) : null;
const matches = (result) => { const expected = baseline.cases.find((item) => item.id === result.id); return Boolean(expected) && JSON.stringify(summary(expected)) === JSON.stringify(summary(result)); };
// As corner-golden-stills.mjs: up to three fresh browser sessions, for the occasional session that
// paints the logo's downscale differently. With --typography a change is expected, so one session.
let run, attempt = 0;
do { attempt++; run = await capture(options); } while (baseline && !options.typography && attempt < 3 && !run.cases.every(matches));
if (options.write) {
  await writeFile(options.write, `${JSON.stringify({ browser: run.browser, cases: run.cases.map((result) => ({ ...summary(result), dump: result.dump })) }, null, 1)}\n`);
  for (const result of run.cases) console.log(`${result.id.padEnd(32)} ${result.pixelSha256.slice(0, 16)} ${result.fit} ${result.fitErrors.join(" ")}`);
  console.log(`wrote ${run.cases.length} cases (${run.browser}) to ${options.write}`);
} else {
  if (attempt > 1) console.log(`browser session ${attempt} of 3`);
  if (baseline.browser !== run.browser) console.log(`note: baseline browser ${baseline.browser}, this run ${run.browser}`);
  let changed = 0;
  for (const result of run.cases) {
    const expected = baseline.cases.find((item) => item.id === result.id);
    const same = matches(result);
    if (!same) changed++;
    console.log(`${same ? "identical" : "CHANGED  "} ${result.id.padEnd(32)} ${result.pixelSha256.slice(0, 16)} ${result.fit} ${result.fitErrors.join(" ")}`);
    if (!same && expected) for (const [index, part] of result.dump.parts.entries()) if (JSON.stringify(part) !== JSON.stringify(expected.dump.parts[index])) console.log(`   ${JSON.stringify(expected.dump.parts[index])}\n-> ${JSON.stringify(part)}`);
  }
  console.log(changed ? `${changed} of ${run.cases.length} cases changed` : `all ${run.cases.length} cases identical (${run.browser})`);
  process.exitCode = changed ? 1 : 0;
}
