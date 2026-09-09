# CRC Overlays

Configure the overlay deployment URL and its control key, then add buttons from **CRC Overlay Controls** presets.

Cue choices and presets load from the authenticated overlay catalog at connection start. Use **Refresh cue catalog** after new reviewed cues are published. If refresh is unavailable or malformed, the module keeps its last validated cue list.

Each press is assigned a command ID and increasing sequence at activation. Transient server/network failures retry the same command identity. The server can therefore ignore a delayed older request after a newer request from this Companion connection.

Requests time out instead of hanging indefinitely. Polls do not overlap, cached heartbeat freshness continues to age between responses, and responses from an older configuration are ignored.

## Actions

- **Show cue** requests the selected cue with its In animation.
- **Animate cue out** clears only if the selected cue is the requested cue.
- **Animate out** animates whichever graphic is currently requested out.
- **Clear now** immediately cuts the requested graphic.
- **Refresh cue catalog** safely updates cue choices and presets from the authenticated API.

## Feedback

- **Cue requested** reflects the API's desired state.
- **Cue rendered** requires a fresh renderer heartbeat whose cue and revision match the request and whose phase is settled.
- **API or renderer disconnected** detects stale API polling or the absence of a fresh renderer.

"Rendered" describes the graphics browser. It is not proof that the video switcher has the graphics source on program. Never copy the masked control key into actions, variables, logs, screenshots, or shared exports.
