'use client';

/**
 * Layout pass (handoff #2, D2) — System: one administrator destination holding the four
 * readouts that each used to be a nav pill of their own.
 *
 * Status is the workspace health page. People is the administration that left Account. Setup
 * is the guided setup, which keeps its own public route so an Editor can still connect a booth
 * computer without System access. Log is the service log, now a list rather than a form.
 */

/* eslint-disable react-hooks/set-state-in-effect */
import Link from 'next/link';
import {useEffect, useState} from 'react';
import WorkspaceHeader from '@/components/workspace-header';
import {fetchAccessUser} from '@/lib/access-client';
import type {PublicWorkspace} from '@/lib/workspace';
import PeoplePanels from '../access/people-panels';
import HealthClient from '../health/health-client';
import SetupGuide from '../setup/setup-guide';
import ServiceLogList from './service-log-list';
import SiddurLibraryCard from './siddur-library-card';
import styles from './system.module.css';

const TABS = [['status', 'Status'], ['people', 'People'], ['setup', 'Setup'], ['log', 'Log']] as const;
type Tab = (typeof TABS)[number][0];
const isTab = (value: string): value is Tab => TABS.some(([id]) => id === value);

export default function SystemClient({workspace}: {workspace: PublicWorkspace}) {
  const [tab, setTab] = useState<Tab>('status');
  const [role, setRole] = useState<'owner' | 'editor' | 'operator' | 'unknown' | 'none'>('unknown');

  // Deep links: the status dot points at System › Log, and Help points at Setup.
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (isTab(hash)) setTab(hash);
  }, []);

  useEffect(() => {
    let live = true;
    void fetchAccessUser().then(user => {
      if (live) setRole(user ? user.role : 'none');
    });
    return () => { live = false; };
  }, []);

  function choose(next: Tab) {
    setTab(next);
    history.replaceState(null, '', `${location.pathname}#${next}`);
  }

  return <main className={styles.page} style={{'--brand': workspace.colors.primary, '--deep': workspace.colors.deep, '--accent': workspace.colors.accent} as React.CSSProperties}>
    <WorkspaceHeader current="/system" title="System" workspace={workspace} role={role === 'unknown' || role === 'none' ? undefined : role}/>
    {role === 'unknown' ? <p className={styles.waiting}>Checking your access…</p>
      : role !== 'owner' ? <section className={styles.denied}>
        <h1>Administrator access</h1>
        <p>System holds workspace status, people, setup and the service log. Ask an administrator for what you need here, or open <Link href="/setup">Setup</Link> to connect this computer.</p>
      </section>
      : <>
        <div className={styles.tabs} role="tablist" aria-label="System">
          {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? styles.active : ''} onClick={() => choose(id)}>{label}</button>)}
        </div>
        <div className={styles.panel} role="tabpanel">
          {tab === 'status' && <><HealthClient workspaceName={workspace.shortName}/>{workspace.id === 'crc' && <SiddurLibraryCard/>}</>}
          {tab === 'people' && <PeoplePanels/>}
          {tab === 'setup' && <SetupGuide workspace={workspace} embedded/>}
          {tab === 'log' && <ServiceLogList/>}
        </div>
      </>}
  </main>;
}
