// Golden stills for the corner card (packet L1, R-L2): proves a change to the corner's CSS or fit
// leaves every published corner card pixel-identical.
//
// Opens the inert measurement stage (/author/fit-stage) of a running dev server in a real Chrome
// at 1920x1080, renders each case below through the stage's own `window.__measureCue` (the same
// Player.render, asset wait, applyFit and fit verdict the server fit check runs), and records per
// case: the sha256 of the decoded RGBA pixels of the whole frame, the sha256 of a dump of every
// part's box, computed font size, alignment and transform origin, and the fit verdict.
//
// Usage (a dev server must already be running; stop it before `npm run build`):
//   npx next dev --port 5193                                   (set WORKSPACE_ID=tbi for TBI)
//   node scripts/corner-golden-stills.mjs --write <file.json>  record a baseline
//   node scripts/corner-golden-stills.mjs --check <file.json>  compare against one; exit 1 on any change
//   options: --base-url http://localhost:5193   --png-dir <dir> (keep the PNGs, e.g. in a scratch dir)
//
// Chrome: PLAYWRIGHT_CHROMIUM_PATH if set, otherwise the installed `chrome` channel. The dev server
// must be the webpack one (`next dev --webpack`) in a worktree whose node_modules is a junction:
// Turbopack refuses a node_modules that points outside the project root.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const HEBREW_RESPONSE = "וְאִמְרוּ אָמֵן";
const HEALING = "אֵל נָא רְפָא נָא לָהּ";

/** Each case is one corner cue as the catalog would carry it. */
export const CASES = [
  { id: "short-line", texts: { textTitle: "Response", textMain: "Vaimru Amen" } },
  { id: "two-lines", texts: { textTitle: "Thank you", textMain: "Thank you for joining us\nShabbat shalom" } },
  { id: "hebrew-transliteration", texts: { textTitle: "Response", textMainheb: HEBREW_RESPONSE, textMainEng: "Vaimru Amen" } },
  { id: "hebrew-transliteration-accent-title", texts: { textTitle: "For healing", accentTextTitle: "מִי שֶׁבֵּרַךְ", textMainheb: HEALING, textMainEng: "El Na Refa Na La" } },
  { id: "long-english-shrinks", texts: { textTitle: "Thank you", textMain: "Thank you for joining us this morning. Learn more about our community at centralreform.org" } },
  { id: "overflow-at-floor", texts: { textTitle: "Too long", textMain: "word ".repeat(60).trim() } },
  { id: "long-hebrew-transliteration-shrinks", texts: { textTitle: "Response", textMainheb: "בָּרוּךְ שֵׁם כְּבוֹד מַלְכוּתוֹ לְעוֹלָם וָעֶד בָּרוּךְ", textMainEng: "Baruch shem k'vod malchuto l'olam va'ed, baruch hu" } },
  { id: "hebrew-lone-line", texts: { textTitle: "Response", textMain: HEBREW_RESPONSE } },
  { id: "custom-hebrew-over-latin", texts: { textTitle: "Response", textMain: `${HEBREW_RESPONSE}\nVaimru Amen` } },
  { id: "english-channel-alone", texts: { textTitle: "Response", textMainEng: "Vaimru Amen" } },
  { id: "translation-channel-alone", texts: { textTitle: "Response", textTranslation: "And let us say: Amen" } },
  { id: "hebrew-channel-alone", texts: { textTitle: "Response", textMainheb: HEALING } },
  { id: "no-title", texts: { textMainheb: HEBREW_RESPONSE, textMainEng: "Vaimru Amen" } },
  { id: "long-title", texts: { textTitle: "A very long title for a corner card that will not fit its strip", textMain: "Vaimru Amen" } },
  {
    id: "presentation-overrides",
    texts: { textTitle: "Response", textMainheb: HEBREW_RESPONSE, textMainEng: "Vaimru Amen" },
    presentation: { hebrewFontSize: 44, transliterationFontSize: 26, titleFontSize: 24, alignment: "center", lineSpacing: "compact" },
  },
  {
    id: "phrases-spacious",
    texts: { textTitle: "Thank you", textMain: "Thank you for joining us\nShabbat shalom" },
    presentation: { latinLineBreaks: "phrases", lineSpacing: "spacious" },
  },
];

