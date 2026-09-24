/**
 * /setup as each operator's exact install flow (docs/planning/2026-09-24-tbi-setup-page/PLAN.md).
 * One component renders both pages; the steps are per-workspace data, so each congregation's page is
 * its operator's flow and nothing else. Simone (TBI) does a full reset onto a pre-paired personal
 * file; Michael (CRC) replaces pages, triggers and custom variables and keeps his connections.
 *
 * Menu words are Companion 5's own ("Import / Export", "Full Reset & Import", "Import Preserving
 * Unselected"; companion-src webui/src/ImportExport/Import/Full.tsx). `**bold**` marks a word the
 * operator looks for on screen. Pure data and pure helpers: no DOM, no network.
 */

export type SetupFlowId='tbi'|'crc';

export type SetupLink={label:string;href:string};

/**
 * What the page picks from the stored deck for the press test. `layout` matches the published cue's
 * layout, `sequence` the first key of a multi-panel set, `pages` a page-number range, `slot` a slot
 * graphic (lib/slots.ts), `pageName` the page's name exactly.
 */
export type TestPick={what:string;layout?:string;sequence?:boolean;pages?:[number,number];pageName?:string;slot?:boolean};

export type SetupBlock=
 |{kind:'module'}
 |{kind:'companion-update';href:string;release:string}
 |{kind:'personal-deck';label:string}
 |{kind:'pairing'}
 |{kind:'graphics-url';app:'OBS'|'vMix';source:string}
 |{kind:'label-check'}
 |{kind:'press-test';picks:TestPick[];byEye:string[];more?:SetupLink}
 |{kind:'links';links:SetupLink[]};

/**
 * How a step is ticked. `companion` and `renderer` tick from /api/state presence, `personal-checkin`
 * when the personal file's token (or a code paired here) first checks in, `press` from a rendered
 * Companion press, `download` when the personal file is saved, `manual` by the operator.
 */
export type SetupVerify='manual'|'download'|'companion'|'personal-checkin'|'renderer'|'press'|'none';

export type SetupStep={key:string;kicker:string;title:string;text:string[];blocks:SetupBlock[];verify:SetupVerify};

export type SetupFlow={
 id:SetupFlowId;
 /** Whose Companion this is: the personal file and its device token carry the name. */
 operator:string;
 intro:string;
 /** Companion's release both installs run (5.0.5, 3 Sept 2026) and Bitfocus's download page. */
 companion:{release:string;download:string};
 /** Connection labels whose backup values the personal file carries. */
 valueLabels:'deck'|string[];
 /** Deck connections that carry no values (CRC's legacy obs connection). */
 noValues:string[];
 /** A full reset imports each connection as the file says, so a filled one should arrive enabled; a merge keeps the booth's own. */
 enableFilled:boolean;
 steps:SetupStep[];
 goingBack:string[];
};

export const COMPANION_DOWNLOAD='https://bitfocus.io/companion';
const COMPANION_RELEASE='5.0.5';

const TBI:SetupFlow={
 id:'tbi',
 operator:'Simone',
 intro:'About 15 minutes, on the computer that runs Companion and OBS, signed in. Needs Companion 5 (you are on 5.0.5).',
 companion:{release:COMPANION_RELEASE,download:COMPANION_DOWNLOAD},
 valueLabels:['obs','Birddog'],
 noValues:[],
 enableFilled:true,
 steps:[
  {key:'backup',kicker:'Before anything',title:'Back up',verify:'manual',blocks:[],text:[
   'In Companion: **Import / Export**, **Export**, full configuration. Save the file.',
   'In OBS: open the browser source that shows your Singular graphics and copy its URL somewhere safe.',
   'Both are what Going back uses.',
  ]},
  {key:'module',kicker:'Companion',title:'Install the module',verify:'manual',blocks:[{kind:'module'}],text:[
   'In Companion: **Modules**, **Import module package**, this file.',
   'Before step 4, or the deck’s buttons import against a module Companion lacks.',
  ]},
  {key:'deck-download',kicker:'Companion',title:'Download your Companion',verify:'download',blocks:[{kind:'personal-deck',label:'TBI Companion for Simone'}],text:[
   'Already paired; your OBS and camera settings are included. Treat it like a password.',
   'The OBS and camera settings are from your 14 September backup. If you have changed the OBS WebSocket password or the camera’s address since, that connection shows disconnected after the import: correct the one field in it.',
  ]},
  {key:'import',kicker:'Companion',title:'Import it over everything',verify:'personal-checkin',blocks:[{kind:'pairing'}],text:[
   '**Import / Export**, **Import**, the file, then **Full Reset & Import**.',
   'This step ticks itself when the new connection checks in.',
  ]},
  {key:'graphics',kicker:'OBS',title:'Point OBS at TBI',verify:'renderer',blocks:[{kind:'graphics-url',app:'OBS',source:'the browser source that shows your Singular graphics'}],text:[
   'Paste it as the URL of that same browser source. Nothing else in OBS changes.',
   'This step ticks itself when the graphics browser connects.',
  ]},
  {key:'test',kicker:'Stream Deck',title:'Test',verify:'press',text:[
   'Press these. Each press shows below as it arrives, with whether it rendered.',
  ],blocks:[{kind:'press-test',picks:[
   {what:'A lower third',layout:'lower-third'},
   {what:'A panel set: panel 1, then panel 2 below it',sequence:true},
   {what:'A High Holy Day graphic',pages:[95,99]},
  ],byEye:['One camera button: the camera moves.','One OBS scene button: OBS switches scene.']}]},
  {key:'graphics-links',kicker:'Your graphics',title:'Your graphics',verify:'none',text:[],blocks:[{kind:'links',links:[
   {label:'Review board',href:'review-board'},
   {label:'Library',href:'/author'},
   {label:'Recent publications',href:'/author/publications'},
  ]}]},
 ],
 goingBack:[
  'In Companion: **Import / Export**, **Import**, your backup, **Full Reset & Import**.',
  'In OBS: paste your old Singular URL back into the browser source.',
  'You are exactly where you were.',
 ],
};

