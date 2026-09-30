// Prepare first; inspect the count/backup, then apply that exact plan. No text is rebuilt.
// node --env-file=<private-env> node_modules/tsx/dist/cli.mjs scripts/rollout-overlay-settings.ts
//   plan|apply|undo --workspace <id> --file <private-plan.json> [--include-inactive]
import {readFileSync, writeFileSync} from 'node:fs';
import {Pool} from 'pg';
import {cueHash, editableFromBaseline, sourcePinFor, sourceSnapshotsFor, type Draft, type AuthoringCue} from '../lib/authoring-model';
import {baselineCatalogForWorkspace, starterSourceMap} from '../lib/workspace-catalog';
import {assertSettingsOnly, eligibleForRollout, needsRollout, ROLLOUT_SETTINGS, settingsOnly, stableDigest} from '../lib/overlay-settings-rollout';

const args=process.argv.slice(2), mode=args[0];
const arg=(key:string)=>args[args.indexOf(key)+1];
const workspace=arg('--workspace'), file=arg('--file');
if(!['plan','apply','undo'].includes(mode)||!args.includes('--workspace')||!args.includes('--file'))throw Error('Supply plan|apply|undo --workspace <id> --file <private-plan.json>');
if(workspace!==(process.env.WORKSPACE_ID?.trim()||'crc'))throw Error('Workspace does not match the loaded environment');
const actor='settings-rollout:2026-09-30';
type Revision={revision:number;draft_version:number;cue:AuthoringCue;source_commits:string[]|null};
type Change={id:string;existed:boolean;before:Draft;beforeRevision:Revision|null;after:Draft;afterCue:AuthoringCue|null;newRevision:number|null};
type Plan={version:1;workspace:string;schema:string;createdAt:string;includeInactive:boolean;defaultsBefore:Record<string,unknown>|null;defaultsAfter:Record<string,unknown>;changes:Change[]};
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:15000});
const db=await pool.connect();
try{
 await db.query(mode==='plan'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
 const schema=(await db.query('SELECT current_schema() AS schema')).rows[0].schema;
 const expectedSchema=args.includes('--schema')?arg('--schema'):'public';
 if(schema!==expectedSchema)throw Error('Database schema does not match the explicit target');
 if(mode==='plan'){
  const stored=(await db.query('SELECT document FROM authoring_drafts')).rows.map(r=>r.document as Draft);
  const existing=new Set(stored.map(d=>d.id));
  const selectedRevisions=new Map((await db.query("SELECT r.* FROM authoring_revisions r JOIN authoring_drafts d ON d.id=r.draft_id AND r.revision=COALESCE(d.active_revision,(d.document->'retired'->>'revision')::integer)")).rows.map(r=>[r.draft_id,r as Revision]));
  const nextRevisions=new Map((await db.query('SELECT draft_id,MAX(revision)+1 AS next FROM authoring_revisions GROUP BY draft_id')).rows.map(r=>[r.draft_id,Number(r.next)]));
  const baseline=baselineCatalogForWorkspace(workspace);
  const sourceIds=new Map([...starterSourceMap(workspace)].map(([source,destination])=>[destination,source]));
  const now=Date.now();
  const builtins=baseline.filter(c=>!c.hidden&&!existing.has(c.id)).map(c=>{
   const editable=editableFromBaseline(sourceIds.get(c.id)||c.id), snapshots=sourceSnapshotsFor(editable.content);
   return {...editable,id:c.id,name:c.name,version:1,sourceSnapshots:snapshots,sourcePin:sourcePinFor(editable.content,snapshots),activeRevision:0,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor} as Draft;
  });
  const changes:Change[]=[];
  for(const before of [...stored,...builtins]){
   if(!eligibleForRollout(before,args.includes('--include-inactive')))continue;
   const existed=existing.has(before.id), revision=before.activeRevision??before.retired?.revision;
   const oldRevision:Revision|null=!existed?{revision:0,draft_version:1,cue:baseline.find(c=>c.id===before.id)! as AuthoringCue,source_commits:null}:revision!=null?selectedRevisions.get(before.id)??null:null;
   if(!needsRollout(before.presentation)&&(!oldRevision||!needsRollout(oldRevision.cue.presentation)))continue;
   const after=settingsOnly(before);assertSettingsOnly(before,after);
   const nextVersion=existed?before.version+1:1;
   if(existed&&revision!=null&&!oldRevision)throw Error(`Graphic ${before.id} points to a missing published revision`);
   const changeLive=oldRevision&&(needsRollout(oldRevision.cue.presentation)||before.activeDraftVersion===before.version);
   const nextRevision=changeLive?(nextRevisions.get(before.id)??1):null;
   const afterCue=changeLive?settingsOnly(oldRevision!.cue):null;
   if(oldRevision&&afterCue)assertSettingsOnly(oldRevision.cue,afterCue);
   after.version=nextVersion;after.updatedAt=now;after.updatedBy=actor;
   if(before.activeRevision!==null){after.activeRevision=nextRevision??before.activeRevision;after.activeDraftVersion=before.activeDraftVersion===before.version?nextVersion:before.activeDraftVersion;}
   if(before.retired&&nextRevision!==null)after.retired={...before.retired,revision:nextRevision};
   if(afterCue?.authoring&&before.activeDraftVersion===before.version)afterCue.authoring.draftVersion=nextVersion;
   changes.push({id:before.id,existed,before,beforeRevision:oldRevision,after,afterCue,newRevision:nextRevision});
  }
  const defaultsBefore=(await db.query('SELECT * FROM authoring_defaults WHERE workspace_id=$1',[workspace])).rows[0]??null;
  const defaultsAfter={...(defaultsBefore?.document??{}),...ROLLOUT_SETTINGS};
  const plan:Plan={version:1,workspace,schema,createdAt:new Date().toISOString(),includeInactive:args.includes('--include-inactive'),defaultsBefore,defaultsAfter,changes};
  writeFileSync(file,JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({workspace,count:changes.length,published:changes.filter(c=>c.before.activeRevision!==null).length,importedBuiltins:changes.filter(c=>!c.existed).length,backup:file}));
 }else{
  const plan=JSON.parse(readFileSync(file,'utf8')) as Plan;
  if(plan.version!==1||plan.workspace!==workspace||plan.schema!==schema)throw Error('Plan identity mismatch');
  const appliedPath=file+'.applied.json';
  const applied=mode==='undo'?JSON.parse(readFileSync(appliedPath,'utf8')) as {defaultsAfter:Record<string,unknown>}:null;
  // Check the whole batch before writing any record. An intervening edit aborts the transaction.
  for(const change of plan.changes){
   assertSettingsOnly(change.before,{...change.after,version:change.before.version,updatedAt:change.before.updatedAt,updatedBy:change.before.updatedBy,activeRevision:change.before.activeRevision,activeDraftVersion:change.before.activeDraftVersion,...(change.before.retired?{retired:change.before.retired}:{})});
   if(change.afterCue&&change.beforeRevision){
    const checked=structuredClone(change.afterCue);
    if(checked.authoring&&change.beforeRevision.cue.authoring)checked.authoring.draftVersion=change.beforeRevision.cue.authoring.draftVersion;
    assertSettingsOnly(change.beforeRevision.cue,checked);
   }
   const row=(await db.query('SELECT document FROM authoring_drafts WHERE id=$1 FOR UPDATE',[change.id])).rows[0];
   const expected=mode==='apply'?(change.existed?change.before:null):change.after;
   if(stableDigest(row?.document??null)!==stableDigest(expected))throw Error(`Graphic ${change.id} changed since the plan; nothing applied`);
   if(mode==='apply'&&change.existed&&change.beforeRevision){
    const revision=(await db.query('SELECT revision,draft_version,cue,source_commits FROM authoring_revisions WHERE draft_id=$1 AND revision=$2 FOR SHARE',[change.id,change.beforeRevision.revision])).rows[0];
    const {revision: revisionNumber,draft_version,cue,source_commits}=change.beforeRevision;
    if(stableDigest(revision??null)!==stableDigest({revision:revisionNumber,draft_version,cue,source_commits}))throw Error(`Published graphic ${change.id} changed since the plan`);
   }
  }
  const defaults=(await db.query('SELECT * FROM authoring_defaults WHERE workspace_id=$1 FOR UPDATE',[workspace])).rows[0]??null;
  if(stableDigest(defaults)!==stableDigest(mode==='apply'?plan.defaultsBefore:applied!.defaultsAfter))throw Error('House defaults changed since the plan');
  for(const change of plan.changes){
   let document=change.after;
   if(mode==='undo'){
    document={...structuredClone(change.before),version:change.after.version+1,updatedAt:Date.now(),updatedBy:actor+':undo'};
    if(change.before.activeDraftVersion===change.before.version)document.activeDraftVersion=document.version;
    // A newly imported starter remains editable after undo, restored to its exact original cue.
    if(!change.existed){
     const rev=change.newRevision!+1;document.activeRevision=rev;
     await db.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,actor,created_at,source_commits) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[change.id,rev,document.version,cueHash(change.beforeRevision!.cue),change.beforeRevision!.cue,actor+':undo',Date.now(),change.beforeRevision!.source_commits]);
    }
   }
   if(mode==='apply'&&!change.existed)await db.query('INSERT INTO authoring_drafts(id,document,version,active_revision,active_draft_version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[document.id,document,document.version,document.activeRevision,document.activeDraftVersion,document.createdAt,document.updatedAt,document.createdBy,document.updatedBy]);
   else await db.query('UPDATE authoring_drafts SET document=$2,version=$3,active_revision=$4,active_draft_version=$5,updated_at=$6,updated_by=$7 WHERE id=$1',[document.id,document,document.version,document.activeRevision,document.activeDraftVersion,document.updatedAt,document.updatedBy]);
   if(mode==='apply'&&change.afterCue)await db.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,actor,created_at,source_commits) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[change.id,change.newRevision,document.activeDraftVersion??change.beforeRevision!.draft_version,cueHash(change.afterCue),change.afterCue,actor,Date.now(),change.beforeRevision!.source_commits]);
  }
  if(mode==='undo'&&!plan.defaultsBefore)await db.query('DELETE FROM authoring_defaults WHERE workspace_id=$1',[workspace]);
  else{
   const value=mode==='apply'?plan.defaultsAfter:plan.defaultsBefore!.document;
   await db.query('INSERT INTO authoring_defaults(workspace_id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,$3,$3,$4,$4) ON CONFLICT(workspace_id) DO UPDATE SET document=$2,version=authoring_defaults.version+1,updated_at=$3,updated_by=$4',[workspace,value,Date.now(),actor]);
  }
  const defaultsAfter=(await db.query('SELECT * FROM authoring_defaults WHERE workspace_id=$1',[workspace])).rows[0]??null;
  // Save undo evidence before commit; transaction failure still leaves original plan intact.
  if(mode==='apply')writeFileSync(appliedPath,JSON.stringify({status:'pending-commit',defaultsAfter},null,2),{mode:0o600});
 }
 await db.query(mode==='plan'?'ROLLBACK':'COMMIT');
 if(mode==='apply'){const marker=JSON.parse(readFileSync(file+'.applied.json','utf8'));writeFileSync(file+'.applied.json',JSON.stringify({...marker,status:'committed'},null,2),{mode:0o600});}
 if(mode!=='plan')console.log(JSON.stringify({workspace,operation:mode,status:'committed'}));
}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();await pool.end();}
