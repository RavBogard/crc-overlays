import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {Pool} from 'pg';

const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const recoveryRoot=path.join(root,'work','recovery');
const requested=process.argv[2];
if(!requested||!process.env.DATABASE_URL)throw new Error('Usage: DATABASE_URL=… node scripts/export-recovery.mjs work/recovery/<workspace>-<date>');
const output=path.resolve(root,requested);
if(output!==recoveryRoot&&!output.startsWith(recoveryRoot+path.sep))throw new Error('Recovery exports must stay under work/recovery.');
await mkdir(recoveryRoot,{recursive:true,mode:0o700});
await mkdir(output,{recursive:false,mode:0o700});
// Tables added by the MCP completeness plan (docs/planning/2026-09-23-mcp-gap-analysis). Each is read when it
// exists; one not yet applied is recorded as null. Upload staging (workspace_asset_uploads) is left out.
const PLAN_TABLES=['authoring_preview_images','authoring_defaults','local_sources','review_boards','review_board_answers','layout_definitions','companion_decks','workspace_branding','singular_references'];
const bytesAsBase64=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>Buffer.isBuffer(value)?[`${key}Base64`,value.toString('base64')]:[key,value]));
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
const files=[];
async function save(name,value){const text=JSON.stringify(value,null,2)+'\n';await writeFile(path.join(output,name),text,{mode:0o600,flag:'wx'});files.push({name,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')})}
async function saveBinary(name,source){const destination=path.join(output,name);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await copyFile(source,destination);const content=await readFile(destination);files.push({name,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')})}
async function copyTree(relative){const source=path.join(root,relative);try{if(!(await stat(source)).isDirectory())return}catch{return}for(const entry of await readdir(source,{withFileTypes:true})){const child=path.join(relative,entry.name);if(entry.isDirectory())await copyTree(child);else if(entry.isFile())await saveBinary(child.replaceAll('\\','/'),path.join(root,child))}}
try{
 const client=await pool.connect();let drafts,previews,revisions,sourceReviews,services,feedback,usage,assets;const planTables={};try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SELECT set_config('statement_timeout','10000',true)");drafts=await client.query('SELECT id,document,version,active_revision,active_draft_version,created_at,updated_at,created_by,updated_by FROM authoring_drafts ORDER BY id');previews=await client.query('SELECT id,draft_id,draft_version,cue_hash,cue,validation,review,created_at,created_by FROM authoring_previews ORDER BY id');revisions=await client.query('SELECT draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at,source_commits FROM authoring_revisions ORDER BY draft_id,revision');sourceReviews=await client.query('SELECT id,document,version,status,detected_at,updated_at FROM source_change_reviews ORDER BY id');services=await client.query('SELECT id,document,version,archived,created_at,updated_at,created_by,updated_by FROM service_collections ORDER BY id');feedback=await client.query('SELECT id,document,version,archived,created_at,updated_at,created_by,updated_by FROM beta_feedback ORDER BY id');usage=await client.query('SELECT provider,used,limit_value,unit,window_label,measured_at,updated_at FROM operations_usage_reports ORDER BY provider');assets=await client.query('SELECT id,name,alt_text,mime_type,byte_size,width,height,data,version,archived,published_at,created_at,updated_at,created_by,updated_by FROM workspace_assets ORDER BY id');for(const table of PLAN_TABLES){const exists=(await client.query('SELECT to_regclass($1) AS name',[`public.${table}`])).rows[0].name;planTables[table]=exists?(await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows.map(bytesAsBase64):null}await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 await save('authoring.json',{drafts:drafts.rows,previews:previews.rows,revisions:revisions.rows,sourceReviews:sourceReviews.rows});
 await save('services.json',{collections:services.rows,feedback:feedback.rows});
 await save('operations.json',{usageReports:usage.rows});
 await save('plan-tables.json',planTables);
 await save('assets.json',{assets:assets.rows.map(row=>({...row,data:undefined,dataBase64:row.data.toString('base64')}))});
 const workspaceId=process.env.WORKSPACE_ID||'crc';const profile=workspaceId==='temple-bnai-israel-kalamazoo'?JSON.parse(await readFile(path.join(root,'workspaces/temple-bnai-israel/workspace.json'),'utf8')):{version:1,environment:{WORKSPACE_ID:'crc',WORKSPACE_ORGANIZATION_NAME:'Central Reform Congregation',WORKSPACE_SHORT_NAME:'CRC',WORKSPACE_PRODUCT_NAME:'CRC Overlays',WORKSPACE_OUTPUT_NAME:'CRC graphics',WORKSPACE_LOGO_PATH:'/assets/siona-floor.jpg',WORKSPACE_LOGO_ALT:'Central Reform Congregation artwork',WORKSPACE_PRIMARY_COLOR:'#09bfc2',WORKSPACE_DEEP_COLOR:'#07345f',WORKSPACE_ACCENT_COLOR:'#d9a62e'}};
 await save('workspace-profile.json',profile);
 for(const [name,relative] of [['cue-baseline.json','lib/cues.json'],['source-library.json','content/siddur-library.json'],['authoring-sources.json','content/authoring-sources.json'],['legacy-source-map.json','content/legacy-crc-shabbat-morning.sources.json']])await save(name,JSON.parse(await readFile(path.join(root,relative),'utf8')));
 await copyTree('public/assets');await copyTree('public/downloads');if(workspaceId==='temple-bnai-israel-kalamazoo')await copyTree('public/workspaces/temple-bnai-israel');
 if(process.env.RELAY_URL&&process.env.RELAY_SECRET){const origin=new URL(process.env.RELAY_URL);const read=async endpoint=>{const response=await fetch(new URL(endpoint,origin),{headers:{Authorization:`Bearer ${process.env.RELAY_SECRET}`},signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)throw new Error(`Relay ${endpoint} unavailable`);return response.json()};await save('relay.json',{state:await read('/state'),catalog:await read('/catalog')})}
 const manifest={format:'crc-overlays-recovery',version:1,createdAt:Date.now(),workspaceId,contents:files,excludes:['environment variables','password hashes','sessions','invitation links','relay credentials','control and output credentials']};
 await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`Recovery export written to ${path.relative(root,output)} (${files.length} checked files).`);
}finally{await pool.end()}
