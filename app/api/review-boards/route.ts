import {accessStore,authorizeRequest} from '@/lib/access';
import {authoringRepository} from '@/lib/authoring';
import {defaultReviewBoardRepository} from '@/lib/review-board';
import {reviewBoardGet,reviewBoardPost,type ReviewBoardHttpDeps} from '@/lib/review-board-http';

// T4 - the review page (/author/review/<board>): read a board, its kept fit frames, and save a
// reviewer's answer. The logic lives in lib/review-board-http.ts so tests drive it directly.
export const runtime='nodejs';
export const dynamic='force-dynamic';
const deps:ReviewBoardHttpDeps={
 authorize:request=>authorizeRequest(request,'read'),
 context:()=>({authoring:authoringRepository(),boards:defaultReviewBoardRepository()}),
 memberName:id=>accessStore.memberById(id).then(member=>member?.name||member?.email||null),
};
export async function GET(request:Request){return reviewBoardGet(request,deps)}
export async function POST(request:Request){return reviewBoardPost(request,deps)}
