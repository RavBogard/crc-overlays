/**
 * D10 — a names list is an ordinary paired-row panel graphic, materialized into the
 * live catalog only.
 *
 * Pure: this module reads no database, no catalog file and no environment. It turns a
 * `NamesList` into `Cue[]` using exactly the structure `lib/authoring-model.ts`
 * `buildCue` emits for a bilingual panel with translation rows — `contentRows:[{he,tr,en}]`
 * — so `usesPanelRows`, `panelRowChannels`, `fitPanelRows` and `app/author/preview.ts`
 * all work unchanged. Nothing new is invented for the renderer.
 *
 * Motion (`animations`/`duration`) belongs to the baseline panel template, not to this
 * module: a template contributes only its layout, motion and duration (the same rule
 * `lib/template-looks.ts` states for the editor's tiles). `namesPanelMotion` derives it
 * purely from a baseline catalog the caller supplies, and `lib/server.ts` — the only
 * place that needs full catalog cues — passes it in. The default keeps the module usable
 * from the browser (the D12 measurement stage renders from layout, texts and rows alone;
 * `Player.render` never reads `animations`) without pulling the 300 KB baseline catalog
 * into a client bundle.
 */
import type {AnimationTrack} from './player-motion';
import type {Cue,CueTemplate} from './player';

/**
 * The refusal type for every /api/services operation. It is declared in this leaf module,
 * not in lib/service-collections.ts, so that a browser importing the pure names helpers
 * never pulls the services module - and with it the Postgres client - into a client
 * bundle. `lib/service-collections.ts` re-exports it under its established name, so every
 * existing `import {ServicesError} from './service-collections'` and every
 * `instanceof ServicesError` is unchanged.
 */
export class ServicesError extends Error{constructor(public code:string,message:string,public status=400){super(message)}}

export type NameRow={he:string;en:string};
export type NamesList={title:string;perPanel:number;rows:NameRow[];layout:'left'|'right';updatedAt:number;updatedBy:string};
/** Everything a names panel takes from a baseline panel template: motion only. */
export type PanelMotion={animations:AnimationTrack[];duration:Record<string,number>;template?:CueTemplate};

export const NAMES_TITLE_MAX=60;
export const NAMES_NAME_MAX=60;
export const NAMES_ROW_MAX=120;
export const NAMES_PER_PANEL_MIN=4;
export const NAMES_PER_PANEL_MAX=12;
export const NAMES_PER_PANEL_DEFAULT=8;

/** No motion at all: rendering and measuring a panel never reads these two fields. */
const STILL:PanelMotion={animations:[],duration:{}};

/** The same padding rule `lib/authoring.ts` uses for a published multipart set. */
export const panelWidth=(total:number)=>Math.max(2,String(total).length);
/** `<name> — NN of MM`, em dash, both numbers padded to one width. */
export function panelName(title:string,index:number,total:number){
 const width=panelWidth(total);
 return `${title} — ${String(index+1).padStart(width,'0')} of ${String(total).padStart(width,'0')}`;
}

/** The rows of each page, in order. An empty list produces no pages. */
export function namesPages(list:NamesList):NameRow[][]{
 // `parseNames` bounds perPanel, but an editor form can hold a half-typed number for a
 // keystroke: fall back to the default rather than stepping by NaN and never terminating.
 const size=Number.isInteger(list.perPanel)&&list.perPanel>0?list.perPanel:NAMES_PER_PANEL_DEFAULT;
 const pages:NameRow[][]=[];
 for(let start=0;start<list.rows.length;start+=size)pages.push(list.rows.slice(start,start+size));
 return pages;
}

/**
 * The renderer-visible half of one panel: what the measurement stage needs, and what
 * `namesPanelCues` stamps motion onto. An empty `he` or `en` renders an empty block for
 * that channel — no line box, no height — which is why a row may leave either side blank.
 */
export function namesPanelShapes(collectionId:string,list:NamesList):Pick<Cue,'id'|'name'|'layout'|'texts'|'contentRows'>[]{
 const pages=namesPages(list),width=panelWidth(pages.length);
 return pages.map((rows,index)=>({
  id:`names:${collectionId}:${String(index+1).padStart(width,'0')}`,
  name:panelName(list.title,index,pages.length),
  layout:list.layout,
  texts:{textTitle:list.title},
  contentRows:rows.map(row=>({he:row.he,tr:'',en:row.en})),
 }));
}

