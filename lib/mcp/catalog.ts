import {z} from 'zod/v4';
import {type RegisterTool,id} from './shared';

// Reading what can be authored from: the source corpus and the baseline templates.
export function registerCatalogTools(register:RegisterTool){
 register('search_sources','Search the authorized CRC source corpus. Returns references, never a public corpus export.',z.object({query:z.string().min(1).max(100),limit:z.number().int().min(1).max(50).optional()}).strict(),{readOnlyHint:true});
 register('get_source','Get one authorized source by ID.',z.object({sourceId:id}).strict(),{readOnlyHint:true});
 register('list_templates','List baseline cue templates and whether each can be imported.',z.object({}).strict(),{readOnlyHint:true});
}
