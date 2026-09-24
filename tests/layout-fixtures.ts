import {CORNER_CARD,type LayoutDocument} from '../lib/layout-registry.ts';

/** A data layout for the L2 tests: the corner card's geometry pinned top-right, a "Response" card. */
export const RESPONSE_CARD:LayoutDocument={label:'Response card',capabilities:{sets:false,translation:false,oneBlockPerSlide:true},card:{...structuredClone(CORNER_CARD),frame:{...CORNER_CARD.frame,anchor:'top-right'}},motion:{preset:'card-scale'}};
