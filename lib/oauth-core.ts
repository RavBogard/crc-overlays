import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export const AUTHORING_SCOPE='crc.authoring';
export const MAX_OAUTH_BODY=16_384;
export const AUTH_REQUEST_TTL_MS=10*60_000;
export const CODE_TTL_MS=5*60_000;
export const TOKEN_TTL_MS=60*60_000;
export const REFRESH_TOKEN_TTL_MS=30*24*60*60_000;

export function canonicalOrigin(request?:Request){
 const configured=process.env.PUBLIC_BASE_URL;
 if(configured){const url=new URL(configured);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_BASE_URL must be an HTTPS origin');return url.origin}
 if(request){const url=new URL(request.url);if(url.protocol==='http:'&&isLoopback(url.hostname))return url.origin}
 return 'https://crc-overlays.vercel.app';
}
export function mcpResource(request?:Request){return `${canonicalOrigin(request)}/api/mcp`}
export function hashOpaque(value:string){return createHash('sha256').update(value).digest('hex')}
export function opaque(prefix:string){return `${prefix}${randomBytes(32).toString('base64url')}`}
export function isLoopback(hostname:string){return hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]'||hostname==='::1'}
export function normalizeRedirect(value:unknown){
 if(typeof value!=='string'||value.length>2048)throw Error('invalid_redirect_uri');
 const url=new URL(value);if(url.username||url.password||url.hash)throw Error('invalid_redirect_uri');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&isLoopback(url.hostname)))throw Error('invalid_redirect_uri');
 return url.toString();
}
export function validPkceVerifier(value:string){return /^[A-Za-z0-9._~-]{43,128}$/.test(value)}
export function pkceChallenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url')}
export function normalizeScope(value:string|null){
 const scopes=(value||AUTHORING_SCOPE).split(/\s+/).filter(Boolean);
 if(scopes.length!==1||scopes[0]!==AUTHORING_SCOPE)throw Error('invalid_scope');
 return AUTHORING_SCOPE;
}
export function exactResource(value:string|null,request?:Request){const expected=mcpResource(request);if(value&&value!==expected)throw Error('invalid_target');return expected}
export function safeClientMetadata(value:unknown){
 if(!value||typeof value!=='object')throw Error('invalid_client_metadata');
 const body=value as Record<string,unknown>;const redirects=body.redirect_uris;
 if(!Array.isArray(redirects)||redirects.length<1||redirects.length>10)throw Error('invalid_redirect_uris');
 if(body.token_endpoint_auth_method!==undefined&&body.token_endpoint_auth_method!=='none')throw Error('invalid_client_metadata');
 const grantTypes=body.grant_types??['authorization_code','refresh_token'];const responseTypes=body.response_types??['code'];
 if(!Array.isArray(grantTypes)||!grantTypes.includes('authorization_code')||grantTypes.some(value=>value!=='authorization_code'&&value!=='refresh_token')||!Array.isArray(responseTypes)||responseTypes.length!==1||responseTypes[0]!=='code')throw Error('invalid_client_metadata');
 const clientName=typeof body.client_name==='string'?body.client_name.slice(0,120):'MCP client';
 return {redirectUris:[...new Set(redirects.map(normalizeRedirect))],clientName};
}
export function secretMatches(candidate:string,expected:string|undefined){
 if(!expected)return false;const a=Buffer.from(candidate);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)
}
export function requestIdentity(request:Request){return (request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim().slice(0,128)}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin}
export function appendOAuthRedirect(redirectUri:string,values:Record<string,string|undefined>){const url=new URL(redirectUri);for(const [key,value] of Object.entries(values))if(value!==undefined)url.searchParams.set(key,value);return url.toString()}
export function securityHeaders(extra?:HeadersInit){return new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",...extra})}
export async function readLimitedBody(request:Request,limit=MAX_OAUTH_BODY){
 const declared=Number(request.headers.get('content-length')||0);if(declared>limit)throw Error('request_too_large');
 if(!request.body)return '';
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('request_too_large')}chunks.push(value)}}}finally{reader.releaseLock()}
 const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(output);
}
