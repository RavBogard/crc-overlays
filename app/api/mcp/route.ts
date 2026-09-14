import {requireBearerAuth} from '@modelcontextprotocol/server';
import {authoringOperation} from '@/lib/authoring';
import {createAuthoringMcpHandler} from '@/lib/mcp';
import {boundedMcpRequest,hasTrustedOrigin,MAX_MCP_BODY} from '@/lib/mcp-http';
import {AUTHORING_SCOPE,canonicalOrigin,mcpResource} from '@/lib/oauth-core';
import {tokenVerifier} from '@/lib/oauth-store';

export const dynamic='force-dynamic';
// R7 - fit_check_draft launches headless Chromium, and an MCP client reaches it through this
// route, not /api/authoring. The two must agree: Node runtime, and room to outlast a cold
// Chromium start (the operation's own hard deadline is 25 s, lib/server-fit.ts). Without this
// the platform default cut the invocation off mid-launch and the agent saw a dead call.
export const runtime='nodejs';
export const maxDuration=60;
const handler=createAuthoringMcpHandler(authoringOperation);

function protectedResponse(response:Response){const headers=new Headers(response.headers);headers.set('Access-Control-Expose-Headers','Mcp-Session-Id,WWW-Authenticate');headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function serve(request:Request){const expectedOrigin=canonicalOrigin(request);if(!hasTrustedOrigin(request))return Response.json({error:'invalid_origin'},{status:403,headers:{'Cache-Control':'no-store'}});if(Number(request.headers.get('content-length')||0)>MAX_MCP_BODY)return Response.json({error:'request_too_large'},{status:413,headers:{'Cache-Control':'no-store'}});const resource=mcpResource(request);const gate=requireBearerAuth({verifier:tokenVerifier,requiredScopes:[AUTHORING_SCOPE],resourceMetadataUrl:`${expectedOrigin}/.well-known/oauth-protected-resource`});const auth=await gate(request);if(auth instanceof Response)return protectedResponse(auth);if(auth.resource?.href!==resource)return protectedResponse(Response.json({error:'invalid_token'},{status:401}));let bounded;try{bounded=await boundedMcpRequest(request)}catch{return Response.json({error:'request_too_large'},{status:413,headers:{'Cache-Control':'no-store'}})}return protectedResponse(await handler.fetch(bounded,{authInfo:auth}))}
export async function POST(request:Request){return serve(request)}
export async function GET(request:Request){return serve(request)}
export async function DELETE(request:Request){return serve(request)}
export async function OPTIONS(request:Request){if(!hasTrustedOrigin(request))return new Response(null,{status:403});const origin=request.headers.get('origin');const headers:Record<string,string>={'Access-Control-Allow-Headers':'Authorization,Content-Type,Mcp-Protocol-Version,Mcp-Session-Id','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Max-Age':'600'};if(origin)headers['Access-Control-Allow-Origin']=origin;return new Response(null,{status:204,headers})}
