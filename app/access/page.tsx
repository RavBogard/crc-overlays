'use client';

import {Check,Copy,KeyRound,LibraryBig,LoaderCircle,MonitorUp,ShieldCheck,UserMinus,Users} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useRef,useState} from 'react';
import './access.css';
import WorkspaceHeader from '@/components/workspace-header';
import {resetAccessUserCache} from '@/lib/access-client';
import {GOOGLE_UNLINKED_TEXT,googleBlockState,googleConfirmPrompt,googleNotice,readGoogleCode,type GoogleConfirmDetails,type GoogleSignInState} from './google-copy';

type Role='owner'|'editor'|'operator';
type Member={id:string;name:string;email:string;role:Role;enabled:boolean;hasPassword?:boolean;google?:{linked:boolean;email:string|null}};
type ApiBody={user?:Member|null;members?:Member[];member?:Member;url?:string;hasPassword?:boolean;error?:string;googleSignIn?:GoogleSignInState;google?:string};

const roleLabel:Record<Role,string>={owner:'Administrator',editor:'Editor',operator:'Operator'};

async function bodyOf(response:Response):Promise<ApiBody>{
 try{return await response.json() as ApiBody}catch{return {error:'The server returned an unreadable response.'}}
}

export default function AccessPage(){
 const router=useRouter();
 const [user,setUser]=useState<Member|null>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [token,setToken]=useState('');
 const [message,setMessage]=useState('');
 const [messageKind,setMessageKind]=useState<'error'|'success'>('success');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [invite,setInvite]=useState('');
 const [name,setName]=useState('');
 const [email,setEmail]=useState('');
 const [role,setRole]=useState<Role>('editor');
 const [key,setKey]=useState('');
 const [bootstrapPassword,setBootstrapPassword]=useState('');
 const [bootstrapConfirm,setBootstrapConfirm]=useState('');
 const [signInEmail,setSignInEmail]=useState('');
 const [signInPassword,setSignInPassword]=useState('');
 const [currentPassword,setCurrentPassword]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [googleSignIn,setGoogleSignIn]=useState<GoogleSignInState|null>(null);
 const [googleConfirm,setGoogleConfirm]=useState<GoogleConfirmDetails|null>(null);
 /** The `?google=` code taken from the URL, held until it has been acted on. A ref, not a local: React's development double-invoke re-runs the effect after the query is cleared, and the re-run must still see the code the first run took. */
 const googleReturn=useRef<ReturnType<typeof readGoogleCode>|undefined>(undefined);

 const notice=(text:string,kind:'error'|'success'='success')=>{setMessage(text);setMessageKind(kind)};

 const refresh=useCallback(async():Promise<Member|null>=>{
  try{
   const response=await fetch('/api/access?manage=1',{cache:'no-store'});
   const body=await bodyOf(response);
   if(response.ok){setUser(body.user??null);setMembers(body.members??[]);setGoogleSignIn(body.googleSignIn??null);return body.user??null}
   if(response.status===403){
    const profileResponse=await fetch('/api/access',{cache:'no-store'});
    const profile=await bodyOf(profileResponse);
    if(profileResponse.ok){setUser(profile.user??null);setMembers([]);setGoogleSignIn(profile.googleSignIn??null);return profile.user??null}
    if(profileResponse.status===401){setUser(null);setMembers([]);setGoogleSignIn(profile.googleSignIn??null);return null}
    throw Error(profile.error||'Your sign-in could not be checked.');
   }
   if(response.status===401){setUser(null);setMembers([]);setGoogleSignIn(body.googleSignIn??null);return null}
   throw Error(body.error||'Your sign-in could not be checked.');
  }catch(error){
   notice(error instanceof Error?error.message:'Your sign-in could not be checked.','error');
   return null;
  }finally{setLoading(false)}
 },[]);

 useEffect(()=>{
  let active=true;
  function captureInvitation(){
   const inviteToken=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
   if(!inviteToken)return;
   history.replaceState(null,'',location.pathname+location.search);
   if(active)setToken(inviteToken);
  }
  function captureGoogleReturn(){
   if(googleReturn.current===undefined){
    const code=readGoogleCode(location.search);
    // Read once: a reload must not replay the outcome.
    if(code)history.replaceState(null,'',location.pathname+location.hash);
    googleReturn.current=code;
   }
   return googleReturn.current;
  }
  async function openConfirmation(){
   try{
    const response=await fetch('/api/auth/google/confirm',{cache:'no-store'});
    const body=await response.json() as GoogleConfirmDetails&{error?:string};
    if(!active)return;
    if(!response.ok)throw Error(body.error||googleNotice('mismatch')!.text);
    setGoogleConfirm({kind:body.kind,accountEmail:body.accountEmail,invitedEmail:body.invitedEmail,googleEmail:body.googleEmail});
   }catch(error){
    if(active)notice(error instanceof Error?error.message:'Connection unavailable.','error');
   }
  }
  async function initialize(){
   captureInvitation();
   const code=captureGoogleReturn();
   await Promise.resolve();
   if(!active)return;
   const refreshed=await refresh();
   if(!active||!code)return;
   // Acted on exactly once: a cancelled run leaves it for the run that replaces it.
   googleReturn.current=null;
   if(code==='confirm'){await openConfirmation();return}
   if(code==='signed_in'){resetAccessUserCache();router.push('/author');return}
   const returned=googleNotice(code,{email:refreshed?.google?.email??null});
   if(returned)notice(returned.text,returned.kind);
  }
  addEventListener('hashchange',captureInvitation);
  void initialize();
  return()=>{active=false;removeEventListener('hashchange',captureInvitation)};
 },[refresh,router]);

 async function act(payload:Record<string,unknown>){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   // Sign-in, redemption and sign-out all change who the shared header and navigation see.
   resetAccessUserCache();
   const body=await bodyOf(response);
   if(!response.ok)throw Error(body.error||'This action could not be completed.');
   if(payload.action==='redeem'){
    setToken('');
    setUser(body.user??null);
    notice('Invitation accepted. Set a password below so you can sign in again later.');
    await refresh();
    return;
   }
   if(payload.action==='login'){
    setSignInPassword('');
    router.push('/author');
    return;
   }
   if(payload.action==='unlink_google'){
    if(body.user)setUser(body.user);
    notice(GOOGLE_UNLINKED_TEXT);
    await refresh();
    return;
   }
   if(body.url){
    setInvite(body.url);
    setName('');setEmail('');setRole('editor');
    notice('Private sign-in link ready. It expires in 24 hours and works once.');
   }else if(payload.action==='set_password'){
    setCurrentPassword('');setNewPassword('');setConfirmPassword('');setUser(previous=>previous?{...previous,hasPassword:true}:previous);
    notice('Password saved. You can use your email and password to sign in again. Other sessions and old invitation links were revoked.');
   }else if(body.user){
    setBootstrapPassword('');setBootstrapConfirm('');
    setUser(body.user);
    notice('Administrator account ready.');
   }
   await refresh();
  }catch(error){
   notice(error instanceof Error?error.message:'Connection unavailable.','error');
  }finally{setBusy(false);setKey('')}
 }

 async function decideGoogle(decision:'link'|'cancel'){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/auth/google/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision})});
   resetAccessUserCache();
   const body=await bodyOf(response);
   if(!response.ok)throw Error(body.error||'This action could not be completed.');
   setGoogleConfirm(null);
   const refreshed=await refresh();
   if(body.google==='signed_in'){router.push('/author');return}
   const returned=googleNotice(body.google,{email:refreshed?.google?.email??null});
   if(returned)notice(returned.text,returned.kind);
  }catch(error){
   notice(error instanceof Error?error.message:'Connection unavailable.','error');
  }finally{setBusy(false)}
 }

 async function copyInvite(){
  try{await navigator.clipboard.writeText(invite);notice('Private sign-in link copied.')}
  catch{notice('Copy was blocked. Select the link below and copy it manually.','error')}
 }

 const google=googleBlockState(googleSignIn);
 const googleReason=google.reason&&<p className="access-google-reason">{google.reason}</p>;

 return <main className="access-page">
  <WorkspaceHeader compact current="/access" title="Account" user={user?{name:user.name,role:user.role}:null}/>

  <div className="access-stage">
   {message&&<div className={`access-notice ${messageKind}`} role={messageKind==='error'?'alert':'status'}><span>{messageKind==='success'?<Check size={16}/>:<ShieldCheck size={16}/>}</span>{message}</div>}

   {loading?<section className="access-card access-loading"><LoaderCircle className="spin" size={28}/><h1>Opening your workspace</h1><p>Checking this browser’s sign-in.</p></section>
   :googleConfirm?<section className="access-card access-google-confirm">
    <span className="access-hero-icon"><ShieldCheck size={29}/></span><div className="access-eyebrow">GOOGLE SIGN-IN</div><h1>One more check</h1>
    <p>{googleConfirmPrompt(googleConfirm)}</p>
    <button className="access-primary" disabled={busy} onClick={()=>void decideGoogle('link')}>{busy?<><LoaderCircle className="spin" size={17}/>Working…</>:<>Link this Google account</>}</button>
    <button className="access-google-cancel" disabled={busy} onClick={()=>void decideGoogle('cancel')}>Cancel</button>
   </section>
   :token?<section className="access-card access-invitation">
    <span className="access-hero-icon"><KeyRound size={29}/></span><div className="access-eyebrow">PRIVATE INVITATION</div><h1>Open your workspace</h1>
    <p>This invitation works once. After you open it, this browser stays signed in for 30 days unless you sign out or an administrator removes your access.</p>
    {!google.hidden&&<><form className="access-google-form" method="post" action="/api/auth/google/start"><input type="hidden" name="intent" value="redeem"/><input type="hidden" name="token" value={token}/><button className="access-primary" disabled={google.disabled}>Continue with Google</button></form>{googleReason}</>}
    <button className="access-primary" disabled={busy} onClick={()=>void act({action:'redeem',token})}>{busy?<><LoaderCircle className="spin" size={17}/>Opening…</>:<>Open workspace</>}</button>
   </section>
   :user?<div className="access-dashboard">
    <section className="access-welcome">
     <div><div className="access-eyebrow">SIGNED IN</div><h1>Welcome, {user.name}</h1><p>{roleLabel[user.role]} · This browser remains signed in for 30 days. Access is checked on every request.</p></div>
    </section>
    <nav className="access-destinations" aria-label="Workspace destinations">
     <Link href="/author"><LibraryBig size={20}/><span><strong>Library</strong><small>Create, review, and publish overlays</small></span></Link>
     <Link href="/setup"><MonitorUp size={20}/><span><strong>Set up this computer</strong><small>Connect Companion, Stream Deck, and video</small></span></Link>
    </nav>

    <section className="access-panel access-password-panel">
     <div className="access-panel-heading"><span><KeyRound size={18}/></span><div><h2>{user.hasPassword?'Change your password':'Set a password'}</h2><p>{user.hasPassword?'Enter your current password, or open a fresh invitation link to reset it.':'Set this once so you can return without requesting another invitation.'} Use a password manager for ordinary sign-in.</p></div></div>
     <form onSubmit={event=>{event.preventDefault();if(newPassword!==confirmPassword){notice('The new passwords do not match.','error');return}void act({action:'set_password',currentPassword,newPassword})}}>
      {user.hasPassword&&<label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} minLength={12} maxLength={200}/></label>}
      <label>New password<input required type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} minLength={12} maxLength={200}/></label>
      <label>Confirm new password<input required type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} minLength={12} maxLength={200}/></label>
      <button className="access-primary" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/>Saving…</>:<>Save password</>}</button>
     </form>
    </section>

    {(user.google?.linked||!google.hidden)&&<section className="access-panel access-google-panel">
     <div className="access-panel-heading"><span><ShieldCheck size={18}/></span><div><h2>Google sign-in</h2><p>Sign in with your Google account instead of typing a password. Your password keeps working either way.</p></div></div>
     {user.google?.linked
      ?<div className="access-google-linked"><span>Linked as {user.google.email}</span><button disabled={busy} onClick={()=>void act({action:'unlink_google'})}>{busy?<><LoaderCircle className="spin" size={15}/>Working…</>:<>Unlink</>}</button></div>
      :<><form method="post" action="/api/auth/google/start">
        <input type="hidden" name="intent" value="link"/>
        <button className="access-primary" disabled={google.disabled}>Link Google account</button>
       </form>{googleReason}</>}
    </section>}

    {user.role==='owner'&&<div className="access-owner-grid">
     <section className="access-panel">
      <div className="access-panel-heading"><span><Users size={18}/></span><div><h2>Invite someone</h2><p>Create a private, one-time link. Nothing is sent automatically.</p></div></div>
      <form onSubmit={event=>{event.preventDefault();void act({action:'invite',name,email,role})}}>
       <label>Name<input required value={name} onChange={event=>setName(event.target.value)} maxLength={80} autoComplete="name"/></label>
       <label>Email<input required type="email" value={email} onChange={event=>setEmail(event.target.value)} maxLength={200} autoComplete="email"/></label>
       <label>Access<select value={role} onChange={event=>setRole(event.target.value as Role)}><option value="editor">Editor — create, publish, and operate</option><option value="operator">Operator — use approved graphics</option><option value="owner">Administrator — manage people and graphics</option></select></label>
       <button className="access-primary" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/>Preparing…</>:<>Create private link</>}</button>
      </form>
      {invite&&<div className="invite-result"><div><strong>Ready to share</strong><small>Expires in 24 hours · works once</small></div><button onClick={()=>void copyInvite()}><Copy size={15}/>Copy link</button><input aria-label="Private sign-in link" readOnly value={invite} onFocus={event=>event.currentTarget.select()}/></div>}
     </section>

     <section className="access-panel member-panel">
      <div className="access-panel-heading"><span><ShieldCheck size={18}/></span><div><h2>People with access</h2><p>Removing access invalidates that person’s sessions and links.</p></div></div>
      <div className="member-list">{members.length?members.map(member=><article className="member-row" key={member.id}><div className="member-avatar" aria-hidden>{member.name.slice(0,1).toUpperCase()}</div><div><strong>{member.name}</strong><small>{member.email}</small><span>{roleLabel[member.role]} · {member.enabled?'Enabled':'Disabled'}</span></div>{member.enabled&&member.id!==user.id&&<button className="member-remove" disabled={busy} onClick={()=>void act({action:'disable',memberId:member.id})} aria-label={`Remove ${member.name}`}><UserMinus size={16}/><span>Remove</span></button>}</article>):<p className="member-empty">No members to show.</p>}</div>
     </section>
    </div>}
   </div>
   :<section className="access-card">
    <span className="access-hero-icon"><KeyRound size={29}/></span><div className="access-eyebrow">WORKSPACE SIGN-IN</div><h1>Sign in again</h1>
    <p>Use the email and password you set on your account. Your password manager can fill these in.</p>
    {!google.hidden&&<><form className="access-google-form" method="post" action="/api/auth/google/start"><input type="hidden" name="intent" value="signin"/><button className="access-primary" disabled={google.disabled}>Continue with Google</button></form>{googleReason}<div className="access-divider"><span>OR USE A PASSWORD</span></div></>}
    <form onSubmit={event=>{event.preventDefault();void act({action:'login',email:signInEmail,password:signInPassword})}}><label>Email<input required type="email" autoComplete="email" value={signInEmail} onChange={event=>setSignInEmail(event.target.value)} maxLength={200}/></label><label>Password<input required type="password" autoComplete="current-password" value={signInPassword} onChange={event=>setSignInPassword(event.target.value)} minLength={12} maxLength={200}/></label><button className="access-primary" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/>Signing in…</>:<>Sign in</>}</button></form>
    <div className="access-divider"><span>INVITATION OR RESET</span></div><p>First visit or forgot your password? Ask your congregation’s administrator for a private, one-time invitation link.</p>
    <div className="access-divider"><span>FIRST-TIME ADMINISTRATOR</span></div>
    <details><summary>Set up the first administrator</summary><p>This works once, before any administrator account exists. Choose a password now so you can sign in even if this browser closes during setup.</p><form onSubmit={event=>{event.preventDefault();if(bootstrapPassword!==bootstrapConfirm){notice('The passwords do not match.','error');return}void act({action:'bootstrap',key,name,email,newPassword:bootstrapPassword})}}><label>Your name<input required value={name} onChange={event=>setName(event.target.value)} maxLength={80} autoComplete="name"/></label><label>Your email<input required type="email" value={email} onChange={event=>setEmail(event.target.value)} maxLength={200} autoComplete="email"/></label><label>Administrator setup key<input required type="password" autoComplete="off" value={key} onChange={event=>setKey(event.target.value)}/></label><label>Your password<input required type="password" autoComplete="new-password" minLength={12} maxLength={200} value={bootstrapPassword} onChange={event=>setBootstrapPassword(event.target.value)}/></label><label>Confirm your password<input required type="password" autoComplete="new-password" minLength={12} maxLength={200} value={bootstrapConfirm} onChange={event=>setBootstrapConfirm(event.target.value)}/></label><button className="access-primary" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/>Opening…</>:<>Create administrator account</>}</button></form></details>
   </section>}
  </div>
 </main>;
}
