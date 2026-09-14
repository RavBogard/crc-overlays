import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Library`, description: 'Review exact source wording before it becomes draft work.'};
}

export default function SourcesReviewLayout({children}: {children: React.ReactNode}) {
  return children;
}
