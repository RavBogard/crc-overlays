/**
 * The one "published, visible" number. Console footer, library tab, services finder and
 * /api/health must all show the same figure, so they all count with this helper.
 *
 * Alias rule (see lib/server.ts mergePublishedCatalog and tests/catalog-alias.test.ts):
 * a compatibility alias is a catalog entry whose `aliasOf` names another cue. Aliases exist
 * only so an old Companion button keeps working; the merge always resolves them to the
 * target's content and always stamps `hidden:true` on them. They are therefore never a
 * separate graphic, and a user must never see them in a count. `hidden` on its own also
 * excludes an entry — a retired graphic that is not an alias is still not visible.
 *
 * `alias` is accepted alongside `aliasOf` only so a caller passing a differently shaped row
 * cannot accidentally count a marked alias; nothing in this repository writes `alias` today.
 */
export type CountableCue={hidden?:boolean;alias?:unknown;aliasOf?:unknown};

const isAlias=(cue:CountableCue)=>Boolean(cue.aliasOf)||Boolean(cue.alias);

/** Counts the entries a person would recognize as separate published graphics. */
export function publishedVisibleCount(cues:readonly CountableCue[]|null|undefined):number{
 if(!Array.isArray(cues))return 0;
 return cues.reduce((total,cue)=>total+(cue&&typeof cue==='object'&&!cue.hidden&&!isAlias(cue)?1:0),0);
}
