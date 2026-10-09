import type {Cue} from './player';
import {plainCueText} from './inline-italics.ts';

/**
 * Layout pass (handoff #2, B) — the second line of a row in the graphics list.
 *
 * The layout name was there before, and it is the same on most rows: it cannot tell
 * "Mourners Kaddish 1" from "Mourners Kaddish 2". The opening words can, because they are
 * what the congregation is about to read. Transliteration first — it is the line an operator
 * scanning the list can actually read — then Hebrew, then the translation.
 */
export function openingWords(cue: Cue, max = 60): string {
  const row = (cue.contentRows ?? []).find(item => item.tr.trim() || item.he.trim() || item.en.trim());
  const source = row
    ? row.tr.trim() || row.he.trim() || row.en.trim()
    : cue.texts.textMainEng || cue.texts.textMain || cue.texts.textMainheb || cue.texts.textTranslation || '';
  const line = plainCueText(source).split(/\r?\n/).map(value => value.trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
