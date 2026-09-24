export type WorkspaceDownload = {
  label: string;
  description: string;
  href: string;
  kind: 'module' | 'pages';
};

export type PublicWorkspace = {
  version: 1;
  id: string;
  organizationName: string;
  shortName: string;
  productName: string;
  outputName: string;
  supportEmail: string | null;
  logo: {src: string; alt: string};
  colors: {primary: string; deep: string; accent: string};
  stage: 'trial' | 'production';
  defaultCompositor: 'vmix' | 'obs';
  setupDownloads: WorkspaceDownload[];
  sharedLibrary: {
    enabled: boolean;
    label: string;
  };
  deployment: {
    usesDefaultCrcIdentity: boolean;
    isolationVerified: boolean;
  };
  bookFaces: boolean;
  // D4: the scan card is congregation configuration, not code. A congregation with no
  // scan-card address ships the same commit with the feature absent.
  bug: {enabled: boolean; url: string | null; caption: string | null};
  // The resting logo is congregation capability, not code, and it is deliberately NOT derived
  // from `logo` above: every workspace has artwork for its in-cue medallion, and only a
  // congregation that has asked for a standing corner mark gets one. TBI ships this off, so the
  // same commit that gives CRC a Siona mark gives TBI a clean frame. `src` follows the
  // workspace's own logo path, so a congregation can never be shown another's artwork.
  restingLogo: {enabled: boolean; src: string | null; alt: string | null};
};

type WorkspaceEnvironment = Record<string, string | undefined>;

const SAFE_ID = /^[a-z][a-z0-9-]{1,47}$/;
const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_PUBLIC_PATH = /^\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
const SAFE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CRC_PROFILE: WorkspaceEnvironment = {
  WORKSPACE_ID: 'crc',
  WORKSPACE_ORGANIZATION_NAME: 'Central Reform Congregation',
  WORKSPACE_SHORT_NAME: 'CRC',
  WORKSPACE_PRODUCT_NAME: 'CRC Overlays',
  WORKSPACE_OUTPUT_NAME: 'CRC graphics',
  WORKSPACE_LOGO_PATH: '/assets/siona-floor.jpg',
  WORKSPACE_LOGO_ALT: 'Central Reform Congregation artwork',
  WORKSPACE_PRIMARY_COLOR: '#09bfc2',
  WORKSPACE_DEEP_COLOR: '#07345f',
  WORKSPACE_ACCENT_COLOR: '#d9a62e',
  WORKSPACE_STAGE: 'trial',
  WORKSPACE_ISOLATION_VERIFIED: 'false',
  // D4: CRC's scan card, in the built-in profile so no congregation address is hardcoded
  // anywhere else. The caption is the stream-kit house caption (stream-kit/bug.typ).
  WORKSPACE_BUG_URL: 'https://siddur.centralreform.org',
  WORKSPACE_BUG_CAPTION: 'DAVEN ALONG',
  // CRC is the congregation that asked for the resting corner mark. Capable, not enabled: the
  // live preference still starts off and an operator has to turn it on (lib/resting-logo.ts).
  WORKSPACE_RESTING_LOGO: '1',
};

const BUILT_IN_PROFILES = new Map<string, WorkspaceEnvironment>([
  ['crc', CRC_PROFILE],
  [templeBnaiIsraelProfile.environment.WORKSPACE_ID, templeBnaiIsraelProfile.environment],
]);

function mergeDefined(base: WorkspaceEnvironment, overrides: WorkspaceEnvironment) {
  const merged = {...base};
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) merged[key] = value;
  return merged;
}

function textValue(value: string | undefined, fallback: string, label: string, max = 100) {
  const valueOrFallback = value?.trim() || fallback;
  if (!valueOrFallback || valueOrFallback.length > max || /[\u0000-\u001f\u007f<>]/.test(valueOrFallback)) {
    throw new Error(`${label} is invalid`);
  }
  return valueOrFallback;
}

function publicPath(value: string | undefined, fallback: string, label: string) {
  const candidate = value?.trim() || fallback;
  if (!SAFE_PUBLIC_PATH.test(candidate) || candidate.includes('..') || candidate.includes('//')) {
    throw new Error(`${label} must be a safe public path`);
  }
  return candidate;
}

