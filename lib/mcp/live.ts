import {randomUUID} from 'node:crypto';
import {z} from 'zod/v4';
import {COMMAND_ID_PATTERN,SERVICE_REF_PATTERN,readCommandAnswer,type LastPress,type LiveCommandAnswer,type LiveCommandBody} from '../live-command';
import {panelNeighbour,type PanelCue} from '../panel-navigation';
import type {McpIdentity,RegisterTool} from './shared';

// Live control of the output (Track V, V3). Every tool here needs crc.live (lib/mcp.ts) and is
// dispatched to the live operation below, never to the authoring operation.

const target=z.enum(['live','rehearsal']).describe("Which output. Only 'live' exists today: 'rehearsal' is refused, because a separate rehearsal output is a later plan.");
const cueId=z.string().min(1).max(160).describe('A published graphic id, as list_catalog or get_live_state names it.');
function commandFields(identity:McpIdentity){return {
 target,
 commandId:z.string().regex(COMMAND_ID_PATTERN,{message:'commandId must be 8-80 letters, digits, - or _.'}).optional().describe('Your own id for this press (8-80 letters, digits, - or _). Retrying with the same id replays the first answer instead of pressing twice. Recorded in the cue log.'),
 serviceId:z.string().regex(SERVICE_REF_PATTERN,{message:'serviceId must be a prepared service id (a UUID).'}).optional().describe('The prepared service this press belongs to, when you know it.'),
 ifRevision:z.number().int().nonnegative().optional().describe('Only act if the live state is still at this revision (get_live_state reports it); otherwise nothing changes and you are told.'),
 override:z.boolean().optional().describe(`Act even though a ${identity.shortName} Companion deck pressed a button within the deck guard window. Needs a reason.`),
 reason:z.string().min(1).max(300).optional().describe('Why you are overriding the deck guard. Returned in the result and written to the server log.'),
}}

export function registerLiveTools(register:RegisterTool,identity:McpIdentity){
 const command=commandFields(identity),output=`the live ${identity.shortName} output`;
 register('get_live_state',`Read ${output}: the requested graphic and revision, whether a graphics browser has confirmed rendering it, the scan card, the resting-logo preference, when each kind of controller last pressed (Companion deck, console, agent) and whether the deck guard is holding agents back. Changes nothing.`,z.object({target}).strict(),{readOnlyHint:true});
 register('show_graphic',`Put one published graphic on ${output} with its In animation, as a Show cue button does. Refused while a Companion deck pressed within the deck guard window unless override:true with a reason. Waits up to 3 seconds for a graphics browser to confirm and says whether one did.`,z.object({cueId,...command}).strict(),{readOnlyHint:false});
 register('take_out',`Animate one graphic off ${output}, only if it is the graphic on screen now; anything else is left alone and nothing is sent. The scan card and the resting logo are untouched.`,z.object({cueId,...command}).strict(),{readOnlyHint:false});
 register('animate_out',`Animate whatever graphic is on ${output} off, as the Animate out button does. The scan card and the resting-logo preference are untouched.`,z.object(command).strict(),{readOnlyHint:false});
 register('clear_now',`Clear ${output} at once with no animation, as the CLEAR NOW button does. It also removes the scan card and turns the resting-logo preference off, which stays off until someone turns it on again. Pass immediate:true to confirm; animate_out is the gentle alternative.`,z.object({immediate:z.literal(true,{error:'clear_now cuts everything off at once, including the scan card and the resting logo. Pass immediate:true to confirm, or use animate_out.'}),...command}).strict(),{readOnlyHint:false,destructiveHint:true});
 register('next_panel',`Show the next panel of the multipart set on ${output} (from "— 02 of 03" to 03, wrapping from the last to 01), worked out on the server from the live graphic and the catalog, as the deck's Next panel button does. Refused, with nothing sent, when the live graphic is not part of a set.`,z.object(command).strict(),{readOnlyHint:false});
 register('previous_panel',`Show the previous panel of the multipart set on ${output} (wrapping from 01 to the last), as the deck's Previous panel button does. Refused, with nothing sent, when the live graphic is not part of a set.`,z.object(command).strict(),{readOnlyHint:false});
 register('set_scan_card',`Turn the scan card on or off on ${output}, optionally with a page label (12 characters or fewer; null clears it). Turning it on without a page keeps the page it has.`,z.object({on:z.boolean(),page:z.string().max(12).nullable().optional(),...command}).strict(),{readOnlyHint:false});
 register('set_resting_logo',`Turn the resting-logo preference on or off for ${output}. This is a preference only: the output hides the mark under any graphic or the scan card, and nothing reports whether it is actually on screen.`,z.object({on:z.boolean(),...command}).strict(),{readOnlyHint:false});
}

