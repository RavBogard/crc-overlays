import type {AccessMember} from './access';
import {AuthoringError,publicErrorDetails} from './authoring-model';
import {BOARD_ID,boardCounts,boardState,boardsOf,saveReviewerAnswer,type ItemState,type ReviewBoardContext} from './review-board';

/**
 * T4 - what /api/review-boards serves the review page. GET ?board=<id> reads the board as the
 * reviewer sees it (names, never member ids); GET ?board=<id>&image=<preview> returns the kept fit
 * frame of a graphic on that board, and nothing else; POST saves one answer. Any signed-in member
 * may review (T4 GATE); a paired device or a shared key may not, because an answer is a person's.
 * The route passes the real store; tests pass their own.
 */
export type ReviewBoardHttpDeps={authorize:(request:Request)=>Promise<AccessMember|null>;context:()=>ReviewBoardContext;memberName:(id:string)=>Promise<string|null>};

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const PREVIEW_ID=/^[A-Za-z0-9_-]{1,200}$/;
const person=(member:AccessMember|null)=>member&&!member.id.startsWith('device:')&&!member.id.startsWith('legacy-')?member:null;
export const imagePath=(boardId:string,previewId:string)=>`/api/review-boards?board=${encodeURIComponent(boardId)}&image=${encodeURIComponent(previewId)}`;

export type PageItem={key:string;name:string;group:string;available:boolean;archived:boolean;unpublished:boolean;revision:number|null;image:{url:string;width:number;height:number}|null;reference:{text:string;imageUrl:string|null}|null;decision:ItemState['decision'];note:string;answeredBy:string|null;answeredAt:number|null;updated:boolean;earlier:{decision:ItemState['decision'];note:string;answeredBy:string|null}|null};
export type PageBoard={title:string;grouping:string;counts:ReturnType<typeof boardCounts>;items:PageItem[]};

async function pageItems(boardId:string,items:ItemState[],deps:ReviewBoardHttpDeps):Promise<PageItem[]>{
 const names=new Map<string,string|null>();
 for(const id of new Set(items.flatMap(item=>[item.decidedBy,item.earlier?.decidedBy].filter((value):value is string=>Boolean(value)))))names.set(id,await deps.memberName(id).catch(()=>null));
 const name=(id:string|null|undefined)=>id?names.get(id)??null:null;
 return items.map(item=>({key:item.key,name:item.name,group:item.groupLabel,available:item.available,archived:item.archived,unpublished:item.unpublished,revision:item.currentRevision,
  image:item.image?{url:imagePath(boardId,item.image.previewId),width:item.image.width,height:item.image.height}:null,
  reference:item.reference?{text:item.reference.text,imageUrl:item.reference.imageAssetId?`/api/assets/${encodeURIComponent(item.reference.imageAssetId)}/preview`:null}:null,
  decision:item.decision,note:item.note,answeredBy:name(item.decidedBy),answeredAt:item.decidedAt,updated:item.updated,
  earlier:item.earlier?{decision:item.earlier.decision,note:item.earlier.note,answeredBy:name(item.earlier.decidedBy)}:null}));
}
function failure(error:unknown){
 if(error instanceof AuthoringError)return json({error:error.message,code:error.code,...publicErrorDetails(error.details)},error.status);
 console.error('Review board request failed');return json({error:'The review board is unavailable right now. Try again in a minute.',code:'review_board_unavailable'},503);
}
const boardParam=(url:URL)=>{const id=url.searchParams.get('board')??'';return BOARD_ID.test(id)?id:null};

export async function reviewBoardGet(request:Request,deps:ReviewBoardHttpDeps):Promise<Response>{
 try{
  const member=person(await deps.authorize(request));if(!member)return json({error:'Unauthorized'},401);
  const url=new URL(request.url),boardId=boardParam(url);if(!boardId)return json({error:'This review board does not exist.'},404);
  const ctx=deps.context(),board=await boardsOf(ctx).getBoard(boardId);if(!board)return json({error:'This review board does not exist.'},404);
  const state=await boardState(ctx,board),image=url.searchParams.get('image');
  if(image!==null){
   // Only a frame this board is showing right now: the route never becomes a way to fetch any preview by id.
   if(!PREVIEW_ID.test(image)||!state.items.some(item=>item.image?.previewId===image))return json({error:'Not found'},404);
   const stored=await ctx.authoring.getFitImage(image);if(!stored)return json({error:'Not found'},404);
   const bytes=Uint8Array.from(stored.data);
   return new Response(bytes.buffer,{headers:{'Content-Type':stored.mimeType,'Content-Length':String(bytes.byteLength),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
  }
  const body:PageBoard={title:board.title,grouping:board.grouping,counts:boardCounts(state.items),items:await pageItems(board.id,state.items,deps)};
  return json(body);
 }catch(error){return failure(error)}
}

const MAX_BODY=8192;
export async function reviewBoardPost(request:Request,deps:ReviewBoardHttpDeps):Promise<Response>{
 try{
  const member=person(await deps.authorize(request));if(!member)return json({error:'Unauthorized'},401);
  const raw=await request.text();if(raw.length>MAX_BODY)return json({error:'That note is too long.'},413);
  let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return json({error:'Reload the page and try again.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Reload the page and try again.'},400);
  const boardId=typeof body.board==='string'&&BOARD_ID.test(body.board)?body.board:null;if(!boardId)return json({error:'This review board does not exist.'},404);
  const ctx=deps.context(),item=await saveReviewerAnswer(ctx,boardId,{item:body.item,decision:body.decision??null,note:body.note??'',revision:body.revision??null},member.id);
  const [shaped]=await pageItems(boardId,[item],deps);
  return json({item:shaped});
 }catch(error){return failure(error)}
}
