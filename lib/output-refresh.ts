/**
 * An output page outlives releases: the compositor's browser input (vMix, OBS) loads `/output`
 * once and keeps that code until someone reloads it. A release that adds a layout (the name plate,
 * Oct 9) then reaches its catalog before its code, and the old Player draws the new graphic with
 * no layout at all: an unstyled logo at full size and loose text in a corner.
 *
 * The page cannot know its code is old, but it can see the symptom exactly: a catalog cue whose
 * layout its own registry cannot resolve. When that happens it reloads itself - at once if that cue
 * is the one being asked for (what it would draw is broken anyway), otherwise as soon as the stage
 * is empty, so nothing on air is cut. It reloads at most once per catalog version, so a layout that
 * even fresh code cannot draw never becomes a reload loop.
 *
 * Pure and DOM-free; app/output/page.tsx supplies the page's state.
 */
import {resolveCueLayout,type LayoutRef,type ResolvedLayouts} from './layout-registry.ts';

export const OUTPUT_RELOADED_FOR_STORAGE_KEY = 'crc-output-reloaded-for';

type CatalogCue = {id: string; layout: string; layoutRef?: LayoutRef};

/** The ids of catalog cues this page's own code cannot draw. */
export function unrenderableCueIds(cues: readonly CatalogCue[], layouts?: ResolvedLayouts): Set<string> {
  return new Set(cues.filter(cue => !resolveCueLayout(cue, layouts)).map(cue => cue.id));
}

export type StaleRendererInput = {
  unrenderable: ReadonlySet<string>;
  catalogVersion: string;
  /** The cue live state asks for, or null. */
  desiredCue: string | null;
  /** Player.occupied: a graphic is requested, settled, or still leaving. */
  occupied: boolean;
  /** The catalog version this tab last reloaded for (sessionStorage), or null. */
  reloadedFor: string | null;
};

export function shouldReloadForStaleRenderer(input: StaleRendererInput): boolean {
  if (!input.unrenderable.size || !input.catalogVersion) return false;
  if (input.reloadedFor === input.catalogVersion) return false;
  if (input.desiredCue && input.unrenderable.has(input.desiredCue)) return true;
  return !input.occupied;
}

/**
 * Where to reload to without losing the output's access. The page strips `#device=` (or the legacy
 * `#key=`) from the address after storing it; if the store did not keep it - a locked-down browser
 * profile - the fragment is put back so the reloaded page starts with the same credential.
 */
export function outputReloadUrl(input: {pathname: string; search: string; credential: string; source: string; credentialSurvivesReload: boolean}): string {
  const base = input.pathname + input.search;
  if (input.credentialSurvivesReload || !input.credential) return base;
  if (input.source === 'fragment-device' || input.source === 'stored-device') return `${base}#device=${encodeURIComponent(input.credential)}`;
  if (input.source === 'fragment-key' || input.source === 'legacy-session') return `${base}#key=${encodeURIComponent(input.credential)}`;
  return base;
}
