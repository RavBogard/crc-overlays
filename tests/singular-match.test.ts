import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  MATCH_CATEGORIES, classifyMatch, foldTransliteration, hebrewTokens, latinTokens, normalizeHebrew, normalizeName, prepare, rankCues, scorePair, splitPart,
  type MatchCategory, type MatchScores,
} from '../lib/companion-deck/singular-match.ts'

// Track T3. The first pass's own script and input (singular-extract.json) did not survive, so this is
// NOT a rerun of it on its inputs. What is checked: (1) the category rules, against the category and
// sub-scores the first pass recorded for each of its 540 compositions (tests/fixtures/
// singular-first-pass-categories.json: names, categories and numbers only, derived from
// work/companion-simone/crc-match.json); (2) the normalisation the report describes, on hand-built text.

type Recorded = {
  app: string; name: string; referenced: boolean; category: MatchCategory; cue: string | null
  singularPart: number | null; crcPart: number | null; comparableText: boolean; scores: MatchScores
}
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/singular-first-pass-categories.json'), 'utf8')) as { singularComps: number; referencedComps: number; matches: Recorded[] }

const count = (rows: Recorded[], pick: (r: Recorded) => MatchCategory) => {
  const out = Object.fromEntries(MATCH_CATEGORIES.map((c) => [c, 0])) as Record<MatchCategory, number>
  for (const r of rows) out[pick(r)]++
  return out
}

test('the category rules reproduce every one of the first pass\'s 540 recorded categories, so its EXACT and TEXT-MATCH counts too', () => {
  assert.equal(fixture.matches.length, 540)
  assert.equal(fixture.singularComps, 540)
  const ours = (r: Recorded) => classifyMatch(r.scores, { comparableText: r.comparableText, singularPart: r.singularPart, crcPart: r.crcPart })
  const mismatches = fixture.matches.filter((r) => ours(r) !== r.category).map((r) => `${r.app}/${r.name}: recorded ${r.category}, rules say ${ours(r)}`)
  assert.deepEqual(mismatches, [])

  const referenced = fixture.matches.filter((r) => r.referenced)
  assert.equal(referenced.length, 207)
  // The first pass's report (crc-match-report.md, executive summary), row by row.
  assert.deepEqual(count(referenced, ours), { EXACT: 34, 'TEXT-MATCH': 27, 'SAME-PRAYER-DIFFERENT-SPLIT': 23, PARTIAL: 41, 'NO-MATCH': 82 })
  assert.deepEqual(count(fixture.matches, ours), { EXACT: 107, 'TEXT-MATCH': 66, 'SAME-PRAYER-DIFFERENT-SPLIT': 64, PARTIAL: 65, 'NO-MATCH': 238 })
})

test('Hebrew: presentation forms fold (NFKD), niqqud and cantillation go, final letters fold', () => {
  // שׁ (U+FB2A) + לוֹם with a final mem, against plain שלום.
  assert.deepEqual(hebrewTokens('שׁלוֹם'), hebrewTokens('שלום'))
  assert.deepEqual(hebrewTokens('שלום'), ['שלומ'])
  // The alef-lamed ligature (U+FB4F) and a vav with dagesh (U+FB35).
  assert.equal(normalizeHebrew('ﭏ'), 'אל')
  assert.deepEqual(hebrewTokens('וּ'), ['ו'])
  // Niqqud and a cantillation mark (tipcha U+0596).
  assert.deepEqual(hebrewTokens('בְּרֵאשִׁ֖ית בָּרָא'), ['בראשית', 'ברא'])
  assert.equal(normalizeHebrew('ךםןףץ'), 'כמנפצ')
  // Without NFKD a presentation-form text would share nothing with the catalog's plain text.
  const singular = 'בָּרוּךְ אַתָּה שָׁם'
  assert.deepEqual(hebrewTokens(singular), ['ברוכ', 'אתה', 'שמ'])
})

test('transliteration: ch/kh to h, tz/ts to z, doubles collapsed, apostrophes and accents dropped', () => {
  assert.equal(foldTransliteration('chatzi'), foldTransliteration('hatzi'))
  assert.equal(foldTransliteration('kholam'), 'holam')
  assert.equal(foldTransliteration('tsur'), 'zur')
  assert.equal(foldTransliteration('shabbat'), 'shabat')
  assert.deepEqual(latinTokens("Baruch Atah, Adonai — m'kadeish ha-Shabbat"), ['baruh', 'atah', 'adonai', 'mkadeish', 'hashabat'])
  assert.deepEqual(latinTokens('Barúkh'), ['baruh'])
})

test('names: liturgical spellings and part numbers', () => {
  assert.equal(normalizeName('Shalom Aleicheim 3'), normalizeName('Shalom Aleichem 3'))
  assert.equal(normalizeName('Veehavta 1'), normalizeName("V'ahavta 1"))
  assert.equal(normalizeName('Keddusha'), normalizeName('Kedusha'))
  assert.equal(normalizeName('Readers Kaddish'), normalizeName('Chatzi Kaddish'))
  assert.deepEqual(splitPart('Adon Olam 3'), { stem: 'adon olam', part: 3 })
  assert.deepEqual(splitPart('pg 176 pt 2'), { stem: 'pg 176', part: 2 })
  assert.deepEqual(splitPart('Shalom Rav — 01 of 02'), { stem: 'shalom rav', part: 1 })
  assert.deepEqual(splitPart('Mourners Kaddish 1 of 3'), { stem: 'mourners kaddish', part: 1 })
  assert.deepEqual(splitPart('Sing the song 159'), { stem: 'sing the song 159', part: null })
})

test('scoring end to end: same text in presentation forms is EXACT, a renamed one TEXT-MATCH, a shorter part SAME-PRAYER', () => {
  const hebrew = 'בָּרוּךְ אַתָּה יְיָ אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו וְצִוָּנוּ לְהַדְלִיק נֵר שֶׁל שַׁבָּת'
  const translit = "Baruch atah Adonai Eloheinu melech haolam asher kid'shanu b'mitzvotav v'tzivanu l'hadlik ner shel Shabbat"
  const presentation = hebrew.replace(/שׁ/g, 'שׁ').replace(/שׂ/g, 'שׂ')
  const catalog = [
    prepare('Candle Lighting', hebrew.normalize('NFC').replace(/[֑-ׇ]/g, ''), translit.replace(/'/g, '')),
    prepare('Kiddush', 'בורא פרי הגפן', 'borei p\'ri hagafen'),
  ]
  const exact = rankCues(prepare('Candle LIghting', presentation, translit), catalog)
  assert.equal(exact[0].index, 0)
  assert.equal(exact[0].category, 'EXACT')
  const renamed = rankCues(prepare('Shabbat blessing', presentation, translit), catalog)
  assert.equal(renamed[0].category, 'TEXT-MATCH')
  const firstHalf = hebrew.split(' ').slice(0, 7).join(' ')
  const part = scorePair(prepare('Candle Lighting 2', firstHalf, ''), catalog[0])
  assert.equal(part.context.singularPart, 2)
  assert.equal(classifyMatch(part.scores, part.context), 'SAME-PRAYER-DIFFERENT-SPLIT')
  const nothing = rankCues(prepare('Welcome to our sanctuary', '', 'Please silence your phones'), catalog)
  assert.equal(nothing[0].category, 'NO-MATCH')
})
