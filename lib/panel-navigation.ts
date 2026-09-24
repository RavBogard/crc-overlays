/**
 * Next / previous panel on the server (MCP plan V3), ported from companion/src/panel.ts so an
 * agent steps a multipart set exactly as the Companion button does. The module keeps its own
 * copy (it ships as a separate package); tests/panel-navigation.test.ts holds the two equal on
 * the same cases.
 *
 * A multipart graphic is published as `<name> — 01 of 03`: an em dash with one space each side,
 * both numbers zero padded to one width. A set is one title inside one id namespace, so a names
 * list (`names:<collectionId>:NN`) never merges with a published set of the same title.
 */
const MULTIPART_NAME=/^(.+?) — (\d{1,4}) of (\d{1,4})$/;

export type PanelPosition={name:string;panel:string;count:string};
export type PanelCue={id:string;name:string;hidden?:boolean};

export function parsePanelName(value:unknown):PanelPosition|null{
 if(typeof value!=='string')return null;
 const match=MULTIPART_NAME.exec(value);
 if(!match)return null;
 const name=match[1]??'',panel=match[2]??'',count=match[3]??'';
 if(!name.trim()||!panel||!count)return null;
 const index=Number(panel),total=Number(count);
 if(!Number.isInteger(index)||!Number.isInteger(total)||index<1||total<index)return null;
 return {name:name.trim(),panel,count};
}

export function panelNamespace(cueId:string){
 if(!cueId.startsWith('names:'))return '';
 const lastColon=cueId.lastIndexOf(':');
 return lastColon<'names:'.length?'names:':cueId.slice(0,lastColon+1);
}

/**
 * The neighbour of the live cue inside its own set, wrapping at either end, or null when the live
 * cue is not a panel, is not in the catalog, or its neighbour is not published. Hidden cues are
 * not navigable, as on the deck: Next panel must not be the one path that puts one on air.
 */
export function panelNeighbour(cues:readonly PanelCue[],liveCue:string|null,step:1|-1){
 const visible=cues.filter(cue=>!cue.hidden);
 const live=liveCue?visible.find(cue=>cue.id===liveCue):undefined;
 const position=live?parsePanelName(live.name):null;
 if(!live||!position)return null;
 const total=Number(position.count),index=Number(position.panel),wrapped=((index-1+step+total)%total)+1,namespace=panelNamespace(live.id);
 const target=visible.find(cue=>{if(panelNamespace(cue.id)!==namespace)return false;const candidate=parsePanelName(cue.name);return candidate!==null&&candidate.name===position.name&&Number(candidate.panel)===wrapped})??null;
 return target?{from:{id:live.id,name:live.name,panel:position.panel,count:position.count},to:{id:target.id,name:target.name}}:null;
}