const CRC:SetupFlow={
 id:'crc',
 operator:'Michael',
 intro:'About 20 minutes, on the booth machine, signed in. Your connections stay exactly as they are; the file replaces buttons, triggers and custom variables only.',
 companion:{release:COMPANION_RELEASE,download:COMPANION_DOWNLOAD},
 valueLabels:'deck',
 noValues:['obs'],
 enableFilled:false,
 steps:[
  {key:'backup',kicker:'Before anything',title:'Back up',verify:'manual',blocks:[],text:[
   'In Companion: **Import / Export**, **Export**, full configuration. Save the file.',
   'In vMix: open the Web Browser input that shows Singular and copy its URL somewhere safe.',
  ]},
  {key:'update',kicker:'Companion',title:'Update Companion to 5.0.5',verify:'manual',blocks:[{kind:'companion-update',href:COMPANION_DOWNLOAD,release:COMPANION_RELEASE}],text:[
   'Install 5.0.5 over 5.0.3; it keeps your configuration. Confirm the version in Companion’s header.',
   'The backup comes first, so the update is covered by Going back too.',
  ]},
  {key:'module',kicker:'Companion',title:'Install the module',verify:'manual',blocks:[{kind:'module'}],text:[
   '**Modules**, **Import module package**, this file; set the Overlays connection to 1.7.0.',
  ]},
  {key:'labels',kicker:'Companion',title:'Check the labels',verify:'manual',blocks:[{kind:'label-check'}],text:[
   'The deck matches your connections by label. Compare this list with **Connections** and rename any that differ.',
  ]},
  {key:'deck-download',kicker:'Companion',title:'Download your deck',verify:'download',blocks:[{kind:'personal-deck',label:'CRC deck'}],text:[
   'Already paired. Your live connections win on import; the settings in the file are only the fallback.',
  ]},
  {key:'import',kicker:'Companion',title:'Import it',verify:'manual',blocks:[],text:[
   '**Import / Export**, **Import**, the file. Under Components, turn on **Buttons**, **Triggers** and **Custom Variables** only, then **Import Preserving Unselected**. Connections stay unchanged.',
   'Then check **Connections** shows no new, disabled connection (the sign to go back). Set both Stream Decks to page 1.',
  ]},
  {key:'pair',kicker:'Companion',title:'Pair, only if needed',verify:'companion',blocks:[{kind:'pairing'}],text:[
   'This step ticks itself when the Overlays connection checks in.',
  ]},
  {key:'graphics',kicker:'vMix',title:'Point vMix at CRC Overlays',verify:'renderer',blocks:[{kind:'graphics-url',app:'vMix',source:'the Web Browser input that shows Singular'}],text:[
   'Paste it as the URL of that same Web Browser input.',
   'This step ticks itself when the graphics browser connects.',
  ]},
  {key:'test',kicker:'Stream Deck',title:'Test',verify:'press',text:[
   'Press these. Each press shows below as it arrives, with whether it rendered.',
  ],blocks:[{kind:'press-test',picks:[
   {what:'A Fri 1 lower third',layout:'lower-third',pageName:'Fri 1'},
   {what:'A panel chain: panel 1, then the next key down',sequence:true},
   {what:'A slot graphic',slot:true},
  ],byEye:['One camera loop: the cameras cycle.','Bimah Mute (row 4, column 8 of any service page): the X32 channels mute.'],
  more:{label:'The rest of the rehearsal checklist, before the first live service',href:'https://github.com/RavBogard/crc-overlays/blob/main/docs/planning/2026-09-23-overlay-consistency/companion/REHEARSAL-CHECKLIST.md'}}]},
  {key:'graphics-links',kicker:'Your graphics',title:'Your graphics',verify:'none',text:[],blocks:[{kind:'links',links:[
   {label:'This service',href:'/this-service'},
   {label:'Library',href:'/author'},
   {label:'Wording changes',href:'/author/wording-changes'},
   {label:'Recent publications',href:'/author/publications'},
  ]}]},
 ],
 goingBack:[
  'In Companion: **Import / Export**, **Import**, your backup. Turn on **Buttons**, **Triggers** and **Custom Variables** only, then **Import Preserving Unselected**. Connections stay unchanged.',
  'In vMix: paste the Singular URL back into the Web Browser input.',
 ],
};

