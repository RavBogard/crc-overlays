import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Prepared services`, description: 'Prepared service collections and the global graphic finder.'};
}

export default function ServicesLayout({children}: {children: React.ReactNode}) {
  return children;
}
