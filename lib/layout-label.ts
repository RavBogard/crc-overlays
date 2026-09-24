import {layoutDefinition,type LayoutId} from './layout-registry';

export type CueLayout=LayoutId;
/** The one operator-facing name for a cue layout. Used by console rows, services, fit-check, library cards and the editor. */
export function layoutLabel(layout:string):string{return layoutDefinition(layout)?.label??'Overlay'}
/**
 * The baseline layout whose template a layout draws on. A template contributes only its motion
 * and duration, and the catalog has no corner baseline of its own: a corner card borrows a lower
 * third's (the same bars scaling in, anchored at the card's right edge by app/overlay.css).
 */
export function templateLayoutFor(layout:string):string{return layoutDefinition(layout)?.templateLayout??layout}
