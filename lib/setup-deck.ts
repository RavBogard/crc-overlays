/**
 * What the Setup page reads from the stored deck (GET /api/setup/deck): whether the deck is ready to
 * download (validate_deck clean, style included), its version, date, page and key count, the connection
 * labels it matches by, and the three test keys by page and position. Pure below `loadSetupDeck`.
 */
import type {CompanionDeck, DeckButton} from './companion-deck/model.ts';
import type {StoredDeck} from './companion-deck/repository.ts';
import type {ValidationResult} from './companion-deck/validate.ts';
import type {SetupFlow, TestPick} from './setup-flow';

export type CueFacts={name:string;layout?:string};
export type TestKey={what:string;found:boolean;page?:number;pageName?:string;row?:number;col?:number;label?:string};
export type SetupDeckSummary={
 ready:boolean;
 /** Why the download is locked, in the validator's own sentences (at most five). */
 reasons:string[];
 errorCount:number;
 deck:{version:number;updatedAt:number;pages:number;keys:number;release:string};
 connections:{label:string;moduleId:string;version:string}[];
 overlaysVersion:string|null;
 tests:TestKey[];
};

const byColumn=(a:DeckButton,b:DeckButton)=>a.col-b.col||a.row-b.row;

/** The first cue key, in page order and then column by column (liturgical order), that fits the pick. */
export function pickTestKey(deck:CompanionDeck,pick:TestPick,cues:ReadonlyMap<string,CueFacts>,slotNames:ReadonlySet<string>):TestKey{
 for(const page of [...deck.pages].sort((a,b)=>a.number-b.number)){
  if(pick.pageName!==undefined&&page.name!==pick.pageName)continue;
  if(pick.pages&&(page.number<pick.pages[0]||page.number>pick.pages[1]))continue;
  for(const button of [...page.buttons].sort(byColumn)){
   const spec=button.spec;
   if(spec.kind!=='cue')continue;
   const cue=cues.get(spec.cueId);
   if(!cue)continue;
   if(pick.layout!==undefined&&cue.layout!==pick.layout)continue;
   if(pick.sequence&&!(spec.sequence&&spec.sequence.index===1&&spec.sequence.count>=2))continue;
   if(pick.slot&&!slotNames.has(cue.name))continue;
   return {what:pick.what,found:true,page:page.number,pageName:page.name,row:button.row,col:button.col,label:spec.label};
  }
 }
 return {what:pick.what,found:false};
}

export function setupDeckSummary(stored:StoredDeck,validation:ValidationResult,flow:SetupFlow,cues:ReadonlyMap<string,CueFacts>,slotNames:ReadonlySet<string>):SetupDeckSummary{
 const deck=stored.deck;
 const errors=validation.findings.filter(finding=>finding.severity==='error');
 const rendered=validation.exported?Object.values(validation.exported.instances).map(c=>({label:String(c.label),moduleId:String(c.moduleId),version:String(c.moduleVersionId??'')})):deck.connections.map(c=>({label:c.label,moduleId:c.moduleId,version:c.moduleVersionId}));
 const picks=flow.steps.flatMap(step=>step.blocks).flatMap(block=>block.kind==='press-test'?block.picks:[]);
 return {
  ready:errors.length===0&&validation.exported!==null,
  reasons:errors.slice(0,5).map(finding=>finding.message),
  errorCount:errors.length,
  deck:{version:stored.version,updatedAt:stored.updatedAt,pages:deck.pages.filter(page=>page.buttons.length>0).length,keys:deck.pages.reduce((n,page)=>n+page.buttons.length,0),release:deck.companion.release},
  connections:rendered.sort((a,b)=>a.label.localeCompare(b.label)),
  overlaysVersion:deck.connections.find(c=>c.role==='overlays')?.moduleVersionId??null,
  tests:picks.map(pick=>pickTestKey(deck,pick,cues,slotNames)),
 };
}

/** The deployment's deck, validated, with the published cues' layouts for the test picks. */
export async function loadSetupDeck(flow:SetupFlow){
 const [{validatedDeck},{authoringCatalog},{SLOTS}]=await Promise.all([import('./companion-deck/tools'),import('./server'),import('./slots')]);
 const [{stored,validation},catalog]=await Promise.all([validatedDeck(),authoringCatalog()]);
 const cues=new Map<string,CueFacts>(catalog.cues.map(cue=>[cue.id,{name:cue.name,layout:cue.layout}]));
 return setupDeckSummary(stored,validation,flow,cues,new Set(SLOTS.map(slot=>slot.name)));
}
