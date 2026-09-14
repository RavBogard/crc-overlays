import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

/* D3 and D4 of the 2026-09-14 layout pass (handoff #2). Source review and prepared services
   were already out of the top navigation; these are the facts of where they landed — a filter
   in the library rail that exists only while it has something in it, a comparison in the
   editor's centre column, and a finder that only appears where a collection is open. */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const rail = read('../app/author/page.tsx');
const review = read('../app/author/source-review.tsx');
const prepared = read('../app/services/page.tsx');

test('Source changes is a filter beside Published, Drafts and Archived, and only when it holds something', () => {
  const tab = rail.slice(rail.indexOf('Source changes') - 400, rail.indexOf('Source changes'));
  assert.ok(tab.includes('props.sourceCount > 0 &&'), 'the filter is rendered only when the count is above zero');
  assert.ok(tab.includes('role="tab"'), 'and it is one of the rail filters, not a link away');
  assert.ok(!rail.includes('href="/sources-review"'), 'the rail no longer links to a source review page');
  assert.match(read('../app/sources-review/page.tsx'), /redirect\('\/author'\)/, 'the old route sends its bookmarks to the library');
});

test('deciding the last source change returns the rail to the library rather than leaving an empty filter lit', () => {
  assert.ok(rail.includes(`libraryTab === "sources" && !sourceReview.records.length ? "published" : libraryTab`));
});

test('the comparison is the editor centre column, and Check sources is in the rail overflow menu', () => {
  assert.ok(rail.includes('activeLibraryTab === "sources" ? <SourceReviewPanel'), 'the diff takes the centre column');
  assert.ok(rail.includes('function RailOverflow'), 'the rail has its own overflow menu');
  const menu = rail.slice(rail.indexOf('<RailOverflow'), rail.indexOf('<RailOverflow') + 400);
  assert.ok(menu.includes('Check sources'), 'and Check sources is in it');
  // The menu closes while the scan runs, so the wait and the answer both reach the notice stack.
  assert.ok(rail.includes('setMessage("Checking sources…")'), 'the wait is on screen');
  assert.ok(rail.includes('if (result.count) chooseLibraryTab("sources"); setMessage(result.message);'), 'and the answer survives the filter opening');
  assert.ok(review.includes('review-comparison'), 'the side-by-side comparison came with it');
  assert.ok(review.includes('Accept into new draft') && review.includes('Defer') && review.includes('Reject'), 'so did every decision');
});

test('the unopened-baseline line shows once per message, not on every visit', () => {
  assert.ok(review.includes('localStorage.getItem(COVERAGE_SEEN) === coverage'), 'a message already seen is not shown again');
  assert.ok(review.includes('localStorage.setItem(COVERAGE_SEEN, coverage)'), 'and seeing it is remembered');
  const open = review.slice(review.indexOf('const openFilter'));
  assert.ok(open.includes('setCoverageShown'), 'it is revealed when the filter is opened, not on the library itself');
});

test('a source review outage leaves the library alone', () => {
  const load = review.slice(review.indexOf('const load = useCallback'), review.indexOf('const inspect'));
  assert.ok(load.includes('catch { return 0; }'), 'the count simply comes back empty and the filter does not appear');
});

test('Prepared services is a rail entry for Editors and Administrators only', () => {
  const entry = rail.slice(rail.indexOf('href="/services"') - 400, rail.indexOf('href="/services"'));
  assert.ok(entry.includes('props.role === "owner" || props.role === "editor"'), 'an Operator never sees preparation work');
});

test('the global graphic finder is gone; searching and adding happen inside the open collection', () => {
  assert.equal(prepared.split('cue-finder"').length - 1, 1, 'there is one finder, not a page-level one as well');
  assert.ok(prepared.indexOf('cue-finder"') > prepared.indexOf('className="collection-work"'), 'and it sits inside the collection view');
  const finder = prepared.slice(prepared.indexOf('cue-finder"') - 160, prepared.indexOf('cue-finder"'));
  assert.ok(finder.includes('dashboard.permissions.editCollections'), 'only someone who may edit the collection sees it');
  for (const action of ['Add graphic', 'Add as alternates', 'Add as multipart']) assert.ok(prepared.includes(`>${action}<`), `${action} moved with it`);
  for (const stale of ['The global finder remains ready', 'Select graphics in the global finder', 'Search and preview graphics above'])
    assert.ok(!prepared.includes(stale), `no copy still sends anyone to a finder that no longer exists: ${stale}`);
  assert.ok(!read('../app/services/layout.tsx').includes('global graphic finder'));
});
