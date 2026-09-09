import assert from 'node:assert/strict';
import test from 'node:test';
import {authorizationMetadata,protectedResourceMetadata} from '../lib/oauth-http';

test('authorization discovery advertises refresh consent without broadening resource rights',()=>{
 const request=new Request('http://localhost:5175/.well-known/oauth-authorization-server');
 assert.deepEqual(authorizationMetadata(request).scopes_supported,['crc.authoring','offline_access']);
 assert.deepEqual(protectedResourceMetadata(request).scopes_supported,['crc.authoring']);
});
