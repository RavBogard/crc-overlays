import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';
import SystemClient from './system-client';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · System`, description: 'Workspace status, people, setup, and the service log.'};
}

export default function SystemPage() {
  return <SystemClient workspace={getPublicWorkspace()}/>;
}
