# CRC overlay operator quick start

## Set this computer up once

Do this once per computer, on module 1.4.0 or newer. After it, nothing is pasted again.

Module **1.5.0** is the current package and adds the scan-card and panel actions. A 1.4.0 connection upgrades in place — import 1.5.0 over it and the connection keeps its device token or control key, its base URL and every button you already made; the new actions and presets simply appear.

1. On `/setup`, name the Companion computer under **Name this computer (for example, Sanctuary PC)** and press **Pair this Companion**. The page shows six digits and says **Enter this code in Companion within 10 minutes**.
2. In Companion, put those six digits in the connection's **Pairing code** field and save. The module stores a **Device token** itself and clears the code. The code is single use and expires after ten minutes; ask for a fresh one if it lapses.
3. On `/setup`, name the output computer and press **Create an output connection**, then **Copy the graphics URL**. Paste it into the 1920 × 1080 browser input in OBS or vMix, transparency enabled. **It keeps working after restarts** — the compositor's scene file now holds the connection, so nobody re-enters a key after a restart.

**Control key** is the older shared key. If it is set it is used instead of the device token, so a connection set up before 1.4.0 keeps working untouched and does not have to be paired. **Copy private output URL** likewise still hands out the older output URL; it is the transitional path for a workspace that has not moved over.

If a code is refused, nothing changes: the previous credential stays and the refusal shows as the connection status.

## Before rehearsal

1. Open Companion at `http://localhost:8000`. Confirm the **CRC Overlays** connection is enabled and healthy.
2. Confirm the graphics browser input is open. `/health` says **Companion connected** with the module version and how long ago it was last seen, or **No Companion connected**.
3. After graphics are published, use the CRC module's **Refresh cue catalog** action before expecting new choices or presets.
4. Verify the program monitor before rehearsal begins. Companion feedback reports renderer acknowledgement, not what is on air.

## During the service

- Press a cue button once and verify the program monitor.
- Use **Animate out** for the normal exit.
- Use **Clear now** when the graphic must disappear immediately.
- If feedback becomes unavailable, stop issuing cues until the renderer connection is understood. Hide the browser source if a safe recovery is not immediate.
- Do not edit or publish cues from the live operating surface during a service.

## The scan card

The scan card is the small card with a QR code in the bottom-right corner of the output. It sits **under** the graphics, so a panel or lower third that reaches that corner covers it. It is set up per congregation: Central Reform Congregation has one, **Temple B'nai Israel does not**, and where there is none the control is not shown at all.

- In **Live control**, the **Scan card** block has **Show scan card** / **Hide scan card** and an optional **Page** of at most twelve characters.
- In Companion, use **Bug on**, **Bug off** and **Set page**. The **Scan card** preset toggles the card and lights while it is visible.
- **Clear now** removes the scan card along with the graphic. **Animate out** leaves the card alone.
- **Next panel** and **Previous panel** work on any multipart graphic — names, Mourner's Kaddish, anything named `— 01 of 03`. From panel *n* they go to *n+1* or *n-1* and wrap at each end. From a single-part graphic or a cleared output they show panel 01 of the set chosen in the action's **Panel set** option; with **None** chosen nothing is sent. The **Next panel** preset ships with no set chosen.

## Names for this service

An Editor prepares these before the service, on **Prepared services** (`/services`), under **Names for this service**.

1. **Name this list (for example, Mi Shebeirach)** — this is what appears on air.
2. Type a **Hebrew name**, an **English name**, or both, one row per person. Either may be blank; both blank is refused.
3. **Names per panel** is 4 to 12, 8 by default.
4. **Put these names in the library**. If a panel is too full the button stays disabled and the page says which one — *Panel 2 of 3 is too full. Shorten a name or lower Names per panel.*

The panels then appear in Live control and in Companion as **Mi Shebeirach — 01 of 03**, **— 02 of 03**, **— 03 of 03**. Show them like any other graphic and use **Next panel** to walk the set.

These names are never saved to the library. **Remove these names** takes them out, and archiving the service removes them in the same write; restoring the service does not bring them back.

## Button text and presets

Two presets come ready to drop onto a button: **Connection and current graphic** and **Current panel**. Both live in the connection's **Presets**, beside the per-graphic toggles.

Button text can show any of these variables. The prefix is the connection's name, so `$(overlays:current_name)` reads a connection named `overlays`.

