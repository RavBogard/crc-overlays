import {branding as defaultBranding,type OverlayBranding} from './branding.ts';
import {brandingCssVariables,hasAccentTypography} from './branding-palette.ts';
import {waitForRenderedOverlayAssets} from './overlay-assets.ts';
import {CORNER_CARD,cardStyle,resolveCueLayout,type CardDefinition,type LayoutRef,type ResolvedLayouts} from './layout-registry.ts';
import {acceptsRevision,effectFrames,easingFor,incomingStillDesired,measuredBottomTextHeight,textParts,tracksFor,type AnimationDirection,type AnimationTrack,type PlayerState} from './player-motion.ts';
export type CueTemplate={family?:'lower-third'|'panel-left'|'panel-right';version?:string;translatePx?:number};
export type ContentRow={he:string;tr:string;en:string};
export type CuePresentation={hebrewFontSize?:number;transliterationFontSize?:number;translationFontSize?:number;titleFontSize?:number;hebrewLineHeight?:number;transliterationLineHeight?:number;translationLineHeight?:number;titleLineHeight?:number;hebrewLetterSpacing?:number;transliterationLetterSpacing?:number;translationLetterSpacing?:number;titleLetterSpacing?:number;hebrewFontFamily?:'noto-sans'|'david-libre'|'frank-ruhl-libre';bottomLayout?:'columns'|'stacked';bottomSplit?:number;verticalAlignment?:'top'|'center'|'bottom';legacyTitleWatermark?:boolean;keepHyphenatedWords?:boolean;largePrint?:boolean;alignment?:'start'|'center';lineSpacing?:'compact'|'spacious';imageAssetId?:string;latinLineBreaks?:'preserve'|'paragraphs'|'phrases'};
export type Cue={id:string;name:string;layout:string;texts:Record<string,string>;animations:AnimationTrack[];duration:Record<string,number>;presentation?:CuePresentation;template?:CueTemplate;contentRows?:ContentRow[];rowOrder?:Array<keyof ContentRow>;hidden?:boolean;aliasOf?:string;layoutRef?:LayoutRef};
/** `layouts`: the catalog envelope's pinned data-layout definitions (lib/layout-registry.ts resolveCueLayout); read on every render, so a caller may keep adding to the same object. */
export type PlayerOptions={resolveAssetUrl?:(cue:Cue)=>string|undefined|Promise<string|undefined>;waitForAssets?:(root:HTMLElement)=>Promise<void>;layouts?:ResolvedLayouts};
/** Display-only reflow for semantic English channels. Blank lines remain stanza boundaries; an edge newline is not a phrase break. */
export function reflowLatinParagraphs(text:string,separator=' '){return text.replace(/\r\n?/g,'\n').replace(/\n[\t ]*(?=\n)/g,'\n').replace(/^\s*\n[\t ]*|[\t ]*\n\s*$/g,'').split(/(\n{2,})/).map(part=>part.startsWith('\n')?part:part.replace(/[\t ]*\n[\t ]*/g,separator)).join('')}
/** Reflow only contiguous Latin runs in a legacy mixed body. Hebrew and blank stanza lines are boundaries. */
export function reflowLatinRuns(text:string,separator=' '){
 const output:string[]=[],run:string[]=[],flush=()=>{if(!run.length)return;const value=run.join('\n');output.push(/[A-Za-z]/.test(value)?reflowLatinParagraphs(value,separator):value);run.length=0};
 for(const line of text.replace(/\r\n?/g,'\n').split('\n')){
  if(!line.trim()||/[\u0590-\u05FF]/.test(line)){flush();output.push(line)}else run.push(line);
 }
 flush();return output.join('\n');
}
export function displayPresentationText(text:string,element:string,presentation:CuePresentation|undefined){
 const typedEnglish=element==='textMainEng'||element==='textTranslation';
 const legacyEnglish=element==='textMain'&&/[A-Za-z]/.test(text);
 const mode=presentation?.latinLineBreaks;
 const separator=mode==='phrases'?' · ':' ';
 const reflowed=(mode==='paragraphs'||mode==='phrases')&&(typedEnglish||legacyEnglish)
  ?(typedEnglish||!/[\u0590-\u05FF]/.test(text)?reflowLatinParagraphs(text,separator):reflowLatinRuns(text,separator)):text;
 // A local wording override's deliberate line break travels through cue construction as
 // U+2028 so paragraph/phrase reflow cannot erase it. Turn it back into a visible LF only
 // after that reflow; CSS white-space:pre-wrap renders LF as the intended new line.
 const displayed=reflowed.replace(/\u2028/g,'\n');
 return presentation?.keepHyphenatedWords?keepHyphenatedWordsTogether(displayed):displayed;
}
/** Display-only wrapping guards. Leave stored source and local wording untouched. */
export function keepHyphenatedWordsTogether(text:string){return text.replace(/(?<=[\p{L}\p{N}\p{M}])[-\u2010](?=[\p{L}\p{N}\p{M}])/gu,'\u2011').replace(/(?<=[\u0590-\u05ff])\u05be(?=[\u0590-\u05ff])/gu,'\u2060\u05be\u2060')}
export function legacyTitleDisplay(text:string){return text.normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g,'').normalize('NFC')}
export function presentationTextStyles(presentation:CuePresentation|undefined){return {textAlign:presentation?.alignment,lineHeight:presentation?.lineSpacing==='compact'?'1.12':presentation?.lineSpacing==='spacious'?'1.42':undefined}}
export function usesPanelRows(cue:Pick<Cue,'layout'|'contentRows'>){return (cue.layout==='left'||cue.layout==='right')&&Boolean(cue.contentRows?.length)}
// A layer the author did not light is absent from the row, not an empty box: an empty div still
// carries the channel's top margin, and a row of three boxes for one line of Hebrew is not a row.
export function panelRowChannels(row:ContentRow,order?:ReadonlyArray<keyof ContentRow>){const channels={he:{classes:'row-hebrew',text:row.he,element:'textMainheb',animationElement:'textMainheb'},tr:{classes:'row-transliteration',text:row.tr,element:'textMainEng',animationElement:'textMainEng'},en:{classes:'row-translation',text:row.en,element:'textTranslation',animationElement:'textMainEng'}};return (order?.length===3?order:(['he','tr','en'] as const)).map(layer=>channels[layer]).filter(item=>item.text.trim().length>0)}
// A stacked two-channel panel reads Hebrew first, then its transliteration beneath it, so the
// Hebrew block takes the top of the body and the English block follows the measured gap. The
// arguments keep their order - the caller measures English then Hebrew - and so do the CSS
// variables this feeds (--panel-hebrew-top, --panel-english-top); only the stack changed.
export function panelStackGeometry(englishScrollHeight:number,hebrewScrollHeight:number,bodyTop=184,bodyHeight=840,minGap=18,maxGap=88,verticalAlignment:'top'|'center'|'bottom'='center'){const englishHeight=Math.max(0,Math.ceil(englishScrollHeight)),hebrewHeight=Math.max(0,Math.ceil(hebrewScrollHeight)),free=Math.max(0,bodyHeight-englishHeight-hebrewHeight),gap=Math.min(free,Math.max(minGap,Math.min(maxGap,Math.floor(free*.28)))),outer=verticalAlignment==='top'?0:verticalAlignment==='bottom'?Math.max(0,free-gap):Math.floor((free-gap)/2);return {hebrewTop:bodyTop+outer,hebrewHeight,gap,englishTop:bodyTop+outer+hebrewHeight+gap,englishHeight}}
export function panelRowGap(contentHeights:number[],bodyHeight=844,minGap=12,maxGap=56){if(contentHeights.length<2)return 0;const free=Math.max(0,bodyHeight-contentHeights.reduce((sum,height)=>sum+Math.max(0,Math.ceil(height)),0));return Math.max(0,Math.min(maxGap,Math.max(Math.min(minGap,free/(contentHeights.length-1)),Math.floor(free/(contentHeights.length+1)))))}
function fitPanelCopy(box:HTMLElement,cue:Cue){
 const english=box.querySelector<HTMLElement>('.english:not(.single-channel)'),hebrew=box.querySelector<HTMLElement>('.hebrew:not(.single-channel)'),translation=box.querySelector<HTMLElement>('.translation:not(.single-channel)'),second=hebrew??translation;if(!english||!second)return;
 const hasHebrew=Boolean(hebrew);english.style.height='auto';second.style.height='auto';
 const elements=[english,second],initial=elements.map(element=>parseFloat(getComputedStyle(element).fontSize)),floors=[Math.min(initial[0],29),Math.min(initial[1],hasHebrew?35:26)],maxima=[Math.max(initial[0],40),Math.max(initial[1],hasHebrew?48:32)],mayGrow=[cue.presentation?.transliterationFontSize===undefined,hasHebrew?cue.presentation?.hebrewFontSize===undefined:cue.presentation?.translationFontSize===undefined],measure=()=>english.scrollHeight+second.scrollHeight;
 if(!cue.presentation?.largePrint)for(let attempt=0;attempt<16&&measure()+18>840;attempt++)for(const [index,element] of elements.entries())element.style.fontSize=`${Math.max(floors[index],parseFloat(getComputedStyle(element).fontSize)-1)}px`;
 for(let attempt=0;attempt<16&&measure()+18<605;attempt++){const before=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));let changed=false;for(const [index,element] of elements.entries())if(mayGrow[index]&&before[index]<maxima[index]){element.style.fontSize=`${before[index]+1}px`;changed=true}if(!changed)break;if(measure()+18>840){elements.forEach((element,index)=>element.style.fontSize=`${before[index]}px`);break}}
 box.dataset.fit=measure()+18<=840?'fit':'overflow';let geometry=panelStackGeometry(english.scrollHeight,second.scrollHeight,184,840,18,88,cue.presentation?.verticalAlignment);const publish=()=>{for(const [name,value] of Object.entries(geometry))box.style.setProperty(`--panel-${name.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}`,`${value}px`)};publish();english.style.height='';second.style.height='';for(let attempt=0;attempt<3;attempt++){const next=panelStackGeometry(Math.max(english.scrollHeight,english.clientHeight),Math.max(second.scrollHeight,second.clientHeight),184,840,18,88,cue.presentation?.verticalAlignment);if(next.englishHeight===geometry.englishHeight&&next.hebrewHeight===geometry.hebrewHeight)break;geometry=next;publish()}
}
function fitPanelRows(box:HTMLElement,cue:Cue){
 const rows=box.querySelector<HTMLElement>('.panel-rows');if(!rows)return;rows.style.height='auto';
 const budget=842,rowElements=Array.from(rows.querySelectorAll<HTMLElement>('.content-row')),selectors=['.row-hebrew','.row-transliteration','.row-translation'],defaults={floors:[34,28,23],maxima:[44,36,28]},channels=selectors.map(selector=>Array.from(rows.querySelectorAll<HTMLElement>(selector))),initial=channels.map((items,index)=>items.length?parseFloat(getComputedStyle(items[0]).fontSize):defaults.floors[index]),floors=initial.map((value,index)=>Math.min(value,defaults.floors[index])),maxima=initial.map((value,index)=>Math.max(value,defaults.maxima[index])),mayGrow=[cue.presentation?.hebrewFontSize===undefined,cue.presentation?.transliterationFontSize===undefined,cue.presentation?.translationFontSize===undefined].map((allowed,index)=>allowed&&channels[index].length>0),setChannel=(index:number,value:number)=>channels[index].forEach(element=>element.style.fontSize=`${value}px`),font=(index:number)=>channels[index].length?parseFloat(getComputedStyle(channels[index][0]).fontSize):initial[index],heights=()=>rowElements.map(row=>Math.ceil(Math.max(row.scrollHeight,row.offsetHeight))),total=()=>heights().reduce((sum,height)=>sum+height,0),minimumGap=rowElements.length>=4?4:12;
 if(!cue.presentation?.largePrint)for(let attempt=0;attempt<16&&total()+Math.max(0,rowElements.length-1)*minimumGap>budget;attempt++)channels.forEach((_,index)=>setChannel(index,Math.max(floors[index],font(index)-1)));
 for(let attempt=0;attempt<16&&total()+Math.max(0,rowElements.length-1)*16<700;attempt++){const before=channels.map((_,index)=>font(index));let changed=false;channels.forEach((_,index)=>{if(mayGrow[index]&&before[index]<maxima[index]){setChannel(index,before[index]+1);changed=true}});if(!changed)break;if(total()+Math.max(0,rowElements.length-1)*minimumGap>budget){before.forEach((value,index)=>setChannel(index,value));break}}
 const gap=panelRowGap(heights(),budget,minimumGap,rowElements.length>=4?24:56),fit=total()+gap*Math.max(0,rowElements.length-1)<=budget?'fit':'overflow';rows.style.setProperty('--panel-row-gap',`${gap}px`);rows.dataset.fit=fit;box.dataset.fit=fit;rows.style.height=''
}
// C6: a lower third may carry a translation as a third line beneath its two columns. The bar
// already grows with its text; the translation's own height and the gap above it are published
// as their own variables so the columns sit above it rather than behind it.
export function constrainedBottomTextHeight(measuredHeight:number,overflow:number){return Math.max(0,Math.ceil(measuredHeight))+Math.max(0,Math.ceil(overflow))}
/** The lower third's original side-by-side columns: transliteration 730px and Hebrew 850px across
 * the 1610px lane, 30px apart. `bottomSplit` moves the divider: the percentage of the two columns'
 * shared width that the transliteration takes (20-80). Absent, the columns are the original ones. */
