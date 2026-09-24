import {defaultImportRepository} from '@/lib/imports';
import {importDropPost} from '@/lib/import-http';

// TBI redo G1 - the dropzone page's upload steps (begin, chunk, finish). Public by token: the link
// is the capability. The logic lives in lib/import-http.ts so tests drive it directly.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params;return importDropPost(request,token,defaultImportRepository())}
