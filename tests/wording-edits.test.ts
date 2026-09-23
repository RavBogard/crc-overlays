import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineCues,buildCue,cueHash,sourcePack,type Draft,type LocalVariantContent} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {wordingChanges} from '../lib/wording-changes.ts';
import {createAuthoringMcpHandler} from '../lib/mcp.ts';
import {editableFromForm,emptyForm,formFromDraft,formReady} from '../app/author/editor-state.ts';
import {DEFAULT_WORDING_LABEL,activeWordingEdits,passageWordingFields,revertWordingEdit,setWordingEdit} from '../app/author/wording-edits.ts';
import {groupWordingChanges,wordDiff,type WordingChangeRow} from '../app/author/wording-changes/wording-changes-model.ts';
import type {Draft as ClientDraft,DraftForm,Source} from '../app/author/types.ts';

// The one source in the pack whose blessings carry authorized English: block-2 translates 0+1.
const SOURCE_ID='awakening.birchot-hashachar@legacy-shabbat-morning';
const source=sourcePack.sources.find(item=>item.id===SOURCE_ID)! as unknown as Source;
const block=(n:number)=>source.blocks.find(item=>item.id===`${SOURCE_ID}#block-${n}`)!;
const template=baselineCues.find(cue=>cue.layout==='left')!;
const form=(patch:Partial<DraftForm>={}):DraftForm=>({...emptyForm,name:'Birchot',title:'Birchot HaShachar',layout:'left',templateCueId:template.id,mode:'bilingual',layers:['he','tr'],arrangement:'blocks',groups:[{sourceId:SOURCE_ID,blockIds:[block(0).id,block(1).id,block(3).id]}],...patch});
const field=(f:DraftForm,n:number,channel:'he'|'tr'|'en')=>passageWordingFields(f,source,block(n)).find(item=>item.channel===channel)!;

test('a graphic with no wording edits keeps its exact canonical content',()=>{
 const plain=form();
 const content=editableFromForm(plain).content;
 assert.equal(content.mode,'bilingual');
 // An edit typed back to the siddur's words, or reverted, is not an edit.
 const typedBack=setWordingEdit(setWordingEdit([],field(plain,0,'he'),'x'),field(plain,0,'he'),block(0).he!);
 assert.deepEqual(typedBack,[]);
 const reverted=revertWordingEdit(setWordingEdit([],field(plain,0,'he'),'x'),field(plain,0,'he'));
 assert.deepEqual(editableFromForm({...plain,variantOverrides:reverted}).content,content);
 // Whitespace alone never makes an edit either.
 assert.deepEqual(editableFromForm({...plain,variantOverrides:[{sourceId:SOURCE_ID,blockId:block(0).id,channel:'he',sourceText:block(0).he!,localText:` ${block(0).he!} `}]}).content,content);
});

test('one wording edit saves local-variant content over the canonical selection',()=>{
 const plain=form();
 const edited=form({variantOverrides:setWordingEdit([],field(plain,3,'he'),`${block(3).he}׃`)});
 const content=editableFromForm(edited).content as LocalVariantContent;
 assert.equal(content.mode,'local-variant');
 assert.equal(content.label,DEFAULT_WORDING_LABEL);
 assert.deepEqual(content.base,editableFromForm(plain).content);
 assert.deepEqual(content.overrides,[{sourceId:SOURCE_ID,blockId:block(3).id,channel:'he',sourceText:block(3).he,localText:`${block(3).he}׃`}]);
 assert.equal(formReady(edited),true);
 // A reason is carried when given; a blank edit blocks saving instead of reaching the server.
 assert.equal((editableFromForm({...edited,variantReason:' Misspelled '}).content as LocalVariantContent).reason,'Misspelled');
 assert.equal(formReady(form({variantOverrides:setWordingEdit([],field(plain,3,'he'),'   ')})),false);
});

