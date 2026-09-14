import {publicNow} from '@/lib/server';

/**
 * D15/D16 — `GET /api/now`, public and credential-free, off unless `OVERLAYS_PUBLIC_NOW=1`.
 *
 * The edge cache is the whole design: one function invocation per two seconds per PoP,
 * whatever the size of the congregation, and at most ~1,800 relay reads an hour per PoP —
 * the figure is per point of presence and per running instance, not a global ceiling, so a
 * deployment served from several PoPs multiplies it by the number of PoPs actually hit. The
 * flag being unset answers 404 rather than 403 so the endpoint does not advertise itself, and
 * a failed read answers 503 with `no-store` so a failure is never cached anywhere.
 *
 * Exactly one cache key exists, because a query string is refused rather than answered: an
 * unbounded `?x=<random>` would otherwise miss the edge cache on every request and put every
 * one of those misses on the relay. `/api/now` takes no parameters, so a request that carries
 * any is answered 404 `no-store` — the same body the unset flag answers, and never cached.
 *
 * `pollSeconds` is the client hint the web siddur follows: five seconds, which is what
 * `docs/planning/2026-09-13-product-review/HANDOFF-WEBAPP-FOLLOW-SERVICE.md` orders.
 */
const publicHeaders={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'} as const;
const notFound=()=>new Response(JSON.stringify({error:'not_found'}),{status:404,headers:{...publicHeaders,'Cache-Control':'no-store'}});

export async function GET(request:Request){
 if(process.env.OVERLAYS_PUBLIC_NOW!=='1')return notFound();
 if(new URL(request.url).search)return notFound();
 try{
  const value=await publicNow();
  return new Response(JSON.stringify(value),{status:200,headers:{...publicHeaders,'Cache-Control':'public, max-age=2, s-maxage=2, stale-while-revalidate=10'}});
 }catch{
  return new Response(JSON.stringify({error:'unavailable'}),{status:503,headers:{...publicHeaders,'Cache-Control':'no-store'}});
 }
}
