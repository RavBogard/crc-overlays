import {randomUUID} from 'node:crypto';
import type {Cue} from './player';
import {AuthoringError,assertSourcePin,baselineCues,buildCue,cueHash,editableFromBaseline,newDraftId,parseEditable,previewValidation,sourcePack,sourcePinFor,type AuthoringCue,type Draft,type EditableDraft} from './authoring-model';

export type BrowserMeasurement={viewportWidth:number;viewportHeight:number;fontsReady:true;overflow:false;rendererVersion:string;measuredAt:number};
export type ReviewReceipt={humanApproved:true;browserMeasurement:BrowserMeasurement;reviewedAt:number;reviewedBy:string};
export type PreviewRecord={id:string;draftId:string;draftVersion:number;cueHash:string;cue:AuthoringCue;validation:ReturnType<typeof previewValidation>;review:ReviewReceipt|null;createdAt:number;createdBy:string};
export type Revision={draftId:string;revision:number;draftVersion:number;cueHash:string;cue:AuthoringCue;previewId:string|null;review:ReviewReceipt|null;actor:string;createdAt:number};

export interface AuthoringRepository{
 listDrafts():Promise<Draft[]>; getDraft(id:string):Promise<Draft|null>; insertDraft(draft:Draft):Promise<Draft>; insertImportedDraft(draft:Draft,cue:AuthoringCue,actor:string):Promise<Draft>;
 updateDraft(id:string,expectedVersion:number,editable:EditableDraft,actor:string):Promise<Draft|null>;
 insertPreview(preview:PreviewRecord):Promise<void>; getPreview(id:string):Promise<PreviewRecord|null>; saveReview(id:string,review:ReviewReceipt):Promise<void>;
 publish(id:string,expectedVersion:number,previewId:string,actor:string):Promise<Revision>;
 revisions(id:string):Promise<Revision[]>; rollback(id:string,expectedVersion:number,revision:number,actor:string):Promise<{draft:Draft;revision:Revision}>;
 published():Promise<AuthoringCue[]>;
}

const object=(value:unknown,label='input')=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new AuthoringError('invalid_input',`${label} must be an object`);return value as Record<string,unknown>};
const keys=(value:Record<string,unknown>,allowed:string[],label='input')=>{const extra=Object.keys(value).filter(k=>!allowed.includes(k));if(extra.length)throw new AuthoringError('invalid_input',`${label} contains unsupported fields: ${extra.join(', ')}`)};
const string=(value:unknown,label:string,max=160)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new AuthoringError('invalid_input',`${label} must be 1-${max} characters`);return value.trim()};
const integer=(value:unknown,label:string,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new AuthoringError('invalid_input',`${label} must be an integer`);return value as number};