/**
 * The motion a names panel inherits, taken from the first baseline graphic of that layout
 * in catalog order (visible ones first, as `templateLooks` does). A baseline whose motion
 * still addresses the single `textMain` element is split into the two paired-row elements
 * exactly the way `buildCue` splits it for a bilingual draft.
 */
export function namesPanelMotion(baseline:readonly Cue[],layout:'left'|'right'):PanelMotion{
 const candidates=baseline.filter(cue=>cue.layout===layout);
 const template=candidates.find(cue=>!cue.hidden)??candidates[0];
 if(!template)return STILL;
 const animations=structuredClone(template.animations)??[];
 if(!animations.some(track=>track.element==='textMainheb'||track.element==='textMainEng')){
  const combined=animations.filter(track=>track.element==='textMain');
  if(combined.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMain')animations.splice(index,1);
   animations.push(...combined.flatMap(track=>[{...structuredClone(track),element:'textMainheb'},{...structuredClone(track),element:'textMainEng'}]));
  }
 }
 return {animations,duration:structuredClone(template.duration)??{},...(template.template?{template:structuredClone(template.template)}:{})};
}

/** One cue per page. Ids are `names:<collectionId>:<NN>`, inside every catalog id bound. */
export function namesPanelCues(collectionId:string,list:NamesList,motion:PanelMotion=STILL):Cue[]{
 return namesPanelShapes(collectionId,list).map(shape=>({
  ...shape,
  animations:structuredClone(motion.animations),
  duration:structuredClone(motion.duration),
  ...(motion.template?{template:structuredClone(motion.template)}:{}),
 }));
}

/** True for any id this module can mint — the one test that a cue is a names panel. */
export const isNamesCueId=(id:unknown)=>typeof id==='string'&&id.startsWith('names:');

function nameText(value:unknown,label:string){
 if(value===undefined||value===null)return '';
 if(typeof value!=='string')throw new ServicesError('invalid_names',`${label} must be text.`);
 const trimmed=value.trim();
 if(trimmed.length>NAMES_NAME_MAX)throw new ServicesError('invalid_names',`Each name must be ${NAMES_NAME_MAX} characters or fewer.`);
 return trimmed;
}

/** Throws `ServicesError` with a message an Editor can act on. */
export function parseNames(value:unknown,now=Date.now(),actor=''):NamesList{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ServicesError('invalid_names','Enter a list title and at least one name.');
 const input=value as Record<string,unknown>;
 const extra=Object.keys(input).filter(key=>!['title','perPanel','rows','layout'].includes(key));
 if(extra.length)throw new ServicesError('invalid_names',`This names list contains unsupported fields: ${extra.join(', ')}`);
 if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>NAMES_TITLE_MAX)throw new ServicesError('invalid_names',`Name this list, using ${NAMES_TITLE_MAX} characters or fewer.`);
 if(input.layout!=='left'&&input.layout!=='right')throw new ServicesError('invalid_names','Choose the left panel or the right panel.');
 const perPanel=input.perPanel===undefined?NAMES_PER_PANEL_DEFAULT:input.perPanel;
 if(!Number.isInteger(perPanel)||(perPanel as number)<NAMES_PER_PANEL_MIN||(perPanel as number)>NAMES_PER_PANEL_MAX)throw new ServicesError('invalid_names',`Names per panel must be a whole number from ${NAMES_PER_PANEL_MIN} to ${NAMES_PER_PANEL_MAX}.`);
 if(!Array.isArray(input.rows)||!input.rows.length)throw new ServicesError('invalid_names','Add at least one name.');
 if(input.rows.length>NAMES_ROW_MAX)throw new ServicesError('invalid_names',`A names list holds at most ${NAMES_ROW_MAX} names.`);
 const rows=input.rows.map((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ServicesError('invalid_names',`Row ${index+1} must have a Hebrew name, an English name, or both.`);
  const row=raw as Record<string,unknown>;
  const unsupported=Object.keys(row).filter(key=>!['he','en'].includes(key));
  if(unsupported.length)throw new ServicesError('invalid_names',`Row ${index+1} contains unsupported fields: ${unsupported.join(', ')}`);
  const he=nameText(row.he,`Row ${index+1} Hebrew name`),en=nameText(row.en,`Row ${index+1} English name`);
  if(!he&&!en)throw new ServicesError('invalid_names',`Row ${index+1} needs a Hebrew name or an English name.`);
  return {he,en};
 });
 return {title:input.title.trim(),perPanel:perPanel as number,rows,layout:input.layout,updatedAt:now,updatedBy:actor};
}
