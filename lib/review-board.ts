import {randomBytes} from 'node:crypto';
import type {AuthoringRepository,StoredFitImageInfo} from './authoring';
import {AuthoringError,type Draft} from './authoring-model';
import type {CompanionDeck} from './companion-deck/model';
import {canonicalOrigin} from './oauth-core';

/**
 * T4 - the review board. An agent puts a set of published graphics in front of a person (Simone
 * reviewing TBI's redone deck) on one web page: per graphic the picture the server fit captured
 * for the live revision, the old slide's text when there is one, and Approve / Needs change with a
 * note, saved as the reviewer clicks. The agent reads the answers back with get_review_board.
 *
 * Storage (db/review-boards.sql): the board document holds the items and their grouping; each
 * reviewer answer is its own row, so a click never conflicts with the agent adding items.
 *
 * Updated-item rule (T4 GATE): an answer records the revision the reviewer looked at. When the
 * graphic is republished (or rolled back) after that, the item reads as undecided again and
 * "Updated since you looked", with the earlier answer and note kept beside it as `earlier`, so
 * nothing the reviewer said is lost and nothing stale reads as approved.
 */
export type ReviewGrouping='deck-page'|'service'|'none';
/** What the old deck showed, as T3 attaches it to conversion rows and drafts (`reference`). */
export type ReviewReference={origin:string;app?:string;comp?:string;text:string;imageAssetId?:string};
export type ReviewItem={key:string;draftId:string;groupLabel:string;groupSort:number[];itemSort:number[];reference?:ReviewReference;addedAt:number;addedBy:string};
export type ReviewBoard={id:string;title:string;grouping:ReviewGrouping;version:number;items:ReviewItem[];createdAt:number;updatedAt:number;createdBy:string;updatedBy:string};
export type ReviewDecisionValue='approve'|'needs-change';
type AnswerCore={decision:ReviewDecisionValue|null;note:string;revision:number|null;decidedAt:number;decidedBy:string};
export type ReviewAnswer=AnswerCore&{itemKey:string;previous?:AnswerCore};

export interface ReviewBoardRepository{
 insertBoard(board:ReviewBoard):Promise<void>;
 getBoard(id:string):Promise<ReviewBoard|null>;
 /** Replace the board when its stored version is still `expectedVersion`; false on a conflict. */
 replaceBoard(board:ReviewBoard,expectedVersion:number):Promise<boolean>;
 answers(boardId:string):Promise<ReviewAnswer[]>;
 saveAnswer(boardId:string,answer:ReviewAnswer):Promise<void>;
 deleteAnswers(boardId:string,itemKeys:string[]):Promise<void>;
}

const clone=<T>(value:T):T=>structuredClone(value);
export class MemoryReviewBoardRepository implements ReviewBoardRepository{
 boards=new Map<string,ReviewBoard>();answerRows=new Map<string,Map<string,ReviewAnswer>>();
 async insertBoard(board:ReviewBoard){if(this.boards.has(board.id))throw new Error('duplicate');this.boards.set(board.id,clone(board))}
 async getBoard(id:string){const board=this.boards.get(id);return board?clone(board):null}
 async replaceBoard(board:ReviewBoard,expectedVersion:number){const current=this.boards.get(board.id);if(!current||current.version!==expectedVersion)return false;this.boards.set(board.id,clone(board));return true}
 async answers(boardId:string){return [...(this.answerRows.get(boardId)?.values()??[])].map(clone)}
 async saveAnswer(boardId:string,answer:ReviewAnswer){const rows=this.answerRows.get(boardId)??new Map<string,ReviewAnswer>();rows.set(answer.itemKey,clone(answer));this.answerRows.set(boardId,rows)}
 async deleteAnswers(boardId:string,itemKeys:string[]){const rows=this.answerRows.get(boardId);for(const key of itemKeys)rows?.delete(key)}
}