export function createAuthoringService(repo:AuthoringRepository){
 const operation=async(operation:string,input:unknown,actor:string):Promise<unknown>=>{
  const who=string(actor,'actor',80); const data=object(input);
  if(operation==='search_sources'){
   keys(data,['query','limit']); const query=string(data.query,'query',100).toLocaleLowerCase(); const limit=data.limit===undefined?20:integer(data.limit,'limit',1,50);
   return {authority:sourcePack.authority,sources:sourcePack.sources.filter(s=>s.blocks.length&&(s.name.toLocaleLowerCase().includes(query)||s.id.toLocaleLowerCase().includes(query)||String(s.section??'').toLocaleLowerCase().includes(query))).slice(0,limit).map(({blocks,...s})=>({...s,blockCount:blocks.length,kinds:[...new Set(blocks.map(b=>b.kind))]}))};
  }
  if(operation==='get_source'){keys(data,['sourceId']);const id=string(data.sourceId,'sourceId');const source=sourcePack.sources.find(s=>s.id===id);if(!source)throw new AuthoringError('unknown_source','Unknown authoring source',404);return {authority:sourcePack.authority,source};}
  if(operation==='list_templates'){keys(data,[]);return {templates:baselineCues.filter(cue=>!cue.hidden).map(cue=>{let importable=true;try{editableFromBaseline(cue.id)}catch{importable=false}return {id:cue.id,name:cue.name,layout:cue.layout,importable}})};}
  if(operation==='list_drafts'){keys(data,[]);return {drafts:await repo.listDrafts()};}
  if(operation==='get_draft'){keys(data,['draftId']);const draft=await requiredDraft(repo,string(data.draftId,'draftId'));return {draft};}
  if(operation==='create_draft'){
   const editable=parseEditable(data) as EditableDraft; const now=Date.now(); const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   return {draft:await repo.insertDraft(draft)};
  }
  if(operation==='import_cue'){
   keys(data,['cueId']);const cueId=string(data.cueId,'cueId',80);const existing=await repo.getDraft(cueId);if(existing)return {draft:existing,created:false};
   const editable=editableFromBaseline(cueId);const now=Date.now();const draft:Draft={...editable,id:cueId,version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   const baseline=baselineCues.find(cue=>cue.id===cueId)!;
   try{return {draft:await repo.insertImportedDraft(draft,structuredClone(baseline),who),created:true}}catch(error){const raced=await repo.getDraft(cueId);if(raced)return {draft:raced,created:false};throw error}
  }
  if(operation==='update_draft'){
   keys(data,['draftId','expectedVersion','patch']);const id=string(data.draftId,'draftId');const expected=integer(data.expectedVersion,'expectedVersion',1);const current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();assertSourcePin(current);
   const patch=parseEditable(data.patch,true);const merged=parseEditable({...editableOnly(current),...patch}) as EditableDraft;
   const updated=await repo.updateDraft(id,expected,merged,who);if(!updated)throw conflict();return {draft:updated};
  }
  if(operation==='preview_draft'){
   keys(data,['draftId','expectedVersion']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const cue=buildCue(draft);const validation=previewValidation(cue);const preview:PreviewRecord={id:randomUUID(),draftId:draft.id,draftVersion:draft.version,cueHash:cueHash(cue),cue,validation,review:null,createdAt:Date.now(),createdBy:who};await repo.insertPreview(preview);
   return {previewId:preview.id,draftVersion:draft.version,cue,cueHash:preview.cueHash,validation,previewPath:`/author?draft=${encodeURIComponent(draft.id)}`,fitContract:{viewport:{width:1920,height:1080},fontsReadyRequired:true,noOverflowRequired:true,browserReported:true,humanReviewRequired:true}};
  }
  if(operation==='review_draft'){
   keys(data,['draftId','expectedVersion','previewId','browserMeasurement','humanApproved']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const preview=await requiredPreview(repo,string(data.previewId,'previewId'));if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);if(data.humanApproved!==true)throw new AuthoringError('review_required','Human approval is required',400);
   const m=object(data.browserMeasurement,'browserMeasurement');keys(m,['viewportWidth','viewportHeight','fontsReady','overflow','rendererVersion','measuredAt'],'browserMeasurement');if(m.viewportWidth!==1920||m.viewportHeight!==1080||m.fontsReady!==true||m.overflow!==false)throw new AuthoringError('fit_failed','Preview must be measured at 1920x1080 with loaded fonts and no overflow',409);const measurement:BrowserMeasurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:string(m.rendererVersion,'rendererVersion',80),measuredAt:integer(m.measuredAt,'measuredAt',1)};const review:ReviewReceipt={humanApproved:true,browserMeasurement:measurement,reviewedAt:Date.now(),reviewedBy:who};await repo.saveReview(preview.id,review);return {draftId:draft.id,draftVersion:draft.version,previewId:preview.id,cueHash:preview.cueHash,review};
  }
  if(operation==='publish_draft'){
   keys(data,['draftId','expectedVersion','previewId']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const revision=await repo.publish(draft.id,draft.version,string(data.previewId,'previewId'),who);return {revision,cue:revision.cue};
  }
  if(operation==='list_revisions'){keys(data,['draftId']);const id=string(data.draftId,'draftId');await requiredDraft(repo,id);return {revisions:await repo.revisions(id)};}
  if(operation==='rollback_draft'){keys(data,['draftId','expectedVersion','revision']);const id=string(data.draftId,'draftId');const revision=integer(data.revision,'revision',1);const selected=(await repo.revisions(id)).find(row=>row.revision===revision);if(!selected)throw new AuthoringError('unknown_revision','Unknown revision',404);assertRevisionAuthority(selected.cue);const result=await repo.rollback(id,integer(data.expectedVersion,'expectedVersion',1),revision,who);return result;}
  throw new AuthoringError('unknown_operation',`Unknown authoring operation: ${operation}`,404);
 };
 return {operation,publishedCues:()=>repo.published()};
}

function editableOnly(draft:Draft):EditableDraft{return {name:draft.name,title:draft.title,accentTitle:draft.accentTitle,layout:draft.layout,templateCueId:draft.templateCueId,content:draft.content,presentation:draft.presentation}}
const conflict=()=>new AuthoringError('version_conflict','Draft version changed; reload before editing',409);
async function requiredDraft(repo:AuthoringRepository,id:string){const draft=await repo.getDraft(id);if(!draft)throw new AuthoringError('unknown_draft','Unknown draft',404);return draft}
async function versionedDraft(repo:AuthoringRepository,id:string,version:number){const draft=await requiredDraft(repo,id);if(draft.version!==version)throw conflict();return draft}
async function requiredPreview(repo:AuthoringRepository,id:string){const preview=await repo.getPreview(id);if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);return preview}

export class MemoryAuthoringRepository implements AuthoringRepository{
 drafts=new Map<string,Draft>(); previews=new Map<string,PreviewRecord>(); revisionRows=new Map<string,Revision[]>();
 async listDrafts(){return [...this.drafts.values()].map(clone).sort((a,b)=>b.updatedAt-a.updatedAt)} async getDraft(id:string){const d=this.drafts.get(id);return d?clone(d):null}
 async insertDraft(d:Draft){if(this.drafts.has(d.id))throw new AuthoringError('draft_exists','Draft already exists',409);this.drafts.set(d.id,clone(d));return clone(d)}
 async insertImportedDraft(d:Draft,cue:AuthoringCue,actor:string){if(this.drafts.has(d.id))throw new AuthoringError('draft_exists','Draft already exists',409);const row:Revision={draftId:d.id,revision:1,draftVersion:1,cueHash:cueHash(cue),cue:clone(cue),previewId:null,review:null,actor,createdAt:Date.now()};d.activeRevision=1;d.activeDraftVersion=1;this.drafts.set(d.id,clone(d));this.revisionRows.set(d.id,[row]);return clone(d)}
 async updateDraft(id:string,v:number,e:EditableDraft,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)return null;const next={...d,...clone(e),version:v+1,sourcePin:sourcePinFor(e.content),updatedAt:Date.now(),updatedBy:actor};this.drafts.set(id,next);return clone(next)}
 async insertPreview(p:PreviewRecord){this.previews.set(p.id,clone(p))} async getPreview(id:string){const p=this.previews.get(id);return p?clone(p):null} async saveReview(id:string,r:ReviewReceipt){const p=this.previews.get(id);if(!p)throw new AuthoringError('unknown_preview','Unknown preview',404);p.review=clone(r)}
 async publish(id:string,v:number,previewId:string,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const p=this.previews.get(previewId);validatePublishPreview(d,p);const rows=this.revisionRows.get(id)??[];let row=rows.find(r=>r.draftVersion===v&&r.cueHash===p!.cueHash);if(!row){row={draftId:id,revision:rows.length+1,draftVersion:v,cueHash:p!.cueHash,cue:clone(p!.cue),previewId,review:clone(p!.review!),actor,createdAt:Date.now()};rows.push(row);this.revisionRows.set(id,rows)}d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return clone(row)}
 async revisions(id:string){return clone(this.revisionRows.get(id)??[])}
 async rollback(id:string,v:number,revision:number,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const row=(this.revisionRows.get(id)??[]).find(r=>r.revision===revision);if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return {draft:clone(d),revision:clone(row)}}
 async published(){return [...this.drafts.values()].filter(d=>d.activeRevision!==null).map(d=>clone((this.revisionRows.get(d.id)??[]).find(r=>r.revision===d.activeRevision)!.cue))}
}

