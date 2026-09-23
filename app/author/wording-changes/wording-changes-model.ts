/** One row of `list_wording_changes` (lib/wording-changes.ts). */
export type WordingChangeRow = {
  draftId: string;
  draftName: string;
  draftTitle: string;
  published: boolean;
  archived: boolean;
  label: string;
  reason: string | null;
  sourceId: string;
  sourceName: string;
  book: string;
  folio: string | null;
  blockId: string;
  blockNumber: number | null;
  channel: "he" | "tr" | "en";
  sourceText: string;
  localText: string;
  updatedAt: number;
  updatedBy: string;
};

export type WordingChangeGroup = { sourceId: string; sourceName: string; book: string; folio: string | null; rows: WordingChangeRow[] };

/** Grouped by source, in the order the server sorted them (book, source, passage). */
export function groupWordingChanges(rows: readonly WordingChangeRow[]): WordingChangeGroup[] {
  const groups = new Map<string, WordingChangeGroup>();
  for (const row of rows) {
    let group = groups.get(row.sourceId);
    if (!group) { group = { sourceId: row.sourceId, sourceName: row.sourceName, book: row.book, folio: row.folio, rows: [] }; groups.set(row.sourceId, group); }
    group.rows.push(row);
  }
  return [...groups.values()];
}

export type DiffPart = { text: string; kind: "same" | "removed" | "added" };

/**
 * A word-level difference, so a one-letter spelling fix reads as the one word it changed. Words
 * are whitespace-separated and the whitespace stays with the word before it.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const tokens = (value: string) => value.match(/\S+\s*|\s+/g) || [];
  const a = tokens(before), b = tokens(after);
  const same = (x: string, y: string) => x.trim() === y.trim();
  // Very long lines fall back to a whole-line comparison rather than a large table.
  if (a.length * b.length > 250_000) return before === after ? [{ text: before, kind: "same" }] : [{ text: before, kind: "removed" }, { text: after, kind: "added" }];
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = same(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const parts: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text; else parts.push({ text, kind });
  };
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) { push(b[j], "same"); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) push(a[i++], "removed");
    else push(b[j++], "added");
  }
  while (i < a.length) push(a[i++], "removed");
  while (j < b.length) push(b[j++], "added");
  return parts;
}
