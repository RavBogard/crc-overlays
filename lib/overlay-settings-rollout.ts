import {createHash} from 'node:crypto';
import type {Draft, Presentation, AuthoringCue} from './authoring-model';
import {NEW_OVERLAY_PRESENTATION_DEFAULTS} from './overlay-presentation-defaults';

/** The approved rollout is deliberately narrower than all presentation settings. */
export const ROLLOUT_SETTINGS = NEW_OVERLAY_PRESENTATION_DEFAULTS satisfies Presentation;

export function stableDigest(value: unknown): string {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)])) : item;
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
}

export function needsRollout(presentation: Presentation | undefined): boolean {
  return Object.entries(ROLLOUT_SETTINGS).some(([key, value]) => presentation?.[key as keyof Presentation] !== value);
}

/** Never rebuild text from source: published wording may intentionally differ from a dirty draft. */
export function settingsOnly<T extends {presentation?: Presentation}>(document: T): T {
  const next = {...structuredClone(document), presentation: {...document.presentation, ...ROLLOUT_SETTINGS}};
  const cue = next as unknown as AuthoringCue;
  if (cue.authoring?.copySpec) cue.authoring.copySpec.presentation = {...cue.authoring.copySpec.presentation, ...ROLLOUT_SETTINGS};
  return next;
}

export function assertSettingsOnly(before: Draft | AuthoringCue, after: Draft | AuthoringCue) {
  const strip = (value: Draft | AuthoringCue) => {
    const copy = structuredClone(value) as unknown as Record<string, unknown>;
    const presentation = {...(copy.presentation as Presentation | undefined)};
    for (const key of Object.keys(ROLLOUT_SETTINGS)) delete presentation[key as keyof Presentation];
    copy.presentation = presentation;
    const cue = copy as unknown as AuthoringCue;
    if (cue.authoring?.copySpec) {
      const nested = {...cue.authoring.copySpec.presentation};
      for (const key of Object.keys(ROLLOUT_SETTINGS)) delete nested[key as keyof Presentation];
      cue.authoring.copySpec.presentation = nested;
    }
    return copy;
  };
  if (stableDigest(strip(before)) !== stableDigest(strip(after))) throw new Error('Rollout attempted to change more than the approved settings');
}

export function eligibleForRollout(draft: Draft, includeInactive = false): boolean {
  return includeInactive || (!draft.archivedAt && !draft.retired);
}