type Queryable={query:(text:string,values?:unknown[])=>Promise<{rows:unknown[];rowCount:number|null}>};
const missingTable=(error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:unknown}).code==='42P01');
const NOT_SET_UP='Review boards are not set up on this server yet (db/review-boards.sql has not been applied). Nothing was changed.';
async function guarded<T>(run:()=>Promise<T>):Promise<T>{try{return await run()}catch(error){if(missingTable(error))throw new AuthoringError('review_boards_unavailable',NOT_SET_UP,503);throw error}}
export class PgReviewBoardRepository implements ReviewBoardRepository{
 constructor(private connection?:Queryable){}
 private async db():Promise<Queryable>{return this.connection??(await import('./database')).db}
 async insertBoard(board:ReviewBoard){await guarded(async()=>(await this.db()).query('INSERT INTO review_boards(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[board.id,board,board.version,board.createdAt,board.updatedAt,board.createdBy,board.updatedBy]))}
 async getBoard(id:string){return guarded(async()=>{const r=await (await this.db()).query('SELECT document FROM review_boards WHERE id=$1',[id]);return (r.rows[0] as {document:ReviewBoard}|undefined)?.document??null})}
 async replaceBoard(board:ReviewBoard,expectedVersion:number){return guarded(async()=>{const r=await (await this.db()).query('UPDATE review_boards SET document=$2,version=$3,updated_at=$4,updated_by=$5 WHERE id=$1 AND version=$6',[board.id,board,board.version,board.updatedAt,board.updatedBy,expectedVersion]);return Boolean(r.rowCount)})}
 async answers(boardId:string){return guarded(async()=>(await (await this.db()).query('SELECT document FROM review_board_answers WHERE board_id=$1',[boardId])).rows.map(row=>(row as {document:ReviewAnswer}).document))}
 async saveAnswer(boardId:string,answer:ReviewAnswer){await guarded(async()=>(await this.db()).query('INSERT INTO review_board_answers(board_id,item_key,document,decided_at,decided_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(board_id,item_key) DO UPDATE SET document=EXCLUDED.document,decided_at=EXCLUDED.decided_at,decided_by=EXCLUDED.decided_by',[boardId,answer.itemKey,answer,answer.decidedAt,answer.decidedBy]))}
 async deleteAnswers(boardId:string,itemKeys:string[]){if(!itemKeys.length)return;await guarded(async()=>(await this.db()).query('DELETE FROM review_board_answers WHERE board_id=$1 AND item_key=ANY($2::text[])',[boardId,itemKeys]))}
}

// Local rehearsal keeps boards in memory, as authoring does; the instance lives on globalThis so
// every route bundle of one dev server sees the same boards.
const memoryHolder=globalThis as unknown as {crcReviewBoards?:MemoryReviewBoardRepository};
export function defaultReviewBoardRepository():ReviewBoardRepository{
 if(process.env.CRC_AUTHORING_REHEARSAL==='1')return memoryHolder.crcReviewBoards??=new MemoryReviewBoardRepository();
 return new PgReviewBoardRepository();
}

/* ---------- grouping ---------- */

/** Where a graphic sits on the stored Companion deck: its lowest page, then row and column. */
export type DeckPlacement={page:number;pageName:string;row:number;col:number};
/** null means no deck is stored for this congregation yet. C3 supplies the stored deck; until then grouping by deck page takes `groupLabels`. */
export type DeckPlacementLookup=(cueIds:string[])=>Promise<Map<string,DeckPlacement>|null>;
export type ServicePlacement={serviceName:string;serviceOrder:number;row:number};
export type ServicePlacementLookup=(cueIds:string[])=>Promise<Map<string,ServicePlacement>>;

/** Every cue button's placement on a deck, first (lowest) page wins. Pure; the lookup C3 wires reads the stored deck through it. */
export function deckPlacements(deck:Pick<CompanionDeck,'pages'>):Map<string,DeckPlacement>{
 const found=new Map<string,DeckPlacement>();
 for(const page of [...deck.pages].sort((a,b)=>a.number-b.number))for(const button of [...page.buttons].sort((a,b)=>a.row-b.row||a.col-b.col)){
  if(button.spec.kind!=='cue'||found.has(button.spec.cueId))continue;
  found.set(button.spec.cueId,{page:page.number,pageName:page.name,row:button.row,col:button.col});
 }
 return found;
}
export const deckLookupFromDeck=(deck:Pick<CompanionDeck,'pages'>|null):DeckPlacementLookup=>async()=>deck?deckPlacements(deck):null;

/** Prepared services by name; a graphic in several goes under the first, in that service's order. */
export const defaultServiceLookup:ServicePlacementLookup=async()=>{
 const {defaultServicesRepository,preparedService}=await import('./service-collections');
 const services=(await defaultServicesRepository().listCollections(false)).map(preparedService).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 const found=new Map<string,ServicePlacement>();
 services.forEach((service,serviceOrder)=>{
  const entries=new Map(service.entries.map(entry=>[entry.id,entry])),coverage=new Map(service.coverage.map(item=>[item.id,item]));
  service.rows.forEach((row,index)=>{
   const ids=[...(row.entryId?entries.get(row.entryId)?.cueIds??[]:[]),...(row.coverageId&&coverage.get(row.coverageId)?.cueId?[coverage.get(row.coverageId)!.cueId!]:[])];
   for(const id of ids)if(!found.has(id))found.set(id,{serviceName:service.name,serviceOrder,row:index});
  });
 });
 return found;
};

export type ReviewBoardContext={authoring:AuthoringRepository;boards?:ReviewBoardRepository;deck?:DeckPlacementLookup;services?:ServicePlacementLookup;now?:()=>number;origin?:string};
export const boardsOf=(ctx:ReviewBoardContext)=>ctx.boards??defaultReviewBoardRepository();
const nowOf=(ctx:ReviewBoardContext)=>(ctx.now??Date.now)();

// Group headings are shown to the reviewer, so they are plain words.
export const NOT_ON_DECK='Not on the deck yet';
export const NOT_IN_SERVICE='Not in a prepared service';
export const OTHER_GRAPHICS='Other graphics';
const LAST=[9,0];

type Placed={groupLabel:string;groupSort:number[];itemSort:number[]};
async function placeItems(draftIds:string[],grouping:ReviewGrouping,labels:Record<string,string>|undefined,existing:ReviewItem[],ctx:ReviewBoardContext):Promise<Map<string,Placed>>{
 const base=existing.length,placed=new Map<string,Placed>();
 const existingGroup=new Map(existing.map(item=>[item.groupLabel,item.groupSort]));
 const sortFor=(label:string,fallback:number[])=>existingGroup.get(label)??fallback;
 if(labels&&Object.keys(labels).length){
  const firstSeen=new Map<string,number>();
  draftIds.forEach((id,index)=>{const label=labels[id];if(label&&!firstSeen.has(label))firstSeen.set(label,index)});
  draftIds.forEach((id,index)=>{const label=labels[id];placed.set(id,label?{groupLabel:label,groupSort:sortFor(label,[0,base+firstSeen.get(label)!]),itemSort:[base+index]}:{groupLabel:OTHER_GRAPHICS,groupSort:sortFor(OTHER_GRAPHICS,LAST),itemSort:[base+index]})});
  return placed;
 }
 if(grouping==='none'){draftIds.forEach((id,index)=>placed.set(id,{groupLabel:'',groupSort:[0,0],itemSort:[base+index]}));return placed}
 if(grouping==='deck-page'){
  const found=ctx.deck?await ctx.deck(draftIds):null;
  if(!found)throw new AuthoringError('no_deck','No Companion deck is stored for this congregation yet, so graphics can\'t be grouped by deck page. Nothing was created. Pass groupLabels (each draft id to its page, for example "Page 3: Shabbat evening"), or use grouping \'service\' or \'none\'.',409);
  draftIds.forEach((id,index)=>{const spot=found.get(id);placed.set(id,spot?{groupLabel:spot.pageName?`Page ${spot.page}: ${spot.pageName}`:`Page ${spot.page}`,groupSort:[1,spot.page],itemSort:[spot.row,spot.col,base+index]}:{groupLabel:NOT_ON_DECK,groupSort:sortFor(NOT_ON_DECK,LAST),itemSort:[base+index]})});
  return placed;
 }
 const found=await (ctx.services??defaultServiceLookup)(draftIds);
 draftIds.forEach((id,index)=>{const spot=found.get(id);placed.set(id,spot?{groupLabel:spot.serviceName,groupSort:sortFor(spot.serviceName,[1,spot.serviceOrder]),itemSort:[spot.row,base+index]}:{groupLabel:NOT_IN_SERVICE,groupSort:sortFor(NOT_IN_SERVICE,LAST),itemSort:[base+index]})});
 return placed;
}
const compareSort=(a:number[],b:number[])=>{for(let index=0;index<Math.max(a.length,b.length);index++){const d=(a[index]??-1)-(b[index]??-1);if(d)return d}return 0};
export const orderedItems=(items:ReviewItem[])=>[...items].sort((a,b)=>compareSort(a.groupSort,b.groupSort)||a.groupLabel.localeCompare(b.groupLabel)||compareSort(a.itemSort,b.itemSort));

/* ---------- validation ---------- */

const fail=(message:string,code='invalid_input',status=400)=>new AuthoringError(code,message,status);
const MAX_ITEMS=400;
const text=(value:unknown,label:string,max:number,min=1)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max)throw fail(`${label} must be ${min}-${max} characters`);return value.trim()};
const draftIdList=(value:unknown,label:string,max=MAX_ITEMS)=>{if(!Array.isArray(value)||value.length<1||value.length>max)throw fail(`${label} must list 1-${max} draft ids`);const ids=value.map((item,index)=>text(item,`${label}[${index}]`,200));if(new Set(ids).size!==ids.length)throw fail(`${label} must not repeat a draft id`);return ids};
const ASSET_ID=/^asset_[a-f0-9]{64}$/;
/** A reference as T3 will store it; anything malformed is ignored when read from a draft and refused when passed in. */
export function parseReference(value:unknown,strict:boolean):ReviewReference|undefined{
 if(value===undefined||value===null)return undefined;
 const record=value as Record<string,unknown>;
 const ok=typeof value==='object'&&!Array.isArray(value)&&typeof record.origin==='string'&&record.origin.length>=1&&record.origin.length<=80&&typeof record.text==='string'&&record.text.length<=4000&&(record.app===undefined||typeof record.app==='string'&&record.app.length<=160)&&(record.comp===undefined||typeof record.comp==='string'&&record.comp.length<=200)&&(record.imageAssetId===undefined||typeof record.imageAssetId==='string'&&ASSET_ID.test(record.imageAssetId));
 if(!ok){if(strict)throw fail('reference needs origin and text (at most 4000 characters), with optional app, comp and an imageAssetId');return undefined}
 return {origin:record.origin as string,...(record.app!==undefined?{app:record.app as string}:{}),...(record.comp!==undefined?{comp:record.comp as string}:{}),text:record.text as string,...(record.imageAssetId!==undefined?{imageAssetId:record.imageAssetId as string}:{})};
}
const stringRecord=(value:unknown,label:string,max:number)=>{if(value===undefined)return undefined;if(!value||typeof value!=='object'||Array.isArray(value))throw fail(`${label} must be an object keyed by draft id`);return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,text(item,`${label}.${key}`,max)]))};
const referenceRecord=(value:unknown)=>{if(value===undefined)return undefined;if(!value||typeof value!=='object'||Array.isArray(value))throw fail('references must be an object keyed by draft id');return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,parseReference(item,true)!]))};
const keysOnly=(data:Record<string,unknown>,allowed:string[])=>{const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)throw fail(`input contains unsupported fields: ${extra.join(', ')}`)};
const checkKeyed=(record:Record<string,unknown>|undefined,ids:string[],label:string)=>{if(!record)return;const stray=Object.keys(record).filter(key=>!ids.includes(key));if(stray.length)throw fail(`${label} names draft ids that are not being added: ${stray.slice(0,5).join(', ')}`)};

