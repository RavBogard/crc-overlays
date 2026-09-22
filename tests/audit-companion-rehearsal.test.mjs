import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const root=path.resolve(import.meta.dirname,'..'),script=path.join(root,'scripts/audit-companion-rehearsal.mjs')
const slotIds=Array.from({length:16},(_,index)=>`slot-${index+1}`)
const camera=()=>({type:'action',id:'camera',definitionId:'recallPset',connectionId:'ptz',options:{preset:3}})
const show=id=>({type:'action',id:'show',definitionId:'show_cue',connectionId:'overlay',options:{cue:id}})
const config=(ids=slotIds,mutate=false)=>({pages:{1:{controls:{0:{0:{type:'pageup'}}}},76:{controls:{0:{0:{steps:{0:{action_sets:{down:[show(ids[0]),mutate?{...camera(),options:{preset:4}}:camera()],up:[]}}}}}}},77:{controls:{}},78:{controls:{}}}})
function run({fallbackPages,slots=slotIds,report={slotWaiting:[]},mutate=false}={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-audit-'));const source=path.join(dir,'source.json'),deck=path.join(dir,'deck.json'),slotFile=path.join(dir,'slots.json'),reportFile=path.join(dir,'report.json');fs.writeFileSync(source,JSON.stringify(config()));fs.writeFileSync(deck,JSON.stringify(config(slotIds,mutate)));fs.writeFileSync(slotFile,JSON.stringify(Object.fromEntries(slots.map((id,index)=>[`slot ${index}`,id]))));fs.writeFileSync(reportFile,JSON.stringify(report));const args=[script,'--deck',deck,'--source',source,'--slots',slotFile,'--report',reportFile];if(fallbackPages!==undefined)args.push('--fallback-pages',fallbackPages);return spawnSync(process.execPath,args,{encoding:'utf8'})}
test('fallback pages reject relative navigation and missing pages',()=>{let result=run({fallbackPages:'1'});assert.equal(result.status,1);assert.match(result.stdout,/relative navigation/);result=run({fallbackPages:'99'});assert.equal(result.status,1);assert.match(result.stdout,/fallback page 99 is missing/)})
test('requires all sixteen slots and a complete slot-waiting report',()=>{let result=run({slots:slotIds.slice(0,15)});assert.equal(result.status,1);assert.match(result.stdout,/15 unique cue ids/);result=run({report:{}});assert.equal(result.status,1);assert.match(result.stdout,/missing required slotWaiting array/);result=run({report:{slotWaiting:[{}]}});assert.equal(result.status,1);assert.match(result.stdout,/left 1 slot buttons/)})
test('preserves camera action grouping, timing, and values',()=>{const result=run({mutate:true});assert.equal(result.status,1);assert.match(result.stdout,/camera\/action invariant changed/)})
