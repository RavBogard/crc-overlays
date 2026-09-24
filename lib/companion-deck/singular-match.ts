// Content-based matching of Singular.live compositions to published cues (Track T3).
//
// The first conversion pass (work/companion-simone/crc-match-report.md, 15 September 2026) matched
// Simone's 540 Singular compositions to CRC's catalog by name and by text. Its script and its input
// (singular-extract.json) did not survive, so this is a re-implementation from the report's written
// method, not a copy:
//   - Hebrew: NFKD (Singular stores Hebrew presentation forms U+FB1D-FB4F; NFKD folds them to base
//     letters), U+0591-U+05C7 stripped (cantillation, niqqud and the marks between them), final letters
//     folded (ך ם ן ף ץ to כ מ נ פ צ), compared as token sets and by sequence;
//   - Latin / transliteration: lower-cased, de-accented, apostrophes and punctuation dropped, ch/kh to h,
//     tz/ts to z, doubled letters collapsed;
//   - names: normalised the same way plus a liturgical-spelling table, compared by sequence ratio,
//     token-set Jaccard and a vowel-stripped consonant skeleton; a trailing part number ("X 2",
//     "pt 2", "1 of 3", "— 01 of 02") is split off so the prayer (the stem) is compared on its own;
//   - containment: the share of the shorter side's words found in the longer side, so a short panel
//     inside a longer cue (or the reverse) reads as a pagination difference, not a miss.
// classifyMatch() holds the first pass's category rules, recovered from the 540 categories and
// sub-scores it recorded (crc-match.json); tests/singular-match.test.ts checks every one of them.

export type MatchCategory = 'EXACT' | 'TEXT-MATCH' | 'SAME-PRAYER-DIFFERENT-SPLIT' | 'PARTIAL' | 'NO-MATCH'
export const MATCH_CATEGORIES: readonly MatchCategory[] = ['EXACT', 'TEXT-MATCH', 'SAME-PRAYER-DIFFERENT-SPLIT', 'PARTIAL', 'NO-MATCH']

export type MatchScores = {
  nameScore: number
  stemScore: number
  hebScore: number
  latScore: number
  /** max(hebScore, latScore), as the first pass recorded it. */
  textScore: number
  containment: number
  combined: number
}
export type MatchContext = {
  /** Both sides carry text in a script they share. Without it only the names can be compared. */
  comparableText: boolean
  /** Trailing part numbers of the composition and of the cue, or null when a name has none. */
  singularPart: number | null
  crcPart: number | null
}

/**
 * The first pass's categories, in its order of precedence. Thresholds were read off its recorded
 * scores: every EXACT had name >= 0.909 and text >= 0.806, every TEXT-MATCH text >= 0.722 and
 * containment >= 0.824, every PARTIAL combined >= 0.45, and a composition with no comparable text was
 * judged on its name and stem alone.
 */
export function classifyMatch(s: MatchScores, ctx: MatchContext): MatchCategory {
  const split = ctx.singularPart !== ctx.crcPart
  if (!ctx.comparableText) {
    if (s.nameScore >= 0.95) return 'EXACT'
    if (s.stemScore >= 0.9 && split) return 'SAME-PRAYER-DIFFERENT-SPLIT'
    if (s.stemScore >= 0.8) return 'PARTIAL'
    return 'NO-MATCH'
  }
  if (s.nameScore >= 0.9 && s.textScore >= 0.8) return 'EXACT'
  if (s.textScore >= 0.72 && s.containment >= 0.82) return 'TEXT-MATCH'
  if (s.stemScore >= 0.9 && split && s.containment >= 0.3) return 'SAME-PRAYER-DIFFERENT-SPLIT'
  if (s.stemScore >= 0.8 && s.containment >= 0.55) return 'SAME-PRAYER-DIFFERENT-SPLIT'
  if (s.nameScore >= 0.95 && s.containment >= 0.3) return 'SAME-PRAYER-DIFFERENT-SPLIT'
  if (s.combined >= 0.45) return 'PARTIAL'
  return 'NO-MATCH'
}