function validatePublishPreview(draft:Draft,preview?:PreviewRecord){if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);if(!preview.validation.valid)throw new AuthoringError('invalid_preview','Preview validation failed',409);if(!preview.review?.humanApproved||preview.review.browserMeasurement.overflow||!preview.review.browserMeasurement.fontsReady)throw new AuthoringError('review_required','Exact-version browser fit review is required',409)}
function assertRevisionAuthority(cue:AuthoringCue){const value=cue as AuthoringCue&{provenance?:{liturgy?:{feedSha256?:string}}};const feed=value.authoring?.feedSha256??value.provenance?.liturgy?.feedSha256;if(feed!==sourcePack.authority.feedSha256)throw new AuthoringError('source_pin_mismatch','Revision source authority no longer matches the pinned feed',409)}
const clone=<T>(value:T):T=>structuredClone(value);

export type SignatureSnapshot<T>={signature:string;value:T};
export function signatureCache<T>(signature:()=>Promise<string>,load:()=>Promise<SignatureSnapshot<T>>){
 let cached:{signature:string;value:T}|undefined;
 let pending:{signature:string;value:Promise<T>}|undefined;
 return async()=>{
  const current=await signature();
  if(cached?.signature===current)return cached.value;
  if(pending?.signature===current)return pending.value;
  const value=load().then(snapshot=>{cached=snapshot;return snapshot.value});
  pending={signature:current,value};
  try{return await value}finally{if(pending?.value===value)pending=undefined}
 };
}