export type LiveContext={actor:string;extra:Record<string,unknown>|undefined;identity:McpIdentity};
export type LiveOperation=(operation:string,input:Record<string,unknown>,context:LiveContext)=>Promise<unknown>;
export type LiveDeps={
 /** runMcpCommand from lib/live-command.ts: source mcp, this connection's controller, a clock sequence. */
 command:(body:Omit<LiveCommandBody,'clientId'|'sequence'>,extra:Record<string,unknown>|undefined)=>Promise<LiveCommandAnswer>;
 /** The live snapshot as GET /api/state serves it (relay /state carries lastPress since V1). */
 state:()=>Promise<unknown>;
 catalog:()=>Promise<{cues:readonly PanelCue[]}>;
 /** The workspace's deck guard window, in minutes (lib/workspace.ts deckGuardMinutes). */
 guardMinutes:()=>number;
 now?:()=>number;
 sleep?:(ms:number)=>Promise<void>;
 ackWaitMs?:number;
 pollMs?:number;
 log?:(line:string)=>void;
};

type Renderer={revision:number;cue:string|null;phase:string};
type LiveRead={revision:number;cue:string|null;mode:string;name:string|null;layout:string|null;bug:{on:boolean;page:string|null};logo:boolean;renderers:Renderer[];controllers:Record<string,number>;serverTime:number|null;catalogVersion:string|null;lastPress:LastPress|null};
const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
function readState(raw:unknown):LiveRead|null{
 const body=record(raw);if(!body||!Number.isSafeInteger(body.revision))return null;
 const payload=record(body.cuePayload),bug=record(body.bug),logo=record(body.logo);
 const renderers=Array.isArray(body.renderers)?body.renderers.map(record).filter((item):item is Record<string,unknown>=>item!==null).map(item=>({revision:Number(item.revision),cue:typeof item.cue==='string'?item.cue:null,phase:String(item.phase)})):[];
 const controllers:Record<string,number>={};
 if(Array.isArray(body.controllers))for(const item of body.controllers){const kind=String(record(item)?.client??'unknown');controllers[kind]=(controllers[kind]??0)+1}
 const cue=typeof body.cue==='string'?body.cue:null;
 return {revision:body.revision as number,cue,mode:String(body.mode??'animate'),name:cue&&payload&&payload.id===cue&&typeof payload.name==='string'?payload.name:null,layout:cue&&payload&&typeof payload.layout==='string'?payload.layout:null,bug:{on:bug?.on===true,page:bug?.on===true&&typeof bug.page==='string'?bug.page:null},logo:logo?.on===true,renderers,controllers,serverTime:Number.isSafeInteger(body.serverTime)?body.serverTime as number:null,catalogVersion:typeof body.catalogVersion==='string'?body.catalogVersion:null,lastPress:readCommandAnswer(200,body).lastPress};
}
const iso=(ms:number|null)=>ms===null?null:new Date(ms).toISOString();
function ago(ms:number){const seconds=Math.max(0,Math.round(ms/1000));if(seconds<90)return `${seconds} second${seconds===1?'':'s'}`;const minutes=Math.round(seconds/60);return `${minutes} minute${minutes===1?'':'s'}`}

/**
 * The deck guard (decision 4). Active while the newest Companion press is inside the window,
 * measured on the relay's own clock (press times and serverTime come from the same place).
 * `active:null` means the live service does not report press times, so the guard cannot tell.
 */
