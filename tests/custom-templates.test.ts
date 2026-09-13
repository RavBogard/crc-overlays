import assert from 'node:assert/strict';
import test from 'node:test';
import {CUSTOM_TEMPLATES, type CustomTemplate} from '../lib/custom-templates.ts';

const byId = (id: CustomTemplate['id']) => {
  const template = CUSTOM_TEMPLATES.find(item => item.id === id);
  assert.ok(template, `${id} is present`);
  return template!;
};

test('a scripture citation prints its folio only when there is one', () => {
  const citation = byId('citation');
  assert.equal(citation.compose({passage: 'Genesis 22:1–19', page: '70'}).text, 'Genesis 22:1–19 · p. 70');
  const noPage = citation.compose({passage: 'Genesis 22:1–19'}).text;
  assert.equal(noPage, 'Genesis 22:1–19');
  assert.ok(!noPage.includes('p.'));
  assert.equal(citation.compose({passage: 'Genesis 22:1–19', page: '   '}).text, 'Genesis 22:1–19');
  assert.equal(citation.compose({passage: 'Genesis 22:1–19'}).title, 'Torah reading');
});

test('a speaker card is a name over a role, and an announcement a heading over a message', () => {
  assert.deepEqual(byId('speaker').compose({name: 'Rabbi Miriam Cohen', role: 'Guest speaker'}), {
    name: 'Speaker · Rabbi Miriam Cohen',
    title: 'Rabbi Miriam Cohen',
    text: 'Guest speaker',
  });
  const announcement = byId('announcement').compose({body: 'Kiddush follows in the social hall.'});
  assert.equal(announcement.title, 'Announcement');
  assert.equal(announcement.text, 'Kiddush follows in the social hall.');
});

test('service begins at is a fixed title over a static time', () => {
  const composed = byId('service-begins').compose({time: '10:30 AM'});
  assert.equal(composed.title, 'Service begins at');
  assert.equal(composed.text, '10:30 AM');
});

test('every template composes inside the draft limits, even at maximum input', () => {
  for (const template of CUSTOM_TEMPLATES) {
    assert.ok(['bottom', 'left', 'right'].includes(template.layout), `${template.id} has a real layout`);
    assert.ok(template.fields.length > 0, `${template.id} has fields`);
    const maxed = Object.fromEntries(template.fields.map(field => [field.key, 'W'.repeat(field.maxLength)]));
    const composed = template.compose(maxed);
    assert.ok(composed.text.length <= 4000, `${template.id} text ${composed.text.length}`);
    assert.ok(composed.title.length <= 100, `${template.id} title ${composed.title.length}`);
    assert.ok(composed.name.length <= 80, `${template.id} name ${composed.name.length}`);
    const empty = template.compose({});
    assert.ok(empty.title.length <= 100 && empty.text.length <= 4000 && empty.name.length <= 80);
  }
});