export const PUBLISHED_SIGNATURE_SQL=`SELECT COALESCE(md5(string_agg(id || ':' || active_revision::text, ',' ORDER BY id)),md5('')) AS signature
FROM authoring_drafts
WHERE active_revision IS NOT NULL`;
export const PUBLISHED_CUES_SQL=`WITH active AS MATERIALIZED (
 SELECT id,active_revision,updated_at FROM authoring_drafts WHERE active_revision IS NOT NULL
)
SELECT COALESCE(json_agg(r.cue ORDER BY active.updated_at DESC),'[]'::json) AS cues,
 COALESCE(md5(string_agg(active.id || ':' || active.active_revision::text, ',' ORDER BY active.id)),md5('')) AS signature
FROM active
JOIN authoring_revisions r ON r.draft_id=active.id AND r.revision=active.active_revision`;

class PgAuthoringRepository implements AuthoringRepository{
 private async db(){return (await import('./database')).db}
 private readonly publishedCache=signatureCache(
  async()=>String((await (await this.db()).query(PUBLISHED_SIGNATURE_SQL)).rows[0]?.signature??''),
  async()=>{const row=(await (await this.db()).query(PUBLISHED_CUES_SQL)).rows[0] as {signature:string;cues:AuthoringCue[]};return {signature:String(row.signature),value:row.cues}},
 );
 async listDrafts(){return (await (await this.db()).query('SELECT document FROM authoring_drafts ORDER BY updated_at DESC')).rows.map((r:{document:Draft})=>r.document)}
 async getDraft(id:string){return (await (await this.db()).query('SELECT document FROM authoring_drafts WHERE id=$1',[id])).rows[0]?.document??null}
 async insertDraft(d:Draft){await (await this.db()).query('INSERT INTO authoring_drafts(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$4,$5,$5)',[d.id,d,d.version,d.createdAt,d.createdBy]);return d}
 async insertImportedDraft(d:Draft,cue:AuthoringCue,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');d.activeRevision=1;d.activeDraftVersion=1;await client.query('INSERT INTO authoring_drafts(id,document,version,active_revision,active_draft_version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,1,1,$3,$3,$4,$4)',[d.id,d,d.createdAt,actor]);await client.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at) VALUES($1,1,1,$2,$3,NULL,NULL,$4,$5)',[d.id,cueHash(cue),cue,actor,Date.now()]);await client.query('COMMIT');return d}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async updateDraft(id:string,v:number,e:EditableDraft,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const locked=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const current=locked.rows[0]?.document as Draft|undefined;if(!current){await client.query('ROLLBACK');return null}const next:Draft={...current,...e,version:v+1,sourcePin:sourcePinFor(e.content),updatedAt:Date.now(),updatedBy:actor};await client.query('UPDATE authoring_drafts SET document=$2,version=$3,updated_at=$4,updated_by=$5 WHERE id=$1',[id,next,next.version,next.updatedAt,actor]);await client.query('COMMIT');return next}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async insertPreview(p:PreviewRecord){await (await this.db()).query('INSERT INTO authoring_previews(id,draft_id,draft_version,cue_hash,cue,validation,review,created_at,created_by) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8)',[p.id,p.draftId,p.draftVersion,p.cueHash,p.cue,p.validation,p.createdAt,p.createdBy])}
 async getPreview(id:string){const r=(await (await this.db()).query('SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",cue_hash AS "cueHash",cue,validation,review,created_at AS "createdAt",created_by AS "createdBy" FROM authoring_previews WHERE id=$1',[id])).rows[0];return r??null}
 async saveReview(id:string,r:ReviewReceipt){await (await this.db()).query('UPDATE authoring_previews SET review=$2 WHERE id=$1',[id,r])}
 async publish(id:string,v:number,previewId:string,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const dr=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const d=dr.rows[0]?.document as Draft|undefined;if(!d)throw conflict();const pr=await client.query('SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",cue_hash AS "cueHash",cue,validation,review,created_at AS "createdAt",created_by AS "createdBy" FROM authoring_previews WHERE id=$1',[previewId]);const p=pr.rows[0] as PreviewRecord|undefined;validatePublishPreview(d,p);let rr=await client.query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt" FROM authoring_revisions WHERE draft_id=$1 AND draft_version=$2 AND cue_hash=$3',[id,v,p!.cueHash]);if(!rr.rows[0])rr=await client.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at) SELECT $1,COALESCE(MAX(revision),0)+1,$2,$3,$4,$5,$6,$7,$8 FROM authoring_revisions WHERE draft_id=$1 RETURNING draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt"',[id,v,p!.cueHash,p!.cue,previewId,p!.review,actor,Date.now()]);const row=rr.rows[0] as Revision;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;await client.query('UPDATE authoring_drafts SET document=$2,active_revision=$3,active_draft_version=$4,updated_at=$5,updated_by=$6 WHERE id=$1',[id,d,row.revision,row.draftVersion,d.updatedAt,actor]);await client.query('COMMIT');return row}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async revisions(id:string){return (await (await this.db()).query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt" FROM authoring_revisions WHERE draft_id=$1 ORDER BY revision DESC',[id])).rows}
 async rollback(id:string,v:number,revision:number,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const dr=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const d=dr.rows[0]?.document as Draft|undefined;if(!d)throw conflict();const rr=await client.query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt" FROM authoring_revisions WHERE draft_id=$1 AND revision=$2',[id,revision]);const row=rr.rows[0] as Revision|undefined;if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;await client.query('UPDATE authoring_drafts SET document=$2,version=$3,active_revision=$4,active_draft_version=$5,updated_at=$6,updated_by=$7 WHERE id=$1',[id,d,d.version,row.revision,row.draftVersion,d.updatedAt,actor]);await client.query('COMMIT');return {draft:d,revision:row}}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async published(){return this.publishedCache()}
}

let defaultService:ReturnType<typeof createAuthoringService>|undefined;
const defaults=()=>defaultService??=createAuthoringService(new PgAuthoringRepository());
export async function authoringOperation(operation:string,input:unknown,actor:string){
 const result=await defaults().operation(operation,input,actor);
 if(['publish_draft','rollback_draft','import_cue'].includes(operation)){
  const {relayConfigured}=await import('./relay');
  if(relayConfigured()){
   try{const {syncLiveCatalog}=await import('./sync-live-catalog');await syncLiveCatalog()}
   catch{return {...(result as Record<string,unknown>),liveRefreshPending:true,warning:'Saved successfully, but the live library has not received this update. Use Sync live library in the editor after the connection recovers. Live playback continues using the last synchronized version.'}}
  }
 }
 return result;
}
export async function publishedCues():Promise<Cue[]>{return defaults().publishedCues()}
