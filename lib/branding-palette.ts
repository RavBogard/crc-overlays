// Workspace branding as data (MCP plan L4, R-B2): the pure half, safe in the browser and in the
// renderer tests (only erasable TypeScript, imports carry their extension).
//
// A workspace's branding is its identity colours (lib/workspace.ts `colors`, from the profile),
// the overlay's own colours (until L4 literals in app/overlay.css), two font roles chosen from the
// font registry, and three pieces of artwork named by asset id. A stored document holds only what a
// congregation changed; everything it leaves out resolves to today's value, so a workspace with no
// stored branding renders exactly as it did before.
import {fontWaits} from './font-registry.ts';

export const BRANDING_COLOR_KEYS=['primary','deep','accent','ring','paper','ink','titleText','accentTitle','translationInk'] as const;
export type BrandingColorKey=typeof BRANDING_COLOR_KEYS[number];
export type BrandingPalette=Record<BrandingColorKey,string>;
export const BRANDING_FONT_ROLES=['latin','hebrew'] as const;
export type BrandingFontRole=typeof BRANDING_FONT_ROLES[number];
export type BrandingFonts=Partial<Record<BrandingFontRole,string>>;
export const BRANDING_ARTWORK_ROLES=['logo','restingLogo','scanCard'] as const;
export type BrandingArtworkRole=typeof BRANDING_ARTWORK_ROLES[number];
export type BrandingArtworkRef={assetId:string;alt:string};
/** What is stored: only the values a congregation set. */
export type WorkspaceBrandingDocument={colors?:Partial<BrandingPalette>;fonts?:BrandingFonts;artwork?:Partial<Record<BrandingArtworkRole,BrandingArtworkRef>>};

/** What each colour paints, for get_branding and the docs. */
export const BRANDING_COLOR_ROLES:Readonly<Record<BrandingColorKey,string>>={
 primary:'the title bar gradient\'s light end, the inner circle and the accent line\'s start',
 deep:'the title bar and the gradient\'s dark end',
 accent:'the outer circle and the accent line\'s end',
 ring:'the medallion (logo) ring; defaults to the accent colour',
 paper:'the lower third and panel background, the panel rows and the medallion backing',
 ink:'the Hebrew, transliteration and body text',
 titleText:'the English title',
 accentTitle:'the Hebrew accent title',
 translationInk:'the translation line in panel rows',
};
export const BRANDING_FONT_ROLE_USES:Readonly<Record<BrandingFontRole,string>>={latin:'titles, transliteration, translation and English text',hebrew:'Hebrew text and the Hebrew accent title'};

// Today's app/overlay.css literals: the defaults a stored colour replaces.
export const OVERLAY_COLOR_DEFAULTS={paper:'#f8f5ec',ink:'#11283a',titleText:'#ffffff',accentTitle:'#8fe7e2',translationInk:'#385365'} as const;
// The ring and the base keep the alpha app/overlay.css gave them (rgba(217,166,46,.9), rgba(248,245,236,.97)).
export const RING_ALPHA=.9,BASE_ALPHA=.97;

export const HEX_COLOR=/^#[0-9a-f]{6}$/i;
export const BRANDING_ASSET_ID=/^asset_[a-f0-9]{64}$/;

export function defaultPalette(colors:{primary:string;deep:string;accent:string}):BrandingPalette{
 return {primary:colors.primary,deep:colors.deep,accent:colors.accent,ring:colors.accent,...OVERLAY_COLOR_DEFAULTS};
}

/** `#d9a62e`, .9 -> `rgba(217,166,46,.9)`, the form the stylesheet wrote. */
export function hexRgba(hex:string,alpha:number){
 if(!HEX_COLOR.test(hex))throw new Error(`Not a six-digit hex colour: ${hex}`);
 const value=Number.parseInt(hex.slice(1),16);
 return `rgba(${value>>16&255},${value>>8&255},${value&255},${String(alpha).replace(/^0(?=\.)/,'')})`;
}

/** The overlay families a font role may name: the faces the output waits for before it draws. */
export function brandingFontChoices(bookFaces=false):string[]{
 return [...new Set([...fontWaits('default'),...(bookFaces?fontWaits('book'):[])].map(face=>face.family))];
}