test('edits for passages no longer selected, or layers no longer shown, are dropped',()=>{
 const plain=form();
 const edits=[...setWordingEdit([],field(plain,3,'he'),'changed'),...setWordingEdit([],field(plain,0,'tr'),'changed tr')];
 const deselected=form({groups:[{sourceId:SOURCE_ID,blockIds:[block(0).id,block(1).id]}],variantOverrides:edits});
 assert.deepEqual(activeWordingEdits(deselected).map(item=>item.blockId),[block(0).id]);
 assert.equal(editableFromForm(form({groups:[{sourceId:SOURCE_ID,blockIds:[block(0).id,block(1).id]}],layers:['he'],variantOverrides:edits})).content.mode,'bilingual');
 // The form still holds them, so checking the passage again before saving brings the edit back.
 assert.equal(activeWordingEdits(form({variantOverrides:deselected.variantOverrides})).length,2);
});

test('an English edit is keyed to the translation block and survives a round trip through the server',async()=>{
 const withEnglish=form({layers:['he','tr','en'],groups:[{sourceId:SOURCE_ID,blockIds:[block(0).id,block(1).id]}]});
 const english=field(withEnglish,0,'en');
 assert.equal(english.blockId,block(2).id);assert.equal(english.passageId,block(0).id);
 assert.equal(passageWordingFields(withEnglish,source,block(1)).some(item=>item.channel==='en'),false,'English belongs to the passage its blessing starts at');
 const edited={...withEnglish,variantOverrides:[...setWordingEdit([],english,'Blessed are You, our God.'),...setWordingEdit([],field(withEnglish,1,'he'),'עברית')]};
 const content=editableFromForm(edited).content as LocalVariantContent;
 assert.deepEqual(content.overrides.map(item=>[item.blockId,item.channel]),[[block(2).id,'en'],[block(1).id,'he']]);
 assert.ok(content.overrides.every(item=>!('passageId' in item)),'the form-only anchor never reaches the server');
 // Unchecking the blessing drops its English edit too.
 assert.deepEqual(activeWordingEdits({...edited,groups:[{sourceId:SOURCE_ID,blockIds:[block(3).id]}]}),[]);

 const service=createAuthoringService(new MemoryAuthoringRepository());
 const created=(await service.operation('create_draft',editableFromForm(edited),'michael') as {draft:Draft}).draft;
 assert.equal(created.content.mode,'local-variant');
 const cue=buildCue(created);
 assert.ok(JSON.stringify(cue).includes('Blessed are You, our God.'));assert.ok(JSON.stringify(cue).includes('עברית'));

 // Opening it again shows the siddur picker on its base selection with the edits loaded.
 const reopened=formFromDraft(created as unknown as ClientDraft);
 assert.equal(reopened.mode,'bilingual');
 assert.deepEqual(reopened.groups,[{sourceId:SOURCE_ID,blockIds:[block(0).id,block(1).id]}]);
 assert.deepEqual(reopened.layers,['he','tr','en']);
 assert.equal(reopened.variantOverrides.find(item=>item.channel==='en')?.passageId,block(0).id);
 assert.deepEqual(editableFromForm(reopened).content,JSON.parse(JSON.stringify(created.content)));
 // Reverting every edit returns it to plain canonical content.
 const plainAgain=editableFromForm({...reopened,variantOverrides:[]}).content;
 assert.deepEqual(plainAgain,(created.content as LocalVariantContent).base);
});

test('an existing canonical draft saves back with identical content and cue hash',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const created=(await service.operation('create_draft',editableFromForm(form()),'michael') as {draft:Draft}).draft;
 const resaved=editableFromForm(formFromDraft(created as unknown as ClientDraft));
 assert.deepEqual(resaved.content,created.content);
 const updated=(await service.operation('update_draft',{draftId:created.id,expectedVersion:created.version,patch:{content:resaved.content}},'michael') as {draft:Draft}).draft;
 // The cue hash carries the draft version, so compare it at the same version: the words and rows are unchanged.
 assert.deepEqual(updated.content,created.content);
 assert.equal(cueHash(buildCue({...updated,version:created.version})),cueHash(buildCue(created)));
});

