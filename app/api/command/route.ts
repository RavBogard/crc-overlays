import {authorizeRequest} from '@/lib/access';
import {runLiveCommand,type LiveCommandBody} from '@/lib/live-command';
import {json} from '@/lib/server';
export async function POST(r:Request){const actor=await authorizeRequest(r,'control');if(!actor)return json({error:'Control key required'},401);
try{if(Number(r.headers.get('content-length'))>4096)return json({error:'Request too large'},413);const raw=await r.text();if(raw.length>4096)return json({error:'Request too large'},413);let b:LiveCommandBody&{source?:unknown};try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!b||typeof b!=='object')return json({error:'Invalid command'},400);
// The cue log records where a command came from, never who sent it. Only a paired Companion
// holds a device credential that satisfies 'control', so that is the one distinction drawn;
// a member session and the transitional shared key are both plain live control. The one tag a
// caller may add is `source:'mcp'` (R-V4): the console's WebMCP tools say an agent pressed, not a
// person. A Companion credential stays 'companion' whatever it claims, so the deck guard sees it,
// and any other value is ignored exactly as the whole field was before.
const source=actor.id.startsWith('device:')?'companion':b.source==='mcp'?'mcp':'control';
const answer=await runLiveCommand(b,source);return json(answer.body,answer.status);
}catch{return json({error:'Command could not be confirmed. Check state before retrying with the same command ID.'},503)}}
