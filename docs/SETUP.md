# Guided sanctuary setup

The operator-facing setup page is `/setup`. It is designed for an existing vMix or OBS computer with Companion and a Stream Deck. It does not install or alter another application automatically.

## Supported CRC path

1. Save a full Companion backup and identify two empty pages.
2. Download the reviewed Companion module and the two sanitized button-page exports from `/setup`.
3. Import the module through Companion's **Modules** page, add the CRC Overlays connection, and import the pages into the empty locations.
4. Select vMix or OBS in the setup page, copy the private output URL, and paste it into a separate 1920 × 1080 browser input.
5. Open the browser input and use **Check graphics connection**. The check reads `/api/state`; it never selects, clears, or changes a cue.
6. Complete a staffed rehearsal before using the new input on air.

The setup journey deliberately preserves Singular, its browser input, all camera actions, and every existing Companion page. The fallback is switcher-side: remove the new browser input from program and restore the unchanged Singular input.

## Access behavior

The page first requests `/api/output-url` and `/api/state` without an Authorization header. This supports the planned signed-in browser session when that becomes available. A `401` response activates the current migration fallback: the operator may enter the existing setup access key, which is sent as a Bearer credential. The key is never placed in the page URL or workspace API.

The copied output URL is written directly to the clipboard and is not displayed. It contains output-only access and should remain private.

## Truthful connection status

The setup page can establish that a graphics renderer has recently contacted the service. It cannot establish that:

- vMix or OBS has placed the input on program;
- the program feed contains the graphic;
- a physical Stream Deck button works;
- Companion imported pages into empty locations; or
- the Singular fallback has been rehearsed.

Those claims remain explicit human checks. Companion health is confirmed by the operator from Companion's own connection status.

## Download safety

The CRC module package and page exports in `public/downloads` are copies of the reviewed Michael handoff artifacts. The page exports have a disabled connection placeholder and contain no control or output key. Do not publish full Companion backups or the private connection sheet.

For a non-CRC workspace, setup downloads are empty by default. That prevents a second deployment from accidentally serving CRC button pages. Its reviewed module and page paths must be configured explicitly.
