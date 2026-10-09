import assert from 'node:assert/strict';
import test from 'node:test';
import {ITALIC_END as E,ITALIC_START as S,italicSegments,markItalics,plainCueText,stripItalicMarks} from '../lib/inline-italics.ts';

test('*words* and _words_ become italic; stray asterisks and underscores stay as typed',()=>{
  assert.equal(markItalics('For *dance* and _song_'),`For ${S}dance${E} and ${S}song${E}`);
  assert.equal(markItalics('*Praise Yah*...'),`${S}Praise Yah${E}...`);
  assert.equal(markItalics('she-asani Yisrael. *'),'she-asani Yisrael. *','a lone footnote mark');
  assert.equal(markItalics('2 * 3 * 4'),'2 * 3 * 4','spaced asterisks are arithmetic, not italics');
  assert.equal(markItalics('snake_case_word'),'snake_case_word');
  assert.equal(markItalics('*not\nacross lines*'),'*not\nacross lines*');
  assert.equal(markItalics('**'),'**');
});

test('segments, stripping and plain text',()=>{
  assert.deepEqual(italicSegments(`For ${S}dance${E} and song`),[{text:'For ',italic:false},{text:'dance',italic:true},{text:' and song',italic:false}]);
  assert.deepEqual(italicSegments(`${S}open to the end`),[{text:'open to the end',italic:true}]);
  assert.equal(stripItalicMarks(`For ${S}dance${E}`),'For dance');
  assert.equal(plainCueText(`${S}A${E} B`),'A\nB');
});
