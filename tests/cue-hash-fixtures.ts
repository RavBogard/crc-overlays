// The published-cue fixtures behind tests/layout-pinning.test.ts: every importable baseline cue
// rebuilt through buildCue, and a custom graphic in each built-in layout. Their hashes were
// recorded in tests/fixtures/cue-hashes.json before packet L2 (layouts as data) changed buildCue,
// so a built-in cue whose bytes move - and whose pin therefore breaks - fails the test.
// Regenerate only on purpose: CUE_HASH_FIXTURES=write node node_modules/tsx/dist/cli.mjs tests/cue-hash-fixtures.ts
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {baselineCues,buildCue,cueHash,editableFromBaseline,sourcePinFor,type Draft,type EditableDraft} from '../lib/authoring-model.ts';
import {composeAuthoringCatalog} from '../lib/server.ts';

const draftOf=(editable:EditableDraft,id:string):Draft=>({...editable,id,version:3,sourcePin:sourcePinFor(editable.content),activeRevision:2,activeDraftVersion:2,createdAt:0,updatedAt:0,createdBy:'fixture',updatedBy:'fixture'});
const templateOf=(layout:string)=>baselineCues.find(cue=>cue.layout===layout&&!cue.hidden)!.id;

export function fixtureCues(){
 const cues=[];
 for(const baseline of baselineCues){
  let editable:EditableDraft;
  try{editable=editableFromBaseline(baseline.id)}catch{continue}
  cues.push(buildCue(draftOf(editable,baseline.id)));
 }
 for(const [layout,template] of [['bottom','bottom'],['left','left'],['right','right'],['corner','bottom']] as const){
  const editable:EditableDraft={name:`Custom ${layout}`,title:'Response',accentTitle:layout==='corner'?'מִי שֶׁבֵּרַךְ':undefined,layout,templateCueId:templateOf(template),content:{mode:'custom',text:'Vaimru Amen'},presentation:layout==='left'?{hebrewFontSize:40,alignment:'center'}:{}};
  cues.push(buildCue(draftOf(editable,`custom-${layout}`)));
 }
 return cues;
}
export function fixtureHashes(){
 const cues=fixtureCues();
 return {cues:Object.fromEntries(cues.map(cue=>[cue.id,cueHash(cue)])),catalogVersion:composeAuthoringCatalog([],cues).version};
}

if(process.env.CUE_HASH_FIXTURES==='write'&&process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 writeFileSync(new URL('./fixtures/cue-hashes.json',import.meta.url),JSON.stringify(fixtureHashes(),null,1)+'\n');
}
