import {canonicalOrigin} from '../../../lib/oauth-core';
import {authorized,json} from '../../../lib/server';

export function GET(request:Request){
  if(!authorized(request,true))return json({error:'Control key required'},401);
  const outputKey=process.env.OUTPUT_KEY;
  if(!outputKey)return json({error:'Output access is not configured'},503);
  try{
    const url=`${canonicalOrigin(request)}/output#key=${encodeURIComponent(outputKey)}`;
    return json({url});
  }catch{
    return json({error:'Output URL is not configured'},503);
  }
}
