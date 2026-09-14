# Handoff for Code — Player defects: flash on Show, and a Live window that does not animate (2026-09-14)

Worktree: `C:\Users\dsbog\crc-overlays-vercel`, branch `codex/product-expansion`. Preserve tracked modifications and untracked files. Independent of the two UX handoffs in this folder; ship it first — it is a live-output defect.

## Symptom

Pressing Show on any graphic flashes the complete, finished graphic for a moment, then it disappears and animates in. Reported by the owner against production on 2026-09-14 — first noticed when switching directly from A to B without Animate out (where it also leaves "ghost" text between them), then confirmed to happen from an empty frame too. It is one defect with one window; the empty-frame case is the primary reproduction, not a lesser variant.

## Cause (read from `lib/player.ts` and `lib/overlay-assets.ts`)

`Player.drain()` does, in order: animate A out → `root.replaceChildren()` → `render(B)` → `settleAssets(box)` → `applyFit(box)` → `animate(box, B, 'In')`.

`render()` builds the new `.overlay` box and inserts it with `this.root.replaceChildren(box)` **fully visible at its resting position** — no opacity or transform has been applied yet. It then stays on screen while `settleAssets` runs: `waitForRenderedOverlayAssets` awaits the font checks, the logo `decode()`, and unconditionally two `requestAnimationFrame` ticks, so B is painted at full opacity for a minimum of two frames and typically more when the logo or artwork is not cached. Only then does `animate(...,'In')` create the Web Animations, whose first keyframe (`opacity:0` or the hidden transform) snaps every animated element back to its start state before it eases in. On screen that reads as: A fades out → B pops in complete → B vanishes → B animates in. That is the flash.

The ghost text is the same window seen from the other side: `render()` calls `applyFit` (the iterative font-size loop in `fitPanelRows` / `fitPanelCopy` / `fitBottomText`), and `drain()` calls `applyFit` again after assets settle — both while the box is visible, so the text is painted at one size, resized, and repainted during those frames. Elements with no In track (base, titlebar, accent line when their effect is `none`) are visible throughout, which is why the ghost looks like typography floating on a fully drawn card.

The window is identical whether the frame was empty or A was just animated out; on a direct switch the eye is already tracking motion so it is more jarring, and A's exit adds the ghost-text impression, but the flash itself is the same two-plus frames of a finished card in both cases.

The existing test `the display path fits only after the asset wait resolves and before animate-in` (`tests/player.test.ts`) pins the order `render → wait → fit → animate` and is correct; it just does not assert what the box looks like during that window.

## Fix

Keep the new box invisible from insertion until the In animations exist, then reveal it in the same tick. `visibility:hidden` (not `display:none`) so layout and every `scrollHeight` / `getComputedStyle` measurement in the fit loops still work.

In `lib/player.ts`:

1. `render()` — immediately after `box.className=\`overlay ${c.layout}\``, add `box.style.visibility='hidden'`.

2. `animate()` — create the animations first, reveal, then await:

```ts
async animate(box:HTMLElement,c:Cue,direction:AnimationDirection){
 const duration=c.duration[direction]||.5;const translatePx=c.template?.translatePx||48;
 const elements=Array.from(box.querySelectorAll<HTMLElement>('[data-element]'));
 const finished=elements.flatMap(el=>tracksFor(el.dataset.animationElement||el.dataset.element||'',direction,c.animations).map(track=>{
  const range=track.keyframes?.length===2?track.keyframes:[0,duration];
  return el.animate(effectFrames(track.effect,direction,translatePx),{duration:Math.max(1,(range[1]-range[0])*1000),delay:range[0]*1000,fill:'both',easing:easingFor(track.effect)}).finished}));
 // Every In animation now holds its first keyframe (fill:'both' covers the delay phase),
 // so the box can become visible without a frame at its resting state.
 box.style.visibility='';
 await Promise.all(finished);
}
```

`fill:'both'` already applies the from-keyframe during any `delay`, so elements with a delayed track are hidden at reveal; elements with no In track appear at reveal exactly as they do today. For `direction==='Out'` the reveal line is a no-op (the box is already visible). Nothing changes in `drain()`, `set()`, `applyFit`, `settleAssets`, the relay, the command route, or the console.

3. Also clear the flag on the fallback path: in `settleAssets`, nothing to change — the box is revealed only by `animate`. But `drain()` has one path that discards a box without animating it (`if(!incomingStillDesired(...)){this.root.replaceChildren();continue}`) — that box was never revealed, which is the desired outcome, so no change there either.