export const BOTTOM_COLUMNS={lane:1610,gap:30,latin:730,hebrew:850,minSplit:20,maxSplit:80} as const;
export function bottomColumnWidths(split?:number):[number,number]{
 const {lane,gap,latin,hebrew,minSplit,maxSplit}=BOTTOM_COLUMNS;
 if(typeof split!=='number'||!Number.isFinite(split))return [latin,hebrew];
 const shared=lane-gap,first=Math.round(shared*Math.min(maxSplit,Math.max(minSplit,split))/100);
 return [first,shared-first];
}
/** The divider's default position, as a percentage, for the editor's slider. */
export const BOTTOM_DEFAULT_SPLIT=Math.round(BOTTOM_COLUMNS.latin/(BOTTOM_COLUMNS.lane-BOTTOM_COLUMNS.gap)*100);
type BottomLayer='he'|'tr'|'en';
/** Grid rows for a lower third. Stacked: one row per language in order. Side by side: the
 * transliteration and Hebrew share a row, and the translation sits above it only when the order
 * puts it ahead of both. */
export function bottomRows(order:readonly BottomLayer[]|undefined,stacked:boolean,present:readonly BottomLayer[]):Partial<Record<BottomLayer,number>>{
 const fallback:readonly BottomLayer[]=['he','tr','en'];
 const sequence=(order&&order.length===3?order:fallback).filter(layer=>present.includes(layer));
 if(stacked)return Object.fromEntries(sequence.map((layer,index)=>[layer,index+1]));
 const translationFirst=sequence[0]==='en'&&sequence.length>1;
 const rows:Partial<Record<BottomLayer,number>>={};
 for(const layer of sequence)rows[layer]=layer==='en'?(translationFirst?1:2):(translationFirst?2:1);
 return rows;
}
function fitBottomBody(box:HTMLElement,cue:Cue){
 const body=box.querySelector<HTMLElement>('.bottom-body');if(!body)return;
 const stacked=cue.presentation?.bottomLayout==='stacked';body.dataset.layout=stacked?'stacked':'columns';
 const layer=(el:HTMLElement):BottomLayer=>el.dataset.element==='textMainheb'?'he':el.dataset.element==='textTranslation'?'en':'tr';
 const prayers=Array.from(body.querySelectorAll<HTMLElement>('.prayer:not(.single-channel)'));
 const rows=bottomRows(cue.rowOrder,stacked,prayers.map(layer));
 for(const el of prayers){el.style.gridRow=String(rows[layer(el)]??1);if(stacked)el.style.textAlign=cue.presentation?.alignment==='center'?'center':layer(el)==='he'?'right':'left'}
 body.style.gridTemplateColumns=stacked?'':bottomColumnWidths(cue.presentation?.bottomSplit).map(width=>`${width}px`).join(' ');
 body.style.height='auto';
 // A Hebrew line's vowels can reach below its box. The body's scroll height already holds the last
 // row's; an earlier row's pushes the rows under it down, as the separate boxes always did.
 const all=Array.from(body.querySelectorAll<HTMLElement>('.prayer')),lastRow=Math.max(0,...all.map(el=>el.offsetTop));
 const earlier=Math.max(0,...all.filter(el=>el.offsetTop<lastRow).map(el=>el.scrollHeight-el.clientHeight));
 box.style.setProperty('--bottom-text-height',`${measuredBottomTextHeight([body.scrollHeight+earlier])}px`);
 body.style.height='';
}
/** Place the lower third's Hebrew title so its ink - letters and every vowel above or below them -
 * sits inside the title strip, centred; a title whose ink is taller than the strip steps down in
 * size until it fits. Measured from the glyphs themselves, since a line box does not contain nikkud. */
