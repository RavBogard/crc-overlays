/**
 * The CRC shelf, as TBI sees it (S5).
 *
 * TBI's library already contains twenty-four starter graphics that were copied from CRC
 * before this feed existed, and it may contain graphics a person copied later. The shelf
 * has to say, for each CRC item, one of three plain things: this is New here, you already
 * have this one, or CRC changed it since you took it.
 *
 * Everything here is pure. State needs live drafts, the starter mapping, and a way to hash
 * a starter's CRC original; all three are passed in, so the rules can be tested without a
 * repository, a feed, or an environment.
 */
import type {Draft, Layout, Presentation, SharedCueUpstream} from './authoring-model';
import type {SharedLibraryEntry} from './shared-library';
import type {Cue} from './player';

/** New: never taken. Customized: taken, and what you took is what CRC still publishes. Updated: CRC has moved on. */
export type ShelfState = 'new' | 'updated' | 'customized';

/** The fields of a TBI draft the shelf reads. Archived drafts are passed in and ignored here. */
export type ShelfDraft = Pick<Draft, 'id' | 'name' | 'sharedFrom'> & {
  activeRevision?: number | null;
  archivedAt?: number;
};

export type ShelfLocalDraft = {id: string; name: string; activeRevision: number | null; cueHash: string};
export type ShelfLocal = {starterCueId?: string; drafts: ShelfLocalDraft[]};
export type ShelfEntryState = {state: ShelfState; local: ShelfLocal};

/** A hash of the CRC original a starter graphic was copied from, or null when it cannot be resolved. */
export type BaselineHashLookup = (starterCueId: string) => string | null;

/**
 * Per-entry shelf state, keyed by CRC cue id.
 *
 * - A counterpart is a non-archived TBI draft whose `sharedFrom.cueId` names this entry.
 *   Archiving a copy returns the item to New, which is what a person means when they throw
 *   their copy away.
 * - Customized: some counterpart was taken at exactly the hash CRC publishes now, or (with
 *   no counterparts at all) the starter this workspace shipped with still matches CRC.
 * - Updated: counterparts exist but none of them match the current hash, or the starter no
 *   longer matches its CRC original.
 */
export function shelfState(
  entries: SharedLibraryEntry[],
  drafts: ShelfDraft[],
  starterMap: Map<string, string>,
  baselineHashFor: BaselineHashLookup,
): Map<string, ShelfEntryState> {
  const live = drafts.filter(draft => !draft.archivedAt && draft.sharedFrom?.workspaceId === 'crc');
  const byCueId = new Map<string, ShelfDraft[]>();
  for (const draft of live) {
    const cueId = draft.sharedFrom!.cueId;
    const bucket = byCueId.get(cueId);
    if (bucket) bucket.push(draft);
    else byCueId.set(cueId, [draft]);
  }
  const result = new Map<string, ShelfEntryState>();
  for (const entry of entries) {
    const starterCueId = starterMap.get(entry.id);
    const counterparts = byCueId.get(entry.id) ?? [];
    const local: ShelfLocal = {
      ...(starterCueId ? {starterCueId} : {}),
      drafts: counterparts.map(draft => ({
        id: draft.id,
        name: draft.name,
        activeRevision: draft.activeRevision ?? null,
        cueHash: draft.sharedFrom!.cueHash,
      })),
    };
    let state: ShelfState;
    if (counterparts.some(draft => draft.sharedFrom!.cueHash === entry.cueHash)) state = 'customized';
    else if (counterparts.length) state = 'updated';
    else if (starterCueId) {
      const baseline = baselineHashFor(starterCueId);
      state = baseline === null ? 'new' : baseline === entry.cueHash ? 'customized' : 'updated';
    } else state = 'new';
    result.set(entry.id, {state, local});
  }
  return result;
}

/** One CRC multipart graphic: any member out of date makes the whole thing out of date. */
export function setState(states: ShelfState[]): ShelfState {
  if (states.some(state => state === 'updated')) return 'updated';
  if (states.some(state => state === 'new')) return 'new';
  return 'customized';
}

export type SharedShelfSet = {id: string; title: string; count: number; entries: SharedLibraryEntry[]};

/** Group the entries that name the same CRC set, in the order CRC shows them. */
export function groupSets(entries: SharedLibraryEntry[]): SharedShelfSet[] {
  const sets = new Map<string, SharedShelfSet>();
  for (const entry of entries) {
    if (!entry.set) continue;
    let set = sets.get(entry.set.id);
    if (!set) {
      set = {id: entry.set.id, title: entry.set.title, count: entry.set.count, entries: []};
      sets.set(entry.set.id, set);
    }
    set.entries.push(entry);
  }
  for (const set of sets.values()) set.entries.sort((a, b) => a.set!.index - b.set!.index);
  return [...sets.values()];
}

export type CompareLine = {before?: string; after?: string; changed: boolean};
export type CompareResult = {
  changed: {wording: boolean; layout: boolean; presentation: boolean};
  lines: CompareLine[];
};

const TEXT_ORDER = ['textTitle', 'accentTextTitle', 'textMainheb', 'textMainEng', 'textMain', 'textTranslation'];
const MAX_DIFF_LINES = 400;

function readableLines(snapshot: SharedCueUpstream): string[] {
  const texts = snapshot.texts ?? {};
  const named = TEXT_ORDER.filter(key => key in texts);
  const rest = Object.keys(texts).filter(key => !TEXT_ORDER.includes(key)).sort();
  const lines: string[] = [];
  for (const key of [...named, ...rest]) for (const line of String(texts[key] ?? '').split('\n')) if (line.trim()) lines.push(line);
  for (const row of (snapshot.contentRows ?? []) as NonNullable<Cue['contentRows']>) {
    for (const value of [row.he, row.tr, row.en]) if (value && value.trim()) lines.push(value);
  }
  return lines;
}

function stablePresentation(presentation: Presentation | undefined): string {
  const value = (presentation ?? {}) as Record<string, unknown>;
  return JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]]));
}

/** Longest common subsequence, so one inserted line does not report every later line as changed. */
function alignedLines(before: string[], after: string[]): CompareLine[] {
  if (before.length > MAX_DIFF_LINES || after.length > MAX_DIFF_LINES) {
    const length = Math.max(before.length, after.length);
    return Array.from({length}, (_unused, index) => {
      const left = before[index], right = after[index];
      return {
        ...(left === undefined ? {} : {before: left}),
        ...(right === undefined ? {} : {after: right}),
        changed: left !== right,
      };
    });
  }
  const table: number[][] = Array.from({length: before.length + 1}, () => new Array<number>(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines: CompareLine[] = [];
  let i = 0, j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({before: before[i], after: after[j], changed: false});
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({before: before[i], changed: true});
      i++;
    } else {
      lines.push({after: after[j], changed: true});
      j++;
    }
  }
  while (i < before.length) lines.push({before: before[i++], changed: true});
  while (j < after.length) lines.push({after: after[j++], changed: true});
  return lines;
}

/**
 * What changed between the CRC wording a graphic was copied from and the CRC wording now.
 * Wording is compared as a reader reads it — the rendered lines — not as stored fields.
 */
export function compareUpstream(before: SharedCueUpstream, after: SharedCueUpstream): CompareResult {
  const lines = alignedLines(readableLines(before), readableLines(after));
  return {
    changed: {
      wording: lines.some(line => line.changed),
      layout: (before.layout as Layout) !== (after.layout as Layout),
      presentation: stablePresentation(before.presentation) !== stablePresentation(after.presentation),
    },
    lines,
  };
}
