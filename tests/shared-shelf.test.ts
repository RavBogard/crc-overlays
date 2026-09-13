import test from 'node:test';
import assert from 'node:assert/strict';
import {compareUpstream, groupSets, setState, shelfState, type ShelfDraft} from '../lib/shared-shelf.ts';
import type {SharedCueUpstream} from '../lib/authoring-model.ts';
import type {SharedLibraryEntry, SharedLibrarySet} from '../lib/shared-library.ts';

const HASH = (seed: string) => seed.padEnd(64, '0');

function entry(id: string, cueHash: string, set?: SharedLibrarySet): SharedLibraryEntry {
  return {
    id,
    name: id,
    title: id,
    layout: 'bottom',
    sourceIds: [],
    cueHash,
    ...(set ? {set} : {}),
    cue: {id, name: id, layout: 'bottom', texts: {}, animations: [], duration: {}},
    copySpec: {
      name: id,
      title: id,
      layout: 'bottom',
      templateCueId: 'template',
      content: {mode: 'custom', text: id},
      presentation: {},
      sourcePin: {feedSha256: HASH('feed'), unitSha256: {}, blockSha256: {}},
    },
  };
}

function copy(id: string, cueId: string, cueHash: string, archived = false): ShelfDraft {
  return {
    id,
    name: `TBI ${id}`,
    activeRevision: null,
    ...(archived ? {archivedAt: 1} : {}),
    sharedFrom: {workspaceId: 'crc', cueId, cueHash},
  };
}

const noStarters = new Map<string, string>();
const noBaseline = () => null;

test('a CRC graphic this workspace has never taken reads as New', () => {
  const entries = [entry('crc-1', HASH('a'))];
  const states = shelfState(entries, [], noStarters, noBaseline);
  assert.equal(states.get('crc-1')!.state, 'new');
  assert.deepEqual(states.get('crc-1')!.local, {drafts: []});
});

test('a copy taken at the hash CRC still publishes reads as Customized, and names the local graphic', () => {
  const entries = [entry('crc-1', HASH('a'))];
  const states = shelfState(entries, [copy('draft-1', 'crc-1', HASH('a'))], noStarters, noBaseline);
  const shelf = states.get('crc-1')!;
  assert.equal(shelf.state, 'customized');
  assert.deepEqual(shelf.local.drafts, [{id: 'draft-1', name: 'TBI draft-1', activeRevision: null, cueHash: HASH('a')}]);
});

test('a copy taken before CRC changed the graphic reads as Updated', () => {
  const entries = [entry('crc-1', HASH('b'))];
  const states = shelfState(entries, [copy('draft-1', 'crc-1', HASH('a'))], noStarters, noBaseline);
  assert.equal(states.get('crc-1')!.state, 'updated');
  assert.equal(states.get('crc-1')!.local.drafts[0].cueHash, HASH('a'));
});

test('one current copy makes the item Customized even beside older copies', () => {
  const entries = [entry('crc-1', HASH('b'))];
  const drafts = [copy('draft-old', 'crc-1', HASH('a')), copy('draft-new', 'crc-1', HASH('b'))];
  assert.equal(shelfState(entries, drafts, noStarters, noBaseline).get('crc-1')!.state, 'customized');
  assert.equal(shelfState(entries, drafts, noStarters, noBaseline).get('crc-1')!.local.drafts.length, 2);
});

test('a starter graphic that still matches its CRC original reads as Customized', () => {
  const entries = [entry('crc-1', HASH('a'))];
  const starters = new Map([['crc-1', 'tbi-1']]);
  const states = shelfState(entries, [], starters, starterCueId => (starterCueId === 'tbi-1' ? HASH('a') : null));
  assert.equal(states.get('crc-1')!.state, 'customized');
  assert.equal(states.get('crc-1')!.local.starterCueId, 'tbi-1');
});

test('a starter graphic whose CRC original has moved on reads as Updated', () => {
  const entries = [entry('crc-1', HASH('b'))];
  const starters = new Map([['crc-1', 'tbi-1']]);
  const states = shelfState(entries, [], starters, () => HASH('a'));
  assert.equal(states.get('crc-1')!.state, 'updated');
});

test('an unresolvable starter original leaves the item at New rather than guessing', () => {
  const entries = [entry('crc-1', HASH('b'))];
  const states = shelfState(entries, [], new Map([['crc-1', 'tbi-1']]), () => null);
  assert.equal(states.get('crc-1')!.state, 'new');
});

