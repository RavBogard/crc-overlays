// Workspace branding as data (MCP plan L4, R-B2): the pure half, safe in the browser and in the
// renderer tests (only erasable TypeScript, imports carry their extension).
//
// A workspace's branding is its identity colours (lib/workspace.ts `colors`, from the profile),
// the overlay's own colours (until L4 literals in app/overlay.css), two font roles chosen from the
// font registry, and three pieces of artwork named by asset id. A stored document holds only what a
// congregation changed; everything it leaves out resolves to today's value, so a workspace with no
// stored branding renders exactly as it did before.
import {familyWeights,fontWaits} from './font-registry.ts';

export const BRANDING_COLOR_KEYS=['primary','deep','accent','ring','paper','ink','titleText','accentTitle','translationInk'] as const;
export type BrandingColorKey=typeof BRANDING_COLOR_KEYS[number];
export type BrandingPalette=Record<BrandingColorKey,string>;
export const BRANDING_FONT_ROLES=['latin','hebrew'] as const;
export type BrandingFontRole=typeof BRANDING_FONT_ROLES[number];
export type BrandingFonts=Partial<Record<BrandingFontRole,string>>;
export const BRANDING_ARTWORK_ROLES=['logo','restingLogo','scanCard'] as const;
export type BrandingArtworkRole=typeof BRANDING_ARTWORK_ROLES[number];
export type BrandingArtworkRef={assetId:string;alt:string};
/**
 * G10: the Hebrew accent title's size and weight. `scale` multiplies each layout's own accent size
 * (app/overlay.css grows the lane inside the title bar it has); `weight` replaces the title's 500.
 * Stored only when a congregation sets it; absent, every graphic draws as before.
 */
export type AccentTitleTypography={scale:number;weight:number};
export type BrandingTypography={accentTitle?:AccentTitleTypography};
/** What is stored: only the values a congregation set. */
export type WorkspaceBrandingDocument={colors?:Partial<BrandingPalette>;fonts?:BrandingFonts;artwork?:Partial<Record<BrandingArtworkRole,BrandingArtworkRef>>;typography?:BrandingTypography};

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

// G10: what the accent title draws with today (app/overlay.css .title), and how far a scale may go.
export const ACCENT_TITLE_DEFAULTS:Readonly<AccentTitleTypography>={scale:1,weight:500};
export const ACCENT_TITLE_SCALE={min:1,max:1.6} as const;
/** The weights a branded accent title may name, where its face ships them. */
export const ACCENT_TITLE_WEIGHTS=[400,500,600,700] as const;
export const ACCENT_TITLE_DRAWS="scale multiplies each layout's own accent title size (24px on the left panel, 34px on the right panel, 36px on the lower third, the title size on a card). On the side panels the accent's lane grows inside the title bar, so the English title, the bar and the medallion do not move; the right panel's accent stops at 48px so its vowel marks stay inside the bar. On the lower third and cards the accent shares the title's line and grows only as far as that line holds (40px on the lower third). weight replaces the title's 500. A graphic whose presentation sets titleFontSize keeps that size.";
/** The face the accent title draws with: the hebrew font role, else the stylesheet's Noto Sans Hebrew. */
export const accentTitleFace=(fonts:BrandingFonts|undefined)=>fonts?.hebrew??'Noto Sans Hebrew';
/** The accent weights that face really ships (lib/font-registry.ts), so none is synthesised. */
export function accentTitleWeights(fonts:BrandingFonts|undefined):number[]{
 const shipped=familyWeights(accentTitleFace(fonts));
 return ACCENT_TITLE_WEIGHTS.filter(weight=>shipped.includes(weight));
}
/** A scale in range, to two decimals. */
export const validAccentScale=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=ACCENT_TITLE_SCALE.min&&value<=ACCENT_TITLE_SCALE.max&&Math.abs(Math.round(value*100)-value*100)<1e-9;
export const validAccentWeight=(value:unknown):value is number=>typeof value==='number'&&(ACCENT_TITLE_WEIGHTS as readonly number[]).includes(value);
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

