import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,buildCue,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService,type ReviewReceipt} from '../lib/authoring.ts';
import {cueCategory,cuesWithSlotMarkers,slotCueRegister,slotIndex,useSlotCueRegister} from '../lib/slot-catalog.ts';
import {PORTION_SEPARATOR,SERVICE_TYPES,SLOTS,SLOT_LINE_MAX,hebrewBookFor,slotFieldsFromGraphic,slotFieldsFromText,slotSummary,slotTextFromFields,slotTextProblems,slotsForServiceType} from '../lib/slots.ts';
import type {Cue} from '../lib/player.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const measurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'test-renderer',measuredAt:Date.now()} as const;

type DraftResult={draft:Draft};
type SaveResult={serviceType:string;published:number;slots:Array<{key:string;cueId:string;text:string;published:boolean}>};

/** A slot graphic is an ordinary custom lower third built on the Barechu template. */
async function slotDraft(api:ReturnType<typeof createAuthoringService>,name:string,title:string,text:string){
 const {draft}=await api.operation('create_draft',{name,title,layout:'bottom',templateCueId:BARECHU,content:{mode:'custom',text}},'tester') as DraftResult;
 return draft;
}

function service(){
 const repo=new MemoryAuthoringRepository();
 return {repo,api:createAuthoringService(repo)};
}

test('the slot table is the data the page and the converter both read',()=>{
 assert.equal(SLOTS.length,16,'sixteen slots');
 assert.equal(new Set(SLOTS.map(slot=>slot.key)).size,16,'every key is distinct');
 for(const slot of SLOTS)assert.match(slot.key,/^[a-z][a-z0-9_]{0,39}$/,`${slot.key} can be a Companion variable name`);
 for(const slot of SLOTS)assert.ok(slot.name.length<=80&&!/[<>]/.test(slot.name),`${slot.name} is a name the catalog validator accepts`);
 assert.deepEqual(SERVICE_TYPES.flatMap(type=>type.slotKeys).sort(),SLOTS.map(slot=>slot.key).sort(),'every slot belongs to exactly one service type');
 assert.deepEqual(slotsForServiceType('shabbat').map(slot=>slot.key),['guest_name']);
 assert.equal(slotsForServiceType('bnei-mitzvah').length,12);
 assert.equal(slotsForServiceType('funeral').length,3);
 // A throwaway service type is a change to one table, not a new page.
 assert.deepEqual(slotsForServiceType('no-such-type'),[]);
});

test('a two-line slot joins its fields, dropping a blank one',()=>{
 const students=SLOTS.find(slot=>slot.key==='student_names')!;
 assert.equal(slotTextFromFields(students,['Noa Bogard','Ezra Bogard']),'Noa Bogard\nEzra Bogard');
 assert.deepEqual(slotFieldsFromText(students,'Noa Bogard\nEzra Bogard'),['Noa Bogard','Ezra Bogard']);
 assert.equal(PORTION_SEPARATOR,'·','the separator stays the middle dot the seed drafts use');
 // A blank field is dropped rather than published as an empty line.
 assert.equal(slotTextFromFields(students,['','Ezra']),'Ezra');
 assert.equal(slotTextFromFields(students,['  ','  ']),'','nothing typed is nothing published');
 assert.equal(slotTextFromFields(SLOTS.find(slot=>slot.key==='guest_name')!,['  Noa   Bogard ']),'Noa Bogard');
});