const newBoardId=()=>`board_${randomBytes(12).toString('base64url')}`;
const newItemKey=()=>randomBytes(6).toString('base64url');
export const BOARD_ID=/^board_[A-Za-z0-9_-]{16}$/;
export const boardPath=(id:string)=>`/author/review/${encodeURIComponent(id)}`;

async function requireDrafts(ctx:ReviewBoardContext,ids:string[]){
 const drafts=await Promise.all(ids.map(id=>ctx.authoring.getDraft(id)));
 const missing=ids.filter((_,index)=>!drafts[index]);
 if(missing.length)throw fail(`These draft ids are not in the library: ${missing.slice(0,10).join(', ')}${missing.length>10?` and ${missing.length-10} more`:''}. Nothing was changed. Check them with list_drafts.`,'unknown_draft',404);
 const unpublished=drafts.filter(draft=>draft&&draft.activeRevision===null).map(draft=>draft!.name);
 return {drafts:drafts as Draft[],unpublished};
}
async function requireBoard(ctx:ReviewBoardContext,id:unknown){
 const boardId=text(id,'boardId',80);
 const board=BOARD_ID.test(boardId)?await boardsOf(ctx).getBoard(boardId):null;
 if(!board)throw fail(`There is no review board '${boardId}'. Nothing was changed.`,'unknown_board',404);
 return board;
}

