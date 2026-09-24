import type {Metadata} from 'next';
import {publicWorkspaceWithBranding} from '@/lib/branding-store';
import {IMPORT_KIND_LABELS,defaultImportRepository,dropzoneFor,importByteLimit} from '@/lib/imports';
import {getPublicWorkspace,type PublicWorkspace} from '@/lib/workspace';
import DropzoneClient from '../dropzone-client';
import styles from '../import.module.css';

// TBI redo G1 - the dropzone a person drops one file on. Public by token (the link is the
// capability, valid for 30 minutes); no sign-in, not indexed, no referrer. The upload itself goes
// to /api/imports/<token> (lib/import-http.ts).
export const dynamic='force-dynamic';
export function generateMetadata():Metadata{const workspace=getPublicWorkspace();return {title:`${workspace.productName} · Drop a file`,robots:{index:false,follow:false},referrer:'no-referrer'}}

async function branded():Promise<PublicWorkspace>{const workspace=getPublicWorkspace();try{return await publicWorkspaceWithBranding(workspace)}catch{return workspace}}
async function lookup(token:string){try{return await dropzoneFor(defaultImportRepository(),token)}catch{console.error('Import page lookup failed');return undefined}}

export default async function ImportPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params,[workspace,row]=await Promise.all([branded(),lookup(token)]);
 const style={'--brand':workspace.colors.primary,'--deep':workspace.colors.deep,'--accent':workspace.colors.accent} as React.CSSProperties;
 return <main className={styles.page} style={style}>
  <section className={styles.card}>
   <header className={styles.header}>
    {/* eslint-disable-next-line @next/next/no-img-element -- the workspace logo is a small static file, as in the workspace header */}
    <img src={workspace.logo.src} alt={workspace.logo.alt} className={styles.logo}/>
    <div><span className={styles.eyebrow}>{workspace.productName}</span><h1>Drop a file for {workspace.organizationName}</h1></div></header>
   {row===undefined?<p className={styles.problem}>This page is unavailable right now. Try again in a minute.</p>
    :row===null?<p className={styles.problem}>This link has expired or is not valid. Ask for a new link.</p>
    :<DropzoneClient token={token} kind={row.kind} label={IMPORT_KIND_LABELS[row.kind]} maxBytes={importByteLimit(row.kind)} linkExpiresAt={row.linkExpiresAt} note={row.note} arrived={row.status==='ready'?row.fileName??'a file':null}/>}
  </section>
 </main>;
}
