'use client';

/**
 * This service — the one page where the words that change every week get typed.
 *
 * Everything here is a slot: a graphic whose identity never changes and whose words do.
 * Pick the service type, type the names and readings, press Save once. The graphics are
 * different immediately and the Stream Deck labels follow by themselves, because the module
 * reads each slot's text as a variable. Nobody relabels a button, and nobody re-authors a
 * graphic to change a name.
 *
 * A slot fills a graphic designed in the Library (Oct 16): the "Fills" picker chooses which one,
 * and Save writes only the slot's fields into it - the name plate's heading and names, a
 * reading's verses and Hebrew book - keeping its look. Those are fit-checked like Publish.
 *
 * It is designed for the booth laptop with a keyboard, which is where it is used.
 */

import {useCallback,useEffect,useMemo,useState} from 'react';
import WorkspaceHeader from '@/components/workspace-header';
import SignInCard from '@/components/sign-in-card';
import {fetchAccessUser} from '@/lib/access-client';
import type {AccessRole} from '@/lib/access';
import {DESIGNED_FIELD_MAX,SLOT_LINE_MAX,hebrewBookFor,isDesignedSlot,slotFieldsFromText,slotTextFromFields,slotTextProblems,type ServiceTypeDefinition,type SlotDefinition} from '@/lib/slots';
import './this-service.css';

type Candidate={id:string;name:string;layout:string;mode:string};
type Payload={serviceTypes:ServiceTypeDefinition[];slots:SlotDefinition[];values:Record<string,string>;minted:string[];versions?:Record<string,number>;graphics?:Record<string,{cueId:string;name:string|null}>;candidates?:Candidate[]};
type Fields=Record<string,string[]>;

const fieldsFrom=(slots:SlotDefinition[],values:Record<string,string>):Fields=>
 Object.fromEntries(slots.map(slot=>[slot.key,slotFieldsFromText(slot,values[slot.key]??'')]));
/** The Hebrew fields: a name plate's Hebrew name and a reading's Hebrew book. */
const hebrewField=(slot:SlotDefinition,index:number)=>(slot.kind==='nameplate'&&index===2)||(slot.kind==='verses'&&index===1);
/** A name plate slot writes plain custom text; a reading only sets titles, so any graphic can be one. */
const canFill=(slot:SlotDefinition,candidate:Candidate)=>slot.kind==='verses'||candidate.mode==='custom';

