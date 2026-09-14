import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Library`, description: 'Create, review, and publish graphics.'};
}

export default function AuthorLayout({children}: {children: React.ReactNode}) {
  return children;
}
