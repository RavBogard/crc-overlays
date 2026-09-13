import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Account`, description: 'Sign in, manage members, and set a password.'};
}

export default function AccessLayout({children}: {children: React.ReactNode}) {
  return children;
}
