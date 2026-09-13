/**
 * Rehearsal mode (S4). One place decides whether this process is running the local,
 * agent-facing rehearsal: memory stores for every request path, and an in-process relay
 * stub instead of Cloudflare.
 *
 * Rehearsal is fail-closed. Asking for it (`CRC_AUTHORING_REHEARSAL=1`) anywhere that is
 * not local development, or alongside a real relay, is an error rather than a silent
 * downgrade to Postgres — a rehearsal process must never hold production credentials.
 */

import {AuthoringError} from './authoring-model';

/** The sentinel `RELAY_URL` that selects the in-process relay stub. */
export const REHEARSAL_RELAY='memory';

const DEFAULT_REHEARSAL_RELAY_PORT='8788';

export type RehearsalEnv=Partial<Pick<NodeJS.ProcessEnv,'CRC_AUTHORING_REHEARSAL'|'NODE_ENV'|'RELAY_URL'|'VERCEL'|'CRC_REHEARSAL_RELAY_PORT'>>;

/** True when `RELAY_URL` names a real relay rather than the in-process stub. */
export function liveRelayConfigured(env:RehearsalEnv=process.env):boolean{
 return Boolean(env.RELAY_URL)&&env.RELAY_URL!==REHEARSAL_RELAY;
}

/**
 * True only for a local rehearsal process: the flag is set, this is development, this is
 * not a Vercel deployment, and no live relay is configured.
 */
export function rehearsalMode(env:RehearsalEnv=process.env):boolean{
 return env.CRC_AUTHORING_REHEARSAL==='1'&&env.NODE_ENV==='development'&&!env.VERCEL&&!liveRelayConfigured(env);
}

/** Origin of the in-process relay stub. Loopback only; the port is digits or the default. */
export function rehearsalRelayOrigin(env:RehearsalEnv=process.env){
 const raw=env.CRC_REHEARSAL_RELAY_PORT??'';
 const port=/^\d{1,5}$/.test(raw)&&Number(raw)>0?raw:DEFAULT_REHEARSAL_RELAY_PORT;
 return `http://127.0.0.1:${port}`;
}

/**
 * Throws when rehearsal was requested but the environment cannot safely provide it
 * (production, a Vercel deployment, or a live relay). Silent about a process that never
 * asked for rehearsal.
 */
export function assertRehearsalAllowed(env:RehearsalEnv=process.env){
 if(env.CRC_AUTHORING_REHEARSAL!=='1')return;
 if(!rehearsalMode(env))throw new AuthoringError('unsafe_rehearsal_config','In-memory authoring is allowed only in development with no live relay configured',503);
}