type BrandingInput={titleColor:string;titleShade:string;accentColor:string;palette?:BrandingPalette;fonts?:BrandingFonts};
/**
 * Every CSS custom property the renderer sets on an overlay box, in one place. The first four are
 * the ones lib/player.ts has always set; the rest replace app/overlay.css literals, each of which
 * is written `var(--x, <the old literal>)`, so with no stored branding every value here equals the
 * literal it stands for. A font role is set only when chosen; unset, the stylesheet's own stack stays.
 */
export function brandingCssVariables(branding:BrandingInput):Record<string,string>{
 const palette=branding.palette??defaultPalette({primary:branding.titleColor,deep:branding.titleShade,accent:branding.accentColor});
 const fonts=branding.fonts??{};
 return {
  '--crc-blue':branding.titleShade,
  '--crc-blue-deep':branding.titleShade,
  '--crc-turquoise':branding.titleColor,
  '--crc-gold':branding.accentColor,
  '--crc-ring':hexRgba(palette.ring,RING_ALPHA),
  '--crc-paper':palette.paper,
  '--crc-base':hexRgba(palette.paper,BASE_ALPHA),
  '--crc-ink':palette.ink,
  '--crc-title-ink':palette.titleText,
  '--crc-accent-title':palette.accentTitle,
  '--crc-translation-ink':palette.translationInk,
  ...(fonts.latin?{'--crc-font-latin':`"${fonts.latin}"`}:{}),
  ...(fonts.hebrew?{'--crc-font-hebrew':`"${fonts.hebrew}"`}:{}),
 };
}

const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);

/** A palette from the wire (/api/workspace `branding.palette`), or null when any colour is missing or malformed. */
export function readPalette(value:unknown):BrandingPalette|null{
 if(!isRecord(value))return null;
 const palette={} as BrandingPalette;
 for(const key of BRANDING_COLOR_KEYS){const colour=value[key];if(typeof colour!=='string'||!HEX_COLOR.test(colour))return null;palette[key]=colour.toLowerCase()}
 return palette;
}
/** Font roles from the wire, keeping only registry families. */
export function readFonts(value:unknown,bookFaces=true):BrandingFonts{
 if(!isRecord(value))return {};
 const choices=brandingFontChoices(bookFaces),fonts:BrandingFonts={};
 for(const role of BRANDING_FONT_ROLES){const family=value[role];if(typeof family==='string'&&choices.includes(family))fonts[role]=family}
 return fonts;
}

/**
 * Parse a stored or proposed branding document strictly. Throws an Error whose message is a plain
 * sentence naming the first thing wrong.
 */
export function parseBrandingDocument(value:unknown,options:{bookFaces?:boolean}={}):WorkspaceBrandingDocument{
 if(value===null||value===undefined)return {};
 if(!isRecord(value))throw new Error('Branding must be an object with colors, fonts and artwork.');
 const extra=Object.keys(value).filter(key=>!['colors','fonts','artwork'].includes(key));
 if(extra.length)throw new Error(`Branding does not take ${extra.join(', ')}. It takes colors, fonts and artwork.`);
 const document:WorkspaceBrandingDocument={};
 if(value.colors!==undefined){
  if(!isRecord(value.colors))throw new Error('colors must be an object of hex colours.');
  const colors:Partial<BrandingPalette>={};
  for(const [key,colour] of Object.entries(value.colors)){
   if(!(BRANDING_COLOR_KEYS as readonly string[]).includes(key))throw new Error(`There is no colour called ${key}. The colours are ${BRANDING_COLOR_KEYS.join(', ')}.`);
   if(typeof colour!=='string'||!HEX_COLOR.test(colour))throw new Error(`${key} must be a six-digit hex colour such as #d9a62e.`);
   colors[key as BrandingColorKey]=colour.toLowerCase();
  }
  if(Object.keys(colors).length)document.colors=colors;
 }
 if(value.fonts!==undefined){
  if(!isRecord(value.fonts))throw new Error('fonts must be an object naming a family for latin and/or hebrew.');
  const choices=brandingFontChoices(options.bookFaces??true),fonts:BrandingFonts={};
  for(const [role,family] of Object.entries(value.fonts)){
   if(!(BRANDING_FONT_ROLES as readonly string[]).includes(role))throw new Error(`There is no font role called ${role}. The roles are ${BRANDING_FONT_ROLES.join(' and ')}.`);
   if(typeof family!=='string'||!choices.includes(family))throw new Error(`${role} must be one of the installed overlay fonts: ${choices.join(', ')}. A new font is added in code.`);
   fonts[role as BrandingFontRole]=family;
  }
  if(Object.keys(fonts).length)document.fonts=fonts;
 }
 if(value.artwork!==undefined){
  if(!isRecord(value.artwork))throw new Error('artwork must be an object naming logo, restingLogo and/or scanCard.');
  const artwork:Partial<Record<BrandingArtworkRole,BrandingArtworkRef>>={};
  for(const [role,ref] of Object.entries(value.artwork)){
   if(!(BRANDING_ARTWORK_ROLES as readonly string[]).includes(role))throw new Error(`There is no artwork called ${role}. The artwork is ${BRANDING_ARTWORK_ROLES.join(', ')}.`);
   if(!isRecord(ref)||typeof ref.assetId!=='string'||!BRANDING_ASSET_ID.test(ref.assetId)||typeof ref.alt!=='string'||!ref.alt.trim()||ref.alt.length>240)throw new Error(`${role} must name an asset id from list_assets and its alt text.`);
   artwork[role as BrandingArtworkRole]={assetId:ref.assetId,alt:ref.alt.trim()};
  }
  if(Object.keys(artwork).length)document.artwork=artwork;
 }
 return document;
}

