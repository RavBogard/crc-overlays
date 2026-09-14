/**
 * The three Google routes and the two additions to `/api/access`, driven with real `Request`
 * objects against a `MemoryAccessStore` and the same fake issuer pattern as
 * `tests/google-sign-in.test.ts`. No network: `googleDependencies.fetch` answers discovery,
 * the JWKS and the token endpoint. Dummy credentials only; nothing here reads `.env`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {POST as startPOST} from '../app/api/auth/google/start/route.ts';
import {GET as callbackGET} from '../app/api/auth/google/callback/route.ts';
import {GET as confirmGET,POST as confirmPOST} from '../app/api/auth/google/confirm/route.ts';
import {GET as accessGET,POST as accessPOST} from '../app/api/access/route.ts';
import {ACCESS_COOKIE,MemoryAccessStore,accessStore,accessToken,hashPassword,issueSession,tokenHash,type AccessMember,type AccessStore,type GoogleIdentity,type SignInFlow} from '../lib/access.ts';
import {GOOGLE_CALLBACK_PATH,googleDependencies,resetGoogleConfiguration} from '../lib/google-sign-in.ts';

const CLIENT_ID='client-id.apps.googleusercontent.test';
const CLIENT_SECRET='client-secret-value';
const CRC_ORIGIN='https://crc-overlays.vercel.app';
const FLOW_COOKIE='crc_google_flow';
const GOOGLE_EMAIL='owner@crc.example';
const PASSWORD='rehearsal-password-2026';

// ---------------------------------------------------------------- fake issuer

const base64url=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const s256=(value:string)=>createHash('sha256').update(value).digest('base64url');

function fakeIssuer(){
 const origin='https://issuer.test';
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=publicKey.export({format:'jwk'}) as Record<string,string>;
 const authorized=new Map<string,{challenge:string;nonce:string;redirectUri:string}>();
 const profile={subject:'google-subject-1',email:'Owner@Crc.Example',emailVerified:true};

 /** Stands in for the browser visiting Google: records the challenge, hands back a code. */
 function authorize(url:URL){
  const code=`code-${authorized.size+1}`;
  authorized.set(code,{challenge:url.searchParams.get('code_challenge')||'',nonce:url.searchParams.get('nonce')||'',redirectUri:url.searchParams.get('redirect_uri')||''});
  return code;
 }
 function idToken(nonce:string){
  const issuedAt=Math.floor(Date.now()/1000);
  const header=base64url({alg:'RS256',typ:'JWT',kid:'test-key'});
  const body=base64url({iss:origin,aud:CLIENT_ID,sub:profile.subject,iat:issuedAt,exp:issuedAt+300,nonce,email:profile.email,email_verified:profile.emailVerified,name:'Owner Example'});
  return `${header}.${body}.${sign('sha256',Buffer.from(`${header}.${body}`),privateKey).toString('base64url')}`;
 }
 const handler=async(input:string,init?:{body?:unknown}):Promise<Response>=>{
  const url=new URL(String(input));
  if(url.pathname==='/.well-known/openid-configuration')return Response.json({issuer:origin,authorization_endpoint:`${origin}/authorize`,token_endpoint:`${origin}/token`,jwks_uri:`${origin}/jwks`,response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],scopes_supported:['openid','email','profile']});
  if(url.pathname==='/jwks')return Response.json({keys:[{...jwk,kid:'test-key',alg:'RS256',use:'sig'}]});
  if(url.pathname==='/token'){
   const body=new URLSearchParams(typeof init?.body==='string'?init.body:String(init?.body??''));
   const record=authorized.get(body.get('code')||'');
   if(!record||s256(body.get('code_verifier')||'')!==record.challenge||body.get('redirect_uri')!==record.redirectUri)return Response.json({error:'invalid_grant'},{status:400});
   authorized.delete(body.get('code')||'');
   return Response.json({access_token:'access-token-value',token_type:'bearer',expires_in:3600,id_token:idToken(record.nonce)});
  }
  return new Response('not found',{status:404});
 };
 return {origin,authorize,profile,fetch:handler as unknown as typeof fetch};
}

// ------------------------------------------------------------------- harness

