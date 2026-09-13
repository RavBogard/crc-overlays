import assert from 'node:assert/strict';
import test from 'node:test';
import {consoleKeyAction,nextInspected,type ConsoleKeyAction} from '../lib/console-keys.ts';

test('nextInspected moves through the visible graphics and stops at the ends',()=>{
 assert.equal(nextInspected(['a','b','c'],'b',1),'c');
 assert.equal(nextInspected(['a','b','c'],'b',-1),'a');
 assert.equal(nextInspected(['a','b','c'],'c',1),'c');
 assert.equal(nextInspected(['a','b','c'],'a',-1),'a');
});

test('nextInspected starts from the right end when nothing is inspected yet',()=>{
 assert.equal(nextInspected(['a','b','c'],null,1),'a');
 assert.equal(nextInspected(['a','b','c'],null,-1),'c');
 assert.equal(nextInspected(['a','b','c'],'gone',1),'a');
 assert.equal(nextInspected(['a','b','c'],'gone',-1),'c');
});

test('nextInspected has nothing to inspect in an empty library',()=>{
 assert.equal(nextInspected([],null,1),null);
 assert.equal(nextInspected([],'a',-1),null);
});

test('consoleKeyAction never produces anything beyond move and inspect',()=>{
 const allowed:Array<ConsoleKeyAction|null>=['up','down','inspect',null];
 for(const key of ['s','S','Space',' ','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape','Tab','F5','0'])
  assert.ok(allowed.includes(consoleKeyAction(key,'div',{})),`${key} produced an action outside the allowed set`);
 assert.equal(consoleKeyAction('ArrowUp','div',{}),'up');
 assert.equal(consoleKeyAction('ArrowDown','div',{}),'down');
 assert.equal(consoleKeyAction('Enter','div',{}),'inspect');
 assert.equal(consoleKeyAction(' ','div',{}),null);
 assert.equal(consoleKeyAction('Space','div',{}),null);
 assert.equal(consoleKeyAction('s','div',{}),null);
 assert.equal(consoleKeyAction('Escape','div',{}),null);
});

test('consoleKeyAction stands aside for modifiers and for typing fields',()=>{
 assert.equal(consoleKeyAction('Enter','div',{ctrl:true}),null);
 assert.equal(consoleKeyAction('ArrowDown','div',{meta:true}),null);
 assert.equal(consoleKeyAction('ArrowUp','div',{alt:true}),null);
 assert.equal(consoleKeyAction('ArrowUp','div',{shift:true}),null);
 assert.equal(consoleKeyAction('ArrowDown','input',{}),null);
 assert.equal(consoleKeyAction('ArrowDown','INPUT',{}),null);
 assert.equal(consoleKeyAction('ArrowDown','TEXTAREA',{}),null);
 assert.equal(consoleKeyAction('Enter','select',{}),null);
 assert.equal(consoleKeyAction('ArrowDown','button',{}),'down');
});
