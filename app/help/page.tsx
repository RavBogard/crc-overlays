import type {Metadata} from 'next';
import WorkspaceHeader from '@/components/workspace-header';
import {getPublicWorkspace} from '@/lib/workspace';
import {GUIDE_VERSION,guideSections} from '@/lib/product-guides';
import styles from './help.module.css';
export function generateMetadata():Metadata{const workspace=getPublicWorkspace();return {title:`${workspace.productName} · Help`,description:'Setup, service, fallback, account, and recovery instructions.'}}
export default function HelpPage(){const workspace=getPublicWorkspace();return <main className={styles.page} style={{'--brand':workspace.colors.primary,'--deep':workspace.colors.deep,'--accent':workspace.colors.accent} as React.CSSProperties}>
 <WorkspaceHeader current="/help" title="Help" workspace={workspace} lede="Short, maintained instructions for setup, services, accounts, and recovery."/>
 <aside><strong>Guide version {GUIDE_VERSION}</strong><span>For {workspace.shortName} · {workspace.stage} workspace</span><a href="/health">Check workspace health</a></aside>
 <nav className={styles.contents} aria-label="Guide contents">{guideSections.map(section=><a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav>
 <div className={styles.guides}>{guideSections.map(section=><section id={section.id} key={section.id}><span>Procedure</span><h2>{section.title}</h2><p>{section.summary}</p><ol>{section.steps.map(step=><li key={step}>{step}</li>)}</ol>{section.id==='before-service'&&<a href="/setup">Open guided setup</a>}{(section.id==='fallback'||section.id==='after-service')&&<a href="/services/log">Record feedback in Service log</a>}{section.id==='accounts'&&<a href="/access">Open account management</a>}{section.id==='recovery'&&<p className={styles.command}>Recovery commands and file retention are documented in <code>docs/RECOVERY.md</code> for the administrator maintaining the deployment.</p>}</section>)}</div>
 <footer>These guides describe the product workflow. A physical OBS/vMix, Companion, network, restart, and fallback rehearsal is still required before live use.</footer>
 </main>}
