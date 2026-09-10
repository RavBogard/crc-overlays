import assert from 'node:assert/strict';
import test from 'node:test';
import {GET} from '../app/api/output-url/route';

const originalControl=process.env.CONTROL_KEY;
const originalOutput=process.env.OUTPUT_KEY;
const originalBase=process.env.PUBLIC_BASE_URL;

test.after(()=>{
  if(originalControl===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=originalControl;
  if(originalOutput===undefined)delete process.env.OUTPUT_KEY;else process.env.OUTPUT_KEY=originalOutput;
  if(originalBase===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=originalBase;
});

test('returns an output-only URL only to the control key',async()=>{
  process.env.CONTROL_KEY='control-secret';
  process.env.OUTPUT_KEY='output secret/#?';
  process.env.PUBLIC_BASE_URL='https://graphics.example';

  const unauthorized=await GET(new Request('https://graphics.example/api/output-url'));
  assert.equal(unauthorized.status,401);
  assert.equal(unauthorized.headers.get('cache-control'),'no-store');

  const outputCredential=await GET(new Request('https://graphics.example/api/output-url',{headers:{Authorization:'Bearer output secret/#?'}}));
  assert.equal(outputCredential.status,401);

  const response=await GET(new Request('https://graphics.example/api/output-url',{headers:{Authorization:'Bearer control-secret'}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const body=await response.json();
  assert.equal(body.url,'https://graphics.example/output#key=output%20secret%2F%23%3F');
  assert.equal(body.url.includes('control-secret'),false);
});

test('does not return a URL when output access is unconfigured',async()=>{
  process.env.CONTROL_KEY='control-secret';
  delete process.env.OUTPUT_KEY;
  process.env.PUBLIC_BASE_URL='https://graphics.example';
  const response=await GET(new Request('https://graphics.example/api/output-url',{headers:{Authorization:'Bearer control-secret'}}));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'Output access is not configured'});
});