/* ---------- reading ---------- */

type Frame={previewId:string;width:number;height:number;mimeType:string};
export type ItemState={
 key:string;draftId:string;name:string;layout:string|null;groupLabel:string;
 available:boolean;archived:boolean;unpublished:boolean;currentRevision:number|null;
 image:Frame|null;reference:ReviewReference|null;
 decision:ReviewDecisionValue|null;note:string;decidedAt:number|null;decidedBy:string|null;decidedRevision:number|null;
 updated:boolean;earlier:{decision:ReviewDecisionValue|null;note:string;revision:number|null;decidedAt:number;decidedBy:string}|null;
};
export type BoardState={board:ReviewBoard;items:ItemState[]};

/** The frame kept for the preview a revision was published from, when A2 kept one. */
async function framesFor(ctx:ReviewBoardContext,drafts:Map<string,Draft>){
 const wanted=[...drafts.values()].filter(draft=>draft.activeRevision!==null);
 const previews=new Map<string,string>();
 // One revisions read per published graphic, a few at a time so a 400-item board stays inside the pool.
 for(let index=0;index<wanted.length;index+=8)await Promise.all(wanted.slice(index,index+8).map(async draft=>{const revision=(await ctx.authoring.revisions(draft.id)).find(row=>row.revision===draft.activeRevision);if(revision?.previewId)previews.set(draft.id,revision.previewId)}));
 const info=await ctx.authoring.fitImageInfo([...new Set(previews.values())]).catch(()=>new Map<string,StoredFitImageInfo>());
 return new Map([...previews].flatMap(([draftId,previewId])=>{const image=info.get(previewId);return image?[[draftId,{previewId,width:image.width,height:image.height,mimeType:image.mimeType}] as const]:[]}));
}

