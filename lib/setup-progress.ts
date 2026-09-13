/**
 * Per-member setup progress (X4-7). Each /setup step records its own completion so a
 * returning installer sees where they left off. Progress is deliberately advisory: it
 * never gates a control, and a member who has no row simply starts at the beginning.
 *
 * Legacy control/output keys are not members, so they have no row and nothing to save;
 * the route reports that with persisted:false rather than inventing a member identity.
 */

import {rehearsalMode} from './rehearsal';

export const SETUP_STEP_KEY=/^[a-z][a-z0-9-]{0,40}$/;
export const MAX_SETUP_STEPS=32;

export type SetupSteps=Record<string,boolean>;

export class SetupProgressError extends Error{constructor(message:string){super(message)}}

export interface SetupProgressStore{
 get(memberId:string):Promise<SetupSteps>;
 set(memberId:string,steps:SetupSteps,now:number):Promise<void>;
}

/** Accepts only a flat object of at most 32 boolean steps with safe, stable keys. */
export function parseSetupSteps(value:unknown):SetupSteps{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SetupProgressError('Setup progress must be an object of completed steps.');
 const entries=Object.entries(value as Record<string,unknown>);
 if(entries.length>MAX_SETUP_STEPS)throw new SetupProgressError(`Setup progress may record at most ${MAX_SETUP_STEPS} steps.`);
 const steps:SetupSteps={};
 for(const [key,step] of entries){
  if(!SETUP_STEP_KEY.test(key))throw new SetupProgressError(`Setup step name is not recognized: ${key.slice(0,48)}`);
  if(typeof step!=='boolean')throw new SetupProgressError(`Setup step ${key} must be true or false.`);
  steps[key]=step;
 }
 return steps;
}

/** Merges a saved record with an incoming one, keeping the merge inside the same bounds. */
export function mergeSetupSteps(current:SetupSteps,incoming:SetupSteps):SetupSteps{
 const merged={...current,...incoming};
 if(Object.keys(merged).length>MAX_SETUP_STEPS)throw new SetupProgressError(`Setup progress may record at most ${MAX_SETUP_STEPS} steps.`);
 return merged;
}

/** Reads a stored jsonb document defensively: unknown or malformed keys are dropped, never thrown. */
export function readStoredSteps(value:unknown):SetupSteps{
 if(!value||typeof value!=='object'||Array.isArray(value))return {};
 const steps:SetupSteps={};
 for(const [key,step] of Object.entries(value as Record<string,unknown>)){
  if(SETUP_STEP_KEY.test(key)&&typeof step==='boolean')steps[key]=step;
  if(Object.keys(steps).length>=MAX_SETUP_STEPS)break;
 }
 return steps;
}

export class PgSetupProgressStore implements SetupProgressStore{
 private async db(){return (await import('./database')).db}
 async get(memberId:string){return readStoredSteps((await (await this.db()).query('SELECT steps FROM access_member_setup_progress WHERE member_id=$1',[memberId])).rows[0]?.steps)}
 async set(memberId:string,steps:SetupSteps,now:number){await (await this.db()).query('INSERT INTO access_member_setup_progress(member_id,steps,updated_at) VALUES($1,$2::jsonb,$3) ON CONFLICT(member_id) DO UPDATE SET steps=EXCLUDED.steps,updated_at=EXCLUDED.updated_at',[memberId,JSON.stringify(steps),now])}
}

/** Used by tests and by local rehearsal, where no member table exists. */
export class MemorySetupProgressStore implements SetupProgressStore{
 rows=new Map<string,{steps:SetupSteps;updatedAt:number}>();
 async get(memberId:string){return {...(this.rows.get(memberId)?.steps??{})}}
 async set(memberId:string,steps:SetupSteps,now:number){this.rows.set(memberId,{steps:{...steps},updatedAt:now})}
}

export const setupProgressStore:SetupProgressStore=rehearsalMode()?new MemorySetupProgressStore():new PgSetupProgressStore();

/** Legacy Companion and output credentials resolve to these synthetic actors; they have no member row. */
export const LEGACY_ACTOR_IDS=new Set(['legacy-control','legacy-output']);
export const isLegacyActor=(id:string)=>LEGACY_ACTOR_IDS.has(id);
