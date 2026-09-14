import {redirect} from 'next/navigation';

/* D3 of the 2026-09-14 layout pass: source review is no longer a page. It is the
   "Source changes" filter in the library rail, with the comparison in the editor's centre
   column, so this route sends its old links and bookmarks to the library. */
export default function SourcesReviewPage(){
 redirect('/author');
}
