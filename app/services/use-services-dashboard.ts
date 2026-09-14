'use client';

/**
 * X5 (Phase E) - the load/refresh/permission cycle both service pages run.
 *
 * Prepared services and Service log each read the same `get_dashboard` payload, treat a 401 as
 * a sign-in problem rather than a failure, and refresh after every write. That cycle lived in
 * the single page before the split; it lives here now so neither page carries a copy of it.
 */

import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchAccessUser} from '@/lib/access-client';
import {call,isUnauthorized,ServicesRequestError,type Dashboard,type Role} from './services-data';

type Options={includeArchived?:boolean;onData?:(data:Dashboard)=>void};

export function useServicesDashboard({includeArchived=false,onData}:Options={}){
 const [dashboard,setDashboard]=useState<Dashboard|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const [role,setRole]=useState<Role|undefined>(undefined),[needsSignIn,setNeedsSignIn]=useState(false);
 const received=useRef(onData);
 useEffect(()=>{received.current=onData});
 // A 401 is a sign-in problem, not a failure: it gets the shared card and no red error banner.
 const load=useCallback(async(archived=includeArchived)=>{setBusy(true);setError('');try{const data=await call<Dashboard>('get_dashboard',{includeArchived:archived});setNeedsSignIn(false);setDashboard(data);received.current?.(data)}catch(e){if(isUnauthorized(e))setNeedsSignIn(true);else setError(e instanceof Error?e.message:'Services unavailable')}finally{setBusy(false)}},[includeArchived]);
 useEffect(()=>{let current=true;call<Dashboard>('get_dashboard',{includeArchived}).then(data=>{if(!current)return;setNeedsSignIn(false);setDashboard(data);received.current?.(data);setError('')}).catch(error=>{if(!current)return;if(isUnauthorized(error))setNeedsSignIn(true);else setError(error instanceof Error?error.message:'Services unavailable')}).finally(()=>{if(current)setBusy(false)});void fetchAccessUser().then(value=>{if(current&&value)setRole(value.role as Role)});return()=>{current=false}},[includeArchived]);
 async function perform(work:()=>Promise<unknown>){setBusy(true);setError('');try{await work();await load();return true}catch(e){const message=e instanceof Error?e.message:'Request failed';
  // A version conflict leaves the client holding a stale version, so every retry would conflict again.
  // Refresh the saved collections only; in-progress form input lives in separate state and is retained.
  if(e instanceof ServicesRequestError&&e.code==='version_conflict'){try{await load()}catch{}}
  setError(message);return false}finally{setBusy(false)}}
 return {dashboard,error,setError,busy,role,needsSignIn,setNeedsSignIn,load,perform};
}