test('a designed slot keeps its fields in place and reads them back from its graphic',()=>{
 const student=SLOTS.find(slot=>slot.key==='student_name')!,torah=SLOTS.find(slot=>slot.key==='torah_1')!,haftarah=SLOTS.find(slot=>slot.key==='haftarah_1')!;
 assert.equal(student.kind,'nameplate');assert.equal(torah.kind,'verses');assert.equal(haftarah.kind,'verses');
 assert.equal(slotTextFromFields(student,['Bat Mitzvah of','Eliana Levine','','Sharon']),'Bat Mitzvah of\nEliana Levine\n\nSharon','a blank keeps its place');
 assert.equal(slotTextFromFields(torah,[' ','']),'','all blank leaves the graphic as it is');
 assert.deepEqual(slotFieldsFromGraphic(student,{title:'Bat Mitzvah of',text:'Eliana Levine\nשָׁרוֹן | Sharon'}),['Bat Mitzvah of','Eliana Levine','שָׁרוֹן','Sharon']);
 assert.deepEqual(slotFieldsFromGraphic(student,{title:'Bar Mitzvah of',text:'Gavin Stein'}),['Bar Mitzvah of','Gavin Stein','','']);
 assert.deepEqual(slotFieldsFromGraphic(torah,{title:'Genesis 1:1-13',accentTitle:'בְּרֵאשִׁית',text:'When God began…'}),['Genesis 1:1-13','בְּרֵאשִׁית']);
 assert.equal(slotSummary(student,{title:'Bat Mitzvah of',text:'Eliana Levine\nשָׁרוֹן | Sharon'}),'Eliana Levine','the deck shows the name');
 assert.equal(slotSummary(torah,{title:'Genesis 1:1-13',accentTitle:'בְּרֵאשִׁית',text:'When God began…'}),'Genesis 1:1-13','the deck shows the verses');
 assert.match(slotTextProblems(student,'Bat Mitzvah of\n\n\n')[0],/type the name/);
 assert.match(slotTextProblems(torah,'\nבְּרֵאשִׁית')[0],/type the verses/);
 assert.match(slotTextProblems(torah,`${'x'.repeat(61)}\n`)[0],/Verses is 61 characters/);
});

test('the Hebrew book name follows the verses',()=>{
 assert.equal(hebrewBookFor('Genesis 1:1-13'),'בְּרֵאשִׁית');
 assert.equal(hebrewBookFor('  exodus 12'),'שְׁמוֹת');
 assert.equal(hebrewBookFor('Lev. 19:1-18'),'וַיִּקְרָא');
 assert.equal(hebrewBookFor('Bamidbar 6:22'),'בְּמִדְבַּר');
 assert.equal(hebrewBookFor('Deuteronomy 6:4'),'דְּבָרִים');
 assert.equal(hebrewBookFor('Isaiah 42:5–21'),'יְשַׁעְיָהוּ');
 assert.equal(hebrewBookFor('1 Samuel 1:1'),'שְׁמוּאֵל א׳');
 assert.equal(hebrewBookFor('II Kings 4:1'),'מְלָכִים ב׳');
 assert.equal(hebrewBookFor('Vayera 18:1'),undefined,'a parashah name is not a book');
});

test('the length guard names the field and says what to do, and an empty slot is never a problem',()=>{
 const guest=SLOTS.find(slot=>slot.key==='guest_name')!;
 assert.deepEqual(slotTextProblems(guest,''),[]);
 assert.deepEqual(slotTextProblems(guest,'Noa Bogard'),[]);
 const long=slotTextProblems(guest,'x'.repeat(SLOT_LINE_MAX+1));
 assert.equal(long.length,1);
 assert.match(long[0],/Guest name is 41 characters; shorten it to 40/);
 const students=SLOTS.find(slot=>slot.key==='student_names')!;
 assert.match(slotTextProblems(students,`a\n${'x'.repeat(50)}`)[0],/line 2/);
 assert.match(slotTextProblems(students,'a\nb\nc')[0],/3 lines; this graphic holds 2/);
 assert.deepEqual(slotTextProblems(SLOTS.find(slot=>slot.key==='student_name')!,''),[],'an empty designed slot is no problem either');
});

test('the register skips anything that could not safely reach a Companion variable',()=>{
 const read=()=>({cues:{student_name:'17db1877-425a-4ea7-b123-664a9756f2ae','Student Name':'25737a2e-167c-4049-81fb-9654cb54a8f1',not_a_slot:'e3624fda-b7ff-44a0-b3ef-7add80524ef7',torah_1:'not-a-uuid'}});
 assert.deepEqual([...slotCueRegister(read)],[['student_name','17db1877-425a-4ea7-b123-664a9756f2ae']]);
 assert.deepEqual([...slotCueRegister(()=>{throw new Error('unreadable')})],[],'an unreadable register is empty, never a failure');
 assert.deepEqual([...slotCueRegister(()=>({}))],[]);
});