export type ResolvedArtwork={assetId:string|null;src:string|null;alt:string|null};
/** The branding the renderer draws with: every value filled in. Served as /api/workspace `branding`. */
export type ResolvedBranding={version:number;palette:BrandingPalette;fonts:BrandingFonts;artwork:Record<BrandingArtworkRole,ResolvedArtwork>};
type WorkspaceIdentity={colors:{primary:string;deep:string;accent:string};logo:{src:string;alt:string};restingLogo:{enabled:boolean;src:string|null;alt:string|null}};
/** A published asset's public path; the renderer loads branding artwork from there. */
export const brandingAssetPath=(assetId:string)=>`/api/assets/${assetId}/content`;

export function resolveBranding(workspace:WorkspaceIdentity,stored:{version:number;document:WorkspaceBrandingDocument}|null,assetPath:(assetId:string)=>string=brandingAssetPath):ResolvedBranding{
 const document=stored?.document??{};
 const palette={...defaultPalette(workspace.colors),...(document.colors?.accent&&!document.colors.ring?{ring:document.colors.accent}:{}),...document.colors} as BrandingPalette;
 const art=(role:BrandingArtworkRole,fallback:{src:string|null;alt:string|null}):ResolvedArtwork=>{const ref=document.artwork?.[role];return ref?{assetId:ref.assetId,src:assetPath(ref.assetId),alt:ref.alt}:{assetId:null,...fallback}};
 return {
  version:stored?.version??0,
  palette,
  fonts:{...document.fonts},
  artwork:{
   logo:art('logo',{src:workspace.logo.src,alt:workspace.logo.alt}),
   // The resting logo is a capability (lib/workspace.ts): branding can change its artwork, never switch it on.
   restingLogo:workspace.restingLogo.enabled?art('restingLogo',{src:workspace.restingLogo.src,alt:workspace.restingLogo.alt}):{assetId:document.artwork?.restingLogo?.assetId??null,src:null,alt:null},
   scanCard:art('scanCard',{src:null,alt:null}),
  },
 };
}

/**
 * The public workspace with stored branding applied: identity colours, the medallion logo and the
 * resting logo's artwork follow the branding, and `branding` carries the full resolved set. With
 * nothing stored the workspace is returned unchanged, so /api/workspace is byte-identical.
 */
export function brandedWorkspace<T extends WorkspaceIdentity>(workspace:T,resolved:ResolvedBranding):T&{branding?:ResolvedBranding}{
 if(!resolved.version)return workspace;
 const {palette,artwork}=resolved;
 return {
  ...workspace,
  colors:{...workspace.colors,primary:palette.primary,deep:palette.deep,accent:palette.accent},
  logo:{src:artwork.logo.src!,alt:artwork.logo.alt!},
  restingLogo:workspace.restingLogo.enabled?{enabled:true,src:artwork.restingLogo.src,alt:artwork.restingLogo.alt}:workspace.restingLogo,
  branding:resolved,
 };
}
