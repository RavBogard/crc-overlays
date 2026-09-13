import {authorizeRequest} from '@/lib/access';
import {canonicalOrigin} from '../../../lib/oauth-core';
import {json} from '../../../lib/server';

export async function GET(request:Request){
  if(!await authorizeRequest(request,'control'))return json({error:'Control key required'},401);
  const outputKey=process.env.OUTPUT_KEY;
  if(!outputKey)return json({error:'Output access is not configured'},503);
  try{
    const url=`${canonicalOrigin(request)}/output#key=${encodeURIComponent(outputKey)}`;
    return json({url});
  }catch{
    return json({error:'Output URL is not configured'},503);
  }
}
