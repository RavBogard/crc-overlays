import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {openingWords} from '../lib/cue-opening.ts';
import type {Cue} from '../lib/player.ts';

/* Layout pass (handoff #2, B): Live control rebuilt for a booth laptop — the list first, one
   on-air frame, one Show per row, and two out actions that never scroll away. */

const consolePage = readFileSync(fileURLToPath(new URL('../app/console.tsx', import.meta.url)), 'utf8');
const cue = (over: Partial<Cue>): Cue => ({id: 'c', name: 'Cue', layout: 'bottom', texts: {}, animations: [], duration: {}, ...over});

/* ---------- what tells two rows apart ---------- */

test('the second line is the opening words a congregation is about to read', () => {
  assert.equal(openingWords(cue({contentRows: [{he: 'יִתְגַּדַּל', tr: 'Yitgadal v’yitkadash', en: 'Magnified and sanctified'}]})), 'Yitgadal v’yitkadash');
  assert.equal(openingWords(cue({texts: {textMainEng: 'Barechu et Adonai\nsecond line'}})), 'Barechu et Adonai', 'the first line only');
});

test('a graphic with no transliteration falls back to Hebrew, then to the translation', () => {
  assert.equal(openingWords(cue({contentRows: [{he: 'שְׁמַע', tr: '', en: 'Hear'}]})), 'שְׁמַע');
  assert.equal(openingWords(cue({contentRows: [{he: '', tr: '', en: 'Hear, O Israel'}]})), 'Hear, O Israel');
  assert.equal(openingWords(cue({})), '', 'and a graphic with no text at all says nothing');
});

test('an empty leading row is skipped, and a long line is cut rather than wrapped', () => {
  assert.equal(openingWords(cue({contentRows: [{he: '', tr: '', en: ''}, {he: '', tr: 'Mah tovu ohalecha', en: ''}]})), 'Mah tovu ohalecha');
  const long = openingWords(cue({texts: {textMain: 'a'.repeat(200)}}));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith('…'));
});

/* ---------- the list ---------- */

test('a row carries one button, and that button is Show', () => {
  const row = consolePage.slice(consolePage.indexOf('{filteredCues.length?filteredCues.map('), consolePage.indexOf(':<p role="status" className="no-matches"'));
  assert.equal((row.match(/<button/g) ?? []).length, 1, 'one button on a row');
  assert.ok(row.includes('Show ${name} live'), 'and it shows the graphic');
  assert.ok(!row.includes('Preview ${name}'), 'the per-row Preview button is gone');
  assert.ok(row.includes('onClick={()=>inspect(c.id)}'), 'the row itself previews');
  assert.ok(row.includes('openingWords(c)'), 'the second line is the opening words');
  assert.ok(row.includes('<GraphicThumbnail'), 'and the row shows the graphic');
});

test('the graphics list has no scroll region of its own; the page scrolls', () => {
  const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');
  const rules = css.slice(css.indexOf('.graphic-rows{'), css.indexOf('.graphic-row{'));
  assert.ok(!rules.includes('overflow'), 'no inner overflow');
  assert.ok(!rules.includes('max-height'), 'and no inner height cap');
});

test('the scan card is the first row of the list, not a block of its own', () => {
  const list = consolePage.indexOf('<div className="graphic-rows"');
  const scan = consolePage.indexOf('className="graphic-row scan-row"');
  const first = consolePage.indexOf('{filteredCues.length?filteredCues.map(');
  assert.ok(list < scan && scan < first, 'it is pinned above the graphics');
  assert.ok(!consolePage.includes('<h3>Scan card</h3>'), 'its separate heading is gone');
  assert.ok(!consolePage.includes('Show scan card'), 'the row toggles with Show and Hide');
  assert.ok(consolePage.includes("title={clearGuard.title||'Clear also removes the scan card and turns the resting logo off.'}"), 'the note became the Clear tooltip, and names both layers Clear removes');
});

/* The resting logo is a second pinned row, and the two rows are deliberately not one control:
   the scan card shows a QR panel with a caption and a page, the resting logo shows the
   congregation's own artwork and nothing else. A single "logo" button doing both was the thing
   the sitting asked us to stop doing. */
test('the resting logo is its own row, and never sends a scan card', () => {
  const scan = consolePage.indexOf('className="graphic-row scan-row"');
  const logo = consolePage.indexOf('<strong>Resting logo</strong>');
  const first = consolePage.indexOf('{filteredCues.length?filteredCues.map(');
  assert.ok(scan < logo && logo < first, 'it is pinned above the graphics, below the scan card');
  assert.ok(consolePage.includes("function sendLogo(on:boolean){void command('logo',undefined,undefined,{on})"), 'its button sends the logo action, with no bug attached');
  assert.ok(consolePage.includes("workspace?.restingLogo?.enabled&&"), 'and only where the congregation is configured for one');
  assert.ok(!consolePage.includes("sendBug(true)}}>{logoOn"), 'the two rows share no handler');
});

/* Preference and picture are different facts, and the row says both: the button carries the
   setting, the line under the name says whether something else is holding the mark back. */
test('the resting logo row distinguishes the setting from what is on screen', () => {
  assert.ok(consolePage.includes("const logoOn=state?.logo?.on??false;"), 'the button reads the durable preference');
  assert.ok(consolePage.includes("logoStatus==='suppressed'?'On · held back while something else is up'"), 'and a suppressed logo never reads as showing');
  assert.ok(consolePage.includes("{logoOn?'Turn off':'Turn on'}"), 'the button names the setting it changes');
});

/* ---------- the on-air panel ---------- */

test('one frame serves both jobs, and the live player is never disposed to show a preview', () => {
  const panel = consolePage.slice(consolePage.indexOf('function OnAirPanel('), consolePage.indexOf('function SignInPanel('));
  assert.ok(panel.includes('<LiveStage') && panel.includes('<StillStage'), 'both stages exist');
  assert.ok(panel.includes('data-hidden={previewing||undefined}') && panel.includes('data-hidden={!previewing||undefined}'), 'one is hidden rather than unmounted');
  const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');
  assert.ok(css.includes('.on-air-frame .stage-slot[data-hidden]{visibility:hidden}'), 'and hidden by visibility, so it keeps the width its canvas is scaled against');
  assert.ok(panel.includes('On air: {liveName||\'nothing\'}'), 'a preview still names what is on air');
  assert.ok(panel.includes('>Animate out<') && panel.includes('>Clear<'), 'the two out actions live here');
});

test('the out actions are sticky, so they never scroll away', () => {
  const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');
  assert.match(css.slice(css.indexOf('.on-air{')), /^\.on-air\{position:sticky/);
});

test('the page still says the output is disconnected exactly once', () => {
  assert.equal((consolePage.match(/Output not connected/g) ?? []).length, 1);
  assert.equal((consolePage.match(/Disconnected</g) ?? []).length, 1, 'the chip is the only other statement, and it is state');
  assert.ok(!consolePage.includes('cue-hint'), 'the keyboard hint is a tooltip on the search field');
  assert.ok(!consolePage.includes('service-picker'), 'and prepared services is not wired into Live control');
});
