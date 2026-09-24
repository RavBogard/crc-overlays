import assert from 'node:assert/strict';
import test from 'node:test';
import {AUTHORIZATION_SCOPES,appendOAuthRedirect,canonicalOrigin,exactResource,normalizeRedirect,normalizeScope,pkceChallenge,readLimitedBody,safeClientMetadata,secretMatches} from '../lib/oauth-core';

test('redirect URIs require HTTPS except loopback and reject fragments or credentials',()=>{
 assert.equal(normalizeRedirect('https://chat.example/callback?fixed=1'),'https://chat.example/callback?fixed=1');
 assert.equal(normalizeRedirect('http://127.0.0.1:43123/callback'),'http://127.0.0.1:43123/callback');
 for(const value of ['http://chat.example/callback','https://user:pass@chat.example/callback','https://chat.example/callback#fragment'])assert.throws(()=>normalizeRedirect(value),/invalid_redirect_uri/);
});

test('client metadata permits public auth-code clients with rotating refresh tokens only',()=>{
 const parsed=safeClientMetadata({client_name:'Claude',redirect_uris:['https://claude.example/callback'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'});
 assert.deepEqual(parsed.redirectUris,['https://claude.example/callback']);
 assert.throws(()=>safeClientMetadata({redirect_uris:['https://ok.example/cb'],grant_types:['client_credentials']}),/invalid_client_metadata/);
});

test('scope and audience are fixed to authoring MCP resource',()=>{
 const request=new Request('http://localhost:5175/oauth/authorize');
 assert.equal(normalizeScope('crc.authoring'),'crc.authoring');
 assert.equal(normalizeScope('offline_access crc.authoring'),'crc.authoring offline_access');
 assert.throws(()=>normalizeScope('offline_access'),/invalid_scope/);
 assert.throws(()=>normalizeScope('crc.authoring offline_access offline_access'),/invalid_scope/);
 assert.throws(()=>normalizeScope('crc.authoring live.control'),/invalid_scope/);
 assert.equal(exactResource(null,request),'http://localhost:5175/api/mcp');
 assert.throws(()=>exactResource('https://other.example/api/mcp',request),/invalid_target/);
});

test('subset scopes normalize to one canonical order, and every stored row is its own normal form',()=>{
 // What oauth_tokens / oauth_refresh_tokens hold today: tokenVerifier requires normalizeScope(row)===row.
 for(const stored of ['crc.authoring','crc.authoring offline_access'])assert.equal(normalizeScope(stored),stored);
 assert.equal(normalizeScope(null),'crc.authoring','a client that names no scope still gets authoring');
 assert.equal(normalizeScope('crc.live'),'crc.live');
 assert.equal(normalizeScope('offline_access crc.live'),'crc.live offline_access');
 assert.equal(normalizeScope('crc.live offline_access crc.authoring'),'crc.authoring crc.live offline_access');
 for(const value of ['crc.live crc.live','offline_access','crc.live admin','crc.control'])assert.throws(()=>normalizeScope(value),/invalid_scope/);
});

test('authorization scopes advertise live control and optional refresh consent',()=>assert.deepEqual([...AUTHORIZATION_SCOPES],['crc.authoring','crc.live','offline_access']));

test('PKCE S256 and state redirect preserve an existing callback query',()=>{
 assert.equal(pkceChallenge('0123456789012345678901234567890123456789012'),'_RpfHqw8pAZIomzVUE7sjRmHSM543WVdC4o-Kc4_3C0');
 const redirected=new URL(appendOAuthRedirect('https://client.example/cb?fixed=1',{code:'secret-code',state:'opaque-state'}));
 assert.equal(redirected.searchParams.get('fixed'),'1');assert.equal(redirected.searchParams.get('code'),'secret-code');assert.equal(redirected.searchParams.get('state'),'opaque-state');
});

test('bootstrap secret comparison and canonical origin do not accept unsafe variants',()=>{
 assert.equal(secretMatches('right','right'),true);assert.equal(secretMatches('wrong','right'),false);assert.equal(secretMatches('right',undefined),false);
 const previous=process.env.PUBLIC_BASE_URL;process.env.PUBLIC_BASE_URL='https://crc.example/path';assert.throws(()=>canonicalOrigin(),/HTTPS origin/);if(previous===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=previous;
});

test('streamed request bodies enforce the byte bound without Content-Length',async()=>{
 const request=new Request('https://crc.example/oauth/token',{method:'POST',body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('1234'));controller.enqueue(new TextEncoder().encode('5678'));controller.close()}}),duplex:'half'} as RequestInit&{duplex:'half'});
 await assert.rejects(()=>readLimitedBody(request,7),/request_too_large/);
});

