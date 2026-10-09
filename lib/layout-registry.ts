/**
 * Every layout the renderer, the editor and the MCP accept. A layout id is a validated string, not
 * a closed union repeated across the code: registering a definition here is the one step that makes
 * validation accept a new layout. The built-in four stay code (ruling 7); layouts as data (packet L2)
 * register theirs through `registerLayout`.
 *
 * Plain type syntax only: lib/player.ts imports this file, and the renderer tests run it with
 * Node's type stripping.
 */
import type {AnimationTrack} from './player-motion.ts';
export type LayoutId=string;
/**
 * How a body channel's lines sit across its box. `start` and `end` are relative to the channel's
 * own `direction` and are resolved to a physical side before they reach CSS, so a line of the other
 * script in the box never flips it. `natural` aligns each line to its own start (CSS `start` under
 * `.prayer`'s unicode-bidi:plaintext): a Hebrew line right, a Latin line left.
 */
export type CardAlign='start'|'end'|'natural';
/** One text box of the card body, in card-local px (y from the card's top edge). */
export type CardChannel={y:number;height:number;fontSize:number;lineHeight:number;align:CardAlign;
 /** Omitted: the channel inherits the overlay's direction (ltr). */
 direction?:'ltr'|'rtl'};
/**
 * A card: a self-contained box on the 1920x1080 frame - surface, title strip with a flat logo,
 * an optional accent lane, and a text body - drawn by the one generic `.overlay[data-card]` block in
 * app/overlay.css from the custom properties the Player derives from this definition (cardStyle).
 * Every x/y is card-local, from the card's left and top edges; `frame.anchor` says which corner of
 * the frame the card is pinned to and `frame.inset` how far in, so the CSS can anchor on the same
 * edges and the parts keep their places whatever the stage's size.
 */
export type CardDefinition={
 frame:{anchor:'top-left'|'top-right'|'bottom-left'|'bottom-right';insetX:number;insetY:number;width:number;height:number};
 /** Corner radius of the surface, the title strip's height at the top, and the accent rule's at the bottom. */
 surface:{radius:number;stripHeight:number;ruleHeight:number};
 /** The flat logo in the title strip. */
 logo:{x:number;y:number;size:number};
 /** The title lane. With an accent title the accent takes the lane's far `accentWidth` px and the title ends `accentGap` before it. */
 title:{x:number;y:number;width:number;height:number;fontSize:number;lineHeight:number;accentWidth:number;accentGap:number};
 /**
  * The body's channels, sharing one x and width. `stacked` holds the Hebrew channel (`hebrew`)
  * over its transliteration or translation (`latin`); a lone channel takes `single`, which keeps any
  * direction its script's channel set.
  */
 body:{x:number;width:number;hebrew:CardChannel;latin:CardChannel;single:Omit<CardChannel,'direction'>;
  /**
   * Set only on a card that leads with a name (the name plate). The lone channel is then set line
   * by line: the first line at this size, each later line at `single`'s, every line left to right
   * as written, so "בֶּנְיָה | Benyah" keeps its Hebrew first. Omitted: one block in its natural direction.
   */
  lead?:{fontSize:number;lineHeight:number}};
 fit:{
  /** `shrink-to-floor`: each title and body box that does not fit steps down a pixel at a time to `floor`. */
  strategy:'shrink-to-floor';
  floor:number;
  /** At most this many 1 px steps per box. */
  maxSteps:number;
  /** Slack for a Hebrew line's taller glyph box (FONT_METRIC_TOLERANCE in app/author/preview.ts). */
  glyphTolerance:number;
  /**
   * The sparse-fill measure: text height over `denominator`, warned below `sparseBelow`. null: the
   * card reports no fill ratio and never warns sparse - a corner card is meant to hold a line or two.
   */
  fill:null|{denominator:number;sparseBelow:number};
  /** A native height the card must not exceed. null: the card's height is fixed by `frame`. */
  heightCeiling:number|null;
 };
};
export type LayoutDefinition={
 id:LayoutId;
 /** The operator's name for it. */
 label:string;
 /** Whose baseline motion and duration a draft in this layout borrows. The corner card has no baseline of its own. */
 templateLayout:LayoutId;
 /** The fit check holds the text to the layout's own card (`data-contain` on the overlay), not only the frame. */
 contained:boolean;
 capabilities:{
  /** A long reading can become an ordered set of slides in this layout. */
  sets:boolean;
  /** It can show a translation line. */
  translation:boolean;
  /** Each slide carries exactly one source block, so a second block always needs another slide. */
  oneBlockPerSlide:boolean;
 };
 /** Drawn and fitted as a card from this definition. The lower third and the panels are built-in layered CSS instead (ruling 7). */
 card?:CardDefinition;
 /**
  * Set only on a data layout (packet L2): the published version of its stored definition that a
  * graphic built now pins. Built-in layouts carry none, so their graphics carry no `layoutRef`.
  */
 ref?:LayoutRef;
 /** A data layout's own motion. A built-in layout's graphics take their template cue's instead. */
 motion?:LayoutMotion;
};

