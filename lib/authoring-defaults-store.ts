import {AuthoringError} from './authoring-model';
import {parseStoredDefaults,type AuthoringDefaults,type StoredAuthoringDefaults} from './authoring-defaults';

// Storage for one workspace's house defaults (db/authoring-defaults.sql): one row per workspace,
// written with an optimistic version. Version 0 means nothing is stored yet; the first write names 0.
export interface AuthoringDefaultsRepository{
 get():Promise<StoredAuthoringDefaults|null>;
 /** Store `defaults` when the stored version is still `expectedVersion`; the new version is one higher. */
 put(defaults:AuthoringDefaults,expectedVersion:number,actor:string,now:number):Promise<StoredAuthoringDefaults>;
}

export const defaultsConflict=(version:number)=>new AuthoringError('version_conflict',`The house defaults changed since you read them (now version ${version}). Call get_authoring_defaults and try again. Nothing was changed.`,409);

export class MemoryAuthoringDefaultsRepository implements AuthoringDefaultsRepository{
 private row:StoredAuthoringDefaults|null=null;
 async get(){return this.row?structuredClone(this.row):null}
 async put(defaults:AuthoringDefaults,expectedVersion:number,actor:string,now:number){
  const current=this.row?.version??0;if(current!==expectedVersion)throw defaultsConflict(current);
  this.row={version:current+1,defaults:structuredClone(defaults),updatedAt:now,updatedBy:actor};return structuredClone(this.row);
 }
}

const MISSING_TABLE='42P01';
const missingTable=(error:unknown)=>(error as {code?:unknown})?.code===MISSING_TABLE;
type Row={version:number;document:unknown;updated_at:number;updated_by:string};
type Queryable={query(text:string,values?:unknown[]):Promise<{rows:unknown[]}>};
const stored=(row:Row):StoredAuthoringDefaults=>({version:Number(row.version),defaults:parseStoredDefaults(row.document),updatedAt:Number(row.updated_at),updatedBy:row.updated_by});

export class PgAuthoringDefaultsRepository implements AuthoringDefaultsRepository{
 /** `database` is for tests; the deployment's pool is imported lazily so a memory service never loads pg. */
 constructor(private workspaceId=(process.env.WORKSPACE_ID?.trim()||'crc').toLowerCase(),private database?:Queryable){}
 private async db():Promise<Queryable>{return this.database??(await import('./database')).db}
 // Until db/authoring-defaults.sql is applied there is no table, which reads as "no defaults":
 // every create and copy then behaves exactly as it did before T1.
 async get(){
  try{const row=(await (await this.db()).query('SELECT version,document,updated_at,updated_by FROM authoring_defaults WHERE workspace_id=$1',[this.workspaceId])).rows[0] as Row|undefined;return row?stored(row):null}
  catch(error){if(missingTable(error))return null;throw error}
 }
 async put(defaults:AuthoringDefaults,expectedVersion:number,actor:string,now:number){
  try{
   const db=await this.db();
   const result=expectedVersion===0
    ?await db.query('INSERT INTO authoring_defaults(workspace_id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,$3,$3,$4,$4) ON CONFLICT (workspace_id) DO NOTHING RETURNING version,document,updated_at,updated_by',[this.workspaceId,defaults,now,actor])
    :await db.query('UPDATE authoring_defaults SET document=$2,version=version+1,updated_at=$4,updated_by=$5 WHERE workspace_id=$1 AND version=$3 RETURNING version,document,updated_at,updated_by',[this.workspaceId,defaults,expectedVersion,now,actor]);
   const row=result.rows[0] as Row|undefined;if(row)return stored(row);
   throw defaultsConflict((await this.get())?.version??0);
  }catch(error){
   if(missingTable(error))throw new AuthoringError('defaults_unavailable',"House defaults can't be saved yet: this workspace's database has no authoring_defaults table (db/authoring-defaults.sql). Nothing was changed. Ask the maintainer to apply it.",503);
   throw error;
  }
 }
}
