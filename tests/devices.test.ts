import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GET as devicesGET,POST as devicesPOST} from '../app/api/devices/route.ts';
import {POST as redeemPOST} from '../app/api/pairing/redeem/route.ts';
import {GET as outputUrlGET} from '../app/api/output-url/route.ts';
import {GET as realtimeGET} from '../app/api/realtime/route.ts';
import {authorizeRequest,accessStore,type AccessSessionMember,type AccessStore} from '../lib/access.ts';
import {
 DEVICE_TOKEN,
 DeviceLimitError,
 LAST_SEEN_INTERVAL_MS,
 MAX_PAIRING_ATTEMPTS,
 MAX_UNREDEEMED_CODES,
 MemoryDeviceStore,
 PAIRING_CODE,
 PAIRING_CODE_TTL_MS,
 VERIFIED_CACHE_MS,
 VERIFIED_OUTAGE_MS,
 clearVerifiedDeviceCache,
 deviceName,
 deviceStore,
 newPairingCode,
 pairingCodeHash,
 parseDeviceToken,
 verifyDeviceToken,
 verifyDeviceTokenFresh,
 type DeviceStore,
} from '../lib/devices.ts';

// canonicalOrigin falls back to the production origin; pin it so the URL assertions are about this code.
process.env.PUBLIC_BASE_URL='https://graphics.test';

const owner:AccessSessionMember={id:'owner-1',email:'owner@example.test',name:'Owner',role:'owner',enabled:true,authMethod:'password',authenticatedAt:0};
const editor:AccessSessionMember={...owner,id:'editor-1',email:'editor@example.test',name:'Editor',role:'editor'};
const sessionToken='a'.repeat(43);

/** Delegating overrides, so the memory store's methods keep their own `this`. */
const delegate=(store:DeviceStore):DeviceStore=>({
 createPairingCode:input=>store.createPairingCode(input),
 redeemPairingCode:(hash,now)=>store.redeemPairingCode(hash,now),
 issue:input=>store.issue(input),
 verify:(token,now)=>store.verify(token,now),
 list:()=>store.list(),
 revoke:(id,now)=>store.revoke(id,now),
});

async function withDeviceStore<T>(overrides:Partial<DeviceStore>,run:()=>Promise<T>){
 const saved:DeviceStore={createPairingCode:deviceStore.createPairingCode,redeemPairingCode:deviceStore.redeemPairingCode,issue:deviceStore.issue,verify:deviceStore.verify,list:deviceStore.list,revoke:deviceStore.revoke};
 Object.assign(deviceStore,overrides);
 clearVerifiedDeviceCache();
 try{return await run()}finally{Object.assign(deviceStore,saved);clearVerifiedDeviceCache()}
}

async function withAccessMethods<T>(overrides:Partial<AccessStore>,run:()=>Promise<T>){
 const saved:Partial<AccessStore>={};
 for(const key of Object.keys(overrides) as (keyof AccessStore)[])saved[key]=accessStore[key] as never;
 Object.assign(accessStore,overrides);
 try{return await run()}finally{Object.assign(accessStore,saved)}
}

const signedIn=(member:AccessSessionMember)=>({memberForSession:async()=>member});
const jsonRequest=(url:string,body:unknown,headers:Record<string,string>={})=>new Request(url,{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const deviceRequest=(body:unknown,headers:Record<string,string>={})=>jsonRequest('https://graphics.test/api/devices',body,headers);
const cookie=(token=sessionToken)=>({cookie:`crc_access=${token}`});

test('a device token has the D2 shape and only its secret digest is ever compared',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:1_000});
 assert.match(token,DEVICE_TOKEN,'cd_<id:12>.<secret:43>');
 const parsed=parseDeviceToken(token);
 assert.equal(parsed?.id,credential.id);
 assert.equal(parsed?.secret.length,43);
 assert.equal(credential.kind,'output');
 assert.equal(credential.createdBy,owner.id);
 assert.equal(credential.lastSeenAt,null);
 assert.equal(credential.revokedAt,null);
 assert.equal((await store.verify(token,2_000))?.id,credential.id);
 assert.equal(await store.verify(`cd_${parsed?.id}.${'b'.repeat(43)}`,2_000),null,'a wrong secret for a real id is refused');
 assert.equal(await store.verify(`cd_${'z'.repeat(12)}.${'b'.repeat(43)}`,2_000),null,'an unknown id is refused');
 assert.equal(await store.verify('not-a-device-token',2_000),null);
 assert.equal(await store.verify(`cd_${credential.id}.${parsed?.secret}extra`,2_000),null);
});

