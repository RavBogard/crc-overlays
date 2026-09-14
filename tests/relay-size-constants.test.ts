import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MAX_SNAPSHOT_BYTES} from '../relay/src/protocol.ts';

// relay/src/protocol.ts MAX_SNAPSHOT_BYTES is the one source of truth for how large a
// realtime message may be. companion/src/client.ts mirrors it as a module-local literal
// (not exported), and lib/browser-realtime.ts mirrors it again as an inline literal (the
// browser transport never imports server code). This test is the drift guard: if
// MAX_SNAPSHOT_BYTES ever moves, both mirrors must move with it or this test fails.
// MAX_REALTIME_MESSAGE_BYTES is not exported from companion/src/client.ts, so it is read out
// of the source text rather than imported - the alternative is editing that file, which is
// out of scope here.
// Reads the literal's factors out of the source text and multiplies them directly - no eval,
// no dynamic code execution, just arithmetic on numbers already validated by the regex.
function productOfFactors(expression:string):number{
 return expression.split('*').map(factor=>Number(factor.trim().replace(/_/g,''))).reduce((product,factor)=>{
  if(!Number.isFinite(factor))throw new Error(`Not a numeric literal factor: ${factor}`);
  return product*factor;
 },1);
}

test('companion/src/client.ts MAX_REALTIME_MESSAGE_BYTES mirrors relay/src/protocol.ts MAX_SNAPSHOT_BYTES',()=>{
 const path=fileURLToPath(new URL('../companion/src/client.ts',import.meta.url));
 const source=readFileSync(path,'utf8');
 const match=source.match(/MAX_REALTIME_MESSAGE_BYTES\s*=\s*([\d_]+(?:\s*\*\s*[\d_]+)*)/);
 assert.ok(match,'expected a MAX_REALTIME_MESSAGE_BYTES literal in companion/src/client.ts');
 assert.equal(productOfFactors(match![1]),MAX_SNAPSHOT_BYTES);
});

test('lib/browser-realtime.ts inline message-size literal mirrors MAX_SNAPSHOT_BYTES',()=>{
 const path=fileURLToPath(new URL('../lib/browser-realtime.ts',import.meta.url));
 const source=readFileSync(path,'utf8');
 const match=source.match(/event\.data\.length>(\d+)/);
 assert.ok(match,'expected an inline event.data.length>N guard in lib/browser-realtime.ts');
 assert.equal(Number(match![1]),MAX_SNAPSHOT_BYTES);
});
