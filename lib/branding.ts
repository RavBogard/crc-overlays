import type {PublicWorkspace} from './workspace';

export type OverlayBranding = {
  name: string;
  organizationName: string;
  titleColor: string;
  titleShade: string;
  accentColor: string;
  logo: string;
  logoAlt: string;
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

export function overlayBrandingFromWorkspace(workspace: Pick<PublicWorkspace, 'shortName'|'organizationName'|'colors'|'logo'>): OverlayBranding {
  if (!workspace || typeof workspace.shortName !== 'string' || typeof workspace.organizationName !== 'string' ||
      !workspace.colors || typeof workspace.colors.primary !== 'string' || typeof workspace.colors.deep !== 'string' || typeof workspace.colors.accent !== 'string' ||
      !workspace.logo || typeof workspace.logo.src !== 'string' || typeof workspace.logo.alt !== 'string') {
    throw new Error('Workspace branding is unavailable');
  }
  return {
    name: workspace.shortName,
    organizationName: workspace.organizationName,
    titleColor: workspace.colors.primary,
    titleShade: workspace.colors.deep,
    accentColor: workspace.colors.accent,
    logo: workspace.logo.src,
    logoAlt: workspace.logo.alt,
  };
}
