# Installation and onboarding plan

## Decision

CRC Overlays should become a shared service for two congregations, with a separate workspace, catalog, output state, and set of devices for each congregation. The same renderer, Companion module, and authoring product serve both. CRC owns its catalog; the second congregation begins with explicitly selected CRC material copied into its workspace and can then customize that copy without changing CRC.

OAuth is useful for human sign-in and delegated access. It is not the main solution to Michael's installation problem. The product has three distinct trust relationships and they should not share one credential:

| Actor | What it needs | Recommended experience | Credential behavior |
| --- | --- | --- | --- |
| Daniel or the other rabbi | Edit, approve, publish, invite, and revoke | Sign in in an ordinary browser, choose a congregation | Person-bound session with roles and audit identity |
| Companion connection | Read one catalog and send ordered commands | Install the module, add a connection, enter a short pairing code | Device-bound, scoped to one congregation; renewable and individually revocable |
| vMix or OBS browser source | Render one congregation's selected output unattended | Paste one output URL once | Device-bound renderer credential; durable, read/output-only, individually revocable |

Do not put an interactive login inside a vMix or OBS browser source. A broadcast input must recover after application and computer restarts without a person signing in. Do not keep using one shared `CONTROL_KEY` or `OUTPUT_KEY` across both congregations. A leaked or retired device must be revocable without interrupting every other device.

The simplest credible target is therefore **one invitation link, one Companion pairing code, and one renderer URL**, with the module and button pages handled through Companion's supported interfaces. It cannot literally be one browser click because a web service cannot safely add a module, write button pages into Companion, or add an input to vMix/OBS. The product should make those boundaries obvious and reduce everything between them.

## What is causing the current friction

The present Michael handoff is safe, but it asks the installer to understand the implementation. They must install a private `.tgz`, create and name a connection, paste a long control secret, import two page files separately, remap a connection, avoid occupied pages, retrieve a second secret-bearing URL, create a 1920 x 1080 browser input, and interpret rehearsal states. The instructions also expose deployment terminology such as `CONTROL_KEY` and ask Daniel to transmit a production secret privately.

That is several independent setup systems:

1. Companion module distribution.
2. Companion connection authorization.
3. Companion button placement.
4. vMix/OBS browser-source creation.
5. Congregation selection and content ownership.

They should be designed as one onboarding journey, while remaining separate under the hood.

Companion 5 already supports importing a packaged internal module, and its Buttons import can bring in selected pages and remap their connections. That validates the current handoff, but it also defines the limit of the supported automation: the documented UI is still an import workflow. Companion presets are ready-made buttons, but the documented workflow is to drag them onto the grid. The plan should not promise that installing a module also lays out pages or modifies an existing configuration.

## Product model for two congregations

Create these explicit concepts before changing onboarding:

- **Congregation:** CRC or the friend's community. It owns catalogs, drafts, publications, themes, output state, memberships, devices, and audit records.
- **Member:** a person with a role in one or both congregations. Start with Owner, Editor, and Operator. Michael needs Editor/publisher access as well as Operator access to satisfy the user's manual creation/editing requirement; other operators may remain operate-only.
- **Starter collection:** an immutable, versioned selection offered by CRC. Importing it creates new records in the receiving congregation and records provenance. Later CRC changes appear as optional updates with a reviewable diff; they never silently replace the friend's customized material.
- **Control device:** one Companion connection authorized to read and control one congregation. Give it a human label such as `CRC sanctuary Companion`.
- **Renderer device:** one vMix or OBS browser source authorized to render one congregation. Give it a label such as `CRC vMix graphics input` or `Friend sanctuary OBS source`.

Commands, realtime presence, renderer acknowledgements, catalog queries, and publication events must all carry and enforce a congregation ID. Never depend on a congregation ID supplied by the client without checking it against the device credential. Separate output state prevents a cue pressed at CRC from appearing at the friend's congregation.

## Recommended onboarding journey

### Administrator prepares the site

Daniel creates the second congregation, invites the rabbi by email, and selects a CRC starter collection. The rabbi signs in, accepts the invitation, names the congregation, previews the copied material, and confirms the initial import. The product then opens a `Connect your sanctuary` checklist with two cards: **Connect Companion** and **Add graphics output**.

