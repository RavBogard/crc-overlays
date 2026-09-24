import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';
import SetupGuide from './setup-guide';
import styles from './setup.module.css';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {
    title: `${workspace.productName} · Setup`,
    description: 'The operator’s install: Companion, Stream Deck and the graphics browser input, top to bottom.',
  };
}

export default function SetupPage() {
  const workspace = getPublicWorkspace();
  return (
    <main
      className={styles.page}
      style={{
        '--workspace-primary': workspace.colors.primary,
        '--workspace-deep': workspace.colors.deep,
        '--workspace-accent': workspace.colors.accent,
      } as React.CSSProperties}
    >
      <SetupGuide workspace={workspace}/>
    </main>
  );
}
