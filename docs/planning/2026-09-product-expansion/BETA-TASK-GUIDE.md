# Beta task guide

Updated: 2026-09-13

Three short lists: what Daniel does before anyone is invited, what Michael tries at CRC, and what Simone tries at TBI.

Two rules apply to everyone, everywhere in this guide:

- **Preview and Inspect never go live.** Looking at a graphic in the editor, or inspecting one from the console, cannot put anything on screen. Only **Show** does that, and only when the relay is connected.
- **Publish is a separate step.** Saving a draft changes nothing that an operator can select. Publishing makes the reviewed version available for *future* selections; it does not replace a graphic that is currently on screen.

Singular stays available the whole time. Falling back to it is a normal, expected action, not a failure.

## For Daniel before inviting anyone

1. **Migrate both databases.** Once per workspace, with that workspace's `DATABASE_URL` set in the environment, run `node scripts/migrate-authoring.mjs`. Do CRC and Temple B'nai Israel separately; never point one run at both.
2. **Deploy from a clean tree.** With nothing uncommitted, run `scripts/deploy-workspaces.mjs --commit <full-sha> --confirm-production`. The script requires the full commit SHA and the `--confirm-production` flag, and it builds both workspaces from that one commit so configuration cannot drift into a code fork.
3. **Verify `/health` on both productions.** Confirm the relay state, output presence, and usage figures read honestly — an unknown value must say unavailable, never zero. Do not send any command from this page.
4. **Run `/author/fit-check` on both productions.** It renders every published cue at 1920×1080 with the real renderer and reports fit errors. It is read-only: it never publishes and never sends output. Against the rehearsal schema, CRC-branded came back 26 of 26 fitting and TBI-branded 29 of 29, both with 0 needing attention — but **these production runs are the first against the real published catalogs**, so treat their numbers as new information.
5. **Create invitations from `/access`.** One per person, in that person's own workspace. **Nothing is emailed automatically** — copy each invitation link and send it yourself, however you normally reach Michael and Simone.
6. **Testing both congregations from one Companion.** Install the CRC module from `crc-overlays.vercel.app/setup` and the TBI module from `tbi-overlays.vercel.app/setup`. They install side by side and appear as **CRC Overlays** and **TBI Overlays**. Add one connection per module, and give each connection only that workspace's own control key. Import each workspace's button pages and map them to the matching connection. Never paste one workspace's control key into the other workspace's connection.
7. **Do not upgrade Neon.** Budget target is under $25/month, $50 acceptable.

## For Michael (CRC)

Open, in this order: `/setup`, `/help`, `/author`, `/` (the live console), `/services`, `/health`.

Ten things to try:

1. Work through `/setup` on the machine you actually use, and copy the congregation output URL into vMix yourself.
2. Connect Companion and install the page package from `/setup`. Check that the clear button is where you expect on every page.
3. Open `/author` and find a prayer you know, by name and by opening words. Note anything you had to hunt for.
4. Open a graphic and use **Preview** — confirm nothing appears on program while you do it.
5. Create a new graphic with **Add from siddur**: search, pick the passage, pick a template, adjust alignment and spacing, then **Reset** to see the template defaults come back.
6. Save it, reload the page, and confirm your work is still there.
7. Upload a piece of artwork, then archive it and restore it. Note what happened to the graphic that was using it.
8. Publish the graphic. Then select it from the console and confirm the published version is what comes up.
9. On `/`, **Inspect** a cue and then **Show** a cue, and say plainly which one you expected to go on air.
10. Use **Clear now** in the middle of a cue — from Stream Deck and from the web page — and time how long it takes to get a clean picture.

Record in Services feedback (`/services`): every issue, every fallback to Singular, and every observation. For each one, the moment or context, what happened, the impact, and whether it points at a product gap. Do it right after the service while it is fresh; it should take under a minute per entry. The log exports to CSV.

Only you can judge: on-air readability at real viewing distance, whether Stream Deck button positions match your muscle memory, how the graphics composite over your actual camera shots in vMix, and whether falling back to Singular is fast enough under pressure.

## For Simone (TBI)

Open, in this order: `/setup`, `/help`, `/author`, `/` (the live console), `/services`, `/health`.

Ten things to try:

1. Redeem your invitation link and set a password so you can sign in again later.
2. Work through `/setup` on your own machine and copy the TBI output URL into OBS yourself.
3. Connect Companion and install the page package; confirm the clear button is reachable from every page.
4. Browse the read-only CRC Library and confirm you can see CRC's published overlays — and that you cannot see CRC drafts, credentials, or live state.
5. Customize one CRC item. Confirm it becomes an independent TBI draft and that the CRC original is untouched.
6. Create one graphic of your own with **Add from siddur**, and one plain custom slide that is not liturgical.
7. Preview both, and confirm nothing reaches your OBS output while you preview.
8. Publish one, then select it from the console and confirm the published version is what comes up.
9. **Inspect** a cue and then **Show** a cue, and say which one you expected to be live.
10. Check `/health` and tell us whether what it says matches what you are actually seeing.

Record in Services feedback (`/services`): the same things Michael records — issues, fallbacks, observations, with context, impact, and whether it suggests a product gap. TBI's entries stay in TBI's workspace.

Only you can judge: readability at TBI's viewing distance and display sizes, Stream Deck button positions for the way you work, how the graphics composite in OBS over your camera, and whether the wording and presentation are right for your congregation.

## What the beta is explicitly testing

The items nobody can verify from a laptop: clean-machine installation, your real hardware, camera composition, viewing-distance readability, coverage of a whole service, and restart/network/emergency recovery. Cross-workspace isolation is also still operationally unverified — `WORKSPACE_ISOLATION_VERIFIED` remains `false` until both congregations have exercised the boundary in practice.