For CRC, the same checklist should recognize already enrolled devices and offer replacement or additional device setup without rotating working credentials.

### Connect Companion

The final experience should be:

1. In Companion, install the product's module from Modules once it is accepted into the store. Until then, choose **Import module package** and select the versioned `.tgz` downloaded from the setup portal. No package-signing capability has been verified. The final neutral product/module name remains a naming decision.
2. Add the connection. Its public deployment address is supplied by the congregation's setup flow/page pack; do not assume one hard-coded CRC URL works for two isolated deployments. Prove prefill/import support during discovery, or provide an explicit copy-address step. A future shared public pairing directory is optional and must not contain private content or live state.
3. On the web checklist, press **Pair Companion**. The site displays a short, single-use code with a ten-minute expiry.
4. Enter the code in the Companion connection and press **Pair**. The module shows the congregation name and connection health. The long-lived credential is never displayed or copied.
5. Import one congregation-specific page pack into confirmed empty pages and map its one placeholder to the paired connection. On a clean, dedicated Companion installation, an optional full starter configuration can be offered; never use it on Michael's existing production configuration.

This proposed portal-to-module enrollment flow is not identical to standards-based OAuth Device Authorization. RFC 8628 instead has the client obtain a device code and short user code, followed by user approval in a browser and client polling. Choose the supported pairing implementation in a bounded discovery task, preferring a maintained standards-based implementation where practical; if RFC 8628 is selected, reverse the code-entry direction to match that standard. Companion does not currently provide native OAuth support, so the module must integrate the flow and credential persistence. Do not assume a proprietary enrollment exchange is simpler to secure. Required properties include short expiry, single use, rate limiting, explicit congregation and capability display before approval, and individually revocable device credentials.

Do not adapt the existing authoring OAuth token directly for Companion. Its `crc.authoring` scope is too broad, and its current consent bootstrap is still based on a shared authoring key. Add separate control-device scopes such as `catalog:read`, `output:control`, and `presence:read`. Prefer a renewable device token family so routine server-side rotation does not require Michael to pair again.

### Add the graphics output

The web checklist creates a renderer device and displays its output URL with a **Copy URL** button. It also shows the exact settings for the selected application:

- **Michael / vMix:** Add Input > Web Browser; paste the URL; width 1920 and height 1080; name it `CRC Overlays`; use the page's alpha transparency; keep the existing Singular input during the trial.
- **Friend / OBS:** Add Source > Browser; paste the URL; width 1920 and height 1080; keep OBS's default transparent body CSS; name it for the congregation. Leave `Shutdown source when not visible` off so renderer presence and state remain continuous, unless rehearsal demonstrates a reason to reload it.

The URL should contain a credential for only that renderer device and congregation. It may remain in the fragment so it is not sent in the initial HTTP request or common server access logs, but the renderer must exchange it for a constrained session and avoid copying it into logs or telemetry. The portal must allow an owner to see the device name, last seen time, and status; revoke it; and create a replacement URL. Do not display the credential again after enrollment. Rotation should support a brief overlap so a new input can be rehearsed before the old input is revoked.

The renderer card completes only when the actual vMix/OBS browser reports fresh presence and the expected congregation. This turns pasting the URL into a checked step rather than asking the installer to infer success from a blank transparent frame.

### Put controls on the Stream Deck

For the first two congregations, publish one reviewed page pack per congregation. Each pack contains navigation, Animate Out, Clear Now, and that congregation's initial prayer collection. It references a neutral placeholder connection name so Companion's supported import screen can map it to the paired connection.

The web checklist asks the installer for intended pages, reminds them to export a backup, and displays thumbnails of the pages before import. It cannot verify that a page is empty unless Companion later exposes an official, supported configuration API for this purpose. For Michael, preserve page placement and muscle memory after the first import. New catalog items should appear as module presets and in the web cue library; page-pack updates should be intentional rather than silently rearranging his Stream Deck.

## Distribution options

