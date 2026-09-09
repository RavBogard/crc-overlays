import assert from 'node:assert/strict';
import test from 'node:test';
import {db} from '../lib/database';
import {AUTHORING_SCOPE,hashOpaque,pkceChallenge} from '../lib/oauth-core';
import {consumeAuthorizationRequest,createAuthorizationRequest,exchangeAuthorizationCode,exchangeRefreshToken,issueAuthorizationCode,registerClient,revokeToken,tokenVerifier} from '../lib/oauth-store';

const isolated=Boolean(process.env.DATABASE_URL&&process.env.PGOPTIONS?.includes('search_path=crc_authoring_'));
test('refresh revocation and reuse invalidate every access token in the family',{skip:!isolated},async()=>{
 const redirectUri='http://127.0.0.1:49152/callback',resource='http://localhost:5180/api/mcp',verifier='0123456789012345678901234567890123456789012';
 const clientId=await registerClient([redirectUri],'OAuth family integration test'),clientHash=hashOpaque(clientId);
 async function family(){const handle=await createAuthorizationRequest({clientId,redirectUri,codeChallenge:pkceChallenge(verifier),scope:AUTHORING_SCOPE,resource,state:null});const pending=await consumeAuthorizationRequest(handle);assert.ok(pending);const code=await issueAuthorizationCode(pending);return exchangeAuthorizationCode({code,clientId,redirectUri,verifier,resource})}
 try{
  const first=await family(),rotated=await exchangeRefreshToken({refreshToken:first.refreshToken,clientId,resource});await tokenVerifier.verifyAccessToken(rotated.token);await revokeToken(rotated.refreshToken,clientId);await assert.rejects(()=>tokenVerifier.verifyAccessToken(rotated.token));
  const second=await family(),secondRotated=await exchangeRefreshToken({refreshToken:second.refreshToken,clientId,resource});await tokenVerifier.verifyAccessToken(secondRotated.token);await assert.rejects(()=>exchangeRefreshToken({refreshToken:second.refreshToken,clientId,resource}),/invalid_grant/);await assert.rejects(()=>tokenVerifier.verifyAccessToken(secondRotated.token));
 }finally{await db.query('DELETE FROM oauth_tokens WHERE client_id_hash=$1',[clientHash]);await db.query('DELETE FROM oauth_refresh_tokens WHERE client_id_hash=$1',[clientHash]);await db.query('DELETE FROM oauth_codes WHERE client_id_hash=$1',[clientHash]);await db.query('DELETE FROM oauth_authorization_requests WHERE client_id_hash=$1',[clientHash]);await db.query('DELETE FROM oauth_clients WHERE client_id_hash=$1',[clientHash])}
});
