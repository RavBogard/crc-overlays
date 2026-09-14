'use client';

/**
 * X5 (Phase E) - "Record an issue or fallback" and its CSV export, moved out of `/services`
 * and onto `/services/log` (Service log). The markup, the strings and the `record_feedback`
 * request are the ones the combined page used; only their address changed.
 *
 * `collectionId` is still sent when the caller knows which prepared service the operator was
 * looking at. The log page has no open collection, which is the same shape the combined page
 * sent whenever no collection was selected.
 */

import {useState} from 'react';
import {call,type Dashboard} from './services-data';

type Props={dashboard:Dashboard;busy:boolean;perform:(work:()=>Promise<unknown>)=>Promise<boolean>;collectionId?:string};

export default function ServiceLogPanel({dashboard,busy,perform,collectionId}:Props){
 const [feedback,setFeedback]=useState({kind:'issue',cueId:'',context:'',reason:'',impact:'minor',productGap:true});
 async function recordFeedback(event:React.FormEvent){event.preventDefault();if(await perform(()=>call('record_feedback',{...feedback,collectionId,cueId:feedback.cueId||undefined})))setFeedback({kind:'issue',cueId:'',context:'',reason:'',impact:'minor',productGap:true})}
 return <section className="feedback-section"><div className="section-heading"><div><p className="services-eyebrow">BETA LEARNING</p><h2>Record an issue or fallback</h2><p>Capture what happened while the context is fresh. Export the log for triage and follow-up.</p></div><a className="export-link" href="/api/services?export=feedback.csv">Export CSV</a></div>
  {dashboard.permissions.recordFeedback&&<form className="feedback-form" onSubmit={recordFeedback}><label>What happened<select value={feedback.kind} onChange={e=>setFeedback({...feedback,kind:e.target.value})}><option value="issue">Issue</option><option value="fallback">Fallback used</option><option value="observation">Observation</option></select></label><label>Impact<select value={feedback.impact} onChange={e=>setFeedback({...feedback,impact:e.target.value})}><option value="none">No service impact</option><option value="minor">Minor</option><option value="service-affecting">Service affecting</option></select></label><label>Graphic<select value={feedback.cueId} onChange={e=>setFeedback({...feedback,cueId:e.target.value})}><option value="">No specific graphic</option>{dashboard.catalog.cues.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Moment or context<input required maxLength={240} value={feedback.context} onChange={e=>setFeedback({...feedback,context:e.target.value})} placeholder="Before opening song, Saturday morning"/></label><label className="wide">Details<textarea required maxLength={1200} value={feedback.reason} onChange={e=>setFeedback({...feedback,reason:e.target.value})}/></label><label className="check"><input type="checkbox" checked={feedback.productGap} onChange={e=>setFeedback({...feedback,productGap:e.target.checked})}/>This suggests a product gap</label><button disabled={busy}>Record feedback</button></form>}
  <div className="feedback-list">{dashboard.feedback.slice(0,30).map(item=><article key={item.id}><span>{item.kind} · {item.impact}</span><strong>{item.context}</strong><p>{item.reason}</p><small>{new Date(item.createdAt).toLocaleString()}{item.productGap?' · Product gap':''}</small></article>)}</div>
 </section>;
}