function parseArgs(argv) {
  const options = { baseUrl: "http://localhost:5193", write: null, check: null, pngDir: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index], value = argv[index + 1];
    if (argument === "--base-url") options.baseUrl = value;
    else if (argument === "--write") options.write = value;
    else if (argument === "--check") options.check = value;
    else if (argument === "--png-dir") options.pngDir = value;
    else throw new Error(`unknown argument ${argument}; supported: --base-url, --write, --check, --png-dir`);
    index++;
  }
  if (!options.write === !options.check) throw new Error("pass exactly one of --write <file> or --check <file>");
  return options;
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const cueFor = (spec) => ({ id: `golden-${spec.id}`, name: spec.id, layout: "corner", texts: spec.texts, animations: [], duration: { In: 0.5, Out: 0.5 }, ...(spec.presentation ? { presentation: spec.presentation } : {}) });

async function launch() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return executablePath ? chromium.launch({ executablePath, headless: true }) : chromium.launch({ channel: "chrome", headless: true });
}

async function capture(options) {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(new URL("/author/fit-stage", options.baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction('typeof window.__measureCue === "function"', undefined, { timeout: 120_000 });
    // The dev server's own indicator is not part of the frame; its badge changes with compile state.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    // Warm-up: the first time a fresh page paints the logo it resamples it differently (168 logo
    // pixels differ from every later paint of the same image), so one throwaway render goes first.
    await page.evaluate(async (cue) => { await window.__measureCue(cue, { retainRenderedCue: true }); await new Promise((resolve) => setTimeout(resolve, 250)); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.__disposeMeasuredCue?.(); }, cueFor(CASES[0]));
    await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    const results = [];
    for (const spec of CASES) {
      const measurement = await page.evaluate((cue) => window.__measureCue(cue, { retainRenderedCue: true }), cueFor(spec));
      // The logo decoded and two animation frames painted before the capture: Chrome can paint a
      // just-decoded, downscaled image with a cheaper filter first, which made the logo's pixels
      // differ run to run.
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
            fontSize: style.fontSize, lineHeight: style.lineHeight, textAlign: style.textAlign, direction: style.direction,
            justifyContent: style.justifyContent, display: style.display, transformOrigin: style.transformOrigin, fontFamily: style.fontFamily,
            scroll: [element.scrollWidth, element.scrollHeight, element.clientWidth, element.clientHeight],
          };
        });
        const before = box ? getComputedStyle(box, "::before").display : null;
        return { className: box?.className ?? null, fit: box?.dataset.fit ?? null, before, parts };
      });
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      // Hash decoded pixels, not PNG bytes, so an encoder difference can never pass for a change.
      const pixelSha256 = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const digest = await crypto.subtle.digest("SHA-256", pixels);
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
// Occasionally a whole browser session paints the logo's downscale differently (every case's logo
// pixels, nothing else; the part dump identical). A check therefore takes up to three fresh
// browser sessions and passes only if one of them matches every case exactly; it says which.
let run, attempt = 0;
do { attempt++; run = await capture(options); } while (baseline && attempt < 3 && !run.cases.every(matches));
if (options.write) {
  await writeFile(options.write, `${JSON.stringify({ browser: run.browser, cases: run.cases.map((result) => ({ ...summary(result), dump: result.dump })) }, null, 1)}\n`);
  for (const result of run.cases) console.log(`${result.id.padEnd(40)} ${result.pixelSha256.slice(0, 16)} ${result.fit}`);
  console.log(`wrote ${run.cases.length} cases (${run.browser}) to ${options.write}`);
} else {
  if (attempt > 1) console.log(`browser session ${attempt} of 3`);
  if (baseline.browser !== run.browser) console.log(`note: baseline browser ${baseline.browser}, this run ${run.browser}`);
  let changed = 0;
  for (const result of run.cases) {
    const expected = baseline.cases.find((item) => item.id === result.id);
    const same = matches(result);
    if (!same) changed++;
    console.log(`${same ? "identical" : "CHANGED  "} ${result.id.padEnd(40)} ${result.pixelSha256.slice(0, 16)} ${result.fit}`);
    if (!same && expected) for (const [index, part] of result.dump.parts.entries()) if (JSON.stringify(part) !== JSON.stringify(expected.dump.parts[index])) console.log(`   ${JSON.stringify(expected.dump.parts[index])}\n-> ${JSON.stringify(part)}`);
  }
  console.log(changed ? `${changed} of ${run.cases.length} cases changed` : `all ${run.cases.length} cases identical (${run.browser})`);
  process.exitCode = changed ? 1 : 0;
}