/** Everything the page and the agent read: each item joined with its graphic as it is now and the reviewer's answer. */
export async function boardState(ctx:ReviewBoardContext,board:ReviewBoard):Promise<BoardState>{
 const ordered=orderedItems(board.items);
 const [loaded,answers]=await Promise.all([Promise.all(ordered.map(item=>ctx.authoring.getDraft(item.draftId))),boardsOf(ctx).answers(board.id)]);
 const drafts=new Map(loaded.filter((draft):draft is Draft=>Boolean(draft)).map(draft=>[draft.id,draft]));
 const frames=await framesFor(ctx,drafts),byKey=new Map(answers.map(answer=>[answer.itemKey,answer]));
 const items=ordered.map((item):ItemState=>{
  const draft=drafts.get(item.draftId),answer=byKey.get(item.key),current=draft?.activeRevision??null;
  const reference=item.reference??parseReference((draft as {reference?:unknown}|undefined)?.reference,false)??null;
  const updated=Boolean(answer&&answer.revision!==current&&(answer.decision!==null||answer.note));
  const earlierFrom=updated?answer!:answer?.previous??null;
  return {key:item.key,draftId:item.draftId,name:draft?.name??'A graphic that has been deleted',layout:draft?.layout??null,groupLabel:item.groupLabel,
   available:Boolean(draft&&!draft.archivedAt&&current!==null),archived:Boolean(draft?.archivedAt),unpublished:Boolean(draft&&!draft.archivedAt&&current===null),currentRevision:current,
   image:frames.get(item.draftId)??null,reference,
   decision:updated?null:answer?.decision??null,note:updated?'':answer?.note??'',decidedAt:updated?null:answer?.decidedAt??null,decidedBy:updated?null:answer?.decidedBy??null,decidedRevision:updated?null:answer?.revision??null,
   updated,earlier:updated&&earlierFrom?{decision:earlierFrom.decision,note:earlierFrom.note,revision:earlierFrom.revision,decidedAt:earlierFrom.decidedAt,decidedBy:earlierFrom.decidedBy}:null};
 });
 return {board,items};
}

