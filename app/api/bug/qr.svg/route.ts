import {getPublicWorkspace} from '@/lib/workspace';
import {qrSvg} from '@/lib/qr';

/**
 * D8 — `GET /api/bug/qr.svg`. Public and credential-free: it carries the congregation's
 * own published address and nothing else, and the compositor's browser input fetches it
 * without a key. A congregation with no scan card configured answers 404.
 *
 * The route lives at `app/api/bug/qr.svg/route.ts` because the path segment is literally
 * `qr.svg` — the same shape Next uses for `sitemap.xml`.
 */
export function GET(){
 let workspace;
 try{workspace=getPublicWorkspace()}catch{return new Response('Workspace identity is not configured correctly',{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
 if(!workspace.bug.enabled||!workspace.bug.url)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return new Response(qrSvg(workspace.bug.url,{level:'M'}),{status:200,headers:{
  'Content-Type':'image/svg+xml; charset=utf-8',
  // lib/qr.ts draws the code as plain <rect> elements with `fill` attributes: no inline
  // style, no script, no external reference. Nothing at all is therefore the correct policy
  // if this SVG is ever opened as a document rather than as an <img>.
  'Content-Security-Policy':"default-src 'none'",
  'Cache-Control':'public, max-age=86400, stale-while-revalidate=604800',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
 }});
}
