import assert from 'node:assert/strict';import test from 'node:test';
import {providerUsageFromEnvironment,providerUsageFromReports,summarizeHealth,type HealthInputs} from '../lib/operations-health.ts';
const now=2_000_000;
function input(overrides:Partial<HealthInputs>={}):HealthInputs{return {now,relayConfigured:true,relayState:{ok:true,observedAt:now,value:{revision:7,cue:'mah-tovu',serverTime:now,renderers:[{seen:now-1000}]}},liveCatalog:{ok:true,observedAt:now,value:{version:'same',cues:[{id:'mah-tovu',name:'Mah Tovu (incomplete)'},{id:'barechu',name:'Barechu'}]}},authoring:{ok:true,observedAt:now,value:{catalogVersion:'same',publishedCount:24,publishedVisibleCount:22,draftCount:2,revisionCount:30,latestPublicationAt:now-5000,databaseBytes:12345}},usage:providerUsageFromEnvironment({}),...overrides}}
test('healthy owner response uses real observations and marks absent usage unavailable',()=>{const result=summarizeHealth(input(),'owner');assert.equal(result.overall,'ready');assert.equal(result.playback.outputs.connected,1);assert.equal(result.synchronization.status,'current');assert.equal(result.authoring.databaseBytes,12345);assert.equal(result.providerUsage?.[0].used,null);assert.match(result.providerUsage?.[0].note??'',/not zero/)});
test('relay playback remains available while authoring is unavailable',()=>{const result=summarizeHealth(input({authoring:{ok:false,observedAt:now}}),'operator');assert.equal(result.overall,'attention');assert.equal(result.playback.status,'available');assert.equal(result.authoring.status,'unavailable');assert.equal(result.synchronization.status,'unavailable');assert.equal('providerUsage' in result,false)});
test('catalog difference is pending and zero outputs prevents ready claim',()=>{const result=summarizeHealth(input({relayState:{ok:true,observedAt:now,value:{serverTime:now,renderers:[]}},liveCatalog:{ok:true,observedAt:now,value:{version:'old',cues:[]}}}),'owner');assert.equal(result.overall,'attention');assert.equal(result.playback.outputs.status,'none-seen');assert.equal(result.synchronization.status,'pending')});
test('relay failure makes playback unavailable without hiding authoring availability',()=>{const result=summarizeHealth(input({relayState:{ok:false,observedAt:now},liveCatalog:{ok:false,observedAt:now}}),'owner');assert.equal(result.overall,'unavailable');assert.equal(result.playback.status,'unavailable');assert.equal(result.authoring.status,'available')});
test('failed relay probe distinguishes unknown current cue from a known clear state',()=>{const unknown=summarizeHealth(input({relayState:{ok:false,observedAt:now},liveCatalog:{ok:false,observedAt:now}}),'operator');const clear=summarizeHealth(input({relayState:{ok:true,observedAt:now,value:{cue:null,serverTime:now,renderers:[]}}}),'operator');assert.equal(unknown.playback.current.known,false);assert.equal(clear.playback.current.known,true);assert.equal(clear.playback.current.cue,null)});
test('an unreachable relay reports output presence as unavailable rather than a factual zero',()=>{const result=summarizeHealth(input({relayState:{ok:false,observedAt:now}}),'operator');assert.equal(result.playback.outputs.status,'unavailable');assert.notEqual(result.playback.outputs.status,'none-seen')});
test('future renderer timestamps do not count as fresh',()=>{const result=summarizeHealth(input({relayState:{ok:true,observedAt:now,value:{serverTime:now,renderers:[{seen:now+1}]}}}),'operator');assert.equal(result.playback.outputs.connected,0);assert.equal(result.overall,'attention')});
test('authoring availability does not imply playback when relay is not configured',()=>{const result=summarizeHealth(input({relayConfigured:false,relayState:{ok:false,observedAt:now}}),'operator');assert.equal(result.playback.status,'not-configured');assert.equal(result.overall,'unavailable');assert.equal(result.authoring.status,'available')});
test('owner report supports an explicit zero and retains measurement context',()=>{const reports=providerUsageFromReports([{provider:'Neon',used:0,limitValue:50,unit:'USD',windowLabel:'September',measuredAt:now}]);const neon=reports.find(item=>item.provider==='Neon')!;assert.equal(neon.status,'reported');assert.equal(neon.used,0);assert.equal(neon.limit,50);assert.equal(neon.measuredAt,now);assert.equal(reports.find(item=>item.provider==='Vercel')?.status,'unavailable')});
test('budget does not claim a safe total from incomplete reports',()=>{const usage=providerUsageFromReports([{provider:'Neon',used:10,limitValue:50,unit:'USD',windowLabel:'September',measuredAt:now}]);const result=summarizeHealth(input({usage}),'owner');assert.equal(result.budget?.budgetStatus,'incomplete-or-mixed-window');assert.equal(result.budget?.reportedMonthlyUsd,10);assert.equal(result.budget?.conclusive,false)});
test('matching fresh current-month reports can be compared while stale reports cannot',()=>{const rows=['Vercel','Neon','Cloudflare'].map(provider=>({provider,used:5,limitValue:50,unit:'USD',windowLabel:'1970-01',measuredAt:now}));const current=summarizeHealth(input({usage:providerUsageFromReports(rows)}),'owner');assert.equal(current.budget?.conclusive,true);assert.equal(current.budget?.budgetStatus,'within-target');const stale=summarizeHealth(input({now:now+46*24*60*60_000,usage:providerUsageFromReports(rows)}),'owner');assert.equal(stale.budget?.conclusive,false);assert.equal(stale.budget?.budgetStatus,'stale-or-future')});

test('the current graphic is reported by its operator-facing name from the live catalog probe',()=>{
 const result=summarizeHealth(input(),'operator');
 assert.equal(result.playback.current.cue,'mah-tovu');
 assert.equal(result.playback.current.name,'Mah Tovu (Partial)');
});

test('an unknown, cleared, or unlisted current graphic reports no name rather than an identifier',()=>{
 const cleared=summarizeHealth(input({relayState:{ok:true,observedAt:now,value:{cue:null,serverTime:now,renderers:[]}}}),'operator');
 assert.equal(cleared.playback.current.name,null);
 const unknown=summarizeHealth(input({relayState:{ok:false,observedAt:now}}),'operator');
 assert.equal(unknown.playback.current.name,null);
 const unlisted=summarizeHealth(input({relayState:{ok:true,observedAt:now,value:{cue:'retired',serverTime:now,renderers:[]}}}),'operator');
 assert.equal(unlisted.playback.current.cue,'retired');
 assert.equal(unlisted.playback.current.name,null);
 const noCatalog=summarizeHealth(input({liveCatalog:{ok:false,observedAt:now}}),'operator');
 assert.equal(noCatalog.playback.current.name,null);
});

test('the published, visible count is reported to every signed-in role and is unavailable, not zero, when authoring is down',()=>{
 assert.equal(summarizeHealth(input(),'operator').authoring.publishedVisibleCount,22);
 assert.equal(summarizeHealth(input(),'owner').authoring.publishedVisibleCount,22);
 assert.equal(summarizeHealth(input({authoring:{ok:false,observedAt:now}}),'owner').authoring.publishedVisibleCount,null);
});
