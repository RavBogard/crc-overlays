# RETURN → the agent publish path (Overlays)

Order: `HANDOFF-CODE-2026-09-14-publish-path.md`. All three parts shipped in one web deploy,
`95de94b8fa3d94cafd8e1ac247092d6f69fbb4e2`, both congregations. Relays untouched. Deploy
record 21 in `CLAUDE-HANDOFF.md`.

## Part 1 — `fit_check_draft` on Vercel

**The first candidate was already closed, and this is the most useful thing in the return.**
`next.config.ts` does exist (added in `1d8470d`, trimmed in `f08c791`). It already sets
`serverExternalPackages` for both packages, already includes them on `/api/authoring` **and**
`/api/mcp`, and already excludes them from every other `/api/**` route. Verified by reading a
clean build's own route traces rather than by deploying a guess:

```
.next/server/app/api/mcp/route.js.nft.json        @sparticuz/chromium/bin/chromium.br,
                                                  al2023.tar.br, fonts.tar.br,
                                                  swiftshader.tar.br, 116 playwright-core files
.next/server/app/api/authoring/route.js.nft.json  the same
.next/server/app/api/now/route.js.nft.json        excluded — 4 stub entries
```

So the pack reaches the function. Do not spend time there again. Two real gaps remained:

1. **`/api/mcp` carried no `runtime` and no `maxDuration`** while `/api/authoring` carried
   `nodejs` and 60 s with a comment explaining why. An MCP fit check lands on `/api/mcp`. The
   handoff called this a second bug to fix regardless; it is fixed, and
   `tests/publish-path-contract.test.ts` now holds the two routes to the same config.
2. **The error was laundered.** `measureCueOnServer` mapped a missing binary, a killed launch
   and an unreachable stage to the one word `browser_unavailable`, and logged nothing. It now
   logs the launch plan, the origin and the underlying error. The returned shape is unchanged,
   so no error text reaches an MCP client.

`canonicalOrigin()` was the handoff's second candidate. It cannot throw: with no
`PUBLIC_BASE_URL` it falls back to `https://crc-overlays.vercel.app`, which is right for CRC and
wrong for TBI. Worth checking on TBI, but it would fail at `page.goto`, which is now logged.

**What is still open.** Nobody in this session holds an MCP token, so no `fit_check_draft` was
fired against production. The next one either works — the route config alone may have been the
whole cause — or names its cause in the Vercel function log under `server-fit launch failed`.
If the log shows the process dying during launch, raise the Fluid memory on `/api/mcp` and
`/api/authoring` to at least 2 GB; nothing yet says that is what happened, so nothing was
changed on a guess.

## Part 2 — Publish N reviewed drafts

Under the Library's drafts list, Editor and above, absent when nothing qualifies. One click, no
dialog, no per-draft confirmation. Per draft, in sequence: `preview_draft`, measure in this
browser at 1920×1080 through the shared sequence, `review_draft` with `humanApproved` and that
measurement, `publish_draft`, and on a `duplicate_name` 409 one retry with
`confirmDuplicateName`. A draft whose measurement reports fit problems is never reviewed and
never published: it stays a draft and is listed with what is wrong with it, and the run
continues.

**One deviation.** The handoff qualifies the button on "at least one draft's latest preview
carries a passing fit measurement". The Library's draft list carries neither previews nor
`fitCheck`, so that could only be computed by previewing and measuring every draft *before*
showing a button — which is the eight-minute run itself. The button instead counts drafts that
were never published and are not archived, and the measurement gates publication inside the run,
one draft at a time. Nothing unmeasured is published either way.

`window.__measureCue`'s body moved to `app/author/measure-cue.ts` and the fit stage now calls it,
so the server verdict and the bulk run come from the same lines, as the handoff asked.

## Part 3 — right-panel bilingual geometry

Cause confirmed exactly as the handoff read it. `.right .prayer` is a legacy block with no
`.left` counterpart, and a row channel's class list is `prayer row-hebrew|…`, so on a right panel
every channel was forced to 600×560 — and, not mentioned in the handoff, to `font-size:33px`,
because `.right .prayer` (0-2-0) outranks `.row-hebrew` (0-1-0).

**That last point is why the fix differs.** The suggested reset block
(`.panel-rows .prayer{position:static;…}`) resets position and geometry but not font size, so a
right panel would still have rendered all three channels at 33 px where a left panel renders
38/30/24 — and the acceptance asks for fills within a few percent of each other. The legacy
selector is scoped out of content rows instead:

```css
.right .prayer:not(.content-row *){right:72px;top:266px;width:600px;height:560px;font-size:33px}
```

Its numbers are untouched, and the non-row right-panel cue keeps the rule exactly.

**The test.** The handoff asks for a fixture that renders on both layouts and asserts
`data-fit`. This repo's suite is `node:test` under `tsx` with no browser in `devDependencies`, so
no test here can measure layout. The suite got a CSS contract test instead — no `.left`/`.right`
`.prayer` rule may reach a row channel — and the layout claim is proven in a real browser in
rehearsal. Both new assertions were confirmed to fail against the previous code.

## Evidence

Local only, under `work/handoffs/publish-path/` (git-ignored):

- `rehearsal.txt` — measured through `window.__measureCue` on `/author/fit-stage` at 1920×1080:

  | | before | after |
  |---|---|---|
  | left | no fit errors, fill 0.189 | no fit errors, fill 0.189 |
  | right | 4 fit errors, **fill 2.031** | no fit errors, fill 0.189 |

  2.03 is the handoff's own number for El Na R'fa Na, which is what identifies this rule as that
  draft's cause. Also in that file: the four-draft bulk run — three published (one under the
  server's suggested name), the overflowing one skipped with its fit errors and still a draft,
  the baseline "Thank you" untouched, and the button afterwards reading "Publish 1 reviewed
  draft".
- `verify-hosts.txt` — post-deploy, read-only, no command issued against production: **0 failures
  across 3 hosts × 11 checks**, including the scoped rule present and the unscoped rule absent in
  the stylesheet each host actually serves.

Gate: `tsc` 0, lint 0, clean build 0, 706 tests (700 pass / 0 fail / 6 environment skips).

## Also carried in

`scripts/convert-companion-singular.mjs` and its test were sitting untracked in the worktree from
the same drop. The release script refuses an unclean checkout, so they were committed as they
stand rather than deleted or set aside. Note that `npm test` globs `tests/*.test.ts`, so that
`.mjs` test is **not** in the release gate: run it with
`node --test tests/convert-companion-singular.test.mjs` (10 of 10 pass).

## Not in scope, and not done

`attestedMeasurement` was not weakened; the `isMcpActor` branch in `review_draft` stands; the
per-graphic human review UI stays; Part 2 works from browser measurements alone, with no
dependence on Part 1.
