import {AuthoringError} from './authoring-model';

/**
 * TBI redo foundation - build keys. A bulk build names each thing it makes by a stable key of its
 * own ("mt150-ahavat-olam", "corpus-psalm-92"). This map remembers what each key became in this
 * workspace, so a re-run is idempotent (the same key updates or skips instead of duplicating) and a
 * later step can name the key instead of an id:
 *
 * - import_local_sources (G3) writes `local-source` keys -> a local: source id;
 * - batch_create_drafts (G4) writes `draft` keys -> a draft id, and `draft-set` keys -> a set id;
 * - apply_deck_plan (G6) reads them to bind each button to the right published cue.
 *
 * Keys are the caller's, not the product's: nothing user-visible shows one.
 */

export const BUILD_KEY_KINDS=['local-source','draft','draft-set'] as const;
export type BuildKeyKind=typeof BUILD_KEY_KINDS[number];
export type BuildKeyRecord={workspaceId:string;kind:BuildKeyKind;key:string;targetId:string;createdBy:string;createdAt:number;updatedAt:number};

export const BUILD_KEY_PATTERN=/^[a-z0-9][a-z0-9._:-]{0,119}$/;
export function buildKey(value:unknown,label='key'):string{
 if(typeof value!=='string'||!BUILD_KEY_PATTERN.test(value))throw new AuthoringError('invalid_build_key',`${label} must be 1-120 characters of lowercase letters, digits, and . _ : - (starting with a letter or digit), such as "mt150-ahavat-olam".`);
 return value;
}

export interface BuildKeyRepository{
 get(kind:BuildKeyKind,key:string):Promise<BuildKeyRecord|null>;
 list(kind?:BuildKeyKind):Promise<BuildKeyRecord[]>;
 /** Records or moves `key` to `targetId`. */
 put(record:BuildKeyRecord):Promise<BuildKeyRecord>;
}

export class MemoryBuildKeyRepository implements BuildKeyRepository{
 rows=new Map<string,BuildKeyRecord>();
 private id=(kind:BuildKeyKind,key:string)=>`${kind}\u0000${key}`;
 async get(kind:BuildKeyKind,key:string){const row=this.rows.get(this.id(kind,key));return row?{...row}:null}
 async list(kind?:BuildKeyKind){return [...this.rows.values()].filter(row=>!kind||row.kind===kind).map(row=>({...row}))}
 async put(record:BuildKeyRecord){const existing=this.rows.get(this.id(record.kind,record.key));const row={...record,createdAt:existing?.createdAt??record.createdAt,createdBy:existing?.createdBy??record.createdBy};this.rows.set(this.id(record.kind,record.key),row);return {...row}}
}

const missingTable=(error:unknown)=>(error as {code?:unknown}|null)?.code==='42P01';
const UNMIGRATED='Build keys are not set up in this workspace\'s database yet (db/build-keys.sql). Nothing was saved; ask whoever runs the database to apply it.';
type Row={workspace_id:string;kind:BuildKeyKind;key:string;target_id:string;created_by:string;created_at:number;updated_at:number};
const fromRow=(row:Row):BuildKeyRecord=>({workspaceId:row.workspace_id,kind:row.kind,key:row.key,targetId:row.target_id,createdBy:row.created_by,createdAt:Number(row.created_at),updatedAt:Number(row.updated_at)});

/** db/build-keys.sql. Until it is applied, reads answer nothing and writes refuse in a sentence. */
export class PgBuildKeyRepository implements BuildKeyRepository{
 constructor(private workspaceId:string){}
 private async query(sql:string,values:unknown[],write:boolean){try{return await (await import('./database')).db.query(sql,values)}catch(error){if(missingTable(error)){if(write)throw new AuthoringError('build_keys_unavailable',UNMIGRATED,503);return {rows:[],rowCount:0}}throw error}}
 async get(kind:BuildKeyKind,key:string){const row=(await this.query('SELECT * FROM build_keys WHERE workspace_id=$1 AND kind=$2 AND key=$3',[this.workspaceId,kind,key],false)).rows[0] as Row|undefined;return row?fromRow(row):null}
 async list(kind?:BuildKeyKind){return ((await this.query(kind?'SELECT * FROM build_keys WHERE workspace_id=$1 AND kind=$2 ORDER BY key':'SELECT * FROM build_keys WHERE workspace_id=$1 ORDER BY kind,key',kind?[this.workspaceId,kind]:[this.workspaceId],false)).rows as Row[]).map(fromRow)}
 async put(record:BuildKeyRecord){const row=(await this.query('INSERT INTO build_keys(workspace_id,kind,key,target_id,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT (workspace_id,kind,key) DO UPDATE SET target_id=EXCLUDED.target_id,updated_at=EXCLUDED.updated_at RETURNING *',[this.workspaceId,record.kind,record.key,record.targetId,record.createdBy,record.updatedAt],true)).rows[0] as Row;return fromRow(row)}
}
