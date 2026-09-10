// Preserve normal cue latency; back off only while the service is unavailable.
export function pollDelay(normalMs:number, failures:number){
 return failures===0?normalMs:Math.min(30_000,1000*2**Math.min(failures-1,5));
}
