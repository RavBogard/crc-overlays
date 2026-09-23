import type {DraftContent} from './authoring-model';

/**
 * Creation-only default for a submitted canonical selection. Call it only when the raw request
 * did not explicitly name an arrangement: parsing normalizes `together` away. It never belongs on update, import,
 * duplicate, rollback, or read paths: omitted arrangement on an existing draft still means the
 * historical `together` rendering.
 */
export function withCreateDefaultBilingualBlocks(content:DraftContent):DraftContent{
 const base=content.mode==='local-variant'?content.base:content;
 if(base.mode!=='bilingual'||base.arrangement!==undefined)return content;
 const nextBase={...base,arrangement:'blocks' as const};
 return content.mode==='local-variant'?{...content,base:nextBase}:nextBase;
}
