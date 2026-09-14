'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PublicWorkspace} from '@/lib/workspace';
import WorkspaceHeader from '@/components/workspace-header';
import {hasNamedOutputCredential, readDeviceList} from '../access/devices-copy';
import {COMPANION_STEP, OUTPUT_STEP, autoVerifiedSteps, companionStepMode, firstUnverifiedStep, stepsToPersist, type SetupStepKey, type StepMode} from './setup-steps';
import styles from './setup.module.css';

type Application = 'vmix' | 'obs';
type RequestResult = {response: Response; body: Record<string, unknown>} | {needsKey: true};
type ProgressBody = {steps?: Record<string, boolean>; persisted?: boolean};

async function readJson(response: Response) {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}

/** A verified step is evidence, not a control: it is text, never an editable checkbox (D10). */
function Verified({children}: {children: string}) {
  return <p className={styles.verified} role="status"><span aria-hidden>✓</span>{children}</p>;
}

/** `embedded` renders the guide inside the System page, which already carries the header bar. */
export default function SetupGuide({workspace, embedded}: {workspace: PublicWorkspace; embedded?: boolean}) {
  const [application, setApplication] = useState<Application>(workspace.defaultCompositor);
  const [legacyKey, setLegacyKey] = useState('');
  const [showLegacyAccess, setShowLegacyAccess] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle'|'checking'|'connected'|'missing'|'unavailable'|'signin'>('idle');
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [deviceName, setDeviceName] = useState('');
  const [outputName, setOutputName] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingStatus, setPairingStatus] = useState('');
  const [outputUrl, setOutputUrl] = useState('');
  const [outputStatus, setOutputStatus] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * How step 2 can be settled. `manual` only on a deployment whose `/api/state` cannot
   * report controllers at all - otherwise the step would never tick and the installer
   * would be stranded on it (A-5).
   */
  const [companionMode, setCompanionMode] = useState<StepMode>('pending');
  // null until the first read answers. false means this browser is a legacy key or signed out,
  // so the checklist still works but is remembered only for this page load.
  const [progressPersisted, setProgressPersisted] = useState<boolean | null>(null);
  const [progressSaved, setProgressSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRefs = useRef<Partial<Record<SetupStepKey, HTMLLIElement | null>>>({});
  /** A returning installer is walked to their first unverified step exactly once per visit. */
  const landed = useRef(false);

  const saveProgress = useCallback(async (changes: Record<string, boolean>) => {
    if (!Object.keys(changes).length) return;
    try {
      const response = await fetch('/api/setup-progress', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({steps: changes}),
      });
      if (response.status === 401) { setProgressPersisted(false); return; }
      if (!response.ok) return;
      const body = await response.json() as ProgressBody;
      setProgressPersisted(body.persisted === true);
      if (body.persisted !== true) return;
      if (body.steps) setSteps(current => ({...current, ...body.steps}));
      setProgressSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setProgressSaved(false), 2500);
    } catch {}
  }, []);

  const authenticatedGet = useCallback(async (path: string): Promise<RequestResult> => {
    const first = await fetch(path, {cache: 'no-store', signal: AbortSignal.timeout(5000)});
    if (first.status !== 401) return {response: first, body: await readJson(first)};
    const key = legacyKey || sessionStorage.getItem('crc-control-key') || '';
    if (!key) return {needsKey: true};
    const response = await fetch(path, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: {Authorization: `Bearer ${key}`},
    });
    return {response, body: await readJson(response)};
  }, [legacyKey]);

  /**
   * The self-verifying half of the checklist (D10). `/api/state` says whether a Companion and a
   * graphics browser are present right now; `/api/devices` says whether a named output connection
   * exists at all. A probe that cannot be reached simply verifies nothing — it never un-ticks a
   * step the installer already recorded.
   */
  const verify = useCallback(async (stored: Record<string, boolean>) => {
    let state: unknown = null;
    let devices = false;
    try {
      const result = await authenticatedGet('/api/state');
      if (!('needsKey' in result) && result.response.ok) state = result.body;
    } catch {}
    try {
      const response = await fetch('/api/devices', {cache: 'no-store', signal: AbortSignal.timeout(5000)});
      if (response.ok) devices = hasNamedOutputCredential(readDeviceList(await readJson(response)));
    } catch {}
    const now = Date.now();
    setCompanionMode(companionStepMode(state, now));
    const verified = autoVerifiedSteps({state, now, hasOutputCredential: devices});
    if (Object.keys(verified).length) setSteps(current => ({...current, ...verified}));
    await saveProgress(stepsToPersist(stored, verified));
    return {...stored, ...verified};
  }, [authenticatedGet, saveProgress]);

  // Reading progress never blocks the guide: a failure simply leaves the boxes unticked.
  useEffect(() => {
    let live = true;
    void (async () => {
      let stored: Record<string, boolean> = {};
      try {
        const response = await fetch('/api/setup-progress', {cache: 'no-store'});
        if (!live) return;
        if (response.status === 401) setProgressPersisted(false);
        else if (response.ok) {
          const body = await response.json() as ProgressBody;
          if (!live) return;
          setProgressPersisted(body.persisted === true);
          stored = body.steps ?? {};
          setSteps(stored);
        }
      } catch {}
      if (!live) return;
      const settled = await verify(stored);
      if (!live || landed.current) return;
      landed.current = true;
      const target = firstUnverifiedStep(settled);
      // Step one is where a first-time installer already is; only a returning one is moved.
      if (target && target !== COMPANION_STEP) stepRefs.current[target]?.scrollIntoView({block: 'start', behavior: 'smooth'});
    })();
    return () => {
      live = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [verify]);

  function setManualStep(step: SetupStepKey, done: boolean) {
    setSteps(current => ({...current, [step]: done}));
    void saveProgress({[step]: done});
  }

  async function createDevice(payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const response = await fetch('/api/devices', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);
    if (response.ok) return body;
    if (response.status === 401 || response.status === 403) throw new Error('Sign in as an owner or editor to continue.');
    throw new Error(typeof body.error === 'string' ? body.error : 'This could not be prepared. Try again.');
  }

  async function issuePairingCode() {
    setBusy(true);
    setPairingStatus('');
    try {
      const body = await createDevice({action: 'pair_code', name: deviceName.trim() || workspace.outputName, kind: 'companion'});
      setPairingCode(typeof body?.code === 'string' ? body.code : '');
      setPairingStatus(body && typeof body.code === 'string' ? '' : 'This could not be prepared. Try again.');
    } catch (error) {
      setPairingCode('');
      setPairingStatus(error instanceof Error ? error.message : 'This could not be prepared. Try again.');
    } finally { setBusy(false); }
  }

  async function createOutputConnection() {
    setBusy(true);
    setOutputStatus('');
    try {
      const body = await createDevice({action: 'create_output', name: outputName.trim() || workspace.outputName});
      if (!body || typeof body.url !== 'string') throw new Error('This could not be prepared. Try again.');
      setOutputUrl(body.url);
    } catch (error) {
      setOutputUrl('');
      setOutputStatus(error instanceof Error ? error.message : 'This could not be prepared. Try again.');
    } finally { setBusy(false); }
  }

  async function copyGraphicsUrl() {
    try {
      await navigator.clipboard.writeText(outputUrl);
      setOutputStatus('Copied. Paste this into the browser input. It keeps working after restarts.');
    } catch {
      setOutputStatus('Copy was blocked. Select the address above and copy it manually.');
    }
  }

  async function copyOutputUrl() {
    setCopyStatus('Preparing your private output URL…');
    try {
      const result = await authenticatedGet('/api/output-url');
      if ('needsKey' in result) {
        setShowLegacyAccess(true);
        setCopyStatus('Enter the access key you were given, then try again.');
        return;
      }
      if (!result.response.ok || typeof result.body.url !== 'string') {
        throw new Error(typeof result.body.error === 'string' ? result.body.error : 'The output URL is unavailable.');
      }
      await navigator.clipboard.writeText(result.body.url);
      setCopyStatus('Copied. Paste it into the new browser input; keep the URL private.');
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : 'The output URL is unavailable.');
    }
  }

  async function checkOutput() {
    setConnectionStatus('checking');
    try {
      const result = await authenticatedGet('/api/state');
      if ('needsKey' in result) {
        setShowLegacyAccess(true);
        setConnectionStatus('signin');
        return;
      }
      if (!result.response.ok) {
        // Sign-in has a way out for the reader; every other failure keeps the general wording.
        setConnectionStatus(result.response.status === 401 || result.response.status === 403 ? 'signin' : 'unavailable');
        return;
      }
      const renderers = Array.isArray(result.body.renderers) ? result.body.renderers as Array<{seen?: number}> : [];
      const serverTime = typeof result.body.serverTime === 'number' ? result.body.serverTime : Date.now();
      const freshRenderer = renderers.some(renderer => typeof renderer.seen !== 'number' || serverTime - renderer.seen < 30_000);
      setConnectionStatus(freshRenderer ? 'connected' : 'missing');
      void verify(steps);
    } catch {
      setConnectionStatus('unavailable');
    }
  }

  const appInstructions = useMemo(() => application === 'vmix' ? {
    name: 'vMix',
    path: 'Add Input → Web Browser',
    sourceName: workspace.outputName,
    notes: 'Set Width to 1920 and Height to 1080. Keep the page transparent.',
  } : {
    name: 'OBS',
    path: 'Sources → Add → Browser',
    sourceName: workspace.outputName,
    notes: 'Set Width to 1920 and Height to 1080. Keep the default transparent background. Leave “Shutdown source when not visible” off.',
  }, [application, workspace.outputName]);

  const moduleDownload = workspace.setupDownloads.find(item => item.kind === 'module');
  const pageDownloads = workspace.setupDownloads.filter(item => item.kind === 'pages');

  return <>
    {!embedded && <WorkspaceHeader current="/setup" title="Setup" workspace={workspace} lede="Connect Companion and the graphics browser on this computer."/>}

    <section className={styles.intro}>
      <div>
        <p><strong>About 10 minutes:</strong> one Companion connection and one browser input.</p>
      </div>
    </section>

    <ol className={styles.steps}>
      <li className={styles.step} ref={element => {stepRefs.current[COMPANION_STEP] = element;}}>
        <div className={styles.stepNumber}>1</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>Companion + Stream Deck</span>
          <h2>Add the controls</h2>
          {moduleDownload ? <>
            <p>Import the module package from Companion’s <strong>Modules</strong> page, add a <strong>{workspace.productName}</strong> connection, then pair it with the code below. After that, open the connection’s <strong>Presets</strong> and drag a preset onto any button — for example <strong>Toggle Barechu</strong>. Every preset is a toggle: press once to show the graphic, press again to animate it out.</p>
            <div className={styles.downloads}>
              <a className={styles.primaryDownload} href={moduleDownload.href} download>{moduleDownload.label}<small>{moduleDownload.description}</small></a>
            </div>
          </> : <p className={styles.notice}>The Companion files for this congregation have not been published yet. The congregation’s operator can finish this step when its reviewed module and button pages are ready.</p>}

          <div className={styles.pairing}>
            <label htmlFor="setup-companion-name">Name this Companion computer (for example, Booth PC)</label>
            <input id="setup-companion-name" autoComplete="off" maxLength={80} value={deviceName} onChange={event => setDeviceName(event.target.value)}/>
            <button className={styles.copyButton} type="button" disabled={busy} onClick={() => void issuePairingCode()}>Pair this Companion</button>
            {pairingCode && <div className={styles.pairingCode}><strong>{pairingCode}</strong><span>Enter this code in Companion within 10 minutes</span></div>}
            {pairingStatus && <p className={styles.liveMessage} role="status" aria-live="polite">{pairingStatus}</p>}
          </div>

          {pageDownloads.length > 0 && <details className={styles.recreate}>
            <summary>Recreate {workspace.shortName}’s exact button layout</summary>
            <p>Import each button page into a page that is empty. During page import, map the page’s {workspace.productName} placeholder to the connection you just added. Never choose “Full Reset then Import.”</p>
            <div className={styles.downloads}>
              {pageDownloads.map(download => <a href={download.href} download key={download.href}>{download.label}<small>{download.description}</small></a>)}
            </div>
          </details>}

          {companionMode === 'manual'
            ? <label className={styles.confirm}>
                <input type="checkbox" checked={steps[COMPANION_STEP] === true} onChange={event => setManualStep(COMPANION_STEP, event.target.checked)}/>
                <span>Companion is connected — I checked it myself.</span>
              </label>
            : steps[COMPANION_STEP] === true
              ? <Verified>Verified — Companion is connected to this workspace.</Verified>
              : <p className={styles.pending}>This step ticks itself once Companion connects.</p>}
        </div>
      </li>

      <li className={styles.step} ref={element => {stepRefs.current[OUTPUT_STEP] = element;}}>
        <div className={styles.stepNumber}>2</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>Graphics output</span>
          <h2>Add a separate browser input</h2>
          <fieldset className={styles.applicationPicker}>
            <legend>Which application is on this computer?</legend>
            <label className={application === 'vmix' ? styles.selected : ''}><input type="radio" name="application" value="vmix" checked={application === 'vmix'} onChange={() => setApplication('vmix')}/><span><strong>vMix</strong><small>{workspace.defaultCompositor === 'vmix' ? 'Default for this congregation' : 'Web Browser input'}</small></span></label>
            <label className={application === 'obs' ? styles.selected : ''}><input type="radio" name="application" value="obs" checked={application === 'obs'} onChange={() => setApplication('obs')}/><span><strong>OBS</strong><small>{workspace.defaultCompositor === 'obs' ? 'Default for this congregation' : 'Browser source'}</small></span></label>
          </fieldset>
          <div className={styles.appCard}>
            <div><span>In {appInstructions.name}</span><strong>{appInstructions.path}</strong></div>
            <div><span>Name</span><strong>{appInstructions.sourceName}</strong></div>
            <p>{appInstructions.notes}</p>
          </div>

          <div className={styles.pairing}>
            <label htmlFor="setup-output-name">Name this graphics computer (for example, Sanctuary PC)</label>
            <input id="setup-output-name" autoComplete="off" maxLength={80} value={outputName} onChange={event => setOutputName(event.target.value)}/>
            <button className={styles.copyButton} type="button" disabled={busy} onClick={() => void createOutputConnection()}>Create an output connection</button>
            {outputUrl && <div className={styles.outputUrl}>
              <input aria-label="Graphics URL" readOnly value={outputUrl} onFocus={event => event.currentTarget.select()}/>
              <button className={styles.copyButton} type="button" onClick={() => void copyGraphicsUrl()}>Copy the graphics URL</button>
              {/* The copied status repeats this sentence, so the static hint stands down while it shows. */}
              {!outputStatus && <p>Paste this into the browser input. It keeps working after restarts.</p>}
            </div>}
            {outputStatus && <p className={styles.liveMessage} role="status" aria-live="polite">{outputStatus}</p>}
          </div>

          <button className={styles.copyButton} type="button" onClick={() => void copyOutputUrl()}>Copy private output URL</button>
          {copyStatus && <p className={styles.liveMessage} role="status" aria-live="polite">{copyStatus}</p>}
          {showLegacyAccess && <div className={styles.legacyAccess}>
            <label htmlFor="setup-access-key">Setup access key</label>
            <p>Use the key provided by your workspace owner. Signed-in setup will not need this field.</p>
            <input id="setup-access-key" type="password" autoComplete="off" value={legacyKey} onChange={event => setLegacyKey(event.target.value)}/>
          </div>}

          <p>Open the new browser input, then check it here. A connected result means the graphics page is responding. It does not mean the input is on air.</p>
          <button className={styles.checkButton} type="button" onClick={() => void checkOutput()} disabled={connectionStatus === 'checking'}>{connectionStatus === 'checking' ? 'Checking…' : 'Check now'}</button>
          <div className={`${styles.result} ${styles[connectionStatus]}`} role="status" aria-live="polite">
            {connectionStatus === 'idle' && 'Ready when your new browser input is open.'}
            {connectionStatus === 'checking' && 'Looking for the graphics browser…'}
            {connectionStatus === 'connected' && <><strong>Graphics browser connected</strong><span>Confirm the picture on the {appInstructions.name} program monitor before service.</span></>}
            {connectionStatus === 'missing' && <><strong>No graphics browser found</strong><span>Open or refresh the new {appInstructions.name} browser input, then check again.</span></>}
            {connectionStatus === 'signin' && <span>Sign in to check the graphics connection.</span>}
            {connectionStatus === 'unavailable' && <><strong>Could not check the connection</strong><span>Check your access and internet connection, then try again.</span></>}
          </div>
          {steps[OUTPUT_STEP] === true && <Verified>Verified — a named graphics output is connected.</Verified>}
        </div>
      </li>
    </ol>

    {progressPersisted === false && <p className={styles.progressNote} role="status">Progress is saved for signed-in accounts.</p>}
    {progressSaved && <p className={styles.progressNote} role="status">Saved.</p>}

    <footer className={styles.footer}>
      <span>{workspace.shortName} workspace</span>
      {workspace.supportEmail && <a href={`mailto:${workspace.supportEmail}`}>Get setup help</a>}
    </footer>
  </>;
}
