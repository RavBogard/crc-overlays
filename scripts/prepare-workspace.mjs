import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'..');
const profilesRoot=resolve(repoRoot,'workspaces');
const stagingRoot=resolve(repoRoot,'work','deploy-staging');

function fail(message){throw new Error(message)}
function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
function hash(value){return createHash('sha256').update(value).digest('hex')}
function stableJson(value){return `${JSON.stringify(value,null,2)}\n`}
function write(path,value){const body=typeof value==='string'?value:stableJson(value);writeFileSync(path,body,'utf8');return {file:relative(stagingRoot,path).replaceAll('\\','/'),sha256:hash(body)}}

function requestedWorkspace(){
 const position=process.argv.indexOf('--workspace');
 if(position<0||!process.argv[position+1])fail('Usage: node scripts/prepare-workspace.mjs --workspace <workspace-id>');
 const id=process.argv[position+1].trim().toLowerCase();
 if(!/^[a-z][a-z0-9-]{1,47}$/.test(id))fail('Workspace ID is invalid');
 return id;
}

function profileFor(id){
 for(const entry of readdirSync(profilesRoot,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const path=resolve(profilesRoot,entry.name,'workspace.json');
  if(!existsSync(path))continue;
  const profile=readJson(path);
  if(profile?.environment?.WORKSPACE_ID===id)return {directory:resolve(profilesRoot,entry.name),profile};
 }
 fail(`No prepared profile exists for ${id}`);
}

const id=requestedWorkspace();
if(id==='crc')fail('CRC is the source workspace and cannot be prepared by this duplication script');
const {directory,profile}=profileFor(id);
const destination=resolve(stagingRoot,id);
const relativeDestination=relative(stagingRoot,destination);
if(relativeDestination.startsWith(`..${sep}`)||relativeDestination==='..'||relativeDestination==='')fail('Staging path is outside the deployment staging directory');
if(existsSync(destination))fail(`Staging already exists at ${destination}; preserve it or move it before preparing another package`);

const starter=readJson(resolve(directory,'starter-collection.json'));
if(starter.destinationWorkspace!==id||starter.sourceWorkspace!=='crc'||starter.status!=='approved-selection-prepared-not-imported')fail('Starter collection is not approved for this destination');
const sourceCatalog=readJson(resolve(repoRoot,'lib','cues.json'));
const sourceById=new Map(sourceCatalog.map(cue=>[cue.id,cue]));
const visibleIds=new Set(sourceCatalog.filter(cue=>!cue.hidden).map(cue=>cue.id));
const selectedIds=new Set(starter.items.map(item=>item.sourceCueId));
if(selectedIds.size!==starter.items.length||selectedIds.size!==visibleIds.size||[...visibleIds].some(cueId=>!selectedIds.has(cueId)))fail('Starter selection does not exactly match the current visible CRC baseline');
if(starter.items.some(item=>item.shareMode!=='full-private-copy-with-license-metadata'))fail('Starter item is not approved for the private full-copy staging mode');

const preparedAt=new Date().toISOString();
const mapping=starter.items.map(item=>({
 sourceCueId:item.sourceCueId,
 destinationCueId:randomUUID(),
 name:item.name,
 copyMode:item.shareMode,
}));
const destinationCatalog=mapping.map(item=>{
 const source=sourceById.get(item.sourceCueId);
 if(!source||source.hidden)fail(`Selected source cue is unavailable: ${item.sourceCueId}`);
 if(source.name!==item.name)fail(`Selected source cue name changed: ${item.sourceCueId}`);
 return {
  ...source,
  id:item.destinationCueId,
  provenance:{
   ...source.provenance,
   workspaceTransfer:{
    sourceWorkspace:'crc',
    sourceCueId:item.sourceCueId,
    destinationWorkspace:id,
    starterCollectionId:starter.id,
    copyMode:item.copyMode,
    preparedAt,
    automaticUpdates:false,
   },
  },
 };
});

mkdirSync(destination,{recursive:true});
const files=[];
files.push(write(resolve(destination,'workspace.json'),profile));
files.push(write(resolve(destination,'catalog.json'),destinationCatalog));
files.push(write(resolve(destination,'starter-provenance.json'),{
 version:1,
 preparedAt,
 sourceWorkspace:'crc',
 destinationWorkspace:id,
 starterCollectionId:starter.id,
 sourceCatalogSha256:hash(stableJson(sourceCatalog)),
 selection:starter,
 mapping,
}));
files.push(write(resolve(destination,'.env.example'),[
 `WORKSPACE_ID=${id}`,
 'WORKSPACE_ISOLATION_VERIFIED=false',
 'DATABASE_URL=',
 'CONTROL_KEY=',
 'OUTPUT_KEY=',
 'RELAY_URL=',
 'RELAY_SECRET=',
 'PUBLIC_BASE_URL=',
 '',
].join('\n')));
files.push(write(resolve(destination,'README.md'),`# ${profile.environment.WORKSPACE_PRODUCT_NAME} deployment staging

Prepared ${preparedAt} from the approved CRC visible baseline. This directory is staging only. It has independent destination cue IDs and retains every source cue's provenance and license metadata.

No live database, relay, credentials, domain, membership, or deployment was created. Fill secrets only in the deployment provider; never write them into this directory. Keep \`WORKSPACE_ISOLATION_VERIFIED=false\` until cross-workspace isolation and the actual OBS/Companion/Stream Deck rehearsal pass.
`));
const packageManifest={version:1,workspaceId:id,preparedAt,cueCount:destinationCatalog.length,files};
write(resolve(destination,'manifest.json'),packageManifest);
console.log(JSON.stringify({destination,cueCount:destinationCatalog.length,workspaceId:id},null,2));
