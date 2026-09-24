/**
 * Layouts as data (MCP plan L2, R-L3 and R-L5; STATE ruling 7). A data layout is a card stored per
 * workspace in `layout_definitions` (db/layout-definitions.sql) as one immutable document per
 * published version. The built-in four (lower third, both panels, corner) stay code in
 * lib/layout-registry.ts and never appear here.
 *
 * Versioning: editing a published version N writes a draft N+1; editing that draft rewrites it in
 * place; publishing it makes it the version new graphics pin. A published row is never rewritten,
 * so a published graphic, which pins `layoutRef{id,version,sha256}` inside its cue and its
 * `cueHash`, keeps rendering exactly what it was reviewed with until it is republished or rebased.
 *
 * Motion is part of the definition (R-L5): a named preset or explicit tracks. A graphic in a data
 * layout takes its motion from here, never from a cloned baseline template cue.
 */
import {createHash} from 'node:crypto';
import {definitionFromDocument,isBuiltInLayout,layoutRefKey,registerDataLayout,type CardAlign,type CardChannel,type CardDefinition,type LayoutDocument,type LayoutId,type LayoutMotion,type LayoutRef,type MotionPreset,type ResolvedLayouts} from './layout-registry.ts';
import type {AnimationTrack} from './player-motion.ts';

export type LayoutStatus='draft'|'published';
export type LayoutDefinitionRecord={id:LayoutId;version:number;status:LayoutStatus;document:LayoutDocument;sha256:string;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string};

export class LayoutDefinitionError extends Error{
 code:string;status:number;
 constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status}
}

/* ------------------------------------------------------------ document --- */

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])]));
 return value;
}
/** The pin a graphic carries: sha256 over the document's canonical JSON (keys sorted), so key order never moves it. */
export function layoutDocumentSha256(document:LayoutDocument):string{return createHash('sha256').update(JSON.stringify(canonical(document))).digest('hex')}

