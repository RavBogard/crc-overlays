'use client';
/* Session discovery and realtime lifecycle intentionally initialize local UI state from effects. */
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {overlayBrandingFromWorkspace} from '@/lib/branding';
import {BrowserRealtimeTransport,CatalogRefreshCoordinator,type RealtimeSnapshot,type RendererAck} from '@/lib/browser-realtime';
import {Player,type Cue} from '@/lib/player';
import type {ResolvedLayouts} from '@/lib/layout-registry';
import type {PublicWorkspace} from '@/lib/workspace';
import WorkspaceHeader from '@/components/workspace-header';
import {layoutLabel} from '@/lib/layout-label';
import {friendlyCueName,searchCues} from '@/lib/cue-search';
import {openingWords} from '@/lib/cue-opening';
import GraphicThumbnail from '@/components/graphic-thumbnail';
import {fetchAccessUser} from '@/lib/access-client';
import {overlayAssetUrl,waitForRenderedOverlayAssets} from '@/lib/overlay-assets';
import {consoleKeyAction,nextInspected} from '@/lib/console-keys';
import {BUG_PAGE_INPUT_PATTERN,bugPageLengthRefusal,commandErrorMessage} from '@/lib/console-messages';
import type {BugState} from '@/lib/bug-layer';
import {restingLogoStatus,type RestingLogoState} from '@/lib/resting-logo';
// L3 - the catalog envelope's pinned data-layout definitions, shared by every preview on this page (as /output keeps them).
const consoleLayouts:ResolvedLayouts={};

type ModelContext={registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown};
type Role='owner'|'editor'|'operator';
type ChipState='requested'|'rendered'|'disconnected';

/* The console shows the same three states as the Companion module, with the same 3 s grace
   before red, so the deck and this page never disagree. Rendered is never graced. */
const DISCONNECTED_GRACE_MS=3000;

type ShowGuard={disabled:boolean;title:string|undefined};

/* A 1920 x 1080 canvas the Player lays out at broadcast size, scaled by transform into whatever
   width the window has (the same technique as GraphicMiniature). Both monitors use it, in the
   two ways the Player supports.

   The Preview window is a still: one selected graphic, rendered at rest, because the operator is
   inspecting a candidate. The Live window is given the realtime state instead and driven through
   set(), exactly as /output is, so it runs the same In and Out tracks the output runs and clears
   immediately on a cut. Its Player therefore lives as long as the workspace does — disposing it
   per cue would throw away the departing graphic before its Out track could play. Neither window
   touches the output; both re-render locally. */
function StillStage({cue,workspace,onReady,children}:{cue:Cue|null;workspace:PublicWorkspace|null;onReady:(ready:boolean)=>void;children?:ReactNode}){
 const frame=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null);
 useEffect(()=>{const resize=()=>{if(frame.current&&canvas.current)canvas.current.style.transform=`scale(${frame.current.clientWidth/1920})`};resize();const observer=new ResizeObserver(resize);if(frame.current)observer.observe(frame.current);return()=>observer.disconnect()},[]);
 useEffect(()=>{const root=canvas.current;if(!root)return;onReady(false);if(!workspace){root.replaceChildren();return}root.classList.toggle('faces-book',Boolean(workspace.bookFaces));let current=true;const player=new Player(root,cue?[cue]:[],overlayBrandingFromWorkspace(workspace),{layouts:consoleLayouts});if(cue){player.render(cue,overlayAssetUrl(cue,'preview'));void waitForRenderedOverlayAssets(root,undefined,workspace.bookFaces?'book':'default').then(()=>{if(current)onReady(true)}).catch(()=>{if(current)onReady(false)})}return()=>{current=false;player.dispose()}},[cue,workspace]);
 return <div className="inspect-stage" ref={frame}><div className="inspect-canvas" ref={canvas}/>{children}</div>
}

