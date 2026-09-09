# CRC broadcast rehearsal

Use the private connection sheet in `work/CONNECTIONS.md` for the output-only URL. The public controller address alone is not the graphics source. Keep key-bearing URLs and Companion exports out of Git and shared screenshots.

## Current workstation readiness

- Bitfocus Companion 5.0.5 is installed and running at `http://localhost:8000`.
- The `CRC Overlays` v1.1.0 native connection and the older HTTP test connection are enabled.
- Companion page 2, **CRC Morning Rehearsal**, contains the existing 20 cue buttons plus Clear and Animate out. Preserve that page during preparation.
- Page 2 has seven free cells. Even after the Birchot Hashachar 4 compatibility alias is retired, it cannot hold all nine newer cues without replacing an existing control. Put the nine newer cues on a separate, verified-empty rehearsal page.
- The configured Companion surface is the emulator. Built-in Stream Deck support is enabled, but no physical Stream Deck or Stream Deck desktop software was found.
- OBS Studio 32.1.2 and vMix 27.0.0.81 are installed. Neither was running during the readiness inspection, so browser-source and program-output checks remain rehearsal work.

This inventory was read-only. It did not show a cue, clear a graphic, switch a camera, launch a broadcast application, or change Companion.

## Graphics input

Use a 1920 × 1080 Web Browser input in vMix, or a Browser source in OBS, with the private output-only URL. Preserve transparency; do not use chroma keying.

For OBS, leave **Shutdown source when not visible** and **Refresh browser when scene becomes active** off. These settings let the renderer retain its connection and current graphic across scene changes.

## Rehearsal sequence

1. Open the output renderer and the controller. Confirm the controller has a catalog and reports a connected renderer.
2. In Companion, confirm the native CRC connection is healthy and refresh its cue catalog after any newly published cues.
3. Verify bottom, left, right, bilingual, and original-English layouts in the actual 1920 × 1080 program composition. Check long text, titles, the logo area, and safe margins.
4. Exercise Animate out and Clear during entrance, hold, and exit. Clear must always remove the graphic immediately.
5. Press several cue buttons quickly. The final button pressed must become the final graphic, and Companion feedback must settle on that cue.
6. Switch cameras with an overlay present. Confirm the overlay remains correct in program output.
7. Reload the graphics browser while a cue is selected. The selected cue should return after reconnection.
8. Interrupt the renderer network connection. The current graphic should hold while status becomes unavailable. Restore the connection and confirm status recovers. Hide the browser source if the renderer cannot recover safely.
9. Finish with Clear and confirm program output is clean.

“Rendered” means the browser acknowledged the cue. It does not prove the graphic is visible on air. Always verify program output.

## Completion boundary

The workstation inventory and Companion page audit are complete. The remaining acceptance checks require a staffed rehearsal: broadcast compositing in OBS or vMix, camera-linked controls, physical Stream Deck operation if one will be used, network recovery, and a complete service-order run.
