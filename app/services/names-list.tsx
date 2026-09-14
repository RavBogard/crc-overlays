'use client';

/**
 * D12 - the names editor. An Editor types names for Mi Shebeirach or a yahrzeit list into
 * this per-service field; saving materializes them into the live library as ordinary paged
 * panel graphics, and removing them takes the panels out again. Nothing here publishes.
 *
 * The verdict on whether a generated panel fits is the same one the editor dock and
 * /author/fit-check use: each panel is rendered by the real `Player` into a hidden
 * measurement stage and read with `findFitErrors` / `findFitWarnings` (R7 - one function,
 * one 6 px tolerance, no second opinion).
 *
 * Phase E (X5) splits /services into Prepared services and Service log; this panel is its
 * own component file so that split is an import move.
 */

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Player,type Cue} from '@/lib/player';
import {overlayBrandingFromWorkspace,type OverlayBranding} from '@/lib/branding';
import {overlayAssetUrl} from '@/lib/overlay-assets';
import {layoutLabel} from '@/lib/layout-label';
import {NAMES_NAME_MAX,NAMES_PER_PANEL_MAX,NAMES_PER_PANEL_MIN,NAMES_ROW_MAX,NAMES_TITLE_MAX,namesPanelShapes,panelName,type NameRow,type NamesList} from '@/lib/names-list';
import type {PublicWorkspace} from '@/lib/workspace';
import {findFitErrors,findFitWarnings,waitForPreviewAssets} from '../author/preview';
import './names-list.css';

export type NamesListCollection={id:string;name:string;version:number;archived:boolean;names?:NamesList|null};

type Props={collection:NamesListCollection;canEdit:boolean;onSaved:()=>void|Promise<unknown>};
type PanelVerdict={fitErrors:string[];warnings:string[]};

const emptyRow=():NameRow=>({he:'',en:''});
const rowsFrom=(names:NamesList|null|undefined):NameRow[]=>names?.rows.length?names.rows.map(row=>({...row})):[emptyRow()];

async function call(operation:string,input:unknown){
 const response=await fetch('/api/services',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,input})});
 const raw=await response.text();
 let data:Record<string,unknown>={};
 try{data=JSON.parse(raw)}catch{}
 if(!response.ok)throw new Error(typeof data.error==='string'?data.error:`Request failed (${response.status})`);
 return data;
}

/** One render of one generated panel into the shared stage, measured and torn down. */
async function measurePanel(root:HTMLElement,branding:OverlayBranding,cue:Cue):Promise<PanelVerdict>{
 const player=new Player(root,[cue],branding,{resolveAssetUrl:next=>overlayAssetUrl(next,'preview')});
 try{
  player.render(cue,overlayAssetUrl(cue,'preview'));
  await waitForPreviewAssets(root);
  const box=root.firstElementChild;
  if(box instanceof HTMLElement)player.applyFit(box,cue);
  return {fitErrors:findFitErrors(root),warnings:findFitWarnings(root)};
 }catch{
  return {fitErrors:['Fonts or artwork did not load in time.'],warnings:[]};
 }finally{
  player.dispose();
 }
}

