'use client';
/* The header resolves the signed-in identity and the workspace itself when the page does not
   already know them, so the first render starts anonymous and upgrades from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import type {AccessRole} from '@/lib/access';
import type {PublicWorkspace} from '@/lib/workspace';
import {fetchAccessUser, resetAccessUserCache, type AccessUser} from '@/lib/access-client';
import StatusDot from './status-dot';
import WorkspaceNav from './workspace-nav';
import {destinations} from './workspace-nav-model';
import styles from './workspace-header.module.css';

export const roleLabel: Record<AccessRole, string> = {owner: 'Administrator', editor: 'Editor', operator: 'Operator'};

type Identity = {kind: 'none'} | {kind: 'session'; user: AccessUser} | {kind: 'control-key'};

// One workspace read per page load, shared by every header instance.
let workspaceProbe: Promise<PublicWorkspace | null> | null = null;
function fetchWorkspace(): Promise<PublicWorkspace | null> {
  if (!workspaceProbe) {
    workspaceProbe = fetch('/api/workspace')
      .then(response => (response.ok ? response.json() : null))
      .then((value: PublicWorkspace | null) => (value?.organizationName ? value : null))
      .catch(() => null);
  }
  return workspaceProbe;
}

function hasControlKey() {
  try {
    return Boolean(sessionStorage.getItem('crc-control-key'));
  } catch {
    return false;
  }
}

/* Layout pass (handoff #2, section A): Live, Library and System are titled by the lit nav item,
   so they render no page heading at all. A page that can be arrived at cold by URL — Account,
   Setup, Help, and the pages still being demoted — keeps a small one under the bar. */
const titled = (current: string) => !destinations.some(([href]) => href === current);

export type WorkspaceHeaderProps = {
  /** Path of the page, so the navigation can light the current destination. */
  current: string;
  /** The page name. Rendered as a small h1 under the bar only on pages that are not a destination. */
  title: string;
  lede?: string;
  role?: AccessRole;
  user?: AccessUser | null;
  workspace?: PublicWorkspace | null;
  /** Page-level actions shown at the right of the bar. Hidden below 1000px. */
  aside?: ReactNode;
  /** Called after a sign-out so a page that holds its own session state can reset itself.
   *  The console needs this: sign-out routes to '/', which is a no-op when it is already there. */
  onSignedOut?: () => void;
};

export default function WorkspaceHeader({current, title, lede, role, user, workspace, aside, onSignedOut}: WorkspaceHeaderProps) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity>(user ? {kind: 'session', user} : {kind: 'none'});
  const [resolvedWorkspace, setResolvedWorkspace] = useState<PublicWorkspace | null>(workspace ?? null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user !== undefined) {
      setIdentity(user ? {kind: 'session', user} : {kind: 'none'});
      return;
    }
    if (hasControlKey()) {
      setIdentity({kind: 'control-key'});
      return;
    }
    let live = true;
    void fetchAccessUser().then(result => {
      if (!live) return;
      setIdentity(result ? {kind: 'session', user: result} : hasControlKey() ? {kind: 'control-key'} : {kind: 'none'});
    });
    return () => {
      live = false;
    };
  }, [user]);

  useEffect(() => {
    if (workspace !== undefined && workspace !== null) {
      setResolvedWorkspace(workspace);
      return;
    }
    let live = true;
    void fetchWorkspace().then(value => {
      if (live && value) setResolvedWorkspace(value);
    });
    return () => {
      live = false;
    };
  }, [workspace]);

  useEffect(() => {
    if (!menuOpen) return;
    const away = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  function clearStoredKeys() {
    try {
      sessionStorage.removeItem('crc-control-key');
      sessionStorage.removeItem('crc-output-key');
    } catch {}
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/access', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'logout'})});
    } catch {}
    clearStoredKeys();
    resetAccessUserCache();
    setIdentity({kind: 'none'});
    setBusy(false);
    setMenuOpen(false);
    onSignedOut?.();
    router.push('/');
    router.refresh();
  }

  function disconnect() {
    clearStoredKeys();
    resetAccessUserCache();
    setIdentity({kind: 'none'});
    window.location.reload();
  }

  const navRole = role ?? (identity.kind === 'session' ? identity.user.role : identity.kind === 'control-key' ? 'owner' : undefined);
  const productName = resolvedWorkspace?.productName ?? 'Overlays';
  const signedIn = identity.kind === 'session' ? identity.user : null;

  return <header className={styles.shell}>
    <div className={styles.bar}>
      <Link className={styles.wordmark} href="/">{productName}</Link>
      <WorkspaceNav current={current} role={navRole} className={styles.nav}/>
      <div className={styles.right}>
        {aside && <div className={styles.aside}>{aside}</div>}
        {identity.kind !== 'none' && <StatusDot/>}
        {signedIn && <div className={styles.account} ref={menu}>
          <button type="button" className={styles.avatar} aria-expanded={menuOpen} aria-label={`Account: ${signedIn.name}`} onClick={() => setMenuOpen(value => !value)}>
            {signedIn.name.slice(0, 1).toLocaleUpperCase()}
          </button>
          {menuOpen && <div className={styles.menu} role="menu">
            <p><strong>{signedIn.name}</strong><span>{roleLabel[signedIn.role]}</span></p>
            <Link href="/access" role="menuitem" onClick={() => setMenuOpen(false)}>Account</Link>
            <button type="button" role="menuitem" disabled={busy} onClick={() => void signOut()}>Sign out</button>
          </div>}
        </div>}
        {identity.kind === 'control-key' && <button type="button" className={styles.disconnect} onClick={disconnect}>Disconnect</button>}
      </div>
    </div>
    {titled(current) && <div className={styles.pageTitle}>
      <h1>{title}</h1>
      {lede && <p>{lede}</p>}
    </div>}
  </header>;
}