export function boardCounts(items:ItemState[]){
 return {items:items.length,approved:items.filter(item=>item.decision==='approve').length,needsChange:items.filter(item=>item.decision==='needs-change').length,undecided:items.filter(item=>item.decision===null).length,updatedSinceAnswered:items.filter(item=>item.updated).length,withoutPicture:items.filter(item=>!item.image).length};
}
const boardUrl=(ctx:ReviewBoardContext,id:string)=>new URL(boardPath(id),ctx.origin??canonicalOrigin()).toString();
function header(ctx:ReviewBoardContext,board:ReviewBoard){return {boardId:board.id,title:board.title,grouping:board.grouping,version:board.version,url:boardUrl(ctx,board.id),createdAt:board.createdAt,updatedAt:board.updatedAt}}
/** One compact line per item for the agent; the member who answered is the member id, as list_recent_publications returns it. */
function agentItem(item:ItemState){
 return {draftId:item.draftId,name:item.name,...(item.groupLabel?{group:item.groupLabel}:{}),decision:item.decision,...(item.note?{note:item.note}:{}),
  ...(item.decidedAt!==null?{decidedAt:item.decidedAt,decidedBy:item.decidedBy,decidedRevision:item.decidedRevision}:{}),
  currentRevision:item.currentRevision,hasPicture:Boolean(item.image),hasReference:Boolean(item.reference),
  ...(item.updated?{updated:true}:{}),...(item.earlier?{earlier:item.earlier}:{}),...(!item.available?{available:false,...(item.archived?{archived:true}:{}),...(item.unpublished?{unpublished:true}:{})}:{})};
}
const FILTERS=['all','needs-change','undecided','approved','updated'] as const;
type Filter=(typeof FILTERS)[number];
const matches=(item:ItemState,filter:Filter)=>filter==='all'||(filter==='needs-change'?item.decision==='needs-change':filter==='approved'?item.decision==='approve':filter==='updated'?item.updated:item.decision===null);

/* ---------- operations ---------- */

export const REVIEW_BOARD_TOOLS=['create_review_board','get_review_board','update_review_board'] as const;
export const isReviewBoardTool=(operation:string)=>(REVIEW_BOARD_TOOLS as readonly string[]).includes(operation);

