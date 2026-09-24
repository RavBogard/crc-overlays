import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';

// Every tool an MCP client sees - name, description, schema and annotations - pinned to a
// fixture, so moving registration between lib/mcp/* modules cannot change what a connected
// client is offered. Order is sorted by name: tools/list order carries no meaning to a client.
// Regenerate deliberately with MCP_TOOL_SNAPSHOT=write when a packet changes the surface.
const FIXTURE=new URL('./fixtures/mcp-tools.json',import.meta.url);
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;

test('MCP tool list and schemas match the recorded snapshot',async()=>{
 const handler=createAuthoringMcpHandler(async()=>({}));
 const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}),{authInfo});
 const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
 const body=JSON.parse(data??'') as {result:{tools:{name:string}[]}};
 const tools=[...body.result.tools].sort((a,b)=>a.name.localeCompare(b.name));
 const text=JSON.stringify(tools,null,1)+'\n';
 if(process.env.MCP_TOOL_SNAPSHOT==='write')writeFileSync(FIXTURE,text);
 assert.equal(text,readFileSync(FIXTURE,'utf8'));
});
