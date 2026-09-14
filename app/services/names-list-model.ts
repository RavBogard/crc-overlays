/**
 * The pure half of the names editor: the sentences it shows, and the rule that decides
 * which measurement pass is allowed to speak. Kept out of the component so the suite can
 * assert both without a browser, exactly as `app/author/shared-shelf-model.ts` is.
 */

/** B-6: the counterpart of the existing "Request declined. Nothing else changed." */
export const NAMES_REMOVED_NOTICE = 'Names removed. Nothing else changed.';

/**
 * F2 - what to say after a save. `/api/services` answers a write it could not push to the
 * live library with `warning` beside the result (lib/service-collections.ts); showing the
 * success sentence then would tell the operator the panels are ready to show when they are
 * not. The warning is the server's own wording, never restated here.
 */
export function namesSavedNotice(result: unknown, firstPanelName: string): string {
  const warning = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>).warning : undefined;
  if (typeof warning === 'string' && warning.trim()) return warning;
  return `These names are now in the library as ${firstPanelName}. Show them from Live control or from Companion.`;
}

/**
 * B-2 - one measurement pass at a time, and only the newest one may publish a verdict.
 * The editor renders every generated panel through the real `Player` into one shared
 * hidden stage. Two passes running over that one stage interleave at every `await`, so a
 * pass that a further keystroke has already superseded could publish a verdict measured
 * from another pass's DOM - which is how a one-panel list latched on "Panel 1 of 1 is too
 * full". Each pass takes a number; anything but the latest number is discarded.
 */
export interface RunGuard {
  /** Start a pass, superseding any pass already in flight. */
  begin(): number;
  /** Supersede every pass without starting one (an edit that needs no measurement, unmount). */
  supersede(): void;
  /** Whether this pass is still the newest, and so still allowed to publish. */
  isCurrent(run: number): boolean;
}

export function createRunGuard(): RunGuard {
  let latest = 0;
  return {
    begin: () => ++latest,
    supersede: () => { latest++ },
    isCurrent: (run: number) => run === latest,
  };
}
