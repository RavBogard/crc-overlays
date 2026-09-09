# CRC broadcast rehearsal

Use the private connection sheet in `work/CONNECTIONS.md` for the output-only URL. The public controller address alone is not the graphics source. Keep the key-bearing URL and Companion exports out of Git and shared screenshots.

## Graphics input

Use a 1920 × 1080 Web Browser input in vMix, or Browser source in OBS, with the output-only URL. Place it above the camera image. The output is transparent outside the graphic; no chroma key is needed. vMix documents native browser alpha support in its [Web Browser guide](https://www.vmix.com/help29/WebBrowser.html).

For OBS rehearsal, keep the browser source loaded between scene changes: leave “Shutdown source when not visible” and “Refresh browser when scene becomes active” off. OBS documents these source options in its [Browser Source guide](https://obsproject.com/kb/browser-source). This lets Companion animate graphics without recreating the page whenever a scene changes.

## Operator checks

1. Open the hosted controller and confirm the catalog loads. Add the output to the broadcast app and confirm a connected renderer appears.
2. Show a bottom cue, a left cue, and Thank you on the right. Check Hebrew marks, title separation, readable text, and camera framing in the broadcast app's program preview.
3. Press Animate out; the entire graphic should leave. Press another cue, then Clear immediately during its entrance; all graphics should disappear.
4. Change cues rapidly. The final pressed cue must be the final graphic, and Companion should settle on that cue.
5. Switch camera shots while the graphic stays up. Confirm the overlay covers the intended part of the shot.
6. Reload the graphics browser while a cue is selected. The selected cue should return without another button press.
7. On a rehearsal machine, briefly interrupt its network. The current graphic should hold; controller/Companion status should report lost contact. Restore the network and confirm current state returns. To remove a held graphic during an outage, hide the graphics input in vMix/OBS.
8. Finish with Clear immediately and verify the program preview is clear.

“Rendered” means a graphics browser acknowledged the cue; it does not prove that the graphics input is on air. The controller's embedded preview does not count as a renderer.

## Completion boundary

Browser rendering, source guards, native Companion software commands, and a local application restart have been exercised. Physical Stream Deck operation, broadcast compositing, camera-linked production buttons, and a complete service remain separate checks. Keep the current production system available until that rehearsal is complete.
