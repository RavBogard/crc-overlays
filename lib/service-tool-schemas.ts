import {z} from 'zod/v4';

/**
 * S2 (R-S2) - the input schemas of the prepared-services MCP tools. They live here, beside no
 * database or catalog import, so lib/mcp/services.ts can register them and lib/service-tools.ts
 * can re-parse the same input when an operation arrives by another path (/api/authoring).
 * Strict throughout. "Exactly one of" rules are checked in the operation, where the refusal
 * can be a sentence, because a refined object schema cannot be extended with `workspace`.
 */
const serviceId=z.string().min(1).max(80).describe('The prepared service, as list_services returns it.');
const rowId=z.string().min(1).max(120).describe('A row of the service, as get_service returns it.');
const cueId=z.string().min(1).max(160);
const expectedVersion=z.number().int().min(1).describe('The service version you last read (get_service). A change made elsewhere since then is refused, not overwritten.');
const position=z.object({beforeRowId:rowId.optional(),afterRowId:rowId.optional(),index:z.number().int().min(0).max(500).optional()}).strict().describe('Where the new row goes: before or after a row, or at a 0-based index. Give one; the default is the end.');
const status=z.enum(['covered','needs-cue','needs-review','intentional-fallback','not-needed']);
const rowDetails={buttonLabel:z.string().min(1).max(60).nullable().optional().describe('Short label for a deck button; null clears it.'),camera:z.string().min(1).max(60).nullable().optional().describe('Optional camera hint; null clears it.'),note:z.string().min(1).max(500).nullable().optional().describe('Optional note for the team; null clears it.')};
const rowSpec=z.object({label:z.string().min(1).max(160).optional(),type:z.enum(['cue','alternates','multipart']).optional(),cueIds:z.array(cueId).min(1).max(30).optional(),status:status.optional(),cueId:cueId.optional(),sourceId:z.string().min(1).max(220).optional(),owner:z.string().min(1).max(120).optional(),reason:z.string().min(1).max(500).optional(),candidateCueIds:z.array(cueId).min(1).max(30).optional(),buttonLabel:z.string().min(1).max(60).optional(),camera:z.string().min(1).max(60).optional(),note:z.string().min(1).max(500).optional()}).strict();
const names=z.object({title:z.string().min(1).max(60),layout:z.enum(['left','right']),perPanel:z.number().int().min(4).max(12).optional(),rows:z.array(z.object({he:z.string().max(60).optional(),en:z.string().max(60).optional()}).strict()).min(1).max(120)}).strict();

export const serviceToolSchemas={
 list_services:z.object({includeArchived:z.boolean().optional(),query:z.string().min(1).max(120).optional(),limit:z.number().int().min(1).max(100).optional()}).strict(),
 get_service:z.object({serviceId,view:z.enum(['compact','full']).optional().describe('compact (default): one line per row. full: the whole stored record with entries, coverage, rows and names.')}).strict(),
 list_live_setlists:z.object({}).strict(),
 service_readiness:z.object({serviceId}).strict(),
 create_service:z.object({name:z.string().min(1).max(120),service:z.string().min(1).max(120).describe('Which service this is, e.g. "Friday, September 25" or "Shabbat Evening".'),from:z.enum(['empty','library']).optional().describe('empty (default), or library: one row per published graphic, as "Start from library" does on /services.'),rows:z.array(rowSpec).min(1).max(200).optional().describe('Optional rows in service order. A row with cueIds adds graphics; a row with status records a coverage decision; a row may have both.')}).strict(),
 rename_service:z.object({serviceId,expectedVersion,name:z.string().min(1).max(120).optional(),service:z.string().min(1).max(120).optional()}).strict(),
 add_entry:z.object({serviceId,expectedVersion,cueIds:z.array(cueId).min(1).max(30).describe('One graphic, or 2-30 for alternates or a multipart sequence.'),type:z.enum(['cue','alternates','multipart']).optional().describe('cue (default for one graphic) or alternates (default for several) or multipart.'),label:z.string().min(1).max(160).optional(),rowId:rowId.optional().describe('Attach the graphics to this existing row, which must have none yet. Omit to add a new row.'),position:position.optional(),...rowDetails}).strict(),
 remove_entry:z.object({serviceId,expectedVersion,rowId:rowId.optional(),entryId:z.string().min(1).max(80).optional()}).strict(),
 reorder_entries:z.object({serviceId,expectedVersion,orderedRowIds:z.array(rowId).min(1).max(500).optional().describe('Every row id of the service, in the new order.'),rowId:rowId.optional().describe('Move one row instead...'),toIndex:z.number().int().min(0).max(500).optional().describe('...to this 0-based index.')}).strict(),
 swap_graphic:z.object({serviceId,expectedVersion,rowId,cueId:cueId.describe('The published graphic to use instead.'),replaceCueId:cueId.optional().describe('Which graphic of alternates or a multipart sequence to replace. Not needed for a single graphic.')}).strict(),
 resolve_coverage_row:z.object({serviceId,expectedVersion,rowId,cueId:cueId.describe('The published graphic this row should use, usually one of its candidates.'),reason:z.string().min(1).max(500).optional()}).strict(),
 set_coverage_row:z.object({serviceId,expectedVersion,rowId:rowId.optional().describe('The row to change. Omit to add a new coverage row.'),position:position.optional(),label:z.string().min(1).max(160).optional(),status:status.optional(),cueId:cueId.nullable().optional(),sourceId:z.string().min(1).max(220).nullable().optional(),owner:z.string().min(1).max(120).nullable().optional(),reason:z.string().min(1).max(500).nullable().optional(),clear:z.literal(true).optional().describe('Remove the coverage decision from rowId. A row with no graphic then leaves the service.'),...rowDetails}).strict(),
 set_names:z.object({serviceId,expectedVersion,names}).strict(),
 clear_names:z.object({serviceId,expectedVersion}).strict(),
 archive_service:z.object({serviceId,expectedVersion}).strict(),
 restore_service:z.object({serviceId,expectedVersion}).strict(),
 refresh_from_setlist:z.object({serviceId,expectedVersion,dryRun:z.boolean().optional().describe('Default true: report what would change and write nothing.'),removeMissing:z.boolean().optional().describe('Also remove rows whose setlist row is gone. Default false: they are kept and reported.')}).strict(),
} satisfies Record<string,z.ZodObject>;

export type ServiceToolName=keyof typeof serviceToolSchemas;
export const SERVICE_TOOL_NAMES=Object.keys(serviceToolSchemas) as ServiceToolName[];
export const isServiceTool=(name:string):name is ServiceToolName=>Object.hasOwn(serviceToolSchemas,name);
