import {authorizeRequest} from '@/lib/access';
import {DEVICE_TOKEN} from '@/lib/devices';
import {canonicalOrigin} from '../../../lib/oauth-core';
import {json} from '../../../lib/server';

/**
 * The URL an operator pastes into OBS or vMix. `?device=cd_...` builds the durable
 * form (D5) from a credential the caller has just been given by /api/devices; with no
 * parameter the legacy OUTPUT_KEY form is returned unchanged, so nothing existing breaks.
 */
export async function GET(request:Request){
  if(!await authorizeRequest(request,'control'))return json({error:'Control key required'},401);
  const device=new URL(request.url).searchParams.get('device');
  if(device!==null){
    if(!DEVICE_TOKEN.test(device))return json({error:'That graphics connection is not recognized.'},400);
    return json({url:`${canonicalOrigin(request)}/output#device=${device}`});
  }
  const outputKey=process.env.OUTPUT_KEY;
  if(!outputKey)return json({error:'Output access is not configured'},503);
  try{
    const url=`${canonicalOrigin(request)}/output#key=${encodeURIComponent(outputKey)}`;
    return json({url});
  }catch{
    return json({error:'Output URL is not configured'},503);
  }
}
