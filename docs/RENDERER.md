# Renderer fidelity boundary

The renderer implements refreshed CRC lower-third, left-panel, and right-panel geometry at a 1920 × 1080 design size. The visual language takes a restrained palette and circular rhythm from the supplied Siona Benjamin floor image: deep blue structure, turquoise accents, warm gold rings, and calm high-contrast prayer surfaces. It does not place the detailed artwork behind text or represent the treatment as an official logo.

Animation tracks preserve archive timing offsets and power-easing intent where current cues provide them. Fade, `scaleX`, `scaleY`, two-axis scale, and up/down/left/right translate effects are supported. Known `logoGroup`, `titleGroup`, `HebText`, and `EngText` tracks are applied in addition to direct tile tracks. This is a bounded mapping of CRC cue behavior, not a generic Singular renderer or a pixel-equivalent recreation.

Existing cue fields remain valid. `template` is optional and additive: `{ family?: "lower-third" | "panel-left" | "panel-right", version?: string, translatePx?: number }`. A cue with `textMain` renders that curated combined block. Otherwise `textMainEng` and `textMainheb` render as separate blocks; the renderer does not copy or synthesize text between them. `accentTextTitle` is rendered when supplied.

Both archived Work Sans files are declared as weights 400 and 500. The archive does not identify the production Hebrew fallback, so Hebrew uses the browser fallback chain and exact Hebrew font equivalence remains unverified. Transparent output is preserved. A cut cancels active Web Animations and clears the output immediately; stale or duplicate revisions cannot replace a newer requested state.