const LAYOUT_ID=/^[a-z][a-z0-9_-]{0,39}$/;
const fail=(message:string):never=>{throw new LayoutDefinitionError('invalid_layout',message)};
function object(value:unknown,label:string,keys:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail(`${label} must be an object`);
 const input=value as Record<string,unknown>;
 const extra=Object.keys(input).filter(key=>!keys.includes(key)&&!optional.includes(key));
 if(extra.length)fail(`${label} has unsupported fields: ${extra.join(', ')}`);
 const missing=keys.filter(key=>input[key]===undefined);
 if(missing.length)fail(`${label} is missing ${missing.join(', ')}`);
 return input;
}
function number(value:unknown,label:string,min:number,max:number,integer=true):number{
 if(typeof value!=='number'||!Number.isFinite(value)||(integer&&!Number.isInteger(value))||value<min||value>max)fail(`${label} must be ${integer?'a whole number':'a number'} from ${min} to ${max}`);
 return value as number;
}
function oneOf<T extends string>(value:unknown,label:string,choices:readonly T[]):T{
 if(typeof value!=='string'||!choices.includes(value as T))fail(`${label} must be ${choices.join(', ')}`);
 return value as T;
}
const ALIGN=['start','end','natural'] as const satisfies readonly CardAlign[];
function channel(value:unknown,label:string,withDirection:boolean):CardChannel{
 const input=object(value,label,['y','height','fontSize','lineHeight','align'],withDirection?['direction']:[]);
 const result:CardChannel={y:number(input.y,`${label}.y`,0,1080),height:number(input.height,`${label}.height`,1,1080),fontSize:number(input.fontSize,`${label}.fontSize`,20,120),lineHeight:number(input.lineHeight,`${label}.lineHeight`,.8,2.5,false),align:oneOf(input.align,`${label}.align`,ALIGN)};
 if(withDirection&&input.direction!==undefined)result.direction=oneOf(input.direction,`${label}.direction`,['ltr','rtl'] as const);
 return result;
}
function card(value:unknown):CardDefinition{
 const input=object(value,'card',['frame','surface','logo','title','body','fit']);
 const f=object(input.frame,'card.frame',['anchor','insetX','insetY','width','height']);
 const frame={anchor:oneOf(f.anchor,'card.frame.anchor',['top-left','top-right','bottom-left','bottom-right'] as const),insetX:number(f.insetX,'card.frame.insetX',0,1920),insetY:number(f.insetY,'card.frame.insetY',0,1080),width:number(f.width,'card.frame.width',40,1920),height:number(f.height,'card.frame.height',40,1080)};
 if(frame.insetX+frame.width>1920||frame.insetY+frame.height>1080)fail('card.frame must lie inside the 1920x1080 frame');
 const s=object(input.surface,'card.surface',['radius','stripHeight','ruleHeight']);
 const surface={radius:number(s.radius,'card.surface.radius',0,200),stripHeight:number(s.stripHeight,'card.surface.stripHeight',0,frame.height),ruleHeight:number(s.ruleHeight,'card.surface.ruleHeight',0,frame.height)};
 const l=object(input.logo,'card.logo',['x','y','size']);
 const logo={x:number(l.x,'card.logo.x',0,frame.width),y:number(l.y,'card.logo.y',0,frame.height),size:number(l.size,'card.logo.size',0,frame.height)};
 const t=object(input.title,'card.title',['x','y','width','height','fontSize','lineHeight','accentWidth','accentGap']);
 const title={x:number(t.x,'card.title.x',0,frame.width),y:number(t.y,'card.title.y',0,frame.height),width:number(t.width,'card.title.width',1,frame.width),height:number(t.height,'card.title.height',1,frame.height),fontSize:number(t.fontSize,'card.title.fontSize',20,120),lineHeight:number(t.lineHeight,'card.title.lineHeight',.8,2.5,false),accentWidth:number(t.accentWidth,'card.title.accentWidth',0,frame.width),accentGap:number(t.accentGap,'card.title.accentGap',0,frame.width)};
 if(title.accentWidth+title.accentGap>=title.width)fail('card.title.accentWidth and accentGap must leave room for the title');
 const b=object(input.body,'card.body',['x','width','hebrew','latin','single']);
 const body={x:number(b.x,'card.body.x',0,frame.width),width:number(b.width,'card.body.width',1,frame.width),hebrew:channel(b.hebrew,'card.body.hebrew',true),latin:channel(b.latin,'card.body.latin',true),single:channel(b.single,'card.body.single',false) as Omit<CardChannel,'direction'>};
 const within=(label:string,x:number,width:number,y:number,height:number)=>{if(x+width>frame.width||y+height>frame.height)fail(`${label} must lie inside the card`)};
 within('card.logo',logo.x,logo.size,logo.y,logo.size);within('card.title',title.x,title.width,title.y,title.height);
 for(const [name,item] of [['hebrew',body.hebrew],['latin',body.latin],['single',body.single]] as const)within(`card.body.${name}`,body.x,body.width,item.y,item.height);
 const fitInput=object(input.fit,'card.fit',['strategy','floor','maxSteps','glyphTolerance','fill','heightCeiling']);
 let fill:CardDefinition['fit']['fill']=null;
 if(fitInput.fill!==null){const value=object(fitInput.fill,'card.fit.fill',['denominator','sparseBelow']);fill={denominator:number(value.denominator,'card.fit.fill.denominator',1,1080),sparseBelow:number(value.sparseBelow,'card.fit.fill.sparseBelow',0,1,false)}}
 const fit={strategy:oneOf(fitInput.strategy,'card.fit.strategy',['shrink-to-floor'] as const),floor:number(fitInput.floor,'card.fit.floor',20,120),maxSteps:number(fitInput.maxSteps,'card.fit.maxSteps',0,120),glyphTolerance:number(fitInput.glyphTolerance,'card.fit.glyphTolerance',0,40),fill,heightCeiling:fitInput.heightCeiling===null?null:number(fitInput.heightCeiling,'card.fit.heightCeiling',1,1080)};
 return {frame,surface,logo,title,body,fit};
}

