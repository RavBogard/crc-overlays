import test from 'node:test';
import assert from 'node:assert/strict';
import {pollDelay} from '../lib/poll-delay.ts';
test('outage retries back off without delaying healthy cue polling',()=>{
 assert.equal(pollDelay(300,0),300);
 assert.deepEqual([1,2,3,4,5,6,100].map(n=>pollDelay(300,n)),[1000,2000,4000,8000,16000,30000,30000]);
 assert.equal(pollDelay(700,0),700);
});
