import type {AccessRole} from './access';

export type Probe<T>={ok:true;value:T;observedAt:number}|{ok:false;observedAt:number};
export type ProviderUsage={provider:'Vercel'|'Neon'|'Cloudflare';status:'reported'|'unavailable';measuredAt:number|null;window:string|null;used:number|null;limit:number|null;unit:string|null;dashboardUrl:string;note:string};
export type HealthInputs={now:number;relayConfigured:boolean;relayState:Probe<{revision?:number;cue?:string|null;serverTime?:number;renderers?:Array<{seen?:number}>}>;liveCatalog:Probe<{version:string;cues:unknown[]}>;authoring:Probe<{catalogVersion:string;publishedCount:number;draftCount:number;revisionCount:number;latestPublicationAt:number|null;databaseBytes:number}>;usage:ProviderUsage[]};

export function providerUsageFromEnvironment(env:Record<string,string|undefined>):ProviderUsage[]{
 const definitions=[
  {provider:'Vercel' as const,prefix:'VERCEL',dashboardUrl:'https://vercel.com/dashboard'},
  {provider:'Neon' as const,prefix:'NEON',dashboardUrl:'https://console.neon.tech/app/projects'},
  {provider:'Cloudflare' as const,prefix:'CLOUDFLARE',dashboardUrl:'https://dash.cloudflare.com/'},
 ];
 return definitions.map(({provider,prefix,dashboardUrl})=>{
  const measured=Number(env[`OPS_${prefix}_USAGE_MEASURED_AT`]),used=Number(env[`OPS_${prefix}_USAGE_USED`]),limit=Number(env[`OPS_${prefix}_USAGE_LIMIT`]);
  const valid=Number.isFinite(measured)&&measured>0&&Number.isFinite(used)&&used>=0&&Number.isFinite(limit)&&limit>0;
  return valid?{provider,status:'reported',measuredAt:measured,window:env[`OPS_${prefix}_USAGE_WINDOW`]?.trim()||'Owner-reported billing window',used,limit,unit:env[`OPS_${prefix}_USAGE_UNIT`]?.trim()||'USD',dashboardUrl,note:'Owner-reported value; verify in the provider dashboard.'}:{provider,status:'unavailable',measuredAt:null,window:null,used:null,limit:null,unit:null,dashboardUrl,note:'No current provider usage report is configured. This is unavailable, not zero.'};
 });
}
export function providerUsageFromReports(rows:Array<{provider:string;used:unknown;limitValue:unknown;unit:string;windowLabel:string;measuredAt:unknown}>):ProviderUsage[]{
 const configured=new Map(rows.map(row=>[row.provider,row]));
 return providerUsageFromEnvironment({}).map(empty=>{const row=configured.get(empty.provider);const used=Number(row?.used),limit=Number(row?.limitValue),measuredAt=Number(row?.measuredAt);return row&&Number.isFinite(used)&&used>=0&&Number.isFinite(limit)&&limit>0&&Number.isFinite(measuredAt)&&measuredAt>0?{...empty,status:'reported',used,limit,unit:row.unit,window:row.windowLabel,measuredAt,note:'Owner-reported value; verify in the provider dashboard.'}:empty});
}

export function summarizeHealth(input:HealthInputs,role:AccessRole){
 const relayAvailable=input.relayState.ok&&input.liveCatalog.ok;
 const authoringAvailable=input.authoring.ok;
 const liveVersion=input.liveCatalog.ok?input.liveCatalog.value.version:null,authoringVersion=input.authoring.ok?input.authoring.value.catalogVersion:null;
 const synchronized=relayAvailable&&authoringAvailable?liveVersion===authoringVersion:null;
 const serverTime=input.relayState.ok&&typeof input.relayState.value.serverTime==='number'?input.relayState.value.serverTime:input.now;
 const renderers=input.relayState.ok&&Array.isArray(input.relayState.value.renderers)?input.relayState.value.renderers:[];
 const freshOutputs=renderers.filter(item=>typeof item.seen==='number'&&serverTime-item.seen>=0&&serverTime-item.seen<=30_000);
 const playbackStatus=relayAvailable?'available':input.relayConfigured?'unavailable':'not-configured';
 const overall=playbackStatus!=='available'?'unavailable':(!authoringAvailable||synchronized===false||freshOutputs.length===0)?'attention':'ready';
 const owner=role==='owner';
 const dollarReports=input.usage.filter(item=>item.status==='reported'&&item.unit==='USD'&&item.used!==null),reportedMonthlyUsd=dollarReports.reduce((total,item)=>total+item.used!,0),freshReports=dollarReports.filter(item=>item.measuredAt!==null&&input.now-item.measuredAt>=0&&input.now-item.measuredAt<=45*24*60*60_000),currentMonth=new Date(input.now).toISOString().slice(0,7),sameWindow=freshReports.length===input.usage.length&&freshReports.every(item=>item.window===currentMonth),conclusive=sameWindow,budgetStatus=!conclusive?(freshReports.length<dollarReports.length?'stale-or-future':'incomplete-or-mixed-window'):reportedMonthlyUsd>=50?'review-now':reportedMonthlyUsd>=25?'above-target':'within-target';
 return {
  version:1,generatedAt:input.now,overall,
  playback:{status:playbackStatus,relay:{configured:input.relayConfigured,status:relayAvailable?'available':input.relayConfigured?'unavailable':'not-configured',observedAt:input.relayState.observedAt},current:{known:input.relayState.ok,revision:input.relayState.ok&&typeof input.relayState.value.revision==='number'?input.relayState.value.revision:null,cue:input.relayState.ok?input.relayState.value.cue??null:null},outputs:{status:relayAvailable?(freshOutputs.length?'connected':'none-seen'):'unavailable',connected:freshOutputs.length,freshnessSeconds:30,observedAt:input.relayState.observedAt},controllers:{status:'unavailable',reason:'Controller presence is not exposed by the live relay.'}},
  synchronization:{status:synchronized===true?'current':synchronized===false?'pending':'unavailable',liveVersion:relayAvailable?liveVersion:null,authoringVersion:authoringAvailable?authoringVersion:null,checkedAt:Math.min(input.liveCatalog.observedAt,input.authoring.observedAt)},
  authoring:{status:authoringAvailable?'available':'unavailable',latestPublicationAt:authoringAvailable?input.authoring.value.latestPublicationAt:null,...(owner&&authoringAvailable?{publishedCount:input.authoring.value.publishedCount,draftCount:input.authoring.value.draftCount,revisionCount:input.authoring.value.revisionCount,databaseBytes:input.authoring.value.databaseBytes}:{}),observedAt:input.authoring.observedAt},
  ...(owner?{providerUsage:input.usage,budget:{scope:'Both congregations combined',targetMonthlyUsd:25,reviewMonthlyUsd:50,reportedMonthlyUsd,budgetStatus,reportedProviders:dollarReports.length,totalProviders:input.usage.length,conclusive,note:'The entered-report sum is compared with the monthly plan only when all providers use the same window and were measured within 45 days.'}}:{}),
 };
}
