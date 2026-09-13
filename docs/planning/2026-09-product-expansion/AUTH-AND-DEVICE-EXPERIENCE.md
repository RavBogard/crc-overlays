# People, devices, and simple setup

Status: approved product decisions with CRC account/setup foundations deployed; TBI device acceptance remains pending.

## Goal

An invited operator can connect an existing production workstation without learning API keys, module development, or infrastructure. CRC uses vMix and Companion/Stream Deck. The second congregation uses OBS and Companion/Stream Deck and can browse the complete current and future published CRC library, then customize independent local copies. Exactly two congregations are in scope.

## Findings

- Singular's documented vMix path is to create a Web Browser input and paste an output URL. This is the usability baseline to match.
- Our output already works as a hosted browser page. Michael does not need a separate overlay renderer installation, Node.js, or a local application server.
- Our handoff combines several separate jobs: module distribution, authentication, importing button pages, adding a video input, preserving the existing setup, and rehearsal. OAuth addresses authentication only.
- Current web and Companion access uses a deployment-wide control key. Output has a separate deployment-wide key. Those are not individual user accounts or individually manageable devices.
- Existing OAuth is for MCP authoring clients. Its consent flow bootstraps from an authoring/control key. It does not provide a complete invited-user experience or Companion device pairing.
- Current authoring and live state are CRC-specific. A second congregation cannot safely be added through branding and a second password alone.

## Proposed product decisions

### People sign in; video inputs do not

Use invitation-only accounts for Daniel, Michael, the other rabbi, and their authorized operators. Default an account with access to one congregation into that congregation. Show the congregation name prominently. If Daniel has access to both, switching the management workspace must never retarget an already paired device or active output.

Choose a maintained authentication service/library at implementation discovery. Support an email sign-in code or link without requiring a particular organization's Google or Microsoft account. A familiar Google/Microsoft sign-in can be added when the actual accounts justify it. OpenID Connect is the relevant identity standard for provider sign-in; a bespoke general identity provider is outside scope.

Keep the role model small: administrator, editor/publisher, and operator. Operator access can operate approved cues and pair authorized output/control devices, but cannot edit sacred text, publish changes, or invite people. A display device can render approved content and report its own status; it cannot issue show/clear commands or author anything. AI authoring remains separate and explicitly scoped to its congregation.

### Output setup remains a durable copy-and-paste URL

In the setup flow, name the output (for example, CRC sanctuary vMix), then choose **Copy output URL**. Paste it into a 1920 x 1080 browser input/source. Do not make the operator type a separate key or sign in inside OBS/vMix.

Issue a distinct opaque display credential for each named output, bound to one congregation and its broadcast channel. The URL should continue working after a browser-source refresh or computer restart. Human logout/session expiry must not interrupt paired devices. Internal short-lived transport credentials may refresh automatically; they must not cause a scheduled on-air login interruption.

Treat the URL as private display access, not a public sharing link. Provide **Replace output link** and **Disconnect device** in device management without rotating every congregation credential. Define and test revocation behavior for existing sockets, reloads, and retained frames. A revocation is not evidence the frame disappeared from program: the switcher remains the independent emergency hide.

Login errors, pairing QR codes, and setup instructions must never appear on the program output. Setup diagnostics belong in the control page. A brand-new unconnected output should be transparent; an established output follows the explicitly documented last-frame/recovery policy.

### Companion gets a connection flow

Target experience: add the module, select **Connect**, authorize the named Companion device in a normal browser, and return to a connected module whose cue presets have loaded.

Investigate authorization-code/PKCE with a supported callback first where Companion can support it. A standard device authorization flow is an alternative when opening/receiving the browser callback is impractical: show a short-lived code and verification address, approve the named congregation/device in a browser, and let the module receive its scoped credential. Do not call a proprietary short-code exchange OAuth unless it implements the standard.

Device pairing must include the congregation and device name before confirmation, bounded expiry, one-use authorization, rate limits, and revocation. Store long-lived device credentials in Companion's supported secret storage; never include them in shared page packs.

