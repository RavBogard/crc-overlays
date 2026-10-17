import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring.ts';
import {MemoryBuildKeyRepository} from '../lib/build-keys.ts';
import {useSlotCueRegister} from '../lib/slot-catalog.ts';
import {resolvedSlotRegister} from '../lib/slot-bindings.ts';

// Oct 16: a slot fills a graphic designed in the Library, keeping its look; This service writes
// only the slot's fields into it and publishes through the fit check.
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const LEFT='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
const passing:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test'});
const failing:ServerFitRunner=async()=>({verdict:'fail',fitErrors:['textTitle does not fit its box.'],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test'});

function service(fit:ServerFitRunner=passing){
 const repo=new MemoryAuthoringRepository(),buildKeys=new MemoryBuildKeyRepository();
 let runner=fit;
 const api=createAuthoringService(repo,undefined,undefined,async()=>undefined,(cue,options)=>runner(cue,options),undefined,undefined,undefined,undefined,{buildKeys});
 return {repo,api,buildKeys,setFit:(next:ServerFitRunner)=>{runner=next}};
}
async function published(api:ReturnType<typeof service>['api'],input:Record<string,unknown>){
 const {draft}=await api.operation('create_draft',input,'tester') as {draft:Draft};
 const shipped=await api.operation('ship_draft',{draftId:draft.id,expectedVersion:draft.version},'tester') as {shipped:boolean};
 assert.equal(shipped.shipped,true,`fixture ${String(input.name)} publishes`);
 return draft;
}

test('a slot points at a graphic from the Library, and that choice wins over the committed one',async()=>{
 const {api,buildKeys}=service();
 const plate=await published(api,{name:'Student Name Plate',title:'Bat Mitzvah of',layout:'nameplate',templateCueId:BARECHU,content:{mode:'custom',text:'Eliana Levine\nשָׁרוֹן | Sharon'},presentation:{alignment:'center'}});
 useSlotCueRegister(new Map([['student_name','17db1877-425a-4ea7-b123-664a9756f2ae']]));
 try{
  const bound=await api.operation('bind_slot',{key:'student_name',cueId:plate.id},'tester') as {message:string};
  assert.match(bound.message,/Student name now fills "Student Name Plate"/);
  assert.equal((await resolvedSlotRegister(buildKeys)).get('student_name'),plate.id);
  const listed=await api.operation('list_slots',{serviceType:'bnei-mitzvah',includeCandidates:true},'tester') as {slots:{key:string;cueId:string;text:string;graphicName:string}[];candidates:{id:string}[]};
  const slot=listed.slots.find(item=>item.key==='student_name')!;
  assert.equal(slot.cueId,plate.id);assert.equal(slot.graphicName,'Student Name Plate');
  assert.equal(slot.text,'Bat Mitzvah of\nEliana Levine\nשָׁרוֹן\nSharon','the page opens on what the graphic says');
  assert.ok(listed.candidates.some(candidate=>candidate.id===plate.id));
 }finally{useSlotCueRegister(null)}
});

test('choosing refuses what a slot cannot fill',async()=>{
 const {api}=service();
 const {draft:unpublished}=await api.operation('create_draft',{name:'Draft plate',title:'Bar Mitzvah of',layout:'nameplate',templateCueId:BARECHU,content:{mode:'custom',text:'Gavin'},presentation:{}},'tester') as {draft:Draft};
 await assert.rejects(()=>api.operation('bind_slot',{key:'student_name',cueId:unpublished.id},'tester'),(error)=>(error as AuthoringError).code==='unpublished_graphic');
 const lines=await published(api,{name:'Lines',title:'Words',layout:'left',templateCueId:LEFT,content:{mode:'custom',rows:[{he:'שָׁלוֹם',tr:'Shalom'}]},presentation:{}});
 await assert.rejects(()=>api.operation('bind_slot',{key:'student_name',cueId:lines.id},'tester'),(error)=>(error as AuthoringError).code==='slot_graphic_unsuitable');
 await api.operation('bind_slot',{key:'torah_1',cueId:lines.id},'tester');
 await assert.rejects(()=>api.operation('bind_slot',{key:'no_such',cueId:lines.id},'tester'),(error)=>(error as AuthoringError).code==='unknown_slot');
});

test('Save writes the name plate and the reading into their own graphics, keeping their design',async()=>{
 const {api,repo}=service();
 const plate=await published(api,{name:'Student Name Plate',title:'Bat Mitzvah of',layout:'nameplate',templateCueId:BARECHU,content:{mode:'custom',text:'Eliana Levine'},presentation:{alignment:'center',largePrint:true}});
 const reading=await published(api,{name:'Torah Reading 1',title:'Genesis 1:1-13',accentTitle:'בְּרֵאשִׁית',layout:'left',templateCueId:LEFT,content:{mode:'custom',text:'When God began to create heaven and earth…'},presentation:{verticalAlignment:'top'}});
 await api.operation('bind_slot',{key:'student_name',cueId:plate.id},'tester');
 await api.operation('bind_slot',{key:'torah_1',cueId:reading.id},'tester');
 const saved=await api.operation('save_slots',{serviceType:'bnei-mitzvah',values:{student_name:'Bar Mitzvah of\nGavin Stein\nבֶּנְיָה פְּרֶעֵל\nBenyah P\'re-eil',torah_1:'Exodus 12:1-20\nשְׁמוֹת'}},'tester') as {published:number;refused?:unknown[]};
 assert.equal(saved.published,2);assert.equal(saved.refused,undefined);
 const plateNow=(await repo.getDraft(plate.id))!;
 assert.equal(plateNow.title,'Bar Mitzvah of');
 assert.deepEqual(plateNow.content,{mode:'custom',text:'Gavin Stein\nבֶּנְיָה פְּרֶעֵל | Benyah P\'re-eil'});
 assert.equal(plateNow.layout,'nameplate');assert.deepEqual(plateNow.presentation,plate.presentation,'its look is untouched');assert.equal(plateNow.presentation.alignment,'center');
 assert.equal(plateNow.activeDraftVersion,plateNow.version,'published');
 const readingNow=(await repo.getDraft(reading.id))!;
 assert.equal(readingNow.title,'Exodus 12:1-20');assert.equal(readingNow.accentTitle,'שְׁמוֹת');
 assert.deepEqual(readingNow.content,{mode:'custom',text:'When God began to create heaven and earth…'},'the reading text stays as authored');
 // Unchanged words publish nothing, and an empty designed slot leaves its graphic alone.
 const again=await api.operation('save_slots',{serviceType:'bnei-mitzvah',values:{student_name:'Bar Mitzvah of\nGavin Stein\nבֶּנְיָה פְּרֶעֵל\nBenyah P\'re-eil',torah_1:''}},'tester') as {published:number};
 assert.equal(again.published,0);
 assert.equal((await repo.getDraft(reading.id))!.title,'Exodus 12:1-20');
});

test('words that do not fit are refused by name, and the graphic is put back as it was',async()=>{
 const {api,repo,setFit}=service();
 const reading=await published(api,{name:'Torah Reading 2',title:'Genesis 1:6-8',accentTitle:'בְּרֵאשִׁית',layout:'left',templateCueId:LEFT,content:{mode:'custom',text:'God said…'},presentation:{}});
 const plate=await published(api,{name:'Student Name Plate',title:'Bat Mitzvah of',layout:'nameplate',templateCueId:BARECHU,content:{mode:'custom',text:'Eliana Levine'},presentation:{}});
 await api.operation('bind_slot',{key:'torah_2',cueId:reading.id},'tester');
 await api.operation('bind_slot',{key:'student_name',cueId:plate.id},'tester');
 const before=(await repo.getDraft(reading.id))!;
 setFit(async(cue,options)=>cue.id===reading.id?failing(cue,options):passing(cue,options));
 const saved=await api.operation('save_slots',{serviceType:'bnei-mitzvah',values:{torah_2:'Genesis 1:6-8 and a great many more words\nבְּרֵאשִׁית',student_name:'Bat Mitzvah of\nNoa Bogard\n\n'}},'tester') as {published:number;refused:{key:string;message:string}[]};
 assert.equal(saved.published,1,'the one that fits still saves');
 assert.deepEqual(saved.refused.map(item=>item.key),['torah_2']);
 assert.match(saved.refused[0].message,/Torah reading 2 was not saved: textTitle does not fit its box\./);
 const after=(await repo.getDraft(reading.id))!;
 assert.equal(after.title,before.title,'the library still says what is on screen');
 assert.equal((await repo.getDraft(plate.id))!.content.mode==='custom'&&((await repo.getDraft(plate.id))!.content as {text:string}).text,'Noa Bogard');
});
