/**
 * The resting logo: the congregation's own artwork, small and unobtrusive in the bottom-right
 * corner of an otherwise empty output, so a camera cutting to the sanctuary between prayers is
 * not looking at a bare frame.
 *
 * It is a DISTINCT feature from the scan card in `lib/bug-layer.ts`. They share a shape and a
 * corner and nothing else: the scan card is a deliberate, explicitly shown QR panel with a
 * caption and a page chip; this is a standing mark with no text, no link and no panel around it.
 * A logo command never shows a scan card and a scan-card command never shows a logo. They keep
 * separate live-state fields, separate commands, separate operator controls and separate
 * Companion actions, and both may be configured on, off, or absent independently.
 *
 * Like `lib/bug-layer.ts` this module is pure and imports no renderer. It is rendered into its
 * own sibling stage by `/output`, because `Player.set()` calls `replaceChildren()` on `#output`
 * and would destroy anything living inside it.
 *
 * The two things it keeps apart, which the rest of the feature depends on:
 *
 *   PREFERENCE  — `RestingLogoState.on`, authoritative live state held by the relay. This is what
 *                 the operator turned on or off, and it survives an output reload, a reconnect
 *                 and a relay restart.
 *   VISIBILITY  — the return of `restingLogoViewFor`, which is the preference *minus* everything
 *                 currently occupying the output. Enabling the logo during a cue stores the
 *                 preference and shows nothing; the mark appears when the cue has finished
 *                 leaving. Nothing here ever writes the preference back from the visibility.
 */

/** The preference, as the relay holds it. Absent state is off, which is the quiet default. */
export type RestingLogoState={on:boolean};

/** The `restingLogo` half of `PublicWorkspace`, restated structurally so this module stays pure. */
export type RestingLogoConfiguration={enabled:boolean;src:string|null;alt:string|null};

export type RestingLogoView={src:string;alt:string};

/**
 * What is currently occupying the output. `cueOccupied` is true from the moment a graphic is
 * requested until its Out animation has finished and the stage is empty again — see
 * `Player.occupied` — so the mark is gone before a cue paints and does not return under one
 * that is still leaving. `scanCardVisible` is the other layer that owns this corner.
 */
export type OutputOccupancy={cueOccupied:boolean;scanCardVisible:boolean};

/** The corner box in stage coordinates. 132 x 132 px, inset 48 px from the right and bottom. */
export const RESTING_LOGO_RECT={left:1740,top:900,right:1872,bottom:1032} as const;

/**
 * The one place that decides whether the mark is on screen. A congregation with no resting logo
 * configured never shows one, whatever the live state says — which is what keeps CRC's artwork
 * off TBI's output even though both run this commit.
 */
export function restingLogoViewFor(configuration:RestingLogoConfiguration|null|undefined,state:RestingLogoState|null|undefined,occupancy:OutputOccupancy):RestingLogoView|null{
 if(!configuration?.enabled||!configuration.src||!state?.on)return null;
 if(occupancy.cueOccupied||occupancy.scanCardVisible)return null;
 return {src:configuration.src,alt:configuration.alt??''};
}

/** True when the operator's preference is on, whatever is on screen. The two are never conflated. */
export const restingLogoEnabled=(state:RestingLogoState|null|undefined):boolean=>state?.on===true;

/**
 * How an operator surface should describe the feature in one word, so no control claims a mark
 * is showing while a graphic covers it. This is desired state plus what the same live state says
 * is requested; it is not a report from a graphics browser, and no caller should present it as one.
 */
export type RestingLogoStatus='unavailable'|'off'|'resting'|'suppressed';
export function restingLogoStatus(configuration:RestingLogoConfiguration|null|undefined,state:RestingLogoState|null|undefined,occupancy:OutputOccupancy):RestingLogoStatus{
 if(!configuration?.enabled||!configuration.src)return 'unavailable';
 if(!restingLogoEnabled(state))return 'off';
 return occupancy.cueOccupied||occupancy.scanCardVisible?'suppressed':'resting';
}

type LogoNodes={image:HTMLImageElement};
const layers=new WeakMap<HTMLElement,LogoNodes>();

/**
 * Idempotent, the same way `renderBugLayer` is: rendering the same view twice leaves the same
 * node in place — which matters here, because replacing the <img> would re-request a 3 MB JPEG
 * and flash — and `null` empties the layer.
 */
export function renderRestingLogo(root:HTMLElement,view:RestingLogoView|null):void{
 if(!view){
  layers.delete(root);
  root.replaceChildren();
  root.dataset.restingLogo='off';
  return;
 }
 let nodes=layers.get(root);
 if(!nodes||nodes.image.parentNode!==root){
  const image=root.ownerDocument.createElement('img');
  image.className='resting-logo';
  root.replaceChildren(image);
  nodes={image};
  layers.set(root,nodes);
 }
 if(nodes.image.getAttribute('src')!==view.src)nodes.image.setAttribute('src',view.src);
 if(nodes.image.getAttribute('alt')!==view.alt)nodes.image.setAttribute('alt',view.alt);
 root.dataset.restingLogo='on';
}
