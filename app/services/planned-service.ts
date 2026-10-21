/** A query id is an intent, never permission or a reason to choose a fallback. */
export function requestedSetlist(search:string):string|null{
 const params=new URLSearchParams(search),values=params.getAll('setlistId');
 if(!values.length)return null;
 return values.length===1&&/^[A-Za-z0-9_-]{1,160}$/.test(values[0])?values[0]:'';
}
export function plannedSelection(requested:string|null,list:readonly {id:string}[],suggested?:string|null){
 if(requested!==null)return {chosen:list.some(item=>item.id===requested)?requested:'',unavailable:!list.some(item=>item.id===requested)};
 return {chosen:list.some(item=>item.id===suggested)?suggested!:list[0]?.id??'',unavailable:false};
}
export function preparedMatches<T extends {origin?:{setlistId:string}|null}>(collections:readonly T[],setlistId:string):T[]{
 return setlistId?collections.filter(item=>item.origin?.setlistId===setlistId):[];
}
