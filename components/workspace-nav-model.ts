import type {AccessRole} from '@/lib/access';

export type NavPermission = 'member' | 'author';
export type NavDestination = readonly [href: string, label: string, permission: NavPermission];

// Mirrors canAccess() in lib/access.ts. That module cannot be imported here because it
// pulls in node:crypto and this navigation renders inside client components.
export const permitted = (role: AccessRole, permission: NavPermission) => permission === 'member' || role === 'owner' || role === 'editor';

/* X5 (Phase E): the old single "Services" pill became two, "Prepared services" (/services) and
   "Service log" (/services/log), side by side and with the same member visibility the one page
   had. Everything else is untouched. */
export const destinations: ReadonlyArray<NavDestination> = [
  ['/author', 'Library', 'author'],
  ['/', 'Live control', 'member'],
  ['/services', 'Prepared services', 'member'],
  ['/services/log', 'Service log', 'member'],
  ['/sources-review', 'Source review', 'author'],
  ['/health', 'Health', 'member'],
  ['/setup', 'Setup', 'member'],
  ['/help', 'Help', 'member'],
  ['/access', 'Account', 'member'],
];

/** Before the role is known the navigation shows the member pages only. */
export function visibleDestinations(role: AccessRole | undefined): ReadonlyArray<NavDestination> {
  return destinations.filter(([, , permission]) => (role === undefined ? permission === 'member' : permitted(role, permission)));
}

/** The pill marked aria-current="page". Paths are compared whole, so /services/log never marks /services. */
export function isCurrentDestination(href: string, current: string | undefined) {
  return current === href;
}
