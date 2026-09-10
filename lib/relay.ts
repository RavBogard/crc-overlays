import {createHmac,randomUUID} from 'node:crypto';

export type RelayRole='control'|'output'|'preview';
export function relayConfigured(){return Boolean(process.env.RELAY_URL&&process.env.RELAY_SECRET)}
export function relayOrigin(){
 const raw=process.env.RELAY_URL;if(!raw)throw Error('Live relay is not configured');
 const url=new URL(raw);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid live relay origin');
 return url.origin;
}
export function relayTicket(role:RelayRole,now=Date.now()){
 const secret=process.env.RELAY_SECRET;if(!secret)throw Error('Live relay is not configured');
 const payload=Buffer.from(JSON.stringify({room:'crc',role,exp:Math.floor(now/1000)+120,jti:randomUUID()})).toString('base64url');
 return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function relayConnection(role:RelayRole){
 const url=new URL('/connect',relayOrigin());url.protocol=url.protocol==='https:'?'wss:':'ws:';
 return {url:url.toString(),ticket:relayTicket(role),heartbeatMs:10_000,staleMs:30_000,protocol:1};
}
export async function relayRequest(path:string,body?:unknown){
 if(!['/state','/command','/initialize','/ack','/catalog'].includes(path))throw Error('Invalid relay operation');
 const secret=process.env.RELAY_SECRET;if(!secret)throw Error('Live relay is not configured');
 return fetch(new URL(path,relayOrigin()),{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${secret}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
}
export async function relaySnapshot(){const r=await relayRequest('/state');if(!r.ok)throw Error('Live relay unavailable');return r.json()}