const envNames=['PUBLIC_BASE_URL','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET'] as const;
type EnvName=(typeof envNames)[number];
async function withEnvironment(values:Partial<Record<EnvName,string|undefined>>,run:()=>Promise<void>){
 const before=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
 try{for(const name of envNames){const value=values[name];if(value===undefined)Reflect.deleteProperty(process.env,name);else Reflect.set(process.env,name,value)}await run()}
 finally{for(const name of envNames){const value=before[name];if(value===undefined)Reflect.deleteProperty(process.env,name);else Reflect.set(process.env,name,value)}}
}

/** Same monkeypatch seam as `withStoreMethods` in `tests/access.test.ts`, whole-store. */
const STORE_KEYS=['memberForSession','createSession','deleteSession','credentialForEmail','setPassword','redeem','invite','list','disable','bootstrap','allowAttempt','identityForMember','memberForIdentity','linkIdentity','unlinkIdentity','putSignInFlow','takeSignInFlow','peekSignInFlow','memberById','invitationTarget'] as const satisfies readonly (keyof AccessStore)[];
function snapshot(source:AccessStore):AccessStore{
 const copy:Record<string,unknown>={};
 for(const key of STORE_KEYS){const method=source[key] as unknown as (...args:unknown[])=>unknown;copy[key]=method.bind(source)}
 return copy as unknown as AccessStore;
}
async function withMemoryStore(run:(store:MemoryAccessStore)=>Promise<void>){
 const store=new MemoryAccessStore();
 const saved=snapshot(accessStore);
 Object.assign(accessStore,snapshot(store as unknown as AccessStore));
 try{await run(store)}finally{Object.assign(accessStore,saved)}
}

type Context={store:MemoryAccessStore;issuer:ReturnType<typeof fakeIssuer>};
async function withGoogle(env:Partial<Record<EnvName,string|undefined>>,run:(context:Context)=>Promise<void>){
 const issuer=fakeIssuer();
 const before={fetch:googleDependencies.fetch,issuer:googleDependencies.issuer,now:googleDependencies.now};
 await withEnvironment({GOOGLE_OAUTH_CLIENT_ID:CLIENT_ID,GOOGLE_OAUTH_CLIENT_SECRET:CLIENT_SECRET,PUBLIC_BASE_URL:CRC_ORIGIN,...env},async()=>{
  googleDependencies.fetch=issuer.fetch;googleDependencies.issuer=issuer.origin;
  resetGoogleConfiguration();
  try{await withMemoryStore(store=>run({store,issuer}))}
  finally{Object.assign(googleDependencies,before);resetGoogleConfiguration()}
 });
}

type StartOptions={origin?:string;sameSite?:boolean;cookie?:string};
function startRequest(fields:Record<string,string>,{origin=CRC_ORIGIN,sameSite=true,cookie}:StartOptions={}){
 const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};
 if(sameSite)headers.Origin=origin;
 if(cookie)headers.Cookie=cookie;
 return new Request(`${origin}/api/auth/google/start`,{method:'POST',headers,body:new URLSearchParams(fields).toString()});
}
const cookieFrom=(response:Response,name:string)=>{
 const raw=response.headers.getSetCookie().find(value=>value.startsWith(`${name}=`));
 return raw?{value:raw.slice(name.length+1).split(';')[0],raw}:null;
};
const location=(response:Response)=>response.headers.get('Location')||'';

/** Plays the browser trip to Google and back with the cookie the start route set. */
async function throughGoogle(issuer:Context['issuer'],start:Response,origin=CRC_ORIGIN){
 const authorization=new URL(location(start));
 const code=issuer.authorize(authorization);
 const flowToken=cookieFrom(start,FLOW_COOKIE)?.value??'';
 return callbackGET(new Request(`${origin}${GOOGLE_CALLBACK_PATH}?code=${code}&state=${authorization.searchParams.get('state')}`,{headers:{Cookie:`${FLOW_COOKIE}=${flowToken}`}}));
}

