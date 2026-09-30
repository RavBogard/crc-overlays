// Focused browser acceptance for the text controls. Run against a local dev server:
// node scripts/check-michael-notes.mjs [http://localhost:5193]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5193';
const output = 'work/michael-notes';
await mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, headless: true } : { channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const results = [];
const he = 'הִנֵּה מַה-טּוֹב וּמַה־נָּעִים שֶׁבֶת אַחִים גַּם יָחַד';
const tr = "Hineih mah tov umah na'im.\nShevet achim gam yachad.";
const cue = (layout, presentation = {}, extra = {}) => ({ id: 'michael-acceptance', name: 'Hineih Mah Tov', layout, texts: { textTitle: 'Hineih Mah Tov', accentTextTitle: 'הִנֵּה מַה טּוֹב' }, contentRows: [{ he, tr, en: 'How good and pleasant it is to sit together.' }], animations: [], duration: { In: 0, Out: 0 }, presentation, ...extra });
async function render(value) {
  const fit = await page.evaluate((value) => window.__measureCue(value, { retainRenderedCue: true }), value);
  const measured = await page.evaluate(() => [...document.querySelectorAll('.overlay .prayer,.overlay .title,.overlay .title-watermark')].map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { className: el.className, text: el.textContent, fontSize: Number.parseFloat(s.fontSize), fontFamily: s.fontFamily, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, top: r.top, bottom: r.bottom, left: r.left, width: r.width };
  }));
  return { fit, measured };
}
try {
  await page.goto(`${base}/author/fit-stage`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__measureCue === 'function');
  await page.addStyleTag({ content: 'nextjs-portal { display:none!important }' });
  for (const layout of ['left', 'right']) {
    const defaults = await render(cue(layout));
    const large = await render(cue(layout, { hebrewFontSize: 49, transliterationFontSize: 41, translationFontSize: 41, titleFontSize: 41, largePrint: true }));
    for (const cls of ['row-hebrew', 'row-transliteration', 'row-translation']) {
      const before = defaults.measured.find((r) => r.className.includes(cls));
      const after = large.measured.find((r) => r.className.includes(cls));
      assert.ok(after.fontSize >= before.fontSize, `${layout} ${cls} shrank in Large Print`);
    }
    const positions = [];
    for (const alignment of ['top', 'center', 'bottom']) {
      const result = await render(cue(layout, { verticalAlignment: alignment, hebrewFontSize: 36, transliterationFontSize: 28, translationFontSize: 24 }));
      assert.deepEqual(result.fit.fitErrors, [], `${layout} ${alignment}: ${result.fit.fitErrors}`);
      positions.push(result.measured.find((r) => r.className.includes('row-hebrew')).top);
    }
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], `${layout} alignment did not move text`);
    results.push({ layout, normal: defaults, large, positions });
  }
  for (const [family, expected] of [['noto-sans', 'Noto Sans Hebrew'], ['david-libre', 'David Libre'], ['frank-ruhl-libre', 'Frank Ruhl Libre']]) {
    const value = cue('left', { hebrewFontFamily: family, hebrewLineHeight: 1.5, transliterationLineHeight: 1.3, translationLineHeight: 1.4, titleLineHeight: 1.1, hebrewLetterSpacing: 0.5, transliterationLetterSpacing: 1, translationLetterSpacing: 0.25, titleLetterSpacing: 0.75, keepHyphenatedWords: true, latinLineBreaks: 'preserve', verticalAlignment: 'top', legacyTitleWatermark: true });
    const result = await render(value);
    assert.deepEqual(result.fit.fitErrors, [], `${family}: ${result.fit.fitErrors}`);
    const hebrew = result.measured.find((r) => r.className.includes('row-hebrew'));
    assert.ok(hebrew.fontFamily.includes(expected));
    assert.ok(hebrew.text.includes('\u2011'));
    assert.equal(hebrew.letterSpacing, '0.5px');
    assert.ok(result.measured.find((r) => r.className.includes('row-transliteration')).text.includes("na'im.\n"));
    const accent = result.measured.find((r) => r.className.includes('title-watermark'));
    assert.ok(accent && !/[\u0591-\u05bd\u05bf-\u05c7]/.test(accent.text), 'Watermark must omit points');
    await page.screenshot({ path: `${output}/${family}.png` });
    results.push({ family, ...result });
  }
  for (const mode of ['preserve', 'paragraphs', 'phrases']) {
    const hardBreak = await render(cue('left', { latinLineBreaks: mode }, { contentRows: [{ he: 'שָׁלוֹם עֲלֵיכֶם', tr: 'Shalom aleichem...\u2028Next deliberate line', en: '' }] }));
    const text = hardBreak.measured.find((r) => r.className.includes('row-transliteration')).text;
    assert.equal(text, 'Shalom aleichem...\nNext deliberate line', `${mode} authored hard break must display as LF`);
    const lineRects = await page.evaluate(() => { const el = document.querySelector('.row-transliteration'), range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].length; });
    assert.ok(lineRects >= 2, `${mode} authored hard break must draw on two lines`);
    results.push({ hardBreakMode: mode, text, lineRects });
  }
  for (const layout of ['bottom', 'corner', 'left', 'right']) {
    const plain = cue(layout, {}, { contentRows: undefined, texts: { textTitle: 'Welcome', textMain: 'Welcome to our service.' } });
    const normal = await render(plain);
    const large = await render({ ...plain, presentation: { largePrint: true, translationFontSize: 41, titleFontSize: 41 } });
    assert.ok(large.measured.find((r) => r.className.includes('prayer')).fontSize >= normal.measured.find((r) => r.className.includes('prayer')).fontSize, `${layout} English-only Large Print shrank`);
    const custom = await render({ ...plain, presentation: { translationFontSize: 31, translationLineHeight: 1.5, translationLetterSpacing: 0.5 } });
    const body = custom.measured.find((r) => r.className.includes('prayer'));
    assert.equal(body.fontSize, 31, `${layout} English-only role size`);
    assert.equal(body.letterSpacing, '0.5px', `${layout} English-only role spacing`);
    results.push({ singleChannel: layout, normal, large, custom });
  }
  for (const layout of ['bottom', 'corner', 'left']) {
    const pureHebrew = await render(cue(layout, { hebrewFontSize: 36, hebrewFontFamily: 'david-libre' }, { contentRows: undefined, texts: { textTitle: 'Hineih Mah Tov', textMain: 'הִנֵּה מַה טּוֹב' } }));
    const body = pureHebrew.measured.find((r) => r.className.includes('combined'));
    assert.equal(body.fontSize, 36, `${layout} Hebrew-only custom role size`);
    assert.ok(body.fontFamily.includes('David Libre'), `${layout} Hebrew-only custom role font`);
    results.push({ hebrewSingleChannel: layout, ...pureHebrew });
  }
  for (const layout of ['bottom', 'left', 'right', 'corner']) {
    const titleCue = cue(layout, { legacyTitleWatermark: true, hebrewFontFamily: 'david-libre', titleFontSize: 42 }, { contentRows: undefined, texts: { textTitle: 'Shalom Aleichem', accentTextTitle: 'שָׁלוֹם עֲלֵיכֶם', textMain: 'A short reading' } });
    const title = await render(titleCue);
    const mainTitle = title.measured.find((r) => r.className.includes('title') && !r.className.includes('watermark'));
    assert.equal(mainTitle.fontSize, 42, `${layout} explicit title size must render without silent shrink`);
    const decoration = await page.evaluate(() => {
      const watermark = document.querySelector('.title-watermark'), logo = document.querySelector('.overlay .logo');
      const a = watermark.getBoundingClientRect(), b = logo.getBoundingClientRect();
      return { fontFamily: getComputedStyle(watermark).fontFamily, overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, watermark: { left: a.left, right: a.right }, logo: { left: b.left, right: b.right } };
    });
    assert.ok(decoration.fontFamily.includes('Frank Ruhl Libre'), `${layout} classic watermark must use Frank Ruhl Libre`);
    assert.equal(decoration.overlap, false, `${layout} watermark must clear logo: ${JSON.stringify(decoration)}`);
    results.push({ titleLayout: layout, title, decoration });
  }
  for (const layout of ['left', 'right']) {
    const defaultTitle = await render(cue(layout, {}, { contentRows: undefined, texts: { textTitle: 'Welcome', textMain: 'A short reading' } }));
    assert.equal(defaultTitle.measured.find((r) => r.className.includes('title')).fontSize, 34, `${layout} modest title default`);
    for (const accentTextTitle of ['', 'הַבְדָּלָה']) {
      const longTitle = await render(cue(layout, { legacyTitleWatermark: true }, { contentRows: undefined, texts: { textTitle: 'Havdalah - Wine Blessing', accentTextTitle, textMain: 'A short reading' } }));
      assert.deepEqual(longTitle.fit.fitErrors, [], `${layout} long title must fit with or without a Hebrew accent`);
    }
  }
  const longCorner = await render(cue('corner', { titleFontSize: 42 }, { contentRows: undefined, texts: { textTitle: 'A Very Long Shalom Aleichem Title', textMain: 'A short reading' } }));
  assert.equal(longCorner.measured.find((r) => r.className.includes('title')).fontSize, 42, 'corner explicit title must retain its requested size');
  assert.ok(longCorner.fit.fitErrors.some((error) => error.includes('textTitle')), 'corner reports title overflow rather than shrinking');
  results.push({ longCorner });
  for (const layout of ['left', 'right']) {
    const positions = [];
    for (const verticalAlignment of ['top', 'center', 'bottom']) {
      const result = await render(cue(layout, { verticalAlignment, hebrewFontSize: 36, transliterationFontSize: 28 }, { contentRows: undefined, texts: { textTitle: 'Hineih Mah Tov', textMainheb: he, textMainEng: tr } }));
      assert.deepEqual(result.fit.fitErrors, [], `${layout} legacy stack ${verticalAlignment}: ${result.fit.fitErrors}`);
      positions.push(result.measured.find((r) => r.className.includes('hebrew')).top);
    }
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], `${layout} legacy stack alignment`);
    results.push({ legacyStack: layout, positions });
  }
  const crowded = cue('left', { largePrint: true, hebrewFontSize: 49, transliterationFontSize: 41, translationFontSize: 41 }, { contentRows: Array.from({ length: 8 }, () => ({ he, tr, en: 'How good and pleasant it is to sit together.' })) });
  const overflow = await render(crowded);
  assert.ok(overflow.fit.fitErrors.length > 0, 'Large Print overflow must be reported');
  assert.equal(overflow.measured.find((r) => r.className.includes('row-hebrew')).fontSize, 49, 'Overflow must not silently shrink Large Print');
  results.push({ overflow });
  await writeFile(`${output}/browser-check.json`, JSON.stringify(results, null, 2));
  console.log('PASS: both panel alignments, Large Print sizes/overflow, three Hebrew fonts, role spacing, manual breaks, protected hyphens, and watermark fit.');
} finally { await browser.close(); }
