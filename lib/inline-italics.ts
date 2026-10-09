/**
 * Italics in the congregation's own words (custom text and custom lines): `*words*` or `_words_`,
 * as in Markdown. Only custom content is read this way - siddur text keeps its asterisks, such as
 * the footnote mark in "she-asani Yisrael. *".
 *
 * At build time (lib/authoring-model.ts) the markup becomes two private-use characters, so a cue
 * carries no Markdown and nothing else in a published text can be mistaken for it. The Player draws
 * what lies between them as <em>. Plain-text readers (opening words, slot text) strip them.
 *
 * Plain type syntax only: lib/player.ts imports this file under Node's type stripping.
 */
export const ITALIC_START = '';
export const ITALIC_END = '';

// An opening mark not glued to a word before it, a closing mark not glued to one after it, and no
// space just inside either mark - so "2 * 3 * 4" and snake_case_words stay as typed.
const MARKUP = /(?<![\p{L}\p{N}*_])([*_])(?![\s*_])([^\n*_]*?[^\s*_])\1(?![\p{L}\p{N}*_])/gu;

/** `*words*` and `_words_` as italic markers; everything else exactly as typed. */
export function markItalics(text: string): string {
  return text.replace(MARKUP, (_match, _mark: string, words: string) => `${ITALIC_START}${words}${ITALIC_END}`);
}

/** The words without any italic marker, for places that show plain text. */
export function stripItalicMarks(text: string): string {
  return text.replace(/[]/g, '');
}

export type ItalicSegment = { text: string; italic: boolean };
/** The text as runs of upright and italic words, in order. An unclosed marker runs to the end. */
export function italicSegments(text: string): ItalicSegment[] {
  const segments: ItalicSegment[] = [];
  let italic = false, current = '';
  const flush = () => { if (current) segments.push({ text: current, italic }); current = ''; };
  for (const character of text) {
    if (character === ITALIC_START) { flush(); italic = true; }
    else if (character === ITALIC_END) { flush(); italic = false; }
    else current += character;
  }
  flush();
  return segments;
}

/** A built cue's words as plain text: no italic markers, and kept line breaks (U+2028) as newlines. */
export function plainCueText(text: string): string {
  return stripItalicMarks(text).replace(/\u2028/g, '\n');
}