function addMember(store:MemoryAccessStore,member:AccessMember,passwordHash:string|null=null){
 store.members.set(member.id,{...member,passwordHash,createdAt:1});
 return member;
}
const memberOf=(id:string,email:string):AccessMember=>({id,email,name:id,role:'editor',enabled:true});
const identityOf=(subject='google-subject-1',email=GOOGLE_EMAIL):GoogleIdentity=>({provider:'google',issuer:'https://issuer.test',subject,email,emailVerified:true});
const accessRequest=(body:unknown,cookie?:string)=>new Request(`${CRC_ORIGIN}/api/access`,{method:'POST',headers:{Origin:CRC_ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
async function signedInCookie(member:AccessMember){return `${ACCESS_COOKIE}=${await issueSession(member,accessStore,'password')}`}

// --------------------------------------------------------------------- start

test('start stores one flow, sets a Lax cookie scoped to the Google routes, and redirects to Google',async()=>{
 await withGoogle({},async({store})=>{
  const response=await startPOST(startRequest({intent:'signin'}));
  assert.equal(response.status,303);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const url=new URL(location(response));
  assert.equal(url.origin+url.pathname,'https://issuer.test/authorize');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('prompt'),'select_account');
  assert.equal(url.searchParams.get('access_type'),null,'no refresh token is ever requested');
  assert.equal(url.searchParams.get('scope'),'openid email profile');
  assert.equal(url.searchParams.get('redirect_uri'),`${CRC_ORIGIN}${GOOGLE_CALLBACK_PATH}`);

  const cookie=cookieFrom(response,FLOW_COOKIE);
  assert.ok(cookie);
  assert.match(cookie.value,/^[A-Za-z0-9_-]{43}$/);
  assert.match(cookie.raw,/HttpOnly/);
  assert.match(cookie.raw,/SameSite=Lax/);
  assert.match(cookie.raw,/Path=\/api\/auth\/google/);
  assert.match(cookie.raw,/Max-Age=600/);
  assert.match(cookie.raw,/Secure/);
  // The cookie carries the token; the store holds only its hash.
  assert.equal(store.flows.size,1);
  assert.ok(store.flows.has(tokenHash(cookie.value)));
  assert.equal(store.sessions.size,0);
 });
});

test('start refuses a cross-site post before it touches the store',async()=>{
 await withGoogle({},async({store})=>{
  const response=await startPOST(startRequest({intent:'signin'},{sameSite:false}));
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'Open this action from the same website.'});
  assert.equal(store.flows.size,0);
 });
});

test('start is available only on a registered host that agrees with the canonical origin',async()=>{
 await withGoogle({},async({store})=>{
  const preview=await startPOST(startRequest({intent:'signin'},{origin:'https://crc-overlays-git-x.vercel.app'}));
  assert.equal(preview.status,303);
  assert.equal(location(preview),'/access?google=unavailable');
  assert.equal(store.flows.size,0);
 });
 await withGoogle({PUBLIC_BASE_URL:undefined},async({store})=>{
  const local=await startPOST(startRequest({intent:'signin'},{origin:'http://localhost:5175'}));
  assert.equal(new URL(location(local)).origin,'https://issuer.test');
  assert.equal(new URL(location(local)).searchParams.get('redirect_uri'),`http://localhost:5175${GOOGLE_CALLBACK_PATH}`);
  // Loopback development sets no Secure attribute.
  assert.doesNotMatch(cookieFrom(local,FLOW_COOKIE)?.raw??'',/Secure/);
  assert.equal(store.flows.size,1);

  const wrongPort=await startPOST(startRequest({intent:'signin'},{origin:'http://localhost:4000'}));
  assert.equal(location(wrongPort),'/access?google=unavailable');
  assert.equal(store.flows.size,1,'the unavailable host wrote nothing');
 });
});

test('linking needs a signed-in session and nothing else (D1: no password re-entry)',async()=>{
 await withGoogle({},async({store})=>{
  const signedOut=await startPOST(startRequest({intent:'link'}));
  assert.equal(location(signedOut),'/access?google=mismatch');
  assert.equal(store.flows.size,0);

  const member=addMember(store,memberOf('member-1',GOOGLE_EMAIL),await hashPassword(PASSWORD));
  const cookie=await signedInCookie(member);
  // A stray currentPassword field is ignored, wrong or not: the session is the proof.
  const withWrong=await startPOST(startRequest({intent:'link',currentPassword:'not-the-password'},{cookie}));
  assert.equal(new URL(location(withWrong)).origin,'https://issuer.test');
  const accepted=await startPOST(startRequest({intent:'link'},{cookie}));
  assert.equal(new URL(location(accepted)).origin,'https://issuer.test');
  assert.equal(store.flows.size,2);
 });
});

