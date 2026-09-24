// The one list of bundled font faces. The waitForOverlayFonts targets (lib/overlay-assets.ts) and the
// TBI staged-asset allowlist (scripts/stage-workspace-source.mjs) are read from it. The stylesheets
// cannot import TypeScript, so tests/font-registry.test.ts holds their @font-face rules equal to
// fontFaceRule() of these faces, both ways. The staging script imports this file under plain node, so
// only erasable TypeScript here. A new face is a code change and a release: the file under
// public/assets, its entry here, and its @font-face rule in the stylesheet named.

// wait: the face set waitForOverlayFonts loads it for ('default' is required; 'book' is the trial set,
// whose failures are swallowed), and the sample text it is loaded against. A face without wait is
// never awaited: the Arabic fallback loads only through its unicode-range, and Work is console chrome.
export type OverlayFontFace = {family: string; file: string; format?: 'woff2' | 'truetype' | 'truetype-variations'; weight?: string; unicodeRange?: string; stylesheet: 'app/overlay.css' | 'app/overlay-faces.css' | 'app/globals.css'; licence?: string; wait?: {set: 'default' | 'book'; sample: 'hebrew' | 'latin'}};

// Order is the wait order: required Hebrew before Latin, then the book trial faces.
export const FONT_FACES: readonly OverlayFontFace[] = [
  {family: 'Noto Sans Hebrew', file: 'NotoSansHebrew-Regular.ttf', format: 'truetype', weight: '400', stylesheet: 'app/overlay.css', licence: 'NotoSansHebrew-OFL.txt', wait: {set: 'default', sample: 'hebrew'}},
  {family: 'Noto Sans Hebrew', file: 'NotoSansHebrew-Medium.ttf', format: 'truetype', weight: '500', stylesheet: 'app/overlay.css', licence: 'NotoSansHebrew-OFL.txt', wait: {set: 'default', sample: 'hebrew'}},
  // G10: the heavier weights a branded accent title may take (typography.accentTitle.weight), from the
  // same notofonts hinted TTF set as the two above. Not awaited up front, so a workspace that never
  // names them never loads them; waitForRenderedOverlayAssets loads the accent title's own face.
  {family: 'Noto Sans Hebrew', file: 'NotoSansHebrew-SemiBold.ttf', format: 'truetype', weight: '600', stylesheet: 'app/overlay.css', licence: 'NotoSansHebrew-OFL.txt'},
  {family: 'Noto Sans Hebrew', file: 'NotoSansHebrew-Bold.ttf', format: 'truetype', weight: '700', stylesheet: 'app/overlay.css', licence: 'NotoSansHebrew-OFL.txt'},
  {family: 'WorkRefresh', file: 'QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXBi8Jpg.woff2', format: 'woff2', weight: '400', stylesheet: 'app/overlay.css', wait: {set: 'default', sample: 'latin'}},
  {family: 'WorkRefresh', file: 'QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K3vXBi8Jpg.woff2', format: 'woff2', weight: '500', stylesheet: 'app/overlay.css', wait: {set: 'default', sample: 'latin'}},
  // Raleway (TBI's Latin face, ruling 6), from @fontsource/raleway 5.3.0 as Google Fonts subsets it:
  // the latin files are awaited; the latin-ext files load through their unicode-range when a line
  // needs them (ā, ḥ), and the rendered-overlay wait's document.fonts.ready covers them.
  {family: 'Raleway', file: 'raleway-latin-400-normal.woff2', format: 'woff2', weight: '400', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD', stylesheet: 'app/overlay.css', licence: 'Raleway-OFL.txt', wait: {set: 'default', sample: 'latin'}},
  {family: 'Raleway', file: 'raleway-latin-500-normal.woff2', format: 'woff2', weight: '500', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD', stylesheet: 'app/overlay.css', licence: 'Raleway-OFL.txt', wait: {set: 'default', sample: 'latin'}},
  {family: 'Raleway', file: 'raleway-latin-ext-400-normal.woff2', format: 'woff2', weight: '400', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF', stylesheet: 'app/overlay.css', licence: 'Raleway-OFL.txt'},
  {family: 'Raleway', file: 'raleway-latin-ext-500-normal.woff2', format: 'woff2', weight: '500', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF', stylesheet: 'app/overlay.css', licence: 'Raleway-OFL.txt'},
  {family: 'Noto Sans Arabic', file: 'NotoSansArabic-Regular.ttf', format: 'truetype', weight: '400 500', unicodeRange: 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF', stylesheet: 'app/overlay.css', licence: 'NotoSansArabic-OFL.txt'},
  {family: 'David Libre', file: 'DavidLibre-Regular.ttf', format: 'truetype', weight: '400', stylesheet: 'app/overlay-faces.css', licence: 'DavidLibre-OFL.txt', wait: {set: 'book', sample: 'hebrew'}},
  {family: 'David Libre', file: 'DavidLibre-Medium.ttf', format: 'truetype', weight: '500', stylesheet: 'app/overlay-faces.css', licence: 'DavidLibre-OFL.txt', wait: {set: 'book', sample: 'hebrew'}},
  {family: 'Frank Ruhl Libre', file: 'FrankRuhlLibre[wght].ttf', format: 'truetype-variations', weight: '400 500', stylesheet: 'app/overlay-faces.css', licence: 'FrankRuhlLibre-OFL.txt', wait: {set: 'book', sample: 'latin'}},
  // The console's own face: the same file as WorkRefresh 500, declared bare in globals.css.
  {family: 'Work', file: 'QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K3vXBi8Jpg.woff2', stylesheet: 'app/globals.css'},
];

// The canonical one-line @font-face rule for a face; the test compares each stylesheet's rules,
// whitespace and family quotes normalised, against these.
export function fontFaceRule(face: OverlayFontFace) {
  const src = `url('/assets/${face.file}')${face.format ? ` format('${face.format}')` : ''}`;
  const descriptors = face.weight ? [`font-style:normal`, `font-weight:${face.weight}`, `font-display:block`] : [];
  return `@font-face{${[`font-family:${face.family}`, `src:${src}`, ...descriptors, ...(face.unicodeRange ? [`unicode-range:${face.unicodeRange}`] : [])].join(';')}}`;
}

// Each (family, weight) waitForOverlayFonts loads, in load order; a face spanning "400 500" is loaded
// at both weights it serves.
export function fontWaits(set: 'default' | 'book') {
  return FONT_FACES.flatMap(face => face.wait?.set === set ? face.weight!.split(' ').map(weight => ({family: face.family, weight, sample: face.wait!.sample})) : []);
}

// The weights a family really ships, from its declared faces ("400 500" serves both): what a branded
// weight may name, so the browser never synthesises a bold the files do not hold.
export function familyWeights(family: string): number[] {
  return [...new Set(FONT_FACES.filter(face => face.family === family && face.weight).flatMap(face => face.weight!.split(' ').map(Number)))].sort((a, b) => a - b);
}

// Every public/assets file the fonts need at runtime or for their licence, for the TBI staged copy.
export const STAGED_FONT_ASSETS: readonly string[] = [...new Set(FONT_FACES.flatMap(face => [face.file, ...(face.licence ? [face.licence] : [])]))].map(file => `public/assets/${file}`);
