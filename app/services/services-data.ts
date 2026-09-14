/**
 * X5 (Phase E) - the one transport and vocabulary shared by the two service pages.
 *
 * `/services` (Prepared services) and `/services/log` (Service log) were one page until this
 * split. They still read the same `get_dashboard` payload over the same `/api/services`
 * endpoint with the same permissions, so the request shapes and the row types live here and
 * neither page owns a private copy.
 */

import type {SourceDisplay} from '@/lib/source-library';
import type {NamesList} from '@/lib/names-list';

// `hidden` and `aliasOf` are already stripped server-side (ServicesService.evidence filters
// hidden entries, and every alias is stamped hidden), but they are declared here so the one
// shared counter can be used without a cast and stays correct if that filter ever moves.
export type Cue={id:string;name:string;title?:string;layout?:string;hidden?:boolean;aliasOf?:string};
export type Entry={id:string;type:'cue'|'alternates'|'multipart';label:string;cueIds:string[];available:boolean;cues:{id:string;name:string;available:boolean}[]};
export type Coverage={id:string;label:string;status:string;cueId?:string;sourceId?:string;owner?:string;reason?:string;computedStatus:string;cueAvailable:boolean;sourceAvailable:boolean;degraded:boolean};
export type Collection={id:string;name:string;service:string;version:number;archived:boolean;entries:Entry[];coverage:Coverage[];names?:NamesList|null;updatedAt:number};
export type Feedback={id:string;version:number;collectionId?:string;kind:string;cueId?:string;context:string;reason:string;impact:string;productGap:boolean;archived:boolean;createdAt:number};
export type Dashboard={catalog:{cues:Cue[];version:string};collections:Collection[];feedback:Feedback[];permissions:{editCollections:boolean;recordFeedback:boolean;editFeedback:boolean}};
export type Source={id:string;name:string;book?:string;service?:string;section?:string;display?:SourceDisplay};
export type Role='owner'|'editor'|'operator';

export class ServicesRequestError extends Error{code:string;status:number;constructor(message:string,code:string,status:number){super(message);this.name='ServicesRequestError';this.code=code;this.status=status}}
export const isUnauthorized=(error:unknown)=>error instanceof ServicesRequestError&&error.status===401;

export async function call<T=Record<string,unknown>>(operation:string,input:unknown={}):Promise<T>{const response=await fetch('/api/services',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,input})});const raw=await response.text();let data:Record<string,unknown>={};try{data=JSON.parse(raw)}catch{if(!response.ok)throw new ServicesRequestError(`Request failed (${response.status})`,'',response.status)}if(!response.ok)throw new ServicesRequestError(typeof data.error==='string'?data.error:'Request failed',typeof data.code==='string'?data.code:'',response.status);return data as T}

const flatten=(value:string)=>value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0591-\u05c7]/g,'');

/**
 * X5: the global finder searches and adds, nothing else - it no longer mirrors the console's
 * library list. An empty query therefore matches nothing at all, rather than everything.
 */
export function findGraphics<T extends Cue>(cues:readonly T[],query:string):T[]{
 const normalized=flatten(query.trim());
 if(!normalized)return [];
 return cues.filter(cue=>flatten(`${cue.name} ${cue.title??''} ${cue.id}`).includes(normalized));
}

/**
 * D1 (Phase E browser pass): the finder has three states, not two - a blank query, a query with
 * no matches, and a query with matches. `found` is the result of `findGraphics` for that query.
 */
export function finderState(query:string,found:readonly unknown[]):'empty'|'none'|'results'{
 if(!query.trim())return 'empty';
 return found.length?'results':'none';
}
