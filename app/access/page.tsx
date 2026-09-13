'use client';

import {Check,Copy,KeyRound,LibraryBig,LoaderCircle,LogOut,MonitorUp,ShieldCheck,UserMinus,Users} from 'lucide-react';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import './access.css';

type Role='owner'|'editor'|'operator';
type Member={id:string;name:string;email:string;role:Role;enabled:boolean};
type ApiBody={user?:Member|null;members?:Member[];member?:Member;url?:string;error?:string};

const roleLabel:Record<Role,string>={owner:'Administrator',editor:'Editor',operator:'Operator'};

async function bodyOf(response:Response):Promise<ApiBody>{
 try{return await response.json() as ApiBody}catch{return {error:'The server returned an unreadable response.'}}
}

export default function AccessPage(){
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

 const notice=(text:string,kind:'error'|'success'='success')=>{setMessage(text);setMessageKind(kind)};

 const refresh=useCallback(async()=>{
  try{
   const response=await fetch('/api/access?manage=1',{cache:'no-store'});
   const body=await bodyOf(response);
   if(response.ok){setUser(body.user??null);setMembers(body.members??[]);return}
   if(response.status===403){
    const profileResponse=await fetch('/api/access',{cache:'no-store'});
    const profile=await bodyOf(profileResponse);
    if(profileResponse.ok){setUser(profile.user??null);setMembers([]);return}
    if(profileResponse.status===401){setUser(null);setMembers([]);return}
    throw Error(profile.error||'Your sign-in could not be checked.');
   }
   if(response.status===401){setUser(null);setMembers([]);return}
   throw Error(body.error||'Your sign-in could not be checked.');
  }catch(error){
   notice(error instanceof Error?error.message:'Your sign-in could not be checked.','error');
  }finally{setLoading(false)}
 },[]);

 useEffect(()=>{
  let active=true;
  async function initialize(){
   const params=new URLSearchParams(location.hash.slice(1));
   const inviteToken=params.get('invite')||'';
   if(inviteToken)history.replaceState(null,'',location.pathname+location.search);
   await Promise.resolve();
   if(!active)return;
   if(inviteToken)setToken(inviteToken);
   await refresh();
  }
  void initialize();
  return()=>{active=false};
 },[refresh]);

 async function act(payload:Record<string,unknown>){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const body=await bodyOf(response);
   if(!response.ok)throw Error(body.error||'This action could not be completed.');
   if(payload.action==='redeem'){
    setToken('');
    location.assign('/author');
    return;
   }
   if(payload.action==='logout'){
    setUser(null);setMembers([]);setInvite('');
    notice('Signed out on this browser.');
    return;
   }
   if(body.url){
    setInvite(body.url);
    setName('');setEmail('');setRole('editor');
    notice('Private sign-in link ready. It expires in 24 hours and works once.');
   }else if(body.user){
    setUser(body.user);
    notice('Administrator account ready.');
   }
   await refresh();
  }catch(error){
   notice(error instanceof Error?error.message:'Connection unavailable.','error');
  }finally{setBusy(false);setKey('')}
 }

 async function copyInvite(){
  try{await navigator.clipboard.writeText(invite);notice('Private sign-in link copied.')}
  catch{notice('Copy was blocked. Select the link below and copy it manually.','error')}
 }

 return <main className="access-page">
  <header className="access-header">
   <div className="access-brand"><span className="access-brand-mark"><LibraryBig size={20}/></span><span><small>CONGREGATION GRAPHICS</small><strong>Workspace access</strong></span></div>
   <Link href="/">Live control</Link>
  </header>

  <div className="access-stage">
   {message&&<div className={`access-notice ${messageKind}`} role={messageKind==='error'?'alert':'status'}><span>{messageKind==='success'?<Check size={16}/>:<ShieldCheck size={16}/>}</span>{message}</div>}

   {loading?<section className="access-card access-loading"><LoaderCircle className="spin" size={28}/><h1>Opening your workspace</h1><p>Checking this browser’s sign-in.</p></section>
   :token?<section className="access-card access-invitation">
    <span className="access-hero-icon"><KeyRound size={29}/></span><div className="access-eyebrow">PRIVATE INVITATION</div><h1>Open your workspace</h1>
    <p>This invitation works once. After you open it, this browser stays signed in for 30 days unless you sign out or an administrator removes your access.</p>
    <button className="access-primary" disabled={busy} onClick={()=>void act({action:'redeem',token})}>{busy?<><LoaderCircle className="spin" size={17}/>Opening…</>:<>Open workspace</>}</button>
   </section>
   :user?<div className="access-dashboard">
    <section className="access-welcome">
     <div><div className="access-eyebrow">SIGNED IN</div><h1>Welcome, {user.name}</h1><p>{roleLabel[user.role]} · This browser remains signed in for 30 days. Access is checked on every request.</p></div>
     <button className="access-quiet" disabled={busy} onClick={()=>void act({action:'logout'})}><LogOut size={16}/>Sign out</button>
    </section>
    <nav className="access-destinations" aria-label="Workspace destinations">
     <Link href="/author"><LibraryBig size={20}/><span><strong>Graphics library</strong><small>Create, review, and publish overlays</small></span></Link>
     <Link href="/setup"><MonitorUp size={20}/><span><strong>Set up this computer</strong><small>Connect Companion, Stream Deck, and video</small></span></Link>
    </nav>

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
    <span className="access-hero-icon"><KeyRound size={29}/></span><div className="access-eyebrow">WORKSPACE SIGN-IN</div><h1>Use your private link</h1>
    <p>Ask your congregation’s administrator for a private sign-in link. Opening it keeps this browser signed in for 30 days.</p>
    <div className="access-divider"><span>FIRST-TIME ADMINISTRATOR</span></div>
    <details><summary>Set up the first administrator</summary><p>This works once, before any administrator account exists.</p><form onSubmit={event=>{event.preventDefault();void act({action:'bootstrap',key,name,email})}}><label>Your name<input required value={name} onChange={event=>setName(event.target.value)} maxLength={80} autoComplete="name"/></label><label>Your email<input required type="email" value={email} onChange={event=>setEmail(event.target.value)} maxLength={200} autoComplete="email"/></label><label>Administrator setup key<input required type="password" autoComplete="off" value={key} onChange={event=>setKey(event.target.value)}/></label><button className="access-primary" disabled={busy}>{busy?<><LoaderCircle className="spin" size={17}/>Opening…</>:<>Create administrator account</>}</button></form></details>
   </section>}
  </div>
 </main>;
}
