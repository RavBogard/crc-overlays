import {json} from '@/lib/server';
import {publicWorkspaceWithBranding} from '@/lib/branding-store';
import {getPublicWorkspace} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

// L4: the stored workspace branding is applied here, so every renderer that reads its identity from
// this route draws with it. With nothing stored the body is exactly getPublicWorkspace().
export async function GET() {
  try {
    const workspace = getPublicWorkspace();
    return json(await publicWorkspaceWithBranding(workspace));
  } catch {
    return json({error: 'Workspace identity is not configured correctly'}, 503);
  }
}