| Variable | Shown as | Meaning |
| --- | --- | --- |
| `current_name` | Current graphic | The graphic a connected graphics browser reports rendered. Blank while nothing is confirmed rendered. |
| `current_panel` | Current panel | That graphic's panel number, read from its published name (`Mah Tovu — 01 of 03`). Blank when the name is not multipart. |
| `panel_count` | Panels | How many panels that name declares. Blank when the name is not multipart. |
| `connection` | Connection | `Connected`, `Reconnecting`, or `Disconnected`. Reconnecting is the 3 second grace window before red. |
| `requested_name` | Requested graphic | The graphic that was asked for, which may not be rendered yet. |
| `requested_cue` | Requested cue | The same value under its 1.3.0 name, kept so existing buttons do not break. |
| `revision` | Requested revision | The revision of the current request. |
| `renderer_status` | Renderer status | `Rendered`, `Requested`, or `Disconnected`. |

`current_panel` and `panel_count` are read from the published multipart name convention and are blank whenever a name does not match it. They are never guessed.

## Author or correct a cue

1. Open `/author` signed in as an Administrator or Editor.
2. Import an existing cue to keep its ID, or create a draft from a supported template.
3. Select authoritative source blocks. Bilingual drafts require matching Hebrew and transliteration block pairs in the same order. Original-English drafts accept only source blocks marked for that role.
4. Set the title, layout, and font sizes, then save. Saves use the draft version to prevent one editor from overwriting another.
5. Generate the preview. Review the actual 1920 × 1080 rendering and resolve every overflow or collision warning.
6. Approve that exact saved preview. Any later edit invalidates the approval.
7. Publish the approved saved version. The published revision is available to renderers, but publishing does not put it on air.
8. Refresh the Companion cue catalog, then add or update the rehearsal button. Published revisions remain visible in the editor and can be selected explicitly for rollback.

The preview contains no live command or acknowledgement state. Use the rehearsal renderer and program monitor for operational validation.

## MCP authoring workflow

An MCP client connects to the hosted `/api/mcp` endpoint through OAuth discovery with the `crc.authoring` scope. Available tools cover source search, templates, draft import/create/update, preview generation, publishing, revision listing, and rollback.

MCP preview generation does not replace browser review. Open the returned preview in the web editor, approve the exact saved version there, and publish only while that review receipt is current.

Connecting opens a consent page in the browser; approve it signed in as an Administrator or Editor, the same sign-in as the rest of the site. There is no key to store in an MCP configuration file or this guide. `prepare_service_from_setlist` builds a prepared service on `/services` from a planned service on centralreform.live (CRC only; see `docs/MCP.md`).

## Companion rehearsal pages

Page 2, **CRC Morning Rehearsal**, and page 3, **CRC Morning Continued**, contain the morning library. The density refresh removes five redundant compatibility buttons, leaving 16 cue buttons on page 2 and eight on page 3. Existing clear and navigation controls retain their locations. The original page 3 sequence was:

1. Yotzer Or (short)
2. Yotzer Or 1
3. Yotzer Or 2
4. Ahava Rabbah Ahavtanu (Partial)
5. Vahavta 1
6. Vahavta 2
7. Mi Chamocha (Sat 1)
8. Mi Chamocha (Sat 2)
9. Siyahamba

The fourth Birchot Hashachar cue is a compatibility alias and should not receive a new visible preset once its catalog entry is marked hidden. The three consolidated Birchot panels remain visible.

Create the new page only after verifying it is empty or unused. Use native **Show cue** actions, add Clear and Animate out controls if the page will be operated directly, and test it only in a staffed rehearsal.

After the catalog changes, prepare page-only import candidates from a fresh full Companion backup:

```powershell
python scripts/prepare-companion-catalog.py `
  work/companion-backup.companionconfig `
  lib/cues.json `
  work/catalog-sync
```

The script reads gzip or plain JSON, accepts only page 2 named **CRC Morning Rehearsal** and page 3 named **CRC Morning Continued**, and never contacts Companion. It removes a hidden cue button only when every action on that button is the native `show_cue` action; mixed actions cause the preparation to fail. Visible cue labels are refreshed while button settings and feedbacks remain intact. Review the two page-only candidates and the count-only report before importing them in Companion. Empty cells left by removed aliases remain empty.

## Recovery

- Wrong graphic: press **Clear now**, verify program is clean, then select the correct cue.
- Renderer disconnected: hide the browser source, restore the renderer connection, and verify a rehearsal cue before returning it to program.
- Companion catalog stale: refresh the native cue catalog; do not rebuild the connection during a live service.
- Published cue is wrong: choose the intended published revision in the editor and perform an explicit rollback, then refresh Companion.
- A computer must stop controlling graphics: an administrator opens `/access`, finds it under **Paired devices**, and presses **Revoke**. That device stops at its next reconnection; a connection that is already open is not interrupted. To stop a picture immediately, take the browser input off program at the switcher.
- A device was revoked by mistake, or the pairing is lost: pair the computer again from `/setup`. A new code and a new device token replace the old ones; nothing else on the computer changes.
