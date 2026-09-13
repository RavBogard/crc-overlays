import {authorizeRequest} from '@/lib/access';
import {publishedVisibleCount} from '@/lib/catalog-count';
import {db} from '@/lib/database';
import {authoringCatalog,json} from '@/lib/server';
import {relayCatalog,relayConfigured,relaySnapshot} from '@/lib/relay';
import {providerUsageFromEnvironment,providerUsageFromReports,summarizeHealth,type Probe} from '@/lib/operations-health';
import type {QueryResultRow} from 'pg';

const probe=async<T>(work:()=>Promise<T>,timeoutMs=4800):Promise<Probe<T>>=>{const observedAt=Date.now();let timer:ReturnType<typeof setTimeout>|undefined;try{return {ok:true,value:await Promise.race([work(),new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeoutMs)})]),observedAt}}catch{return {ok:false,observedAt}}finally{if(timer)clearTimeout(timer)}};
async function boundedQuery<T extends QueryResultRow>(text:string,values:unknown[]=[]){const client=await db.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('statement_timeout','4000',true)");const result=await client.query<T>(text,values);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}

export async function GET(request:Request){
 let member;try{member=await authorizeRequest(request,'read')}catch{return json({error:'The signed-in health check is temporarily unavailable. Existing graphics devices may remain connected.'},503)}if(!member)return json({error:'Sign in required'},401);
 const relayOn=relayConfigured();
 const [relayState,liveCatalog,authoring]=await Promise.all([
  relayOn?probe(async()=>await relaySnapshot() as {revision?:number;cue?:string|null;serverTime?:number;renderers?:Array<{seen?:number}>}):Promise.resolve({ok:false,observedAt:Date.now()} as const),
  relayOn?probe(()=>relayCatalog()):probe(()=>authoringCatalog()),
  probe(async()=>{const [catalog,metrics]=await Promise.all([authoringCatalog(),boundedQuery<{
    draftCount:number;publishedCount:number;revisionCount:number;latestPublicationAt:number|null;databaseBytes:number
  }>(`SELECT
    (SELECT count(*)::int FROM authoring_drafts) AS "draftCount",
    (SELECT count(*)::int FROM authoring_drafts WHERE active_revision IS NOT NULL) AS "publishedCount",
    (SELECT count(*)::int FROM authoring_revisions) AS "revisionCount",
    (SELECT max(created_at) FROM authoring_revisions) AS "latestPublicationAt",
    pg_database_size(current_database()) AS "databaseBytes"`)]);const row=metrics.rows[0];return {catalogVersion:catalog.version,publishedCount:Number(row.publishedCount),publishedVisibleCount:publishedVisibleCount(catalog.cues),draftCount:Number(row.draftCount),revisionCount:Number(row.revisionCount),latestPublicationAt:row.latestPublicationAt===null?null:Number(row.latestPublicationAt),databaseBytes:Number(row.databaseBytes)}}),
 ]);
 let usage=providerUsageFromEnvironment(process.env);
 if(member.role==='owner'){const reports=await probe(()=>boundedQuery<{provider:string;used:number;limitValue:number;unit:string;windowLabel:string;measuredAt:number}>('SELECT provider,used,limit_value AS "limitValue",unit,window_label AS "windowLabel",measured_at AS "measuredAt" FROM operations_usage_reports ORDER BY provider'),4500);if(reports.ok)usage=providerUsageFromReports(reports.value.rows)}
 return json(summarizeHealth({now:Date.now(),relayConfigured:relayOn,relayState,liveCatalog,authoring,usage},member.role));
}

export async function POST(request:Request){
 let member;try{member=await authorizeRequest(request,'owner')}catch{return json({error:'Account administration is temporarily unavailable.'},503)}if(!member)return json({error:'Administrator access required'},401);
 let body:unknown;try{body=await request.json()}catch{return json({error:'Invalid request'},400)}
 const value=body as Record<string,unknown>,provider=value?.provider,used=Number(value?.used),limit=Number(value?.limit),measuredAt=Number(value?.measuredAt),unit=typeof value?.unit==='string'?value.unit.trim():'',window=typeof value?.window==='string'?value.window.trim():'';
 if(!['Vercel','Neon','Cloudflare'].includes(String(provider))||!Number.isFinite(used)||used<0||!Number.isFinite(limit)||limit<=0||!Number.isSafeInteger(measuredAt)||measuredAt<=0||!unit||unit.length>20||!/^\d{4}-(0[1-9]|1[0-2])$/.test(window))return json({error:'Enter a provider, measured usage, limit, unit, billing month, and measurement date.'},400);
 try{await boundedQuery('INSERT INTO operations_usage_reports(provider,used,limit_value,unit,window_label,measured_at,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(provider) DO UPDATE SET used=EXCLUDED.used,limit_value=EXCLUDED.limit_value,unit=EXCLUDED.unit,window_label=EXCLUDED.window_label,measured_at=EXCLUDED.measured_at,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by',[provider,used,limit,unit,window,measuredAt,Date.now(),member.id]);return json({ok:true})}catch{return json({error:'The usage report could not be saved.'},503)}
}