test('a pairing code is six digits and is redeemed exactly once under concurrent attempts',async()=>{
 const store=new MemoryDeviceStore();
 const code=newPairingCode();
 assert.match(code,PAIRING_CODE);
 const hash=pairingCodeHash(code);
 await store.createPairingCode({codeHash:hash,kind:'companion',name:'Booth Companion',memberId:editor.id,now:0,expiresAt:PAIRING_CODE_TTL_MS});
 const results=await Promise.all([1,2,3,4,5].map(()=>store.redeemPairingCode(hash,1_000)));
 const winners=results.filter(result=>result!==null);
 assert.equal(winners.length,1,'exactly one attempt receives a credential');
 assert.equal(winners[0]?.credential.kind,'companion');
 assert.equal(winners[0]?.credential.name,'Booth Companion');
 assert.equal(store.credentials.size,1,'no second credential is created');
 assert.equal(store.codes.get(hash)?.credentialId,winners[0]?.credential.id);
 assert.equal(store.codes.get(hash)?.redeemedAt,1_000);
 assert.equal(await store.redeemPairingCode(hash,1_100),null,'a reused code is refused');
});

test('a pairing code expires after ten minutes and an unknown code is refused',async()=>{
 const store=new MemoryDeviceStore();
 const hash=pairingCodeHash('123456');
 await store.createPairingCode({codeHash:hash,kind:'companion',name:'Booth Companion',memberId:editor.id,now:0,expiresAt:PAIRING_CODE_TTL_MS});
 assert.equal(await store.redeemPairingCode(pairingCodeHash('654321'),1_000),null,'a wrong code matches nothing');
 assert.equal(await store.redeemPairingCode(hash,PAIRING_CODE_TTL_MS),null,'expiry is exclusive at the deadline');
 assert.equal(store.credentials.size,0);
 const fresh=pairingCodeHash('222222');
 await store.createPairingCode({codeHash:fresh,kind:'companion',name:'Booth Companion',memberId:editor.id,now:0,expiresAt:PAIRING_CODE_TTL_MS});
 assert.notEqual(await store.redeemPairingCode(fresh,PAIRING_CODE_TTL_MS-1),null,'a code one millisecond before the deadline still works');
});

test('a pairing code dies after five attempts',async()=>{
 const store=new MemoryDeviceStore();
 const hash=pairingCodeHash('345678');
 await store.createPairingCode({codeHash:hash,kind:'companion',name:'Booth Companion',memberId:editor.id,now:0,expiresAt:PAIRING_CODE_TTL_MS});
 // Attempts are burned by the failures a live code can actually produce.
 for(let attempt=0;attempt<MAX_PAIRING_ATTEMPTS;attempt++)assert.equal(await store.redeemPairingCode(hash,PAIRING_CODE_TTL_MS+1),null,'expired');
 assert.equal(store.codes.get(hash)?.attempts,MAX_PAIRING_ATTEMPTS);
 // Even a code that is otherwise valid is dead once the cap is reached.
 const hammered=pairingCodeHash('456789');
 await store.createPairingCode({codeHash:hammered,kind:'companion',name:'Booth Companion',memberId:editor.id,now:0,expiresAt:PAIRING_CODE_TTL_MS});
 store.codes.get(hammered)!.attempts=MAX_PAIRING_ATTEMPTS;
 assert.equal(await store.redeemPairingCode(hammered,1_000),null,'the attempt cap outranks a valid code');
 assert.equal(store.credentials.size,0);
});

