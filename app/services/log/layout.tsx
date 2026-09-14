import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Service log`, description: 'The fallback and issue log for this congregation, and its CSV export.'};
}

export default function ServiceLogLayout({children}: {children: React.ReactNode}) {
  return children;
}
