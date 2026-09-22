#!/usr/bin/env node
// Read-only gate for a generated rehearsal deck. It deliberately does not import into Companion.
import fs from 'node:fs'
import zlib from 'node:zlib'

const args=Object.fromEntries(process.argv.slice(2).reduce((out,arg,index,list)=>arg.startsWith('--')?[...out,[arg.slice(2),list[index+1]]]:out,[]))
for(const key of ['deck','slots','report','source'])if(!args[key])throw Error(`Missing --${key}`)
const read=file=>{const bytes=fs.readFileSync(file);const text=bytes[0]===0x1f&&bytes[1]===0x8b?zlib.gunzipSync(bytes):bytes;return JSON.parse(text)}
const cue=value=>value&&typeof value==='object'&&'value'in value?value.value:value
const actions=control=>Object.values(control?.steps??{}).flatMap(step=>Object.values(step?.action_sets??{}).flat())
const cameraActions=control=>actions(control).filter(action=>!['animateIn','animateOut','takeOutAllOutput','toggle_cue','show_cue','animate_out','clear_now'].includes(action?.definitionId)).map(({id,upgradeIndex,...action})=>action)
const cells=(config,page)=>Object.entries(config.pages?.[String(page)]?.controls??{}).flatMap(([row,columns])=>Object.entries(columns??{}).map(([column,control])=>({row,column,control})))
const deck=read(args.deck), source=read(args.source), slots=read(args.slots), report=read(args.report)
const required=Object.values(slots).map(item=>typeof item==='string'?item:item?.cueId).filter(Boolean)
const unique=[...new Set(required)]
const seen=new Set(Object.values(deck.pages??{}).flatMap(page=>cells({pages:{x:page}},'x')).flatMap(({control})=>actions(control)).filter(action=>['toggle_cue','show_cue','animate_out'].includes(action?.definitionId)).map(action=>cue(action.options?.cue)).filter(Boolean))
const failures=[]
if(unique.length!==16)failures.push(`slot map has ${unique.length} unique cue ids; expected 16`)
const missing=unique.filter(id=>!seen.has(id));if(missing.length)failures.push(`deck omits ${missing.length} slot cue ids`)
if((report.slotWaiting??[]).length)failures.push(`converter left ${report.slotWaiting.length} slot buttons on Singular`)
for(const page of ['76','77','78']){
 const before=cells(source,page),after=cells(deck,page)
 for(const item of before){const original=cameraActions(item.control);if(!original.length)continue;const match=after.find(next=>next.row===item.row&&next.column===item.column);if(!match||JSON.stringify(cameraActions(match.control))!==JSON.stringify(original))failures.push(`camera/action invariant changed at page ${page} r${item.row}c${item.column}`)}
}
for(const page of String(args.fallbackPages??'').split(',').filter(Boolean))for(const {row,column,control} of cells(deck,page))if(control?.type==='pageup'||control?.type==='pagedown')failures.push(`fallback page ${page} has relative navigation at r${row}c${column}`)
const manifest={label:'PROVISIONAL — not Michael-ready',deck:args.deck,slots:args.slots,report:args.report,requiredSlotCueIds:unique,missingSlotCueIds:missing,fallbackPages:String(args.fallbackPages??'').split(',').filter(Boolean),failures}
if(args.out)fs.writeFileSync(args.out,JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest,null,2));process.exitCode=failures.length?1:0