Whether the first release uses the full pairing flow or an interim one-time connection code depends on a bounded compatibility spike against the actual Companion version. The acceptance criterion is no human handling of a persistent control key. Do not reuse the output credential for Companion control.

### Button installation is its own product surface

Publish a supported module package/distribution route, and provide reviewed page packs for each congregation. Browser authorization does not install a Companion module or safely choose unused pages. Do not promise one-click installation until the supported Companion integration surface proves it.

The setup guide should ask for unused target pages, preserve existing camera/Singular actions, and keep clear/navigation locations predictable. A programmatic importer, if supported, must show the exact changes and refuse occupied pages by default. The manual fallback should be a short supported page-import procedure, not a full-configuration replacement.

## Target setup journey

1. Accept invitation and open **Set up this computer**. Congregation is already selected for single-congregation members.
2. Choose vMix (CRC) or OBS (friend); name the output; copy its URL. Add the browser input/source using concise application-specific instructions.
3. Connect Companion using the supported module and its pairing flow.
4. Add the congregation's approved pages to explicitly chosen unused pages.
5. Run the guided connection check. Show separate confirmations for output connected, Companion connected, test graphic rendered, and operator-confirmed switcher visibility. Test output changes require an explicitly selected off-program test destination or an operator-started rehearsal.

Targets, not measured claims: under three minutes to obtain a working graphics input; under ten minutes for the complete first setup once OBS/vMix and a compatible Companion are installed; zero routine setup steps on subsequent services. Rehearsal time is measured separately and never hidden in these timing goals.

## Acceptance scenarios

- An operator who has not read repository documentation completes setup from the invitation and setup screen.
- No terminal commands, source checkout, database access, environment variables, or persistent shared API-key copying.
- OBS and vMix restart without interactive sign-in. Human account logout does not disconnect the broadcast devices.
- An ordinary website/identity-provider failure cannot unnecessarily stop already-authorized playback. Document the remaining network/hosting dependencies rather than promising offline operation.
- Two congregations operate concurrently: show, clear, publication, device revocation, and reconnect in one never affect the other.
- Pairing a second congregation requires explicit authority; editing a URL, room name, or client-side workspace selector cannot grant access.
- Importing/updating pages preserves unrelated buttons, camera actions, and stable cue IDs. Every operating page has immediate access to emergency removal.
- A graphics browser acknowledgement never becomes an unqualified on-air indicator. Program visibility is operator-confirmed unless a verified switcher integration provides it.
- Broken sign-in, an unavailable editor, and an unavailable output produce distinct operator messages.

## Sequence and decision gates

1. Name and isolate the two congregation environments before connecting another congregation's devices.
2. Establish invited people and per-device credentials, keeping existing CRC output URLs working through an explicit migration period.
3. Simplify output setup and device management; validate on the actual vMix/OBS machines.
4. Prove supported Companion pairing and page installation in a disposable configuration; then release the setup flow.
5. Rehearse revocation, restart, update, and simultaneous operation. Retire shared-key onboarding only after replacement paths work.

The identity vendor, automatic Companion page import feasibility, and exact per-device credential lifecycle remain implementation-discovery choices. They do not prevent adopting the product behavior above.

## Sources checked

- Singular output URL: https://support.singular.live/hc/en-us/articles/360020784391-Singular-Output-URL
- Singular and vMix: https://support.singular.live/hc/en-us/articles/360012717332-Singular-and-vMix
- OBS browser source: https://obsproject.com/kb/browser-source
- OpenID Connect overview: https://openid.net/developers/how-connect-works/
- OAuth device authorization grant: https://www.rfc-editor.org/rfc/rfc8628.html
- Project evidence: `app/api/output-url/route.ts`, `lib/server.ts`, `docs/MCP.md`, `work/michael-handoff/SETUP-GUIDE.md`, `relay/src/protocol.ts`, and `db/authoring.sql`.
