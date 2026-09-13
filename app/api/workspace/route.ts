import {json} from '@/lib/server';
import {getPublicWorkspace} from '@/lib/workspace';

export function GET() {
  try {
    return json(getPublicWorkspace());
  } catch {
    return json({error: 'Workspace identity is not configured correctly'}, 503);
  }
}
