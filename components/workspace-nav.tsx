'use client';
/* This component resolves its own role from the session when the caller does not already know
   it, so the initial render intentionally starts member-only and upgrades from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {AccessRole} from '@/lib/access';
import {fetchAccessUser} from '@/lib/access-client';
import styles from './workspace-nav.module.css';
import {isCurrentDestination, visibleDestinations} from './workspace-nav-model';

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

  const visible = visibleDestinations(resolvedRole);
  return <nav className={`${styles.nav} ${className}`} aria-label="Workspace">
    {visible.map(([href, label]) => <Link key={href} href={href} aria-current={isCurrentDestination(href, current) ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