export default function NamesListPanel({collection,canEdit,onSaved}:Props){
 // The form is seeded once per service: the caller keys this component by collection id, so
 // opening a different service remounts it and a dashboard refresh never eats live typing.
 const saved=collection.names??null;
 const [title,setTitle]=useState(saved?.title??'');
 const [perPanel,setPerPanel]=useState(saved?.perPanel??8);
 const [layout,setLayout]=useState<'left'|'right'>(saved?.layout??'left');
 const [rows,setRows]=useState<NameRow[]>(()=>rowsFrom(saved));
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [branding,setBranding]=useState<OverlayBranding|null>(null);
 const [verdicts,setVerdicts]=useState<PanelVerdict[]|null>(null);
 const [measuring,setMeasuring]=useState(false);
 const stageRef=useRef<HTMLDivElement|null>(null);

 useEffect(()=>{
  let current=true;
  fetch('/api/workspace',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(value=>{
   if(!current||!value)return;
   try{setBranding(overlayBrandingFromWorkspace(value as PublicWorkspace))}catch{}
  }).catch(()=>{});
  return()=>{current=false};
 },[]);

 const filled=useMemo(()=>rows.map(row=>({he:row.he.trim(),en:row.en.trim()})).filter(row=>row.he||row.en),[rows]);
 const overLong=useMemo(()=>filled.some(row=>row.he.length>NAMES_NAME_MAX||row.en.length>NAMES_NAME_MAX),[filled]);
 const sized=Number.isInteger(perPanel)&&perPanel>=NAMES_PER_PANEL_MIN&&perPanel<=NAMES_PER_PANEL_MAX;
 const ready=Boolean(title.trim())&&filled.length>0&&filled.length<=NAMES_ROW_MAX&&!overLong&&sized;
 const shapes=useMemo(()=>ready?namesPanelShapes(collection.id,{title:title.trim(),perPanel,layout,rows:filled,updatedAt:0,updatedBy:''}):[],[ready,collection.id,title,perPanel,layout,filled]);
 const signature=useMemo(()=>JSON.stringify(shapes),[shapes]);

 useEffect(()=>{
  const root=stageRef.current;
  if(!root||!branding||!shapes.length){setVerdicts(null);return}
  let cancelled=false;
  setMeasuring(true);
  (async()=>{
   const results:PanelVerdict[]=[];
   for(const shape of shapes){
    if(cancelled)return;
    results.push(await measurePanel(root,branding,{...shape,animations:[],duration:{}} as Cue));
   }
   if(!cancelled){setVerdicts(results);setMeasuring(false)}
  })().catch(()=>{if(!cancelled){setVerdicts(null);setMeasuring(false)}});
  return()=>{cancelled=true};
  // `signature` is the value identity of `shapes`; re-measuring on the array identity alone
  // would restart the pass on every keystroke that changes nothing the renderer sees.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[signature,branding]);

 const failing=verdicts?verdicts.findIndex(verdict=>verdict.fitErrors.length):-1;
 const tooFull=failing>=0?`Panel ${failing+1} of ${shapes.length} is too full. Shorten a name or lower Names per panel.`:'';
 const warnings=verdicts?[...new Set(verdicts.flatMap(verdict=>verdict.warnings))]:[];
 const canSave=canEdit&&!collection.archived&&ready&&!busy&&!measuring&&failing<0;

 const update=useCallback((index:number,patch:Partial<NameRow>)=>{setRows(current=>current.map((row,position)=>position===index?{...row,...patch}:row))},[]);

 async function save(){
  setBusy(true);setError('');setNotice('');
  try{
   await call('set_names',{id:collection.id,expectedVersion:collection.version,names:{title:title.trim(),perPanel,layout,rows:filled}});
   setNotice(`These names are now in the library as ${panelName(title.trim(),0,shapes.length)}. Show them from Live control or from Companion.`);
   await onSaved();
  }catch(value){setError(value instanceof Error?value.message:'Request failed')}
  finally{setBusy(false)}
 }

 async function clear(){
  setBusy(true);setError('');setNotice('');
  try{
   await call('clear_names',{id:collection.id,expectedVersion:collection.version});
   setRows([emptyRow()]);setTitle('');
   await onSaved();
  }catch(value){setError(value instanceof Error?value.message:'Request failed')}
  finally{setBusy(false)}
 }

 return <section className="names-panel" aria-labelledby="names-panel-heading">
  <div className="section-heading"><div><p className="services-eyebrow">THIS SERVICE ONLY</p><h3 id="names-panel-heading">Names for this service</h3><p>Type one name per row. These names are not saved to the library and are removed when this service is archived.</p></div></div>
  {error&&<div className="names-error" role="alert">{error}</div>}
  {notice&&<p className="names-notice" role="status">{notice}</p>}
  <div className="names-settings">
   <label>Name this list (for example, Mi Shebeirach)<input value={title} maxLength={NAMES_TITLE_MAX} disabled={!canEdit||collection.archived} onChange={event=>setTitle(event.target.value)}/></label>
   <label>Names per panel<input type="number" min={NAMES_PER_PANEL_MIN} max={NAMES_PER_PANEL_MAX} value={perPanel} disabled={!canEdit||collection.archived} onChange={event=>setPerPanel(Number(event.target.value))}/></label>
   <label>Where it appears<select value={layout} disabled={!canEdit||collection.archived} onChange={event=>setLayout(event.target.value==='right'?'right':'left')}><option value="left">{layoutLabel('left')}</option><option value="right">{layoutLabel('right')}</option></select></label>
  </div>
  <ol className="names-rows">{rows.map((row,index)=><li key={index}>
   <label>Hebrew name<input dir="rtl" lang="he" value={row.he} maxLength={NAMES_NAME_MAX} disabled={!canEdit||collection.archived} onChange={event=>update(index,{he:event.target.value})}/></label>
   <label>English name<input value={row.en} maxLength={NAMES_NAME_MAX} disabled={!canEdit||collection.archived} onChange={event=>update(index,{en:event.target.value})}/></label>
   <button type="button" className="subtle" aria-label={`Remove row ${index+1}`} disabled={!canEdit||collection.archived||rows.length<2} onClick={()=>setRows(current=>current.filter((_,position)=>position!==index))}>Remove row</button>
  </li>)}</ol>
  {canEdit&&!collection.archived&&<button type="button" className="subtle" disabled={rows.length>=NAMES_ROW_MAX} onClick={()=>setRows(current=>[...current,emptyRow()])}>Add a name</button>}
  {shapes.length>0&&<p className="names-preview">{shapes.length===1?'1 panel':`${shapes.length} panels`}: {shapes.map(shape=>shape.name).join(' · ')}</p>}
  {tooFull&&<p className="names-too-full" role="alert">{tooFull}</p>}
  {warnings.map(warning=><p className="names-warning" key={warning}>{warning}</p>)}
  {canEdit&&<div className="names-actions">
   <button type="button" disabled={!canSave} onClick={save}>Put these names in the library</button>
   <button type="button" className="subtle" disabled={busy||!saved||collection.archived} onClick={clear}>Remove these names</button>
  </div>}
  <div className="names-stage" aria-hidden="true"><div ref={stageRef} className="names-stage-output"/></div>
 </section>;
}