test('a workspace holds at most ten unredeemed pairing codes',async()=>{
 const store=new MemoryDeviceStore();
 const make=(index:number,now:number)=>store.createPairingCode({codeHash:pairingCodeHash(String(100000+index)),kind:'companion',name:`Companion ${index}`,memberId:editor.id,now,expiresAt:now+PAIRING_CODE_TTL_MS});
 for(let index=0;index<MAX_UNREDEEMED_CODES;index++)await make(index,0);
 await assert.rejects(make(MAX_UNREDEEMED_CODES,0),DeviceLimitError);
 // Expired codes no longer count, so the administrator is not locked out forever.
 await make(MAX_UNREDEEMED_CODES,PAIRING_CODE_TTL_MS+1);
 assert.equal(store.codes.size,MAX_UNREDEEMED_CODES+1);
 // Nor do redeemed ones.
 const store2=new MemoryDeviceStore();
 for(let index=0;index<MAX_UNREDEEMED_CODES;index++)await store2.createPairingCode({codeHash:pairingCodeHash(String(200000+index)),kind:'companion',name:'Companion',memberId:editor.id,now:0,expiresAt:PAIRING_CODE_TTL_MS});
 await store2.redeemPairingCode(pairingCodeHash('200000'),1);
 await store2.createPairingCode({codeHash:pairingCodeHash('299999'),kind:'companion',name:'Companion',memberId:editor.id,now:1,expiresAt:PAIRING_CODE_TTL_MS});
});

test('a revoked credential is refused and revocation is recorded once',async()=>{
 const store=new MemoryDeviceStore();
 const first=await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:1_000});
 const second=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:2_000});
 await store.revoke(first.credential.id,3_000);
 assert.equal(await store.verify(first.token,4_000),null,'the revoked device is refused');
 assert.equal((await store.verify(second.token,4_000))?.id,second.credential.id,'the other device keeps working');
 await store.revoke(first.credential.id,9_000);
 assert.equal((await store.list())[1].revokedAt,3_000,'the first revocation time stands');
 assert.deepEqual((await store.list()).map(credential=>credential.name),['Booth Companion','Sanctuary PC'],'newest first');
 await store.revoke('no-such-device',5_000);
});

test('last_seen_at is written at most once a minute per credential',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:0});
 assert.equal((await store.verify(token,1_000))?.lastSeenAt,1_000,'the first sighting is recorded');
 assert.equal((await store.verify(token,1_000+LAST_SEEN_INTERVAL_MS))?.lastSeenAt,1_000,'a sighting inside the minute is not written');
 assert.equal((await store.verify(token,1_001+LAST_SEEN_INTERVAL_MS))?.lastSeenAt,1_001+LAST_SEEN_INTERVAL_MS);
 assert.equal(store.credentials.get(credential.id)?.lastSeenAt,1_001+LAST_SEEN_INTERVAL_MS);
});

test('the verified-token cache answers for ten minutes and survives a store outage for sixty',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:0});
 let calls=0;
 const counting:DeviceStore={...delegate(store),verify:async(value,now)=>{calls++;return store.verify(value,now)}};
 clearVerifiedDeviceCache();
 assert.equal((await verifyDeviceToken(token,1_000,counting))?.id,credential.id);
 assert.equal(calls,1);
 assert.equal((await verifyDeviceToken(token,1_000+VERIFIED_CACHE_MS-1,counting))?.id,credential.id,'a fresh entry answers without the store');
 assert.equal(calls,1);
 // Revoked, but the cache is deliberately positive-only for up to ten minutes (D4).
 await store.revoke(credential.id,1_500);
 assert.equal((await verifyDeviceToken(token,1_000+VERIFIED_CACHE_MS-1,counting))?.id,credential.id);
 assert.equal(await verifyDeviceToken(token,1_000+VERIFIED_CACHE_MS,counting),null,'the store has the last word once the entry is stale');
 assert.equal(calls,2);
 clearVerifiedDeviceCache();
});

test('the verified-token cache is honoured on a throwing store and never for an unknown token',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:0});
 let failing=false;
 const flaky:DeviceStore={...delegate(store),verify:async(value,now)=>{if(failing)throw new Error('store unavailable');return store.verify(value,now)}};
 clearVerifiedDeviceCache();
 assert.equal((await verifyDeviceToken(token,1_000,flaky))?.id,credential.id);
 failing=true;
 assert.equal((await verifyDeviceToken(token,1_000+VERIFIED_CACHE_MS+1,flaky))?.id,credential.id,'a cached device rides out the outage');
 assert.equal(await verifyDeviceToken(token,1_000+VERIFIED_OUTAGE_MS,flaky),null,'sixty minutes is the limit');
 const unknown=`cd_${'z'.repeat(12)}.${'y'.repeat(43)}`;
 assert.equal(await verifyDeviceToken(unknown,1_000,flaky),null,'an unknown token is never accepted from cache');
 assert.equal(await verifyDeviceToken('not-a-token',1_000,flaky),null);
 clearVerifiedDeviceCache();
});

