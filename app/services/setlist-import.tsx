'use client';

/**
 * X5 (Phase E) reserves the place on Prepared services where G1's "Import from
 * centralreform.live" mounts (Phase D, D19). It renders nothing at all today: no copy, no
 * control, no request. G1 fills this component in; every other page keeps mounting it
 * unchanged.
 */

import type {Collection} from './services-data';

export type SetlistImportSlotProps={
 /** The open collection the import would add rows to, or undefined when none is open. */
 collection?:Collection;
 /** Refresh the dashboard after an import writes. */
 onImported:()=>void|Promise<unknown>;
};

export default function SetlistImportSlot(props:SetlistImportSlotProps){
 void props;
 return null;
}
