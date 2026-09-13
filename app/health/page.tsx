import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';
import WorkspaceHeader from '@/components/workspace-header';
import HealthClient from './health-client';
import styles from './health.module.css';

export function generateMetadata():Metadata{const workspace=getPublicWorkspace();return {title:`${workspace.productName} · Health`,description:'Live, authoring, synchronization, and recovery status.'}}
export default function HealthPage(){const workspace=getPublicWorkspace();return <main className={styles.page} style={{'--brand':workspace.colors.primary,'--deep':workspace.colors.deep,'--accent':workspace.colors.accent} as React.CSSProperties}>
 <WorkspaceHeader current="/health" title="Health" workspace={workspace} lede="What is ready for a service, what needs attention, and when each check was observed."/>
 <HealthClient workspaceName={workspace.shortName}/>
 </main>}
