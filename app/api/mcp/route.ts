import {bearerAuthChallengeResponse,verifyBearerToken} from '@modelcontextprotocol/server';
import {authoringOperation} from '@/lib/authoring';
import {runMcpCommand} from '@/lib/live-command';
import {createAuthoringMcpHandler} from '@/lib/mcp';
import {ensurePublishedLayoutsRegistered} from '@/lib/layout-definitions';
import {createLiveOperation} from '@/lib/mcp/live';
import {boundedMcpRequest,hasTrustedOrigin,MAX_MCP_BODY} from '@/lib/mcp-http';
import {AUTHORING_SCOPE,canonicalOrigin,mcpResource} from '@/lib/oauth-core';
import {tokenVerifier} from '@/lib/oauth-store';
import {catalog,snapshot} from '@/lib/server';
import {deckGuardMinutes} from '@/lib/workspace';

export const dynamic='force-dynamic';
// R7 - fit_check_draft launches headless Chromium, and an MCP client reaches it through this
// route, not /api/authoring. The two must agree: Node runtime, and room to outlast a cold
// Chromium start (the operation's own hard deadline is 25 s, lib/server-fit.ts). Without this
// the platform default cut the invocation off mid-launch and the agent saw a dead call.
export const runtime='nodejs';
export const maxDuration=60;
// V3: the live tools go through the same command core as POST /api/command and read the same
// snapshot as GET /api/state; the deck guard window is workspace configuration.
const liveOperation=createLiveOperation({command:runMcpCommand,state:snapshot,catalog,guardMinutes:()=>deckGuardMinutes()});
const handler=createAuthoringMcpHandler(authoringOperation,undefined,[],liveOperation);
// L3: the tool schemas list layout ids from the registry as each request's server is built, so the
// workspace's published data layouts are registered first (re-read at most every 30 s).

// Any resource scope reaches the endpoint (the verifier refuses a token with none left), and each tool
// checks its own scope in lib/mcp.ts, so a live-only token connects. The challenge still names
// crc.authoring, exactly as before, so a client connecting with no scope in mind asks for authoring.
async function gate(request:Request,resourceMetadataUrl:string){const [header]=(request.headers.get('authorization')??'').split(',');try{return await verifyBearerToken(header||undefined,{verifier:tokenVerifier})}catch(error){return bearerAuthChallengeResponse(error,{requiredScopes:[AUTHORING_SCOPE],resourceMetadataUrl})}}
function protectedResponse(response:Response){const headers=new Headers(response.headers);headers.set('Access-Control-Expose-Headers','Mcp-Session-Id,WWW-Authenticate');headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function serve(request:Request){const expectedOrigin=canonicalOrigin(request);if(!hasTrustedOrigin(request))return Response.json({error:'invalid_origin'},{status:403,headers:{'Cache-Control':'no-store'}});if(Number(request.headers.get('content-length')||0)>MAX_MCP_BODY)return Response.json({error:'request_too_large'},{status:413,headers:{'Cache-Control':'no-store'}});const resource=mcpResource(request);const auth=await gate(request,`${expectedOrigin}/.well-known/oauth-protected-resource`);if(auth instanceof Response)return protectedResponse(auth);if(auth.resource?.href!==resource)return protectedResponse(Response.json({error:'invalid_token'},{status:401}));await ensurePublishedLayoutsRegistered();let bounded;try{bounded=await boundedMcpRequest(request)}catch{return Response.json({error:'request_too_large'},{status:413,headers:{'Cache-Control':'no-store'}})}return protectedResponse(await handler.fetch(bounded,{authInfo:auth}))}
export async function POST(request:Request){return serve(request)}
export async function GET(request:Request){return serve(request)}
export async function DELETE(request:Request){return serve(request)}
export async function OPTIONS(request:Request){if(!hasTrustedOrigin(request))return new Response(null,{status:403});const origin=request.headers.get('origin');const headers:Record<string,string>={'Access-Control-Allow-Headers':'Authorization,Content-Type,Mcp-Protocol-Version,Mcp-Session-Id','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Max-Age':'600'};if(origin)headers['Access-Control-Allow-Origin']=origin;return new Response(null,{status:204,headers})}