/* ---------- D-1: a realtime ticket verifies afresh, so revocation bites on reconnection ---------- */

const withRelay=async(run:()=>Promise<void>)=>{
 const prior={RELAY_URL:process.env.RELAY_URL,RELAY_SECRET:process.env.RELAY_SECRET};
 Object.assign(process.env,{RELAY_URL:'https://relay.example.test',RELAY_SECRET:'ticket-secret'});
 try{await run()}finally{for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
};
const ticket=(role:'control'|'output',token:string)=>realtimeGET(new Request(`https://graphics.test/api/realtime?role=${role}`,{headers:{Authorization:`Bearer ${token}`}}));
const readCall=(token:string)=>authorizeRequest(new Request('https://graphics.test/api/state',{headers:{Authorization:`Bearer ${token}`}}),'read');

test('a revoked companion is refused a control ticket at its next reconnection while the cached read still answers',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:Date.now()});
 await withRelay(()=>withDeviceStore(delegate(store),async()=>{
  assert.equal((await ticket('control',token)).status,200,'a live companion still gets a ticket');
  await store.revoke(credential.id,Date.now());
  assert.ok(await readCall(token),'an ordinary API call keeps the D4 cache for up to ten minutes');
  const refused=await ticket('control',token);
  assert.equal(refused.status,401);
  assert.equal((await refused.json()).error,'Access key required');
  assert.equal(await readCall(token),null,'the refusal refreshes the cache entry rather than leaving it standing');
 }));
});

test('a revoked graphics output is refused an output ticket, and a live one is not',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:Date.now()});
 await withRelay(()=>withDeviceStore(delegate(store),async()=>{
  assert.equal((await ticket('output',token)).status,200);
  assert.equal((await ticket('control',token)).status,401,'an output credential never controls');
  await store.revoke(credential.id,Date.now());
  assert.equal((await ticket('output',token)).status,401);
 }));
});

test('a store outage at ticket time honours the cache rather than dropping every live device',async()=>{
 const store=new MemoryDeviceStore();
 const {token}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:Date.now()});
 let failing=false;
 const flaky:DeviceStore={...delegate(store),verify:async(value,now)=>{if(failing)throw new Error('store unavailable');return store.verify(value,now)}};
 await withRelay(()=>withDeviceStore(flaky,async()=>{
  assert.equal((await ticket('control',token)).status,200);
  failing=true;
  assert.equal((await ticket('control',token)).status,200,'a cached device rides out the outage');
  const unknown=`cd_${'z'.repeat(12)}.${'y'.repeat(43)}`;
  assert.equal((await ticket('control',unknown)).status,401,'an unknown token is never accepted from cache');
 }));
});

test('fresh verification bypasses the positive cache and refreshes it from the store',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:0});
 let calls=0;
 const counting:DeviceStore={...delegate(store),verify:async(value,now)=>{calls++;return store.verify(value,now)}};
 clearVerifiedDeviceCache();
 assert.equal((await verifyDeviceToken(token,1_000,counting))?.id,credential.id);
 assert.equal(calls,1);
 assert.equal((await verifyDeviceTokenFresh(token,1_100,counting))?.id,credential.id,'the cache is bypassed');
 assert.equal(calls,2);
 await store.revoke(credential.id,1_200);
 assert.equal(await verifyDeviceTokenFresh(token,1_300,counting),null,'the store has the last word');
 assert.equal(await verifyDeviceToken(token,1_400,counting),null,'and the cache entry is gone');
 assert.equal(await verifyDeviceTokenFresh('not-a-token',1_500,counting),null);
 clearVerifiedDeviceCache();
});

test('revoking through /api/devices drops this instance cache entry as well',async()=>{
 const store=new MemoryDeviceStore();
 const {token,credential}=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:Date.now()});
 await withDeviceStore(delegate(store),async()=>{
  assert.ok(await readCall(token),'the token is cached by an ordinary call');
  await withAccessMethods(signedIn(owner),async()=>{
   const response=await devicesPOST(deviceRequest({action:'revoke',id:credential.id},cookie()));
   assert.equal(response.status,200);
  });
  assert.equal(await readCall(token),null,'the cached entry went with the revoke');
 });
});

/* ---------- A-1: only signed-in members manage devices ---------- */

