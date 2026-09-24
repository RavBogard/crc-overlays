import {z} from 'zod/v4';
import type {RegisterTool} from './shared';

// Prepared services, and what the output actually did.
export function registerServicesTools(register:RegisterTool){
 register('prepare_service_from_setlist','Build a prepared service on /services from a centralreform.live setlist: each row is matched to a published graphic and every row that could not be settled comes back for review. It never publishes anything, never changes a published graphic, and never puts anything on screen.',z.object({setlistId:z.string().min(1).max(160),name:z.string().min(1).max(120).optional(),service:z.string().min(1).max(120).optional()}).strict(),{readOnlyHint:false});
 register('get_service_history','Read what this congregation\'s output actually did: one row per accepted command, with the graphic id and its liturgical position (unit, moment, book, folio) and the time. Bounded to the last 2,000 commands or 14 days, whichever is smaller. It carries no graphic names, no text and nobody\'s identity, and it never puts anything on screen.',z.object({since:z.number().int().nonnegative().optional(),until:z.number().int().nonnegative().optional(),after:z.number().int().nonnegative().optional()}).strict(),{readOnlyHint:true});
}