function LiveStage({cues,state,workspace,onReady,children}:{cues:Cue[];state:RealtimeSnapshot|null;workspace:PublicWorkspace|null;onReady:(ready:boolean)=>void;children?:ReactNode}){
 const frame=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null),player=useRef<Player|null>(null);
 useEffect(()=>{const resize=()=>{if(frame.current&&canvas.current)canvas.current.style.transform=`scale(${frame.current.clientWidth/1920})`};resize();const observer=new ResizeObserver(resize);if(frame.current)observer.observe(frame.current);return()=>observer.disconnect()},[]);
 useEffect(()=>{const root=canvas.current;if(!root||!workspace){player.current=null;return}root.classList.toggle('faces-book',Boolean(workspace.bookFaces));const instance=new Player(root,[],overlayBrandingFromWorkspace(workspace),{resolveAssetUrl:cue=>overlayAssetUrl(cue,'preview'),layouts:consoleLayouts});player.current=instance;
  // The Player has no phase callback, so its readiness is polled the way /output polls it.
  const timer=setInterval(()=>onReady(instance.phase==='settled'&&instance.current!==null),100);
  return()=>{clearInterval(timer);player.current=null;instance.dispose()}},[workspace]);
 useEffect(()=>{const instance=player.current;if(!instance)return;instance.cues=cues;instance.set({cue:state?.cue??null,revision:state?.revision??0,mode:state?.mode==='cut'?'cut':'animate'})},[cues,state?.cue,state?.revision,state?.mode]);
 return <div className="inspect-stage" ref={frame}><div className="inspect-canvas" ref={canvas}/>{children}</div>
}


/* Layout pass (handoff #2, B): one frame, not two. With nothing selected it is what the output
   has been told to show; select a row and the same frame becomes that graphic's preview, badged,
   with its Show under it and one line naming what the congregation is still seeing. Both stages
   stay mounted and one is hidden, so choosing a preview never disposes the live Player and throws
   away a graphic mid-animation. Neither stage touches the output; both re-render locally. */
function OnAirPanel(props:{
 inspectedCue:Cue|null;liveCue:Cue|null;cues:Cue[];state:RealtimeSnapshot|null;workspace:PublicWorkspace|null;chip:ChipState;scanCardOn:boolean;restingLogoResting:boolean;
 onShow:()=>void;onAnimateOut:()=>void;onClear:()=>void;showGuard:ShowGuard;clearGuard:ShowGuard;controlReason:string}){
 const{inspectedCue,liveCue,cues,state,workspace,chip,scanCardOn,restingLogoResting,showGuard,clearGuard,controlReason}=props;
 const[previewReady,setPreviewReady]=useState(false),[liveReady,setLiveReady]=useState(false);
 const previewing=Boolean(inspectedCue),liveName=liveCue?friendlyCueName(liveCue.name):'';
 const waiting=previewing?!previewReady&&Boolean(inspectedCue):Boolean(liveCue)&&!liveReady;
 return <aside className="on-air" aria-label={previewing?'Preview':'On air'}>
  <div className="on-air-head">
   <strong>{workspace?(previewing?friendlyCueName(inspectedCue!.name):liveName||'Nothing on air'):'Loading workspace…'}</strong>
   {previewing?<span className="on-air-badge">Preview</span>:chip==='disconnected'?<span className="state-chip disconnected">Disconnected</span>:null}
  </div>
  <div className="on-air-frame">
   <div className="stage-slot" data-hidden={previewing||undefined} aria-hidden={previewing||undefined}><LiveStage cues={cues} state={state} workspace={workspace} onReady={setLiveReady}>{workspace&&!liveCue&&<p>Nothing on air.{scanCardOn?' The scan card is showing.':restingLogoResting?' The resting logo is showing.':''}</p>}</LiveStage></div>
   <div className="stage-slot" data-hidden={!previewing||undefined} aria-hidden={!previewing||undefined}><StillStage cue={inspectedCue} workspace={workspace} onReady={setPreviewReady}/></div>
  </div>
  {previewing&&<button className="show show-primary" aria-label={`Show ${friendlyCueName(inspectedCue!.name)} live`} {...showGuard} onClick={props.onShow}>Show</button>}
  {previewing&&<p className="on-air-line">On air: {liveName||'nothing'}</p>}
  {waiting&&<p className="on-air-line">Preparing fonts and artwork…</p>}
  <div className="out-actions">
   <button className="animate-out" {...showGuard} onClick={props.onAnimateOut}>Animate out</button>
   <button className="cut" title={clearGuard.title||'Clear also removes the scan card and turns the resting logo off.'} disabled={clearGuard.disabled} onClick={props.onClear}>Clear</button>
  </div>
  {controlReason&&<small className="control-reason">{controlReason}</small>}
 </aside>;
}