/* ---------------------------------------------------------- normalisation --- */

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

/** Hebrew as the first pass compared it: NFKD, U+0591-U+05C7 stripped, final letters folded. */
export function normalizeHebrew(text: string): string {
  return String(text ?? '').normalize('NFKD').replace(/[֑-ׇ]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c])
}
/** The Hebrew words of a text, normalised. */
export function hebrewTokens(text: string): string[] {
  return normalizeHebrew(text).match(/[א-ת]+/g) ?? []
}

/** One Latin word as the first pass compared transliteration: ch/kh to h, tz/ts to z, doubles collapsed. */
export function foldTransliteration(word: string): string {
  return word.replace(/[ck]h/g, 'h').replace(/t[zs]/g, 'z').replace(/([a-z])\1+/g, '$1')
}
const latinBase = (text: string) =>
  String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’‘`ʼ׳-]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
/** The Latin words of a text, normalised and folded. */
export function latinTokens(text: string): string[] {
  const base = latinBase(text)
  return base ? base.split(' ').filter((w) => /[a-z]/.test(w)).map(foldTransliteration) : []
}

/** Liturgical spellings that name the same thing (the first pass's equivalence table, as its report lists it). */
const SPELLINGS: [RegExp, string][] = [
  [/\baleicheim\b/g, 'aleichem'],
  [/\b(?:veehavta|veahavta|vahavta)\b/g, 'vahavta'],
  [/\b(?:readers|hatzi|chatzi|hatsi|chatsi)\b/g, 'chatzi'],
  [/\b(?:keddusha|kedushah|kiddusha|kedusha)\b/g, 'kedusha'],
  [/\b(?:veshamru|vshamru)\b/g, 'vshamru'],
  [/\b(?:shecheyanu|shehechiyanu|shehecheyanu)\b/g, 'shehecheyanu'],
  [/\b(?:barechu|barchu|barekhu)\b/g, 'barchu'],
  [/\b(?:haskiveinu|hashkiveinu|hashkivenu)\b/g, 'hashkiveinu'],
  [/\b(?:gvurot|gevurot)\b/g, 'gevurot'],
  [/\bmi sheberach\b/g, 'mi shebeirach'],
  [/\blecha dodi\b/g, 'lcha dodi'],
  [/\b(?:mourners|mourner s)\b/g, 'mourners'],
]
/** A composition or cue name normalised for comparison. */
export function normalizeName(name: string): string {
  let n = latinBase(name)
  for (const [re, to] of SPELLINGS) n = n.replace(re, to)
  return n.replace(/\s+/g, ' ').trim()
}

const PART = /(?:^|\s)(?:(?:pt|part)\.?\s*)?(\d{1,2})(?:\s*of\s*\d{1,2})?\s*$/
/** Split a trailing part number off a name: "Adon Olam 3" is stem "adon olam", part 3. */
export function splitPart(name: string): { stem: string; part: number | null } {
  const n = normalizeName(name)
  const m = PART.exec(n)
  if (!m) return { stem: n, part: null }
  const stem = n.slice(0, m.index).trim()
  return stem ? { stem, part: Number(m[1]) } : { stem: n, part: null }
}

/* ----------------------------------------------------------------- scores --- */

function lcs<T>(a: readonly T[], b: readonly T[]): number {
  if (!a.length || !b.length) return 0
  let prev = new Array<number>(b.length + 1).fill(0), cur = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}
/** Sequence ratio 2·M / (|a| + |b|), M the longest common subsequence (difflib's measure, in spirit). */
export function sequenceRatio<T>(a: readonly T[], b: readonly T[]): number {
  return a.length + b.length ? (2 * lcs(a, b)) / (a.length + b.length) : 0
}
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a), B = new Set(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const x of A) if (B.has(x)) common++
  return common / (A.size + B.size - common)
}
/** The share of the smaller word set found in the larger one. */
export function containment(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a), B = new Set(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const x of A) if (B.has(x)) common++
  return common / Math.min(A.size, B.size)
}
const round = (n: number) => Math.round(n * 1000) / 1000
const skeleton = (n: string) => n.replace(/[aeiouy\s]/g, '')

export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const chars = sequenceRatio([...a], [...b]), words = jaccard(a.split(' '), b.split(' '))
  const sa = skeleton(a), sb = skeleton(b)
  const skel = sa.length >= 3 && sb.length >= 3 ? sequenceRatio([...sa], [...sb]) : 0
  return Math.max(chars, words, skel)
}

/** Text prepared once per side: its name, stem, part and word sets. */
export type Prepared = { name: string; stem: string; part: number | null; heb: string[]; lat: string[] }
export function prepare(name: string, hebrewSide: string, latinSide: string): Prepared {
  const { stem, part } = splitPart(name)
  return { name: normalizeName(name), stem, part, heb: hebrewTokens(hebrewSide), lat: latinTokens(latinSide) }
}

/** Score one composition against one cue. The sequence part of the text score is the expensive one; pass `sequence:false` to rank first. */
export function scorePair(s: Prepared, c: Prepared, options: { sequence?: boolean } = {}): { scores: MatchScores; context: MatchContext } {
  const nameScore = nameSimilarity(s.name, c.name)
  const stemScore = nameSimilarity(s.stem, c.stem)
  const bothHeb = s.heb.length > 0 && c.heb.length > 0, bothLat = s.lat.length > 0 && c.lat.length > 0
  const seq = options.sequence !== false
  const hebScore = bothHeb ? Math.max(jaccard(s.heb, c.heb), seq ? sequenceRatio(s.heb, c.heb) : 0) : 0
  const latScore = bothLat ? Math.max(jaccard(s.lat, c.lat), seq ? sequenceRatio(s.lat, c.lat) : 0) : 0
  const textScore = Math.max(hebScore, latScore)
  const cont = bothHeb ? containment(s.heb, c.heb) : bothLat ? containment(s.lat, c.lat) : 0
  const comparableText = bothHeb || bothLat
  // The first pass's recorded combined score fits 0.45·name + 0.55·text where both sides have text and
  // 0.9·name where they do not (checked on its EXACT and name-only rows); it weighed split cases
  // differently in ways the report does not give, so those are not reproduced.
  const combined = comparableText ? 0.45 * nameScore + 0.55 * textScore : 0.9 * nameScore
  return {
    scores: { nameScore: round(nameScore), stemScore: round(stemScore), hebScore: round(hebScore), latScore: round(latScore), textScore: round(textScore), containment: round(cont), combined: round(combined) },
    context: { comparableText, singularPart: s.part, crcPart: c.part },
  }
}

export type RankedMatch = { index: number; scores: MatchScores; context: MatchContext; category: MatchCategory }

/**
 * Rank every cue against one composition: a cheap pass without sequence ratios, then the full score
 * for the best `refine` of them. Returns the refined ones, best first (by category, then combined).
 */
export function rankCues(s: Prepared, cues: readonly Prepared[], refine = 8): RankedMatch[] {
  const cheap = cues.map((c, index) => ({ index, ...scorePair(s, c, { sequence: false }) }))
  cheap.sort((a, b) => b.scores.combined - a.scores.combined || a.index - b.index)
  const order = (c: MatchCategory) => MATCH_CATEGORIES.indexOf(c)
  return cheap.slice(0, refine).map(({ index }) => {
    const { scores, context } = scorePair(s, cues[index])
    return { index, scores, context, category: classifyMatch(scores, context) }
  }).sort((a, b) => order(a.category) - order(b.category) || b.scores.combined - a.scores.combined || a.index - b.index)
}
