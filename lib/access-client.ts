import type {AccessRole} from '@/lib/access';

/** The identity the shared header and navigation need. Never carries the email address. */
export type AccessUser = {name: string; role: AccessRole};

// One probe per page load. The header, the navigation and any page that asks all share this
// promise, so a signed-out browser produces a single 401 instead of one per component.
let probe: Promise<AccessUser | null> | null = null;

export function fetchAccessUser(): Promise<AccessUser | null> {
  if (!probe) {
    probe = fetch('/api/access', {credentials: 'include', cache: 'no-store'})
      .then(response => (response.ok ? response.json() : null))
      .then((body: {user?: {name?: string; role?: AccessRole} | null} | null) =>
        body?.user?.role && body.user.name ? {name: body.user.name, role: body.user.role} : null)
      .catch(() => null);
  }
  return probe;
}

/** Called after a sign-in, a sign-out, or a control-key change so the next read is fresh. */
export function resetAccessUserCache() {
  probe = null;
}
