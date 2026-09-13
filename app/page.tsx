import type {Metadata} from 'next';
import {getPublicWorkspace} from '@/lib/workspace';
import Console from './console';

export function generateMetadata(): Metadata {
  const workspace = getPublicWorkspace();
  return {title: `${workspace.productName} · Live control`};
}

export default function Home(){return <Console/>}
