import {authorizeRequest,sameSiteWrite} from '@/lib/access';
import {personalExport,personalFileName,readConnectionValues} from '@/lib/companion-deck/personal';
import {validatedDeck} from '@/lib/companion-deck/tools';
import {deviceStore} from '@/lib/devices';
import {canonicalOrigin} from '@/lib/oauth-core';
import {setupFlowFor} from '@/lib/setup-flow';
import {handlePersonalDeck} from '@/lib/setup-http';
import {getPublicWorkspace} from '@/lib/workspace';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// The operator's personal Companion file (lib/companion-deck/personal.ts). POST only, from the Setup
// page, for a signed-in Owner; never an MCP tool and never cached.
export async function POST(request:Request){
 return handlePersonalDeck(request,{
  flow:setupFlowFor(getPublicWorkspace().id),authorize:authorizeRequest,sameSite:sameSiteWrite,origin:canonicalOrigin,devices:deviceStore,
  deck:validatedDeck,values:readConnectionValues,fileName:personalFileName,
  build:(stored,values,flow,overlays)=>personalExport(stored.deck,{values,valueLabels:flow.valueLabels,noValues:flow.noValues,enableFilled:flow.enableFilled,overlays}),
 });
}
