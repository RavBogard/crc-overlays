import {z} from 'zod/v4';
import {type McpIdentity,type RegisterTool,id} from './shared';

// Which congregation this is, and what can be authored from: the source corpus and the baseline templates.
export function registerCatalogTools(register:RegisterTool,identity:McpIdentity){
 register('get_workspace',`Say which congregation this connection serves (${identity.organizationName}, workspace '${identity.workspaceId}' at ${identity.host}) and whether it is a rehearsal. Call it first when you hold more than one overlays connector; every change here takes this workspace id.`,z.object({}).strict(),{readOnlyHint:true});
 register('search_sources',`Search the authorized ${identity.shortName} source corpus. Returns references, never a public corpus export.`,z.object({query:z.string().min(1).max(100),limit:z.number().int().min(1).max(50).optional()}).strict(),{readOnlyHint:true});
 register('get_source','Get one authorized source by ID.',z.object({sourceId:id}).strict(),{readOnlyHint:true});
 register('list_templates','List baseline cue templates and whether each can be imported.',z.object({}).strict(),{readOnlyHint:true});
}
