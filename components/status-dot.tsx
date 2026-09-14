'use client';
/* This panel loads itself on mount, so the first render is intentionally empty and upgrades
   from an effect. */
/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Layout pass (handoff #2, D1) — the one status readout every role carries, in the header bar.
 *
 * Green when a graphics output has acknowledged within the last 30 seconds, amber when none
 * has, grey until the first answer. Its popover is the whole operator-facing Health and
 * Service log: one line of state, Check now, Setup, the fallback steps, and a single note box
 * that records what happened with the time, the on-air graphic and the connection state
 * attached automatically — so nobody fills in a form mid-service.
 *
 * It reads `/api/state`, which is the relay snapshot: cheap, and already the source the live
 * playback health card summarises. The heavier `/api/health` stays on the System page.
 */

import Link from 'next/link';
import {useCallback, useEffect, useRef, useState} from 'react';
import {readSnapshot, type DotState, type PresenceSnapshot as Snapshot} from '@/lib/output-presence';
import styles from './status-dot.module.css';

export default function StatusDot({className = ''}: {className?: string}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [known, setKnown] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/state', {cache: 'no-store', signal: AbortSignal.timeout(6000)});
      if (!response.ok) throw new Error('unavailable');
      setSnapshot(await response.json() as Snapshot);
    } catch {
      setSnapshot(null);
    } finally {
      setKnown(true);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, 20_000);
    return () => clearInterval(timer);
  }, [check]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const {state, line} = known ? readSnapshot(snapshot) : {state: 'unknown' as DotState, line: 'Checking the output…'};

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const reason = note.trim();
    if (!reason) return;
    setBusy(true);
    setSent('');
    const onAir = snapshot?.cuePayload?.name || snapshot?.cue || 'nothing on air';
    try {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          operation: 'record_feedback',
          input: {kind: 'issue', impact: 'minor', productGap: false, cueId: snapshot?.cue || undefined, reason, context: `On air: ${onAir} · ${line}`.slice(0, 240)},
        }),
      });
      if (!response.ok) throw new Error('unavailable');
      setNote('');
      setSent('Sent. An administrator sees it in System › Log.');
    } catch {
      setSent('That note could not be saved. Try again after the service.');
    } finally {
      setBusy(false);
    }
  }

  return <div className={`${styles.wrapper} ${className}`} ref={wrapper}>
    <button type="button" className={styles.dot} data-state={state} aria-expanded={open} aria-label={`Output status: ${line}`} title={line} onClick={() => setOpen(value => !value)}>
      <span aria-hidden/>
    </button>
    {open && <div className={styles.popover} role="dialog" aria-label="Output status">
      <p className={styles.line} data-state={state}>{line}</p>
      <div className={styles.links}>
        <button type="button" onClick={() => void check()}>Check now</button>
        <Link href="/setup" onClick={() => setOpen(false)}>Setup</Link>
        <Link href="/help#during-service" onClick={() => setOpen(false)}>Fallback steps</Link>
      </div>
      <form onSubmit={event => void send(event)}>
        <label htmlFor="status-note">Something&rsquo;s wrong?</label>
        <textarea id="status-note" value={note} maxLength={1200} rows={3} placeholder="What happened? The time, the graphic on air and the connection state are attached." onChange={event => setNote(event.target.value)}/>
        <button type="submit" disabled={busy || !note.trim()}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
      {sent && <p className={styles.sent} role="status">{sent}</p>}
    </div>}
  </div>;
}
