// Paired rehearsal (docs/REHEARSAL-MODE.md): argument parsing, the two child environments,
// and key distinctness. Nothing here spawns a process or opens a port — booting the pair is
// what `npm run rehearsal -- --pair` and `npm run rehearsal:check -- --pair` do.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 DEFAULT_REHEARSAL_PORT,
 DEFAULT_REHEARSAL_RELAY_PORT,
 DEFAULT_REHEARSAL_TBI_PORT,
 DEFAULT_REHEARSAL_TBI_RELAY_PORT,
 FORBIDDEN_ENV,
 TBI_WORKSPACE_ID,
 childEnv,
 distinctKeys,
 parseArgs,
 sharedLibraryUrlFor,
} from '../scripts/rehearsal.mjs';

const INHERITED=['PATH','SYSTEMROOT','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT','NODE_PATH'];
const ownKeys=(env:Record<string,string>)=>Object.keys(env).filter(name=>!INHERITED.includes(name)).sort();

test('rehearsal arguments default to the documented ports and opt into the pair',()=>{
 assert.deepEqual(parseArgs([]),{port:DEFAULT_REHEARSAL_PORT,relayPort:DEFAULT_REHEARSAL_RELAY_PORT,tbiPort:DEFAULT_REHEARSAL_TBI_PORT,tbiRelayPort:DEFAULT_REHEARSAL_TBI_RELAY_PORT,pair:false,bookFaces:false,google:false});
 assert.deepEqual(parseArgs(['--pair']).pair,true);
 assert.deepEqual(parseArgs(['--pair','--port','5185','--relay-port','8798','--tbi-port','5186','--tbi-relay-port','8799']),{port:5185,relayPort:8798,tbiPort:5186,tbiRelayPort:8799,pair:true,bookFaces:false,google:false});
 assert.deepEqual(parseArgs(['--tbi-port=5200','--tbi-relay-port=8900']),{port:DEFAULT_REHEARSAL_PORT,relayPort:DEFAULT_REHEARSAL_RELAY_PORT,tbiPort:5200,tbiRelayPort:8900,pair:false,bookFaces:false,google:false});
 assert.equal(parseArgs(['--pair','--book-faces']).bookFaces,true);
 assert.throws(()=>parseArgs(['--tbi']),/unknown argument --tbi/);
});

test('the TBI child is the same rehearsal under a second workspace identity',()=>{
 const sharedKey='s'.repeat(43);
 const env=childEnv({relayPort:8799,relaySecret:'relay-secret',controlKey:'control-key',outputKey:'output-key',workspaceId:TBI_WORKSPACE_ID,sharedLibraryUrl:sharedLibraryUrlFor(5185),sharedLibraryImportKey:sharedKey,standaloneConfig:'{"distDir":".next/rehearsal/tbi/dev"}'});
 assert.equal(env.WORKSPACE_ID,TBI_WORKSPACE_ID);
 assert.equal(env.CRC_SHARED_LIBRARY_URL,'http://127.0.0.1:5185/api/shared-library');
 assert.equal(env.SHARED_LIBRARY_IMPORT_KEY,sharedKey);
 assert.equal(env.SHARED_LIBRARY_EXPORT_KEY,undefined);
 assert.equal(env.CRC_AUTHORING_REHEARSAL,'1');
 assert.equal(env.NODE_ENV,'development');
 assert.equal(env.RELAY_URL,'memory');
 assert.equal(env.CRC_REHEARSAL_RELAY_PORT,'8799');
 assert.equal(env.__NEXT_PRIVATE_STANDALONE_CONFIG,'{"distDir":".next/rehearsal/tbi/dev"}');
});

test('the CRC child publishes the shared library and never imports one',()=>{
 const sharedKey='s'.repeat(43);
 const env=childEnv({relayPort:8798,relaySecret:'relay-secret',controlKey:'control-key',outputKey:'output-key',sharedLibraryExportKey:sharedKey});
 assert.equal(env.SHARED_LIBRARY_EXPORT_KEY,sharedKey);
 assert.equal(env.WORKSPACE_ID,undefined);
 assert.equal(env.CRC_SHARED_LIBRARY_URL,undefined);
 assert.equal(env.SHARED_LIBRARY_IMPORT_KEY,undefined);
});

test('neither child inherits a credential, and both pin the two file-injectable ones empty',()=>{
 const saved=process.env.CRC_PAIR_TEST_SECRET;
 process.env.CRC_PAIR_TEST_SECRET='never-forwarded';
 try{
  for(const extra of [{sharedLibraryExportKey:'e'.repeat(43)},{workspaceId:TBI_WORKSPACE_ID,sharedLibraryUrl:sharedLibraryUrlFor(5185),sharedLibraryImportKey:'i'.repeat(43)}]){
   const env=childEnv({relayPort:8798,relaySecret:'relay-secret',controlKey:'control-key',outputKey:'output-key',...extra});
   assert.equal(env.CRC_PAIR_TEST_SECRET,undefined);
   assert.equal(env.DATABASE_URL,'');
   assert.equal(env.ACCESS_BOOTSTRAP_KEY,'');
   assert.equal(env.VERCEL,undefined);
   // The allowlist stays an allowlist: only inherited names and the ones written here.
   for(const name of ownKeys(env))assert.ok(name.startsWith('CRC_')||name.startsWith('SHARED_LIBRARY_')||['NODE_ENV','RELAY_URL','RELAY_SECRET','CONTROL_KEY','OUTPUT_KEY','NEXT_TELEMETRY_DISABLED','DATABASE_URL','ACCESS_BOOTSTRAP_KEY','WORKSPACE_ID','WORKSPACE_BOOK_FACES','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','__NEXT_PRIVATE_STANDALONE_CONFIG'].includes(name),`unexpected child variable ${name}`);
   // Every forbidden name is either absent or the deliberate empty string.
   for(const name of FORBIDDEN_ENV)assert.ok(env[name]===undefined||env[name]===''||['RELAY_SECRET','CONTROL_KEY','OUTPUT_KEY'].includes(name),`${name} leaked into the child`);
  }
 }finally{
  if(saved===undefined)delete process.env.CRC_PAIR_TEST_SECRET;else process.env.CRC_PAIR_TEST_SECRET=saved;
 }
});

test('a pair draws distinct keys, so the shared library key is never a control or output key',()=>{
 const keys=distinctKeys(7);
 assert.equal(keys.length,7);
 assert.equal(new Set(keys).size,7);
 for(const value of keys){
  assert.ok(value.length>=32,`key is only ${value.length} characters`);
  assert.match(value,/^[A-Za-z0-9_-]+$/);
 }
 const [shared,...instances]=keys;
 for(const value of instances)assert.notEqual(value,shared);
});

test("the paired TBI child reads CRC's library over loopback with an explicit port",()=>{
 assert.equal(sharedLibraryUrlFor(DEFAULT_REHEARSAL_PORT),'http://127.0.0.1:5175/api/shared-library');
 assert.equal(sharedLibraryUrlFor(5185),'http://127.0.0.1:5185/api/shared-library');
});
