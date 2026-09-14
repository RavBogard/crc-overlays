import type {Metadata} from 'next';
import WorkspaceHeader from '@/components/workspace-header';
import {getPublicWorkspace} from '@/lib/workspace';
import {guideSections} from '@/lib/product-guides';
import styles from './help.module.css';
export function generateMetadata():Metadata{const workspace=getPublicWorkspace();return {title:`${workspace.productName} · Help`,description:'Setup, service, fallback, account, and recovery instructions.'}}
export default function HelpPage(){const workspace=getPublicWorkspace();return <main className={styles.page} style={{'--brand':workspace.colors.primary,'--deep':workspace.colors.deep,'--accent':workspace.colors.accent} as React.CSSProperties}>
 <WorkspaceHeader current="/help" title="Help" workspace={workspace} lede="Short, maintained instructions for setup, services, accounts, and recovery."/>
 <nav className={styles.contents} aria-label="Guide contents">{guideSections.map(section=><a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</nav>
 <div className={styles.guides}>{guideSections.map(section=><section id={section.id} key={section.id}><span>Procedure</span><h2>{section.title}</h2><p>{section.summary}</p><ol>{section.steps.map(step=><li key={step}>{step}</li>)}</ol>{section.id==='before-service'&&<a href="/setup">Open guided setup</a>}{section.id==='after-service'&&<a href="/system#log">Open the service log</a>}{section.id==='accounts'&&<a href="/system#people">Open People</a>}{section.id==='accounts'&&<p className={styles.command}>Recovery commands and file retention are documented in <code>docs/RECOVERY.md</code> for the administrator maintaining the deployment.</p>}</section>)}</div>
 </main>}
