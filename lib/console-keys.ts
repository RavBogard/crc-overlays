/**
 * Keyboard navigation for the live control console (U6).
 *
 * The console's keyboard only ever moves the inspect selection. There is deliberately no
 * key that shows a graphic live: the union below has no 'show' member, so a Show cannot be
 * added by accident — it would not type-check. The Show buttons stay reachable the ordinary
 * way, by tabbing to them and pressing Enter or Space on the button itself, which is the
 * browser's own button behaviour and not a binding of ours.
 */

/** The only things the console keyboard can ask for. No Show outcome exists by construction. */
export type ConsoleKeyAction='up'|'down'|'inspect';

export type ConsoleKeyModifiers={ctrl?:boolean;meta?:boolean;alt?:boolean;shift?:boolean};

/** Tags whose own text editing or option list owns the arrow keys; we never take them over. */
const TYPING_TAGS=new Set(['input','textarea','select']);

/**
 * Moves the inspect selection through the visible graphics.
 *
 * From nothing selected, delta 1 starts at the first graphic and delta -1 at the last.
 * At either end the selection stays put — no wrap, so a held arrow key cannot silently
 * jump an operator from the bottom of the library back to the top mid-service.
 * A `current` that is no longer in the list (a filter changed under it) restarts from the end
 * the movement is coming from.
 */
export function nextInspected(ids:string[],current:string|null,delta:1|-1):string|null{
 if(!ids.length)return null;
 const first=ids[0],last=ids[ids.length-1];
 if(current===null)return delta===1?first:last;
 const index=ids.indexOf(current);
 if(index===-1)return delta===1?first:last;
 const next=index+delta;
 if(next<0)return first;
 if(next>=ids.length)return last;
 return ids[next];
}

/**
 * Maps one keydown to a console action, or null when the console must keep its hands off:
 * the person is typing in a field, or a modifier is held (those belong to the browser and
 * to assistive technology).
 */
export function consoleKeyAction(key:string,targetTag:string,modifiers:ConsoleKeyModifiers):ConsoleKeyAction|null{
 if(modifiers.ctrl||modifiers.meta||modifiers.alt||modifiers.shift)return null;
 if(TYPING_TAGS.has(String(targetTag).toLowerCase()))return null;
 if(key==='ArrowUp')return 'up';
 if(key==='ArrowDown')return 'down';
 if(key==='Enter')return 'inspect';
 return null;
}
