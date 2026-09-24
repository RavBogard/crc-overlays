import assert from 'node:assert/strict';
import test from 'node:test';
import {authorizationMetadata,protectedResourceMetadata} from '../lib/oauth-http';

test('authorization discovery advertises refresh consent without broadening resource rights',()=>{
 const request=new Request('http://localhost:5175/.well-known/oauth-authorization-server');
 assert.deepEqual(authorizationMetadata(request).scopes_supported,['crc.authoring','crc.live','offline_access']);
 // The resource names both of its scopes; offline_access is a refresh request, not a resource right.
 assert.deepEqual(protectedResourceMetadata(request).scopes_supported,['crc.authoring','crc.live']);
});
