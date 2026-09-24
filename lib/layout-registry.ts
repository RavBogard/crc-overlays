/**
 * Every layout the renderer, the editor and the MCP accept. A layout id is a validated string, not
 * a closed union repeated across the code: registering a definition here is the one step that makes
 * validation accept a new layout. The built-in four stay code (ruling 7); layouts as data (packet L2)
 * register theirs through `registerLayout`.
 *
 * Plain type syntax only: lib/player.ts imports this file, and the renderer tests run it with
 * Node's type stripping.
 */
export type LayoutId=string;
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
};

const BUILT_IN:readonly LayoutDefinition[]=[
 {id:'bottom',label:'Lower third',templateLayout:'bottom',contained:false,capabilities:{sets:true,translation:true,oneBlockPerSlide:true}},
 {id:'left',label:'Left panel',templateLayout:'left',contained:true,capabilities:{sets:true,translation:true,oneBlockPerSlide:false}},
 {id:'right',label:'Right panel',templateLayout:'right',contained:true,capabilities:{sets:true,translation:true,oneBlockPerSlide:false}},
 {id:'corner',label:'Corner',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true}},
];
const registry=new Map<LayoutId,LayoutDefinition>(BUILT_IN.map(definition=>[definition.id,definition]));
// Companion reads a layout id as part of a variable name, so the id follows its grammar.
const LAYOUT_ID=/^[a-z][a-z0-9_-]{0,39}$/;

/** In catalog order: the lower third first, then the two panels, then the corner card, then any added. */
export function layoutIds():LayoutId[]{return [...registry.keys()]}
export function isLayoutId(value:unknown):value is LayoutId{return typeof value==='string'&&registry.has(value)}
export function layoutDefinition(id:LayoutId):LayoutDefinition|undefined{return registry.get(id)}
/** "bottom, left, right, or corner" - for the sentence that refuses anything else. */
export function layoutChoices():string{const ids=layoutIds();return ids.length<2?ids.join(''):`${ids.slice(0,-1).join(', ')}, or ${ids[ids.length-1]}`}
export function registerLayout(definition:LayoutDefinition):void{
 if(!LAYOUT_ID.test(definition.id))throw new Error(`Layout id ${JSON.stringify(definition.id)} must start with a letter and use only a-z, 0-9, _ and -, up to 40 characters`);
 if(registry.has(definition.id))throw new Error(`Layout ${definition.id} is already registered`);
 if(!registry.has(definition.templateLayout)&&definition.templateLayout!==definition.id)throw new Error(`Layout ${definition.id} borrows motion from ${definition.templateLayout}, which is not registered`);
 registry.set(definition.id,definition);
}
/** Removes a layout added with `registerLayout`. The built-in four cannot be removed. */
export function unregisterLayout(id:LayoutId):void{if(BUILT_IN.some(definition=>definition.id===id))throw new Error(`Layout ${id} is built in`);registry.delete(id)}
