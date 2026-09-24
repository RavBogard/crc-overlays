'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PublicWorkspace} from '@/lib/workspace';
import WorkspaceHeader from '@/components/workspace-header';
import {companionPress, foldPress, personalDeviceName, pressRendered, setupFlowFor, textRuns, type PressRow, type SetupBlock, type SetupFlow, type SetupStep} from '@/lib/setup-flow';
import type {SetupDeckSummary} from '@/lib/setup-deck';
import {firstUnverifiedStep, freshControllerCount, freshControllerVersion, pairingRedeemed, personalCheckedIn, stepMode, stepsToPersist, verifiedSteps} from './setup-steps';
import styles from './setup.module.css';

type ProgressBody = {steps?: Record<string, boolean>; persisted?: boolean};
type DeckView = SetupDeckSummary & {reviewBoard: {id: string; title: string} | null; personal: {owner: boolean; configured: boolean}};
type Pairing = {code: string; expiresAt: number; name: string} | null;

const POLL_MS = 3000;
/** How long step 4 waits for the downloaded file's connection before it opens the pairing steps. */
const PAIRING_GRACE_MS = 60_000;

async function readJson(response: Response) {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}

/** `**word**` is a word the operator looks for on screen. */
function Rich({text}: {text: string}) {
  return <>{textRuns(text).map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>)}</>;
}

/** A verified step is evidence, not a control: it is text, never an editable checkbox (D10). */
function Verified({children}: {children: string}) {
  return <p className={styles.verified} role="status"><span aria-hidden>✓</span>{children}</p>;
}

const where = (page?: number, pageName?: string, row?: number, col?: number) => `page ${page} “${pageName}”, row ${(row ?? 0) + 1}, column ${(col ?? 0) + 1}`;
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit', second: '2-digit'});

/** `embedded` renders the guide inside the System page, which already carries the header bar. */
export default function SetupGuide({workspace, embedded}: {workspace: PublicWorkspace; embedded?: boolean}) {
  const flow = setupFlowFor(workspace.id);
  if (!flow) return <>
    {!embedded && <WorkspaceHeader current="/setup" title="Setup" workspace={workspace}/>}
    <p className={styles.notice}>This workspace has no setup flow yet. Ask the workspace’s administrator.</p>
  </>;
  return <Flow workspace={workspace} flow={flow} embedded={embedded}/>;
}