/**
 * Layouts as data (packet L2, R-L3/R-L5). A data layout is a card stored per workspace as a
 * versioned document (lib/layout-definitions.ts). A published graphic in one pins
 * `layoutRef{id,version,sha256}` inside its cue - and so inside `cueHash` - and every catalog and
 * relay payload that carries the graphic carries the pinned definition beside it, in `layouts`,
 * keyed by `layoutRefKey`. Editing a definition makes version N+1; a graphic stays on N until it
 * is republished or rebased.
 */
export type LayoutRef={id:LayoutId;version:number;sha256:string};
/** Named motion for a card: `card-scale` is the corner card's (bars scale in from the anchored edge, text fades); `fade` fades every part. */
export type MotionPreset='card-scale'|'fade';
export type LayoutMotion={preset:MotionPreset}|{tracks:AnimationTrack[];duration:{In:number;Out:number}};
/** What a data layout stores, one document per version. */
export type LayoutDocument={label:string;capabilities:LayoutDefinition['capabilities'];card:CardDefinition;motion:LayoutMotion};
/** One pinned definition as the catalog envelope and the relay carry it. */
export type ResolvedLayout=LayoutRef&{document:LayoutDocument};
export type ResolvedLayouts=Record<string,ResolvedLayout>;
export const layoutRefKey=(ref:Pick<LayoutRef,'id'|'version'>)=>`${ref.id}@${ref.version}`;
/**
 * The registry entry a stored document becomes. A data layout is always a contained card; it
 * names the lower third as its template layout only so the editor and `parseEditable` accept a
 * lower-third template id for its drafts - `buildCue` takes nothing from that template.
 */
export function definitionFromDocument(id:LayoutId,document:LayoutDocument,ref?:LayoutRef):LayoutDefinition{
 return {id,label:document.label,templateLayout:'bottom',contained:true,capabilities:document.capabilities,card:document.card,motion:document.motion,...(ref?{ref}:{})};
}
/**
 * The definition a cue renders with. A cue that pins a data layout renders from the pinned
 * definition in `resolved` (the envelope's `layouts`). If that exact version is missing - an
 * output page opened after a republish, holding the old graphic - it degrades to the newest
 * version of the same layout it was given, then to this process's registry. A cue without a
 * pin is a built-in layout and reads the registry, as every graphic did before L2.
 */
export function resolveCueLayout(cue:{layout:string;layoutRef?:LayoutRef},resolved?:ResolvedLayouts):LayoutDefinition|undefined{
 const ref=cue.layoutRef;
 if(!ref)return registry.get(cue.layout);
 const exact=resolved?.[layoutRefKey(ref)];
 if(exact&&exact.id===ref.id&&exact.sha256===ref.sha256)return definitionFromDocument(exact.id,exact.document,ref);
 const newest=Object.values(resolved??{}).filter(item=>item.id===ref.id).sort((a,b)=>b.version-a.version)[0];
 if(newest)return definitionFromDocument(newest.id,newest.document,{id:newest.id,version:newest.version,sha256:newest.sha256});
 const registered=registry.get(ref.id);
 return registered?.card?registered:undefined;
}

/**
 * The corner card: flush in the bottom-right corner for a line or two ("Vaimru Amen", "El Na Refa
 * Na La", a one-line thank-you); it replaces the old Singular bottom-right pop-up. It takes the same
 * 48px inset as the resting logo (RESTING_LOGO_RECT) and the scan card (BUG_RESERVED_RECT): the
 * resting logo steps aside while any cue holds the stage, and the scan card paints beneath the cue
 * layer (docs/RENDERER.md), so the corner card covers it.
 * Card x 1232..1872, y 832..1032. Title strip y 832..888 with the logo at its right end, like the
 * panels'. Body x 1264..1848, y 898..1018: Hebrew RTL and right-aligned above its left-aligned
 * transliteration; a lone channel (custom text, one English line) is centred in the whole body.
 */