// ------------------------------------------------------------------ callback

test('a cancelled sign-in clears the flow and writes nothing, and cannot be replayed',async()=>{
 await withGoogle({},async({store})=>{
  const start=await startPOST(startRequest({intent:'signin'}));
  const flowToken=cookieFrom(start,FLOW_COOKIE)?.value??'';
  const cancelled=await callbackGET(new Request(`${CRC_ORIGIN}${GOOGLE_CALLBACK_PATH}?error=access_denied&state=x`,{headers:{Cookie:`${FLOW_COOKIE}=${flowToken}`}}));
  assert.equal(cancelled.status,303);
  assert.equal(location(cancelled),'/access?google=cancelled');
  assert.match(cookieFrom(cancelled,FLOW_COOKIE)?.raw??'',/Max-Age=0/);
  assert.equal(cookieFrom(cancelled,ACCESS_COOKIE),null);
  assert.equal(store.flows.size,0);
  assert.equal(store.sessions.size,0);
  assert.equal(store.identities.size,0);
  assert.equal(store.members.size,1);

  // The flow row is gone, so a second arrival is a mismatch rather than a sign-in.
  const replay=await callbackGET(new Request(`${CRC_ORIGIN}${GOOGLE_CALLBACK_PATH}?code=c&state=x`,{headers:{Cookie:`${FLOW_COOKIE}=${flowToken}`}}));
  assert.equal(location(replay),'/access?google=mismatch');
 });
});

test('a callback without the flow cookie is a mismatch',async()=>{
 await withGoogle({},async({store})=>{
  const response=await callbackGET(new Request(`${CRC_ORIGIN}${GOOGLE_CALLBACK_PATH}?code=c&state=x`));
  assert.equal(location(response),'/access?google=mismatch');
  assert.equal(cookieFrom(response,ACCESS_COOKIE),null);
  assert.equal(store.sessions.size,0);
 });
});

test('a linked member signs in with a google session; an unlinked one writes nothing',async()=>{
 await withGoogle({},async({store,issuer})=>{
  // Unlinked first: an email that matches a member is still no access.
  addMember(store,memberOf('member-1',GOOGLE_EMAIL));
  const refused=await throughGoogle(issuer,await startPOST(startRequest({intent:'signin'})));
  assert.equal(location(refused),'/access?google=no_access');
  assert.equal(cookieFrom(refused,ACCESS_COOKIE),null);
  assert.equal(store.sessions.size,0);
  assert.equal(store.identities.size,0);

  await store.linkIdentity('member-1',identityOf(),1);
  const response=await throughGoogle(issuer,await startPOST(startRequest({intent:'signin'})));
  assert.equal(location(response),'/access?google=signed_in');
  const session=cookieFrom(response,ACCESS_COOKIE);
  assert.ok(session);
  assert.match(session.raw,/SameSite=Strict/);
  assert.equal(store.sessions.get(tokenHash(session.value))?.authMethod,'google');
  assert.equal(store.members.size,2,'nothing ever creates a member');
  assert.match(cookieFrom(response,FLOW_COOKIE)?.raw??'',/Max-Age=0/);

  // A removed member is told so, and gets no session.
  store.members.set('member-1',{...memberOf('member-1',GOOGLE_EMAIL),enabled:false,passwordHash:null,createdAt:1});
  const removed=await throughGoogle(issuer,await startPOST(startRequest({intent:'signin'})));
  assert.equal(location(removed),'/access?google=removed');
  assert.equal(cookieFrom(removed,ACCESS_COOKIE),null);
  assert.equal(store.sessions.size,1,'no second session');
 });
});

test('linking a verified matching address binds the identity without a new session',async()=>{
 await withGoogle({},async({store,issuer})=>{
  const member=addMember(store,memberOf('member-1',GOOGLE_EMAIL));
  const cookie=await signedInCookie(member);
  const response=await throughGoogle(issuer,await startPOST(startRequest({intent:'link'},{cookie})));
  assert.equal(location(response),'/access?google=linked');
  assert.equal(cookieFrom(response,ACCESS_COOKIE),null,'linking never mints a second session');
  assert.deepEqual(await store.identityForMember('member-1'),{provider:'google',email:GOOGLE_EMAIL,linkedAt:store.identities.values().next().value?.linkedAt??0,lastUsedAt:null});
  assert.equal(store.members.size,2);
 });
});

