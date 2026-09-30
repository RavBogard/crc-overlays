/** Plain-text editing actions for a wording field. These characters survive the local variant
 * unchanged and need no new authoring markup. */
export function insertLineBreak(text: string, start: number, end: number) {
  return { text: `${text.slice(0, start)}\n${text.slice(end)}`, cursor: start + 1 };
}

/** Replace the selected phrase's wrapping spaces and hyphens with their Unicode equivalents. */
export function keepSelectionTogether(text: string, start: number, end: number) {
  if (start >= end) return null;
  const selected = text.slice(start, end);
  const joined = selected.replace(/[ \t]+/g, "\u00a0").replace(/-/g, "\u2011");
  if (joined === selected) return null;
  return { text: `${text.slice(0, start)}${joined}${text.slice(end)}`, start, end: start + joined.length };
}