export const CORNER_CARD:CardDefinition={
 frame:{anchor:'bottom-right',insetX:48,insetY:48,width:640,height:224},
 surface:{radius:18,stripHeight:80,ruleHeight:6},
 logo:{x:556,y:4,size:72},
 title:{x:32,y:4,width:508,height:72,fontSize:28,lineHeight:1.1,accentWidth:220,accentGap:12},
 body:{x:32,width:584,
  hebrew:{y:90,height:58,fontSize:40,lineHeight:1.24,direction:'rtl',align:'start'},
  latin:{y:154,height:56,fontSize:32,lineHeight:1.24,align:'start'},
  single:{y:90,height:120,fontSize:36,lineHeight:1.22,align:'natural'}},
 fit:{strategy:'shrink-to-floor',floor:20,maxSteps:40,glyphTolerance:6,fill:null,heightCeiling:null},
};
/**
 * The name plate: who is on the bimah - "Bar Mitzvah of" over the name, and beneath it a Hebrew
 * name with its transliteration. It is the corner card's surface and strip, centred along the
 * bottom of the frame like the old name plates, and wide enough for a full name.
 * Card x 520..1400, y 808..1032. Title strip y 808..888 with the logo at its right end; the heading
 * is 40px (the corner's is 28px) so it reads from the back. Body x 552..1368, y 896..1022: the name
 * at 52px, then the detail lines at 36px, all left-aligned.
 */
export const NAMEPLATE_CARD:CardDefinition={
 frame:{anchor:'bottom-left',insetX:520,insetY:48,width:880,height:224},
 surface:{radius:18,stripHeight:80,ruleHeight:6},
 logo:{x:796,y:4,size:72},
 title:{x:32,y:4,width:748,height:72,fontSize:40,lineHeight:1.1,accentWidth:260,accentGap:12},
 body:{x:32,width:816,
  hebrew:{y:90,height:58,fontSize:40,lineHeight:1.24,direction:'rtl',align:'start'},
  latin:{y:154,height:56,fontSize:32,lineHeight:1.24,align:'start'},
  single:{y:88,height:126,fontSize:36,lineHeight:1.2,align:'start'},
  lead:{fontSize:52,lineHeight:1.12}},
 fit:{strategy:'shrink-to-floor',floor:20,maxSteps:40,glyphTolerance:6,fill:null,heightCeiling:null},
};

/** The physical side a channel's lines align to (see CardAlign), or CSS `start` for `natural`. */
export function cardTextAlign(channel:Pick<CardChannel,'align'|'direction'>):'left'|'right'|'start'{
 if(channel.align==='natural')return 'start';
 return (channel.align==='start')===((channel.direction??'ltr')==='ltr')?'left':'right';
}
/**
 * The custom properties the Player sets on a card's box, which the `.overlay[data-card]` block in
 * app/overlay.css reads. Each part is placed from the frame edges the card is anchored to
 * (`--card-<part>-right` for a right-anchored card, `-left` otherwise; `-bottom` or `-top` likewise)
 * and the CSS leaves the other edge auto.
 */
export function cardStyle(card:CardDefinition):Record<string,string>{
 const {frame,surface,logo,title,body}=card,right=frame.anchor.endsWith('right'),bottom=frame.anchor.startsWith('bottom');
 const style:Record<string,string>={'--card-origin':`${right?'right':'left'} center`,'--card-radius':`${surface.radius}px`};
 const across=(part:string,x:number,width:number)=>{style[`--card-${part}-${right?'right':'left'}`]=`${frame.insetX+(right?frame.width-x-width:x)}px`;style[`--card-${part}-width`]=`${width}px`};
 const down=(part:string,y:number,height:number)=>{style[`--card-${part}-${bottom?'bottom':'top'}`]=`${frame.insetY+(bottom?frame.height-y-height:y)}px`;style[`--card-${part}-height`]=`${height}px`};
 across('base',0,frame.width);down('base',0,frame.height);
 across('strip',0,frame.width);down('strip',0,surface.stripHeight);
 across('rule',0,frame.width);down('rule',frame.height-surface.ruleHeight,surface.ruleHeight);
 across('logo',logo.x,logo.size);down('logo',logo.y,logo.size);
 across('title',title.x,title.width);down('title',title.y,title.height);
 style['--card-title-font-size']=`${title.fontSize}px`;style['--card-title-line-height']=String(title.lineHeight);
 across('accent',title.x+title.width-title.accentWidth,title.accentWidth);
 across('title-shared',title.x,title.width-title.accentWidth-title.accentGap);
 across('body',body.x,body.width);
 for(const [part,channel] of [['hebrew',body.hebrew],['latin',body.latin],['single',body.single]] as const){
  down(part,channel.y,channel.height);
  style[`--card-${part}-font-size`]=`${channel.fontSize}px`;style[`--card-${part}-line-height`]=String(channel.lineHeight);style[`--card-${part}-align`]=cardTextAlign(channel);
  if('direction' in channel&&channel.direction)style[`--card-${part}-direction`]=channel.direction;
 }
 // The lead line is sized relative to its channel, so the fit's shrink steps carry it down with the rest.
 if(body.lead){style['--card-lead-scale']=String(body.lead.fontSize/body.single.fontSize);style['--card-lead-line-height']=String(body.lead.lineHeight)}
 return style;
}

