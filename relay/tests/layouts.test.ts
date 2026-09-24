import {describe,expect,it} from 'vitest';
import {parseCatalog} from '../src/protocol';

/**
 * MCP plan L2: the approved catalog may carry `layouts`, the pinned data-layout definitions its
 * cues render with, keyed `id@version`. It is an envelope-only addition: a catalog without it
 * parses to exactly what it did before, and a malformed one is refused whole.
 */

const sha='a'.repeat(64);
const cues=[{id:'cue-one',layout:'bottom'},{id:'cue-data',layout:'response',layoutRef:{id:'response',version:2,sha256:sha}}];
const entry={id:'response',version:2,sha256:sha,document:{label:'Response card'}};

describe('catalog layouts',()=>{
 it('leaves a catalog without layouts exactly as before',()=>{
  expect(parseCatalog({version:'v1',cues})).toEqual({version:'v1',cues});
  expect(parseCatalog({version:'v1',cues,layouts:{}})).toEqual({version:'v1',cues});
 });

 it('keeps well-formed layouts beside the cues',()=>{
  expect(parseCatalog({version:'v1',cues,layouts:{'response@2':entry}})).toEqual({version:'v1',cues,layouts:{'response@2':entry}});
 });

 it('refuses the whole catalog for a malformed entry',()=>{
  for(const layouts of [[],'x',{'response@3':entry},{'Response@2':{...entry,id:'Response'}},{'response@2':{...entry,sha256:'nope'}},{'response@2':{...entry,document:null}},{'response@2':null}])
   expect(parseCatalog({version:'v1',cues,layouts})).toBeNull();
 });
});
