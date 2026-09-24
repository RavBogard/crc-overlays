"use client";

import {useEffect,useRef,useState} from 'react';
import styles from './import.module.css';

type Phase={state:'idle'}|{state:'sending';percent:number;fileName:string}|{state:'received';fileName:string}|{state:'refused';message:string};
const ACCEPT:Record<string,string>={'singular-extract':'.json,application/json','local-sources':'.json,application/json','asset':'image/png,image/jpeg,image/webp','deck-plan':'.csv,.json,text/csv,application/json'};
const megabytes=(bytes:number)=>`${Math.round(bytes/1024/1024)} MB`;

async function post(url:string,body:BodyInit,type:string){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':type},body,cache:'no-store',referrerPolicy:'no-referrer'});
 const data=await response.json().catch(()=>({})) as {error?:string;status?:string;refusal?:string|null;chunkBytes?:number};
 if(!response.ok)throw new Error(data.error||'The upload stopped. Drop the file again.');
 return data;
}

/** The drop area: one file, sent in parts of at most 1 MB, then checked on the server. */
export default function DropzoneClient({token,kind,label,maxBytes,linkExpiresAt,note,arrived}:{token:string;kind:string;label:string;maxBytes:number;linkExpiresAt:number;note:string|null;arrived:string|null}){
 const [phase,setPhase]=useState<Phase>({state:'idle'});
 const [over,setOver]=useState(false);
 const [now,setNow]=useState<number|null>(null);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{const tick=()=>setNow(Date.now()),first=setTimeout(tick,0),timer=setInterval(tick,30_000);return ()=>{clearTimeout(first);clearInterval(timer)}},[]);
 const expired=now!==null&&now>=linkExpiresAt;
 const base=`/api/imports/${encodeURIComponent(token)}`;

 async function send(file:File){
  if(phase.state==='sending'||expired)return;
  if(!file.size){setPhase({state:'refused',message:'The file was empty. Choose the file again.'});return}
  if(file.size>maxBytes){setPhase({state:'refused',message:`The file is larger than ${megabytes(maxBytes)}. Drop a smaller file.`});return}
  setPhase({state:'sending',percent:0,fileName:file.name});
  try{
   const begun=await post(`${base}?step=begin`,JSON.stringify({fileName:file.name,mediaType:file.type||null,totalBytes:file.size}),'application/json');
   const size=begun.chunkBytes||1024*1024;
   for(let index=0,offset=0;offset<file.size;index++,offset+=size){
    await post(`${base}?step=chunk&index=${index}`,await file.slice(offset,offset+size).arrayBuffer(),'application/octet-stream');
    setPhase({state:'sending',percent:Math.min(99,Math.round((offset+size)/file.size*100)),fileName:file.name});
   }
   const done=await post(`${base}?step=finish`,'{}','application/json');
   setPhase(done.status==='ready'?{state:'received',fileName:file.name}:{state:'refused',message:done.refusal||'The file was refused. Drop a corrected file.'});
  }catch(error){setPhase({state:'refused',message:error instanceof Error?error.message:'The upload stopped. Drop the file again.'})}
 }
 const pick=(files:FileList|null)=>{const file=files?.[0];if(file)void send(file)};
 // Times are the viewer's own, so they are drawn only after mount (the server's clock and zone differ).
 const until=now===null?'':new Date(linkExpiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 const left=now===null?null:Math.max(0,Math.ceil((linkExpiresAt-now)/60_000));

 if(expired&&phase.state!=='received')return <p className={styles.problem}>This link has expired. Ask for a new link.</p>;
 return <div className={styles.body}>
  <p className={styles.lede}>Drop {label} here. Up to {megabytes(maxBytes)}.</p>
  {note&&<p className={styles.note}>{note}</p>}
  {left!==null&&<p className={styles.meta}>This link works until {until} ({left} minute{left===1?'':'s'} left).</p>}
  {arrived&&phase.state==='idle'&&<p className={styles.meta}>{arrived} has already arrived. Dropping another file replaces it.</p>}
  {phase.state==='received'?<p className={styles.done} role="status">Received. You can close this page.</p>
   :<div className={`${styles.drop} ${over?styles.over:''}`} onDragOver={event=>{event.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={event=>{event.preventDefault();setOver(false);pick(event.dataTransfer.files)}}>
    {phase.state==='sending'?<><p>Sending {phase.fileName}…</p><progress max={100} value={phase.percent} className={styles.progress} aria-label="Upload progress"/><p className={styles.meta}>{phase.percent}%</p></>
     :<><p>Drop the file here</p><button type="button" className={styles.button} onClick={()=>input.current?.click()}>Choose a file</button></>}
    <input ref={input} type="file" accept={ACCEPT[kind]} hidden onChange={event=>{pick(event.target.files);event.target.value=''}}/>
   </div>}
  {phase.state==='refused'&&<p className={styles.problem} role="alert">{phase.message}</p>}
 </div>;
}