const BUILT_IN:readonly LayoutDefinition[]=[
 {id:'bottom',label:'Lower third',templateLayout:'bottom',contained:false,capabilities:{sets:true,translation:true,oneBlockPerSlide:true}},
 {id:'left',label:'Left panel',templateLayout:'left',contained:true,capabilities:{sets:true,translation:true,oneBlockPerSlide:false}},
 {id:'right',label:'Right panel',templateLayout:'right',contained:true,capabilities:{sets:true,translation:true,oneBlockPerSlide:false}},
 {id:'corner',label:'Corner',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true},card:CORNER_CARD},
 {id:'nameplate',label:'Name plate',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true},card:NAMEPLATE_CARD},
];
const registry=new Map<LayoutId,LayoutDefinition>(BUILT_IN.map(definition=>[definition.id,definition]));
// Companion reads a layout id as part of a variable name, so the id follows its grammar.
const LAYOUT_ID=/^[a-z][a-z0-9_-]{0,39}$/;

/** In catalog order: the lower third first, then the two panels, the corner card and the name plate, then any added. */
export function layoutIds():LayoutId[]{return [...registry.keys()]}
export function isLayoutId(value:unknown):value is LayoutId{return typeof value==='string'&&registry.has(value)}
export function layoutDefinition(id:LayoutId):LayoutDefinition|undefined{return registry.get(id)}
/** "bottom, left, right, corner, or nameplate" - for the sentence that refuses anything else. */
export function layoutChoices():string{const ids=layoutIds();return ids.length<2?ids.join(''):`${ids.slice(0,-1).join(', ')}, or ${ids[ids.length-1]}`}
export function registerLayout(definition:LayoutDefinition):void{
 if(!LAYOUT_ID.test(definition.id))throw new Error(`Layout id ${JSON.stringify(definition.id)} must start with a letter and use only a-z, 0-9, _ and -, up to 40 characters`);
 if(registry.has(definition.id))throw new Error(`Layout ${definition.id} is already registered`);
 if(!registry.has(definition.templateLayout)&&definition.templateLayout!==definition.id)throw new Error(`Layout ${definition.id} borrows motion from ${definition.templateLayout}, which is not registered`);
 registry.set(definition.id,definition);
}
/** Removes a layout added with `registerLayout`. The built-in layouts cannot be removed. */
export function unregisterLayout(id:LayoutId):void{if(isBuiltInLayout(id))throw new Error(`Layout ${id} is built in`);registry.delete(id)}
export function isBuiltInLayout(id:LayoutId):boolean{return BUILT_IN.some(definition=>definition.id===id)}
/**
 * Registers a data layout's newest published version, replacing the version registered before it
 * (lib/layout-definitions.ts calls this at load and on every publish). A built-in id is refused.
 */
export function registerDataLayout(definition:LayoutDefinition):void{
 if(isBuiltInLayout(definition.id))throw new Error(`Layout ${definition.id} is built in`);
 if(!definition.ref||!definition.card||!definition.motion)throw new Error(`Layout ${definition.id} is not a data layout`);
 const previous=registry.get(definition.id);
 if(previous&&!previous.ref)throw new Error(`Layout ${definition.id} is already registered`);
 if(previous&&previous.ref!.version>definition.ref.version)return;
 registry.delete(definition.id);
 registerLayout(definition);
}
