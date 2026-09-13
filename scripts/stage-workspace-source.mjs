import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {relative,resolve,sep} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'..');
const stagingRoot=resolve(repoRoot,'work','deploy-staging');
const destination=resolve(stagingRoot,'temple-bnai-israel-kalamazoo','source-upload');
const workspaceId='temple-bnai-israel-kalamazoo';

function fail(message){throw new Error(message)}
function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
function writeJson(path,value){writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,'utf8')}
function copy(relativePath){const from=resolve(repoRoot,relativePath),to=resolve(destination,relativePath);if(!existsSync(from))fail(`Required source path is missing: ${relativePath}`);mkdirSync(resolve(to,'..'),{recursive:true});cpSync(from,to,{recursive:true})}

if(existsSync(destination))fail(`Allowlisted source staging already exists at ${destination}`);
const relativeDestination=relative(stagingRoot,destination);
if(relativeDestination.startsWith(`..${sep}`)||relativeDestination==='..')fail('Source staging path escaped the deployment staging directory');

mkdirSync(destination,{recursive:true});
for(const directory of ['app','components','hooks','lib','schemas'])copy(directory);
for(const file of ['package.json','package-lock.json','next.config.ts','tsconfig.json','postcss.config.mjs','vercel.json','next-env.d.ts'])copy(file);
copy('workspaces/temple-bnai-israel');
for(const file of ['public/assets/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXBi8Jpg.woff2','public/assets/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K3vXBi8Jpg.woff2','public/workspaces/temple-bnai-israel/official-footer.png'])copy(file);

const fullCatalog=readJson(resolve(repoRoot,'lib','cues.json'));
const selectedCatalog=fullCatalog.filter(cue=>!cue.hidden);
if(selectedCatalog.length!==24)fail(`Expected 24 selected visible cues, found ${selectedCatalog.length}`);
writeJson(resolve(destination,'lib','cues.json'),selectedCatalog);

const selectedUnitIds=new Set(selectedCatalog.flatMap(cue=>cue.provenance?.liturgy?.unitIds??[]));
if(selectedUnitIds.size!==21)fail(`Expected 21 selected siddur source units, found ${selectedUnitIds.size}`);
const fullLegacy=readJson(resolve(repoRoot,'content','authoring-sources.json'));
const selectedSources=fullLegacy.sources.filter(source=>selectedUnitIds.has(source.id));
if(selectedSources.length!==selectedUnitIds.size)fail('One or more selected siddur source units are unavailable');
mkdirSync(resolve(destination,'content'),{recursive:true});
writeJson(resolve(destination,'content','authoring-sources.json'),{
 ...fullLegacy,
 sources:selectedSources,
 workspaceScope:{workspaceId,selection:'approved-visible-starter',sourceUnitCount:selectedSources.length},
});
const expanded=readJson(resolve(repoRoot,'content','siddur-library.json'));
writeJson(resolve(destination,'content','siddur-library.json'),{
 schemaVersion:expanded.schemaVersion,
 scope:{workspaceId},
 generatedFrom:expanded.generatedFrom,
 authorities:[],
 sources:[],
 coverage:{books:[],totals:{units:0,usableUnits:0,blocks:0,pairedBilingualBlocks:0,originalEnglishBlocks:0},rules:['This deployment intentionally exposes only the approved starter source units in authoring-sources.json.']},
});

const forbiddenNames=new Set(['.env','.env.local','.env.production','.git','keys.json','connections.md','private-crc-access.txt']);
const files=[];
function inspect(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=resolve(directory,entry.name),name=entry.name.toLowerCase();if(forbiddenNames.has(name)||name.startsWith('.env.')||name.endsWith('.companionconfig')||name.endsWith('.tgz'))fail(`Forbidden deployment source file: ${relative(destination,path)}`);if(entry.isDirectory())inspect(path);else if(entry.isFile()){if(statSync(path).size>5_000_000)fail(`Unexpected large deployment source file: ${relative(destination,path)}`);files.push(relative(destination,path).replaceAll('\\','/'))}}}
inspect(destination);
writeJson(resolve(destination,'deployment-source-manifest.json'),{
 version:1,workspaceId,sourceFiles:files.sort(),selectedCueCount:selectedCatalog.length,selectedSourceUnitCount:selectedSources.length,expandedLibraryUnitCount:0,excluded:['.git','.vercel','.env*','work','outputs','backups','keys','private connection sheets','CRC artwork','CRC setup downloads','unselected siddur library units'],
});
console.log(JSON.stringify({destination,files:files.length,selectedCues:selectedCatalog.length,selectedSourceUnits:selectedSources.length,expandedLibraryUnits:0},null,2));
