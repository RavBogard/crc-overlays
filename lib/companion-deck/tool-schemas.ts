import {z} from 'zod/v4';

/**
 * C3 (R-C3, R-C4 full scope) - the input schemas of the Companion deck MCP tools. They live here,
 * beside no database, catalog or seed import, so lib/mcp/deck.ts can register them and
 * lib/companion-deck/tools.ts re-parses the same input when an operation arrives another way.
 * Strict throughout. Rows and columns are zero-based, as Companion's own "page/row/column"
 * button locations are; the grid is 4 rows by 8 columns.
 */
const page=z.number().int().min(1).max(99).describe('A deck page number (1-99), as get_deck lists them.');
const row=z.number().int().min(0).max(7).describe('Zero-based row (0 is the top row).');
const column=z.number().int().min(0).max(15).describe('Zero-based column (0 is the left column).');
const cell={page,row,column};
const cellRef=z.object(cell).strict();
const expectedVersion=z.number().int().min(1).describe('The deck version you last read (get_deck). A change made elsewhere since is refused, not overwritten.');
const cueId=z.string().min(1).max(160);
const label=z.string().min(1).max(40).describe('The key\'s text. A line break (\\n) splits it; longer labels wrap onto two lines.');
const role=z.enum(['utility','announcement','single','sequence-part','alternate','short-selection']).describe('The cue\'s role, which sets the key colour: sequence parts teal, singles/alternates/short selections burgundy, announcements and utilities navy.');
const pageName=z.string().min(1).max(40);
const text=z.string().min(1).max(40);
const colour=z.number().int().min(0).max(0xffffff).describe('Background colour as a 24-bit number (0x990033 is 10027059).');

// G6 (TBI redo) - one row of a deck plan (lib/companion-deck/deck-plan.ts), the columns of the build's
// deck-plan.csv as an object. The build-key pattern is lib/build-keys.ts's BUILD_KEY_PATTERN (a test pins them equal).
export const DECK_PLAN_TARGET_KINDS=['local','corpus','slide','crc','birddog','obs','empty','dropped'] as const;
export const PLAN_BUILD_KEY=/^[a-z0-9][a-z0-9._:-]{0,119}$/;
export const DECK_PLAN_ROW=z.object({
 page:page,row,col:column,
 label:z.string().max(80).describe('The key\'s text. Empty on a camera or OBS key (kept as it is).'),
 bg:z.string().max(16).describe('Background colour as #rrggbb. Empty leaves the role colour.'),
 targetKind:z.enum(DECK_PLAN_TARGET_KINDS).describe('local, corpus, slide or crc: a graphic, targetKey naming its build key. birddog or obs: the camera or OBS key already on the deck there, kept as it is. empty: the cell ends empty. dropped: not placed.'),
 targetKey:z.string().max(400).nullable().optional().describe('The graphic\'s build key (the key batch_create_drafts recorded), or a device key\'s actions (Birddog:zoom:in).'),
 panelIndex:z.number().int().min(0).max(47).nullable().optional().describe('For a multipart set, which part (0 is the first). Default 0.'),
 notes:z.string().max(4000).optional(),
 pageName:pageName.optional().describe('Rename the page (or name a page the plan creates). Left out, the page keeps its name.'),
}).strict();
const button=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('cue'),cueId,label:label.optional().describe('Defaults to the cue\'s catalog name.'),role:role.optional().describe('Default single.')}).strict(),
 z.object({kind:z.literal('jump'),text,page}).strict(),
 z.object({kind:z.literal('module'),text,action:z.enum(['animate_clear','clear_now','logo_toggle','logo_on','logo_off','refresh_catalog','bug_on','bug_off']),bg:colour.optional()}).strict(),
 z.object({kind:z.literal('fragment'),fragment:z.string().min(1).max(120).describe('A device fragment the deck carries (a device key from the booth export).'),text:text.optional()}).strict(),
 z.object({kind:z.literal('camera'),text,input:z.string().min(1).max(60).describe('The vMix input to merge, e.g. "left cam 2".'),tally:z.number().int().min(1).max(99)}).strict(),
 z.object({kind:z.literal('merge')}).strict(),
 z.object({kind:z.literal('builtin'),control:z.enum(['pageup','pagenum','pagedown'])}).strict(),
 z.object({kind:z.literal('copy'),from:cellRef.describe('Copy the button at this cell, with new ids (a device key placed twice never shares ids).')}).strict(),
]);
const move=z.object({camera:z.string().min(1).max(80).nullable().describe('The PTZ camera connection label, or null for a merge with no preset recall.'),preset:z.number().int().min(0).max(255).nullable(),input:z.string().min(1).max(60).describe('The vMix input to merge.')}).strict();

