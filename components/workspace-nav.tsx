'use client';
/* This component resolves its own role from the session when the caller does not already know
   it, so the initial render intentionally starts member-only and upgrades from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {AccessRole} from '@/lib/access';
import {fetchAccessUser} from '@/lib/access-client';
import styles from './workspace-nav.module.css';

type NavPermission = 'member' | 'author';

// Mirrors canAccess() in lib/access.ts. That module cannot be imported here because it
// pulls in node:crypto and this navigation renders inside client components.
const permitted = (role: AccessRole, permission: NavPermission) => permission === 'member' || role === 'owner' || role === 'editor';

const destinations: ReadonlyArray<readonly [string, string, NavPermission]> = [
  ['/author', 'Library', 'author'],
  ['/', 'Live control', 'member'],
  ['/services', 'Services', 'member'],
  ['/sources-review', 'Source review', 'author'],
  ['/health', 'Health', 'member'],
  ['/setup', 'Setup', 'member'],
  ['/help', 'Help', 'member'],
  ['/access', 'Account', 'member'],
];

export default function WorkspaceNav({current, className = '', role}: {current?: string; className?: string; role?: AccessRole}) {
  const [resolvedRole, setResolvedRole] = useState<AccessRole | undefined>(role);

  useEffect(() => {
    setResolvedRole(role);
    if (role !== undefined) return;
    // A stored control key has historically granted full (owner-equivalent) access; see app/console.tsx.
    try {
      if (sessionStorage.getItem('crc-control-key')) {
        setResolvedRole('owner');
        return;
      }
    } catch {}
    let live = true;
    // Shared with the header and the rest of the page: one /api/access probe per page load.
    void fetchAccessUser().then(user => {
      if (live && user) setResolvedRole(user.role);
    });
    return () => {
      live = false;
    };
  }, [role]);

  const visible = destinations.filter(([, , permission]) => resolvedRole === undefined ? permission === 'member' : permitted(resolvedRole, permission));
  return <nav className={`${styles.nav} ${className}`} aria-label="Workspace">
    {visible.map(([href, label]) => <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
