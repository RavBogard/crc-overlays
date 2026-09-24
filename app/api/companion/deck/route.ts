import {authorizeRequest} from '@/lib/access';
import {handleDeckDownload} from './handler';

export const dynamic='force-dynamic';
export const runtime='nodejs';

// The Setup page download is for members who run the booth (owner, editor, operator); a signed link
// from export_deck_config needs no session.
export async function GET(request:Request){return handleDeckDownload(request,{member:request=>authorizeRequest(request,'control')})}
