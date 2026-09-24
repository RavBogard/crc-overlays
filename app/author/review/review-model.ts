import type {PageItem} from '@/lib/review-board-http';

/** Every sentence the review page shows, in one place, for Daniel's wording review (T4). */
export const COPY = {
  heading: 'Review',
  intro: 'Look at each graphic. Choose Approve if it is right, or Needs change and write what should change. Your answers are saved as you go. Nothing here puts anything on screen.',
  signIn: 'This review page is for members of this congregation, so please sign in first.',
  loading: 'Loading the graphics…',
  missing: 'This review page does not exist any more. Ask the person who sent you the link for a new one.',
  unavailable: 'The review page could not be loaded. Check your connection and reload the page.',
  approve: 'Approve',
  needsChange: 'Needs change',
  noteLabel: 'Note',
  notePlaceholder: 'What should change? (optional)',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Not saved. Check your connection and try again.',
  noPicture: 'No picture yet — ask the assistant to check it',
  before: 'Before',
  beforeHint: 'What the old slide said',
  after: 'New graphic',
  updated: 'Updated since you looked',
  updatedHint: 'This graphic was changed after you answered. Please look again.',
  gone: 'This graphic is no longer in the library.',
  archived: 'This graphic has been archived.',
  filterLabel: 'Show',
  showAll: 'All',
  showUndecided: 'Not answered yet',
  showNeedsChange: 'Needs change',
  showUpdated: 'Updated',
  nothingToShow: 'Nothing to show here.',
  allDone: 'Everything has an answer. Thank you!',
  noAnswer: 'No answer',
  answeredBy: 'Answered by',
  earlierAnswer: 'Earlier answer',
} as const;

export type Filter = 'all' | 'undecided' | 'needs-change' | 'updated';
export const FILTERS: {id: Filter; label: string}[] = [
  {id: 'all', label: COPY.showAll},
  {id: 'undecided', label: COPY.showUndecided},
  {id: 'needs-change', label: COPY.showNeedsChange},
  {id: 'updated', label: COPY.showUpdated},
];
export function shows(item: PageItem, filter: Filter): boolean {
  if (filter === 'undecided') return item.decision === null;
  if (filter === 'needs-change') return item.decision === 'needs-change';
  if (filter === 'updated') return item.updated;
  return true;
}

export type Tally = {total: number; answered: number; needsChange: number; updated: number};
export function tally(items: PageItem[]): Tally {
  return {
    total: items.length,
    answered: items.filter(item => item.decision !== null).length,
    needsChange: items.filter(item => item.decision === 'needs-change').length,
    updated: items.filter(item => item.updated).length,
  };
}
/** "12 of 20 answered · 3 need a change · 2 updated since you looked". */
export function progressLine(value: Tally): string {
  const parts = [`${value.answered} of ${value.total} answered`];
  if (value.needsChange) parts.push(value.needsChange === 1 ? '1 needs a change' : `${value.needsChange} need a change`);
  if (value.updated) parts.push(`${value.updated} updated since you looked`);
  return parts.join(' · ');
}

export const decisionWord = (decision: PageItem['decision']) => decision === 'approve' ? COPY.approve : decision === 'needs-change' ? COPY.needsChange : COPY.noAnswer;
/** "Earlier answer from Simone: Needs change. “Make the Hebrew bigger”" */
export function earlierLine(earlier: NonNullable<PageItem['earlier']>): string {
  const note = earlier.note ? ` “${earlier.note}”` : '';
  return `${COPY.earlierAnswer}${earlier.answeredBy ? ` from ${earlier.answeredBy}` : ''}: ${decisionWord(earlier.decision)}.${note}`;
}
export const answeredLine = (item: Pick<PageItem, 'decision' | 'answeredBy'>) => item.decision && item.answeredBy ? `${COPY.answeredBy} ${item.answeredBy}` : '';

/** Consecutive items under one heading, in the order the board gives them. */
export function groupsOf(items: PageItem[]): {heading: string; items: PageItem[]}[] {
  const groups: {heading: string; items: PageItem[]}[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.heading === item.group) last.items.push(item);
    else groups.push({heading: item.group, items: [item]});
  }
  return groups;
}