export const SETUP_FLOWS:Record<SetupFlowId,SetupFlow>={tbi:TBI,crc:CRC};

/** The flow for a workspace id; TBI's deployment id is temple-bnai-israel-kalamazoo. */
export function setupFlowFor(workspaceId:string):SetupFlow|null{
 if(workspaceId==='crc')return CRC;
 if(workspaceId==='temple-bnai-israel-kalamazoo'||workspaceId==='tbi')return TBI;
 return null;
}

/** Every step key of a flow, in order: what /api/setup-progress stores. */
export const flowStepKeys=(flow:SetupFlow)=>flow.steps.map(step=>step.key);

/** `**word**` → alternating plain and bold runs. */
export function textRuns(text:string):{text:string;bold:boolean}[]{
 return text.split('**').map((part,index)=>({text:part,bold:index%2===1})).filter(run=>run.text);
}

/** "Simone’s Companion (downloaded 2026-09-24)": the device token's name on the Access page. */
export function personalDeviceName(flow:SetupFlow,now:number,how:'downloaded'|'paired'='downloaded'){
 // A pairing code's name also tells the page when that code was redeemed, so it carries the minute.
 const at=new Date(now).toISOString();
 return `${flow.operator}’s Companion (${how} ${how==='paired'?`${at.slice(0,10)} ${at.slice(11,16)} UTC`:at.slice(0,10)})`;
}

/* ------------------------------------------------------------ press readout --- */

export type PressRow={at:number;cue:string|null;name:string|null;revision:number;status:'rendered'|'in transition'|'error'|'not acknowledged'};

const record=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;

/**
 * The newest Companion press /api/state reports, and whether a graphics browser rendered it: the
 * same rule get_live_state uses (a renderer at this revision and cue that has settled). Null when
 * the state reports no Companion press.
 */
export function companionPress(state:unknown):PressRow|null{
 const body=record(state);if(!body||!Number.isSafeInteger(body.revision))return null;
 const at=record(body.lastPress)?.companion;
 if(typeof at!=='number'||!Number.isFinite(at))return null;
 const cue=typeof body.cue==='string'?body.cue:null,revision=body.revision as number,payload=record(body.cuePayload);
 const current=(Array.isArray(body.renderers)?body.renderers:[]).map(record).filter((item):item is Record<string,unknown>=>item!==null).filter(item=>Number(item.revision)===revision&&(typeof item.cue==='string'?item.cue:null)===cue);
 const status=current.some(item=>item.phase==='settled')?'rendered':current.some(item=>item.phase==='error')?'error':current.length?'in transition':'not acknowledged';
 return {at,cue,name:cue&&payload?.id===cue&&typeof payload.name==='string'?payload.name:null,revision,status};
}

/** Folds one poll into the readout: a new press is added on top, the same press is updated in place. */
export function foldPress(rows:readonly PressRow[],next:PressRow|null,limit=8):PressRow[]{
 if(!next)return [...rows];
 if(rows[0]&&rows[0].at===next.at)return [{...next,status:rows[0].status==='rendered'?'rendered':next.status},...rows.slice(1)];
 return [next,...rows].slice(0,limit);
}

/** The test step ticks after one press renders. */
export const pressRendered=(rows:readonly PressRow[])=>rows.some(row=>row.status==='rendered'&&row.cue!==null);