export const MOTION_PRESETS=['card-scale','fade'] as const satisfies readonly MotionPreset[];
/** Every element name the Player animates on a card (lib/player.ts data-element, lib/player-motion.ts GROUPS). */
export const MOTION_ELEMENTS=['baseMain','baseTitle','baseTitleGrad','accentLineBottom','textTitle','accentTextTitle','textMain','textMainheb','textMainEng','Image','logoGroup','titleGroup','HebText','EngText'] as const;
function motion(value:unknown):LayoutMotion{
 if(value&&typeof value==='object'&&'preset' in value){const input=object(value,'motion',['preset']);return {preset:oneOf(input.preset,'motion.preset',MOTION_PRESETS)}}
 const input=object(value,'motion',['tracks','duration']);
 const d=object(input.duration,'motion.duration',['In','Out']);
 const duration={In:number(d.In,'motion.duration.In',.05,5,false),Out:number(d.Out,'motion.duration.Out',.05,5,false)};
 if(!Array.isArray(input.tracks)||!input.tracks.length||input.tracks.length>64)fail('motion.tracks must hold 1 to 64 tracks');
 const tracks=(input.tracks as unknown[]).map((item,index):AnimationTrack=>{
  const label=`motion.tracks[${index}]`,track=object(item,label,['element','direction'],['effect','keyframes']);
  const direction=oneOf(track.direction,`${label}.direction`,['In','Out'] as const);
  const result:AnimationTrack={element:oneOf(track.element,`${label}.element`,MOTION_ELEMENTS),direction};
  if(track.effect!==undefined){
   const e=object(track.effect,`${label}.effect`,[],['effect','property','easing']);
   const effect:NonNullable<AnimationTrack['effect']>={};
   if(e.effect!==undefined)effect.effect=oneOf(e.effect,`${label}.effect.effect`,['fade','scale','translate','none'] as const);
   if(e.property!==undefined)effect.property=oneOf(e.property,`${label}.effect.property`,['none','x','y','xAndY','up','down','left','right'] as const);
   if(e.easing!==undefined){const g=object(e.easing,`${label}.effect.easing`,[],['easing','inOut']);effect.easing={...(g.easing!==undefined?{easing:oneOf(g.easing,`${label}.effect.easing.easing`,['power1','power2','power3','power4'] as const)}:{}),...(g.inOut!==undefined?{inOut:oneOf(g.inOut,`${label}.effect.easing.inOut`,['in','out','inOut'] as const)}:{})}}
   result.effect=effect;
  }
  if(track.keyframes!==undefined){
   const k=track.keyframes;
   if(!Array.isArray(k)||k.length!==2)fail(`${label}.keyframes must be [start, end] in seconds`);
   const [start,end]=[number((k as unknown[])[0],`${label}.keyframes[0]`,0,5,false),number((k as unknown[])[1],`${label}.keyframes[1]`,0,5,false)];
   if(end<=start||end>duration[direction])fail(`${label}.keyframes must end after they start and within the ${direction} duration`);
   result.keyframes=[start,end];
  }
  return result;
 });
 return {tracks,duration};
}
/** A stored document, strictly validated: unknown fields are refused, never dropped. */
export function parseLayoutDocument(value:unknown):LayoutDocument{
 const input=object(value,'layout',['label','capabilities','card','motion']);
 if(typeof input.label!=='string'||!input.label.trim()||input.label.length>60)fail('label must be 1-60 characters');
 const c=object(input.capabilities,'capabilities',['sets','translation','oneBlockPerSlide']);
 for(const key of ['sets','translation','oneBlockPerSlide'] as const)if(typeof c[key]!=='boolean')fail(`capabilities.${key} must be true or false`);
 // A card body has a Hebrew channel over a Latin one, or one lone channel: no room for a lit third layer.
 if(c.translation!==false)fail('capabilities.translation must be false: a card shows Hebrew and transliteration, or one line');
 return {label:(input.label as string).trim(),capabilities:{sets:c.sets as boolean,translation:false,oneBlockPerSlide:c.oneBlockPerSlide as boolean},card:card(input.card),motion:motion(input.motion)};
}
export function parseLayoutId(value:unknown):LayoutId{
 if(typeof value!=='string'||!LAYOUT_ID.test(value))fail('A layout id must start with a letter and use only a-z, 0-9, _ and -, up to 40 characters');
 if(isBuiltInLayout(value as string))throw new LayoutDefinitionError('built_in_layout',`${value} is a built-in layout and is not stored as data`,409);
 return value as LayoutId;
}