export const deckToolSchemas={
 get_deck:z.object({}).strict(),
 get_deck_page:z.object({page}).strict(),
 create_page:z.object({expectedVersion,page,name:pageName,template:z.string().min(1).max(40).describe('A page template the deck defines (get_deck lists them).'),chainAfter:page.optional().describe('Put the new page into a service chain right after this page, so Prev/Next walk through it.'),jumpFrom:z.object({...cell,text:text.optional()}).strict().optional().describe('Add a key at this cell that jumps to the new page, so it can be reached from Home.')}).strict(),
 rename_page:z.object({expectedVersion,page,name:pageName}).strict(),
 move_page:z.object({expectedVersion,page,to:page.describe('The empty page number to move it to.')}).strict(),
 delete_page:z.object({expectedVersion,page}).strict(),
 place_button:z.object({expectedVersion,...cell,button}).strict(),
 move_button:z.object({expectedVersion,...cell,to:cellRef}).strict(),
 remove_button:z.object({expectedVersion,...cell}).strict(),
 bind_cue:z.object({expectedVersion,...cell,cueId,label:label.optional().describe('Defaults to the key\'s label, or the cue\'s catalog name when the key fired another cue.'),role:role.optional()}).strict(),
 attach_camera_gesture:z.object({expectedVersion,...cell,gesture:z.object({in:move,out:z.union([move,z.enum(['return','merge-only','none'])]).optional().describe('return (default): recall the page\'s return preset and merge back to its return input; merge-only: merge back without a preset; none: a middle panel, no camera move out.')}).strict().nullable().optional().describe('The camera move. null removes the gesture (the key becomes a one-step toggle).'),from:cellRef.optional().describe('Copy the gesture of this key instead.')}).strict(),
 apply_template:z.object({expectedVersion,page,template:z.string().min(1).max(40).optional().describe('Switch the page to this template first.'),replace:z.boolean().optional().describe('Overwrite a key sitting on a cell the template reserves. Default false: refused, nothing changed.')}).strict(),
 layout_column:z.object({expectedVersion,page,column,order:z.array(cueId).min(1).max(8).optional().describe('The column\'s cue ids top to bottom. Default: the deck grammar (lead at top, continuations down, alternates then short selections below).')}).strict(),
 sync_deck_with_catalog:z.object({expectedVersion:expectedVersion.optional().describe('Required when dryRun is false.'),dryRun:z.boolean().optional().describe('Default true: report what would change and save nothing.'),cueIds:z.array(cueId).min(1).max(100).optional().describe('Place only these cues. Default: every cue published or changed since the deck was last synced that is not on the deck.'),placements:z.array(z.object({cueId,page,row:row.optional(),column:column.optional(),label:label.optional()}).strict()).min(1).max(50).optional().describe('Say where a cue goes when the grammar cannot tell (or to override it).'),retired:z.enum(['remove','flag']).optional().describe('What to do with keys bound to a retired cue. Default remove.'),relabelHandWritten:z.boolean().optional().describe('Also relabel keys whose label was written by hand when their cue is renamed. Default false: they are flagged.')}).strict(),
 check_service_on_deck:z.object({serviceId:z.string().min(1).max(80).describe('The prepared service, as list_services returns it.')}).strict(),
 validate_deck:z.object({}).strict(),
 export_deck_config:z.object({scope:z.literal('full').optional().describe('full (default): the whole deck, for a full import.'),expectedVersion:expectedVersion.optional().describe('Refuse unless the deck is still at this version.')}).strict(),
 // G6 (TBI redo) - a whole deck plan in one call (lib/companion-deck/deck-plan.ts).
 apply_deck_plan:z.object({
  importId:z.string().regex(/^import_[a-f0-9]{32}$/).optional().describe('A deck-plan import from open_import_dropzone: the CSV (page,row,col,label,bg,targetKind,targetKey,panelIndex,notes) or a JSON array of the same rows. Give importId or rows, not both.'),
  rows:z.array(DECK_PLAN_ROW).min(1).max(400).optional().describe('The plan inline, one object per button with the CSV\'s columns.'),
  expectedVersion:expectedVersion.optional().describe('Required when dryRun is false.'),
  dryRun:z.boolean().optional().describe('Default true: return the full change plan, every finding and the validator\'s findings on the would-be deck, and save nothing.'),
  targets:z.record(z.string().regex(PLAN_BUILD_KEY),z.union([cueId,z.array(cueId).min(1).max(48)])).optional().describe('Override or extend how build keys resolve: key -> cue id, or key -> [cue ids by panel, first panel first]. Every cue named must be published.'),
 }).strict(),
} satisfies Record<string,z.ZodObject>;

export type DeckToolName=keyof typeof deckToolSchemas;
export const DECK_TOOL_NAMES=Object.keys(deckToolSchemas) as DeckToolName[];
export function isDeckTool(name:string):name is DeckToolName{return Object.hasOwn(deckToolSchemas,name)}
