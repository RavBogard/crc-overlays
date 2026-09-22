import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {destinations, isCurrentDestination, visibleDestinations} from '../components/workspace-nav-model.ts';
import {findGraphics, finderState, type Cue} from '../app/services/services-data.ts';

/* X5 (Phase E): `/services` is Prepared services and `/services/log` is Service log. These are
   the facts the split turns on — the two nav pills, the console's route out of a disconnected
   service, and a finder that no longer mirrors the console's library list. */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const consolePage = read('../app/console.tsx');
const helpPage = read('../app/help/page.tsx');
const preparedPage = read('../app/services/page.tsx');
const logPage = read('../app/services/log/page.tsx');

/* ---------- the workspace navigation (handoff #2, section A) ---------- */

test('the bar carries three destinations in task order: Live, Library, System', () => {
  assert.deepEqual(destinations.map(([href, label]) => [href, label]), [
    ['/', 'Live'],
    ['/author', 'Library'],
    ['/system', 'System'],
  ]);
});

test('an Operator sees Live only; an Editor adds Library; an Administrator adds System', () => {
  assert.deepEqual(visibleDestinations('operator').map(([href]) => href), ['/']);
  assert.deepEqual(visibleDestinations('editor').map(([href]) => href), ['/', '/author']);
  assert.deepEqual(visibleDestinations('owner').map(([href]) => href), ['/', '/author', '/system']);
  // Before the role resolves the bar shows the member destination only.
  assert.deepEqual(visibleDestinations(undefined).map(([href]) => href), ['/']);
});

test('nothing that was reachable disappears: the demoted pages are one level down', () => {
  // W2B §5.6 - the editor page is `page.tsx` plus the panels lifted out of it; these assertions
  // are about the page as a whole, so they read both files as one.
  const rail = read('../app/author/page.tsx') + read('../app/author/panels.tsx');
  // D3: source review is a filter in the rail, not a link, and its old route sends bookmarks there.
  assert.ok(rail.includes('Source changes'), 'source changes is a filter in the library rail');
  assert.match(read('../app/sources-review/page.tsx'), /redirect\('\/author'\)/);
  assert.ok(rail.includes('href="/services"'), 'prepared services is in the library rail');
  assert.match(read('../app/health/page.tsx'), /redirect\('\/system#status'\)/);
  assert.match(logPage, /redirect\('\/system#log'\)/);
  const system = read('../app/system/system-client.tsx');
  for (const tab of ['Status', 'People', 'Setup', 'Log']) assert.ok(system.includes(`'${tab}'`), `System holds ${tab}`);
});

test('a page under a destination lights it, and Setup keeps its own route for an Editor', () => {
  assert.equal(isCurrentDestination('/', '/'), true);
  assert.equal(isCurrentDestination('/author', '/author/fit-check'), true, 'the fit check is Library');
  assert.equal(isCurrentDestination('/system', '/setup'), true, 'Setup is a System tab');
  assert.equal(isCurrentDestination('/author', '/'), false);
  assert.equal(isCurrentDestination('/system', '/author'), false);
});

/* ---------- where a disconnected service sends an operator ---------- */

test('the console says the output is disconnected exactly once, and offers one way to fix it', () => {
  const notices = consolePage.split('<aside className="notice"').slice(1).map(part => part.slice(0, part.indexOf('</aside>')));
  assert.equal(notices.length, 1, 'one notice carries the disconnected state; the chip carries it as state');
  const [notice] = notices;
  assert.ok(notice.includes('Output not connected'), 'it names the state plainly');
  assert.ok(notice.includes('href="/setup"'), 'and sends the operator to Setup');
  assert.ok(!notice.includes('href="/services"'), 'never to the prepared-services page');
  assert.ok(!notice.includes('Singular'), 'and never back to the previous system');
  assert.equal(consolePage.includes('Trial'), false, 'the trial pill and footer are gone from Live control');
});

test('Help sends someone recording a service problem to the log inside System', () => {
  assert.ok(helpPage.includes('<a href="/system#log">Open the service log</a>'));
  assert.ok(!helpPage.includes('<a href="/services">'));
});

/* ---------- the two pages own one panel each ---------- */

test('the log is a list with its export, and the only way to add to it is the status dot', () => {
  const list = read('../app/system/service-log-list.tsx');
  assert.ok(list.includes('/api/services?export=feedback.csv'), 'the export stayed with the log');
  assert.ok(!list.includes('<form'), 'the entry form is gone from the log itself');
  assert.ok(read('../components/status-dot.tsx').includes("operation: 'record_feedback'"), 'notes come from the dot');
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
  assert.ok(preparedPage.includes("finderStatus==='results'?<div className=\"cue-grid\">"), 'the grid is behind a non-empty query with matches');
  assert.ok(preparedPage.includes('findGraphics('), 'and the results come from the shared, tested matcher');
});

/* D1 (Phase E browser pass): a non-empty query that matches nothing must not render an empty
   grid - it renders the no-match sentence instead. `finderState` is the pure helper the page
   uses to pick between the three cases, so it is the strongest thing this harness can assert
   without a DOM renderer. */

test('finderState tells apart a blank query, a non-matching query, and a matching query', () => {
  assert.equal(finderState('', []), 'empty');
  assert.equal(finderState('   ', []), 'empty');
  assert.equal(finderState('no such prayer', []), 'none');
  assert.equal(finderState('barechu', [cue('barechu', 'Barechu')]), 'results');
});

test('a non-empty, non-matching query renders the no-match sentence, never the grid', () => {
  assert.equal(finderState('no such prayer', findGraphics(catalog, 'no such prayer')), 'none');
  assert.ok(preparedPage.includes("finderStatus==='none'?'No published graphic matches that search.'"), 'the page renders that sentence for the none case');
  assert.ok(!preparedPage.includes('<p className="empty-card">No published graphic matches that search.</p>'), 'the sentence is conditional, not a static paragraph, so it never renders alongside the grid');
});
