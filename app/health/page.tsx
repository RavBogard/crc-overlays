import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';
import WorkspaceNav from '@/components/workspace-nav';
import HealthClient from './health-client';
import styles from './health.module.css';

export const metadata:Metadata={title:'Workspace health',description:'Live, authoring, synchronization, and recovery status.'};
export default function HealthPage(){const workspace=getPublicWorkspace();return <main className={styles.page} style={{'--brand':workspace.colors.primary,'--deep':workspace.colors.deep,'--accent':workspace.colors.accent} as React.CSSProperties}>
 <header><div><span className={styles.eyebrow}>{workspace.organizationName}</span><h1>Workspace health</h1><p>What is ready for a service, what needs attention, and when each check was observed.</p></div><WorkspaceNav current="/health"/></header>
 <HealthClient workspaceName={workspace.shortName}/>
 </main>}