## Test

Add to `tests/player.test.ts`, next to the existing display-path test (same fixture and stubs):

```ts
test('an incoming graphic stays invisible until its In animations exist',async()=>{
 const {player,box}=displayPathFixture(); // reuse whatever the neighbouring test builds
 const seen:string[]=[];
 player.options.waitForAssets=async(root)=>{seen.push(`wait:${(root as HTMLElement).style.visibility}`)};
 const realAnimate=player.animate.bind(player);
 player.animate=async(b,c,d)=>{seen.push(`animate-start:${b.style.visibility}`);await realAnimate(b,c,d);seen.push(`animate-end:${b.style.visibility}`)};
 player.desired={cue:'rows',revision:1,mode:'animate'};
 await player.drain();
 assert.deepEqual(seen,['wait:hidden','animate-start:hidden','animate-end:']);
});
```

If the fixture's fake elements lack `.animate`, stub `el.animate` to return `{finished:Promise.resolve()}` — the assertion is about `visibility`, not motion.

## Acceptance

- Primary check, in the console's Live window and on the real output: from an empty frame, Show any graphic → nothing is painted until the In animation begins; no frame shows the finished graphic at rest first. Verify by frame-stepping a screen recording of the output at 60 fps.
- Show B while A is on air → A animates out, the frame is empty for the asset wait, B animates in from its first keyframe with no pop and no leftover text.
- Fit results are unchanged: `data-fit` values and the computed font sizes for the existing fixtures are identical before and after (the fit loops measure a `visibility:hidden` box the same as a visible one).
- `npm test` passes, including the new test and the existing `render → wait → fit → animate` ordering test.
- Preview mode (`/output?preview`) and the editor's isolated preview, which use the same `Player`, show the same clean transition.

## Part 2 — the Live window on Live control no longer animates

Reported the same day: the Live window shows the completed graphic instantly on Show and drops it instantly on Animate out, while the real output in OBS/vMix animates correctly.

Cause, from `app/console.tsx`: both monitors use the shared `Stage` component, and `Stage` drives the Player as a still — its effect does `new Player(...)` then `player.render(cue, …)` directly, and it is keyed on `[cue, workspace]`, so every cue change disposes the Player and renders the next cue at rest. `render()` never runs the In/Out tracks; only `set()` → `drain()` does. That is right for the Preview window (a candidate the operator is inspecting) and wrong for the Live window, which is meant to mirror the output.

Fix: give `Stage` an optional `state` prop and, when it is present, drive the Player through `set()` exactly as `/output` does.

- `Stage` signature: `{cue, cues?, state?, workspace, onReady, children}` where `state` is `{cue:string|null; revision:number; mode:string}` taken from the realtime snapshot the console already holds (`state.cue`, `state.revision`, `state.mode`).
- When `state` is provided: create **one** Player per `workspace` (effect keyed on `[workspace]` only, so the Player survives cue changes and can run the Out track of the departing graphic), constructed with the full `cues` catalog and `{resolveAssetUrl: cue => overlayAssetUrl(cue,'preview')}`. A second effect keyed on `[state?.cue, state?.revision, state?.mode, cues]` sets `player.cues = cues` and calls `player.set({cue:state.cue, revision:state.revision, mode:state.mode})`. Report readiness from the Player's phase: `onReady(player.phase==='settled' && player.current!==null)` — poll it on a 100 ms interval as `/output` does, or expose a phase callback on the Player; either is fine. Dispose the Player only when `workspace` changes or the component unmounts.
- When `state` is absent (Preview window): unchanged — still render, keyed on `[cue, workspace]`.
- `LiveMonitor` passes `cues={cues}` and `state={state}`; `PreviewMonitor` is untouched. The `mode:'cut'` path gives the Live window the same immediate clear the output performs.
- The Part 1 fix applies here automatically, since it is the same Player.

Acceptance for Part 2: on Show, the Live window animates the graphic in with the same In tracks and duration as the output; on Animate out it runs the Out tracks; on Clear it vanishes immediately; on a direct A→B switch it runs A out then B in. The Preview window still shows a still on selection. The "Preparing fonts and artwork…" caption on the Live window appears only until the Player reaches `settled`.

## Not in scope

Cross-fading A into B. The owner ruled on 2026-09-14 to keep the current sequence — the departing graphic fully out, then the incoming one in — which matches the archived Singular timings. Do not overlap the Out and In tracks.
