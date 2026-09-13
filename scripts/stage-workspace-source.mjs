import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {relative,resolve,sep} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'..');
const stagingRoot=resolve(repoRoot,'work','deploy-staging');
const workspaceId='temple-bnai-israel-kalamazoo';
const destinationPosition=process.argv.indexOf('--destination');
const requestedDestination=destinationPosition>=0?process.argv[destinationPosition+1]:`${workspaceId}/source-upload`;
if(!requestedDestination)throw new Error('--destination requires a path inside work/deploy-staging');
const destination=resolve(stagingRoot,requestedDestination);

function fail(message){throw new Error(message)}
function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
function writeJson(path,value){writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,'utf8')}
function copy(relativePath){const from=resolve(repoRoot,relativePath),to=resolve(destination,relativePath);if(!existsSync(from))fail(`Required source path is missing: ${relativePath}`);mkdirSync(resolve(to,'..'),{recursive:true});cpSync(from,to,{recursive:true})}

if(existsSync(destination))fail(`Allowlisted source staging already exists at ${destination}`);
const relativeDestination=relative(stagingRoot,destination);
if(relativeDestination.startsWith(`..${sep}`)||relativeDestination==='..')fail('Source staging path escaped the deployment staging directory');

mkdirSync(destination,{recursive:true});
for(const directory of ['app','components','content','hooks','lib','schemas'])copy(directory);
for(const file of ['package.json','package-lock.json','next.config.ts','tsconfig.json','postcss.config.mjs','vercel.json','next-env.d.ts'])copy(file);
copy('workspaces/temple-bnai-israel');
for(const file of ['public/assets/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXBi8Jpg.woff2','public/assets/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K3vXBi8Jpg.woff2','public/assets/NotoSansHebrew-Regular.ttf','public/assets/NotoSansHebrew-Medium.ttf','public/assets/NotoSansHebrew-OFL.txt','public/workspaces/temple-bnai-israel'])copy(file);

const fullLegacy=readJson(resolve(repoRoot,'content','authoring-sources.json'));
const expanded=readJson(resolve(repoRoot,'content','siddur-library.json'));
if(fullLegacy.sources.length<1)fail('The complete legacy source library is unavailable');
if(!Array.isArray(expanded.sources)||expanded.sources.length<1)fail('The complete browsable library is unavailable');
if(expanded.coverage?.totals?.usableUnits!==expanded.sources.length)fail(`Browsable library coverage reports ${expanded.coverage?.totals?.usableUnits??'unknown'} usable units for ${expanded.sources.length} sources`);

const forbiddenNames=new Set(['.env','.env.local','.env.production','.git','keys.json','connections.md','private-crc-access.txt']);
const allowedInstallArtifacts=new Set([
 'public/workspaces/temple-bnai-israel/downloads/tbi-overlays-1.2.0.tgz',
 'public/workspaces/temple-bnai-israel/downloads/tbi-morning-page-1.companionconfig',
 'public/workspaces/temple-bnai-israel/downloads/tbi-morning-page-2.companionconfig',
]);
const files=[];
function inspect(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=resolve(directory,entry.name),name=entry.name.toLowerCase(),relativePath=relative(destination,path).replaceAll('\\','/');if(forbiddenNames.has(name)||name.startsWith('.env.')||((name.endsWith('.companionconfig')||name.endsWith('.tgz'))&&!allowedInstallArtifacts.has(relativePath)))fail(`Forbidden deployment source file: ${relativePath}`);if(entry.isDirectory())inspect(path);else if(entry.isFile()){if(statSync(path).size>5_000_000)fail(`Unexpected large deployment source file: ${relativePath}`);files.push(relativePath)}}}
inspect(destination);
writeJson(resolve(destination,'deployment-source-manifest.json'),{
 version:1,workspaceId,sourceFiles:files.sort(),starterCueCount:24,legacySourceCount:fullLegacy.sources.length,expandedLibrarySourceCount:expanded.sources.length,sharedLibraryPolicy:'complete-current-library-and-owner-authorized-future-crc-additions',excluded:['.git','.vercel','.env*','work','outputs','backups','keys','private connection sheets','CRC artwork','CRC setup downloads'],
});
console.log(JSON.stringify({destination,files:files.length,starterCues:24,legacySources:fullLegacy.sources.length,expandedLibrarySources:expanded.sources.length},null,2));
