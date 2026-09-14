import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Prepared services`, description: 'Service collections prepared ahead of time, and what each one covers.'};
}

export default function ServicesLayout({children}: {children: React.ReactNode}) {
  return children;
}
