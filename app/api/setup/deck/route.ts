import {authorizeRequest,sameSiteWrite} from '@/lib/access';
import {readConnectionValues} from '@/lib/companion-deck/personal';
import {canonicalOrigin} from '@/lib/oauth-core';
import {defaultReviewBoardRepository} from '@/lib/review-board';
import {loadSetupDeck} from '@/lib/setup-deck';
import {setupFlowFor} from '@/lib/setup-flow';
import {handleSetupDeck} from '@/lib/setup-http';
import {getPublicWorkspace} from '@/lib/workspace';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const configured=()=>{try{return readConnectionValues()!==null}catch{return false}};

export async function GET(request:Request){
 return handleSetupDeck(request,{flow:setupFlowFor(getPublicWorkspace().id),authorize:authorizeRequest,sameSite:sameSiteWrite,origin:canonicalOrigin,summary:loadSetupDeck,reviewBoard:()=>defaultReviewBoardRepository().latestBoard(),valuesConfigured:configured});
}