export function deckGuard(state:Pick<LiveRead,'lastPress'|'serverTime'>,minutes:number,now:number){
 const at=state.lastPress?.companion??null,clock=state.serverTime??now,windowMs=minutes*60_000;
 const active=state.lastPress===null?null:at!==null&&clock-at<windowMs;
 return {windowMinutes:minutes,active,lastCompanionPressAt:iso(at),endsAt:active&&at!==null?iso(at+windowMs):null,sinceMs:at===null?null:clock-at};
}
function renderedStatus(state:LiveRead){
 const current=state.renderers.filter(item=>item.revision===state.revision&&item.cue===state.cue);
 const status=current.some(item=>item.phase==='settled')?'rendered':current.some(item=>item.phase==='error')?'error':current.length?'in transition':'not acknowledged';
 return {status,renderers:current.length};
}
function onScreen(state:LiveRead){
 const {status}=renderedStatus(state),what=state.cue?`'${state.name??state.cue}'`:'a clear frame (no graphic)';
 if(status==='rendered')return `A graphics browser reports ${what} settled at revision ${state.revision}.`;
 if(status==='in transition')return `A graphics browser is animating to ${what} (revision ${state.revision}).`;
 if(status==='error')return `A graphics browser reported an error rendering ${what} (revision ${state.revision}).`;
 return `${state.cue?`'${state.name??state.cue}' is requested`:'A clear frame is requested'} at revision ${state.revision}, but no graphics browser has confirmed it.`;
}
function liveSummary(state:LiveRead){return {cue:state.cue?{id:state.cue,name:state.name}:null,scanCard:state.bug,restingLogoPreference:state.logo?'on':'off'}}

const refuse=(refused:string,extra:Record<string,unknown>={})=>({ok:false,refused,...extra});

