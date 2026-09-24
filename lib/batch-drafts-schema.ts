import {z} from 'zod/v4';
import {BUILD_KEY_PATTERN} from './build-keys';
import {id,layoutId,presentation,rowOrder,templateCueId,textSize} from './mcp/shared';

/**
 * G4 - the input schema of batch_create_drafts, apart from the operation (the catalog-hygiene
 * precedent): lib/mcp/authoring.ts registers it and lib/batch-drafts.ts re-parses each item with it,
 * also when the call arrives by another path (/api/authoring). Built per call because layout ids come from the registry. "One of"
 * rules are checked per item in the operation, where a failure is that item's result.
 */
export const BATCH_DRAFTS_MAX_ITEMS=50;
export const MODES=['bilingual','original-en','source-en'] as const;
export type Mode=typeof MODES[number];

const key=z.string().regex(BUILD_KEY_PATTERN,{message:'key must be 1-120 characters of lowercase letters, digits, and . _ : - (starting with a letter or digit), such as "mt150-ahavat-olam".'}).describe('Your stable name for this item. Run the same plan again and an item whose key already made a live draft or set is reported as exists, and nothing is made.');
const blockIds=z.array(z.string().min(1).max(220)).min(1).max(48).describe('Block ids from search_sources (includeBlocks:true) or get_source, in order.');
const blocks=z.array(z.number().int().min(0).max(47)).min(1).max(48).describe('A local source\'s block positions (0 is its first block, as import_local_sources entered them), in order. They resolve to that source\'s block ids.');
export function batchCreateDraftsSchema(){
 const look={name:z.string().min(1).max(80).optional().describe('The graphic\'s name in the library. Default: the title.'),title:z.string().min(1).max(100).describe('The on-screen title.'),accentTitle:z.string().max(60).optional(),layout:layoutId(),templateCueId:templateCueId.optional(),textSize:textSize.optional(),presentation:presentation.optional(),applyDefaults:z.boolean().optional()};
 const source={sourceId:id.optional().describe('A corpus source id, or a local: id.'),sourceKey:key.optional().describe('The key import_local_sources recorded for a local source, in place of sourceId.'),mode:z.enum(MODES).optional().describe('Default: bilingual when every selected block pairs Hebrew and transliteration, original-en when every one is English.'),includeTranslation:z.boolean().optional(),arrangement:z.enum(['together','blocks']).optional(),rowOrder:rowOrder.optional()};
 const panel=z.object({blockIds:blockIds.optional(),blocks:blocks.optional()}).strict();
 return z.object({
  items:z.array(z.discriminatedUnion('type',[
   z.object({type:z.literal('source'),key,...look,...source,blockIds:blockIds.optional(),blocks:blocks.optional()}).strict(),
   z.object({type:z.literal('set'),key,...look,...source,panels:z.array(panel).min(1).max(48).describe('One graphic per panel, in order, each {blockIds} or {blocks}.')}).strict(),
   z.object({type:z.literal('slide'),key,...look,text:z.string().min(1).max(4000),imageAssetId:z.string().regex(/^asset_[a-f0-9]{64}$/).optional().describe('An asset from upload_asset, shown beside the text.')}).strict(),
   z.object({type:z.literal('customize_shared'),key,cueId:id.optional(),setId:id.optional(),expectedCueHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),expectedCueHashes:z.record(z.string().min(1).max(160),z.string().regex(/^[a-f0-9]{64}$/)).optional(),name:z.string().min(1).max(80).optional(),applyDefaults:z.boolean().optional()}).strict(),
  ])).min(1).max(500).describe(`At most ${BATCH_DRAFTS_MAX_ITEMS} items per call.`),
  applyDefaults:z.boolean().optional(),
  dryRun:z.boolean().optional().describe('Default true: check every item and change nothing. Pass false to create.'),
 }).strict();
}
export type BatchDraftsInput=z.infer<ReturnType<typeof batchCreateDraftsSchema>>;
