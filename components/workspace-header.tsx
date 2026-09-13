'use client';
/* The header resolves the signed-in identity and the workspace itself when the page does not
   already know them, so the first render starts anonymous and upgrades from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import {useRouter} from 'next/navigation';
import {useEffect, useState, type ReactNode} from 'react';
import type {AccessRole} from '@/lib/access';
import type {PublicWorkspace} from '@/lib/workspace';
import {fetchAccessUser, resetAccessUserCache, type AccessUser} from '@/lib/access-client';
import WorkspaceNav from './workspace-nav';
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

export type WorkspaceHeaderProps = {
  /** Path of the page, so the navigation can mark the current pill. */
  current: string;
  /** The page name, rendered as the h1 under the product line. */
  title: string;
  lede?: string;
  role?: AccessRole;
  user?: AccessUser | null;
  workspace?: PublicWorkspace | null;
  /** Page-level actions and notes shown beside the navigation. Hidden below 1200px in compact mode. */
  aside?: ReactNode;
  /** Bar layout for the editor shell: eyebrow above one product/title row. */
  compact?: boolean;
};

export default function WorkspaceHeader({current, title, lede, role, user, workspace, aside, compact}: WorkspaceHeaderProps) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity>(user ? {kind: 'session', user} : {kind: 'none'});
  const [resolvedWorkspace, setResolvedWorkspace] = useState<PublicWorkspace | null>(workspace ?? null);
  const [busy, setBusy] = useState(false);

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
  const organizationName = resolvedWorkspace?.organizationName ?? '';
  const productName = resolvedWorkspace?.productName ?? 'Overlays';

  return <header className={`${styles.header} ${compact ? styles.compact : ''}`}>
    <div className={styles.lockup}>
      <span className={styles.eyebrow}>{organizationName}</span>
      <div className={styles.titles}>
        <span className={styles.product}>{productName}</span>
        <h1>{title}</h1>
      </div>
      {lede && <p className={styles.lede}>{lede}</p>}
    </div>
    <div className={styles.side}>
      {aside && <div className={styles.aside}>{aside}</div>}
      <WorkspaceNav current={current} role={navRole} className={styles.nav}/>
      {identity.kind === 'session' && <div className={styles.identity}>
        <span><strong>{identity.user.name}</strong> · {roleLabel[identity.user.role]}</span>
        <button type="button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
      </div>}
      {identity.kind === 'control-key' && <div className={styles.identity}>
        <span>Administrator connection</span>
        <button type="button" onClick={disconnect}>Disconnect</button>
      </div>}
    </div>
  </header>;
}