test('redeeming with Google redeems the invitation, binds the identity and keeps an invite session',async()=>{
 await withGoogle({},async({store,issuer})=>{
  const inviteToken=accessToken();
  await store.invite(GOOGLE_EMAIL,'Invited Editor','editor',tokenHash(inviteToken),Date.now()+3600_000);
  assert.equal(store.members.size,2);
  const response=await throughGoogle(issuer,await startPOST(startRequest({intent:'redeem',token:inviteToken})));
  assert.equal(location(response),'/access?google=signed_in');
  const session=cookieFrom(response,ACCESS_COOKIE);
  assert.ok(session);
  const stored=store.sessions.get(tokenHash(session.value));
  assert.equal(stored?.authMethod,'invite','the invitation, not Google, granted the access');
  const member=store.members.get(stored?.memberId??'');
  assert.equal(member?.role,'editor');
  assert.equal(member?.enabled,true);
  assert.equal(store.identities.size,1);
  assert.equal(store.members.size,2,'nothing ever creates a member');
  assert.equal(store.links.get(tokenHash(inviteToken))?.usedAt!==null,true,'the link is spent');
 });
});

test('a redeem intent with a malformed invitation token never starts a flow',async()=>{
 await withGoogle({},async({store})=>{
  const response=await startPOST(startRequest({intent:'redeem',token:'too-short'}));
  assert.equal(location(response),'/access?google=invite_invalid');
  assert.equal(store.flows.size,0);
 });
});

// ------------------------------------------------------------------- confirm

async function heldFlow(store:MemoryAccessStore,flow:SignInFlow){
 const token=accessToken();
 await store.putSignInFlow(tokenHash(token),flow,flow.createdAt+10*60_000);
 return token;
}
const linkHold:SignInFlow={kind:'link',createdAt:Date.now(),codeVerifier:'verifier',state:'state',nonce:'nonce',redirectUri:`${CRC_ORIGIN}${GOOGLE_CALLBACK_PATH}`,memberId:'member-1',pending:{identity:{...identityOf('google-subject-9','personal@gmail.example'),emailVerified:false},status:'confirm'}};

test('confirm GET describes the held flow with both addresses and does not consume it',async()=>{
 await withGoogle({},async({store})=>{
  addMember(store,memberOf('member-1','owner@crc.example'));
  const token=await heldFlow(store,linkHold);
  const request=()=>new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{headers:{Cookie:`${FLOW_COOKIE}=${token}`}});
  const first=await confirmGET(request());
  assert.equal(first.status,200);
  assert.equal(first.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await first.json(),{kind:'link',accountEmail:'owner@crc.example',googleEmail:'personal@gmail.example'});
  // Peeking twice still works: the flow is put straight back under the same hash.
  assert.equal(store.flows.size,1);
  assert.equal((await confirmGET(request())).status,200);
  assert.equal(store.flows.size,1);

  const none=await confirmGET(new Request(`${CRC_ORIGIN}/api/auth/google/confirm`));
  assert.equal(none.status,404);
  assert.deepEqual(await none.json(),{error:'No Google sign-in is waiting.'});
 });
});

test('confirm GET names the invited address for a held redemption and 410s once it is gone',async()=>{
 await withGoogle({},async({store})=>{
  const inviteToken=accessToken();
  await store.invite('invited@crc.example','Invited Editor','editor',tokenHash(inviteToken),Date.now()+3600_000);
  const flow:SignInFlow={...linkHold,kind:'redeem',memberId:undefined,inviteHash:tokenHash(inviteToken)};
  const token=await heldFlow(store,flow);
  const request=()=>new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{headers:{Cookie:`${FLOW_COOKIE}=${token}`}});
  assert.deepEqual(await (await confirmGET(request())).json(),{kind:'redeem',invitedEmail:'invited@crc.example',googleEmail:'personal@gmail.example'});

  store.links.delete(tokenHash(inviteToken));
  const gone=await confirmGET(request());
  assert.equal(gone.status,410);
  assert.deepEqual(await gone.json(),{error:'This link has expired or was already used. Ask your administrator for a new link.'});
 });
});

