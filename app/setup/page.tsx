import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';
import SetupGuide from './setup-guide';
import styles from './setup.module.css';

export const metadata: Metadata = {
  title: 'Connect your sanctuary graphics',
  description: 'Guided setup for Companion, Stream Deck, vMix, and OBS.',
};

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