function color(value: string | undefined, fallback: string, label: string) {
  const candidate = value?.trim() || fallback;
  if (!SAFE_COLOR.test(candidate)) throw new Error(`${label} must be a six-digit hex color`);
  return candidate.toLowerCase();
}

function optionalEmail(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (candidate.length > 200 || !SAFE_EMAIL.test(candidate)) throw new Error('Workspace support email is invalid');
  return candidate;
}

/**
 * D4 — the scan-card address. `https:` only, at most 200 characters, no credentials and
 * no fragment, validated here the way publicPath and optionalEmail are. Anything invalid
 * throws rather than silently shipping a card that points somewhere unexpected.
 */
function bugUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (candidate.length > 200 || /[\u0000-\u0020\u007f<>]/.test(candidate)) throw new Error('Workspace scan card address is invalid');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Workspace scan card address is invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error('Workspace scan card address is invalid');
  return candidate;
}

function bugCaption(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (candidate.length > 40 || /[\u0000-\u001f\u007f<>]/.test(candidate)) throw new Error('Workspace scan card caption is invalid');
  return candidate;
}

function configuredDownloads(env: WorkspaceEnvironment, crcDefault: boolean): WorkspaceDownload[] {
  const modulePath = env.WORKSPACE_COMPANION_MODULE_PATH?.trim();
  const pagePaths = env.WORKSPACE_COMPANION_PAGE_PATHS?.split(',').map(item => item.trim()).filter(Boolean) ?? [];
  const resolvedModule = modulePath || (crcDefault ? '/downloads/crc-overlays-1.7.0.tgz' : '');
  const resolvedPages = pagePaths.length
    ? pagePaths
    : crcDefault
      ? ['/downloads/crc-morning-page-1.companionconfig', '/downloads/crc-morning-page-2.companionconfig']
      : [];

  const downloads: WorkspaceDownload[] = [];
  if (resolvedModule) {
    downloads.push({
      label: 'Companion module',
      description: 'Install this once from Companion’s Modules page.',
      href: publicPath(resolvedModule, '', 'Companion module path'),
      kind: 'module',
    });
  }
  resolvedPages.forEach((href, index) => downloads.push({
    label: `Button page ${index + 1}`,
    description: 'Import into a page you have confirmed is empty.',
    href: publicPath(href, '', `Companion page ${index + 1} path`),
    kind: 'pages',
  }));
  return downloads;
}

/**
 * Returns the deployment's public identity only. This object intentionally never
 * includes credentials, relay details, database settings, or source-package data.
 */
