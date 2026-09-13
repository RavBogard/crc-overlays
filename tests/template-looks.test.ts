import assert from 'node:assert/strict';
import test from 'node:test';
import baseline from '../lib/cues.json';
import {templateLooks, lookDescriptor, type TemplateLookSummary} from '../lib/template-looks.ts';

/** The same shape `list_templates` returns: every non-hidden baseline, in catalog order. */
const templates: TemplateLookSummary[] = (baseline as Array<{id: string; name: string; layout: string; hidden?: boolean}>)
  .filter(cue => !cue.hidden)
  .map(cue => ({id: cue.id, layout: cue.layout as TemplateLookSummary['layout'], importable: true}));

const names = new Map((baseline as Array<{id: string; name: string}>).map(cue => [cue.id, cue.name]));

test('one tile per layout, named by the look and never by a cue', () => {
  const looks = templateLooks(templates, 'bilingual');
  assert.equal(looks.length, 3);
  assert.deepEqual(looks.map(look => look.layout), ['bottom', 'left', 'right']);
  for (const look of looks) {
    const template = templates.find(item => item.id === look.id);
    assert.ok(template, `${look.layout} tile points at a baseline`);
    assert.equal(template!.layout, look.layout);
    for (const name of names.values()) assert.ok(!look.label.includes(name), `label "${look.label}" must not carry the cue name "${name}"`);
  }
});

test('each tile points at the first importable baseline of its layout in catalog order', () => {
  const looks = templateLooks(templates, 'bilingual');
  for (const look of looks) assert.equal(look.id, templates.find(item => item.layout === look.layout)!.id);
});

test('the descriptor names what goes on screen, per mode', () => {
  const left = templateLooks(templates, 'bilingual').find(look => look.layout === 'left');
  assert.equal(left?.label, 'Left panel · Hebrew + transliteration');
  const bottom = templateLooks(templates, 'custom').find(look => look.layout === 'bottom');
  assert.equal(bottom?.label, 'Lower third · one line');
  const right = templateLooks(templates, 'original-en').find(look => look.layout === 'right');
  assert.equal(right?.label, 'Right panel · English reading');
  assert.equal(lookDescriptor('custom', 'left'), 'custom text');
  assert.equal(lookDescriptor('source-en', 'bottom'), 'English reading');
  assert.equal(lookDescriptor('local-variant', 'left'), 'Hebrew + transliteration');
});

test('a layout with no importable baseline gets no tile', () => {
  const looks = templateLooks(templates.filter(item => item.layout !== 'right'), 'bilingual');
  assert.deepEqual(looks.map(look => look.layout), ['bottom', 'left']);
  assert.equal(templateLooks(templates.map(item => ({...item, importable: false})), 'bilingual').length, 0);
});