export async function reviewBoardOperation(operation:string,data:Record<string,unknown>,actor:string,ctx:ReviewBoardContext):Promise<unknown>{
 const boards=boardsOf(ctx);
 if(operation==='create_review_board'){
  keysOnly(data,['title','draftIds','grouping','groupLabels','references']);
  const title=text(data.title,'title',120),draftIds=draftIdList(data.draftIds,'draftIds');
  const grouping=data.grouping===undefined?'none':data.grouping;
  if(grouping!=='deck-page'&&grouping!=='service'&&grouping!=='none')throw fail("grouping must be 'deck-page', 'service' or 'none'");
  const labels=stringRecord(data.groupLabels,'groupLabels',80),references=referenceRecord(data.references);
  checkKeyed(labels,draftIds,'groupLabels');checkKeyed(references,draftIds,'references');
  const {unpublished}=await requireDrafts(ctx,draftIds);
  const placed=await placeItems(draftIds,grouping,labels,[],ctx),now=nowOf(ctx);
  const board:ReviewBoard={id:newBoardId(),title,grouping,version:1,items:draftIds.map(draftId=>({key:newItemKey(),draftId,...placed.get(draftId)!,...(references?.[draftId]?{reference:references[draftId]}:{}),addedAt:now,addedBy:actor})),createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};
  await boards.insertBoard(board);
  const state=await boardState(ctx,board),counts=boardCounts(state.items);
  return {...header(ctx,board),counts,groups:groupSummary(state.items),
   ...(unpublished.length?{warnings:[`${unpublished.length} of these graphics ${unpublished.length===1?'is':'are'} not published yet, so the reviewer sees no picture for ${unpublished.length===1?'it':'them'}: ${unpublished.slice(0,10).join(', ')}. Publish with ship_draft; the board picks up the picture by itself.`]}:{}),
   message:`Created "${title}" with ${board.items.length} graphic${board.items.length===1?'':'s'}. Send the reviewer this link; they need to be signed in: ${boardUrl(ctx,board.id)}`};
 }
 if(operation==='get_review_board'){
  keysOnly(data,['boardId','filter']);
  const board=await requireBoard(ctx,data.boardId),filter=(data.filter??'all') as Filter;
  if(!FILTERS.includes(filter))throw fail(`filter must be one of ${FILTERS.join(', ')}`);
  const state=await boardState(ctx,board);
  return {...header(ctx,board),counts:boardCounts(state.items),filter,items:state.items.filter(item=>matches(item,filter)).map(agentItem)};
 }
 if(operation==='update_review_board'){
  keysOnly(data,['boardId','expectedVersion','title','add','remove','groupLabels','references','dropAnswers']);
  const board=await requireBoard(ctx,data.boardId);
  if(!Number.isInteger(data.expectedVersion)||(data.expectedVersion as number)<1)throw fail('expectedVersion must be the version get_review_board returned');
  if(board.version!==data.expectedVersion)throw fail(`This board is at version ${board.version}, not ${data.expectedVersion}; it changed since you read it. Nothing was changed. Call get_review_board and try again.`,'version_conflict',409);
  const title=data.title===undefined?board.title:text(data.title,'title',120);
  const add=data.add===undefined?[]:draftIdList(data.add,'add'),remove=data.remove===undefined?[]:draftIdList(data.remove,'remove');
  if(data.dropAnswers!==undefined&&typeof data.dropAnswers!=='boolean')throw fail('dropAnswers must be true or false');
  const labels=stringRecord(data.groupLabels,'groupLabels',80),references=referenceRecord(data.references);
  checkKeyed(labels,add,'groupLabels');checkKeyed(references,add,'references');
  const onBoard=new Set(board.items.map(item=>item.draftId));
  const already=add.filter(id=>onBoard.has(id)),absent=remove.filter(id=>!onBoard.has(id)),both=add.filter(id=>remove.includes(id));
  if(both.length)throw fail(`A draft can't be added and removed in one call: ${both.join(', ')}. Nothing was changed.`);
  if(already.length)throw fail(`Already on this board: ${already.join(', ')}. Nothing was changed.`);
  if(absent.length)throw fail(`Not on this board: ${absent.join(', ')}. Nothing was changed.`);
  if(board.items.length+add.length-remove.length>MAX_ITEMS)throw fail(`A board holds at most ${MAX_ITEMS} graphics. Nothing was changed.`);
  if(!add.length&&!remove.length&&title===board.title)return {...header(ctx,board),changed:false,message:'Nothing to change.'};
  const removing=board.items.filter(item=>remove.includes(item.draftId));
  const answered=new Map((await boards.answers(board.id)).filter(answer=>answer.decision!==null||answer.note).map(answer=>[answer.itemKey,answer]));
  const losing=removing.filter(item=>answered.has(item.key));
  // Removing an item the reviewer already answered drops their answer, so it takes a second, explicit yes.
  if(losing.length&&data.dropAnswers!==true)return {...header(ctx,board),changed:false,answeredItems:losing.map(item=>({draftId:item.draftId,decision:answered.get(item.key)!.decision,note:answered.get(item.key)!.note})),message:`The reviewer already answered ${losing.length} of the graphics you asked to remove. Nothing was changed. Call again with dropAnswers:true to remove them and their answers.`};
  const {unpublished}=add.length?await requireDrafts(ctx,add):{unpublished:[] as string[]};
  const kept=board.items.filter(item=>!remove.includes(item.draftId));
  const placed=add.length?await placeItems(add,board.grouping,labels,kept,ctx):new Map<string,Placed>(),now=nowOf(ctx);
  const next:ReviewBoard={...board,title,version:board.version+1,items:[...kept,...add.map(draftId=>({key:newItemKey(),draftId,...placed.get(draftId)!,...(references?.[draftId]?{reference:references[draftId]}:{}),addedAt:now,addedBy:actor}))],updatedAt:now,updatedBy:actor};
  if(!await boards.replaceBoard(next,board.version))throw fail('This board changed in another session. Nothing was changed. Call get_review_board and try again.','version_conflict',409);
  await boards.deleteAnswers(board.id,removing.map(item=>item.key));
  const state=await boardState(ctx,next);
  return {...header(ctx,next),changed:true,added:add.length,removed:removing.length,counts:boardCounts(state.items),...(unpublished.length?{warnings:[`Not published yet, so shown without a picture: ${unpublished.slice(0,10).join(', ')}.`]}:{}),message:`Updated "${title}".`};
 }
 throw fail(`Unknown review board operation: ${operation}`,'unknown_operation',404);
}
function groupSummary(items:ItemState[]){const groups:{group:string;count:number}[]=[];for(const item of items){const last=groups[groups.length-1];if(last&&last.group===item.groupLabel)last.count++;else groups.push({group:item.groupLabel,count:1})}return groups.filter(group=>group.group||groups.length>1)}