test('a legacy shared key and a device token cannot manage devices at all',async()=>{
 const prior=process.env.CONTROL_KEY;
 process.env.CONTROL_KEY='legacy-control-key';
 const store=new MemoryDeviceStore();
 const {credential}=await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:Date.now()});
 const companion=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:Date.now()});
 try{
  await withDeviceStore(delegate(store),async()=>{
   for(const bearer of ['legacy-control-key',companion.token]){
    const headers={Authorization:`Bearer ${bearer}`};
    const listed=await devicesGET(new Request('https://graphics.test/api/devices',{headers}));
    assert.equal(listed.status,401);
    assert.equal((await listed.json()).error,'Sign in as an editor or an administrator to manage devices.');
    for(const body of [{action:'pair_code',name:'Booth Companion'},{action:'create_output',name:'Sanctuary PC'},{action:'revoke',id:credential.id}]){
     const response=await devicesPOST(deviceRequest(body,headers));
     assert.equal(response.status,401,`${bearer===companion.token?'a device token':'the legacy key'} cannot ${String(body.action)}`);
    }
   }
   assert.equal(store.codes.size,0);
   assert.equal(store.credentials.get(credential.id)?.revokedAt,null);
  });
 }finally{if(prior===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=prior}
});

test('a device name must be present and short enough',()=>{
 assert.equal(deviceName(' Sanctuary PC '),'Sanctuary PC');
 assert.equal(deviceName(''),null);
 assert.equal(deviceName('   '),null);
 assert.equal(deviceName(42),null);
 assert.equal(deviceName('x'.repeat(81)),null);
 assert.equal(deviceName('x'.repeat(80))?.length,80);
});

test('GET /api/devices needs an editor and returns the paired devices',async()=>{
 const store=new MemoryDeviceStore();
 await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:1_000});
 await withDeviceStore(delegate(store),async()=>{
  const anonymous=await devicesGET(new Request('https://graphics.test/api/devices'));
  assert.equal(anonymous.status,401);
  assert.equal((await anonymous.json()).error,'Sign in as an editor or an administrator to manage devices.');
  await withAccessMethods(signedIn(editor),async()=>{
   const response=await devicesGET(new Request('https://graphics.test/api/devices',{headers:cookie()}));
   assert.equal(response.status,200);
   assert.equal(response.headers.get('cache-control'),'no-store');
   const body=await response.json();
   assert.equal(body.devices.length,1);
   assert.deepEqual(Object.keys(body.devices[0]).sort(),['createdAt','createdBy','id','kind','lastSeenAt','name','revokedAt'].sort());
   assert.equal(body.devices[0].name,'Sanctuary PC');
  });
 });
});