function Flow({workspace, flow, embedded}: {workspace: PublicWorkspace; flow: SetupFlow; embedded?: boolean}) {
  const [recorded, setRecorded] = useState<Record<string, boolean>>({});
  const [progressPersisted, setProgressPersisted] = useState<boolean | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [devices, setDevices] = useState<unknown>(null);
  const [deck, setDeck] = useState<DeckView | null>(null);
  const [deckError, setDeckError] = useState('');
  const [graphicsUrl, setGraphicsUrl] = useState('');
  const [graphicsStatus, setGraphicsStatus] = useState('');
  const [pairing, setPairing] = useState<Pairing>(null);
  const [pairingStatus, setPairingStatus] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadedAt, setDownloadedAt] = useState<number | null>(null);
  const [presses, setPresses] = useState<PressRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [loadedAt] = useState(() => Date.now());
  const attempted = useRef(new Set<string>());
  const stepRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const landed = useRef(false);

  const checkedIn = personalCheckedIn(devices, flow.operator);

  const saveProgress = useCallback(async (changes: Record<string, boolean>) => {
    if (!Object.keys(changes).length) return;
    try {
      const response = await fetch('/api/setup-progress', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({steps: changes})});
      if (response.status === 401) { setProgressPersisted(false); return; }
      if (!response.ok) return;
      const body = await response.json() as ProgressBody;
      setProgressPersisted(body.persisted === true);
      if (body.persisted === true && body.steps) setRecorded(current => ({...current, ...body.steps}));
    } catch {}
  }, []);

  // Progress, the deck summary and the graphics URL are read once; presence is polled.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch('/api/setup-progress', {cache: 'no-store'});
        if (response.status === 401) setProgressPersisted(false);
        else if (response.ok) {
          const body = await response.json() as ProgressBody;
          if (!live) return;
          setProgressPersisted(body.persisted === true);
          setRecorded(current => ({...body.steps, ...current}));
        }
      } catch {}
    })();
    void (async () => {
      try {
        const response = await fetch('/api/setup/deck', {cache: 'no-store'});
        const body = await readJson(response);
        if (!live) return;
        if (response.ok) setDeck(body as unknown as DeckView);
        else setDeckError(typeof body.error === 'string' ? body.error : 'The deck could not be read right now.');
      } catch { if (live) setDeckError('The deck could not be read right now.'); }
    })();
    void (async () => {
      try {
        const response = await fetch('/api/setup/graphics-url', {cache: 'no-store'});
        const body = await readJson(response);
        if (live && response.ok && typeof body.url === 'string') setGraphicsUrl(body.url);
      } catch {}
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    const poll = async () => {
      let body: unknown = null, devices: unknown = null;
      try { const response = await fetch('/api/state', {cache: 'no-store', signal: AbortSignal.timeout(5000)}); if (response.ok) body = await response.json(); } catch {}
      try { const response = await fetch('/api/devices', {cache: 'no-store', signal: AbortSignal.timeout(5000)}); if (response.ok) devices = await response.json(); } catch {}
      if (!live) return;
      setNow(Date.now());
      if (body) { setState(body); setPresses(rows => foldPress(rows, companionPress(body))); }
      if (devices) setDevices(devices);
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, []);

  // Evidence ticks a step as soon as it is seen and is written back once; the operator's own ticks are `recorded`.
  const verified = useMemo(() => verifiedSteps(flow, {state, now, personalCheckedIn: checkedIn, graphicsUrl: Boolean(graphicsUrl), pressRendered: pressRendered(presses)}), [flow, state, now, checkedIn, graphicsUrl, presses]);
  const steps = useMemo<Record<string, boolean>>(() => ({...recorded, ...verified}), [recorded, verified]);
  useEffect(() => {
    const pending = Object.fromEntries(Object.entries(stepsToPersist(recorded, verified)).filter(([step]) => !attempted.current.has(step)));
    if (!Object.keys(pending).length) return;
    for (const step of Object.keys(pending)) attempted.current.add(step);
    void saveProgress(pending);
  }, [recorded, verified, saveProgress]);

  useEffect(() => {
    if (landed.current || progressPersisted === null || state === null) return;
    landed.current = true;
    const target = firstUnverifiedStep(flow, steps);
    if (target && target !== flow.steps[0].key) stepRefs.current[target]?.scrollIntoView({block: 'start', behavior: 'smooth'});
  }, [flow, steps, progressPersisted, state]);

  // A pairing code clears itself once a Companion has redeemed it (the credential takes the code's name) or it expires.
  const livePairing = pairing && !pairingRedeemed(devices, pairing.name) && pairing.expiresAt > now ? pairing : null;

  function setManual(step: string, done: boolean) {
    setRecorded(current => ({...current, [step]: done}));
    void saveProgress({[step]: done});
  }

  async function issuePairingCode() {
    setBusy(true);
    setPairingStatus('');
    try {
      const name = personalDeviceName(flow, Date.now(), 'paired');
      const response = await fetch('/api/devices', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'pair_code', kind: 'companion', name})});
      const body = await readJson(response);
      if (response.ok && typeof body.code === 'string' && typeof body.expiresAt === 'number') setPairing({code: body.code, expiresAt: body.expiresAt, name});
      else setPairingStatus(response.status === 401 || response.status === 403 ? 'Sign in as an editor or an administrator to pair.' : typeof body.error === 'string' ? body.error : 'This could not be prepared. Try again.');
    } catch { setPairingStatus('This could not be prepared. Try again.'); }
    finally { setBusy(false); }
  }

  async function copyGraphicsUrl() {
    setBusy(true);
    setGraphicsStatus('');
    try {
      let url = graphicsUrl;
      if (!url) {
        const response = await fetch('/api/setup/graphics-url', {method: 'POST'});
        const body = await readJson(response);
        if (!response.ok || typeof body.url !== 'string') throw new Error(typeof body.error === 'string' ? body.error : 'The graphics URL could not be prepared. Try again.');
        url = body.url;
        setGraphicsUrl(url);
      }
      try { await navigator.clipboard.writeText(url); setGraphicsStatus('Copied. It keeps working after restarts; this page shows it again next time.'); }
      catch { setGraphicsStatus('Copy was blocked. Select the address above and copy it.'); }
    } catch (error) { setGraphicsStatus(error instanceof Error ? error.message : 'The graphics URL could not be prepared. Try again.'); }
    finally { setBusy(false); }
  }

  async function downloadPersonal(label: string) {
    setBusy(true);
    setDownloadStatus('Preparing your file…');
    try {
      const response = await fetch('/api/setup/companion', {method: 'POST'});
      if (!response.ok) { setDownloadStatus(await response.text()); return; }
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? `${label}.companionconfig`;
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = href; link.download = name; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setDownloadedAt(now);
      setDownloadStatus(`Saved as “${name}”. Treat it like a password.`);
      setManual('deck-download', true);
    } catch { setDownloadStatus('The file could not be made right now. Try again in a minute.'); }
    finally { setBusy(false); }
  }

  const moduleDownload = workspace.setupDownloads.find(item => item.kind === 'module');
  const companionOnline = freshControllerCount(state, now) > 0;
  const moduleVersion = freshControllerVersion(state, now);

  function block(step: SetupStep, item: SetupBlock, index: number) {
    const key = `${step.key}-${index}`;
    switch (item.kind) {
      case 'module':
        if (flow.id === 'crc' && companionOnline && moduleVersion) return <p key={key} className={moduleVersion === deck?.overlaysVersion ? styles.verified : styles.notice}>
          {moduleVersion === deck?.overlaysVersion ? <><span aria-hidden>✓</span>{`An Overlays connection is checked in on module ${moduleVersion}, the version the deck expects.`}</> : `An Overlays connection is checked in on module ${moduleVersion}; the deck expects ${deck?.overlaysVersion ?? 'another version'}. Install the package below and set the connection to it.`}
        </p>;
        return moduleDownload ? <div key={key} className={styles.downloads}><a className={styles.primaryDownload} href={moduleDownload.href} download>{`${workspace.productName} ${deck?.overlaysVersion ?? ''}`.trim()} (.tgz)<small>{moduleDownload.description}</small></a></div>
          : <p key={key} className={styles.notice}>The module package for this congregation has not been published yet.</p>;
      case 'companion-update':
        return <div key={key} className={styles.downloads}><a href={item.href} target="_blank" rel="noreferrer noopener">Companion {item.release}<small>Bitfocus’s download page</small></a></div>;
      case 'personal-deck': {
        const locked = !deck ? deckError || 'Checking the deck…' : !deck.ready ? `The deck is not ready, so the file is locked (${deck.errorCount} problem${deck.errorCount === 1 ? '' : 's'}). ${deck.reasons.slice(0, 3).join(' ')}` : !deck.personal.owner ? 'Only an administrator of this workspace can download this file.' : '';
        return <div key={key}>
          {deck && <p className={styles.deckLine}>{`Deck version ${deck.deck.version}, ${day(deck.deck.updatedAt)}: ${deck.deck.keys} keys on ${deck.deck.pages} pages.`}</p>}
          {locked ? <p className={styles.notice} role="status">{locked}</p>
            : <div className={styles.downloads}><button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void downloadPersonal(item.label)}>{item.label} (.companionconfig)<small>Made for you when you click, with its own device token.</small></button></div>}
          {downloadStatus && <p className={styles.liveMessage} role="status" aria-live="polite">{downloadStatus}</p>}
        </div>;
      }
      case 'pairing': {
        const done = steps[step.key] === true;
        if (done) return null;
        // TBI's file arrives paired: the steps open only if its connection has not checked in within a minute.
        const anchor = downloadedAt ?? loadedAt;
        const open = flow.id === 'tbi' ? now - anchor >= PAIRING_GRACE_MS : state !== null && !companionOnline;
        if (!open) return <p key={key} className={styles.pending}>Waiting for the connection to check in…</p>;
        return <PairingBox key={key} pairing={livePairing} status={pairingStatus} busy={busy} now={now} onIssue={() => void issuePairingCode()} intro={flow.id === 'tbi' ? 'It has not checked in. Pair it here:' : 'The Overlays connection is not checked in. Pair it here:'} connection={flow.id === 'tbi' ? 'TBI_Overlays' : 'Overlays'}/>;
      }
      case 'graphics-url':
        return <div key={key} className={styles.outputUrl}>
          {graphicsUrl && <input aria-label="Graphics URL" readOnly value={graphicsUrl} onFocus={event => event.currentTarget.select()}/>}
          <button className={styles.copyButton} type="button" disabled={busy} onClick={() => void copyGraphicsUrl()}>Copy your graphics URL</button>
          <p className={styles.small}>{`Paste it into ${item.source}. Width 1920, height 1080; keep the background transparent.`}</p>
          {graphicsStatus && <p className={styles.liveMessage} role="status" aria-live="polite">{graphicsStatus}</p>}
        </div>;
      case 'label-check':
        return <ul key={key} className={styles.labels}>
          {deck ? deck.connections.map(c => <li key={c.label}><code>{c.label}</code><span>{c.moduleId}</span></li>) : <li>{deckError || 'Reading the deck…'}</li>}
        </ul>;
      case 'press-test':
        return <div key={key}>
          <ol className={styles.tests}>
            {(deck?.tests ?? []).map(test => <li key={test.what}><strong>{test.what}</strong>{test.found ? `: ${where(test.page, test.pageName, test.row, test.col)}, “${(test.label ?? '').replace(/\n/g, ' ')}”` : ': not on the deck yet.'}</li>)}
            {item.byEye.map(line => <li key={line}>{line} <em>By eye.</em></li>)}
          </ol>
          <div className={styles.readout} role="log" aria-live="polite" aria-label="Presses">
            {presses.length === 0 ? <p>No Companion press yet.</p> : presses.map(row => <p key={row.at} className={row.status === 'rendered' ? styles.rendered : ''}>
              <span>{clock(row.at)}</span><strong>{row.cue ? row.name ?? row.cue : 'Clear'}</strong><em>{row.status === 'rendered' ? 'Rendered' : row.status === 'error' ? 'Error' : row.status === 'in transition' ? 'Animating' : 'Requested, not rendered'}</em>
            </p>)}
          </div>
          {item.more && <p className={styles.small}><a href={item.more.href} target="_blank" rel="noreferrer noopener">{item.more.label}</a></p>}
        </div>;
      case 'links':
        return <div key={key} className={styles.links}>
          {item.links.map(link => link.href === 'review-board'
            ? deck?.reviewBoard ? <a key={link.label} href={`/author/review/${encodeURIComponent(deck.reviewBoard.id)}`}>{link.label}<small>{deck.reviewBoard.title}</small></a> : null
            : <a key={link.label} href={link.href}>{link.label}</a>)}
        </div>;
    }
  }

  function tick(step: SetupStep) {
    const mode = stepMode(step, steps, state);
    if (step.verify === 'none') return null;
    if (mode === 'verified' && step.verify !== 'manual' && step.verify !== 'download') return <Verified>Done — confirmed by the system.</Verified>;
    if (mode === 'manual') return <label className={styles.confirm}>
      <input type="checkbox" checked={steps[step.key] === true} onChange={event => setManual(step.key, event.target.checked)}/>
      <span>{step.verify === 'download' ? 'Downloaded.' : 'Done.'}</span>
    </label>;
    return <p className={styles.pending}>{step.verify === 'press' ? 'Ticks itself after one press renders.' : 'Ticks itself.'}</p>;
  }

  return <>
    {!embedded && <WorkspaceHeader current="/setup" title="Setup" workspace={workspace} lede={`${flow.operator}’s install, top to bottom.`}/>}

    <section className={styles.intro}>
      <div>
        <p>{flow.intro}</p>
        <p className={styles.parts}>Companion 5: <a href={flow.companion.download} target="_blank" rel="noreferrer noopener">Bitfocus’s download</a>{workspace.supportEmail && <> · Help: <a href={`mailto:${workspace.supportEmail}`}>{workspace.supportEmail}</a></>}</p>
      </div>
    </section>

    <ol className={styles.steps}>
      {flow.steps.map((step, index) => <li key={step.key} className={`${styles.step} ${steps[step.key] ? styles.done : ''}`} ref={element => { stepRefs.current[step.key] = element; }}>
        <div className={styles.stepNumber}>{index + 1}</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>{step.kicker}</span>
          <h2>{step.title}</h2>
          {step.text.map(line => <p key={line}><Rich text={line}/></p>)}
          {step.blocks.map((item, blockIndex) => block(step, item, blockIndex))}
          {tick(step)}
        </div>
      </li>)}
    </ol>

    <details className={styles.recreate}>
      <summary>Pair another computer</summary>
      <PairingBox pairing={livePairing} status={pairingStatus} busy={busy} now={now} onIssue={() => void issuePairingCode()} intro="On the other computer, add the connection, then:" connection={flow.id === 'tbi' ? 'TBI_Overlays' : 'Overlays'}/>
    </details>

    {progressPersisted === false && <p className={styles.progressNote} role="status">Progress is saved for signed-in accounts.</p>}

    <footer className={styles.footer}>
      <span>{workspace.shortName} workspace</span>
      {workspace.supportEmail && <a href={`mailto:${workspace.supportEmail}`}>Get setup help</a>}
    </footer>

    <aside className={styles.goingBack} aria-label="Going back">
      <details>
        <summary>Going back</summary>
        <ol>{flow.goingBack.map(line => <li key={line}><Rich text={line}/></li>)}</ol>
      </details>
    </aside>
  </>;
}

function PairingBox({pairing, status, busy, now, onIssue, intro, connection}: {pairing: Pairing; status: string; busy: boolean; now: number; onIssue: () => void; intro: string; connection: string}) {
  const left = pairing ? Math.max(0, pairing.expiresAt - now) : 0;
  return <div className={styles.pairing}>
    <p>{intro}</p>
    <button className={styles.copyButton} type="button" disabled={busy} onClick={onIssue}>Get a pairing code</button>
    {pairing && <div className={styles.pairingCode}><strong>{pairing.code}</strong><span>{`${Math.floor(left / 60_000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')} left`}</span></div>}
    {pairing && <p><Rich text={`**Connections**, **${connection}**, paste the code into **Pairing code**, **Save**. It clears itself once accepted.`}/></p>}
    {status && <p className={styles.liveMessage} role="status" aria-live="polite">{status}</p>}
  </div>;
}