/* -------------------------------------------------------------- motion --- */

type Timing={effect:'fade'|'scale';property:string;in:[number,number];inEasing:string;out:[number,number];outEasing:string};
// The corner card's motion today (it borrows a lower third's template): bars scale in from the
// card's anchored edge, the title and text fade in after them, the logo pops.
const CARD_SCALE:Record<string,Timing|{in:[number,number];inEasing:string;effect:'scale';property:string}>={
 baseMain:{effect:'scale',property:'x',in:[.3,1.1],inEasing:'power4',out:[.1,.5],outEasing:'power2'},
 baseTitle:{effect:'scale',property:'x',in:[.42,1.17],inEasing:'power3',out:[0,.4],outEasing:'power2'},
 baseTitleGrad:{effect:'scale',property:'x',in:[.42,1.17],inEasing:'power3',out:[0,.4],outEasing:'power2'},
 accentLineBottom:{effect:'scale',property:'x',in:[.4,1.15],inEasing:'power3',out:[0,.45],outEasing:'power2'},
 textTitle:{effect:'fade',property:'none',in:[.7,1.05],inEasing:'power2',out:[.1,.21],outEasing:'power1'},
 accentTextTitle:{effect:'fade',property:'none',in:[.7,1.05],inEasing:'power2',out:[.1,.21],outEasing:'power1'},
 textMain:{effect:'fade',property:'none',in:[.7,1.2],inEasing:'power1',out:[.1,.3],outEasing:'power1'},
 textMainheb:{effect:'fade',property:'none',in:[.7,1.2],inEasing:'power1',out:[.1,.3],outEasing:'power1'},
 textMainEng:{effect:'fade',property:'none',in:[.7,1.2],inEasing:'power1',out:[.1,.3],outEasing:'power1'},
 Image:{effect:'fade',property:'none',in:[0,.5],inEasing:'power1',out:[0,.5],outEasing:'power1'},
 logoGroup:{effect:'scale',property:'xAndY',in:[0,.7],inEasing:'power1'},
};
function presetTracks(preset:MotionPreset):{animations:AnimationTrack[];duration:{In:number;Out:number}}{
 if(preset==='fade'){
  const elements=['baseMain','baseTitle','baseTitleGrad','accentLineBottom','textTitle','accentTextTitle','textMain','textMainheb','textMainEng','Image'];
  return {duration:{In:.5,Out:.3},animations:elements.flatMap(element=>[
   {element,direction:'In',effect:{easing:{easing:'power1',inOut:'out'},effect:'fade',property:'none'},keyframes:[0,.5]},
   {element,direction:'Out',effect:{easing:{easing:'power1',inOut:'in'},effect:'fade',property:'none'},keyframes:[0,.3]},
  ])};
 }
 return {duration:{In:1.2,Out:.5},animations:Object.entries(CARD_SCALE).flatMap(([element,timing])=>[
  {element,direction:'In',effect:{easing:{easing:timing.inEasing,inOut:'out'},effect:timing.effect,property:timing.property},keyframes:[...timing.in]},
  ...('out' in timing?[{element,direction:'Out',effect:{easing:{easing:timing.outEasing,inOut:'in'},effect:timing.effect,property:timing.property},keyframes:[...timing.out]}]:[]),
 ])};
}
/** The animations and duration a graphic in a data layout carries: the definition's own, never a template cue's. */
export function layoutMotion(motion:LayoutMotion):{animations:AnimationTrack[];duration:{In:number;Out:number}}{
 if('preset' in motion)return presetTracks(motion.preset);
 return {animations:structuredClone(motion.tracks),duration:{...motion.duration}};
}