| Option | Installer burden | Updates | Fit for two congregations |
| --- | --- | --- | --- |
| Official Companion module store | Search/install module, then pair | Companion shows stable module versions and can install updates independently of core | Best destination; pursue submission, but do not make launch depend on acceptance |
| Versioned `.tgz` from the onboarding portal | Download and use Companion's **Import module package** | Manual package import for module releases | Supported and acceptable interim route |
| Developer-module folder | Configure launcher path and manage unpacked files | Manual and developer-oriented | Exclude from operator instructions |
| Generic HTTP buttons | No custom module package | Button definitions carry protocol details and lose current sequencing/realtime behavior | Do not use as the primary onboarding path |

Store distribution removes the strangest installation step and gives a normal update channel. It does not create a connection, authorize it, place buttons, or add a browser source. Treat acceptance as a distribution improvement, not the entire onboarding strategy. Keep the module generic enough for both communities, with congregation branding and catalog delivered from the service rather than compiled into the package.

## Concrete setup targets

### Michael's existing vMix and Companion computer

Target: an AV lead who already has the approved download and an owner present can add CRC Overlays in **ten minutes or less**, without typing or receiving a long secret, replacing an occupied page, or modifying the Singular connection/input.

This is an unmeasured setup target for steps 1–6. The staffed acceptance rehearsal in step 7 is additional and must not be hidden inside the setup timing claim.

1. Export the existing Companion configuration.
2. Install the store module, or import one `.tgz` during the interim.
3. Add one connection and enter the short pairing code from Daniel's browser session.
4. Import one CRC page pack to two verified empty pages and map its placeholder to the paired connection.
5. Paste one renderer URL into a new vMix Web Browser input at 1920 x 1080.
6. Wait for the checklist to report `Companion connected` and `CRC vMix graphics input connected`.
7. Run Show, fast replacement, Animate Out, Clear Now, Companion restart, vMix input restart, and switcher-side fallback to Singular.

After successful migration, Michael's weekly use requires no login and no setup page. Companion and the browser input reconnect with their device credentials.

### Friend's existing OBS and Companion computer

Target: the rabbi can accept an invitation, copy selected CRC material, connect the existing software, and display a first test cue in **fifteen minutes or less**, without access to CRC's live output or unpublished work.

The underlying existing-workstation connection target is the same ten minutes used for Michael; the additional allowance covers invitation and starter selection. Full rehearsal, visual/content customization, and acceptance are separate from this unmeasured first-connection target.

1. Accept the invitation and create/name the second congregation.
2. Review and import a selected CRC starter collection as independent copies.
3. Install the same Companion module and pair it to the second congregation.
4. Import that congregation's starter page pack into empty pages.
5. Add one 1920 x 1080 OBS Browser Source using its renderer URL and default transparent CSS.
6. Confirm the web checklist sees both devices, then test Show, replacement, Animate Out, Clear Now, Companion restart, and OBS restart.
7. Customize one copied prayer and theme element, publish it, refresh the Companion catalog, and confirm CRC is unchanged.

The product should not ask the friend to install vMix, OBS, Companion, or a Stream Deck driver when those are already present. Installation begins from their existing production tools.

## Acceptance tests

### Isolation and authorization

- A CRC control device cannot read the friend's private drafts, issue commands to the friend's output, or observe its renderer presence; the reciprocal checks also pass.
- A renderer token cannot send control commands or author content.
- An Operator cannot invite members, alter roles, approve, or publish.
- Revoking one Companion or renderer device disconnects only that device within one minute and leaves the other devices and congregation operating.
- A pairing code expires, is single-use, is rate-limited, names the congregation and capabilities at approval, and cannot be exchanged for authoring access.
- Restarting Companion, vMix, OBS, or the computer does not require an interactive login.

### Existing-system safety

- The Michael page import leaves every existing Companion page, connection, camera action, and Singular control unchanged.
- The CRC browser input is a separate vMix input, and switcher-side fallback works when the cloud service or Companion connection is unavailable.
- Import cancellation and connection-pairing cancellation make no partial production changes.
- A dated Companion backup restores the pre-install state.

### Usability

- A first-time installer completes Michael's supported path in ten minutes or less with no documentation outside the checklist.
- The friend completes invitation through first OBS test cue in fifteen minutes or less.
- Neither installer sees `CONTROL_KEY`, `OUTPUT_KEY`, bearer token, tenant UUID, OAuth scope, database, relay, or WebSocket terminology.
- Blank output is distinguishable from disconnected output: the checklist confirms renderer presence, and Companion separately identifies requested and rendered state.
- Error messages name the failed boundary and the next action: module not installed, pairing expired, Companion offline, renderer absent, wrong congregation, or catalog unavailable.