type BrandingInput={titleColor:string;titleShade:string;accentColor:string;palette?:BrandingPalette;fonts?:BrandingFonts;typography?:BrandingTypography};
/**
 * Every CSS custom property the renderer sets on an overlay box, in one place. The first four are
 * the ones lib/player.ts has always set; the rest replace app/overlay.css literals, each of which
 * is written `var(--x, <the old literal>)`, so with no stored branding every value here equals the
 * literal it stands for. A font role is set only when chosen; unset, the stylesheet's own stack stays.
 * The accent title's typography likewise, and it is drawn only on a box the Player marks
 * data-accent-typography (hasAccentTypography), so with none stored no rule for it matches.
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
  ...(branding.typography?.accentTitle?{'--crc-accent-title-scale':String(branding.typography.accentTitle.scale),'--crc-accent-title-weight':String(branding.typography.accentTitle.weight)}:{}),
 };
}
/** Whether the renderer marks the box data-accent-typography, the switch app/overlay.css's G10 rules need. */
export const hasAccentTypography=(branding:{typography?:BrandingTypography})=>Boolean(branding.typography?.accentTitle);

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

/** Typography from the wire (/api/workspace `branding.typography`), keeping only values in range. */
export function readTypography(value:unknown):BrandingTypography{
 if(!isRecord(value)||!isRecord(value.accentTitle))return {};
 const {scale,weight}=value.accentTitle;
 return validAccentScale(scale)&&validAccentWeight(weight)?{accentTitle:{scale,weight}}:{};
}

/**
 * Parse a stored or proposed branding document strictly. Throws an Error whose message is a plain
 * sentence naming the first thing wrong.
 */
export function parseBrandingDocument(value:unknown,options:{bookFaces?:boolean}={}):WorkspaceBrandingDocument{
 if(value===null||value===undefined)return {};
 if(!isRecord(value))throw new Error('Branding must be an object with colors, fonts, artwork and typography.');
 const extra=Object.keys(value).filter(key=>!['colors','fonts','artwork','typography'].includes(key));
 if(extra.length)throw new Error(`Branding does not take ${extra.join(', ')}. It takes colors, fonts, artwork and typography.`);
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
 if(value.typography!==undefined){
  if(!isRecord(value.typography))throw new Error('typography must be an object naming accentTitle.');
  const extraTypography=Object.keys(value.typography).filter(key=>key!=='accentTitle');
  if(extraTypography.length)throw new Error(`typography has no ${extraTypography.join(', ')}. It takes accentTitle.`);
  const accent=value.typography.accentTitle;
  if(accent!==undefined){
   if(!isRecord(accent)||Object.keys(accent).some(key=>key!=='scale'&&key!=='weight'))throw new Error('typography.accentTitle must be an object with scale and weight.');
   if(!validAccentScale(accent.scale))throw new Error(`typography.accentTitle.scale must be a number from ${ACCENT_TITLE_SCALE.min} to ${ACCENT_TITLE_SCALE.max}, to two decimals.`);
   if(!validAccentWeight(accent.weight))throw new Error(`typography.accentTitle.weight must be one of ${ACCENT_TITLE_WEIGHTS.join(', ')}.`);
   document.typography={accentTitle:{scale:accent.scale,weight:accent.weight}};
  }
 }
 return document;
}

export type ResolvedArtwork={assetId:string|null;src:string|null;alt:string|null};
/** The branding the renderer draws with: every value filled in. Served as /api/workspace `branding`. */
export type ResolvedBranding={version:number;palette:BrandingPalette;fonts:BrandingFonts;artwork:Record<BrandingArtworkRole,ResolvedArtwork>;typography?:BrandingTypography};
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
  // Only when set, so a stored document without typography serves the same body as before G10.
  ...(document.typography?.accentTitle?{typography:{accentTitle:{...document.typography.accentTitle}}}:{}),
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