test('archiving the local copy returns the CRC graphic to New', () => {
  const entries = [entry('crc-1', HASH('a'))];
  const states = shelfState(entries, [copy('draft-1', 'crc-1', HASH('a'), true)], noStarters, noBaseline);
  assert.equal(states.get('crc-1')!.state, 'new');
  assert.deepEqual(states.get('crc-1')!.local.drafts, []);
});

test('one out-of-date member makes a whole CRC multipart graphic Updated', () => {
  const set = (index: number): SharedLibrarySet => ({id: 'crc-set', index, count: 2, title: 'Adon Olam'});
  const entries = [entry('crc-1', HASH('a'), set(1)), entry('crc-2', HASH('b2'), set(2))];
  const states = shelfState(entries, [copy('draft-1', 'crc-1', HASH('a')), copy('draft-2', 'crc-2', HASH('b1'))], noStarters, noBaseline);
  assert.equal(states.get('crc-1')!.state, 'customized');
  assert.equal(states.get('crc-2')!.state, 'updated');
  const grouped = groupSets(entries);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].entries.map(item => item.id), ['crc-1', 'crc-2']);
  assert.equal(setState(grouped[0].entries.map(item => states.get(item.id)!.state)), 'updated');
});

test('sets group in CRC order and ungrouped graphics stay out of them', () => {
  const set = (index: number): SharedLibrarySet => ({id: 'crc-set', index, count: 3, title: 'Adon Olam'});
  const entries = [entry('c', HASH('c'), set(3)), entry('solo', HASH('s')), entry('a', HASH('a'), set(1)), entry('b', HASH('b'), set(2))];
  const grouped = groupSets(entries);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].title, 'Adon Olam');
  assert.equal(grouped[0].count, 3);
  assert.deepEqual(grouped[0].entries.map(item => item.id), ['a', 'b', 'c']);
});

test('set state prefers the most urgent member state', () => {
  assert.equal(setState(['customized', 'customized']), 'customized');
  assert.equal(setState(['customized', 'new']), 'new');
  assert.equal(setState(['new', 'updated', 'customized']), 'updated');
});

test('comparing CRC wording reports changed lines, layout, and presentation separately', () => {
  const before: SharedCueUpstream = {
    layout: 'bottom',
    texts: {textTitle: 'Barechu', textMainheb: 'line one\nline two', textMainEng: 'Barechu et'},
    presentation: {titleFontSize: 40},
  };
  const after: SharedCueUpstream = {
    layout: 'left',
    texts: {textTitle: 'Barechu', textMainheb: 'line one\nline two changed', textMainEng: 'Barechu et'},
    presentation: {titleFontSize: 44},
  };
  const result = compareUpstream(before, after);
  assert.deepEqual(result.changed, {wording: true, layout: true, presentation: true});
  assert.deepEqual(result.lines.filter(line => line.changed).map(line => line.before ?? line.after), ['line two', 'line two changed']);
  assert.ok(result.lines.some(line => !line.changed && line.before === 'line one'));
});

test('an unchanged CRC graphic compares clean, and an inserted line does not move every later line', () => {
  const before: SharedCueUpstream = {layout: 'bottom', texts: {textMain: 'one\ntwo\nthree'}};
  assert.deepEqual(compareUpstream(before, structuredClone(before)).changed, {wording: false, layout: false, presentation: false});
  const after: SharedCueUpstream = {layout: 'bottom', texts: {textMain: 'one\ninserted\ntwo\nthree'}};
  const result = compareUpstream(before, after);
  assert.equal(result.changed.wording, true);
  assert.deepEqual(result.lines.filter(line => line.changed), [{after: 'inserted', changed: true}]);
  assert.equal(result.lines.filter(line => !line.changed).length, 3);
});

test('contentRows are compared as wording, and presentation alone never reads as a wording change', () => {
  const before: SharedCueUpstream = {layout: 'left', texts: {}, contentRows: [{he: 'שלום', tr: 'shalom', en: 'peace'}]};
  const after: SharedCueUpstream = {layout: 'left', texts: {}, contentRows: [{he: 'שלום', tr: 'shalom', en: 'wholeness'}]};
  assert.equal(compareUpstream(before, after).changed.wording, true);
  const restyled: SharedCueUpstream = {...structuredClone(before), presentation: {alignment: 'center'}};
  assert.deepEqual(compareUpstream(before, restyled).changed, {wording: false, layout: false, presentation: true});
});
