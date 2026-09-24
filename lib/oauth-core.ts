import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export const AUTHORING_SCOPE='crc.authoring';
export const LIVE_SCOPE='crc.live';
export const OFFLINE_ACCESS_SCOPE='offline_access';
// Canonical order: a stored scope string is always these, in this order, so every row written before
// crc.live existed ('crc.authoring', 'crc.authoring offline_access') is still its own normal form.
export const AUTHORIZATION_SCOPES=[AUTHORING_SCOPE,LIVE_SCOPE,OFFLINE_ACCESS_SCOPE] as const;
/** The scopes that reach the MCP resource; offline_access only asks for a refresh token. */
export const RESOURCE_SCOPES=[AUTHORING_SCOPE,LIVE_SCOPE] as const;
export type ResourceScope=typeof RESOURCE_SCOPES[number];
export const MAX_OAUTH_BODY=16_384;
export const AUTH_REQUEST_TTL_MS=10*60_000;
export const CODE_TTL_MS=5*60_000;
export const TOKEN_TTL_MS=60*60_000;
export const REFRESH_TOKEN_TTL_MS=30*24*60*60_000;

function httpsOrigin(value:string,name:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error(`${name} must be an HTTPS origin`);return url.origin}
/**
 * The https origins this deployment answers as itself: `PUBLIC_BASE_URL` first, then each entry of
 * `PUBLIC_ALTERNATE_ORIGINS` (comma-separated). A custom domain and the Vercel hostname can both be
 * live at once; the first entry is the one used where no request exists.
 */
export function publicOrigins(){
 const origins:string[]=[];
 if(process.env.PUBLIC_BASE_URL)origins.push(httpsOrigin(process.env.PUBLIC_BASE_URL,'PUBLIC_BASE_URL'));
 for(const raw of (process.env.PUBLIC_ALTERNATE_ORIGINS||'').split(',')){const value=raw.trim();if(value&&!origins.includes(httpsOrigin(value,'PUBLIC_ALTERNATE_ORIGINS')))origins.push(httpsOrigin(value,'PUBLIC_ALTERNATE_ORIGINS'))}
 return origins;
}
/**
 * The origin this deployment speaks as for `request`: the request's own origin when it is one of the
 * configured public origins (so Google sign-in, MCP consent and the OAuth issuer all follow the host
 * the person actually arrived on), otherwise the primary. The Host header is never trusted on its
 * own — an unknown host resolves to the primary, exactly as before.
 */
export function canonicalOrigin(request?:Request){
 const origins=publicOrigins();
 if(request){const url=new URL(request.url);if(origins.includes(url.origin))return url.origin;if(!origins.length&&url.protocol==='http:'&&isLoopback(url.hostname))return url.origin}
 return origins[0]??'https://overlays.centralreform.org';
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
 // Any subset holding at least one resource scope; offline_access alone grants nothing to ask for.
 if(new Set(scopes).size!==scopes.length||scopes.some(scope=>!(AUTHORIZATION_SCOPES as readonly string[]).includes(scope))||!scopes.some(scope=>(RESOURCE_SCOPES as readonly string[]).includes(scope)))throw Error('invalid_scope');
 return AUTHORIZATION_SCOPES.filter(scope=>scopes.includes(scope)).join(' ');
}
export function exactResource(value:string|null,request?:Request){const expected=mcpResource(request);if(value&&value!==expected)throw Error('invalid_target');return expected}
export function safeClientMetadata(value:unknown){
 if(!value||typeof value!=='object')throw Error('invalid_client_metadata');
 const body=value as Record<string,unknown>;const redirects=body.redirect_uris;
 if(!Array.isArray(redirects)||redirects.length<1||redirects.length>10)throw Error('invalid_redirect_uri');
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
/** `formAction` is the CSP form-action source list; a page whose form ends in a redirect elsewhere names that destination too. */
export function securityHeaders(extra?:HeadersInit,formAction="'self'"){return new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,...extra})}
export async function readLimitedBody(request:Request,limit=MAX_OAUTH_BODY){
 const declared=Number(request.headers.get('content-length')||0);if(declared>limit)throw Error('request_too_large');
 if(!request.body)return '';
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if(value){size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('request_too_large')}chunks.push(value)}}}finally{reader.releaseLock()}
 const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder().decode(output);
}