/* ---------------------------------------------------------- repository --- */

export interface LayoutDefinitionsRepository{
 /** Every stored version of every layout, oldest first per id. */
 list():Promise<LayoutDefinitionRecord[]>;
 get(id:LayoutId,version:number):Promise<LayoutDefinitionRecord|null>;
 /**
  * Write the editable version of a layout. `expectedVersion` null creates version 1; otherwise it
  * names the newest version the caller read. A published newest version gets a new draft above it;
  * a draft newest version is rewritten in place. Anything else is a conflict.
  */
 saveDraft(id:LayoutId,document:LayoutDocument,expectedVersion:number|null,actor:string,now:number):Promise<LayoutDefinitionRecord>;
 /** Publish the newest version, which must be a draft. A published version is never rewritten. */
 publish(id:LayoutId,version:number,actor:string,now:number):Promise<LayoutDefinitionRecord>;
}
const conflict=(id:string)=>new LayoutDefinitionError('version_conflict',`Layout ${id} changed in another session. Read it again and retry with the new version.`,409);

export class MemoryLayoutDefinitionsRepository implements LayoutDefinitionsRepository{
 private rows=new Map<LayoutId,LayoutDefinitionRecord[]>();
 async list(){return [...this.rows.values()].flat().map(row=>structuredClone(row))}
 async get(id:LayoutId,version:number){const row=this.rows.get(id)?.find(item=>item.version===version);return row?structuredClone(row):null}
 async saveDraft(id:LayoutId,document:LayoutDocument,expectedVersion:number|null,actor:string,now:number){
  parseLayoutId(id);const parsed=parseLayoutDocument(document),sha256=layoutDocumentSha256(parsed);
  const versions=this.rows.get(id)??[],newest=versions[versions.length-1];
  if(!newest){
   if(expectedVersion!==null)throw conflict(id);
   const row:LayoutDefinitionRecord={id,version:1,status:'draft',document:parsed,sha256,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};
   this.rows.set(id,[row]);return structuredClone(row);
  }
  if(expectedVersion!==newest.version)throw conflict(id);
  if(newest.status==='draft'){Object.assign(newest,{document:parsed,sha256,updatedAt:now,updatedBy:actor});return structuredClone(newest)}
  const row:LayoutDefinitionRecord={id,version:newest.version+1,status:'draft',document:parsed,sha256,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};
  versions.push(row);return structuredClone(row);
 }
 async publish(id:LayoutId,version:number,actor:string,now:number){
  const versions=this.rows.get(id)??[],newest=versions[versions.length-1];
  if(!newest||newest.version!==version||newest.status!=='draft')throw conflict(id);
  Object.assign(newest,{status:'published',updatedAt:now,updatedBy:actor});
  registerPublished(newest);
  return structuredClone(newest);
 }
}

export const layoutRefOf=(row:Pick<LayoutDefinitionRecord,'id'|'version'|'sha256'>):LayoutRef=>({id:row.id,version:row.version,sha256:row.sha256});
function registerPublished(row:LayoutDefinitionRecord){registerDataLayout(definitionFromDocument(row.id,row.document,layoutRefOf(row)))}
/**
 * Load: registers each data layout's newest published version into lib/layout-registry.ts, so
 * validation accepts it and `buildCue` pins it. Drafts are never registered.
 */
