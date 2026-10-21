import assert from 'node:assert/strict';
import test from 'node:test';
import {plannedSelection,preparedMatches,requestedSetlist} from '../app/services/planned-service.ts';

test('a linked id is preselected only when the authorized list contains that exact id',()=>{
 const list=[{id:'crc-one'},{id:'crc-two'}];
 assert.deepEqual(plannedSelection(requestedSetlist('?setlistId=crc-two'),list,'crc-one'),{chosen:'crc-two',unavailable:false});
 for(const query of ['?setlistId=foreign','?setlistId=CRC-two','?setlistId=','?setlistId=crc-two&setlistId=crc-one','?setlistId=https://other.example']){
  assert.deepEqual(plannedSelection(requestedSetlist(query),list,'crc-one'),{chosen:'',unavailable:true});
 }
 assert.deepEqual(plannedSelection(requestedSetlist('?setlistId=crc-two'),[],'crc-one'),{chosen:'',unavailable:true});
});
test('the ordinary picker keeps its suggestion only if it is in the authorized list',()=>{
 assert.equal(requestedSetlist('?other=value'),null);
 assert.deepEqual(plannedSelection(null,[{id:'one'},{id:'two'}],'two'),{chosen:'two',unavailable:false});
 assert.deepEqual(plannedSelection(null,[{id:'one'}],'foreign'),{chosen:'one',unavailable:false});
});
test('prepared matches retain archived and ambiguous collections instead of choosing or duplicating one',()=>{
 const collections=[{id:'unrelated',origin:null},{id:'first',origin:{setlistId:'source'}},{id:'archived',archived:true,origin:{setlistId:'source'}},{id:'other',origin:{setlistId:'elsewhere'}}];
 assert.deepEqual(preparedMatches(collections,'source').map(item=>item.id),['first','archived']);
 assert.deepEqual(preparedMatches(collections,'unknown'),[]);
 assert.deepEqual(preparedMatches(collections,''),[]);
});
