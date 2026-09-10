import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {relayConnection,relayOrigin,relayTicket} from '../lib/relay.ts';
import {GET} from '../app/api/realtime/route.ts';

test('relay tickets are short-lived scoped credentials, not long-lived output keys',async()=>{
 const prior={...process.env};Object.assign(process.env,{RELAY_URL:'https://relay.example.test',RELAY_SECRET:'test-secret',CONTROL_KEY:'test-control',OUTPUT_KEY:'test-output'});
 try{
  const ticket=relayTicket('preview',1_000_000),[payload,signature]=ticket.split('.');
  assert.equal(signature,createHmac('sha256','test-secret').update(payload).digest('base64url'));
  assert.deepEqual({...JSON.parse(Buffer.from(payload,'base64url').toString()),jti:'id'},{room:'crc',role:'preview',exp:1120,jti:'id'});
  assert.equal(relayConnection('output').url,'wss://relay.example.test/connect');
  const denied=await GET(new Request('https://site.test/api/realtime?role=control',{headers:{Authorization:'Bearer test-output'}}));assert.equal(denied.status,401);
  const allowed=await GET(new Request('https://site.test/api/realtime?role=output',{headers:{Authorization:'Bearer test-output'}}));assert.equal(allowed.status,200);assert.equal(allowed.headers.get('cache-control'),'no-store');
  const text=await allowed.text();assert.ok(!text.includes('test-secret'));assert.ok(!text.includes('test-control'));assert.ok(!text.includes('test-output'));
  for(const invalid of ['http://external.test','https://u:p@relay.test','https://relay.test/path','https://relay.test/#key']){process.env.RELAY_URL=invalid;assert.throws(()=>relayOrigin())}
 }finally{for(const k of ['RELAY_URL','RELAY_SECRET','CONTROL_KEY','OUTPUT_KEY']){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k]}}
});
