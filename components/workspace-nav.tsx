'use client';
/* This component resolves its own role from the session when the caller does not already know
   it, so the initial render intentionally starts member-only and upgrades from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {AccessRole} from '@/lib/access';
import styles from './workspace-nav.module.css';

type NavPermission = 'member' | 'author';
type AccessResponse = {user?: {role?: AccessRole} | null};

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
    const controller = new AbortController();
    fetch('/api/access', {credentials: 'include', signal: controller.signal})
      .then(r => (r.ok ? r.json() : null))
      .then((result: AccessResponse | null) => {
        if (result?.user?.role) setResolvedRole(result.user.role);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [role]);

  const visible = destinations.filter(([, , permission]) => resolvedRole === undefined ? permission === 'member' : permitted(resolvedRole, permission));
  return <nav className={`${styles.nav} ${className}`} aria-label="Workspace">
    {visible.map(([href, label]) => <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
