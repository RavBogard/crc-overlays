import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalOrigin,mcpResource,publicOrigins} from '../lib/oauth-core.ts';

const names=['PUBLIC_BASE_URL','PUBLIC_ALTERNATE_ORIGINS'] as const;
function withEnv(values:Partial<Record<(typeof names)[number],string|undefined>>,run:()=>void){
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]])) as Record<(typeof names)[number],string|undefined>;
 try{
  for(const name of names){const value=values[name];if(value===undefined)delete process.env[name];else process.env[name]=value}
  run();
 }finally{
  for(const name of names){const value=saved[name];if(value===undefined)delete process.env[name];else process.env[name]=value}
 }
}
const PRIMARY='https://overlays.centralreform.org',VERCEL='https://crc-overlays.vercel.app';
// What `canonicalOrigin` answers when nothing at all is configured. It is CRC's primary custom
// domain, not the Vercel hostname, since the 2026-09-15 swap.
const FALLBACK=PRIMARY;

test('the deployment speaks as whichever of its configured origins the request arrived on',()=>{
 withEnv({PUBLIC_BASE_URL:PRIMARY,PUBLIC_ALTERNATE_ORIGINS:` ${VERCEL} ,`},()=>{
  assert.deepEqual(publicOrigins(),[PRIMARY,VERCEL]);
  assert.equal(canonicalOrigin(),PRIMARY,'no request: the primary');
  assert.equal(canonicalOrigin(new Request(`${VERCEL}/oauth/authorize`)),VERCEL);
  assert.equal(canonicalOrigin(new Request(`${PRIMARY}/api/mcp`)),PRIMARY);
  assert.equal(mcpResource(new Request(`${VERCEL}/api/mcp`)),`${VERCEL}/api/mcp`);
  // A Host header naming anything else never becomes the issuer.
  assert.equal(canonicalOrigin(new Request('https://evil.example/oauth/authorize')),PRIMARY);
  assert.equal(canonicalOrigin(new Request('http://localhost:5175/oauth/authorize')),PRIMARY);
 });
});

test('without alternates the primary answers every request; loopback echoes only when nothing is configured',()=>{
 withEnv({PUBLIC_BASE_URL:VERCEL,PUBLIC_ALTERNATE_ORIGINS:undefined},()=>{
  assert.deepEqual(publicOrigins(),[VERCEL]);
  assert.equal(canonicalOrigin(new Request(`${PRIMARY}/x`)),VERCEL);
 });
 withEnv({PUBLIC_BASE_URL:undefined,PUBLIC_ALTERNATE_ORIGINS:undefined},()=>{
  assert.deepEqual(publicOrigins(),[]);
  assert.equal(canonicalOrigin(new Request('http://localhost:5175/x')),'http://localhost:5175');
  assert.equal(canonicalOrigin(),FALLBACK);
 });
});

test('a malformed origin in either variable is refused, not ignored',()=>{
 withEnv({PUBLIC_BASE_URL:PRIMARY,PUBLIC_ALTERNATE_ORIGINS:'http://crc-overlays.vercel.app'},()=>{
  assert.throws(()=>publicOrigins(),/PUBLIC_ALTERNATE_ORIGINS must be an HTTPS origin/);
 });
 withEnv({PUBLIC_BASE_URL:PRIMARY,PUBLIC_ALTERNATE_ORIGINS:`${VERCEL}/path`},()=>{
  assert.throws(()=>canonicalOrigin(),/PUBLIC_ALTERNATE_ORIGINS must be an HTTPS origin/);
 });
 withEnv({PUBLIC_BASE_URL:'http://overlays.centralreform.org',PUBLIC_ALTERNATE_ORIGINS:undefined},()=>{
  assert.throws(()=>canonicalOrigin(),/PUBLIC_BASE_URL must be an HTTPS origin/);
 });
});