function SignInPanel(){
 return <section className="access"><h2>Sign in to continue</h2><p>Use your account, or the one-time invitation link an administrator sent you. Both open on the Account page.</p><p><a className="access-signin" href="/access">Open account</a></p></section>
}

/* The disconnected state is stated once on this page: this line. The chip on the Live window
   header carries it as state; nothing else repeats it in prose. Two situations share the red
   chip — this page lost the graphics service, or (far more often) no graphics browser is
   attached because OBS or vMix is not open — and both end at the same place, Setup. */
function ConnectionNotice(){
 return <aside className="notice" role="status"><div><strong>Output not connected</strong><span>Show still works; the graphic appears when it reconnects.</span></div><a href="/setup">Fix</a></aside>;
}

export default function Console(){
 const[workspace,setWorkspace]=useState<PublicWorkspace|null>(null),[key,setKey]=useState(''),[filter,setFilter]=useState(''),[cues,setCues]=useState<Cue[]>([]),[inspected,setInspected]=useState<string|null>(null),[state,setState]=useState<RealtimeSnapshot|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false),[pending,setPending]=useState(false),[role,setRole]=useState<Role|undefined>(undefined),[graceExpired,setGraceExpired]=useState(false),[bugPage,setBugPage]=useState('');const client=useRef(''),sequence=useRef(0),catalogVersion=useRef(''),stateRef=useRef<RealtimeSnapshot|null>(null),connectedRef=useRef(false);
 const accept=(s:RealtimeSnapshot)=>setState(prev=>{const next=!prev||s.revision>prev.revision||(s.revision===prev.revision&&s.serverTime>=prev.serverTime)?s:prev;stateRef.current=next;return next});
 useEffect(()=>{client.current=sessionStorage.getItem('crc-controller-id')||crypto.randomUUID();sessionStorage.setItem('crc-controller-id',client.current);sequence.current=Number(sessionStorage.getItem('crc-controller-sequence')||0);setKey(sessionStorage.getItem('crc-control-key')||'');void fetchAccessUser().then(user=>{if(user){setKey('session');setRole(user.role as Role)}}).catch(()=>{});void fetch('/api/workspace').then(r=>r.ok?r.json():null).then(result=>{if(result?.organizationName)setWorkspace(result)}).catch(()=>{})},[]);
 useEffect(()=>{if(!key){connectedRef.current=false;setConnected(false);return}let stopped=false;setCues([]);catalogVersion.current='';setError('');const validCatalog=(next:unknown):next is Cue[]=>Array.isArray(next)&&next.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.layout==='string'&&c.texts&&typeof c.texts==='object'&&Array.isArray(c.animations)&&c.duration&&typeof c.duration==='object');const catalogRefresh=new CatalogRefreshCoordinator({getVersion:()=>catalogVersion.current,load:async()=>{const response=await fetch('/api/catalog?include=layouts',{headers:key==='session'?{}:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(4000)});const body:unknown=await response.json();const version=response.headers.get('X-CRC-Catalog-Version')||'';const envelope=body&&typeof body==='object'&&!Array.isArray(body)?body as {cues?:unknown;layouts?:unknown}:null;const cues=envelope?envelope.cues:body;if(!response.ok||!validCatalog(cues))throw Error('Graphic catalog unavailable: refresh failed.');if(envelope?.layouts&&typeof envelope.layouts==='object'&&!Array.isArray(envelope.layouts))Object.assign(consoleLayouts,envelope.layouts);return {cues,version}},apply:catalog=>{if(!stopped){catalogVersion.current=catalog.version;setCues(catalog.cues)}}});const refreshCatalog=(version:string)=>catalogRefresh.request(version).catch(()=>{if(!stopped)setError('Graphic catalog unavailable: refresh failed.')});void refreshCatalog('initial-http-load');const transport=new BrowserRealtimeTransport({key,role:'control',id:client.current,getCatalogVersion:()=>catalogVersion.current,onSnapshot:(snapshot:RealtimeSnapshot)=>{if(!stopped)accept(snapshot);if(snapshot.catalogVersion!==catalogVersion.current)void refreshCatalog(snapshot.catalogVersion)},onCatalog:refreshCatalog,onPresence:(renderers,serverTime)=>{if(stopped)return;setState(previous=>{if(!previous||serverTime<previous.serverTime)return previous;const next={...previous,renderers,serverTime};stateRef.current=next;return next})},onStatus:status=>{if(stopped)return;if(status==='live'){connectedRef.current=true;setConnected(true);setError(current=>current==='Realtime connection unavailable.'?'':current)}else if(status==='reconnecting'){connectedRef.current=false;setConnected(false);setError('Realtime connection unavailable.')}}});transport.start();return()=>{stopped=true;connectedRef.current=false;transport.stop()}},[key]);
 useEffect(()=>{if(!cues.length)return;const params=new URLSearchParams(window.location.search),id=params.get('preview')??params.get('inspect');if(id&&cues.some(cue=>cue.id===id))setInspected(id)},[cues]);
 async function command(action:string,cue?:string,bug?:BugState,logo?:RestingLogoState,source?:'mcp'){const nextSequence=++sequence.current;sessionStorage.setItem('crc-controller-sequence',String(nextSequence));setPending(true);setError('');try{const r=await fetch('/api/command',{method:'POST',signal:AbortSignal.timeout(5000),headers:{...(key==='session'?{}:{Authorization:`Bearer ${key}`}), 'Content-Type':'application/json'},body:JSON.stringify({commandId:crypto.randomUUID(),clientId:client.current,sequence:nextSequence,action,cue,...(bug?{bug}:{}),...(logo?{logo}:{}),...(source?{source}:{})})});if(!r.ok){let refusal:unknown=null;try{refusal=await r.json()}catch{}throw Error(commandErrorMessage(refusal))}const result=await r.json() as RealtimeSnapshot;accept(result);return {revision:result.revision,cue:result.cue}}catch(e){setError(e instanceof Error?e.message:String(e));throw e}finally{setPending(false)}}
 // WebMCP: an agent in this browser, not the person at it. Its commands are tagged source 'mcp' (R-V4)
 // so the cue log and the deck guard tell them apart from a press on this page.
 useEffect(()=>{if(!key)return;const context=(document as Document&{modelContext?:ModelContext}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();const register=(tool:unknown)=>{try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};register({name:'read_overlay_status',description:'Read the requested graphic and recent graphics-output acknowledgments. Rendered does not establish that vMix or OBS is on air.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>{if(!stateRef.current)throw Error('Status unavailable');return {...stateRef.current,transportConnected:connectedRef.current}}});register({name:'set_overlay_cue',description:'Change the graphics output: show a known prayer graphic, animate out, or clear immediately. This controls output, not just the preview.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['in','clear','cut']},cue:{type:'string',enum:cues.map(c=>c.id)}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid action or prayer cue');const value=input as Record<string,unknown>;if(typeof value.action!=='string'||!['in','clear','cut'].includes(value.action)||Object.keys(value).some(k=>!['action','cue'].includes(k))||(value.action==='in'&&!cues.some(c=>c.id===value.cue)))throw Error('Invalid action or prayer cue');return command(value.action,typeof value.cue==='string'?value.cue:undefined,undefined,undefined,'mcp')}});return()=>lifecycle.abort()},[key,cues]);
 const renderers:RendererAck[]=state?.renderers??[],settled=state?renderers.filter(r=>r.revision===state.revision&&r.cue===state.cue&&r.phase==='settled'):[],catalogReady=cues.length>0,liveCue=cues.find(c=>c.id===state?.cue)??null,inspectedCue=cues.find(c=>c.id===inspected)??null,filteredCues=searchCues(cues.filter(c=>!c.hidden),filter),inspect=(id:string)=>{setInspected(id);const url=new URL(window.location.href);url.searchParams.delete('inspect');url.searchParams.set('preview',id);history.replaceState(null,'',url)},clearInspected=()=>{setInspected(null);const url=new URL(window.location.href);url.searchParams.delete('inspect');url.searchParams.delete('preview');history.replaceState(null,'',url)};
 /* Unhealthy mirrors the Companion module: no transport, or no renderer attached. The chip keeps
    its previous (amber) state through the grace window; only after it expires does it go red. */
 const unhealthy=!connected||!state||renderers.length===0,rendered=!unhealthy&&settled.length===renderers.length,chip:ChipState=unhealthy&&graceExpired?'disconnected':rendered?'rendered':'requested';
 useEffect(()=>{if(!unhealthy){setGraceExpired(false);return}const timer=setTimeout(()=>setGraceExpired(true),DISCONNECTED_GRACE_MS);return()=>clearTimeout(timer)},[unhealthy]);
 const controlReason=!connected?'Live control is reconnecting':pending?'Sending request…':!catalogReady?'Catalog unavailable':'';
 /* One guard for every Show, so the button under Preview can never be live while a row Show is not. */
 const showGuard={disabled:pending||!connected,title:controlReason||undefined};
 /* B-1: one path for every scan card request, so Show, Hide and Set page cannot disagree
    about the page. Set page is offered only while the card is on air, because with the card
    off the typed value is simply kept and carried by the next Show. Length is refused here;
    a disallowed character is refused by the relay, whose sentence command() now shows. */
 const bugOn=state?.bug?.on??false;
 function sendBug(on:boolean){const refusal=bugPageLengthRefusal(bugPage);if(refusal){setError(refusal);return}void command('bug',undefined,{on,page:bugPage.trim()||null}).catch(()=>{})}
 /* The resting logo. Two states are deliberately shown as one control and two sentences: the
    button carries the PREFERENCE, which is what the press changes and what survives a reload,
    and the line under the name says whether anything is currently covering it. Pressing Turn on
    during a graphic is a real, remembered change even though nothing appears; saying only "On"
    there would be a control claiming a picture it cannot see. Neither line is a report from a
    graphics browser -- it is derived from the same requested live state the button writes. */
 const logoOn=state?.logo?.on??false;
 const logoStatus=restingLogoStatus(workspace?.restingLogo??null,state?.logo??null,{cueOccupied:Boolean(state?.cue),scanCardVisible:bugOn});
 const logoLine=logoStatus==='suppressed'?'On · held back while something else is up':logoStatus==='resting'?'On · showing while the output is clear':'Off · the output rests empty';
 function sendLogo(on:boolean){void command('logo',undefined,undefined,{on}).catch(()=>{})}
 /* U6: the keyboard only moves the inspect selection. consoleKeyAction has no Show outcome, and
    nothing here calls command(...) — showing live stays a deliberate click, or Enter on a focused
    Show button, which is the browser's own button behaviour rather than a binding of ours. */
 useEffect(()=>{const onKeyDown=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null,tag=target?.tagName??'';if(event.key==='Escape'){clearInspected();return}const action=consoleKeyAction(event.key,tag,{ctrl:event.ctrlKey,meta:event.metaKey,alt:event.altKey,shift:event.shiftKey});if(!action)return;if(action==='inspect'){if(tag.toLowerCase()==='button')return;const id=inspected??filteredCues[0]?.id??null;if(id)inspect(id);return}event.preventDefault();const next=nextInspected(filteredCues.map(c=>c.id),inspected,action==='up'?-1:1);if(next)inspect(next)};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown)},[filteredCues,inspected]);
 useEffect(()=>{if(!inspected)return;document.querySelector(`.graphic-row[data-cue="${CSS.escape(inspected)}"]`)?.scrollIntoView({block:'nearest'})},[inspected]);
 function signedOut(){stateRef.current=null;connectedRef.current=false;catalogVersion.current='';setKey('');setRole(undefined);setCues([]);setInspected(null);setState(null);setConnected(false);setGraceExpired(false);setError('');setBugPage('')}
 return <main className="console"><WorkspaceHeader current="/" title="Live control" role={role} workspace={workspace} onSignedOut={signedOut}/>{!key?<SignInPanel/>:<>{chip==='disconnected'&&<ConnectionNotice/>}<div className="live-layout">
  <section className="graphics-panel" aria-label="Graphics">
   <label className="graphics-search" htmlFor="cue-search"><input id="cue-search" type="search" autoFocus title="↑ ↓ move · Enter previews" placeholder="Search graphics: name, spelling variant, Hebrew, or opening words" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
   <div className="graphic-rows" role="listbox" aria-label="Graphics">
    {/* B: the scan card is the pinned first row, with its page inline. Typing a page while the
        card is up applies it when the field is left, so there is no third control to press. */}
    {workspace?.bug?.enabled&&<div className="graphic-row scan-row">
     <span className="row-thumb scan-thumb" aria-hidden>▣</span>
     <span className="row-name"><strong>Scan card</strong></span>
     <label className="scan-page" htmlFor="scan-card-page">Page<input id="scan-card-page" type="text" inputMode="text" autoComplete="off" maxLength={12} pattern={BUG_PAGE_INPUT_PATTERN} value={bugPage} onChange={event=>setBugPage(event.target.value)} onBlur={()=>{if(bugOn)sendBug(true)}} onKeyDown={event=>{if(event.key==='Enter'&&bugOn)sendBug(true)}}/></label>
     <button className="show" type="button" {...showGuard} onClick={()=>sendBug(!bugOn)}>{bugOn?'Hide':'Show'}</button>
    </div>}
    {/* The resting logo is its own pinned row, beside the scan card and never the same
        control: this one shows the congregation's artwork in the corner and never a QR code,
        and Clear now turns it off along with everything else. */}
    {workspace?.restingLogo?.enabled&&<div className="graphic-row scan-row">
     <span className="row-thumb scan-thumb" aria-hidden>◕</span>
     <span className="row-name"><strong>Resting logo</strong><small>{logoLine}</small></span>
     <button className="show" type="button" {...showGuard} onClick={()=>sendLogo(!logoOn)}>{logoOn?'Turn off':'Turn on'}</button>
    </div>}
    {filteredCues.length?filteredCues.map(c=>{const name=friendlyCueName(c.name),live=state?.cue===c.id;return <div className={`graphic-row${live?' live':''}${inspected===c.id?' inspected':''}`} data-cue={c.id} key={c.id} role="option" aria-selected={inspected===c.id} tabIndex={-1} onClick={()=>inspect(c.id)}>
     <GraphicThumbnail layout={c.layout} title={name} className="row-thumb"/>
     <span className="row-name"><strong>{name}</strong><small>{openingWords(c)||layoutLabel(c.layout)}</small></span>
     <span className="row-layout">{layoutLabel(c.layout)}{live&&chip!=='disconnected'?` · ${chip==='rendered'?'Rendered':'Requested'}`:''}</span>
     <button className="show" aria-label={`Show ${name} live`} {...showGuard} onClick={event=>{event.stopPropagation();void command('in',c.id).then(()=>clearInspected()).catch(()=>{})}}>Show</button>
    </div>}):<p role="status" className="no-matches">No matching graphics. Try fewer words or another spelling.</p>}
   </div>
  </section>
  <OnAirPanel inspectedCue={inspectedCue} liveCue={liveCue} cues={cues} state={state} workspace={workspace} chip={chip} scanCardOn={bugOn} restingLogoResting={logoStatus==='resting'}
   showGuard={showGuard} clearGuard={{disabled:!connected,title:controlReason||undefined}} controlReason={controlReason}
   onShow={()=>{if(inspectedCue)void command('in',inspectedCue.id).then(()=>clearInspected()).catch(()=>{})}}
   onAnimateOut={()=>void command('clear').catch(()=>{})}
   onClear={()=>void command('cut').catch(()=>{})}/>
 </div></>}{error&&<p role="alert" className="error">{error}</p>}</main>
}
