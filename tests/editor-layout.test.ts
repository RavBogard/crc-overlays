import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

/* Layout pass (handoff #2, C1-C5): three cards with one treatment, one Source filter, slides
   rather than panels, a toolbar that keeps only undo and redo, and Publish in one click. */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
// W2B §5.6 - the editor page is `page.tsx` plus the panels lifted out of it; these assertions
// are about the page as a whole, so they read both files as one.
const editor = read('../app/author/page.tsx') + read('../app/author/panels.tsx');
const siddur = read('../app/author/siddur-editor.tsx');
const custom = read('../app/author/custom-editor.tsx');
const look = read('../app/author/look-drawer.tsx');
const card = read('../app/author/editor-card.tsx');

test('Text, Name and Look are the same object: numbered, collapsible, with a real chevron', () => {
  assert.ok(card.includes('<ChevronDown'), 'the card has a chevron');
  assert.ok(card.includes('aria-expanded={open}'), 'and says whether it is open');
  assert.ok(siddur.includes('<EditorCard number={1} title="Text"'), 'Text is card 1');
  assert.ok(custom.includes('<EditorCard number={2} title="Name"'), 'Name is card 2');
  assert.ok(look.includes('<EditorCard number={3} title="Look"'), 'Look is card 3');
  assert.ok(custom.includes('<EditorCard number={1} title="Text"'), 'a custom graphic writes its text in card 1 too');
});

test('Look opens expanded, and closed it still says what the look is', () => {
  assert.ok(!look.includes('defaultOpen={false}'), 'it opens with the graphic');
  assert.ok(look.includes('summary={lookSummary(form, selectedDensity, artworkName)}'), 'closed, it carries its summary');
  assert.ok(!look.includes('<details className="look-drawer"'), 'the unlabelled drawer marker is gone');
  assert.ok(card.includes('{open ? lede && <p>{lede}</p> : summary && <p>{summary}</p>}'), 'the summary replaces the lede while closed');
});

test('one Source filter replaces the two near-identical dropdowns', () => {
  const filters = siddur.slice(siddur.indexOf('className="source-filters"'), siddur.indexOf('{!props.source ?'));
  assert.equal((filters.match(/<select/g) ?? []).length, 1, 'one select');
  assert.ok(filters.includes('<label>Source<select'), 'labelled Source');
  assert.equal((filters.match(/<optgroup/g) ?? []).length, 2, 'books and services grouped inside it');
  assert.ok(!filters.includes('All books') && !filters.includes('All services'), 'and one "Everything" rather than two "All" options');
});

test('the search runs as you type, so there is no Search button to press', () => {
  assert.ok(siddur.includes('setTimeout(() => { setSearchedQuery(typed); latestSearch.current(); }, 350)'), 'debounced');
  assert.ok(siddur.includes('if (typed.length < 2) return;'), 'and never on a single character');
  const row = siddur.slice(siddur.indexOf('className="siddur-search-row"'), siddur.indexOf('className="source-filters"'));
  assert.ok(!row.includes('>Search<'), 'no Search button');
  assert.ok(siddur.includes('if (event.key === "Enter")'), 'Enter still runs it at once');
});

test('the editor says Slide, where Panel now means only the layout', () => {
  assert.ok(siddur.includes('>Slide {index + 1}<') && siddur.includes('>+ Add slide<') && siddur.includes('>Remove slide {props.activeGroup + 1}<'));
  assert.ok(!/>Panel \{index \+ 1\}</.test(siddur) && !siddur.includes('>+ Add panel<'));
  assert.ok(!editor.includes('assigned to this panel'), 'and the refusal says slide too');
});

test('the toolbar keeps undo and redo; everything rare is one overflow menu', () => {
  const tools = editor.slice(editor.indexOf('<div className="editor-tools">'), editor.indexOf('function SlideStrip('));
  assert.ok(tools.includes('title="Undo"') && tools.includes('title="Redo"'), 'undo and redo stay');
  assert.ok(tools.includes('<EditorOverflow'), 'and the rest is a menu');
  for (const label of ['"Duplicate"', '"History"', '"Archive"']) assert.ok(tools.includes(`label: ${label}`), `${label} moved into it`);
  assert.ok(!tools.includes('<History size={16} /> History</button>'), 'History is no longer its own toolbar button');
});

test('Publish is one click from a saved draft, with no Review step before it', () => {
  assert.ok(!editor.includes('Review saved version'), 'the review state is gone');
  assert.ok(!editor.includes('Publish this version'), 'and so is the relabel');
  assert.ok(!editor.includes('Nothing has been published yet'), 'and the toast that said so');
  assert.ok(editor.includes('const publishable = Boolean(props.draft) && !props.dirty && (props.draft!.version > (props.draft!.activeDraftVersion ?? 0));'),
    'Publish is offered when a saved version is newer than the published one');
  assert.ok(editor.includes('void loadExactPreview(draft)'), 'the frame shows the exact saved render without being asked');
  assert.ok(editor.includes('`Published version ${response.revision.draftVersion}.`'), 'and the toast afterwards names the version');
});

test('a fit problem still blocks publication', () => {
  assert.ok(editor.includes('if (!draft || dirty || fitErrors.length) return;'), 'the action refuses');
  assert.ok(editor.includes('Fix fit issues to publish'), 'and the dock says why');
});
