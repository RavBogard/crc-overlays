# CRC Overlays

Configure the overlay deployment URL, pair this connection, then add buttons from **CRC Overlay Controls** presets.

## Pairing

1. On the overlay setup page, an owner or editor creates a code for this computer.
2. Put that code in **Pairing code** here and save the connection.
3. The module exchanges the code for a **Device token**, stores the token, and clears the code. The code is single use and expires ten minutes after it is created.
4. Every later request uses the stored device token. The relationship survives restarts; it ends only when the device is revoked from the access page.

**Control key** remains the older shared credential. When it is set it is used instead of the device token, so an existing connection keeps working untouched. A refused code changes nothing: the previous credential stays in place and the refusal is shown as the connection status.

Cue choices and presets load from the authenticated overlay catalog at connection start. Use **Refresh cue catalog** after new reviewed cues are published. If refresh is unavailable or malformed, the module keeps its last validated cue list.

A press while the realtime connection is down is **sent anyway**. The command path is an ordinary authenticated web request and does not need the live connection, so a press during a reconnect is no longer dropped. The connection status says so, and the confirmation colour arrives when the connection returns.

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

**Red means the graphic is actually on screen.** **Amber means requested, not yet confirmed** — the system accepted the press but no graphics browser has reported the picture settled yet. A red outline with no graphic means the connection to the graphics browser is down.

- **Cue requested** reflects the API's desired state, and paints amber.
- **Cue rendered** requires a fresh renderer heartbeat whose cue and revision match the request and whose phase is settled, and paints red.
- **Scan card visible** is on while the live state carries a scan card.
- **Slot is empty** is on while a slot's text has not been filled in for this service. The slot presets use it to dim the button, so an unfilled slot is visible at a glance before the service.
- **API or renderer disconnected** detects a closed realtime subscription or the absence of a fresh renderer, after a 3 second grace window so a brief reconnect does not flash red.

The two clear buttons — **Animate out** and **Clear now** — are the one exception to the red rule. They carry *Cue rendered* with the cue left blank, which means "the output is confirmed clear", and they stay **green**: nothing is on screen, so red there would say the opposite of what it says everywhere else.

## Variables

Button text can show any of these. The prefix is this connection's name, so `$(overlays:current_name)` reads the variable of a connection named `overlays`.

| Variable | Shown as | Meaning |
| --- | --- | --- |
| `current_name` | Current graphic | The graphic a connected graphics browser reports rendered. Blank while nothing is confirmed rendered. |
| `current_panel` | Current panel | The panel number of that graphic, read from its published name (`Mah Tovu — 01 of 03`). Blank when the name is not multipart. |
| `panel_count` | Panels | How many panels that name declares. Blank when the name is not multipart. |
| `connection` | Connection | `Connected`, `Reconnecting`, or `Disconnected`. Reconnecting is the 3 second grace window before red. |
| `requested_name` | Requested graphic | The graphic the API was asked for, which may not be rendered yet. |
| `requested_cue` | Requested cue | The graphic's **name**, kept under its 1.3.0 spelling so existing buttons do not break. It has always held the name, despite the label. |
| `requested_cue_id` | Requested cue ID | The requested graphic's **id** — the value `requested_cue` sounds like it holds. Blank when nothing is requested. |
| `revision` | Requested revision | The revision of the current request. |
| `renderer_status` | Renderer status | `Rendered`, `Requested`, or `Disconnected`. |
| `bug` | Scan card | `On` or `Off`. `Off` whenever the live state carries no scan card. |
| `bug_page` | Scan card page | The short page beside the scan card. Blank when there is none. |

### Slot variables

A **slot** is a graphic whose text is typed once a week on the overlay site's **This service** page and whose identity never changes. A button pointed at a slot keeps working forever; only the words inside it move.

Each slot publishes one variable, `slot_<key>` — `slot_student_name`, `slot_torah_1` … `slot_torah_7`, `slot_haftarah_1` … `slot_haftarah_3`, `slot_guest_name`, `slot_remember_1` … `slot_remember_3`. The value is the first line of the slot's text, trimmed, cut to 24 characters with an ellipsis if it is longer, because a Stream Deck key is small. An empty slot is an empty string. The variables update by themselves within a few seconds of a Save on **This service**; nobody presses **Refresh cue catalog**.

### Presets

Presets come ready to drop onto a button, in **CRC Overlay Controls**: one per published graphic, coloured by what kind of graphic it is; one per slot, yellow with black text, showing the slot's name over its current value and dimmed while it is empty; and the fixed buttons **Connection and current graphic**, **Current panel**, **Scan card** (a toggle that lights while the card is visible), **Next panel**, **Previous panel**, **Set page**, **Refresh catalog**, **Animate out** and **Clear now**.

"Rendered" describes the graphics browser. It is not proof that the video switcher has the graphics source on program. Never copy the masked control key into actions, variables, logs, screenshots, or shared exports.
