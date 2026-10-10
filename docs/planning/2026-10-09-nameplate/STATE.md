# Name plate layout

Michael asked on October 9 for a name-plate format like the old overlays. The example was "Bar Mitzvah of" over "Gavin Stein", with "בֶּנְיָה פְּרֶעֵל | Benyah P're-eil" beneath, restyled to match the current look.

## Decisions

- It is a new built-in card layout, `nameplate` ("Name plate"), defined as `NAMEPLATE_CARD` in lib/layout-registry.ts. It has the same surface, title strip, logo and rule as the corner card. It is centred along the bottom of the frame (x 520..1400, 48px up, 880x224), like the old name plates; Michael asked for the centre on Oct 9. Its heading is 40px, against the corner card's 28px; Michael asked for a larger title so it is easier to read. A heading too long for one line shrinks and wraps inside the strip. With centred text (`presentation.alignment: center`), and on the name plate only, the heading is centred over the card. Its lane is mirrored about the card centre, x 100..780 in card coordinates, so it stays clear of the logo (`.overlay[data-card="nameplate"][data-alignment="center"]` in app/overlay.css; the Player sets `data-alignment`). It uses the corner's motion (lower-third template) and shrinks text to fit down to a 20px floor. It does not support sets or translations.
- Cards can now set an optional `body.lead`. When set, the single text channel is laid out one line at a time. The first line is larger: 52px against 36px, scaled with `--card-lead-scale` so shrink-to-fit reduces both lines. Every line runs left to right, so a Hebrew name typed before "| Benyah" stays first. Data layouts accept `lead` as an optional field, and a layout without it keeps the same hash.
- There is a new guided form, "Name plate" (lib/custom-templates.ts). Its fields are Heading, Name, Hebrew name and Hebrew name in English letters. It composes the text as name, a line break, then "Hebrew | transliteration". Any empty part is left out.

## Evidence

- `tsc`, `npm test` (1,302 TS + 35 MJS pass, 14 skips), lint (the two existing warnings) and `npm run build` pass, and `git diff --check` is clean. The MCP tool snapshot was regenerated: the layout enums gain `nameplate`, and the built-in wording changed.
- Headless Chrome on the rehearsal `/author/fit-stage`: Gavin Stein, a very long name with Hebrew, and a name-only speaker all render with no fit errors. The long name shrinks and wraps inside the card.

## Open

- Not committed or pushed. A push to main deploys CRC, and TBI needs the paired release (RELEASE-STATE.md).
- No real OBS or booth check has been done yet.
