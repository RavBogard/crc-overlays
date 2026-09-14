'use client';

/**
 * G1 (D19) fills the slot X5 reserved on Prepared services: import a planned service from
 * centralreform.live and get an ordinary prepared service back, with every row it could not
 * settle listed for review.
 *
 * The panel asks `list_live_setlists` once on mount and renders **nothing at all** unless the
 * answer is `available:true` — so TBI, where the credential is unset, and any member without
 * authoring permission (the operation is an `author` one, so the request answers 401) see no
 * heading, no control and no mention of centralreform.live. Importing never publishes and
 * never puts anything on screen.
 */

import {useEffect,useRef,useState} from 'react';
import {call,isUnauthorized,type Collection} from './services-data';

type LiveSetlist={id:string;name:string;date:string|null;eventDate:string|null;trackCount:number;publishedAt:string|null};
type Unmatched={trackId:string;title:string;kind:'liturgy'|'song'|'other';reason:string};
type ImportResult={collection:Collection;unmatched:Unmatched[]};

export type SetlistImportSlotProps={
 /** The open collection the import would add rows to, or undefined when none is open. */
 collection?:Collection;
 /** Refresh the dashboard after an import writes. */
 onImported:()=>void|Promise<unknown>;
};

/** "Friday, September 18" — the same shape the imported service is named after. */
function when(setlist:LiveSetlist){
 const iso=setlist.eventDate??setlist.date;
 if(!iso)return '';
 const stamp=Date.parse(iso);
 return Number.isNaN(stamp)?'':new Date(stamp).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
}

export default function SetlistImportSlot({collection,onImported}:SetlistImportSlotProps){
 void collection;
 const [available,setAvailable]=useState(false);
 const [setlists,setSetlists]=useState<LiveSetlist[]>([]);
 const [chosen,setChosen]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState<ImportResult|null>(null);
 const mounted=useRef(true);

 useEffect(()=>{
  mounted.current=true;
  call<{available:boolean;setlists?:LiveSetlist[]}>('list_live_setlists',{})
   .then(data=>{
    if(!mounted.current||!data.available)return;
    setAvailable(true);setSetlists(data.setlists??[]);setChosen(data.setlists?.[0]?.id??'');
   })
   // An unconfigured congregation, a signed-out member and an operator all reach the same
   // place: the panel simply is not there. Nothing is said about a service they cannot use.
   .catch(()=>{});
  return()=>{mounted.current=false};
 },[]);

 if(!available)return null;

 async function importSetlist(){
  if(!chosen)return;
  setBusy(true);setError('');setResult(null);
  try{
   const data=await call<ImportResult>('import_setlist',{setlistId:chosen});
   if(!mounted.current)return;
   setResult(data);
   await onImported();
  }catch(e){
   if(!mounted.current)return;
   setError(isUnauthorized(e)?'Sign in again to import a service.':e instanceof Error?e.message:'Import failed');
  }finally{if(mounted.current)setBusy(false)}
 }

 return <section className="setlist-import" aria-labelledby="setlist-import-heading">
  <h3 id="setlist-import-heading">Import from centralreform.live</h3>
  <p className="starter-note">Import a planned service from centralreform.live.</p>
  {setlists.length
   ?<>
     <label>Choose a service to import
      <select value={chosen} disabled={busy} onChange={event=>setChosen(event.target.value)}>
       {setlists.map(setlist=><option value={setlist.id} key={setlist.id}>{when(setlist)?`${setlist.name} · ${when(setlist)}`:setlist.name}</option>)}
      </select>
     </label>
     <div className="create-actions"><button type="button" disabled={busy||!chosen} onClick={importSetlist}>{busy?'Importing…':'Import'}</button></div>
    </>
   :<p className="starter-note">No planned services are waiting on centralreform.live.</p>}
  {error&&<p className="setlist-import-error">{error}</p>}
  {result&&<div className="setlist-import-result">
   <p><strong>{result.collection.name}</strong> is now in the list above with {result.collection.entries.length} items.</p>
   {result.unmatched.length
    ?<><h4>Rows to review · {result.unmatched.length}</h4>
       <ul>{result.unmatched.map(row=><li key={`${row.trackId}-${row.title}`}><strong>{row.title}</strong><span>{row.reason}</span></li>)}</ul></>
    :<p>Every row matched a published graphic.</p>}
  </div>}
 </section>;
}