function fitBottomAccentTitle(box:HTMLElement){
 const title=box.querySelector<HTMLElement>('.title-accent'),strip=box.querySelector<HTMLElement>('.titlebar:not(.titlegrad)');
 if(!title||!strip||typeof document==='undefined')return;
 const canvas=document.createElement('canvas') as HTMLCanvasElement,context=typeof canvas.getContext==='function'?canvas.getContext('2d'):null;if(!context)return;
 const style=getComputedStyle(title),text=(title.textContent||'').trim();if(!text)return;
 const stripHeight=strip.offsetHeight,room=Math.max(0,stripHeight-6);
 let size=parseFloat(style.fontSize)||36;
 const ink=(px:number)=>{context.font=`${style.fontStyle} ${style.fontWeight} ${px}px ${style.fontFamily}`;context.direction='rtl';const m=context.measureText(text);return {above:m.actualBoundingBoxAscent,below:m.actualBoundingBoxDescent,ascent:m.fontBoundingBoxAscent,descent:m.fontBoundingBoxDescent}};
 let m=ink(size);if(![m.above,m.below,m.ascent,m.descent].every(Number.isFinite))return;
 for(let step=0;step<40&&m.above+m.below>room&&size>16;step++){size-=1;m=ink(size)}
 if(size!==parseFloat(style.fontSize))title.style.fontSize=`${size}px`;
 // One line box exactly as tall as the font's own extent: its baseline sits `ascent` below the top.
 const line=Math.ceil(m.ascent+m.descent);
 title.style.lineHeight=`${line}px`;title.style.height=`${line}px`;
 const inkTop=strip.offsetTop+(stripHeight-(m.above+m.below))/2;
 title.style.top=`${Math.round(inkTop-(m.ascent-m.above))}px`;title.style.bottom='auto';
}
/** Respect authored order on fixed cards and legacy two-block panels as well as structured rows. */
function fitChannelOrder(box:HTMLElement,cue:Cue){
 if(!cue.rowOrder||cue.layout==='bottom'||usesPanelRows(cue))return;
 const channels=Array.from(box.querySelectorAll<HTMLElement>('.prayer:not(.single-channel)'));
 if(channels.length<2)return;
 const layer=(el:HTMLElement)=>el.classList.contains('hebrew')?'he':el.classList.contains('translation')?'en':'tr';
 const positioned=channels.map(el=>({el,top:el.offsetTop,height:el.offsetHeight})).sort((a,b)=>a.top-b.top);
 const gap=Math.max(0,positioned[1].top-positioned[0].top-positioned[0].height);
 let top=positioned[0].top;
 positioned.sort((a,b)=>cue.rowOrder!.indexOf(layer(a.el))-cue.rowOrder!.indexOf(layer(b.el))).forEach(({el,height})=>{el.style.top=`${top}px`;el.style.bottom='auto';top+=height+gap});
}
// A card's boxes are fixed by its definition (lib/layout-registry.ts), so its fit strategy decides
// what a line too long for its box does. `shrink-to-floor` (the corner card's) steps it down a
// pixel at a time to a readable floor rather than spilling out of the card. Hebrew keeps the fit
// check's font-metric allowance (FONT_METRIC_TOLERANCE in app/author/preview.ts) so its taller
// glyph box alone never shrinks a line that visibly fits.
export const CORNER_FONT_FLOOR=CORNER_CARD.fit.floor;
function fitShrinkToFloor(box:HTMLElement,card:CardDefinition,cue:Cue){const {floor,maxSteps,glyphTolerance}=card.fit;let fits=true;for(const el of box.querySelectorAll<HTMLElement>('.title:not(.title-accent),.prayer')){const tolerance=/[֐-׿]/.test(el.textContent||'')?glyphTolerance:0,over=()=>el.scrollHeight>el.clientHeight+tolerance||el.scrollWidth>el.clientWidth+tolerance;let size=parseFloat(getComputedStyle(el).fontSize);const authoredTitle=el.classList.contains('title')&&cue.presentation?.titleFontSize!==undefined;if(box.dataset.largePrint!=='true'&&!authoredTitle)for(let attempt=0;attempt<maxSteps&&size>floor&&over();attempt++){size=Math.max(floor,size-1);el.style.fontSize=`${size}px`}if(over())fits=false}box.dataset.fit=fits?'fit':'overflow'}
const CARD_FIT:Record<CardDefinition['fit']['strategy'],(box:HTMLElement,card:CardDefinition,cue:Cue)=>void>={'shrink-to-floor':fitShrinkToFloor};
function applyPresentationTypography(box:HTMLElement,presentation:CuePresentation){
 const roles=[
  {selector:'.hebrew,.row-hebrew',size:presentation.hebrewFontSize,line:presentation.hebrewLineHeight,spacing:presentation.hebrewLetterSpacing},
  {selector:'.english,.row-transliteration',size:presentation.transliterationFontSize,line:presentation.transliterationLineHeight,spacing:presentation.transliterationLetterSpacing},
  {selector:'.translation,.row-translation',size:presentation.translationFontSize,line:presentation.translationLineHeight,spacing:presentation.translationLetterSpacing},
  {selector:'.title',size:box.classList?.contains('left')||box.classList?.contains('right')?undefined:presentation.titleFontSize,line:presentation.titleLineHeight,spacing:presentation.titleLetterSpacing},
 ];
 const combined=box.querySelector<HTMLElement>('.combined');const pureHebrew=Boolean(combined&&/[\u0590-\u05ff]/.test(combined.textContent??'')&&!/[A-Za-z]/.test(combined.textContent??''));if(combined){const role=pureHebrew&&(presentation.hebrewFontSize!==undefined||presentation.hebrewLineHeight!==undefined||presentation.hebrewLetterSpacing!==undefined||presentation.hebrewFontFamily!==undefined)?roles[0]:!pureHebrew&&(presentation.translationFontSize!==undefined||presentation.translationLineHeight!==undefined||presentation.translationLetterSpacing!==undefined)?roles[2]:roles[1];roles.push({...role,selector:'.combined'})}
 for(const {selector,size,line,spacing} of roles)box.querySelectorAll<HTMLElement>(selector).forEach(el=>{if(typeof size==='number'&&Number.isFinite(size)&&size>=20&&size<=72)el.style.fontSize=`${size}px`;if(typeof line==='number'&&Number.isFinite(line))el.style.lineHeight=String(line);if(typeof spacing==='number'&&Number.isFinite(spacing))el.style.letterSpacing=`${spacing}px`});
 if(presentation.hebrewFontFamily){const families={'noto-sans':'"Noto Sans Hebrew", "Noto Sans Arabic", Arial, sans-serif','david-libre':'"David Libre", "Noto Sans Hebrew", Arial, sans-serif','frank-ruhl-libre':'"Frank Ruhl Libre", "Noto Sans Hebrew", Arial, serif'};box.querySelectorAll<HTMLElement>('.hebrew,.row-hebrew,.title-accent').forEach(el=>el.style.fontFamily=families[presentation.hebrewFontFamily!]);if(pureHebrew&&combined)combined.style.fontFamily=families[presentation.hebrewFontFamily]}
}
// Auto-fit must always start from the template's own base sizes (plus any authored
// override) so that re-fitting after fonts and artwork load cannot shrink cumulatively.
function resetFitBaseline(box:HTMLElement,cue:Cue){box.querySelectorAll<HTMLElement>('.prayer,.title').forEach(el=>{el.style.fontSize=''});if(cue.presentation)applyPresentationTypography(box,cue.presentation)}
/** Keep the decorative title lettering within the strip's uninterrupted lane beside the logo. */
function keepWatermarkClearOfLogo(box:HTMLElement){
 const watermark=box.querySelector<HTMLElement>('.title-watermark'),strip=box.querySelector<HTMLElement>('.titlebar:not(.titlegrad)'),logo=box.querySelector<HTMLElement>('.logo');if(!watermark||!strip||!logo)return;
 const stripLeft=strip.offsetLeft,stripRight=stripLeft+strip.offsetWidth,stripTop=strip.offsetTop,stripBottom=stripTop+strip.offsetHeight;
 const logoLeft=logo.offsetLeft,logoRight=logoLeft+logo.offsetWidth,logoTop=logo.offsetTop,logoBottom=logoTop+logo.offsetHeight;
 let safeLeft=stripLeft,safeRight=stripRight;
 if(logoTop<stripBottom&&logoBottom>stripTop&&logoLeft<stripRight&&logoRight>stripLeft){
  const gap=12,leftRoom=Math.max(0,logoLeft-gap-stripLeft),rightRoom=Math.max(0,stripRight-logoRight-gap);
  if(leftRoom>=rightRoom)safeRight=Math.max(stripLeft,logoLeft-gap);else safeLeft=Math.min(stripRight,logoRight+gap);
 }
 watermark.style.left=`${safeLeft}px`;watermark.style.right='auto';watermark.style.width=`${Math.max(0,safeRight-safeLeft)}px`;
 watermark.style.visibility=safeRight-safeLeft<24?'hidden':'';
}
/** A card that leads with a name (CardDefinition body.lead): one left-to-right line per written line, the first marked as the lead. */
function splitLeadLines(channel:HTMLElement){
 const lines=(channel.textContent||'').split('\n');
 channel.replaceChildren(...lines.map((text,index)=>{const line=document.createElement('div');line.className=index===0?'card-line card-line-lead':'card-line';line.textContent=text;return line}));
 channel.dataset.lead='';
}
export class Player{
 root:HTMLElement; cues:Cue[]; branding:OverlayBranding; options:PlayerOptions; current:Cue|null=null; desired:PlayerState={cue:null,revision:0,mode:'animate'};revision=0;busy=false;generation=0;phase='settled';
 constructor(root:HTMLElement,cues:Cue[],branding:OverlayBranding=defaultBranding,options:PlayerOptions={}){this.root=root;this.cues=cues;this.branding=branding;this.options=options}
 set(state:PlayerState){if(!acceptsRevision(state,this.desired))return;this.desired=state;if(state.mode==='cut'){this.generation++;this.root.getAnimations({subtree:true}).forEach(a=>a.cancel());this.root.replaceChildren();this.current=null;this.revision=state.revision;this.phase='settled';this.busy=false;return}void this.drain()}
 dispose(){this.generation++;this.root.getAnimations({subtree:true}).forEach(a=>a.cancel());this.root.replaceChildren()}
 /**
  * Whether the renderer's stage is claimed: a graphic is requested, or settled, or still in the
  * DOM on its way in or out. The sibling layers that share the 1920x1080 frame ask this rather
  * than reading `current` or `phase`, because neither one alone answers the question:
  *
  *   in        `desired.cue` is set the instant the command lands, before anything paints, so a
  *             resting layer is gone before the graphic arrives rather than a frame after it.
  *   A to B    `desired.cue` is never null across a replacement, so nothing flashes between them.
  *   out       `desired.cue` is already null while the Out animation runs, but `current` and the
  *             box are still there, so a resting layer waits for the exit to finish.
  *   cut       `set()` clears all three synchronously, so the stage is free immediately.
  *
  * It reports the renderer's own stage only. It is not an on-air or tally signal, and it says
  * nothing about what a compositor is doing with the frame.
  */
 get occupied(){return this.desired.cue!==null||this.current!==null||this.root.childElementCount>0}
 render(c:Cue,imageAssetUrl?:string,retained?:HTMLElement){const noHebrewPanel=(c.layout==='left'||c.layout==='right')&&Boolean(c.texts.textMainEng&&c.texts.textTranslation&&!c.texts.textMainheb);let box:HTMLElement=document.createElement('div');box.className=`overlay ${c.layout}${noHebrewPanel?' panel-translation-stack':''}`;const definition=resolveCueLayout(c,this.options.layouts);/* A data layout's id is an author's word: it is not a class, so it can never match a rule meant for a built-in layout or a part. */if(c.layoutRef){box.className='overlay';box.dataset.layout=c.layout}if(definition?.contained)box.dataset.contain='';if(definition?.card){box.dataset.card=c.layout;for(const [name,value] of Object.entries(cardStyle(definition.card)))box.style.setProperty(name,value)}/* L4: every branding colour and font role, as the CSS variables app/overlay.css reads. */for(const [name,value] of Object.entries(brandingCssVariables(this.branding)))box.style.setProperty(name,value);/* G10: the accent title's stored size and weight switch on their rules; none stored, none match. */if(hasAccentTypography(this.branding))box.dataset.accentTypography='';if(c.presentation?.largePrint)box.dataset.largePrint='true';if(c.presentation?.verticalAlignment)box.dataset.verticalAlignment=c.presentation.verticalAlignment;if((c.layout==='left'||c.layout==='right')&&c.presentation?.legacyTitleWatermark&&c.texts.accentTextTitle)box.dataset.legacyTitleWatermark='true';
const add=(classes:string,text:string,name:string)=>{const el=document.createElement(classes==='logo'?'img':'div');el.className=`part ${classes}`;el.dataset.element=name;if(el instanceof HTMLImageElement){el.src=this.branding.logo;el.alt=this.branding.logoAlt}else el.textContent=text;box.appendChild(el);return el};
add('base','','baseMain');add('titlebar','','baseTitle');const grad=add('titlebar titlegrad','','baseTitleGrad');grad.style.setProperty('background',`linear-gradient(90deg,${this.branding.titleShade},${this.branding.titleColor})`,'important');add('accent','','accentLineBottom');
if((c.layout==='left'||c.layout==='right')&&c.presentation?.legacyTitleWatermark&&c.texts.accentTextTitle){const watermark=document.createElement('div');watermark.className='part title-watermark';watermark.dataset.element='accentTextTitle';watermark.textContent=legacyTitleDisplay(c.texts.accentTextTitle);watermark.setAttribute('aria-hidden','true');box.appendChild(watermark)}
if(c.texts.textTitle)add('title',c.texts.textTitle,'textTitle');if(c.texts.accentTextTitle&&!((c.layout==='left'||c.layout==='right')&&c.presentation?.legacyTitleWatermark))add('title title-accent',c.texts.accentTextTitle,'accentTextTitle');if(usesPanelRows(c)){const rows=document.createElement('div');rows.className='part panel-rows';rows.dataset.rowCount=String(c.contentRows!.length);for(const [index,content] of c.contentRows!.entries()){const row=document.createElement('div');row.className='content-row';row.dataset.row=String(index+1);for(const item of panelRowChannels(content,c.rowOrder)){const channel=document.createElement('div');channel.className=`prayer ${item.classes}`;channel.textContent=displayPresentationText(item.text,item.element,c.presentation);channel.dataset.element=item.element;channel.dataset.animationElement=item.animationElement;row.appendChild(channel)}rows.appendChild(row)}box.appendChild(rows)}else {const body=c.layout==='bottom'?document.createElement('div'):null;if(body){body.className='bottom-body';body.dataset.layout=c.presentation?.bottomLayout||'columns';box.appendChild(body)}for(const part of textParts(c.texts)){const el=add(part.classes,displayPresentationText(part.text,part.element,c.presentation),part.element);body?.appendChild(el)}}if(definition?.card?.body.lead)box.querySelectorAll<HTMLElement>('.prayer.single-channel').forEach(splitLeadLines);const logo=add('logo','','Image');if(logo instanceof HTMLImageElement&&imageAssetUrl)logo.src=imageAssetUrl;if(retained){
 const chrome=['baseMain','baseTitle','baseTitleGrad','accentLineBottom','Image'];
 for(const name of chrome){const existing=retained.querySelector<HTMLElement>(`[data-element="${name}"]`),replacement=box.querySelector<HTMLElement>(`[data-element="${name}"]`);if(existing&&replacement){/* The same artwork stays as it is: reassigning its src would reload it mid-change. */if(existing instanceof HTMLImageElement&&replacement instanceof HTMLImageElement&&existing.src!==replacement.src)existing.src=replacement.src;replacement.replaceWith(existing)}}
 retained.className=box.className;retained.style.cssText=box.style.cssText;for(const key of Object.keys(retained.dataset))delete retained.dataset[key];Object.assign(retained.dataset,box.dataset);retained.replaceChildren(...Array.from(box.childNodes));box=retained;
 }else this.root.replaceChildren(box);if(c.presentation){const styles=presentationTextStyles(c.presentation);box.querySelectorAll<HTMLElement>('.prayer').forEach(element=>{if(styles.textAlign)element.style.textAlign=styles.textAlign;if(styles.lineHeight)element.style.lineHeight=styles.lineHeight});applyPresentationTypography(box,c.presentation)}this.applyFit(box,c);return box}
 // Idempotent: safe to call again once fonts and artwork have settled, and every call
 // measures from the same baseline, so the final sizes never depend on the call count.
 applyFit(box:HTMLElement,cue:Cue):void{box.querySelectorAll<HTMLElement>('.prayer').forEach(el=>{el.style.top='';el.style.bottom=''});if(cue.layout==='bottom')box.querySelectorAll<HTMLElement>('.title-accent').forEach(el=>{el.style.top='';el.style.bottom='';el.style.height='';el.style.lineHeight=''});resetFitBaseline(box,cue);if((cue.layout==='left'||cue.layout==='right')&&!usesPanelRows(cue))fitPanelCopy(box,cue);if(cue.layout==='bottom'){fitBottomBody(box,cue);fitBottomAccentTitle(box)}const card=resolveCueLayout(cue,this.options.layouts)?.card;if(card)CARD_FIT[card.fit.strategy](box,card,cue);if(usesPanelRows(cue))fitPanelRows(box,cue);fitChannelOrder(box,cue);keepWatermarkClearOfLogo(box)}
 // Artwork that fails or times out falls back to the congregation branding logo so the
 // text cue still goes to air; font and layout failures still surface to the caller.
 async settleAssets(box:HTMLElement,imageAssetUrl?:string){const wait=this.options.waitForAssets??waitForRenderedOverlayAssets;try{await wait(box);return}catch(error){const logo=box.querySelector<HTMLImageElement>('img.logo');if(!imageAssetUrl||!logo||logo.src===this.branding.logo||(logo.complete&&Boolean(logo.naturalWidth)))throw error;logo.src=this.branding.logo;await wait(box)}}
 async animate(box:HTMLElement,c:Cue,direction:AnimationDirection,textOnly=false){
  const duration=c.duration[direction]||.5,translatePx=c.template?.translatePx||48;
  const elements=Array.from(box.querySelectorAll<HTMLElement>('[data-element]')).filter(el=>!textOnly||el.matches('.title,.title-watermark,.prayer'));
  const planned=elements.map(el=>{
   const name=el.dataset.animationElement||el.dataset.element||'';
   let tracks=tracksFor(name,direction,c.animations);
   if(!tracks.length&&(textOnly||el.matches('.title,.title-watermark')))tracks=[{element:name,direction,effect:{effect:'fade'},keyframes:[0,.25]}];
   return {el,tracks};
  });
  // A words-only change keeps the panel on screen, so the time the whole graphic's tracks give the
  // panel before its words move is dead air: the words' own timing starts at zero.
  const rangeOf=(track:AnimationTrack)=>track.keyframes?.length===2?track.keyframes:[0,duration];
  const lead=textOnly?Math.min(...planned.flatMap(({tracks})=>tracks.map(track=>rangeOf(track)[0]))):0;
  const shift=Number.isFinite(lead)?lead:0;
  const finished=planned.flatMap(({el,tracks})=>{
   el.style.visibility='';
   return tracks.map(track=>{const [start,end]=rangeOf(track),range=[start-shift,end-shift];const frames=effectFrames(track.effect,direction,translatePx);if(el.classList.contains('title-watermark'))for(const frame of frames)if(frame.opacity!==undefined)frame.opacity=Number(frame.opacity)*.14;return el.animate(frames,{duration:Math.max(1,(range[1]-range[0])*1000),delay:range[0]*1000,fill:'both',easing:easingFor(track.effect)}).finished});
  });
  box.style.visibility='';await Promise.all(finished);
 }
 async drain(){
  if(this.busy)return;this.busy=true;const g=this.generation;
  try{while(g===this.generation){
   if((this.current?.id??null)===this.desired.cue){this.revision=this.desired.revision;this.phase='settled';break}
   this.phase='transition';let retained:HTMLElement|undefined;
   if(this.current&&this.root.firstElementChild){
    const old=this.root.firstElementChild as HTMLElement;
    const next=this.cues.find(c=>c.id===this.desired.cue);
    const wordsOnly=this.current.layout==='left'&&!this.current.layoutRef&&next?.layout==='left'&&!next.layoutRef;
    await this.animate(old,this.current,'Out',wordsOnly);if(g!==this.generation)return;
    const latest=this.cues.find(c=>c.id===this.desired.cue);
    if(wordsOnly&&latest?.layout==='left'&&!latest.layoutRef)retained=old;
    else{if(wordsOnly){await this.animate(old,this.current,'Out');if(g!==this.generation)return}this.root.replaceChildren();this.current=null}
   }
   if(this.desired.cue){
    const cue=this.cues.find(c=>c.id===this.desired.cue);if(!cue)throw Error('Unknown cue');
    const imageAssetUrl=await this.options.resolveAssetUrl?.(cue);if(g!==this.generation)return;
    // A command may arrive during artwork lookup. Resolve the newest cue before replacing text.
    if(!incomingStillDesired(cue.id,this.desired)){continue}
    if(retained&&cue.layout!=='left')retained=undefined;
    const box=this.render(cue,imageAssetUrl,retained);
    if(retained)box.querySelectorAll<HTMLElement>('.title,.title-watermark,.prayer').forEach(el=>el.style.visibility='hidden');
    else box.style.visibility='hidden';
    await this.settleAssets(box,imageAssetUrl);if(g!==this.generation)return;
    this.applyFit(box,cue);await this.animate(box,cue,'In',Boolean(retained));if(g!==this.generation)return;
    this.current=cue;
   }
  }}catch{if(g===this.generation)this.phase='error'}finally{if(g===this.generation)this.busy=false}
 }

}


