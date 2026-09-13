import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 REHEARSAL_RELAY,
 liveRelayConfigured,
 rehearsalMode,
 rehearsalRelayOrigin,
} from '../lib/rehearsal.ts';
import {relayConnection,relayOrigin} from '../lib/relay.ts';
import {
 MemoryAccessStore,
 REHEARSAL_OWNER,
 REHEARSAL_OWNER_PASSWORD,
 accessToken,
 hashPassword,
 tokenHash,
 verifyPassword,
} from '../lib/access.ts';

const dev={CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development'} as const;

async function withEnv<T>(values:Record<string,string|undefined>,run:()=>Promise<T>|T){
 const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
 for(const [key,value] of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value}
 try{return await run()}finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
}

test('rehearsal mode is local development only, and tolerates only the in-process relay',()=>{
 assert.equal(rehearsalMode({...dev}),true);
 assert.equal(rehearsalMode({...dev,RELAY_URL:REHEARSAL_RELAY}),true);
 assert.equal(rehearsalMode({...dev,NODE_ENV:'production'}),false);
 assert.equal(rehearsalMode({...dev,VERCEL:'1'}),false);
 assert.equal(rehearsalMode({...dev,RELAY_URL:'https://relay.example'}),false);
 assert.equal(rehearsalMode({NODE_ENV:'development'}),false);
 assert.equal(rehearsalMode({CRC_AUTHORING_REHEARSAL:'0',NODE_ENV:'development'}),false);
});

test('only a real relay URL counts as a live relay',()=>{
 assert.equal(liveRelayConfigured({}),false);
 assert.equal(liveRelayConfigured({RELAY_URL:''}),false);
 assert.equal(liveRelayConfigured({RELAY_URL:REHEARSAL_RELAY}),false);
 assert.equal(liveRelayConfigured({RELAY_URL:'https://relay.example'}),true);
 assert.equal(liveRelayConfigured({RELAY_URL:'http://127.0.0.1:8788'}),true);
});

test('the rehearsal relay origin is loopback on the configured port',()=>{
 assert.equal(rehearsalRelayOrigin({}),'http://127.0.0.1:8788');
 assert.equal(rehearsalRelayOrigin({CRC_REHEARSAL_RELAY_PORT:'9001'}),'http://127.0.0.1:9001');
 assert.equal(rehearsalRelayOrigin({CRC_REHEARSAL_RELAY_PORT:'evil.example'}),'http://127.0.0.1:8788');
});

const rehearsalProcess={CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',VERCEL:undefined,RELAY_URL:REHEARSAL_RELAY,RELAY_SECRET:'rehearsal-secret'};

test('RELAY_URL=memory routes every relay call to the in-process stub',async()=>{
 await withEnv({...rehearsalProcess,CRC_REHEARSAL_RELAY_PORT:undefined},()=>{
  assert.equal(relayOrigin(),'http://127.0.0.1:8788');
  const connection=relayConnection('control');
  assert.equal(connection.url,'ws://127.0.0.1:8788/connect');
  assert.match(connection.ticket,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(connection.heartbeatMs,10_000);
 });
 await withEnv({...rehearsalProcess,CRC_REHEARSAL_RELAY_PORT:'9100'},()=>{
  assert.equal(relayOrigin(),'http://127.0.0.1:9100');
  assert.equal(relayConnection('output').url,'ws://127.0.0.1:9100/connect');
 });
});

test('RELAY_URL=memory outside rehearsal fails loudly instead of pointing clients at loopback',async()=>{
 for(const unsafe of [{NODE_ENV:'production'},{VERCEL:'1'},{CRC_AUTHORING_REHEARSAL:undefined}])
  await withEnv({...rehearsalProcess,...unsafe},()=>{
   assert.throws(()=>relayOrigin(),/Invalid live relay origin/);
   assert.throws(()=>relayConnection('output'),/Invalid live relay origin/);
  });
});

test('the rehearsal owner signs in with its documented local password',async()=>{
 const store=new MemoryAccessStore();
 const credential=await store.credentialForEmail(REHEARSAL_OWNER.email);
 assert.ok(credential);
 assert.equal(credential.id,REHEARSAL_OWNER.id);
 assert.equal(credential.role,'owner');
 assert.equal(credential.enabled,true);
 assert.equal(await verifyPassword(REHEARSAL_OWNER_PASSWORD,credential.passwordHash),true);
 assert.equal(await verifyPassword('not-the-local-password',credential.passwordHash),false);
 assert.equal(await store.credentialForEmail('nobody@localhost'),null);
});

test('a rehearsal invitation redeems once and opens a working session',async()=>{
 const store=new MemoryAccessStore();
 const now=Date.now(),invite=accessToken(),session=accessToken();
 const invited=await store.invite('editor@localhost','Rehearsal Editor','editor',tokenHash(invite),now+600_000);
 assert.equal(invited.enabled,false);
 const redeemed=await store.redeem(tokenHash(invite),now,tokenHash(session),now+60_000);
 assert.equal(redeemed?.name,'Rehearsal Editor');
 assert.equal(redeemed?.role,'editor');
 assert.equal(redeemed?.enabled,true);
 const member=await store.memberForSession(tokenHash(session),now);
 assert.equal(member?.id,redeemed?.id);
 assert.equal(member?.authMethod,'invite');
 assert.equal(await store.redeem(tokenHash(invite),now,tokenHash(accessToken()),now+60_000),null);
 await store.deleteSession(tokenHash(session));
 assert.equal(await store.memberForSession(tokenHash(session),now),null);
});

test('rehearsal keeps at least one enabled administrator and refuses a second bootstrap',async()=>{
 const store=new MemoryAccessStore();
 await assert.rejects(store.disable(REHEARSAL_OWNER.id),/Keep at least one enabled administrator/);
 assert.equal(await store.bootstrap('someone@localhost','Someone',await hashPassword('another-local-password'),tokenHash(accessToken()),Date.now(),Date.now()+60_000),null);
 const second=await store.invite('owner2@localhost','Second Owner','owner',tokenHash('second-invite'),Date.now()+600_000);
 await store.redeem(tokenHash('second-invite'),Date.now(),tokenHash(accessToken()),Date.now()+60_000);
 await store.disable(REHEARSAL_OWNER.id);
 assert.deepEqual((await store.list()).filter(m=>m.enabled).map(m=>m.id),[second.id]);
});

test('rehearsal sign-in attempts are limited to ten a minute',async()=>{
 const store=new MemoryAccessStore();
 const now=Date.now();
 for(let attempt=1;attempt<=10;attempt++)assert.equal(await store.allowAttempt('editor@localhost',now),true);
 assert.equal(await store.allowAttempt('editor@localhost',now),false);
 assert.equal(await store.allowAttempt('someone-else@localhost',now),true);
 assert.equal(await store.allowAttempt('editor@localhost',now+61_000),true);
});
