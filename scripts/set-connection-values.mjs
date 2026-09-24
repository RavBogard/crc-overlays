// Sets COMPANION_CONNECTION_VALUES, the one server secret the personal Companion download fills its
// connections from (lib/companion-deck/personal.ts), from the named connections of one Companion backup
// and nothing else of that file. Values are never printed, logged or written to disk: the script prints
// labels, module ids, field names and a sha256, and hands the encoded value to `vercel env add` on stdin.
//
//   node scripts/set-connection-values.mjs --export <backup.companionconfig> --labels obs,Birddog \
//     --cwd <a directory linked to the Vercel project> [--environment production] [--dry-run]
//   node scripts/set-connection-values.mjs --export <backup> --labels obs,Birddog --verify-file <personal.companionconfig>
//
// --verify-file is quality-control check 1's value half (PLAN.md): every named connection in a downloaded
// personal file equals the backup's field for field, and no other connection carries config or secrets.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {basename,dirname,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';

const arg=(name)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
const exportPath=arg('--export'),labels=(arg('--labels')??'').split(',').map(s=>s.trim()).filter(Boolean);
if(!exportPath||!labels.length)throw new Error('Usage: --export <backup.companionconfig> --labels a,b [--cwd <linked dir>] [--dry-run | --verify-file <file>]');

const read=(file)=>{let bytes=readFileSync(file);try{bytes=gunzipSync(bytes)}catch{}return JSON.parse(bytes.toString('utf8'))};
const backup=read(resolve(exportPath));
const instances=Object.values(backup.instances??{});
const connections=labels.map(label=>{
 const found=instances.filter(c=>c&&c.label===label);
 if(found.length!==1)throw new Error(`The backup has ${found.length} connections labelled ${label}; expected exactly one.`);
 const c=found[0];
 if(!c.config||typeof c.config!=='object')throw new Error(`${label} has no config in the backup.`);
 return {label,moduleId:String(c.moduleId),config:c.config,secrets:c.secrets&&typeof c.secrets==='object'?c.secrets:{}};
});
const fields=(c)=>`${c.label} (${c.moduleId}): config ${Object.keys(c.config).sort().join(', ')||'none'}; secrets ${Object.keys(c.secrets).sort().join(', ')||'none'}`;

const verify=arg('--verify-file');
if(verify){
 const file=read(resolve(verify));
 const canonical=(v)=>JSON.stringify(v,Object.keys(v??{}).sort());
 let ok=true;
 for(const c of connections){
  const got=Object.values(file.instances??{}).find(x=>x.label===c.label&&x.moduleId===c.moduleId);
  const same=got&&canonical(got.config)===canonical(c.config)&&canonical(got.secrets??{})===canonical(c.secrets);
  console.log(`${same?'PASS':'FAIL'} ${c.label} (${c.moduleId}) equals the backup field for field`);
  ok&&=Boolean(same);
 }
 for(const x of Object.values(file.instances??{})){
  if(labels.includes(x.label)||/overlays$/.test(String(x.moduleId)))continue;
  const carries='config' in x||'secrets' in x;
  console.log(`${carries?'FAIL':'PASS'} ${x.label} (${x.moduleId}) carries no settings`);
  ok&&=!carries;
 }
 process.exitCode=ok?0:1;
}else{
 const value=Buffer.from(JSON.stringify({v:1,source:basename(exportPath).replace(/\.companionconfig$/,''),connections})).toString('base64url');
 console.log(`Source: ${basename(exportPath)} (Companion ${backup.companionBuild ?? 'unknown'})`);
 for(const c of connections)console.log(`  ${fields(c)}`);
 console.log(`Encoded: ${value.length} characters, sha256 ${createHash('sha256').update(value).digest('hex')}`);
 if(process.argv.includes('--dry-run')){console.log('Dry run: nothing was set.')}
 else{
  const cwd=arg('--cwd');if(!cwd)throw new Error('--cwd <directory linked to the Vercel project> is required to set the secret.');
  const npmCli=resolve(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  const root=execFileSync(process.execPath,[npmCli,'root','--global'],{encoding:'utf8'}).trim();
  const pkg=JSON.parse(readFileSync(resolve(root,'vercel','package.json'),'utf8'));
  const cli=resolve(root,'vercel',pkg.bin.vercel);
  const environment=arg('--environment')??'production';
  execFileSync(process.execPath,[cli,'env','add','COMPANION_CONNECTION_VALUES',environment,'--force','--sensitive','--cwd',resolve(cwd)],{input:value,stdio:['pipe','inherit','inherit']});
  console.log(`Set COMPANION_CONNECTION_VALUES (${environment}) for the project linked at ${cwd}. It takes effect on the next deployment.`);
 }
}
