# CRC Overlays

Configure the overlay deployment URL, pair this connection, then add buttons from **CRC Overlay Controls** presets.

## Pairing

1. On the overlay setup page, an owner or editor creates a code for this computer.
2. Put that code in **Pairing code** here and save the connection.
3. The module exchanges the code for a **Device token**, stores the token, and clears the code. The code is single use and expires ten minutes after it is created.
4. Every later request uses the stored device token. The relationship survives restarts; it ends only when the device is revoked from the access page.

**Control key** remains the older shared credential. When it is set it is used instead of the device token, so an existing connection keeps working untouched. A refused code changes nothing: the previous credential stays in place and the refusal is shown as the connection status.

Cue choices and presets load from the authenticated overlay catalog at connection start. Use **Refresh cue catalog** after new reviewed cues are published. If refresh is unavailable or malformed, the module keeps its last validated cue list.

Each press is assigned a command ID and increasing sequence at activation. Transient server/network failures retry the same command identity. The server can therefore ignore a delayed older request after a newer request from this Companion connection.

Requests time out instead of hanging indefinitely. The module holds a realtime subscription with its own heartbeat rather than polling, renderer presence continues to age between frames, and responses from an older configuration are ignored.

## Actions

- **Show cue** requests the selected cue with its In animation.
- **Toggle cue** shows the cue with its In animation, or animates it out if it is already the requested cue.
- **Animate cue out** clears only if the selected cue is the requested cue.
- **Animate out** animates whichever graphic is currently requested out.
- **Clear now** immediately cuts the requested graphic.
- **Refresh cue catalog** safely updates cue choices and presets from the authenticated API.
- **Bug on** shows the scan card, keeping whichever page is already set.
- **Bug off** hides the scan card and its page.
- **Set page** shows the scan card with the page typed into the action. A page is at most twelve characters of letters, digits, spaces and light punctuation; a longer or unusual page is refused here, before anything is sent.
- **Next panel** shows the next panel of the multipart graphic on screen, wrapping from the last panel to the first. From a single-part graphic, a cleared output or an unknown graphic it shows panel 01 of the **Panel set** chosen in the action; with **None** chosen it does nothing.
- A **Panel set** listed as *“Mi Shebeirach (names for this service)”* is a names list an editor typed into one service, not the published graphic of that name. The two never mix: Next and Previous panel stay inside whichever set is on screen, so a names list can share its title with a published set, or with another service's list, without either one stepping into the other.
- **Previous panel** is the same step backward, wrapping from the first panel to the last.

**Clear now** removes the scan card along with the graphic. **Animate out** leaves the card alone. If the deployment has no scan card set up, these actions are refused and the refusal is shown as the connection status.

## Feedback

- **Cue requested** reflects the API's desired state.
- **Cue rendered** requires a fresh renderer heartbeat whose cue and revision match the request and whose phase is settled.
- **Scan card visible** is on while the live state carries a scan card.
- **API or renderer disconnected** detects a closed realtime subscription or the absence of a fresh renderer, after a 3 second grace window so a brief reconnect does not flash red.

## Variables

Button text can show any of these. The prefix is this connection's name, so `$(overlays:current_name)` reads the variable of a connection named `overlays`.

| Variable | Shown as | Meaning |
| --- | --- | --- |
| `current_name` | Current graphic | The graphic a connected graphics browser reports rendered. Blank while nothing is confirmed rendered. |
| `current_panel` | Current panel | The panel number of that graphic, read from its published name (`Mah Tovu — 01 of 03`). Blank when the name is not multipart. |
| `panel_count` | Panels | How many panels that name declares. Blank when the name is not multipart. |
| `connection` | Connection | `Connected`, `Reconnecting`, or `Disconnected`. Reconnecting is the 3 second grace window before red. |
| `requested_name` | Requested graphic | The graphic the API was asked for, which may not be rendered yet. |
| `requested_cue` | Requested cue | The same value under its 1.3.0 name, kept so existing buttons do not break. |
| `revision` | Requested revision | The revision of the current request. |
| `renderer_status` | Renderer status | `Rendered`, `Requested`, or `Disconnected`. |
| `bug` | Scan card | `On` or `Off`. `Off` whenever the live state carries no scan card. |
| `bug_page` | Scan card page | The short page beside the scan card. Blank when there is none. |

Four presets come ready to drop onto a button: **Connection and current graphic**, **Current panel**, **Scan card** (a toggle that lights while the card is visible) and **Next panel**.

"Rendered" describes the graphics browser. It is not proof that the video switcher has the graphics source on program. Never copy the masked control key into actions, variables, logs, screenshots, or shared exports.
