# Guided sanctuary setup

The operator-facing setup page is `/setup`. It is designed for an existing vMix or OBS computer with Companion and a Stream Deck. It does not install or alter another application automatically.

## Supported CRC path

1. Save a full Companion backup and identify two empty pages.
2. Download the reviewed Companion module from `/setup` and import it through Companion's **Modules** page.
3. Add the **CRC Overlays** connection, pair it with a code from `/setup`, then open the connection's **Presets** and drag a preset onto any button. Every preset is a toggle: press once to show the graphic, press again to animate it out. The two sanitized button-page exports remain available under **Recreate CRC’s exact button layout** for anyone who wants CRC's exact positions.
4. Select vMix or OBS in the setup page, create a named **output connection**, and paste the graphics URL it gives you into a separate 1920 × 1080 browser input.
5. Open the browser input and use **Check graphics connection**. The check reads `/api/state`; it never selects, clears, or changes a graphic.
6. Complete a staffed rehearsal before using the new input on air.

The setup journey deliberately preserves Singular, its browser input, all camera actions, and every existing Companion page. The fallback is switcher-side: remove the new browser input from program and restore the unchanged Singular input.

## Pairing Companion

Companion is paired with a short code, typed once.

1. An owner or editor opens `/setup`, names the computer under **Name this computer (for example, Sanctuary PC)**, and presses **Pair this Companion**.
2. The page shows six digits and says **Enter this code in Companion within 10 minutes**. The code is single use and expires ten minutes after it is created. At most ten unused codes can be waiting at once.
3. In Companion, put those six digits in the connection's **Pairing code** field and save.
4. The module exchanges the code for a **Device token**, stores that token itself, and clears the code. Nobody types or copies the token.
5. Every later request carries the stored device token. The pairing survives Companion restarts, machine restarts, and the operator signing out of the website; it ends only when the device is revoked.

**Control key** is the older shared key. When it is set it is used instead of the device token, so a connection configured before pairing existed keeps working exactly as it did and needs no change. A refused code writes nothing at all: the previous credential stays and the refusal text becomes the connection status.

Setup step 2 ticks itself, and locks, once Companion is actually connected: **Verified — Companion is connected to this workspace.** Until then it reads **This step ticks itself once Companion connects.**

## Connecting the graphics output

The output computer is given a URL, not a code. Nothing has to be typed inside a production graphics input.

1. On `/setup`, name the computer and press **Create an output connection**.
2. The page shows the graphics URL with **Paste this into the browser input. It keeps working after restarts.** and a **Copy the graphics URL** button.
3. Paste it into the compositor's browser input at 1920 × 1080 with transparency enabled.

The compositor's scene or project file stores that URL, and that — not browser storage — is what survives a compositor or machine restart. The operator never pastes a key again. The page mirrors the credential into `localStorage` only so that the same machine still works if the page is later opened without the fragment, and the credential is removed from the visible address bar as before.

**Copy private output URL** remains on the page as the transitional path. It hands out the older `OUTPUT_KEY` URL and keeps working unchanged; it is what to use if a workspace has not been migrated yet.

Setup step 3 ticks itself once a named output connection exists and a graphics browser is present: **Verified — a named graphics output is connected.**

## Paired devices and revocation

Administrators see every paired device on `/access` under **Paired devices**: each row names the device, says whether it is a **Companion** or a **Graphics output**, and shows when it last connected (for example, *Last connected 12 min ago*). **Revoke** removes a device's credential and takes it off the list; a notice inside the panel confirms it.

Revocation is deliberately not instantaneous. A revoked device stops at its next reconnection: every new connection is verified against the database, so the credential is refused the moment the device tries to reconnect. A connection that is already open is not interrupted — the relay does not hold credentials and never kicks a live socket. During a database outage a previously verified credential may still be honoured for up to an hour, because dropping every live graphics output when the database is unreachable would be worse. The page says what happens: **Revoked. This device stops at its next reconnection.**

If a device must stop immediately, take its browser input off program at the switcher — that is the only instantaneous control, and it is the same fallback used for every other graphics failure.

An output credential can read state and nothing else; it cannot show, clear, edit, or publish a graphic. A Companion credential can read state and send live commands, but it can never edit the library or manage accounts. Neither is an owner account, and neither is affected by anyone signing out of Google, a human session expiring, or a password change.

## The scan card

