import {secretEqual} from '@/lib/access';
import {CRC_WORKSPACE_ID,exportSharedLibrary,sharedLibraryExportSecret} from '@/lib/shared-library';
import {json} from '@/lib/server';

export async function GET(request:Request){
 if((process.env.WORKSPACE_ID?.trim().toLowerCase()||CRC_WORKSPACE_ID)!==CRC_WORKSPACE_ID)return json({error:'Not found'},404);
 const expected=sharedLibraryExportSecret();const match=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
 if(!expected)return json({error:'Shared library is unavailable'},503);
 if(!match||!secretEqual(match[1],expected))return json({error:'Unauthorized'},401);
 try{return json(await exportSharedLibrary())}catch{return json({error:'Shared library is temporarily unavailable'},503)}
}
