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
} satisfies Record<string,z.ZodObject>;

export type DeckToolName=keyof typeof deckToolSchemas;
export const DECK_TOOL_NAMES=Object.keys(deckToolSchemas) as DeckToolName[];
export function isDeckTool(name:string):name is DeckToolName{return Object.hasOwn(deckToolSchemas,name)}
