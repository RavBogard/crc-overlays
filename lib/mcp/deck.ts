import {deckToolSchemas as s} from '../companion-deck/tool-schemas';
import type {McpIdentity,RegisterTool} from './shared';

// The stored Companion deck (Track C): the whole Stream Deck configuration, kept as a complete, stable
// library. Every change takes the deck version you read, is validated before it is saved, and is
// refused (nothing saved) if it would break the deck. Nothing here reaches the booth: the deck reaches
// Companion only as the exported file a person imports.
export function registerDeckTools(register:RegisterTool,identity:McpIdentity){
 const who=identity.shortName;
 // C3 (R-C3, R-C4 full scope). Keep this block contiguous; C4 appends its registrations after it.
 register('get_deck',`Read the ${who} Companion deck in brief: its version, pages (number, name, template, how many keys and free cells), service chains, templates and connection labels. get_deck_page reads one page cell by cell.`,s.get_deck,{readOnlyHint:true});
 register('get_deck_page','Read one deck page cell by cell (rows and columns count from 0): each key\'s kind and label, the cue it fires with its role, sequence and camera gesture, the template\'s fixed keys, and the free cells.',s.get_deck_page,{readOnlyHint:true});
 register('create_page','Create a deck page on one of the deck\'s templates, with the template\'s fixed keys. chainAfter puts it into a service\'s Prev/Next chain; jumpFrom adds a key that jumps to it (a page nothing reaches is refused).',s.create_page,{readOnlyHint:false});
 register('rename_page','Rename a deck page, with the Prev/Next and hub keys that name it.',s.rename_page,{readOnlyHint:false,idempotentHint:true});
 register('move_page','Move a deck page to an unused page number; every key that jumps to it follows.',s.move_page,{readOnlyHint:false});
 register('delete_page','Delete a deck page. Refused while any key other than Prev/Next still jumps to it, and for Home.',s.delete_page,{readOnlyHint:false,destructiveHint:true});
 register('place_button','Place a key on an empty cell: a cue key (label and colour role default from the catalog), a page jump, an Overlays module action, a device key the deck carries, a camera merge, or a copy of another key. A device key placed twice gets new ids.',s.place_button,{readOnlyHint:false});
 register('move_button','Move a key to an empty cell, on the same page or another. It keeps its ids, cue, gesture and label.',s.move_button,{readOnlyHint:false});
 register('remove_button','Remove a key from the deck.',s.remove_button,{readOnlyHint:false,destructiveHint:true});
 register('bind_cue','Point a cue key at a cue (or make a new cue key on an empty cell). The key keeps its camera gesture and ids; the label follows the new cue unless you give one.',s.bind_cue,{readOnlyHint:false,idempotentHint:true});
 register('attach_camera_gesture','Give a cue key the camera gesture (show the cue, recall a PTZ preset, wait, merge; the second press takes it out and returns the camera), copy one from another key, or remove it with gesture:null. Only on pages whose template allows gestures.',s.attach_camera_gesture,{readOnlyHint:false,idempotentHint:true});
 register('apply_template','(Re)apply a page template: put back any missing fixed key (switcher, recovery, Prev/Home/Next, Bimah Mute) and make Prev/Next follow the chain. A key sitting on a reserved cell is refused unless replace:true.',s.apply_template,{readOnlyHint:false,idempotentHint:true});
 register('layout_column','Lay out one column\'s cue keys by the deck grammar: the lead at the top, a sequence\'s parts down in order, then alternates and short selections; or in the order you give. Colour follows each key\'s role.',s.layout_column,{readOnlyHint:false,idempotentHint:true});
 register('sync_deck_with_catalog',`Keep the ${who} deck in step with the catalog after publishing, revising or retiring graphics: places each new cue on its standing page by the deck grammar (a sequence continues down its column, an alternate joins its slot's column), relabels renamed cues, and removes or flags keys bound to retired cues. Cues the grammar cannot place are listed with the reason; pass placements to say where. Dry run by default.`,s.sync_deck_with_catalog,{readOnlyHint:false});
 register('check_service_on_deck','Say whether every graphic a prepared service needs is on the deck: where each placed one is, and for each missing one where the grammar would put it (or why it cannot). Reads only.',s.check_service_on_deck,{readOnlyHint:true});
 register('validate_deck',`Check the whole ${who} deck: page templates and chains, cue bindings against the published catalog (retired or unpublished cues fail), connection labels exactly as the booth must have them, the module's actions and feedbacks, and reachability. Findings name the page, row and column.`,s.validate_deck,{readOnlyHint:true});
 register('export_deck_config','Make the full Companion export of the deck for the next big import: validates first (refused with the errors if it fails), then returns a signed download link that works for 15 minutes, the file\'s sha256 and every connection label the booth must match exactly. The same download is on the Setup page for a signed-in member.',s.export_deck_config,{readOnlyHint:true,idempotentHint:true});
}
