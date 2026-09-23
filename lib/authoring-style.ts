import {LAYER_ORDER, type Draft, type DraftContent, type Layout, type Presentation, type TextArrangement, type TextLayer} from './authoring-model';
import {templateLayoutFor} from './layout-label';

/** The small template shape required to plan a look change. */
export type DraftStyleTemplate={id:string;layout:Layout};

export type DraftStyleOptions={
  /** Select this graphic surface, using a compatible baseline as its template. */
  layout?:Layout;
  /** Put each language in a contiguous reading block, or return to paired rows. */
  arrangement?:TextArrangement;
  /** Stack a side panel's layers in this order (he, tr, en once each). Hebrew, transliteration, translation is the default and is stored as absent. */
  rowOrder?:TextLayer[];
  /** Clear explicit density overrides while retaining artwork and alignment choices. */
  comfortableTypography?:boolean;
  /** Preserve authored Latin line breaks, or display soft breaks as paragraphs. */
  latinLineBreaks?:'preserve'|'paragraphs'|'phrases';
};

export type DraftStylePatch={layout?:Layout;templateCueId?:string;content?:DraftContent;presentation?:Presentation};
export type DraftStyleSummary={layout:Layout;templateCueId:string;arrangement:TextArrangement|null;rowOrder?:TextLayer[];presentation:Presentation};
export type DraftStylePlan={patch:DraftStylePatch;warnings:string[];before:DraftStyleSummary;after:DraftStyleSummary};

function arrangementOf(content:DraftContent):TextArrangement|null{
  const base=content.mode==='local-variant'?content.base:content;
  return base.mode==='bilingual'?(base.arrangement==='blocks'?'blocks':'together'):null;
}

/** A non-default row order only; the default reads as absent so summaries of existing drafts are unchanged. */
function rowOrderOf(content:DraftContent):TextLayer[]|undefined{
  const base=content.mode==='local-variant'?content.base:content;
  return base.mode==='bilingual'&&base.rowOrder?[...base.rowOrder]:undefined;
}

function withRowOrder(content:DraftContent, rowOrder:TextLayer[]):DraftContent|undefined{
  const base=content.mode==='local-variant'?content.base:content;
  if(base.mode!=='bilingual')return undefined;
  const nextBase={...base};
  if(same(rowOrder,LAYER_ORDER))delete nextBase.rowOrder;
  else nextBase.rowOrder=[...rowOrder];
  if(content.mode==='local-variant')return {...content,base:nextBase};
  return nextBase;
}

function withArrangement(content:DraftContent, arrangement:TextArrangement):DraftContent|undefined{
  const base=content.mode==='local-variant'?content.base:content;
  if(base.mode!=='bilingual')return undefined;
  const nextBase={...base};
  if(arrangement==='blocks')nextBase.arrangement='blocks';
  else delete nextBase.arrangement;
  if(content.mode==='local-variant')return {...content,base:nextBase};
  return nextBase;
}

function comfortable(presentation:Presentation):Presentation{
  const {hebrewFontSize,transliterationFontSize,titleFontSize,lineSpacing,...preserved}=presentation;
  void hebrewFontSize;void transliterationFontSize;void titleFontSize;void lineSpacing;
  return preserved;
}

function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b)}

function summary(draft:Pick<Draft,'layout'|'templateCueId'|'content'|'presentation'>):DraftStyleSummary{
  const rowOrder=rowOrderOf(draft.content);
  return {layout:draft.layout,templateCueId:draft.templateCueId,arrangement:arrangementOf(draft.content),...(rowOrder?{rowOrder}:{}),presentation:{...draft.presentation}};
}

/**
 * Plans only reusable visual defaults. It never touches text groups, source snapshots, source
 * pins, titles, or local-variant overrides; the MCP layer applies the returned patch with its
 * own optimistic-version check.
 */
export function planDraftStyle(draft:Draft, options:DraftStyleOptions, templates:readonly DraftStyleTemplate[]):DraftStylePlan{
  const patch:DraftStylePatch={},warnings:string[]=[];
  let afterLayout=draft.layout,afterTemplateCueId=draft.templateCueId,afterContent=draft.content,afterPresentation=draft.presentation;

  if(options.layout!==undefined){
    const templateLayout=templateLayoutFor(options.layout);
    const existing=templates.find(template=>template.id===draft.templateCueId&&template.layout===templateLayout);
    const compatible=existing??templates.filter(template=>template.layout===templateLayout).sort((a,b)=>a.id.localeCompare(b.id))[0];
    if(!compatible)warnings.push(`No compatible ${options.layout} template is available; layout was not changed.`);
    else {
      if(options.layout!==draft.layout)patch.layout=options.layout;
      if(compatible.id!==draft.templateCueId)patch.templateCueId=compatible.id;
      afterLayout=options.layout;afterTemplateCueId=compatible.id;
    }
  }

  const requestedArrangement=options.arrangement??'blocks';
  if(options.arrangement!==undefined||arrangementOf(draft.content)!==null){
    const next=withArrangement(draft.content,requestedArrangement);
    if(!next&&options.arrangement!==undefined)warnings.push('Arrangement applies only to bilingual content or a local variant with a bilingual base.');
    else if(next&&arrangementOf(draft.content)!==requestedArrangement){patch.content=next;afterContent=next;}
  }

  if(options.rowOrder!==undefined){
    const next=withRowOrder(afterContent,options.rowOrder);
    if(!next)warnings.push('Row order applies only to bilingual content or a local variant with a bilingual base.');
    else {
      if(!same(rowOrderOf(next),rowOrderOf(afterContent))){patch.content=next;afterContent=next;}
      if(afterLayout!=='left'&&afterLayout!=='right')warnings.push('Row order shows only on a left or right panel; a lower third keeps its own columns.');
    }
  }

  const readablePresentation=options.comfortableTypography!==false?comfortable(draft.presentation):{...draft.presentation};
  // The style operation deliberately opts into paragraph display. Legacy drafts that never
  // pass through this operation retain their absent (preserve) setting.
  const latinLineBreaks=options.latinLineBreaks??'paragraphs';
  const nextPresentation={...readablePresentation,latinLineBreaks};
  if(!same(nextPresentation,draft.presentation)){patch.presentation=nextPresentation;afterPresentation=nextPresentation;}

  const afterRowOrder=rowOrderOf(afterContent);
  return {patch,warnings,before:summary(draft),after:{layout:afterLayout,templateCueId:afterTemplateCueId,arrangement:arrangementOf(afterContent),...(afterRowOrder?{rowOrder:afterRowOrder}:{}),presentation:{...afterPresentation}}};
}