test('confirm POST links on yes, discards on cancel, and always clears the flow cookie',async()=>{
 await withGoogle({},async({store})=>{
  const member=addMember(store,memberOf('member-1','owner@crc.example'));
  const session=await signedInCookie(member);
  const post=(token:string,decision:string,cookie=`${FLOW_COOKIE}=${token}; ${session}`)=>confirmPOST(new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{method:'POST',headers:{Origin:CRC_ORIGIN,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({decision})}));

  // Signed out (or removed) between the callback and the card: nothing is linked, the held flow is spent.
  const signedOut=await post(await heldFlow(store,linkHold),'link',`${FLOW_COOKIE}=${await heldFlow(store,linkHold)}`);
  assert.equal(signedOut.status,404);
  assert.equal(store.identities.size,0);
  assert.match(cookieFrom(signedOut,FLOW_COOKIE)?.raw??'',/Max-Age=0/);
  store.flows.clear();

  const cancelled=await post(await heldFlow(store,linkHold),'cancel');
  assert.equal(cancelled.status,200);
  assert.deepEqual(await cancelled.json(),{google:'cancelled'});
  assert.match(cookieFrom(cancelled,FLOW_COOKIE)?.raw??'',/Max-Age=0/);
  assert.equal(store.flows.size,0);
  assert.equal(store.identities.size,0);

  const linked=await post(await heldFlow(store,linkHold),'link');
  assert.deepEqual(await linked.json(),{google:'linked'});
  assert.equal(store.identities.size,1);
  assert.equal(store.flows.size,0);
  assert.equal(cookieFrom(linked,ACCESS_COOKIE),null);

  const crossSite=await confirmPOST(new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({decision:'link'})}));
  assert.equal(crossSite.status,403);
  const noFlow=await post(accessToken(),'link');
  assert.equal(noFlow.status,404);
 });
});

// ----------------------------------------------------------------- /api/access

test('GET /api/access reports Google availability signed out and the link state signed in',async()=>{
 await withGoogle({},async({store})=>{
  const signedOut=await accessGET(new Request(`${CRC_ORIGIN}/api/access`));
  assert.equal(signedOut.status,401);
  assert.deepEqual(await signedOut.json(),{user:null,googleSignIn:{available:true,reason:null}});

  const member=addMember(store,memberOf('member-1',GOOGLE_EMAIL),await hashPassword(PASSWORD));
  const cookie=await signedInCookie(member);
  const before=await accessGET(new Request(`${CRC_ORIGIN}/api/access`,{headers:{Cookie:cookie}}));
  const beforeBody=await before.json();
  assert.deepEqual(beforeBody.user.google,{linked:false,email:null});
  assert.equal(beforeBody.user.hasPassword,true);
  assert.deepEqual(beforeBody.googleSignIn,{available:true,reason:null});

  await store.linkIdentity('member-1',identityOf(),1);
  const after=await accessGET(new Request(`${CRC_ORIGIN}/api/access`,{headers:{Cookie:cookie}}));
  assert.deepEqual((await after.json()).user.google,{linked:true,email:GOOGLE_EMAIL});
 });
 // A preview host says why the button is disabled.
 await withGoogle({},async()=>{
  const preview=await accessGET(new Request('https://crc-overlays-git-x.vercel.app/api/access'));
  assert.deepEqual((await preview.json()).googleSignIn,{available:false,reason:'preview'});
 });
 await withGoogle({GOOGLE_OAUTH_CLIENT_ID:undefined,GOOGLE_OAUTH_CLIENT_SECRET:undefined},async()=>{
  const off=await accessGET(new Request(`${CRC_ORIGIN}/api/access`));
  assert.deepEqual((await off.json()).googleSignIn,{available:false,reason:'unconfigured'});
 });
});

