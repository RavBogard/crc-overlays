'use client';

import {useEffect,useRef,useState} from 'react';
import {call,callServiceAuthor,isUnauthorized,ServicesRequestError,type Collection,type Dashboard} from './services-data';
import {plannedSelection,preparedMatches,requestedSetlist} from './planned-service';

type LiveSetlist={id:string;name:string;date:string|null;eventDate:string|null;trackCount:number};
type Suggestion={setlistId:string;name:string;startsAt:string};
type Unmatched={trackId:string;title:string;kind:string;reason:string};
type ImportResult={collection:Collection;unmatched:Unmatched[]};
type Change={change:'added'|'updated'|'kept'|'missing'|'removed';rowId:string;label:string;from?:string;to?:string;why?:string};
type Refresh={serviceId:string;version:number;sourceRevision:string;dryRun:boolean;orderChanged:boolean;order:{rowId:string;label:string}[];summary:Record<string,number>;changes:Change[]};
export type SetlistImportSlotProps={collection?:Collection;collections:Collection[];onImported:(id?:string)=>void|Promise<unknown>;onOpen:(id:string)=>void};
function when(setlist:LiveSetlist){const iso=setlist.eventDate??setlist.date;if(!iso)return '';const stamp=Date.parse(iso);return Number.isNaN(stamp)?'':new Date(stamp).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'})}
const changeLabel:Record<Change['change'],string>={added:'Add',updated:'Update match',kept:'Keep operator choice',missing:'Missing from source · retained',removed:'Remove'};
const statusLabel:Record<string,string>={covered:'Covered','needs-review':'Needs review','needs-cue':'Needs a graphic','not-needed':'Not needed','intentional-fallback':'Intentional fallback'};

/** Only an authorized source listing reveals the integration or validates a portal link. */
export default function SetlistImportSlot({collection,collections,onImported,onOpen}:SetlistImportSlotProps){
 const [available,setAvailable]=useState(false),[setlists,setSetlists]=useState<LiveSetlist[]>([]),[chosen,setChosen]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[linkUnavailable,setLinkUnavailable]=useState(false);
 const [result,setResult]=useState<ImportResult|null>(null),[storedPreview,setPreview]=useState<Refresh|null>(null),[notice,setNotice]=useState('');
 const mounted=useRef(true),requested=useRef<string|null>(null),opened=useRef(false);
 const matches=preparedMatches(collections,chosen),target=matches.find(item=>item.id===collection?.id);
 const preview=storedPreview?.serviceId===target?.id&&storedPreview?.version===target?.version?storedPreview:null;
 const source=setlists.find(item=>item.id===chosen);
 useEffect(()=>{
  mounted.current=true;requested.current=requestedSetlist(window.location.search);
  call<{available:boolean;setlists?:LiveSetlist[];suggestion?:Suggestion|null}>('list_live_setlists',requested.current?{requestedSetlistId:requested.current}:{}).then(data=>{
   if(!mounted.current||!data.available)return;
   const list=data.setlists??[],selection=plannedSelection(requested.current,list,data.suggestion?.setlistId);
   setSetlists(list);setChosen(selection.chosen);setLinkUnavailable(selection.unavailable);setAvailable(true);
  }).catch(()=>{});
  return()=>{mounted.current=false};
 },[]);
 useEffect(()=>{
  if(!available||opened.current||requested.current===null||!chosen)return;
  const found=preparedMatches(collections,chosen);
  if(found.length===1){opened.current=true;onOpen(found[0].id)}
 },[available,chosen,collections,onOpen]);
 if(!available)return null;
 function open(id:string){opened.current=true;setError('');setPreview(null);onOpen(id)}
 async function importSetlist(){
  if(!source||matches.length)return;
  setBusy(true);setError('');setResult(null);setNotice('');
  try{
   const latest=await call<Dashboard>('get_dashboard',{includeArchived:true});
   if(preparedMatches(latest.collections,chosen).length){await onImported();setNotice('This source already has a prepared service. Open it below.');return}
   const data=await call<ImportResult>('import_setlist',{setlistId:chosen});
   if(!mounted.current)return;
   setResult(data);await onImported(data.collection.id);
  }catch(e){if(mounted.current)setError(isUnauthorized(e)?'Sign in again to prepare a service.':e instanceof Error?e.message:'Preparation failed')}
  finally{if(mounted.current)setBusy(false)}
 }
 async function refresh(apply:boolean){
  if(!target||apply&&!preview)return;
  setBusy(true);setError('');setNotice('');
  try{
   const data=await callServiceAuthor<Refresh>('refresh_from_setlist',{serviceId:target.id,expectedVersion:apply?preview!.version:target.version,dryRun:!apply,removeMissing:false,
    ...(apply?{expectedSourceRevision:preview!.sourceRevision}:{})});
   if(!mounted.current)return;
   if(apply){setPreview(null);setNotice('Prepared service refreshed. Operator choices and missing rows were retained.');await onImported(target.id)}else setPreview(data);
  }catch(e){
   if(!mounted.current)return;
   setPreview(null);
   if(e instanceof ServicesRequestError&&e.code==='version_conflict'){await onImported(target.id);setError('The prepared service changed after you read it. Preview changes again.');}
   else setError(e instanceof ServicesRequestError&&e.code==='source_conflict'?'The source changed after this preview. Preview changes again before refreshing.':isUnauthorized(e)?'Sign in again to refresh this service.':e instanceof Error?e.message:'Refresh failed');
  }finally{if(mounted.current)setBusy(false)}
 }
 return <section className="setlist-import" aria-labelledby="setlist-import-heading">
  <h3 id="setlist-import-heading">Planned service</h3>
  <p className="starter-note">Prepare from centralreform.live, or review changes to the service already prepared here.</p>
  {linkUnavailable&&<p role="status" className="setlist-import-error">The linked service is unavailable in this workspace. Choose a service explicitly to continue.</p>}
  {setlists.length?<label>Source service<select value={chosen} disabled={busy} onChange={event=>{opened.current=true;setChosen(event.target.value);setLinkUnavailable(false);setError('');setNotice('');setResult(null);setPreview(null)}}>
   {!chosen&&<option value="">Choose a service</option>}
   {setlists.map(item=><option key={item.id} value={item.id}>{item.name}{when(item)?` · ${when(item)}`:''}</option>)}
  </select></label>:<p className="starter-note">No planned services are available on centralreform.live.</p>}
  {source&&<>
   {matches.length>1&&<p className="starter-note">Several prepared services use this source. Choose the one to review.</p>}
   {matches.length>0&&<div className="planned-matches">{matches.map(item=><button type="button" key={item.id} disabled={busy} className={target?.id===item.id?'selected':''} onClick={()=>open(item.id)}>{item.id===target?.id?'Open: ':''}{item.name}{item.archived?' · archived':''}</button>)}</div>}
   {!matches.length&&<div className="create-actions"><button type="button" disabled={busy} onClick={importSetlist}>{busy?'Preparing…':'Prepare service'}</button></div>}
   {target&&<div className="create-actions"><button type="button" disabled={busy||target.archived} onClick={()=>refresh(false)}>{busy?'Working…':'Preview changes'}</button>{target.archived&&<p className="starter-note">Restore this prepared service before refreshing it.</p>}</div>}
  </>}
  {error&&<p role="alert" className="setlist-import-error">{error}</p>}
  {notice&&<p role="status" className="starter-note">{notice}</p>}
  {preview&&<div className="setlist-import-result planned-preview">
   <h4>Review source changes</h4>
   <p>Missing source rows stay for review. Existing operator choices are kept.</p>
   {preview.changes.length?<ul>{preview.changes.map((change,index)=><li key={`${change.rowId}-${index}`}><strong>{changeLabel[change.change]} · {change.label}</strong>{change.from&&change.to&&<span>{statusLabel[change.from]??change.from} → {statusLabel[change.to]??change.to}</span>}{change.change==='missing'?<span>No longer in the source service; it will stay for review.</span>:change.change==='kept'?<span>The existing operator decision will be kept.</span>:change.why&&<span>{change.why}</span>}</li>)}</ul>:<p>No graphic matches changed.</p>}
   {preview.orderChanged&&<details open><summary>Updated service order</summary><ol>{preview.order.map((row,index)=><li key={`${row.rowId}-${index}`}>{row.label}</li>)}</ol></details>}
   {(preview.changes.length>0||preview.orderChanged)&&<div className="create-actions"><button type="button" disabled={busy} onClick={()=>refresh(true)}>Refresh prepared service</button><button type="button" className="subtle" disabled={busy} onClick={()=>setPreview(null)}>Cancel preview</button></div>}
  </div>}
  {result&&<div className="setlist-import-result"><p><strong>{result.collection.name}</strong> is prepared with {result.collection.entries.length} items.</p>{result.unmatched.length>0&&<><h4>Rows to review · {result.unmatched.length}</h4><ul>{result.unmatched.map(row=><li key={`${row.trackId}-${row.title}`}><strong>{row.title}</strong><span>{row.reason}</span></li>)}</ul></>}</div>}
 </section>;
}