export default function ThisServicePage(){
 const [payload,setPayload]=useState<Payload|null>(null);
 const [fields,setFields]=useState<Fields>({});
 const [serviceType,setServiceType]=useState('');
 const [role,setRole]=useState<AccessRole|undefined>(undefined);
 const [busy,setBusy]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [refused,setRefused]=useState<string[]>([]);
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

 function setField(slot:SlotDefinition,index:number,value:string){
  setNotice('');
  setFields(current=>{
   const next=[...(current[slot.key]??[])];
   // A reading's Hebrew book follows its verses until somebody types their own.
   if(slot.kind==='verses'&&index===0){const before=hebrewBookFor(next[0]??'')??'';if(!next[1]||next[1]===before)next[1]=hebrewBookFor(value)??''}
   next[index]=value;
   return {...current,[slot.key]:next};
  });
 }

 async function choose(slot:SlotDefinition,cueId:string){
  setSaving(true);setError('');setNotice('');setRefused([]);
  try{
   const response=await fetch('/api/slots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bind:{key:slot.key,cueId}})});
   const data=await response.json() as {message?:string;error?:string};
   if(!response.ok)throw new Error(data.error||'That graphic could not be chosen.');
   setNotice(data.message??'Chosen.');
   await load();
  }catch(problem){setError(problem instanceof Error?problem.message:'That graphic could not be chosen.')}
  finally{setSaving(false)}
 }

 async function save(){
  if(!payload||problems.length)return;
  setSaving(true);setError('');setNotice('');setRefused([]);
  try{
   const values=Object.fromEntries(shown.filter(slot=>payload.minted.includes(slot.key)).map(slot=>[slot.key,slotTextFromFields(slot,fields[slot.key]??[])]));
   const expectedVersions=Object.fromEntries(Object.keys(values).flatMap(key=>payload.versions?.[key]?[[key,payload.versions[key]]]:[]));
   const response=await fetch('/api/slots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceType,values,...(Object.keys(expectedVersions).length?{expectedVersions}:{})})});
   const data=await response.json() as {published?:number;error?:string;warning?:string;refused?:{name:string;message:string}[]};
   if(!response.ok)throw new Error(data.error||'The save did not go through.');
   setNotice(data.warning??(data.published?`Saved. ${data.published} ${data.published===1?'graphic is':'graphics are'} on the new text.`:data.refused?.length?'Nothing else had changed.':'Saved. Nothing had changed.'));
   setRefused((data.refused??[]).map(item=>item.message));
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
     <input type="radio" name="service-type" value={type.id} checked={serviceType===type.id} onChange={()=>{setServiceType(type.id);setNotice('');setRefused([])}}/>
     {type.name}
    </label>)}
   </fieldset>

   {unminted.length>0&&<p className="slots-unminted" role="status">Not ready yet: {unminted.map(slot=>slot.name).join(', ')}. {unminted.length===1?'It has':'They have'} no published graphic to fill. Choose one under “Fills”.</p>}

   <div className="slots-grid">
    {shown.map(slot=>{
     const ready=payload.minted.includes(slot.key);
     const values=fields[slot.key]??[];
     const text=slotTextFromFields(slot,values);
     // A slot whose graphic is missing from the library has nothing chosen.
     const graphic=payload.graphics?.[slot.key]?.name?payload.graphics[slot.key]:undefined;
     const options=(payload.candidates??[]).filter(candidate=>canFill(slot,candidate));
     return <section className={ready?'slot':'slot unready'} key={slot.key}>
      <h2>{slot.name}</h2>
      <label className="slot-fills">
       <span>Fills</span>
       <select value={graphic?.cueId??''} disabled={saving} onChange={event=>{if(event.target.value)void choose(slot,event.target.value)}}>
        {!graphic&&<option value="">Choose a graphic…</option>}
        {graphic&&!options.some(option=>option.id===graphic.cueId)&&<option value={graphic.cueId}>{graphic.name}</option>}
        {options.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
       </select>
      </label>
      {slot.labels.map((label,index)=><label key={label+index}>
       <span>{label}</span>
       <input
        value={values[index]??''}
        placeholder={slot.placeholders[index]??''}
        dir={hebrewField(slot,index)?'rtl':undefined}
        lang={hebrewField(slot,index)?'he':undefined}
        maxLength={isDesignedSlot(slot)?DESIGNED_FIELD_MAX:SLOT_LINE_MAX*2}
        disabled={!ready||saving}
        onChange={event=>setField(slot,index,event.target.value)}
       />
      </label>)}
      {slotTextProblems(slot,text).map(problem=><b key={problem} className="slot-problem">{problem}</b>)}
      {ready&&!text&&<small className="slot-blank">{isDesignedSlot(slot)?'Blank — the graphic stays as it is.':'Blank — this graphic will show nothing.'}</small>}
     </section>;
    })}
   </div>

   <div className="slots-actions">
    <button disabled={saving||busy||problems.length>0||!shown.length} onClick={()=>void save()}>{saving?'Saving…':'Save'}</button>
    {notice&&<p className="slots-notice" role="status">{notice}</p>}
    {refused.length>0&&<ul className="slots-refused" role="alert">{refused.map(message=><li key={message}>{message}</li>)}</ul>}
    <p className="slots-note">Save publishes every slot of this service type that changed, and sends the library to the booth. Name plates and readings are checked to fit first, like Publish. The Stream Deck catches up within a few seconds.</p>
   </div>
  </>}
 </main>;
}
