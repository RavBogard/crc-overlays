import {canonicalOrigin,readLimitedBody} from './oauth-core';

export const MAX_MCP_BODY=1024*1024;
export function hasTrustedOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===canonicalOrigin(request)}
export async function boundedMcpRequest(request:Request){if(request.method!=='POST')return request;const body=await readLimitedBody(request,MAX_MCP_BODY);return new Request(request.url,{method:'POST',headers:request.headers,body,signal:request.signal})}