export async function registerPublishedLayouts(repository:LayoutDefinitionsRepository=layoutDefinitionsRepository()){
 const newest=new Map<LayoutId,LayoutDefinitionRecord>();
 for(const row of await repository.list())if(row.status==='published'&&(newest.get(row.id)?.version??0)<row.version)newest.set(row.id,row);
 for(const row of newest.values())registerPublished(row);
 return [...newest.values()].map(layoutRefOf);
}
/**
 * The `layouts` the catalog envelope carries: every definition a cue in it pins, at the pinned
 * version, and only when the stored document still hashes to the pin. A pin the store cannot
 * answer is left out; the Player then degrades as `resolveCueLayout` describes.
 */
export async function resolvedLayoutsFor(cues:readonly {layoutRef?:LayoutRef}[],repository:LayoutDefinitionsRepository=layoutDefinitionsRepository()):Promise<ResolvedLayouts>{
 const refs=new Map<string,LayoutRef>();
 for(const cue of cues)if(cue.layoutRef)refs.set(`${layoutRefKey(cue.layoutRef)} ${cue.layoutRef.sha256}`,cue.layoutRef);
 const layouts:ResolvedLayouts={};
 for(const [,ref] of [...refs].sort(([a],[b])=>a.localeCompare(b))){
  const key=layoutRefKey(ref);
  if(layouts[key])continue;
  const row=await repository.get(ref.id,ref.version);
  if(row&&row.status==='published'&&row.sha256===ref.sha256)layouts[key]={id:row.id,version:row.version,sha256:row.sha256,document:row.document};
 }
 return layouts;
}
/** A catalog with its pinned definitions beside the cues, or unchanged when no cue pins one. */
export async function withResolvedLayouts<T extends {cues:readonly {layoutRef?:LayoutRef}[]}>(catalog:T,repository?:LayoutDefinitionsRepository):Promise<T&{layouts?:ResolvedLayouts}>{
 if(!catalog.cues.some(cue=>cue.layoutRef))return catalog;
 const layouts=await resolvedLayoutsFor(catalog.cues,repository);
 return Object.keys(layouts).length?{...catalog,layouts}:catalog;
}

/* ------------------------------------------------------------ postgres --- */

/** Postgres "relation does not exist": db/layout-definitions.sql has not been applied to this database yet. */
const missingTable=(error:unknown)=>(error as {code?:unknown}|null)?.code==='42P01';
const uniqueViolation=(error:unknown)=>(error as {code?:unknown}|null)?.code==='23505';
export const LAYOUTS_UNMIGRATED='Layouts as data are not set up in this workspace\'s database yet (db/layout-definitions.sql). Nothing was saved; ask whoever runs the database to apply it.';
const COLUMNS='id,version,status,document,sha256,created_at AS "createdAt",updated_at AS "updatedAt",created_by AS "createdBy",updated_by AS "updatedBy"';
const record=(row:unknown):LayoutDefinitionRecord=>{const value=row as LayoutDefinitionRecord;return {...value,version:Number(value.version),createdAt:Number(value.createdAt),updatedAt:Number(value.updatedAt)}};
/**
 * db/layout-definitions.sql (packet L3). Each workspace has its own database, so rows carry no
 * workspace column. Until the migration is applied, reads answer "no data layouts" - every
 * built-in layout keeps working - and writes refuse in a sentence (the local-sources precedent).
 */
