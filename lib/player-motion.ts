export type AnimationDirection='In'|'Out';
export type SingularEffect={effect?:string;property?:string;easing?:{easing?:string;inOut?:string}};
export type AnimationTrack={element:string;direction:string;effect?:SingularEffect;keyframes?:number[]};
export type PlayerState={cue:string|null;revision:number;mode:string};
export type TextPart={classes:string;text:string;element:string};

export const GROUPS:Record<string,string[]>={
 Image:['logoGroup'],
 textTitle:['titleGroup'],
 accentTextTitle:['titleGroup'],
 textMainEng:['EngText'],
 textMainheb:['HebText'],
};

export function tracksFor(element:string,direction:AnimationDirection,tracks:AnimationTrack[]){
 const names=new Set([element,...(GROUPS[element]||[])]);
 return tracks.filter(track=>track.direction===direction&&names.has(track.element)&&track.effect?.effect!=='none');
}

export function acceptsRevision(next:PlayerState,current:PlayerState){return next.revision>current.revision}
export function incomingStillDesired(incomingCue:string,desired:PlayerState){return incomingCue===desired.cue}

export function textParts(texts:Record<string,string>):TextPart[]{
 if(texts.textMain)return [{classes:'prayer combined single-channel',text:texts.textMain,element:'textMain'}];
 const parts:TextPart[]=[];
 if(texts.textMainEng)parts.push({classes:'prayer english',text:texts.textMainEng,element:'textMainEng'});
 if(texts.textMainheb)parts.push({classes:'prayer hebrew',text:texts.textMainheb,element:'textMainheb'});
 if(parts.length===1)parts[0].classes+=' single-channel';
 return parts;
}

export function measuredBottomTextHeight(heights:number[]){
 const measured=Math.max(0,...heights.filter(Number.isFinite));
 return Math.max(84,Math.ceil(measured));
}

function translate(property:string,distance:number){
 switch(property){
  case 'up':return `translateY(${distance}px)`;
  case 'down':return `translateY(${-distance}px)`;
  case 'left':return `translateX(${distance}px)`;
  case 'right':return `translateX(${-distance}px)`;
  default:return 'translate(0, 0)';
 }
}

export function effectFrames(effect:SingularEffect|undefined,direction:AnimationDirection,translatePx=48):Keyframe[]{
 const kind=effect?.effect||'fade';
 if(kind==='scale'){
  const hidden=effect?.property==='y'?'scaleY(0)':effect?.property==='xAndY'?'scale(0)':'scaleX(0)';
  return direction==='In'?[{transform:hidden},{transform:'scale(1)'}]:[{transform:'scale(1)'},{transform:hidden}];
 }
 if(kind==='translate'){
  const hidden=translate(effect?.property||'',translatePx);
  return direction==='In'?[{transform:hidden},{transform:'translate(0, 0)'}]:[{transform:'translate(0, 0)'},{transform:hidden}];
 }
 return direction==='In'?[{opacity:0},{opacity:1}]:[{opacity:1},{opacity:0}];
}

export function easingFor(effect:SingularEffect|undefined){
 const power=effect?.easing?.easing;
 const mode=effect?.easing?.inOut;
 if(mode==='in')return power==='power4'?'cubic-bezier(.75,0,1,.35)':power==='power3'?'cubic-bezier(.65,0,.9,.35)':'cubic-bezier(.5,0,.8,.3)';
 if(mode==='inOut')return 'cubic-bezier(.65,0,.35,1)';
 return power==='power4'?'cubic-bezier(0,.75,.15,1)':power==='power3'?'cubic-bezier(.1,.7,.2,1)':'cubic-bezier(.2,.8,.3,1)';
}
