export const MAX_MESSAGE_BYTES=4096;
export const MAX_SNAPSHOT_BYTES=256*1024;
export const MAX_RECEIPTS=2048;
export const STALE_MS=30_000;
export const PROTOCOL='crc-overlays-v1';
export type Role='control'|'output'|'preview';
export type Mode='animate'|'cut';
export type Phase='settled'|'transition'|'error';
export type CuePayload=Record<string,unknown>;
export type ApprovedCatalog={version:string;cues:CuePayload[]};
export type Renderer={id:string;revision:number;cue:string|null;phase:Phase;seen:number};
export type LiveState={revision:number;cue:string|null;mode:Mode;updated:number;cuePayload:CuePayload|null;catalogVersion:string};
export type Snapshot=LiveState&{renderers:Renderer[];serverTime:number};
export type Command={action:'in'|'out'|'clear'|'cut';cue:string|null;commandId:string;clientId:string|null;sequence:number|null};
export type SocketAttachment={role:Role;id:string|null;seen:number;ack:Renderer|null};
export type Ticket={room:'crc';role:Role;exp:number;jti:string};

const tokenPattern=/^[A-Za-z0-9_-]{8,160}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validToken=(value:unknown)=>typeof value==='string'&&tokenPattern.test(value);
export const validUuid=(value:unknown)=>typeof value==='string'&&uuidPattern.test(value);
export const validInteger=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0;
export const validCatalogVersion=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=160;
export const jsonBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function parseCommand(value:unknown):Command|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 const action=input.action;
 if(!['in','out','clear','cut'].includes(String(action))||!validToken(input.commandId))return null;
 const selects=action==='in'||action==='out';
 const cue=selects&&typeof input.cue==='string'&&input.cue.length<=160?input.cue:null;
 if(selects&&!cue)return null;
 if(!selects&&input.cue!==null)return null;
 if('cuePayload' in input||'catalogVersion' in input)return null;
 const clientId=input.clientId;
 const sequence=input.sequence;
 if(clientId===null){if(sequence!==null)return null}
 else if(!validToken(clientId)||!validInteger(sequence))return null;
 return {action:action as Command['action'],cue,commandId:input.commandId as string,clientId:clientId as string|null,sequence:sequence as number|null};
}

export function parseCatalog(value:unknown):ApprovedCatalog|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(!validCatalogVersion(input.version)||!Array.isArray(input.cues)||!input.cues.length)return null;
 const ids=new Set<string>();
 const cues:CuePayload[]=[];
 for(const cue of input.cues){
  if(!cue||typeof cue!=='object'||Array.isArray(cue))return null;
  const id=(cue as Record<string,unknown>).id;
  if(typeof id!=='string'||!id||id.length>160||ids.has(id))return null;
  ids.add(id);cues.push(cue as CuePayload);
 }
 return {version:input.version as string,cues};
}

export function parseInitialState(value:unknown,catalogVersion:unknown):LiveState|null{
 if(!value||typeof value!=='object'||Array.isArray(value)||!validCatalogVersion(catalogVersion))return null;
 const input=value as Record<string,unknown>;
 if(!validInteger(input.revision)||!validInteger(input.updated)||!['animate','cut'].includes(String(input.mode)))return null;
 if(input.cue!==null&&typeof input.cue!=='string')return null;
 if(input.cuePayload!==null&&(!input.cuePayload||typeof input.cuePayload!=='object'||Array.isArray(input.cuePayload)))return null;
 return {revision:input.revision as number,cue:input.cue as string|null,mode:input.mode as Mode,updated:input.updated as number,cuePayload:input.cuePayload as CuePayload|null,catalogVersion:catalogVersion as string};
}

export function nextState(current:LiveState,command:Command,selected:CuePayload|null,now:number):LiveState{
 let cue:string|null=null;
 let cuePayload:CuePayload|null=null;
 if(command.action==='in'){cue=command.cue;cuePayload=selected}
 else if(command.action==='out'&&current.cue!==command.cue){cue=current.cue;cuePayload=current.cuePayload}
 return {...current,revision:current.revision+1,cue,mode:command.action==='cut'?'cut':'animate',updated:now,cuePayload};
}

export function parseAck(value:unknown,helloId:string|null):Renderer|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(!validUuid(input.id)||input.id!==helloId||!validInteger(input.revision)||!['settled','transition','error'].includes(String(input.phase))||(input.cue!==null&&typeof input.cue!=='string'))return null;
 return {id:input.id as string,revision:input.revision as number,cue:input.cue as string|null,phase:input.phase as Phase,seen:Date.now()};
}

function decodeBase64Url(value:string){
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
 const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

export async function verifyTicket(raw:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):Promise<Ticket|null>{
 const [payloadPart,signaturePart,...extra]=raw.split('.');
 if(!payloadPart||!signaturePart||extra.length||!secret)return null;
 try{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,decodeBase64Url(signaturePart),new TextEncoder().encode(payloadPart)))return null;
  const payload=JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart))) as Record<string,unknown>;
  if(payload.room!=='crc'||!['control','output','preview'].includes(String(payload.role))||!Number.isSafeInteger(payload.exp)||!validToken(payload.jti))return null;
  const exp=payload.exp as number;
  if(exp<=nowSeconds||exp>nowSeconds+120)return null;
  return payload as Ticket;
 }catch{return null}
}