### Content adaptability

- Copying the starter collection records CRC provenance and creates second-congregation-owned records with new identifiers.
- The friend can customize and publish copied material without affecting CRC.
- A later CRC starter update is reviewable item by item and never silently overwrites customized content.
- Both page packs use the same module binary while showing the correct congregation's names and cues.

## Delivery sequence

1. **Tenant boundary first.** Add congregation ownership and authorization enforcement to catalogs, drafts, publications, commands, state, realtime channels, and device presence. Migrate CRC data into an explicit CRC congregation before enrolling the friend.
2. **Device credentials.** Replace global control/output secrets at the product edge with labelled per-device credentials, pairing, renewal, revocation, last-seen reporting, and audit events. Keep environment keys only as temporary internal migration credentials.
3. **Human identity and invitations.** Add browser sign-in, congregation membership, roles, and invitation acceptance. Reuse the existing authorization-code/PKCE components where appropriate, but replace shared-key consent for ordinary users with an actual identity session.
4. **Guided setup.** Build the two-card sanctuary checklist, application-specific instructions, connection tests, and downloadable interim module/page packs.
5. **Starter collection copy.** Implement selection, provenance, independent ownership, and explicit later-update review.
6. **Companion distribution.** Prepare the public module repository, support/help text, release process, and Bitfocus submission. Continue shipping a tested `.tgz` until the store path is available.
7. **Rehearse both systems.** Run the complete Michael/vMix and friend/OBS acceptance scripts on their real Companion versions, Stream Decks, networks, and restart behavior.

## Unknowns to resolve in rehearsal or a short technical spike

- Whether Bitfocus will accept a module for a two-congregation hosted service, what public repository/maintenance commitments it requires, and the review lead time. Do not promise store availability before acceptance.
- Whether Michael's production Companion is exactly 5.x and which page slots are actually unused on rehearsal day.
- Whether the friend's Companion version and Stream Deck geometry can use the same page dimensions or needs a separately arranged pack.
- Whether Companion's current module secrets persistence behaves correctly across export/import, machine migration, and token renewal for this module. Test behavior; never assume secrets will travel in a shared page pack.
- Whether vMix/OBS reload or cache behavior exposes any stale renderer session after credential rotation. Test replacement with overlap, restart, and cache refresh.
- Whether a ten-minute Michael target and fifteen-minute friend target hold for someone who did not build the system. Measure with observation and remove every step that prompts a vocabulary question.

## Primary sources

- [Bitfocus Companion: Modules](https://companion.free/user-guide/beta/config/modules/) — modules are independently downloadable plugins; Companion supports its store, `.tgz` module-package import, and offline bundles.
- [Bitfocus Companion: Import / Export](https://companion.free/user-guide/v5.0/config/import-export/) — configuration backup, selected-page import, and connection remapping are supported; full reset is a distinct and destructive option.
- [Bitfocus Companion: Creating buttons](https://companion.free/user-guide/beta/config/buttons/creating/) — module presets are ready-made buttons that the user drags onto the layout.
- [Bitfocus Companion: OAuth authentication](https://companion.free/for-developers/module-development/connection-advanced/oauth/) — Companion currently has no native OAuth support; modules implement the flow and callback themselves, and automatic browser opening cannot be assumed for remote configuration.
- [Bitfocus Companion: Packaging a module](https://companion.free/for-developers/module-development/module-lifecycle/module-packaging/) — the supported build tooling produces a distributable `.tgz` package and packaged builds require testing.
- [vMix: Web Browser input](https://www.vmix.com/help28/WebBrowser.html) — a full URL, pixel width/height, and alpha transparency are supported.
- [OBS: Browser Source](https://obsproject.com/kb/browser-source) — URL, width, height, default transparent CSS, and visibility/reload behavior are configurable properties.
- [RFC 8628: OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628.html) — defines short user-code approval for browserless or input-constrained clients and its required security considerations.
- [RFC 8252: OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html) — requires authorization code with PKCE for public native clients and warns against treating distributed client secrets as confidential.