test('POST /api/devices issues a pairing code and an output URL for an editor, and refuses an operator',async()=>{
 const store=new MemoryDeviceStore();
 await withDeviceStore(delegate(store),async()=>{
  await withAccessMethods(signedIn({...editor,role:'operator'}),async()=>{
   const refused=await devicesPOST(deviceRequest({action:'pair_code',name:'Booth Companion',kind:'companion'},cookie()));
   assert.equal(refused.status,401);
   assert.equal(store.codes.size,0);
  });
  await withAccessMethods(signedIn(editor),async()=>{
   const paired=await devicesPOST(deviceRequest({action:'pair_code',name:'Booth Companion',kind:'companion'},cookie()));
   assert.equal(paired.status,201);
   const body=await paired.json();
   assert.deepEqual(Object.keys(body).sort(),['code','expiresAt']);
   assert.match(body.code,PAIRING_CODE);
   assert.equal(typeof body.expiresAt,'number');
   assert.equal(store.codes.get(pairingCodeHash(body.code))?.name,'Booth Companion');

   const output=await devicesPOST(deviceRequest({action:'create_output',name:'Sanctuary PC'},cookie()));
   assert.equal(output.status,201);
   const created=await output.json();
   assert.deepEqual(Object.keys(created).sort(),['credential','url']);
   assert.equal(created.credential.kind,'output');
   assert.match(created.url,/^https:\/\/graphics\.test\/output#device=cd_/);
   assert.match(created.url.split('#device=')[1],DEVICE_TOKEN);

   const unnamed=await devicesPOST(deviceRequest({action:'create_output',name:'  '},cookie()));
   assert.equal(unnamed.status,400);
   assert.equal((await unnamed.json()).error,'Name this device in 80 characters or fewer.');
   const wrongKind=await devicesPOST(deviceRequest({action:'pair_code',name:'Sanctuary PC',kind:'output'},cookie()));
   assert.equal(wrongKind.status,400);
   assert.equal((await wrongKind.json()).error,'Pairing codes are for Companion. Create a graphics connection instead.');
   const unknown=await devicesPOST(deviceRequest({action:'sing',name:'x'},cookie()));
   assert.equal(unknown.status,400);
   assert.equal((await unknown.json()).error,'Unknown action');
  });
 });
});

test('POST /api/devices refuses a cross-site write and a revoke by anyone but an administrator',async()=>{
 const store=new MemoryDeviceStore();
 const {credential}=await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:1_000});
 await withDeviceStore(delegate(store),async()=>{
  const crossSite=await devicesPOST(new Request('https://graphics.test/api/devices',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({action:'revoke',id:credential.id})}));
  assert.equal(crossSite.status,403);
  assert.equal((await crossSite.json()).error,'Open this action from the same website.');
  await withAccessMethods(signedIn(editor),async()=>{
   const refused=await devicesPOST(deviceRequest({action:'revoke',id:credential.id},cookie()));
   assert.equal(refused.status,401);
   assert.equal((await refused.json()).error,'Administrator access required');
   assert.equal(store.credentials.get(credential.id)?.revokedAt,null);
  });
  await withAccessMethods(signedIn(owner),async()=>{
   const missing=await devicesPOST(deviceRequest({action:'revoke'},cookie()));
   assert.equal(missing.status,400);
   assert.equal((await missing.json()).error,'Choose a device to revoke.');
   const response=await devicesPOST(deviceRequest({action:'revoke',id:credential.id},cookie()));
   assert.equal(response.status,200);
   assert.deepEqual(await response.json(),{ok:true});
   assert.equal(typeof store.credentials.get(credential.id)?.revokedAt,'number');
  });
 });
});

test('POST /api/devices reports the ten-code limit as a plain sentence',async()=>{
 const store=new MemoryDeviceStore();
 await withDeviceStore(delegate(store),async()=>{
  await withAccessMethods(signedIn(editor),async()=>{
   for(let index=0;index<MAX_UNREDEEMED_CODES;index++){
    const response=await devicesPOST(deviceRequest({action:'pair_code',name:'Booth Companion'},cookie()));
    assert.equal(response.status,201);
   }
   const refused=await devicesPOST(deviceRequest({action:'pair_code',name:'Booth Companion'},cookie()));
   assert.equal(refused.status,409);
   assert.equal((await refused.json()).error,'Ten pairing codes are already waiting. Use one, or wait for it to expire, before making another.');
  });
 });
});

test('POST /api/pairing/redeem needs no Origin, is rate limited, and returns the token once',async()=>{
 const store=new MemoryDeviceStore();
 const code=newPairingCode();
 await store.createPairingCode({codeHash:pairingCodeHash(code),kind:'companion',name:'Booth Companion',memberId:editor.id,now:Date.now(),expiresAt:Date.now()+PAIRING_CODE_TTL_MS});
 await withDeviceStore(delegate(store),async()=>{
  let attempts=0;
  await withAccessMethods({allowAttempt:async()=>{attempts++;return attempts<=3}},async()=>{
   // No Origin header: the Companion module is not a browser.
   const response=await redeemPOST(new Request('https://graphics.test/api/pairing/redeem',{method:'POST',body:JSON.stringify({code})}));
   assert.equal(response.status,201);
   const body=await response.json();
   assert.deepEqual(Object.keys(body).sort(),['kind','name','token']);
   assert.match(body.token,DEVICE_TOKEN);
   assert.equal(body.kind,'companion');
   assert.equal(body.name,'Booth Companion');

   const replay=await redeemPOST(new Request('https://graphics.test/api/pairing/redeem',{method:'POST',body:JSON.stringify({code})}));
   assert.equal(replay.status,400);
   assert.equal((await replay.json()).error,'That pairing code has expired or was already used. Ask for a new code.');

   const malformed=await redeemPOST(new Request('https://graphics.test/api/pairing/redeem',{method:'POST',body:JSON.stringify({code:'12345'})}));
   assert.equal(malformed.status,400);
   assert.equal((await malformed.json()).error,'Enter the six-digit pairing code.');

   const limited=await redeemPOST(new Request('https://graphics.test/api/pairing/redeem',{method:'POST',body:JSON.stringify({code})}));
   assert.equal(limited.status,429);
   assert.equal((await limited.json()).error,'Please wait a minute before trying again.');
   assert.equal(attempts,4,'the limiter is consulted before the code is looked up');
  });
 });
});

