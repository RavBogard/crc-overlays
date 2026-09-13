export type CueLayout='left'|'right'|'bottom';
/** The one operator-facing name for a cue layout. Used by console rows, services, fit-check, library cards and the editor. */
export function layoutLabel(layout:string):string{return layout==='bottom'?'Lower third':layout==='left'?'Left panel':layout==='right'?'Right panel':'Overlay'}