/** The slice of pg's Pool the repository uses; tests hand in a fake. */
export type LayoutPool={query(sql:string,values:unknown[]):Promise<{rows:unknown[]}>;connect():Promise<{query(sql:string,values?:unknown[]):Promise<{rows:unknown[]}>;release():void}>};
export class PgLayoutDefinitionsRepository implements LayoutDefinitionsRepository{
 constructor(private pool:()=>Promise<LayoutPool>=async()=>(await import('./database')).db){}
 private async read(sql:string,values:unknown[]){try{return (await (await this.pool()).query(sql,values)).rows.map(record)}catch(error){if(missingTable(error))return [];throw error}}
 async list(){return this.read(`SELECT ${COLUMNS} FROM layout_definitions ORDER BY id,version`,[])}
 async get(id:LayoutId,version:number){return (await this.read(`SELECT ${COLUMNS} FROM layout_definitions WHERE id=$1 AND version=$2`,[id,version]))[0]??null}
 async saveDraft(id:LayoutId,document:LayoutDocument,expectedVersion:number|null,actor:string,now:number){
  parseLayoutId(id);const parsed=parseLayoutDocument(document),sha256=layoutDocumentSha256(parsed);
  const client=await (await this.pool()).connect();
  try{
   await client.query('BEGIN');
   const newest=(await client.query('SELECT version,status FROM layout_definitions WHERE id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE',[id])).rows[0] as {version:number;status:LayoutStatus}|undefined;
   if((newest?Number(newest.version):null)!==expectedVersion)throw conflict(id);
   let row;
   if(newest?.status==='draft')row=(await client.query(`UPDATE layout_definitions SET document=$3,sha256=$4,updated_at=$5,updated_by=$6 WHERE id=$1 AND version=$2 AND status='draft' RETURNING ${COLUMNS}`,[id,Number(newest.version),parsed,sha256,now,actor])).rows[0];
   else row=(await client.query(`INSERT INTO layout_definitions(id,version,document,status,sha256,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,'draft',$4,$5,$5,$6,$6) RETURNING ${COLUMNS}`,[id,newest?Number(newest.version)+1:1,parsed,sha256,now,actor])).rows[0];
   if(!row)throw conflict(id);
   await client.query('COMMIT');
   return record(row);
  }catch(error){
   await client.query('ROLLBACK').catch(()=>{});
   if(missingTable(error))throw new LayoutDefinitionError('layouts_unavailable',LAYOUTS_UNMIGRATED,503);
   if(uniqueViolation(error))throw conflict(id);
   throw error;
  }finally{client.release()}
 }
 async publish(id:LayoutId,version:number,actor:string,now:number){
  let rows;
  try{rows=(await (await this.pool()).query(`UPDATE layout_definitions SET status='published',updated_at=$3,updated_by=$4 WHERE id=$1 AND version=$2 AND status='draft' AND version=(SELECT MAX(version) FROM layout_definitions WHERE id=$1) RETURNING ${COLUMNS}`,[id,version,now,actor])).rows}
  catch(error){if(missingTable(error))throw new LayoutDefinitionError('layouts_unavailable',LAYOUTS_UNMIGRATED,503);throw error}
  if(!rows[0])throw conflict(id);
  const row=record(rows[0]);registerPublished(row);return row;
 }
}

// The workspace's store: Postgres wherever the authoring store is (a configured database outside
// rehearsal), memory in local rehearsal and in tests.
let defaultRepository:LayoutDefinitionsRepository|undefined;
export function layoutDefinitionsRepository():LayoutDefinitionsRepository{return defaultRepository??=(process.env.CRC_AUTHORING_REHEARSAL!=='1'&&process.env.DATABASE_URL?new PgLayoutDefinitionsRepository():new MemoryLayoutDefinitionsRepository())}

/**
 * Startup registration (L3). Each server process registers the workspace's published data layouts
 * before it validates a draft or builds the MCP tool list, so a layout published through the MCP -
 * or on another instance - is accepted with no code change and no release. Re-read at most every
 * REGISTRY_REFRESH_MS; a store that cannot be read leaves the registry as it was (built-in layouts
 * always work) and says so once in the log.
 */
export const REGISTRY_REFRESH_MS=30_000;
let loaded:{at:number;promise:Promise<void>}|undefined;
export function ensurePublishedLayoutsRegistered(repository:LayoutDefinitionsRepository=layoutDefinitionsRepository(),now=Date.now()):Promise<void>{
 if(loaded&&now-loaded.at<REGISTRY_REFRESH_MS)return loaded.promise;
 const promise=registerPublishedLayouts(repository).then(()=>{},error=>{console.warn('layout definitions not registered',error instanceof Error?error.message:String(error))});
 loaded={at:now,promise};
 return promise;
}