export function getPublicWorkspace(env: WorkspaceEnvironment = process.env): PublicWorkspace {
  const id = (env.WORKSPACE_ID?.trim() || 'crc').toLowerCase();
  if (!SAFE_ID.test(id)) throw new Error('Workspace ID is invalid');
  const builtIn = BUILT_IN_PROFILES.get(id);
  if (!builtIn) {
    const required = ['WORKSPACE_ORGANIZATION_NAME','WORKSPACE_SHORT_NAME','WORKSPACE_PRODUCT_NAME','WORKSPACE_OUTPUT_NAME','WORKSPACE_LOGO_PATH','WORKSPACE_LOGO_ALT','WORKSPACE_PRIMARY_COLOR','WORKSPACE_DEEP_COLOR','WORKSPACE_ACCENT_COLOR'];
    const missing = required.filter(key => !env[key]?.trim());
    if (missing.length) throw new Error(`Custom workspace is missing ${missing.join(', ')}`);
  }
  const resolved = mergeDefined(builtIn ?? {WORKSPACE_ID: id}, env);
  resolved.WORKSPACE_ID = id;
  const crcDefault = id === 'crc' && !Object.keys(env).some(key => key.startsWith('WORKSPACE_') && key !== 'WORKSPACE_ID');
  const organizationName = textValue(resolved.WORKSPACE_ORGANIZATION_NAME, '', 'Workspace organization name');
  const shortName = textValue(resolved.WORKSPACE_SHORT_NAME, '', 'Workspace short name', 32);
  const productName = textValue(resolved.WORKSPACE_PRODUCT_NAME, '', 'Workspace product name');
  const stage = resolved.WORKSPACE_STAGE?.trim() || 'trial';
  if (stage !== 'trial' && stage !== 'production') throw new Error('Workspace stage must be trial or production');
  // The compositor this congregation is set up for. It drives the default shown on /setup,
  // so it is congregation configuration rather than a hardcoded workspace comparison.
  const defaultCompositor = resolved.WORKSPACE_DEFAULT_COMPOSITOR?.trim().toLowerCase() || 'vmix';
  if (defaultCompositor !== 'vmix' && defaultCompositor !== 'obs') throw new Error('Workspace default compositor must be vmix or obs');

  return {
    version: 1,
    id,
    organizationName,
    shortName,
    productName,
    outputName: textValue(resolved.WORKSPACE_OUTPUT_NAME, '', 'Workspace output name', 60),
    supportEmail: optionalEmail(resolved.WORKSPACE_SUPPORT_EMAIL),
    logo: {
      src: publicPath(resolved.WORKSPACE_LOGO_PATH, '', 'Workspace logo path'),
      alt: textValue(resolved.WORKSPACE_LOGO_ALT, '', 'Workspace logo alt text'),
    },
    colors: {
      primary: color(resolved.WORKSPACE_PRIMARY_COLOR, '', 'Workspace primary color'),
      deep: color(resolved.WORKSPACE_DEEP_COLOR, '', 'Workspace deep color'),
      accent: color(resolved.WORKSPACE_ACCENT_COLOR, '', 'Workspace accent color'),
    },
    stage,
    defaultCompositor,
    setupDownloads: configuredDownloads(resolved, id === 'crc'),
    sharedLibrary: {
      enabled: id === 'temple-bnai-israel-kalamazoo'
        && Boolean(env.CRC_SHARED_LIBRARY_URL?.trim())
        && Boolean(env.SHARED_LIBRARY_IMPORT_KEY?.trim()),
      label: 'CRC library',
    },
    deployment: {
      usesDefaultCrcIdentity: crcDefault,
      isolationVerified: resolved.WORKSPACE_ISOLATION_VERIFIED === 'true',
    },
    // Trial "book faces" (David Libre / Frank Ruhl Libre) typography, default off; see
    // app/overlay-faces.css and lib/overlay-assets.ts waitForOverlayFonts.
    bookFaces: resolved.WORKSPACE_BOOK_FACES === '1' || resolved.WORKSPACE_BOOK_FACES === 'true',
    bug: (() => {
      const url = bugUrl(resolved.WORKSPACE_BUG_URL);
      return {enabled: Boolean(url), url, caption: url ? bugCaption(resolved.WORKSPACE_BUG_CAPTION) : null};
    })(),
    restingLogo: (() => {
      const enabled = resolved.WORKSPACE_RESTING_LOGO === '1' || resolved.WORKSPACE_RESTING_LOGO === 'true';
      if (!enabled) return {enabled: false, src: null, alt: null};
      return {
        enabled: true,
        src: publicPath(resolved.WORKSPACE_LOGO_PATH, '', 'Workspace logo path'),
        alt: textValue(resolved.WORKSPACE_LOGO_ALT, '', 'Workspace logo alt text'),
      };
    })(),
  };
}
import templeBnaiIsraelProfile from '../workspaces/temple-bnai-israel/workspace.json';

/**
 * The deck guard window (MCP plan V3, decision 4): while any Companion pressed a button within
 * this many minutes, an agent's live command is refused unless it passes `override:true` with a
 * reason. Congregation configuration, like the scan card: `WORKSPACE_DECK_GUARD_MINUTES`, a whole
 * number from 1 to 240, default 5. There is deliberately no "off" value: decision 4 is that agents
 * yield to the deck, so a congregation can shorten the window but not remove it. Kept out of
 * PublicWorkspace, which is the public identity served to browsers.
 */
export const DEFAULT_DECK_GUARD_MINUTES = 5;
export function deckGuardMinutes(env: WorkspaceEnvironment = process.env): number {
  const id = (env.WORKSPACE_ID?.trim() || 'crc').toLowerCase();
  const raw = (env.WORKSPACE_DECK_GUARD_MINUTES ?? BUILT_IN_PROFILES.get(id)?.WORKSPACE_DECK_GUARD_MINUTES)?.trim();
  if (!raw) return DEFAULT_DECK_GUARD_MINUTES;
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 240) throw new Error('Workspace deck guard minutes must be a whole number from 1 to 240');
  return Number(raw);
}