test('unlink_google is blocked without a password and allowed with one',async()=>{
 await withGoogle({},async({store})=>{
  const member=addMember(store,memberOf('member-1',GOOGLE_EMAIL));
  await store.linkIdentity('member-1',identityOf(),1);
  const cookie=await signedInCookie(member);

  const blocked=await accessPOST(accessRequest({action:'unlink_google'},cookie));
  assert.equal(blocked.status,409);
  assert.deepEqual(await blocked.json(),{error:'Set a password first so you can still sign in.'});
  assert.equal(store.identities.size,1);

  store.members.set('member-1',{...member,passwordHash:await hashPassword(PASSWORD),createdAt:1});
  const allowed=await accessPOST(accessRequest({action:'unlink_google'},cookie));
  assert.equal(allowed.status,200);
  assert.deepEqual((await allowed.json()).user.google,{linked:false,email:null});
  assert.equal(store.identities.size,0);

  const signedOut=await accessPOST(accessRequest({action:'unlink_google'}));
  assert.equal(signedOut.status,401);
 });
});

// --------------------------------------------------------------- audit fixes

test('a held confirmation stays valid for its own ten minutes, however long Google took before it',async()=>{
 await withGoogle({},async({store})=>{
  const member=addMember(store,memberOf('member-1','owner@crc.example'));
  const now=Date.now();
  // The flow started nine minutes ago; the callback held it with a fresh ten minutes from now.
  const token=accessToken();
  await store.putSignInFlow(tokenHash(token),{...linkHold,createdAt:now-9*60_000},now+10*60_000,now);
  const request=()=>new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{headers:{Cookie:`${FLOW_COOKIE}=${token}`}});
  assert.equal((await confirmGET(request())).status,200);
  assert.equal((await confirmGET(request())).status,200,'rendering the card never shortens the hold');
  assert.equal(store.flows.size,1);
  const linked=await confirmPOST(new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{method:'POST',headers:{Origin:CRC_ORIGIN,'Content-Type':'application/json',Cookie:`${FLOW_COOKIE}=${token}; ${await signedInCookie(member)}`},body:JSON.stringify({decision:'link'})}));
  assert.deepEqual(await linked.json(),{google:'linked'});
  assert.equal(store.identities.size,1);
 });
});

test('a member removed while the card is open is told so and nothing is linked',async()=>{
 await withGoogle({},async({store})=>{
  const member=addMember(store,memberOf('member-1','owner@crc.example'));
  const session=await signedInCookie(member);
  const token=await heldFlow(store,linkHold);
  store.members.get('member-1')!.enabled=false;
  const response=await confirmPOST(new Request(`${CRC_ORIGIN}/api/auth/google/confirm`,{method:'POST',headers:{Origin:CRC_ORIGIN,'Content-Type':'application/json',Cookie:`${FLOW_COOKIE}=${token}; ${session}`},body:JSON.stringify({decision:'link'})}));
  // The session itself no longer resolves for a disabled member, so the card is simply gone.
  assert.equal(response.status,404);
  assert.equal(store.identities.size,0);
  assert.equal(store.flows.size,0);
 });
});

test('the start route rate limit ignores client-set forwarding headers',async()=>{
 await withGoogle({},async({store})=>{
  const attempt=(i:number)=>startPOST(new Request(`${CRC_ORIGIN}/api/auth/google/start`,{method:'POST',headers:{Origin:CRC_ORIGIN,'Content-Type':'application/x-www-form-urlencoded','x-forwarded-for':`10.0.0.${i}`,'x-real-ip':`10.0.0.${i}`},body:'intent=signin'}));
  for(let i=1;i<=10;i++)assert.equal((await attempt(i)).status,303,`attempt ${i} starts a flow`);
  const eleventh=await attempt(11);
  assert.equal(eleventh.status,429,'rotating the header does not buy a new bucket');
  assert.equal(store.flows.size,10);
 });
});

test('a member who already holds a Google link is sent back to the account page instead of starting a second link',async()=>{
 await withGoogle({},async({store})=>{
  const member=addMember(store,memberOf('member-1','owner@crc.example'),await hashPassword(PASSWORD));
  await store.linkIdentity('member-1',identityOf('google-subject-held','owner@crc.example'),Date.now());
  const response=await startPOST(startRequest({intent:'link'},{cookie:await signedInCookie(member)}));
  assert.equal(location(response),'/access');
  assert.equal(store.flows.size,0,'no flow is started');
  assert.equal(store.identities.size,1,'the existing link is untouched');
 });
});
