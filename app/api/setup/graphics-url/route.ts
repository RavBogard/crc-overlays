import {authorizeRequest,sameSiteWrite} from '@/lib/access';
import {deviceStore} from '@/lib/devices';
import {canonicalOrigin} from '@/lib/oauth-core';
import {setupFlowFor} from '@/lib/setup-flow';
import {handleGraphicsUrl,type GraphicsDeps} from '@/lib/setup-http';
import {currentGraphicsUrl,mintGraphicsUrl,setupSealKey} from '@/lib/setup-output';
import {getPublicWorkspace} from '@/lib/workspace';

export const dynamic='force-dynamic';
export const runtime='nodejs';

function deps():GraphicsDeps{
 const workspace=getPublicWorkspace();
 return {flow:setupFlowFor(workspace.id),authorize:authorizeRequest,sameSite:sameSiteWrite,origin:canonicalOrigin,devices:deviceStore,key:setupSealKey(),current:currentGraphicsUrl,mint:mintGraphicsUrl,outputName:workspace.outputName};
}
export async function GET(request:Request){return handleGraphicsUrl(request,deps())}
export async function POST(request:Request){return handleGraphicsUrl(request,deps())}
