import type {PublicWorkspace} from './workspace';
import {readFonts,readPalette,readTypography,type BrandingFonts,type BrandingPalette,type BrandingTypography} from './branding-palette.ts';

export type OverlayBranding = {
  name: string;
  organizationName: string;
  titleColor: string;
  titleShade: string;
  accentColor: string;
  logo: string;
  logoAlt: string;
  // L4: present only when the workspace has stored branding (/api/workspace `branding`). Without
  // them the renderer derives today's values (lib/branding-palette.ts brandingCssVariables).
  palette?: BrandingPalette;
  fonts?: BrandingFonts;
  // G10: the accent title's size and weight, only when stored.
  typography?: BrandingTypography;
};

export const branding: OverlayBranding = {
  name: 'CRC',
  organizationName: 'Central Reform Congregation',
  titleColor: '#09bfc2',
  titleShade: '#07345f',
  accentColor: '#d9a62e',
  logo: '/assets/siona-floor.jpg',
  logoAlt: 'Central Reform Congregation artwork',
};

export function overlayBrandingFromWorkspace(workspace: Pick<PublicWorkspace, 'shortName'|'organizationName'|'colors'|'logo'> & {branding?: unknown}): OverlayBranding {
  if (!workspace || typeof workspace.shortName !== 'string' || typeof workspace.organizationName !== 'string' ||
      !workspace.colors || typeof workspace.colors.primary !== 'string' || typeof workspace.colors.deep !== 'string' || typeof workspace.colors.accent !== 'string' ||
      !workspace.logo || typeof workspace.logo.src !== 'string' || typeof workspace.logo.alt !== 'string') {
    throw new Error('Workspace branding is unavailable');
  }
  const stored = workspace.branding && typeof workspace.branding === 'object' ? workspace.branding as {palette?: unknown; fonts?: unknown; typography?: unknown} : null;
  const palette = stored ? readPalette(stored.palette) : null;
  const fonts = stored ? readFonts(stored.fonts) : {};
  const typography = stored ? readTypography(stored.typography) : {};
  return {
    name: workspace.shortName,
    organizationName: workspace.organizationName,
    titleColor: workspace.colors.primary,
    titleShade: workspace.colors.deep,
    accentColor: workspace.colors.accent,
    logo: workspace.logo.src,
    logoAlt: workspace.logo.alt,
    ...(palette ? {palette} : {}),
    ...(Object.keys(fonts).length ? {fonts} : {}),
    ...(typography.accentTitle ? {typography} : {}),
  };
}
