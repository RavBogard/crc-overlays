'use client';

/**
 * This service — the one page where the words that change every week get typed.
 *
 * Everything here is a slot: a graphic whose identity never changes and whose text does.
 * Pick the service type, type the names, press Save once. The graphics are different
 * immediately and the Stream Deck labels follow by themselves, because the module reads
 * each slot's text as a variable. Nobody relabels a button, and nobody re-authors a graphic
 * to change a name.
 *
 * It is designed for the booth laptop with a keyboard, which is where it is used.
 */

import {useCallback,useEffect,useMemo,useState} from 'react';
import WorkspaceHeader from '@/components/workspace-header';
import SignInCard from '@/components/sign-in-card';
import {fetchAccessUser} from '@/lib/access-client';
import type {AccessRole} from '@/lib/access';
import {SLOT_LINE_MAX,slotFieldsFromText,slotTextFromFields,slotTextProblems,type ServiceTypeDefinition,type SlotDefinition} from '@/lib/slots';
import './this-service.css';

type Payload={serviceTypes:ServiceTypeDefinition[];slots:SlotDefinition[];values:Record<string,string>;minted:string[]};
type Fields=Record<string,string[]>;

const fieldsFrom=(slots:SlotDefinition[],values:Record<string,string>):Fields=>
 Object.fromEntries(slots.map(slot=>[slot.key,slotFieldsFromText(slot,values[slot.key]??'')]));

export default function ThisServicePage(){
 const [payload,setPayload]=useState<Payload|null>(null);
 const [fields,setFields]=useState<Fields>({});
 const [serviceType,setServiceType]=useState('');
 const [role,setRole]=useState<AccessRole|undefined>(undefined);
 const [busy,setBusy]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [needsSignIn,setNeedsSignIn]=useState(false);

 // A 401 is a sign-in problem, not a failure: it gets the shared card and no red banner.
 const read=useCallback(async()=>{
  const response=await fetch('/api/slots',{credentials:'include',cache:'no-store'});
  if(response.status===401)return null;
  if(!response.ok)throw new Error('The slot list is unavailable right now.');
  return await response.json() as Payload;
 },[]);

 const accept=useCallback((data:Payload|null)=>{
  setNeedsSignIn(data===null);
  if(!data)return;
  setPayload(data);
  setFields(fieldsFrom(data.slots,data.values));
  setServiceType(current=>current||(data.serviceTypes[0]?.id??''));
 },[]);

 const load=useCallback(async()=>{
  setBusy(true);setError('');
  try{accept(await read())}
  catch(problem){setError(problem instanceof Error?problem.message:'The slot list is unavailable right now.')}
  finally{setBusy(false)}
 },[accept,read]);

 // The first read happens in the effect itself rather than through `load`, so nothing sets
 // state synchronously while the component is still rendering; `load` is for refreshes.
 useEffect(()=>{
  let current=true;
  read()
   .then(data=>{if(current){accept(data);setError('')}})
   .catch(problem=>{if(current)setError(problem instanceof Error?problem.message:'The slot list is unavailable right now.')})
   .finally(()=>{if(current)setBusy(false)});
  void fetchAccessUser().then(user=>{if(current&&user)setRole(user.role)});
  return()=>{current=false};
 },[accept,read]);

 const shown=useMemo(()=>{
  const type=payload?.serviceTypes.find(item=>item.id===serviceType);
  if(!payload||!type)return [] as SlotDefinition[];
  return type.slotKeys.map(key=>payload.slots.find(slot=>slot.key===key)!).filter(Boolean);
 },[payload,serviceType]);

 // The cheap guard that stands in for a per-edit review: it says which line is too long and
 // by how much, while the person is still typing, rather than refusing on Save.
 const problems=useMemo(()=>shown.flatMap(slot=>slotTextProblems(slot,slotTextFromFields(slot,fields[slot.key]??[]))),[shown,fields]);
 const unminted=useMemo(()=>shown.filter(slot=>!payload?.minted.includes(slot.key)),[shown,payload]);

 function setField(key:string,index:number,value:string){
  setNotice('');
  setFields(current=>{
   const next=[...(current[key]??[])];
   next[index]=value;
   return {...current,[key]:next};
  });
 }

 async function save(){
  if(!payload||problems.length)return;
  setSaving(true);setError('');setNotice('');
  try{
   const values=Object.fromEntries(shown.filter(slot=>payload.minted.includes(slot.key)).map(slot=>[slot.key,slotTextFromFields(slot,fields[slot.key]??[])]));
   const response=await fetch('/api/slots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceType,values})});
   const data=await response.json() as {published?:number;error?:string;warning?:string};
   if(!response.ok)throw new Error(data.error||'The save did not go through.');
   setNotice(data.warning??(data.published?`Saved. ${data.published} ${data.published===1?'graphic is':'graphics are'} on the new text.`:'Saved. Nothing had changed.'));
   await load();
  }catch(problem){setError(problem instanceof Error?problem.message:'The save did not go through.')}
  finally{setSaving(false)}
 }

 return <main className="slots-shell">
  <WorkspaceHeader current="/this-service" title="This service" role={role} lede="The names and readings for this week. Type them once; the buttons never change."/>
  {error&&<div className="slots-error" role="alert">{error}</div>}
  {needsSignIn?<SignInCard description="This service holds the names and readings for the week ahead. Sign in to fill them in." onRetry={()=>{setNeedsSignIn(false);void load()}}/>
  :!payload?<p className="slots-loading">{busy?'Loading…':'Unable to load.'}</p>
  :<>
   <fieldset className="slots-types">
    <legend>Service type</legend>
    {payload.serviceTypes.map(type=><label key={type.id}>
     <input type="radio" name="service-type" value={type.id} checked={serviceType===type.id} onChange={()=>{setServiceType(type.id);setNotice('')}}/>
     {type.name}
    </label>)}
   </fieldset>

   {unminted.length>0&&<p className="slots-unminted" role="status">Not ready yet: {unminted.map(slot=>slot.name).join(', ')}. {unminted.length===1?'Its graphic has':'Their graphics have'} not been published, so {unminted.length===1?'it':'they'} cannot be filled in here.</p>}

   <div className="slots-grid">
    {shown.map(slot=>{
     const ready=payload.minted.includes(slot.key);
     const values=fields[slot.key]??[];
     const text=slotTextFromFields(slot,values);
     return <section className={ready?'slot':'slot unready'} key={slot.key}>
      <h2>{slot.name}</h2>
      {slot.labels.map((label,index)=><label key={label+index}>
       <span>{label}</span>
       <input
        value={values[index]??''}
        placeholder={slot.placeholders[index]??''}
        maxLength={SLOT_LINE_MAX*2}
        disabled={!ready||saving}
        onChange={event=>setField(slot.key,index,event.target.value)}
       />
      </label>)}
      {slotTextProblems(slot,text).map(problem=><b key={problem} className="slot-problem">{problem}</b>)}
      {ready&&!text&&<small className="slot-blank">Blank — this graphic will show nothing.</small>}
     </section>;
    })}
   </div>

   <div className="slots-actions">
    <button disabled={saving||busy||problems.length>0||!shown.length} onClick={()=>void save()}>{saving?'Saving…':'Save'}</button>
    {notice&&<p className="slots-notice" role="status">{notice}</p>}
    <p className="slots-note">Save publishes every slot of this service type that changed, and sends the library to the booth. The Stream Deck catches up within a few seconds.</p>
   </div>
  </>}
 </main>;
}
