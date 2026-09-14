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

## Feedback

- **Cue requested** reflects the API's desired state.
- **Cue rendered** requires a fresh renderer heartbeat whose cue and revision match the request and whose phase is settled.
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

Two presets, **Connection and current graphic** and **Current panel**, come ready to drop onto a button.

"Rendered" describes the graphics browser. It is not proof that the video switcher has the graphics source on program. Never copy the masked control key into actions, variables, logs, screenshots, or shared exports.
