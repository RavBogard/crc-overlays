import {z} from 'zod/v4';
import {serviceToolSchemas as s} from '../service-tool-schemas';
import type {RegisterTool} from './shared';

// Prepared services, and what the output actually did.
export function registerServicesTools(register:RegisterTool){
 register('prepare_service_from_setlist','Build a prepared service on /services from a centralreform.live setlist: each row is matched to a published graphic and every row that could not be settled comes back for review. It never publishes anything, never changes a published graphic, and never puts anything on screen.',z.object({setlistId:z.string().min(1).max(160),name:z.string().min(1).max(120).optional(),service:z.string().min(1).max(120).optional()}).strict(),{readOnlyHint:false});
 register('get_service_history','Read what this congregation\'s output actually did: one row per accepted command, with the graphic id and its liturgical position (unit, moment, book, folio) and the time. Bounded to the last 2,000 commands or 14 days, whichever is smaller. It carries no graphic names, no text and nobody\'s identity, and it never puts anything on screen.',z.object({since:z.number().int().nonnegative().optional(),until:z.number().int().nonnegative().optional(),after:z.number().int().nonnegative().optional()}).strict(),{readOnlyHint:true});
 // S2 (R-S2). A service is an ordered list of rows; each row may hold graphics (an entry) and a
 // coverage decision. Every change takes the version you read and returns the new one.
 register('list_services','List prepared services, newest first: id, name, version, where it was imported from, and how many rows are covered, need review or need a graphic.',s.list_services,{readOnlyHint:true});
 register('get_service','Read one prepared service: one compact line per row in service order (its graphics, coverage decision, candidates and what to do next). view:\'full\' returns the whole stored record.',s.get_service,{readOnlyHint:true});
 register('service_readiness','Say whether a prepared service is ready: per row covered, needs review, needs a graphic or not needed, with the next step for every row that is not ready.',s.service_readiness,{readOnlyHint:true});
 register('list_live_setlists','List recent planned services on centralreform.live that prepare_service_from_setlist can import, with the one nearest today when known. Reads only.',s.list_live_setlists,{readOnlyHint:true});
 register('create_service','Create a prepared service: empty, from the published library, or from rows you give in service order. It never publishes anything.',s.create_service,{readOnlyHint:false});
 register('rename_service','Change a prepared service\'s name or service label.',s.rename_service,{readOnlyHint:false,idempotentHint:true});
 register('add_entry','Add published graphics to a prepared service: one graphic, alternates or a multipart sequence, as a new row at a position or attached to an existing row that has none.',s.add_entry,{readOnlyHint:false});
 register('remove_entry','Remove a row\'s graphics from a prepared service. A row that also records a coverage decision keeps its place and that decision.',s.remove_entry,{readOnlyHint:false,destructiveHint:true});
 register('reorder_entries','Reorder a prepared service\'s rows (and with them its graphics), by the full new order or by moving one row.',s.reorder_entries,{readOnlyHint:false,idempotentHint:true});
 register('swap_graphic','Replace one published graphic on a row with another, keeping the row, its place and its coverage decision.',s.swap_graphic,{readOnlyHint:false,idempotentHint:true});
 register('resolve_coverage_row','Settle a row with one published graphic, usually one of its candidates: the row becomes covered and its graphics become that one graphic.',s.resolve_coverage_row,{readOnlyHint:false,idempotentHint:true});
 register('set_coverage_row','Record or change a row\'s coverage decision (status, graphic, source, owner, reason) and its button label, camera or note; add a new coverage row; or clear a decision.',s.set_coverage_row,{readOnlyHint:false});
 register('set_names','Set a prepared service\'s names list (for example a yahrzeit or mi sheberach list). Its panels join the live library as names graphics; nothing goes on screen.',s.set_names,{readOnlyHint:false,idempotentHint:true});
 register('clear_names','Remove a prepared service\'s names list. Refused while one of its panels is on air: clear the output on Live control first.',s.clear_names,{readOnlyHint:false,destructiveHint:true});
 register('archive_service','Archive a prepared service (restore_service brings it back). Its names list is removed with it, so this is refused while one of its names panels is on air.',s.archive_service,{readOnlyHint:false,idempotentHint:true});
 register('restore_service','Restore an archived prepared service.',s.restore_service,{readOnlyHint:false,idempotentHint:true});
 register('refresh_from_setlist','Re-import a prepared service from the centralreform.live setlist it came from. Decisions a person made are kept; rows still waiting on a decision take the new match; new setlist rows are added in order. Dry run by default.',s.refresh_from_setlist,{readOnlyHint:false});
}