test('list_wording_changes returns every edited line, archived drafts flagged, with the source beside it',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);
 const plain=form();
 await service.operation('create_draft',editableFromForm(form({name:'Untouched'})),'daniel');
 const edited=(await service.operation('create_draft',editableFromForm(form({name:'Edited',variantReason:'Spelling',variantOverrides:[...setWordingEdit([],field(plain,3,'he'),'מתוקן'),...setWordingEdit([],field(plain,0,'tr'),'Baruch')]})),'michael') as {draft:Draft}).draft;
 const archived=(await service.operation('create_draft',editableFromForm(form({name:'Old',variantOverrides:setWordingEdit([],field(plain,1,'he'),'ישן')})),'michael') as {draft:Draft}).draft;
 await service.operation('archive_draft',{draftId:archived.id,expectedVersion:archived.version},'michael');
 const result=await service.operation('list_wording_changes',{},'daniel') as {changes:ReturnType<typeof wordingChanges>;count:number};
 assert.equal(result.count,3);
 assert.deepEqual(result.changes.map(row=>[row.draftName,row.blockNumber,row.channel]),[['Edited',1,'tr'],['Old',2,'he'],['Edited',4,'he']]);
 const row=result.changes.find(item=>item.channel==='he'&&item.draftId===edited.id)!;
 assert.equal(row.sourceText,block(3).he);assert.equal(row.localText,'מתוקן');assert.equal(row.reason,'Spelling');assert.equal(row.label,DEFAULT_WORDING_LABEL);
 assert.equal(row.sourceId,SOURCE_ID);assert.equal(row.sourceName,source.name);assert.equal(row.published,false);assert.equal(row.archived,false);assert.equal(row.updatedBy,'michael');
 assert.equal(result.changes.find(item=>item.draftId===archived.id)!.archived,true);
 // The source is never touched by a wording edit.
 assert.equal(sourcePack.sources.find(item=>item.id===SOURCE_ID)!.blocks.find(item=>item.id===block(3).id)!.he,block(3).he);
 await assert.rejects(service.operation('list_wording_changes',{draftId:'x'},'daniel'));
 // The page groups the rows by source and shows the change a word at a time.
 assert.equal(groupWordingChanges(result.changes as WordingChangeRow[]).length,1);
});

test('wordDiff marks only the words that changed',()=>{
 assert.deepEqual(wordDiff('בָּרוּךְ אַתָּה יְיָ','בָּרוּךְ אתה יְיָ'),[{text:'בָּרוּךְ ',kind:'same'},{text:'אַתָּה ',kind:'removed'},{text:'אתה ',kind:'added'},{text:'יְיָ',kind:'same'}]);
 assert.deepEqual(wordDiff('same','same'),[{text:'same',kind:'same'}]);
});

const mcpRequest=(body:unknown)=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(body)});
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}};
async function payload(response:Response){const text=await response.text();if(response.headers.get('content-type')?.includes('application/json'))return JSON.parse(text);const data=text.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);assert.ok(data);return JSON.parse(data)}

test('MCP exposes list_wording_changes as a read-only tool with no arguments',async()=>{
 const calls:{operation:string;input:unknown;actor:string}[]=[];
 const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push({operation,input,actor});return {changes:[],count:0}});
 const listed=await payload(await handler.fetch(mcpRequest({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),{authInfo})) as {result:{tools:{name:string;annotations?:{readOnlyHint?:boolean};inputSchema:{properties?:Record<string,unknown>}}[]}};
 const tool=listed.result.tools.find(item=>item.name==='list_wording_changes');
 assert.ok(tool);assert.equal(tool.annotations?.readOnlyHint,true);assert.deepEqual(Object.keys(tool.inputSchema.properties??{}),[]);
 const called=await payload(await handler.fetch(mcpRequest({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list_wording_changes',arguments:{}}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(called.result.content[0].text,/"count":\s*0/);
 assert.deepEqual(calls,[{operation:'list_wording_changes',input:{},actor:'mcp:test-actor'}]);
});
