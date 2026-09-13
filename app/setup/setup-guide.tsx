'use client';

import Image from 'next/image';
import Link from 'next/link';
import {useMemo, useState} from 'react';
import type {PublicWorkspace} from '@/lib/workspace';
import WorkspaceNav from '@/components/workspace-nav';
import styles from './setup.module.css';

type Application = 'vmix' | 'obs';
type RequestResult = {response: Response; body: Record<string, unknown>} | {needsKey: true};
type Renderer = {seen?: number; phase?: string};

async function readJson(response: Response) {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}

export default function SetupGuide({workspace}: {workspace: PublicWorkspace}) {
  const [application, setApplication] = useState<Application>(workspace.id === 'crc' ? 'vmix' : 'obs');
  const [legacyKey, setLegacyKey] = useState('');
  const [showLegacyAccess, setShowLegacyAccess] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle'|'checking'|'connected'|'missing'|'unavailable'>('idle');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [companionConfirmed, setCompanionConfirmed] = useState(false);

  async function authenticatedGet(path: string): Promise<RequestResult> {
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
        setConnectionStatus('unavailable');
        return;
      }
      if (!result.response.ok) {
        setConnectionStatus('unavailable');
        return;
      }
      const renderers = Array.isArray(result.body.renderers) ? result.body.renderers as Renderer[] : [];
      const serverTime = typeof result.body.serverTime === 'number' ? result.body.serverTime : Date.now();
      const freshRenderer = renderers.some(renderer => typeof renderer.seen !== 'number' || serverTime - renderer.seen < 30_000);
      setConnectionStatus(freshRenderer ? 'connected' : 'missing');
    } catch {
      setConnectionStatus('unavailable');
    }
  }

  const appInstructions = useMemo(() => application === 'vmix' ? {
    name: 'vMix',
    path: 'Add Input → Web Browser',
    sourceName: workspace.outputName,
    notes: 'Set Width to 1920 and Height to 1080. Keep the page transparent and leave the existing Singular input in place for the trial.',
  } : {
    name: 'OBS',
    path: 'Sources → Add → Browser',
    sourceName: workspace.outputName,
    notes: 'Set Width to 1920 and Height to 1080. Keep the default transparent background. Leave “Shutdown source when not visible” off.',
  }, [application, workspace.outputName]);

  const moduleDownload = workspace.setupDownloads.find(item => item.kind === 'module');
  const pageDownloads = workspace.setupDownloads.filter(item => item.kind === 'pages');

  return <>
    <header className={`${styles.hero} ${workspace.id === 'crc' ? '' : styles.communityHero}`}>
      <div className={styles.identity}>
        <Image className={workspace.id === 'crc' ? styles.identityMark : styles.identityBanner} src={workspace.logo.src} alt={workspace.logo.alt} width={workspace.id === 'crc' ? 82 : 164} height={workspace.id === 'crc' ? 82 : 70}/>
        <div>
          <span className={styles.eyebrow}>{workspace.organizationName}</span>
          <h1>Connect your sanctuary</h1>
          <p>Add {workspace.productName} beside your current graphics system. Your existing Singular setup, camera controls, and Companion pages stay in place during the trial.</p>
        </div>
      </div>
      <WorkspaceNav current="/setup"/>
    </header>

    <section className={styles.intro}>
      <p><strong>Allow about 10 minutes.</strong> You will add one Companion connection and one new browser input. Nothing on this page puts a graphic on air.</p>
      <span>{workspace.stage === 'trial' ? 'Parallel trial' : 'Production workspace'}</span>
    </section>

    <ol className={styles.steps}>
      <li className={styles.step}>
        <div className={styles.stepNumber}>1</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>Before you begin</span>
          <h2>Protect the setup you already use</h2>
          <p>In Companion, open <strong>Import / Export</strong> and save a full backup. Choose two pages that are completely empty. Do not replace or rename your Singular connection.</p>
          <label className={styles.confirm}>
            <input type="checkbox" checked={backupConfirmed} onChange={event => setBackupConfirmed(event.target.checked)}/>
            <span>I saved a backup and found two empty pages.</span>
          </label>
        </div>
      </li>

      <li className={styles.step}>
        <div className={styles.stepNumber}>2</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>Companion + Stream Deck</span>
          <h2>Add the controls</h2>
          {moduleDownload && pageDownloads.length ? <>
            <p>First import the module package from Companion’s <strong>Modules</strong> page. {workspace.id === 'crc' ? <>Add a <strong>{workspace.productName}</strong> connection.</> : <>The installed module is named <strong>CRC Overlays</strong>; that is its technical name. Add a connection and label it <strong>{workspace.productName}</strong> so operators see this congregation’s name.</>} Then import each button page into one of the empty pages you chose.</p>
            <div className={styles.downloads}>
              <a className={styles.primaryDownload} href={moduleDownload.href} download>{moduleDownload.label}<small>{moduleDownload.description}</small></a>
              {pageDownloads.map(download => <a href={download.href} download key={download.href}>{download.label}<small>{download.description}</small></a>)}
            </div>
            <p className={styles.caution}>During page import, map the page’s {workspace.productName} placeholder to the connection you just added. Never choose “Full Reset then Import.”</p>
          </> : <p className={styles.notice}>The Companion files for this congregation have not been published yet. The congregation’s operator can finish this step when its reviewed module and button pages are ready.</p>}
          <label className={styles.confirm}>
            <input type="checkbox" checked={companionConfirmed} onChange={event => setCompanionConfirmed(event.target.checked)}/>
            <span>Companion shows the {workspace.productName} connection as OK.</span>
          </label>
        </div>
      </li>

      <li className={styles.step}>
        <div className={styles.stepNumber}>3</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>Graphics output</span>
          <h2>Add a separate browser input</h2>
          <fieldset className={styles.applicationPicker}>
            <legend>Which application is on this computer?</legend>
            <label className={application === 'vmix' ? styles.selected : ''}><input type="radio" name="application" value="vmix" checked={application === 'vmix'} onChange={() => setApplication('vmix')}/><span><strong>vMix</strong><small>{workspace.id === 'crc' ? 'Michael’s current setup' : 'Web Browser input'}</small></span></label>
            <label className={application === 'obs' ? styles.selected : ''}><input type="radio" name="application" value="obs" checked={application === 'obs'} onChange={() => setApplication('obs')}/><span><strong>OBS</strong><small>{workspace.id === 'crc' ? 'Browser Source' : `${workspace.shortName}’s current setup`}</small></span></label>
          </fieldset>
          <div className={styles.appCard}>
            <div><span>In {appInstructions.name}</span><strong>{appInstructions.path}</strong></div>
            <div><span>Name</span><strong>{appInstructions.sourceName}</strong></div>
            <p>{appInstructions.notes}</p>
          </div>
          <button className={styles.copyButton} type="button" onClick={() => void copyOutputUrl()}>Copy private output URL</button>
          {copyStatus && <p className={styles.liveMessage} role="status" aria-live="polite">{copyStatus}</p>}
          {showLegacyAccess && <div className={styles.legacyAccess}>
            <label htmlFor="setup-access-key">Setup access key</label>
            <p>Use the key provided by your workspace owner. Signed-in setup will not need this field.</p>
            <input id="setup-access-key" type="password" autoComplete="off" value={legacyKey} onChange={event => setLegacyKey(event.target.value)}/>
          </div>}
        </div>
      </li>

      <li className={styles.step}>
        <div className={styles.stepNumber}>4</div>
        <div className={styles.stepBody}>
          <span className={styles.kicker}>Connection check</span>
          <h2>Make sure the graphics browser is ready</h2>
          <p>Open the new browser input, then check its connection here. A connected result means the graphics page is responding. It does not mean the input is on air.</p>
          <button className={styles.checkButton} type="button" onClick={() => void checkOutput()} disabled={connectionStatus === 'checking'}>{connectionStatus === 'checking' ? 'Checking…' : 'Check graphics connection'}</button>
          <div className={`${styles.result} ${styles[connectionStatus]}`} role="status" aria-live="polite">
            {connectionStatus === 'idle' && 'Ready when your new browser input is open.'}
            {connectionStatus === 'checking' && 'Looking for the graphics browser…'}
            {connectionStatus === 'connected' && <><strong>Graphics browser connected</strong><span>Confirm the picture on the {appInstructions.name} program monitor before service.</span></>}
            {connectionStatus === 'missing' && <><strong>No graphics browser found</strong><span>Open or refresh the new {appInstructions.name} browser input, then check again.</span></>}
            {connectionStatus === 'unavailable' && <><strong>Could not check the connection</strong><span>Check your access and internet connection, then try again.</span></>}
          </div>
        </div>
      </li>
    </ol>

    <section className={styles.finish}>
      <div>
        <span className={styles.kicker}>Rehearsal</span>
        <h2>Test before using it in a service</h2>
        <p>With the new input off air, test one cue, a fast cue change, Animate Out, and Clear Now. Restart Companion and the browser input once. To return to Singular, take this input off air and use the unchanged Singular input.</p>
      </div>
      <Link href="/">Open overlay control</Link>
    </section>

    <footer className={styles.footer}>
      <span>{workspace.shortName} workspace · {workspace.stage === 'trial' ? 'Trial setup' : 'Production setup'}</span>
      {workspace.supportEmail && <a href={`mailto:${workspace.supportEmail}`}>Get setup help</a>}
    </footer>
  </>;
}
