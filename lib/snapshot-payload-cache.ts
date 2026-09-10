export type PayloadCache={revision:number;payload:unknown};
export type PayloadRow={revision:number;cuePayload?:unknown};
export const SNAPSHOT_STATE_SQL='SELECT revision,cue,mode,updated,CASE WHEN revision=$1 THEN NULL ELSE cue_payload END AS "cuePayload" FROM state WHERE id=1';

function immutable<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))immutable(child)}return value}

export function resolvePayload(captured:PayloadCache|null,row:PayloadRow){if(captured&&captured.revision===row.revision)return {payload:captured.payload,candidate:captured};const candidate={revision:row.revision,payload:immutable(row.cuePayload??null)};return {payload:candidate.payload,candidate}}
export function newestPayloadCache(current:PayloadCache|null,candidate:PayloadCache){return !current||candidate.revision>current.revision?candidate:current}