test('the slot index reports only slots whose graphic is actually in the catalog',()=>{
 const register=new Map([['student_name','17db1877-425a-4ea7-b123-664a9756f2ae'],['torah_1','e3624fda-b7ff-44a0-b3ef-7add80524ef7']]);
 const cues=[
  {id:'17db1877-425a-4ea7-b123-664a9756f2ae',name:'Student name',layout:'bottom',texts:{textTitle:'Central Reform Congregation',textMain:'Noa Bogard'},animations:[],duration:{}},
  {id:BARECHU,name:'Barechu',layout:'bottom',texts:{textTitle:'Barechu'},animations:[],duration:{}},
 ] as unknown as Cue[];
 assert.deepEqual(slotIndex(cues,register),[{cueId:'17db1877-425a-4ea7-b123-664a9756f2ae',key:'student_name',text:'Noa Bogard'}]);
 // A slot whose text is blank is reported with empty text; a slot with no graphic at all is
 // left out entirely, because "not there" and "there and blank" are different on the deck.
 const blank=[{...cues[0],texts:{textTitle:'Central Reform Congregation'}}] as unknown as Cue[];
 assert.deepEqual(slotIndex(blank,register),[{cueId:'17db1877-425a-4ea7-b123-664a9756f2ae',key:'student_name',text:''}]);
});

test('the envelope marks each cue with a category, and slot cues with their key',()=>{
 const register=new Map([['student_name','17db1877-425a-4ea7-b123-664a9756f2ae']]);
 const cues=[
  {id:'17db1877-425a-4ea7-b123-664a9756f2ae',name:'Student name',layout:'bottom',texts:{},animations:[],duration:{}},
  {id:BARECHU,name:'Barechu',layout:'bottom',texts:{},animations:[],duration:{}},
  {id:'names:abc:01',name:'Mi Shebeirach — 01 of 01',layout:'left',texts:{},animations:[],duration:{}},
 ] as unknown as Cue[];
 const marked=cuesWithSlotMarkers(cues,register);
 assert.deepEqual(marked.map(cue=>cue.category),['names','core_liturgy','names']);
 assert.deepEqual(marked.map(cue=>(cue as {slot?:{key:string}}).slot),[{key:'student_name'},undefined,undefined]);
 assert.equal(cueCategory(cues[1],register),'core_liturgy');
});

test('an empty slot publishes a graphic that draws no text at all',async()=>{
 const {api}=service();
 const draft=await slotDraft(api,'Student name','Central Reform Congregation','Reader Name');
 const filled=buildCue(draft);
 assert.equal(filled.texts.textMain,'Reader Name');
 const {draft:blanked}=await api.operation('update_draft',{draftId:draft.id,expectedVersion:draft.version,patch:{content:{mode:'custom',text:''}}},'tester') as DraftResult;
 const empty=buildCue(blanked);
 assert.equal(empty.texts.textMain,undefined,'no empty main layer is written at all');
 assert.equal(empty.texts.textTitle,'Central Reform Congregation','the title bar is all that is left');
});

test('one Save publishes every changed slot of the service type and nothing else',async()=>{
 const {api}=service();
 const student=await slotDraft(api,'Remember Them 1','Remember Them','Reader Name');
 const torah=await slotDraft(api,'Remember Them 2','Remember Them','Reader Name');
 useSlotCueRegister(new Map([['remember_1',student.id],['remember_2',torah.id]]));
 try{
  const first=await api.operation('save_slots',{serviceType:'funeral',values:{remember_1:'Noa Bogard',remember_2:'Ezra Bogard'}},'tester') as SaveResult;
  assert.equal(first.published,2);
  assert.deepEqual(first.slots.map(slot=>slot.key),['remember_1','remember_2']);

  const cues=(await api.publishedCues()) as Cue[];
  assert.equal(cues.find(cue=>cue.id===student.id)?.texts.textMain,'Noa Bogard');
  assert.equal(slotIndex(cues,new Map([['remember_1',student.id]]))[0]?.text,'Noa Bogard');

  // A second Save that moved one name must not mint a fresh revision of the slot beside it.
  const second=await api.operation('save_slots',{serviceType:'funeral',values:{remember_1:'Ezra Bogard',remember_2:'Ezra Bogard'}},'tester') as SaveResult;
  assert.equal(second.published,1);
  assert.deepEqual(second.slots.map(slot=>slot.published),[true,false]);
  assert.deepEqual((await api.operation('list_revisions',{draftId:torah.id},'tester') as {revisions:unknown[]}).revisions.length,1);

  // Clearing a slot publishes it blank rather than leaving last week's name on air.
  const cleared=await api.operation('save_slots',{serviceType:'funeral',values:{remember_1:''}},'tester') as SaveResult;
  assert.equal(cleared.published,1);
  const after=(await api.publishedCues()) as Cue[];
  assert.equal(after.find(cue=>cue.id===student.id)?.texts.textMain,undefined);
 }finally{useSlotCueRegister(null)}
});

