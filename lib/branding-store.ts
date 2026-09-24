// Storage for one workspace's branding (MCP plan L4, R-B2; db/workspace-branding.sql): one row per
// workspace, written with an optimistic version. Version 0 means nothing is stored and the
// workspace renders with its built-in identity; the first write names 0. The pattern is
// lib/authoring-defaults-store.ts's.
import {getPublicWorkspace,type PublicWorkspace} from './workspace';
import {brandedWorkspace,parseBrandingDocument,resolveBranding,type ResolvedBranding,type WorkspaceBrandingDocument} from './branding-palette';

/** A refusal in plain words; lib/authoring.ts turns it into an AuthoringError for the MCP. Kept local so /api/workspace doesn't load the authoring model. */
export class BrandingError extends Error{constructor(public code:string,message:string,public status=400){super(message)}}

export type StoredBranding={version:number;document:WorkspaceBrandingDocument;updatedAt:number;updatedBy:string};
export interface WorkspaceBrandingRepository{
 get():Promise<StoredBranding|null>;
 /** Store `document` when the stored version is still `expectedVersion`; the new version is one higher. */
 put(document:WorkspaceBrandingDocument,expectedVersion:number,actor:string,now:number):Promise<StoredBranding>;
}

export const brandingConflict=(version:number)=>new BrandingError('version_conflict',`The branding changed since you read it (now version ${version}). Call get_branding and try again. Nothing was changed.`,409);

export class MemoryWorkspaceBrandingRepository implements WorkspaceBrandingRepository{
 private row:StoredBranding|null=null;
 async get(){return this.row?structuredClone(this.row):null}
 async put(document:WorkspaceBrandingDocument,expectedVersion:number,actor:string,now:number){
  const current=this.row?.version??0;if(current!==expectedVersion)throw brandingConflict(current);
  this.row={version:current+1,document:structuredClone(document),updatedAt:now,updatedBy:actor};return structuredClone(this.row);
 }
}

const missingTable=(error:unknown)=>(error as {code?:unknown})?.code==='42P01';
type Row={version:number;document:unknown;updated_at:number;updated_by:string};
type Queryable={query(text:string,values?:unknown[]):Promise<{rows:unknown[]}>};
const stored=(row:Row):StoredBranding=>({version:Number(row.version),document:parseBrandingDocument(row.document),updatedAt:Number(row.updated_at),updatedBy:row.updated_by});

export class PgWorkspaceBrandingRepository implements WorkspaceBrandingRepository{
 /** `database` is for tests; the deployment's pool is imported lazily so a memory service never loads pg. */
 constructor(private workspaceId=(process.env.WORKSPACE_ID?.trim()||'crc').toLowerCase(),private database?:Queryable){}
 private async db():Promise<Queryable>{return this.database??(await import('./database')).db}
 // Until db/workspace-branding.sql is applied there is no table, which reads as "nothing stored":
 // the workspace renders exactly as it did before L4.
 async get(){
  // A process with no database configured (a local stage, a test) has nothing stored; it never dials one.
  if(!this.database&&!process.env.DATABASE_URL)return null;
  try{const row=(await (await this.db()).query('SELECT version,document,updated_at,updated_by FROM workspace_branding WHERE workspace_id=$1',[this.workspaceId])).rows[0] as Row|undefined;return row?stored(row):null}
  catch(error){if(missingTable(error))return null;throw error}
 }
 async put(document:WorkspaceBrandingDocument,expectedVersion:number,actor:string,now:number){
  if(!this.database&&!process.env.DATABASE_URL)throw new BrandingError('branding_unavailable',"Branding can't be saved: this server has no database configured. Nothing was changed.",503);
  try{
   const db=await this.db();
   const result=expectedVersion===0
    ?await db.query('INSERT INTO workspace_branding(workspace_id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,$3,$3,$4,$4) ON CONFLICT (workspace_id) DO NOTHING RETURNING version,document,updated_at,updated_by',[this.workspaceId,document,now,actor])
    :await db.query('UPDATE workspace_branding SET document=$2,version=version+1,updated_at=$4,updated_by=$5 WHERE workspace_id=$1 AND version=$3 RETURNING version,document,updated_at,updated_by',[this.workspaceId,document,expectedVersion,now,actor]);
   const row=result.rows[0] as Row|undefined;if(row)return stored(row);
   throw brandingConflict((await this.get())?.version??0);
  }catch(error){
   if(missingTable(error))throw new BrandingError('branding_unavailable',"Branding can't be saved yet: this workspace's database has no workspace_branding table (db/workspace-branding.sql). Nothing was changed. Ask the maintainer to apply it.",503);
   throw error;
  }
 }
}

// Rehearsal keeps one in-process row, shared by the MCP tools and /api/workspace (a global, so a
// route bundle that loads this module separately still sees the same row).
const REHEARSAL_KEY=Symbol.for('crc-overlays.rehearsal-branding');
export function defaultBrandingRepository():WorkspaceBrandingRepository{
 if(process.env.CRC_AUTHORING_REHEARSAL==='1'){
  if(process.env.NODE_ENV!=='development'||process.env.VERCEL)throw new BrandingError('unsafe_rehearsal_config','In-memory branding is allowed only in local development.',503);
  const holder=globalThis as unknown as Record<symbol,WorkspaceBrandingRepository|undefined>;
  return holder[REHEARSAL_KEY]??=new MemoryWorkspaceBrandingRepository();
 }
 return new PgWorkspaceBrandingRepository();
}

/** How long a branding read may hold up /api/workspace (the output page gives that request 4 s). */
export const BRANDING_READ_TIMEOUT_MS=1500;
/** How long this process reuses a branding read for /api/workspace, which every page asks for. */
export const BRANDING_MEMO_MS=5000;
let memo:{at:number;row:StoredBranding|null}|null=null;
/** Forget the memoised read; update_branding calls it so this process serves the new values at once. */
export function forgetBrandingMemo(){memo=null}

/**
 * The resolved branding for this workspace; a store that can't be read in time resolves to the
 * built-in identity. The deployment's own store is memoised briefly; an injected one never is.
 */
export async function currentBranding(workspace:PublicWorkspace=getPublicWorkspace(),repository?:WorkspaceBrandingRepository,options:{timeoutMs?:number;now?:number}={}):Promise<{resolved:ResolvedBranding;stored:StoredBranding|null;readFailed:boolean}>{
 const now=options.now??Date.now(),memoised=!repository;
 if(memoised&&memo&&now-memo.at<BRANDING_MEMO_MS)return {resolved:resolveBranding(workspace,memo.row),stored:memo.row,readFailed:false};
 let row:StoredBranding|null=null,readFailed=false,timer:ReturnType<typeof setTimeout>|undefined;
 try{row=await Promise.race([(repository??defaultBrandingRepository()).get(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('branding read timed out')),options.timeoutMs??BRANDING_READ_TIMEOUT_MS)})])}
 catch{readFailed=true}
 finally{if(timer)clearTimeout(timer)}
 if(memoised&&!readFailed)memo={at:now,row};
 return {resolved:resolveBranding(workspace,row),stored:row,readFailed};
}

/**
 * /api/workspace's body: the public workspace with its stored branding applied. The output page must
 * always start, so a branding store that can't be read serves the built-in identity instead.
 */
export async function publicWorkspaceWithBranding(workspace:PublicWorkspace=getPublicWorkspace(),repository?:WorkspaceBrandingRepository){
 const {resolved}=await currentBranding(workspace,repository);
 return brandedWorkspace(workspace,resolved);
}
