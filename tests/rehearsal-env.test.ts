// The `--google` rehearsal passthrough (docs/REHEARSAL-MODE.md): which Google variables reach
// a `next dev` child, and what happens when the flag is given without them. Nothing here
// spawns a process or opens a port.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GOOGLE_ENV,childEnv,missingGoogleCredentials,parseArgs} from '../scripts/rehearsal.mjs';

const CHILD={relayPort:8788,relaySecret:'relay-secret',controlKey:'control-key',outputKey:'output-key'};

/** Sets the named variables for one body and restores whatever the shell really had. */
function withEnv(values:Record<string,string|undefined>,body:()=>void){
 const saved=Object.fromEntries(Object.keys(values).map(name=>[name,process.env[name]]));
 try{
  for(const [name,value] of Object.entries(values))if(value===undefined)delete process.env[name];else process.env[name]=value;
  body();
 }finally{
  for(const [name,value] of Object.entries(saved))if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
}

test('--google is an opt-in flag, off by default',()=>{
 assert.equal(parseArgs([]).google,false);
 assert.equal(parseArgs(['--google']).google,true);
 assert.equal(parseArgs(['--pair','--google']).google,true);
});

test('without the flag no shell value reaches a child, however the shell is set',()=>{
 withEnv({GOOGLE_OAUTH_CLIENT_ID:'shell-client-id',GOOGLE_OAUTH_CLIENT_SECRET:'shell-client-secret'},()=>{
  for(const extra of [{},{workspaceId:'temple-bnai-israel-kalamazoo'}]){
   const env=childEnv({...CHILD,...extra});
   assert.equal(env.GOOGLE_OAUTH_CLIENT_ID,'');
   assert.equal(env.GOOGLE_OAUTH_CLIENT_SECRET,'');
  }
 });
});

test('with the flag both variables are copied into every child, CRC and TBI alike',()=>{
 withEnv({GOOGLE_OAUTH_CLIENT_ID:'shell-client-id',GOOGLE_OAUTH_CLIENT_SECRET:'shell-client-secret'},()=>{
  for(const extra of [{},{workspaceId:'temple-bnai-israel-kalamazoo'}]){
   const env=childEnv({...CHILD,...extra,google:true});
   assert.equal(env.GOOGLE_OAUTH_CLIENT_ID,'shell-client-id');
   assert.equal(env.GOOGLE_OAUTH_CLIENT_SECRET,'shell-client-secret');
  }
 });
});

test('the flag forwards only the two Google variables; everything else is still stripped',()=>{
 withEnv({GOOGLE_OAUTH_CLIENT_ID:'shell-client-id',GOOGLE_OAUTH_CLIENT_SECRET:'shell-client-secret',DATABASE_URL:'postgres://never',ACCESS_BOOTSTRAP_KEY:'never',CRC_ENV_TEST_SECRET:'never-forwarded'},()=>{
  const env=childEnv({...CHILD,google:true});
  assert.equal(env.DATABASE_URL,'');
  assert.equal(env.ACCESS_BOOTSTRAP_KEY,'');
  assert.equal(env.CRC_ENV_TEST_SECRET,undefined);
 });
});

test('a missing or empty variable is reported by name, never by value',()=>{
 withEnv({GOOGLE_OAUTH_CLIENT_ID:'shell-client-id',GOOGLE_OAUTH_CLIENT_SECRET:undefined},()=>{
  assert.deepEqual(missingGoogleCredentials(),['GOOGLE_OAUTH_CLIENT_SECRET']);
 });
 withEnv({GOOGLE_OAUTH_CLIENT_ID:'',GOOGLE_OAUTH_CLIENT_SECRET:''},()=>{
  assert.deepEqual(missingGoogleCredentials(),GOOGLE_ENV);
 });
 withEnv({GOOGLE_OAUTH_CLIENT_ID:'shell-client-id',GOOGLE_OAUTH_CLIENT_SECRET:'shell-client-secret'},()=>{
  assert.deepEqual(missingGoogleCredentials(),[]);
 });
});
