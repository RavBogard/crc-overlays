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

function configuredDownloads(env: WorkspaceEnvironment, crcDefault: boolean): WorkspaceDownload[] {
  const modulePath = env.WORKSPACE_COMPANION_MODULE_PATH?.trim();
  const pagePaths = env.WORKSPACE_COMPANION_PAGE_PATHS?.split(',').map(item => item.trim()).filter(Boolean) ?? [];
  const resolvedModule = modulePath || (crcDefault ? '/downloads/crc-overlays-1.3.0.tgz' : '');
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
  };
}
import templeBnaiIsraelProfile from '../workspaces/temple-bnai-israel/workspace.json';
