import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {destinations, isCurrentDestination, visibleDestinations} from '../components/workspace-nav-model.ts';
import {findGraphics, type Cue} from '../app/services/services-data.ts';

/* X5 (Phase E): `/services` is Prepared services and `/services/log` is Service log. These are
   the facts the split turns on — the two nav pills, the console's route out of a disconnected
   service, and a finder that no longer mirrors the console's library list. */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const consolePage = read('../app/console.tsx');
const helpPage = read('../app/help/page.tsx');
const preparedPage = read('../app/services/page.tsx');
const logPage = read('../app/services/log/page.tsx');

/* ---------- the workspace navigation ---------- */

test('the header lists Prepared services and Service log, in that order, next to each other', () => {
  const hrefs = destinations.map(([href]) => href);
  const prepared = hrefs.indexOf('/services');
  const log = hrefs.indexOf('/services/log');
  assert.ok(prepared >= 0, 'Prepared services is in the navigation');
  assert.equal(log, prepared + 1, 'Service log follows it immediately');
  assert.deepEqual(
    destinations.filter(([href]) => href.startsWith('/services')).map(([, label]) => label),
    ['Prepared services', 'Service log'],
  );
});

test('both service pages keep the member visibility the one Services page had', () => {
  for (const role of ['owner', 'editor', 'operator'] as const) {
    const hrefs = visibleDestinations(role).map(([href]) => href);
    assert.ok(hrefs.includes('/services'), `${role} sees Prepared services`);
    assert.ok(hrefs.includes('/services/log'), `${role} sees Service log`);
  }
  // Before the role resolves, the navigation shows member pages only; both service pages are member pages.
  const anonymous = visibleDestinations(undefined).map(([href]) => href);
  assert.deepEqual(anonymous.filter(href => href.startsWith('/services')), ['/services', '/services/log']);
  assert.ok(!anonymous.includes('/author'));
});

test('the current page is marked, and Service log never marks Prepared services', () => {
  assert.equal(isCurrentDestination('/services', '/services'), true);
  assert.equal(isCurrentDestination('/services/log', '/services/log'), true);
  assert.equal(isCurrentDestination('/services', '/services/log'), false);
  assert.equal(isCurrentDestination('/services/log', '/services'), false);
});

test('each page tells the header which pill it is', () => {
  assert.ok(preparedPage.includes('current="/services"'));
  assert.ok(preparedPage.includes('title="Prepared services"'));
  assert.ok(logPage.includes('current="/services/log"'));
  assert.ok(logPage.includes('title="Service log"'));
});

/* ---------- where a disconnected service sends an operator ---------- */

test('the console disconnected banner links to the Service log', () => {
  const banner = consolePage.slice(consolePage.indexOf('<aside className="fallback"'));
  const end = banner.indexOf('</aside>');
  assert.ok(end > 0, 'the banner markup was found');
  assert.ok(banner.slice(0, end).includes('href="/services/log"'), 'the banner links to /services/log');
  assert.ok(!banner.slice(0, end).includes('href="/services"'), 'and never to the prepared-services page');
});

test('Help sends someone recording a fallback to the Service log', () => {
  assert.ok(helpPage.includes('<a href="/services/log">Record feedback in Service log</a>'));
  assert.ok(!helpPage.includes('<a href="/services">'));
});

/* ---------- the two pages own one panel each ---------- */

test('the fallback form and the CSV export live only on the Service log page', () => {
  const panel = read('../app/services/service-log-panel.tsx');
  assert.ok(panel.includes('Record an issue or fallback'));
  assert.ok(panel.includes('/api/services?export=feedback.csv'));
  assert.ok(logPage.includes('<ServiceLogPanel'));
  assert.ok(!preparedPage.includes('ServiceLogPanel'), 'Prepared services no longer carries the log');
  assert.ok(!preparedPage.includes('record_feedback'));
  assert.ok(!preparedPage.includes('export=feedback.csv'));
});

test('the names panel and an empty slot for the setlist import stay on Prepared services', () => {
  assert.ok(preparedPage.includes('<NamesListPanel'));
  assert.ok(preparedPage.includes('<SetlistImportSlot'));
  assert.ok(!logPage.includes('NamesListPanel'));
  // The slot is a reservation, not a placeholder: it renders nothing at all until G1 fills it in.
  assert.match(read('../app/services/setlist-import.tsx'), /return null;/);
});

/* ---------- the global finder searches and adds, nothing else ---------- */

const cue = (id: string, name: string, title?: string): Cue => ({id, name, title});
const catalog = [cue('barechu', 'Barechu', 'Call to worship'), cue('modeh-ani', 'Modeh Ani'), cue('shema', 'Shema Yisrael', 'שְׁמַע')];

test('an empty search finds nothing, so the finder cannot mirror the console list', () => {
  assert.deepEqual(findGraphics(catalog, ''), []);
  assert.deepEqual(findGraphics(catalog, '   '), []);
});

test('a search matches the name, the title or the graphic id, ignoring case and Hebrew points', () => {
  assert.deepEqual(findGraphics(catalog, 'barechu').map(c => c.id), ['barechu']);
  assert.deepEqual(findGraphics(catalog, 'call to').map(c => c.id), ['barechu']);
  assert.deepEqual(findGraphics(catalog, 'MODEH-ANI').map(c => c.id), ['modeh-ani']);
  assert.deepEqual(findGraphics(catalog, 'שמע').map(c => c.id), ['shema']);
  assert.deepEqual(findGraphics(catalog, 'no such prayer'), []);
});

test('the finder renders results only once something is typed', () => {
  assert.ok(preparedPage.includes('{query.trim()?<div className="cue-grid">'), 'the grid is behind a non-empty query');
  assert.ok(preparedPage.includes('findGraphics('), 'and the results come from the shared, tested matcher');
});
