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
  {family: 'WorkRefresh', file: 'QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXBi8Jpg.woff2', format: 'woff2', weight: '400', stylesheet: 'app/overlay.css', wait: {set: 'default', sample: 'latin'}},
  {family: 'WorkRefresh', file: 'QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K3vXBi8Jpg.woff2', format: 'woff2', weight: '500', stylesheet: 'app/overlay.css', wait: {set: 'default', sample: 'latin'}},
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

// Every public/assets file the fonts need at runtime or for their licence, for the TBI staged copy.
export const STAGED_FONT_ASSETS: readonly string[] = [...new Set(FONT_FACES.flatMap(face => [face.file, ...(face.licence ? [face.licence] : [])]))].map(file => `public/assets/${file}`);
