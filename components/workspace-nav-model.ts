import type {AccessRole} from '@/lib/access';

export type NavPermission = 'member' | 'author' | 'admin';
export type NavDestination = readonly [href: string, label: string, permission: NavPermission];

// Mirrors canAccess() in lib/access.ts. That module cannot be imported here because it
// pulls in node:crypto and this navigation renders inside client components.
export const permitted = (role: AccessRole, permission: NavPermission) =>
  permission === 'member' || (permission === 'author' ? role === 'owner' || role === 'editor' : role === 'owner');

/* 2026-09-14 layout pass (handoff #2, section A): nine equal-weight pills became three
   destinations in task order. Everything that left the bar is one level down — Setup, the
   service log and workspace health live on /system, prepared services and source review in
   the library rail — and Help is the `?` at the end of the nav, not a destination here. */
export const destinations: ReadonlyArray<NavDestination> = [
  ['/', 'Live', 'member'],
  /* The names and readings of the week ahead sit beside Live control, one level, not nested
     behind the library or behind prepared services: filling them in is a weekly task on the
     way to a service, not authoring. An Editor is who does it, so it is an `author` pill. */
  ['/this-service', 'This service', 'author'],
  ['/author', 'Library', 'author'],
  ['/system', 'System', 'admin'],
];

export const HELP_DESTINATION: NavDestination = ['/help', 'Help', 'member'];

/** Before the role is known the navigation shows the member pages only. */
export function visibleDestinations(role: AccessRole | undefined): ReadonlyArray<NavDestination> {
  return destinations.filter(([, , permission]) => (role === undefined ? permission === 'member' : permitted(role, permission)));
}

/* Pages that moved under a destination still light it: the fit check and the editor are
   Library, and every System tab that kept its own route is System. Paths are compared as
   whole segments, so /services never marks /services/log or the other way round. */
const UNDER: ReadonlyArray<readonly [prefix: string, href: string]> = [
  ['/author', '/author'],
  ['/system', '/system'],
  ['/health', '/system'],
  ['/setup', '/system'],
  ['/services/log', '/system'],
];

export function isCurrentDestination(href: string, current: string | undefined) {
  if (current === undefined) return false;
  if (current === href) return true;
  const match = UNDER.find(([prefix]) => current === prefix || current.startsWith(`${prefix}/`));
  return match ? match[1] === href : false;
}
