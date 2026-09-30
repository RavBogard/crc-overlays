import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEditable} from '../lib/authoring-model.ts';
import {displayPresentationText,keepHyphenatedWordsTogether,legacyTitleDisplay} from '../lib/player.ts';
import {TEXT_SIZE_PRESETS,withTextSize} from '../lib/template-looks.ts';

test('new typography fields survive draft validation and reject out-of-range values',()=>{
 const presentation={translationFontSize:35,hebrewLineHeight:1.35,transliterationLineHeight:1.2,translationLineHeight:1.4,titleLineHeight:1.1,hebrewLetterSpacing:0.5,transliterationLetterSpacing:1,translationLetterSpacing:0.25,titleLetterSpacing:0.75,hebrewFontFamily:'frank-ruhl-libre',verticalAlignment:'bottom',legacyTitleWatermark:true,keepHyphenatedWords:true,largePrint:true} as const;
 assert.deepEqual(parseEditable({presentation},true).presentation,presentation);
 for(const invalid of [{translationFontSize:19},{hebrewLineHeight:2.1},{translationLetterSpacing:-2.1},{hebrewFontFamily:'unknown'},{verticalAlignment:'middle'},{legacyTitleWatermark:'true'},{keepHyphenatedWords:1}]){
  assert.throws(()=>parseEditable({presentation:invalid},true));
 }
});

test('Large Print preserves larger authored values and sets floors for every role',()=>{
 const presentation={hebrewFontSize:52,transliterationFontSize:47,translationFontSize:44,titleFontSize:42,hebrewFontFamily:'david-libre' as const};
 assert.deepEqual(withTextSize(presentation,'large'),{...presentation,largePrint:true});
 assert.deepEqual(withTextSize({translationFontSize:20},'large'),{...TEXT_SIZE_PRESETS.large.sizes,largePrint:true});
 assert.deepEqual(withTextSize(withTextSize(presentation,'large'),'comfortable'),{hebrewFontFamily:'david-libre'});
});

test('display-only wrapping protects pointed Hebrew and Latin compounds without changing absent-field text',()=>{
 const text='טוֹבְ-לָנוּ שלום־עלינו\nwell-being together\u00a0now';
 assert.equal(displayPresentationText(text,'textMainEng',undefined),text);
 assert.equal(displayPresentationText(text,'textMainEng',{latinLineBreaks:'preserve'}),text);
 assert.equal(keepHyphenatedWordsTogether(text),'טוֹבְ‑לָנוּ שלום\u2060־\u2060עלינו\nwell‑being together\u00a0now');
 assert.equal(legacyTitleDisplay('הִנֵּה מַה טּוֹב'), 'הנה מה טוב');
 assert.equal(text,'טוֹבְ-לָנוּ שלום־עלינו\nwell-being together\u00a0now');
});

test('authored hard break remains a new line through every Latin display mode',()=>{
 const cueText='First soft line\ncontinued\u2028Next deliberate line';
 assert.equal(displayPresentationText(cueText,'textMainEng',{latinLineBreaks:'preserve'}),'First soft line\ncontinued\nNext deliberate line');
 assert.equal(displayPresentationText(cueText,'textMainEng',{latinLineBreaks:'paragraphs'}),'First soft line continued\nNext deliberate line');
 assert.equal(displayPresentationText(cueText,'textMainEng',{latinLineBreaks:'phrases'}),'First soft line · continued\nNext deliberate line');
});
