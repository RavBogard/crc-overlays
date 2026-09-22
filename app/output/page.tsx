'use client';
import {useEffect,useRef,useState} from 'react';
import {Player,type Cue} from '@/lib/player';
import {overlayBrandingFromWorkspace} from '@/lib/branding';
import {withPinnedCue} from '@/lib/playback-snapshot';
import {BrowserRealtimeTransport,CatalogRefreshCoordinator,type RealtimeSnapshot} from '@/lib/browser-realtime';
import {overlayAssetUrl,preloadOverlayImage,waitForOverlayFonts} from '@/lib/overlay-assets';
import {OUTPUT_DEVICE_STORAGE_KEY,OUTPUT_LEGACY_STORAGE_KEY,resolveOutputCredential} from './output-credential';
import {BUG_QR_SRC,bugViewFor,renderBugLayer,type BugConfiguration} from '@/lib/bug-layer';
import {renderRestingLogo,restingLogoViewFor,type RestingLogoConfiguration} from '@/lib/resting-logo';
import '../bug-layer.css';
import '../resting-logo.css';

export default function Output(){const root=useRef<HTMLDivElement>(null);const bugRoot=useRef<HTMLDivElement>(null);const logoRoot=useRef<HTMLDivElement>(null);const [error,setError]=useState('');
useEffect(()=>{document.body.classList.add('output-body');const preview=new URLSearchParams(location.search).has('preview');
// D5: the compositor's scene file holds `/output#device=cd_...`, so the fragment wins; browser
// storage only covers a later visit made without one. Storage can throw in a locked-down
// browser profile, and a graphics machine must still start when it does.
const stored=(store:Storage,name:string)=>{try{return store.getItem(name)}catch{return null}};
const credential=resolveOutputCredential({hash:location.hash,preview,storedDevice:stored(localStorage,OUTPUT_DEVICE_STORAGE_KEY),legacySessionKey:stored(sessionStorage,OUTPUT_LEGACY_STORAGE_KEY)});
try{if(credential.storeDevice)localStorage.setItem(OUTPUT_DEVICE_STORAGE_KEY,credential.storeDevice);if(credential.storeLegacyKey)sessionStorage.setItem(OUTPUT_LEGACY_STORAGE_KEY,credential.storeLegacyKey)}catch{}
if(credential.clearFragment)history.replaceState(null,'',location.pathname+location.search);
const key=credential.credential;const headers:HeadersInit=key==='session'?{}:{Authorization:`Bearer ${key}`};let stopped=false,player:Player|undefined,transport:BrowserRealtimeTransport|undefined;const id=crypto.randomUUID();let catalogVersion='';let payloadSignature='';let pinnedPayload:Cue|null=null;let phaseSignature='';
// D5: the scan card is a sibling stage, scaled by this same handler. #output and the Player are untouched.
// The resting logo is a third stage on the same footing, and a separate feature: it carries its own
// configuration, its own live-state field and its own control, and the two are never the same layer.
let bugConfiguration:BugConfiguration|null=null;const bugStage=bugRoot.current;
let restingLogoConfiguration:RestingLogoConfiguration|null=null;const logoStage=logoRoot.current;
let liveSnapshot:RealtimeSnapshot|null=null;let scanCardVisible=false;
const size=()=>{const scale=`scale(${Math.min(innerWidth/1920,innerHeight/1080)})`;if(root.current)root.current.style.transform=scale;if(bugStage)bugStage.style.transform=scale;if(logoStage)logoStage.style.transform=scale};size();addEventListener('resize',size);
const applyBug=(state:RealtimeSnapshot|null)=>{const view=bugViewFor(bugConfiguration,state?.bug??null,BUG_QR_SRC);scanCardVisible=Boolean(view);if(bugStage)renderBugLayer(bugStage,view)};
/* The resting mark is decided here and nowhere else, from three things it never writes back:
   the operator's durable preference in live state, the scan card that shares its corner, and
   whether the renderer's stage is claimed (Player.occupied). It runs after every snapshot, so
   the mark is gone before a graphic paints, and again on the 100 ms tick below, so it returns
   only once an exit animation has actually finished rather than when the command arrived. */
const applyRestingLogo=()=>{if(logoStage)renderRestingLogo(logoStage,restingLogoViewFor(restingLogoConfiguration,liveSnapshot?.logo??null,{cueOccupied:Boolean(player?.occupied),scanCardVisible}))};
const validCatalog=(next:unknown):next is Cue[]=>Array.isArray(next)&&next.every(item=>{const c=item as Partial<Cue>|null;return Boolean(c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.layout==='string'&&c.texts&&typeof c.texts==='object'&&Array.isArray(c.animations)&&c.duration&&typeof c.duration==='object')});
const fetchCatalog=async()=>{const res=await fetch('/api/catalog',{headers,cache:'no-store',signal:AbortSignal.timeout(4000)});if(!res.ok)throw Error('Output access key required');const next=await res.json();const version=res.headers.get('X-CRC-Catalog-Version')||'';if(!validCatalog(next))throw Error('Invalid cue catalog');return {cues:next,version}};
const catalogRefresh=new CatalogRefreshCoordinator({getVersion:()=>catalogVersion,load:fetchCatalog,apply:catalog=>{if(stopped||!player)return;player.cues=pinnedPayload?withPinnedCue(catalog.cues,pinnedPayload.id,pinnedPayload):catalog.cues;catalogVersion=catalog.version}});
const installCatalog=(expectedVersion:string)=>catalogRefresh.request(expectedVersion);
const updateOutputState=()=>{applyRestingLogo();if(!root.current||!player)return;root.current.dataset.phase=player.phase;root.current.dataset.revision=String(player.revision);root.current.dataset.cue=player.current?.id??'';if(preview)return;const ack={id,revision:player.revision,cue:player.current?.id??null,phase:player.phase};const signature=JSON.stringify(ack);if(signature!==phaseSignature&&transport?.sendAck(ack))phaseSignature=signature};
const applySnapshot=(state:RealtimeSnapshot)=>{if(!player||stopped)return;liveSnapshot=state;applyBug(state);if(state.mode==='cut')player.set(state);if(state.cuePayload&&state.cuePayload.id===state.cue){const signature=JSON.stringify(state.cuePayload);if(payloadSignature!==signature&&player.current?.id===state.cue&&state.revision>player.desired.revision){const available=player.cues,activeBranding=player.branding;player.dispose();player=new Player(root.current!,available,activeBranding,{resolveAssetUrl:cue=>overlayAssetUrl(cue,'content')})}pinnedPayload=state.cuePayload;player.cues=withPinnedCue(player.cues,state.cue,state.cuePayload);payloadSignature=signature}else if(state.cue===null){pinnedPayload=null;payloadSignature=''}player.set(state);updateOutputState();if(state.catalogVersion&&state.catalogVersion!==catalogVersion)void installCatalog(state.catalogVersion).catch(()=>{if(!stopped)setError('Cue catalog refresh failed — holding selected graphic')})};
const start=async()=>{try{const [catalog,workspaceResponse]=await Promise.all([fetchCatalog().catch(()=>({cues:[],version:''})),fetch('/api/workspace',{cache:'no-store',signal:AbortSignal.timeout(4000)})]);if(!workspaceResponse.ok)throw Error('Workspace identity unavailable');const workspaceIdentity=await workspaceResponse.json();const activeBranding=overlayBrandingFromWorkspace(workspaceIdentity);bugConfiguration=workspaceIdentity.bug??null;restingLogoConfiguration=workspaceIdentity.restingLogo??null;applyBug(null);applyRestingLogo();const faces=workspaceIdentity.bookFaces?'book':'default';if(root.current)root.current.classList.toggle('faces-book',Boolean(workspaceIdentity.bookFaces));await Promise.all([waitForOverlayFonts(undefined,faces),preloadOverlayImage(activeBranding.logo)]);if(stopped)return;catalogVersion=catalog.version;player=new Player(root.current!,catalog.cues,activeBranding,{resolveAssetUrl:cue=>overlayAssetUrl(cue,'content')});const catalogFailure=(version:string)=>installCatalog(version).catch(()=>{if(!stopped)setError('Cue catalog refresh failed — holding selected graphic')});transport=new BrowserRealtimeTransport({key,role:preview?'preview':'output',id,getCatalogVersion:()=>catalogVersion,getAck:()=>({id,revision:player!.revision,cue:player!.current?.id??null,phase:player!.phase}),onSnapshot:applySnapshot,onCatalog:catalogFailure,onStatus:status=>{if(stopped)return;if(status==='live')setError('');else if(status==='reconnecting')setError('Disconnected — holding last graphic')}});transport.start()}catch(e){if(!stopped)setError(e instanceof Error?e.message:String(e))}};
void start();const phaseTimer=setInterval(updateOutputState,100);return()=>{stopped=true;clearInterval(phaseTimer);transport?.stop();player?.dispose();if(bugStage)renderBugLayer(bugStage,null);if(logoStage)renderRestingLogo(logoStage,null);removeEventListener('resize',size);document.body.classList.remove('output-body')}},[]);
return <><div ref={logoRoot} id="output-logo" data-resting-logo="off"/><div ref={bugRoot} id="output-bug" data-bug="off"/><div ref={root} id="output"/>{error&&<span className="output-diagnostic" aria-label={error}/>}</>}
