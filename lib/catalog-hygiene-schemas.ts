import {z} from 'zod/v4';
import {id,layoutId,rowOrder,version} from './mcp/shared';

/**
 * A5 (R-H1-H3) - the input schemas of the catalog hygiene tools. Beside no database import, so
 * lib/mcp/authoring.ts registers them and lib/catalog-hygiene.ts re-parses the same input when an
 * operation arrives by another path (/api/authoring). Built per call because layout ids come from
 * the registry. "One of" rules are checked per item in the operation, where a failure is that
 * item's result rather than a refusal of the whole batch.
 */
export const ISSUE_KINDS=['duplicate_content','duplicate_name','near_duplicate_name','inherited_title','archived_but_published','retired_in_service','retired_on_deck','restored_name_clash','unpublished_changes'] as const;
export type IssueKind=(typeof ISSUE_KINDS)[number];
export const HYGIENE_TOOL_NAMES=['find_catalog_issues','batch_update','batch_ship','batch_retire','batch_refit','supersede_cue'] as const;
/** G8 - at most this many graphics per batch_retire call (the TBI redo retires about 185). */
export const BATCH_RETIRE_MAX=200;
/** G10 - at most this many graphics named in one batch_refit list (leave items out to take every published one). */
export const BATCH_REFIT_ITEMS_MAX=200;
export type HygieneToolName=(typeof HYGIENE_TOOL_NAMES)[number];
export const isHygieneTool=(operation:string):operation is HygieneToolName=>(HYGIENE_TOOL_NAMES as readonly string[]).includes(operation);

const draftId=id.describe('The draft (graphic) id, as list_drafts returns it.');
const expectedVersion=version.min(1).describe('The draft version you last read. A change made elsewhere since then fails this item and leaves the rest running.');
const dryRun=z.boolean().optional().describe('Default true: say what would happen and change nothing. Pass false to apply.');

export function hygieneToolSchemas(){
 const rename=z.object({action:z.literal('rename'),draftId,expectedVersion,name:z.string().min(1).max(80).optional(),title:z.string().min(1).max(100).optional().describe('The on-screen title.'),accentTitle:z.string().max(60).optional()}).strict();
 const style=z.object({action:z.literal('style'),draftId,expectedVersion,layout:layoutId().optional(),arrangement:z.enum(['together','blocks']).optional(),rowOrder:rowOrder.optional(),comfortableTypography:z.boolean().optional(),latinLineBreaks:z.enum(['preserve','paragraphs','phrases']).optional()}).strict();
 const archive=z.object({action:z.literal('archive'),draftId,expectedVersion}).strict();
 return {
  find_catalog_issues:z.object({kinds:z.array(z.enum(ISSUE_KINDS)).min(1).max(ISSUE_KINDS.length).optional().describe('Only these kinds of issue. Default: every kind.'),limit:z.number().int().min(1).max(500).optional().describe('At most this many issues (default 100).')}).strict(),
  batch_update:z.object({items:z.array(z.discriminatedUnion('action',[rename,style,archive])).min(1).max(100),dryRun}).strict(),
  batch_ship:z.object({items:z.array(z.object({draftId,expectedVersion,allowRename:z.boolean().optional()}).strict()).min(1).max(200),cursor:z.string().min(1).max(200).optional().describe('The nextCursor the previous call returned, with the same items.'),dryRun}).strict(),
  batch_retire:z.object({items:z.array(z.object({draftId:draftId.describe('The published graphic to retire: its draft id, which is its cue id (as retire_cue\'s cueId).'),expectedVersion}).strict()).min(1).max(BATCH_RETIRE_MAX),dryRun}).strict(),
  batch_refit:z.object({items:z.array(z.object({draftId:draftId.describe('A published graphic: its draft id, which is its cue id.'),expectedVersion:expectedVersion.optional()}).strict()).min(1).max(BATCH_REFIT_ITEMS_MAX).optional().describe('The graphics to re-check. Leave out to take every published graphic whose live version is its current draft, in id order.'),accentTitleOnly:z.boolean().optional().describe('Only graphics that carry a Hebrew accent title (after an accent title typography change).'),cursor:z.string().min(1).max(200).optional().describe('The nextCursor the previous call returned, with the same items and accentTitleOnly.'),dryRun}).strict(),
  supersede_cue:z.object({old:id.describe('The graphic being replaced (its cue id, which is its draft id).'),new:id.describe('The published graphic that takes its place.'),expectedVersion:version.min(1).describe('The old graphic\'s draft version, as for retire_cue.'),dryRun}).strict(),
 } satisfies Record<HygieneToolName,z.ZodObject>;
}
