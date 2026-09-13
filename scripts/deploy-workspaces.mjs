import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'..');
const commitPosition=process.argv.indexOf('--commit');
const requestedCommit=commitPosition>=0?process.argv[commitPosition+1]:'';
if(!requestedCommit||!process.argv.includes('--confirm-production'))throw new Error('Usage: node scripts/deploy-workspaces.mjs --commit <full-sha> --confirm-production');

const run=(file,args,{cwd=repoRoot,env={},capture=false}={})=>execFileSync(file,args,{cwd,env:{...process.env,...env},encoding:'utf8',stdio:capture?'pipe':'inherit'});
const git=(...args)=>run('git',args,{capture:true}).trim();
const npmCli=resolve(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
const globalNodeModules=run(process.execPath,[npmCli,'root','--global'],{capture:true}).trim();
const vercelCli=resolve(globalNodeModules,'vercel','dist','index.js');
const head=git('rev-parse','HEAD');
if(!/^[0-9a-f]{40}$/.test(requestedCommit)||head!==requestedCommit)throw new Error(`Checked-out commit ${head} does not match the requested release commit`);
if(git('status','--porcelain','--untracked-files=all'))throw new Error('Release checkout must be clean so both deployments use one exact source revision');

const releaseRoot=resolve(repoRoot,'work','deploy-staging','releases',head);
const tbiRelative=`releases/${head}/temple-bnai-israel-kalamazoo`;
const tbiRoot=resolve(repoRoot,'work','deploy-staging',tbiRelative);
mkdirSync(releaseRoot,{recursive:true});
run(process.execPath,[resolve(repoRoot,'scripts','stage-workspace-source.mjs'),'--destination',tbiRelative]);
run(process.execPath,[npmCli,'ci'],{cwd:tbiRoot});
run(process.execPath,[npmCli,'run','build'],{cwd:tbiRoot,env:{WORKSPACE_ID:'temple-bnai-israel-kalamazoo',CRC_SHARED_LIBRARY_URL:'https://crc-overlays.vercel.app/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:'release-build-availability-check'}});

run(process.execPath,[vercelCli,'deploy','--prod','--yes','--cwd',repoRoot]);
run(process.execPath,[vercelCli,'link','--yes','--project','tbi-overlays','--cwd',tbiRoot]);
run(process.execPath,[vercelCli,'deploy','--prod','--yes','--cwd',tbiRoot]);
writeFileSync(resolve(releaseRoot,'release.json'),JSON.stringify({version:1,status:'deployed',commit:head,workspaces:[{id:'crc',url:'https://crc-overlays.vercel.app'},{id:'temple-bnai-israel-kalamazoo',url:'https://tbi-overlays.vercel.app'}],libraryPolicy:'complete-current-library-and-owner-authorized-future-crc-additions',completedAt:new Date().toISOString()},null,2)+'\n');
console.log(`Both production workspaces deployed from ${head}.`);
