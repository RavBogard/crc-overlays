/**
 * D5/D6 — the scan card is a sibling DOM layer the Player never sees.
 *
 * `Player.set()` calls `root.replaceChildren()` on `#output`, so a card rendered inside
 * that root would be destroyed on every cue change. `/output` therefore renders a second,
 * equally scaled `#output-bug` stage and drives it from here. Nothing in this module
 * imports the renderer, and the renderer never queries this layer.
 *
 * `BugState` is structurally identical to `relay/src/protocol.ts`'s `BugState` (WP1). It is
 * restated here rather than imported because no file under `app/` or `lib/` imports from
 * `relay/src` today — only tests and `scripts/rehearsal-relay.ts` do, with an explicit
 * `.ts` extension that the Next build does not resolve.
 */
export type BugState={on:boolean;page:string|null};

/** The bug box in stage coordinates: 300 x 300 px inset 48 px from the right and bottom edges. */
export const BUG_RESERVED_RECT={left:1572,top:732,right:1872,bottom:1032} as const;

export type BugRect={left:number;top:number;right:number;bottom:number};

/**
 * The page label the console and Companion may send. Structurally identical to WP1's
 * `validBugPage` in `relay/src/protocol.ts`, restated here for the same reason as `BugState`;
 * the relay validates the same shape again on its own side.
 */
export const BUG_PAGE_PATTERN=/^[A-Za-z0-9 .,\-–]{1,12}$/;
export function validBugPage(value:unknown):boolean{return value===null||(typeof value==='string'&&BUG_PAGE_PATTERN.test(value))}

export type BugView={on:boolean;page:string|null;caption:string|null;qrSrc:string};

/** The `bug` half of `PublicWorkspace`, restated structurally so this module stays pure. */
export type BugConfiguration={enabled:boolean;url:string|null;caption:string|null};

export const BUG_QR_SRC='/api/bug/qr.svg';

/**
 * The one place that decides whether a card exists at all: a congregation with no scan
 * card configured never renders one, whatever the live state says.
 */
export function bugViewFor(configuration:BugConfiguration|null|undefined,state:BugState|null|undefined,qrSrc:string=BUG_QR_SRC):BugView|null{
 if(!configuration?.enabled||!state?.on)return null;
 const page=typeof state.page==='string'&&state.page.trim()?state.page.trim():null;
 return {on:true,page,caption:configuration.caption??null,qrSrc};
}

type BugNodes={card:HTMLElement;image:HTMLImageElement;caption:HTMLElement;chip:HTMLElement};
const layers=new WeakMap<HTMLElement,BugNodes>();

/**
 * Idempotent: rendering the same view twice leaves the same nodes in place, and `null`
 * clears the layer. Nothing here reads the document beyond `root.ownerDocument`.
 */
export function renderBugLayer(root:HTMLElement,view:BugView|null):void{
 if(!view||!view.on){
  layers.delete(root);
  root.replaceChildren();
  root.dataset.bug='off';
  return;
 }
 const owner=root.ownerDocument;
 let nodes=layers.get(root);
 if(!nodes||nodes.card.parentNode!==root){
  const card=owner.createElement('div');card.className='bug-card';
  const image=owner.createElement('img');image.className='bug-qr';image.alt='';image.setAttribute('aria-hidden','true');
  const words=owner.createElement('div');words.className='bug-words';
  const caption=owner.createElement('p');caption.className='bug-caption';
  const chip=owner.createElement('span');chip.className='bug-page';
  words.append(caption,chip);
  card.append(image,words);
  root.replaceChildren(card);
  nodes={card,image,caption,chip};
  layers.set(root,nodes);
 }
 if(nodes.image.getAttribute('src')!==view.qrSrc)nodes.image.setAttribute('src',view.qrSrc);
 const captionText=view.caption??'';
 if(nodes.caption.textContent!==captionText)nodes.caption.textContent=captionText;
 nodes.caption.hidden=!captionText;
 const pageText=view.page??'';
 if(nodes.chip.textContent!==pageText)nodes.chip.textContent=pageText;
 nodes.chip.hidden=!pageText;
 root.dataset.bug='on';
}
