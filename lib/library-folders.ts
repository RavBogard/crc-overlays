import {randomUUID} from 'node:crypto';
import {AuthoringError} from './authoring-model';

export type LibraryFolder={id:string;name:string};
export type LibraryFolders={version:number;folders:LibraryFolder[];assignments:Record<string,string>};
export type FolderOperation=
 |{operation:'create';expectedVersion:number;name:string}
 |{operation:'rename';expectedVersion:number;folderId:string;name:string}
 |{operation:'move';expectedVersion:number;cueId:string;folderId:string|null}
 |{operation:'delete';expectedVersion:number;folderId:string};

export const emptyLibraryFolders=():LibraryFolders=>({version:0,folders:[],assignments:{}});
const invalid=(message:string)=>new AuthoringError('invalid_input',message);
const conflict=(version:number)=>new AuthoringError('version_conflict',`Folders changed since you opened them (now version ${version}). Reload and try again. Nothing was changed.`,409,{version});
const object=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Body must be an object');
 return value as Record<string,unknown>;
};
const exactKeys=(value:Record<string,unknown>,allowed:string[])=>{
 const extra=Object.keys(value).filter(key=>!allowed.includes(key));
 if(extra.length)throw invalid(`Body contains unsupported fields: ${extra.join(', ')}`);
};
const id=(value:unknown,label:string)=>{
 if(typeof value!=='string'||!value||value.length>200||! /^[A-Za-z0-9_:-]+$/.test(value))throw invalid(`${label} must be a valid ID`);
 return value;
};
const name=(value:unknown)=>{
 if(typeof value!=='string')throw invalid('Folder name must be text');
 const trimmed=value.trim();
 if(!trimmed||trimmed.length>80||/[\p{Cc}\p{Cf}]/u.test(trimmed))throw invalid('Folder name must be 1–80 visible characters');
 return trimmed;
};

export function parseFolderOperation(body:unknown):FolderOperation{
 const input=object(body),operation=input.operation;
 const expectedVersion=input.expectedVersion;
 if(!Number.isSafeInteger(expectedVersion)||(expectedVersion as number)<0)throw invalid('expectedVersion must be a nonnegative integer');
 switch(operation){
  case 'create':exactKeys(input,['operation','expectedVersion','name']);return {operation,expectedVersion:expectedVersion as number,name:name(input.name)};
  case 'rename':exactKeys(input,['operation','expectedVersion','folderId','name']);return {operation,expectedVersion:expectedVersion as number,folderId:id(input.folderId,'folderId'),name:name(input.name)};
  case 'move':exactKeys(input,['operation','expectedVersion','cueId','folderId']);return {operation,expectedVersion:expectedVersion as number,cueId:id(input.cueId,'cueId'),folderId:input.folderId===null?null:id(input.folderId,'folderId')};
  case 'delete':exactKeys(input,['operation','expectedVersion','folderId']);return {operation,expectedVersion:expectedVersion as number,folderId:id(input.folderId,'folderId')};
  default:throw invalid('operation must be create, rename, move, or delete');
 }
}

/** Folder metadata is independent of cue content and publication revisions. */
export function applyFolderOperation(current:LibraryFolders,operation:FolderOperation,validCueIds:ReadonlySet<string>,newId:()=>string=()=>randomUUID()):LibraryFolders{
 if(current.version!==operation.expectedVersion)throw conflict(current.version);
 const next:LibraryFolders={version:current.version+1,folders:current.folders.map(folder=>({...folder})),assignments:{...current.assignments}};
 const folder=(folderId:string)=>{
  const found=next.folders.find(item=>item.id===folderId);
  if(!found)throw new AuthoringError('unknown_folder','Folder no longer exists',404);
  return found;
 };
 const unique=(value:string,except?:string)=>{
  if(next.folders.some(item=>item.id!==except&&item.name.toLocaleLowerCase()===value.toLocaleLowerCase()))throw new AuthoringError('folder_name_conflict','A folder with this name already exists',409);
 };
 switch(operation.operation){
  case 'create':unique(operation.name);next.folders.push({id:newId(),name:operation.name});break;
  case 'rename':{const target=folder(operation.folderId);unique(operation.name,target.id);target.name=operation.name;break;}
  case 'move':
   if(!validCueIds.has(operation.cueId))throw new AuthoringError('unknown_graphic','Graphic is not in this workspace',404);
   if(operation.folderId===null)delete next.assignments[operation.cueId];
   else{folder(operation.folderId);next.assignments[operation.cueId]=operation.folderId;}
   break;
  case 'delete':
   folder(operation.folderId);
   next.folders=next.folders.filter(item=>item.id!==operation.folderId);
   for(const [cueId,folderId] of Object.entries(next.assignments))if(folderId===operation.folderId)delete next.assignments[cueId];
   break;
 }
 return next;
}

export interface LibraryFoldersRepository{
 get():Promise<LibraryFolders>;
 put(next:LibraryFolders,expectedVersion:number,actor:string,now:number):Promise<LibraryFolders>;
}

export class MemoryLibraryFoldersRepository implements LibraryFoldersRepository{
 private current=emptyLibraryFolders();
 async get(){return structuredClone(this.current)}
 async put(next:LibraryFolders,expectedVersion:number){
  if(this.current.version!==expectedVersion)throw conflict(this.current.version);
  if(next.version!==expectedVersion+1)throw invalid('Folder version is invalid');
  this.current=structuredClone(next);return structuredClone(this.current);
 }
}

type Row={version:number;document:{folders:LibraryFolder[];assignments:Record<string,string>}};
type Queryable={query(text:string,values?:unknown[]):Promise<{rows:unknown[]}>};
const missingTable=(error:unknown)=>(error as {code?:unknown})?.code==='42P01';
const stored=(row:Row|undefined):LibraryFolders=>row?{version:Number(row.version),folders:row.document.folders,assignments:row.document.assignments}:emptyLibraryFolders();

export class PgLibraryFoldersRepository implements LibraryFoldersRepository{
 constructor(private workspaceId=(process.env.WORKSPACE_ID?.trim()||'crc').toLowerCase(),private database?:Queryable){}
 private async db():Promise<Queryable>{return this.database??(await import('./database')).db}
 async get(){
  try{return stored((await (await this.db()).query('SELECT version,document FROM workspace_library_folders WHERE workspace_id=$1',[this.workspaceId])).rows[0] as Row|undefined)}
  catch(error){if(missingTable(error))return emptyLibraryFolders();throw error}
 }
 async put(next:LibraryFolders,expectedVersion:number,actor:string,now:number){
  if(next.version!==expectedVersion+1)throw invalid('Folder version is invalid');
  const document={folders:next.folders,assignments:next.assignments};
  try{
   const db=await this.db();
   const result=expectedVersion===0
    ?await db.query('INSERT INTO workspace_library_folders(workspace_id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,$3,$3,$4,$4) ON CONFLICT(workspace_id) DO NOTHING RETURNING version,document',[this.workspaceId,document,now,actor])
    :await db.query('UPDATE workspace_library_folders SET document=$2,version=version+1,updated_at=$4,updated_by=$5 WHERE workspace_id=$1 AND version=$3 RETURNING version,document',[this.workspaceId,document,expectedVersion,now,actor]);
   const row=result.rows[0] as Row|undefined;
   if(row)return stored(row);
   throw conflict((await this.get()).version);
  }catch(error){
   if(missingTable(error))throw new AuthoringError('folders_unavailable','Folder storage is not available yet (db/library-folders.sql). Nothing was changed.',503);
   throw error;
  }
 }
}