The scan card is the small parchment card with a QR code that sits in the bottom-right corner of the graphics output, under the graphics. It is configured per congregation: a workspace with no card URL has no card at all, no console control, and `/api/bug/qr.svg` answers `404`. It is configured on CRC and **absent on Temple B'nai Israel**.

From **Live control**, the **Scan card** block appears only where the card is configured. **Show scan card** puts it up and **Hide scan card** takes it down; **Page** is an optional label of at most twelve characters shown beside the card. The block says **Clear now also removes the scan card.** — and it does: **Clear now** removes every layer, the card included. **Animate out** leaves the card alone, because it acts on the prayer layer only.

From Companion (module 1.5.0), the actions are **Bug on**, **Bug off**, **Set page**, **Next panel** and **Previous panel**, and two presets ship ready to drop onto a button: **Scan card**, which toggles the card and lights while it is visible, and **Next panel**. The page is checked inside the module before any request leaves it, so an over-long page never reaches the deployment. A deployment with no card configured refuses **Bug on**, **Bug off** and **Set page**, and the refusal becomes the connection status.

The card lives in authoritative live state, so reconnecting a graphics browser restores it and clearing it does not bring it back. The QR image is generated on the server from the configured URL, so changing where the card points is a configuration edit and never a code change.

## Names for this service

An Editor opens `/services`, selects a prepared service, and fills in **Names for this service**. The page says: *Type one name per row. These names are not saved to the library and are removed when this service is archived.*

1. **Name this list (for example, Mi Shebeirach)** — at most 60 characters. It becomes the title shown on air.
2. Type a **Hebrew name**, an **English name**, or both, one row per person. Either channel may be blank; both blank is refused. Each name is at most 60 characters and a list holds at most 120 names.
3. **Names per panel** is a whole number from 4 to 12, 8 by default. It decides how many people appear on one panel.
4. **Put these names in the library** generates the panels. **Remove these names** takes them out again.

The panels appear in the library, in Live control and in Companion under the ordinary multipart convention — a list titled *Mi Shebeirach* with 17 names at 8 per panel becomes **Mi Shebeirach — 01 of 03**, **— 02 of 03**, **— 03 of 03**. Show them like any other graphic; **Next panel** and **Previous panel** walk the set.

The names are held on the prepared service itself, never in the published library, never in a draft, preview or revision, and never in an authoring backup beyond that service. Removing the list or archiving the service removes them in the same write, and restoring an archived service does not bring them back.

**The overflow guard.** Before the panels can go in the library, each generated panel is rendered and measured with the same fit check the editor and `/author/fit-check` use. If a panel overflows, the button is disabled and the page names the panel: *Panel 2 of 3 is too full. Shorten a name or lower Names per panel.* Lower **Names per panel** or shorten a name and it re-measures.

## Access behavior

`/setup` works from the signed-in session. The page first requests `/api/output-url` and `/api/state` without an Authorization header. A `401` response activates the current migration fallback: the operator may enter the existing setup access key, which is sent as a Bearer credential. The key is never placed in the page URL or workspace API.

The legacy private output URL is written directly to the clipboard and is not displayed. It contains output-only access and should remain private. The named output connection's URL is shown on the page so it can be read and re-entered, and it carries output-only access for exactly the same reason.

## Truthful connection status

The setup page can establish that a graphics renderer has recently contacted the service, and — since module 1.4.0 — that a Companion is connected. It cannot establish that:

- vMix or OBS has placed the input on program;
- the program feed contains the graphic;
- a physical Stream Deck button works;
- Companion imported pages into empty locations; or
- the Singular fallback has been rehearsed.

Those claims remain explicit human checks.

## Download safety

The CRC module package and page exports in `public/downloads` are copies of the reviewed Michael handoff artifacts. The page exports have a disabled connection placeholder and contain no control key, device token, or output key. Do not publish full Companion backups or the private connection sheet.

Module **1.5.0** is the current package; **1.4.0** and **1.3.0** stay published so an operator who has not upgraded can still download the version they are running. A 1.4.0 configuration upgrades in place: the connection keeps its device token or control key, its base URL and every existing button, and gains the new actions and presets. A 1.3.0 module keeps working indefinitely on its control key.

For a non-CRC workspace, setup downloads are empty by default. That prevents a second deployment from accidentally serving CRC button pages. Its reviewed module and page paths must be configured explicitly.