test('a Save that would overflow the layout is refused whole, before anything is published',async()=>{
 const {api}=service();
 const student=await slotDraft(api,'Remember Them 1','Remember Them','Reader Name');
 const torah=await slotDraft(api,'Remember Them 2','Remember Them','Reader Name');
 useSlotCueRegister(new Map([['remember_1',student.id],['remember_2',torah.id]]));
 try{
  await assert.rejects(
   ()=>api.operation('save_slots',{serviceType:'funeral',values:{remember_1:'Noa Bogard',remember_2:'x'.repeat(SLOT_LINE_MAX+1)}},'tester'),
   (error)=>(error as AuthoringError).code==='slot_text_too_long',
  );
  const cues=(await api.publishedCues()) as Cue[];
  assert.equal(cues.length,0,'the good value beside the bad one is not published either');
  await assert.rejects(
   ()=>api.operation('save_slots',{serviceType:'funeral',values:{no_such_slot:'x'}},'tester'),
   (error)=>(error as AuthoringError).code==='unknown_slot',
  );
  await assert.rejects(
   ()=>api.operation('save_slots',{serviceType:'no-such-type',values:{}},'tester'),
   (error)=>(error as AuthoringError).code==='unknown_service_type',
  );
 }finally{useSlotCueRegister(null)}
});

test('a slot whose graphic has not been minted yet is refused by name, not silently skipped',async()=>{
 const {api}=service();
 useSlotCueRegister(new Map());
 try{
  await assert.rejects(
   ()=>api.operation('save_slots',{serviceType:'shabbat',values:{guest_name:'Rabbi Susan Talve'}},'tester'),
   (error)=>(error as AuthoringError).code==='unminted_slot'&&/Guest name/.test((error as AuthoringError).message),
  );
 }finally{useSlotCueRegister(null)}
});

test('the standing approval is recorded on the revision, and buys nothing for anything else',async()=>{
 const {repo,api}=service();
 const student=await slotDraft(api,'Remember Them 1','Remember Them','Reader Name');
 useSlotCueRegister(new Map([['remember_1',student.id]]));
 try{
  await api.operation('save_slots',{serviceType:'funeral',values:{remember_1:'Noa Bogard'}},'tester');
  const revision=(await repo.revisions(student.id))[0]!;
  const review=revision.review as ReviewReceipt;
  assert.equal(review.standingApproval,'slot:remember_1');
  assert.equal(review.browserMeasurement,undefined,'a standing approval never claims a measurement nobody took');
 }finally{useSlotCueRegister(null)}

 // An ordinary graphic still cannot be published without a browser that looked at it.
 const other=await slotDraft(api,'Some other graphic','A title','Some words');
 const preview=await api.operation('preview_draft',{draftId:other.id,expectedVersion:other.version},'tester') as {previewId:string};
 await assert.rejects(
  ()=>api.operation('publish_draft',{draftId:other.id,expectedVersion:other.version,previewId:preview.previewId},'tester'),
  (error)=>(error as AuthoringError).code==='review_required',
 );
 await api.operation('review_draft',{draftId:other.id,expectedVersion:other.version,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'tester');
 await api.operation('publish_draft',{draftId:other.id,expectedVersion:other.version,previewId:preview.previewId},'tester');
});

test('the markers live only inside the envelope: the cues the default response returns are untouched',()=>{
 const register=new Map([['student_name','17db1877-425a-4ea7-b123-664a9756f2ae']]);
 const cues=[
  {id:'17db1877-425a-4ea7-b123-664a9756f2ae',name:'Student name',layout:'bottom',texts:{},animations:[],duration:{}},
  {id:BARECHU,name:'Barechu',layout:'bottom',texts:{},animations:[],duration:{}},
 ] as unknown as Cue[];
 const before=JSON.stringify(cues);
 const marked=cuesWithSlotMarkers(cues,register);
 // `/output`, the console and Companion all validate the bare array field by field, so the
 // default `GET /api/catalog` body has to stay byte for byte what it has always been. The
 // envelope's copies carry the two extra fields; the originals never do.
 assert.equal(JSON.stringify(cues),before,'no marker is written back onto the catalog');
 assert.notEqual(JSON.stringify(marked),before);
 for(const [index,cue] of cues.entries())assert.notEqual(marked[index],cue,'the envelope copies rather than mutates');
});
