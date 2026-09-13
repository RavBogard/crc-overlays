// WB-C - the pure half of the CRC shelf: grouping, partitioning, badge counting and
// compare-table rows. Kept free of JSX and CSS imports so `node:test` can load it
// directly (a .tsx module that imports its stylesheet cannot be loaded by the runner).

import type { SharedShelfEntry, SharedShelfLocal, SharedShelfSetRef, SharedShelfState } from "./types";

/** The shelf uses the server shapes from app/author/types.ts directly; the aliases below keep WB-C names. */
export type { SharedShelfEntry, SharedShelfState };
export type SharedShelfSet = SharedShelfSetRef;
export type SharedLocalDraft = SharedShelfLocal["drafts"][number];

/** One card on the shelf. A whole prayer is a single card carrying its slides in order. */
export type SharedShelfCard = {
  key: string;
  kind: "single" | "set";
  lead: SharedShelfEntry;
  members: SharedShelfEntry[];
  title: string;
  subtitle: string;
  layout: string;
  state: SharedShelfState;
  slides: number;
};

export type SharedShelfSections = { fresh: SharedShelfCard[]; updated: SharedShelfCard[]; mine: SharedShelfCard[] };

export type ComparableCue = { layout: string; texts: Record<string, string>; contentRows?: Array<{ he: string; tr: string; en: string }> };
export type CompareChanged = { wording: boolean; layout: boolean; presentation: boolean };
export type CompareRow = { key: string; label: string; before: string; after: string; changed: boolean };

const TEXT_LABELS: Record<string, string> = {
  textTitle: "Title",
  accentTextTitle: "Accent title",
  textMainheb: "Hebrew",
  textMainEng: "Transliteration",
  textTranslation: "Translation",
};
const TEXT_ORDER = ["textTitle", "accentTextTitle", "textMainheb", "textMainEng", "textTranslation"];
const ROW_CHANNELS: Array<{ channel: "he" | "tr" | "en"; label: string }> = [
  { channel: "he", label: "Hebrew" },
  { channel: "tr", label: "Transliteration" },
  { channel: "en", label: "Translation" },
];

/** A set is worst-news-first: one changed slide makes the whole prayer an update. */
function cardState(members: SharedShelfEntry[]): SharedShelfState {
  if (members.some((item) => item.state === "updated")) return "updated";
  if (members.some((item) => item.state === "new")) return "new";
  return "customized";
}

/** Groups set members into one card each, keeping the order CRC listed them in. */
export function groupSharedEntries(entries: SharedShelfEntry[]): SharedShelfCard[] {
  const cards: SharedShelfCard[] = [];
  const bySet = new Map<string, SharedShelfCard>();
  for (const entry of entries) {
    if (!entry.set) {
      cards.push({ key: entry.id, kind: "single", lead: entry, members: [entry], title: entry.name, subtitle: entry.title, layout: entry.layout, state: entry.state, slides: 1 });
      continue;
    }
    const existing = bySet.get(entry.set.id);
    if (existing) { existing.members.push(entry); continue; }
    const card: SharedShelfCard = { key: `set:${entry.set.id}`, kind: "set", lead: entry, members: [entry], title: entry.set.title, subtitle: entry.title, layout: entry.layout, state: entry.state, slides: entry.set.count };
    bySet.set(entry.set.id, card);
    cards.push(card);
  }
  for (const card of bySet.values()) {
    card.members.sort((left, right) => (left.set?.index ?? 0) - (right.set?.index ?? 0));
    card.lead = card.members[0];
    card.layout = card.lead.layout;
    card.subtitle = card.lead.title;
    card.state = cardState(card.members);
    card.slides = card.lead.set?.count || card.members.length;
  }
  return cards;
}

/** New from CRC, Updated from CRC, In your library - in that order, nothing dropped. */
export function partitionShelf(cards: SharedShelfCard[]): SharedShelfSections {
  return {
    fresh: cards.filter((card) => card.state === "new"),
    updated: cards.filter((card) => card.state === "updated"),
    mine: cards.filter((card) => card.state === "customized"),
  };
}

/** The tab badge counts the cards that need attention, not every CRC graphic. */
export function shelfBadgeCount(cards: SharedShelfCard[]) {
  return cards.filter((card) => card.state === "new" || card.state === "updated").length;
}

/** The local draft a comparison runs against: the newest one we know of. */
export function newestLocalDraft(card: SharedShelfCard): SharedLocalDraft | null {
  const drafts = localDraftsForCard(card);
  return drafts.length ? drafts[drafts.length - 1] : null;
}

export function localDraftsForCard(card: SharedShelfCard): SharedLocalDraft[] {
  const seen = new Set<string>();
  const drafts: SharedLocalDraft[] = [];
  for (const entry of card.members) for (const item of entry.local?.drafts || []) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    drafts.push(item);
  }
  return drafts;
}

/** Every slide of a whole prayer is pinned to the hash we listed, so a mid-flight CRC
 *  republish is refused by the server instead of half-copied. */
export function expectedCueHashes(card: SharedShelfCard): Record<string, string> {
  return Object.fromEntries(card.members.map((entry) => [entry.id, entry.cueHash]));
}

export function matchesShelfQuery(card: SharedShelfCard, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return card.members.some((entry) => `${card.title} ${entry.name} ${entry.title}`.toLocaleLowerCase().includes(needle));
}

/** Slide-count line for a whole prayer card. */
export function wholePrayerLabel(card: SharedShelfCard) {
  return `Whole prayer · ${card.slides} slide${card.slides === 1 ? "" : "s"}`;
}

/** Line-by-line before/after. With no `before` every row carries CRC's current text only. */
export function compareRows(after: ComparableCue, before?: ComparableCue): CompareRow[] {
  const rows: CompareRow[] = [];
  const extras = Object.keys({ ...before?.texts, ...after.texts }).filter((key) => !TEXT_ORDER.includes(key)).sort();
  for (const key of [...TEXT_ORDER, ...extras]) {
    const nextText = after.texts?.[key] || "";
    const priorText = before?.texts?.[key] || "";
    if (!nextText && !priorText) continue;
    rows.push({ key: `text:${key}`, label: TEXT_LABELS[key] || key, before: priorText, after: nextText, changed: Boolean(before) && priorText !== nextText });
  }
  const rowCount = Math.max(after.contentRows?.length || 0, before?.contentRows?.length || 0);
  for (let index = 0; index < rowCount; index += 1) {
    for (const { channel, label } of ROW_CHANNELS) {
      const nextText = after.contentRows?.[index]?.[channel] || "";
      const priorText = before?.contentRows?.[index]?.[channel] || "";
      if (!nextText && !priorText) continue;
      rows.push({ key: `row:${index}:${channel}`, label: `Line ${index + 1} · ${label}`, before: priorText, after: nextText, changed: Boolean(before) && priorText !== nextText });
    }
  }
  return rows;
}

/** What the compare panel says above the table. */
export function compareSummary(changed: CompareChanged, beforeAvailable: boolean) {
  if (!beforeAvailable) return "Comparison unavailable for graphics customized before this update";
  if (!changed.wording) return "No wording changes — CRC republished it";
  return "CRC changed the wording marked below.";
}

/** Layout and presentation flags list whether or not the wording moved. */
export function compareFlags(changed: CompareChanged) {
  return [
    { key: "wording", label: "Wording", changed: changed.wording },
    { key: "layout", label: "Layout", changed: changed.layout },
    { key: "presentation", label: "Presentation", changed: changed.presentation },
  ];
}