/* ---------- the reviewer's answers (the web page) ---------- */

export const NOTE_MAX=1000;
/** Save one reviewer answer as they click. `revision` is the revision the page showed them. */
export async function saveReviewerAnswer(ctx:ReviewBoardContext,boardId:string,input:{item:unknown;decision:unknown;note:unknown;revision:unknown},member:string){
 const board=await requireBoard(ctx,boardId);
 const item=board.items.find(entry=>entry.key===input.item);
 if(!item)throw fail('That graphic is no longer on this board. Reload the page.','unknown_item',404);
 if(input.decision!==null&&input.decision!=='approve'&&input.decision!=='needs-change')throw fail('Choose Approve or Needs change.');
 if(typeof input.note!=='string'||input.note.length>NOTE_MAX)throw fail(`A note can be at most ${NOTE_MAX} characters.`);
 if(input.revision!==null&&!(Number.isInteger(input.revision)&&(input.revision as number)>=1))throw fail('Reload the page and try again.');
 const boards=boardsOf(ctx),previous=(await boards.answers(board.id)).find(answer=>answer.itemKey===item.key);
 const core:AnswerCore={decision:input.decision as ReviewDecisionValue|null,note:input.note.trim(),revision:input.revision as number|null,decidedAt:nowOf(ctx),decidedBy:member};
 // An answer to a newer picture keeps the one given before it as `previous`; a change of mind on the same picture replaces it.
 const kept=previous&&previous.revision!==core.revision&&(previous.decision!==null||previous.note)?{decision:previous.decision,note:previous.note,revision:previous.revision,decidedAt:previous.decidedAt,decidedBy:previous.decidedBy}:previous?.previous;
 await boards.saveAnswer(board.id,{itemKey:item.key,...core,...(kept?{previous:kept}:{})});
 return (await boardState(ctx,board)).items.find(entry=>entry.key===item.key)!;
}
