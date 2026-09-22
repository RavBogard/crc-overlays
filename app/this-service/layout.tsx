import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · This service`, description: 'The names and readings for this week, typed once.'};
}

export default function ThisServiceLayout({children}: {children: React.ReactNode}) {
  return children;
}