test('POST /api/pairing/redeem reports a store outage without leaking anything',async()=>{
 await withDeviceStore({redeemPairingCode:async()=>{throw new Error('store unavailable')}},async()=>{
  await withAccessMethods({allowAttempt:async()=>true},async()=>{
   const response=await redeemPOST(new Request('https://graphics.test/api/pairing/redeem',{method:'POST',body:JSON.stringify({code:'123456'})}));
   assert.equal(response.status,503);
   assert.equal((await response.json()).error,'Pairing is temporarily unavailable. Existing graphics devices remain connected.');
   const invalid=await redeemPOST(new Request('https://graphics.test/api/pairing/redeem',{method:'POST',body:'not json'}));
   assert.equal(invalid.status,400);
  });
 });
});

test('GET /api/output-url keeps the legacy key form and builds the durable device form',async()=>{
 const before={control:process.env.CONTROL_KEY,output:process.env.OUTPUT_KEY};
 process.env.CONTROL_KEY='control-test';process.env.OUTPUT_KEY='output-test';
 try{
  const headers={Authorization:'Bearer control-test'};
  const legacy=await outputUrlGET(new Request('https://graphics.test/api/output-url',{headers}));
  assert.equal((await legacy.json()).url,'https://graphics.test/output#key=output-test');
  const token=`cd_${'a'.repeat(12)}.${'b'.repeat(43)}`;
  const device=await outputUrlGET(new Request(`https://graphics.test/api/output-url?device=${token}`,{headers}));
  assert.equal((await device.json()).url,`https://graphics.test/output#device=${token}`);
  const malformed=await outputUrlGET(new Request('https://graphics.test/api/output-url?device=nonsense',{headers}));
  assert.equal(malformed.status,400);
  assert.equal((await malformed.json()).error,'That graphics connection is not recognized.');
  const anonymous=await outputUrlGET(new Request('https://graphics.test/api/output-url'));
  assert.equal(anonymous.status,401);
 }finally{
  if(before.control===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=before.control;
  if(before.output===undefined)delete process.env.OUTPUT_KEY;else process.env.OUTPUT_KEY=before.output;
 }
});

/* The cue log's credential (2026-09-14 integration ruling 7). It is the one device kind an
   editor cannot create: it hands another website a standing read of this one, so it is
   administrator work, and the token is shown exactly once. */
test('a service-history credential is administrator work and is shown exactly once',async()=>{
 const store=new MemoryDeviceStore();
 await withDeviceStore(delegate(store),async()=>{
  await withAccessMethods(signedIn(editor),async()=>{
   const refused=await devicesPOST(deviceRequest({action:'create_history_reader',name:'centralreform.live'},cookie()));
   assert.equal(refused.status,401);
   assert.equal((await refused.json()).error,'Administrator access required');
   assert.equal(store.credentials.size,0);
  });
  await withAccessMethods(signedIn(owner),async()=>{
   const created=await devicesPOST(deviceRequest({action:'create_history_reader',name:'centralreform.live'},cookie()));
   assert.equal(created.status,201);
   const body=await created.json();
   assert.deepEqual(Object.keys(body).sort(),['credential','token']);
   assert.match(body.token,DEVICE_TOKEN);
   assert.equal(body.credential.kind,'history_reader');
   assert.equal(body.credential.name,'centralreform.live');
   assert.ok(!('secretHash' in body.credential)&&!('token' in body.credential),'the credential view never carries the secret');
   const listed=await devicesGET(new Request('https://graphics.test/api/devices',{headers:cookie()}));
   const devices=(await listed.json()).devices as {id:string;kind:string}[];
   assert.deepEqual(devices.map(device=>device.kind),['history_reader'],'it is revocable from the same panel as every other device');
   assert.ok(!JSON.stringify(devices).includes(body.token.split('.')[1]),'and the list never repeats the secret');
   const unnamed=await devicesPOST(deviceRequest({action:'create_history_reader',name:'  '},cookie()));
   assert.equal(unnamed.status,400);
  });
 });
});