export function createLiveOperation(deps:LiveDeps):LiveOperation{
 const now=deps.now??Date.now,sleep=deps.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms))),ackWaitMs=deps.ackWaitMs??3000,pollMs=deps.pollMs??250;
 const log=deps.log??(line=>console.warn(line));
 async function read(){try{return readState(await deps.state())}catch{return null}}
 // After an accepted press: up to ~3 s for a graphics browser to settle on the revision the relay
 // answered. Reported as it is: rendered, still animating, an error, overtaken by a later change,
 // or not acknowledged yet. Never inferred from the command having been accepted.
 async function waitForRenderer(revision:number,first:LiveRead|null){
  const started=now();let state=first;
  while(true){
   if(state&&state.revision>revision)return {acknowledged:false,status:'overtaken',waitedMs:now()-started,sentence:`Something else changed the output (now revision ${state.revision}) before a graphics browser confirmed this press. Read get_live_state.`};
   if(state&&state.revision===revision){const {status}=renderedStatus(state);if(status==='rendered')return {acknowledged:true,status,waitedMs:now()-started,sentence:`A graphics browser confirmed revision ${revision}.`};if(status==='error')return {acknowledged:false,status,waitedMs:now()-started,sentence:`A graphics browser reported an error at revision ${revision}. Check the output.`}}
   if(now()-started>=ackWaitMs)break;
   await sleep(pollMs);state=await read();
  }
  const moving=state?.revision===revision&&renderedStatus(state).status==='in transition';
  return {acknowledged:false,status:moving?'in transition':'not yet',waitedMs:now()-started,sentence:moving?`A graphics browser was still animating after ${Math.round(ackWaitMs/1000)} seconds. The press was accepted (revision ${revision}); read get_live_state to confirm.`:`No graphics browser confirmed revision ${revision} within ${Math.round(ackWaitMs/1000)} seconds. The press was accepted; read get_live_state, and check the output is open.`};
 }

 return async (operation,input,{extra,identity})=>{
  const where=`the live ${identity.shortName} output`;
  if(input.target!=='live')return refuse(`There is no rehearsal output to ${operation==='get_live_state'?'read':'send to'}: this connection controls ${where} only, and a separate rehearsal output is a later plan. Nothing was ${operation==='get_live_state'?'read':'sent'}. Pass target:'live' to ${operation==='get_live_state'?'read':'act on'} ${where}.`);
  let minutes:number;try{minutes=deps.guardMinutes()}catch{return refuse(`This congregation's deck guard setting (WORKSPACE_DECK_GUARD_MINUTES) is invalid, so live control is held back. Nothing was ${operation==='get_live_state'?'read':'sent'}. Ask an administrator to fix it.`)}
  const before=await read();
  if(!before)return refuse(`The state of ${where} could not be read, so nothing was ${operation==='get_live_state'?'read':'sent'}. Try again in a moment.`);
  const guard=deckGuard(before,minutes,now());
  if(operation==='get_live_state'){
   const rendered=renderedStatus(before),press=before.lastPress;
   return {ok:true,target:'live',revision:before.revision,mode:before.mode,requested:before.cue?{cueId:before.cue,name:before.name,layout:before.layout}:null,rendered,onScreen:onScreen(before),scanCard:before.bug,restingLogo:{preference:before.logo?'on':'off',note:'A preference only: the output hides the mark under any graphic or the scan card, and nothing reports whether it is on screen.'},lastPress:press?{companion:iso(press.companion),console:iso(press.control),agent:iso(press.mcp)}:null,controllersConnected:before.controllers,deckGuard:{...guard,sentence:guard.active===null?'The live service does not report deck presses yet, so the guard cannot tell whether a Companion is in use; live tools need override:true with a reason until it does.':guard.active?`A Companion deck pressed ${ago(guard.sinceMs??0)} ago: agent live tools are refused until ${guard.endsAt} unless override:true with a reason.`:`No Companion press in the last ${minutes} minutes: agent live tools may act.`},catalogVersion:before.catalogVersion,serverTime:iso(before.serverTime)};
  }

  // The deck has the output during a service (decision 4). Checked before anything is built or sent.
  const override=input.override===true,reason=typeof input.reason==='string'?input.reason.trim():'';
  if(override&&!reason)return refuse('override:true needs a reason saying why the deck guard should be set aside. Nothing was sent.');
  if(guard.active!==false&&!override){
   const sentence=guard.active===null
    ?`The live service does not report when a Companion deck last pressed, so the deck guard cannot tell whether someone is running ${where}. ${operation} was not sent; nothing was changed. Pass override:true with a reason to act anyway.`
    :`A ${identity.shortName} Companion deck pressed a button ${ago(guard.sinceMs??0)} ago, inside the ${minutes}-minute deck guard, so ${operation} was not sent: the person at the deck has the output. Nothing was changed. Ask them, or pass override:true with a reason if this must happen now.`;
   return refuse(sentence,{deckGuard:guard});
  }

  let body:Omit<LiveCommandBody,'clientId'|'sequence'|'commandId'>,did:string,extraResult:Record<string,unknown>={};
  const cueName=async(id:string)=>{try{return (await deps.catalog()).cues.find(cue=>cue.id===id)??null}catch{return null}};
  if(operation==='show_graphic'){
   const id=String(input.cueId),cue=await cueName(id);
   if(!cue)return refuse(`No graphic with id '${id}' is in the ${identity.shortName} live catalog. Nothing was sent. list_catalog names every published graphic and its id.`);
   const alias=(cue as PanelCue&{aliasOf?:unknown}).aliasOf;
   if(cue.hidden)return refuse(`'${cue.name}' (${id}) is hidden from operators${typeof alias==='string'?`; it stands in for '${alias}'`:''}. Nothing was sent. Show the graphic list_catalog lists instead.`);
   body={action:'in',cue:id};did=`Asked the output to show '${cue.name}'.`;
  }else if(operation==='take_out'){
   const id=String(input.cueId);
   if(before.cue!==id)return refuse(`'${id}' is not the graphic on screen now (${before.cue?`that is '${before.name??before.cue}'`:'nothing is'}), so there is nothing to take out. Nothing was sent.`,{live:liveSummary(before)});
   body={action:'out',cue:id,ifCue:id};did=`Asked the output to animate '${before.name??id}' out.`;
  }else if(operation==='animate_out'){
   body={action:'clear',cue:null};did=before.cue?`Asked the output to animate '${before.name??before.cue}' out. The scan card and the resting-logo preference are unchanged.`:'Nothing was on screen; the output was asked to stay clear. The scan card and the resting-logo preference are unchanged.';
  }else if(operation==='clear_now'){
   body={action:'cut',cue:null};did=`Cleared the output at once, with no animation. This also removed the scan card${before.bug.on?'':' (it was off)'} and turned the resting-logo preference off${before.logo?'':' (it was off)'}; the logo stays off until someone turns it on again.`;
   extraResult={alsoCleared:{scanCard:true,restingLogoPreference:'off'}};
  }else if(operation==='next_panel'||operation==='previous_panel'){
   const step=operation==='next_panel'?1:-1;
   if(!before.cue)return refuse(`Nothing is on screen, so there is no panel to step from. Nothing was sent. Use show_graphic with the first panel of a set.`);
   let cues:readonly PanelCue[];try{cues=(await deps.catalog()).cues}catch{return refuse('The live catalog could not be read, so the next panel could not be worked out. Nothing was sent. Try again in a moment.')}
   const found=panelNeighbour(cues,before.cue,step);
   if(!found)return refuse(`'${before.name??before.cue}' is not part of a multipart set with a published ${step===1?'next':'previous'} panel, so there is nothing to step to. Nothing was sent. Use show_graphic with the graphic you want.`,{live:liveSummary(before)});
   // Relative to what was read: if the deck moved in between, the relay refuses rather than stepping from the wrong panel.
   body={action:'in',cue:found.to.id,ifCue:before.cue};did=`Stepped from '${found.from.name}' to '${found.to.name}'.`;extraResult={from:{id:found.from.id,name:found.from.name},to:found.to};
  }else if(operation==='set_scan_card'){
   const on=input.on===true,page=on?(input.page===undefined?before.bug.page:input.page as string|null):null;
   body={action:'bug',cue:null,bug:{on,page}};did=on?`Asked the output to show the scan card${page?` with page '${page}'`:' with no page'}.`:'Asked the output to remove the scan card.';
  }else if(operation==='set_resting_logo'){
   const on=input.on===true;
   body={action:'logo',cue:null,logo:{on}};did=`Set the resting-logo preference ${on?'on':'off'}. This is the preference only: the output hides the mark under any graphic or the scan card, and nothing here reports whether it is on screen.`;
   extraResult={restingLogoPreference:on?'on':'off',visibility:'not reported'};
  }else return refuse(`${operation} is not a live tool. Nothing was sent.`);

  const commandId=typeof input.commandId==='string'?input.commandId:randomUUID();
  const sent={...body,commandId,...(typeof input.serviceId==='string'?{serviceRef:input.serviceId}:{}),...(input.ifRevision!==undefined?{ifRevision:input.ifRevision}:{})};
  const answer=await deps.command(sent,extra);
  const answered=record(answer.body);
  if(answer.status!==200){
   const error=typeof answered?.error==='string'?answered.error:'The live service did not accept the command.';
   const precondition=answer.status===409&&typeof answered?.precondition==='string'?answered.precondition:null;
   return refuse(`${error}${/[.!?]$/.test(error)?'':'.'}${precondition?' Read get_live_state and decide again.':''} (${operation} was not applied.)`,{commandId,status:answer.status,...(precondition?{precondition}:{})});
  }
  // The cue log has no note field (relay/src/protocol.ts HISTORY_KEYS), so an override's reason is
  // kept here: in this result and one server log line, correlated by commandId.
  let overridden:Record<string,unknown>|undefined;
  if(override){
   overridden={reason,deckGuard:guard,recordedIn:'this result and the server log (the cue log has no note field; match it by commandId)'};
   log(JSON.stringify({event:'mcp_live_override',workspace:identity.workspaceId,tool:operation,commandId,reason,guardActive:guard.active,lastCompanionPressAt:guard.lastCompanionPressAt}));
  }
  const after=readState(answer.body);
  const revision=after?.revision??before.revision;
  const outcome=answer.outcome;
  const renderer=outcome==='superseded'?{acknowledged:false,status:'superseded',waitedMs:0,sentence:'A newer press from this connection had already been applied, so this one changed nothing.'}:await waitForRenderer(revision,after);
  const outcomeSentence=outcome==='replayed'?' This commandId had already been sent, so the first answer was replayed and nothing was pressed again.':'';
  return {ok:true,tool:operation,target:'live',commandId,outcome,revision,did:did+outcomeSentence,...extraResult,renderer,live:after?liveSummary({...after,name:after.name??(after.cue===before.cue?before.name:null)}):null,...(overridden?{override:overridden}:{})};
 };
}
