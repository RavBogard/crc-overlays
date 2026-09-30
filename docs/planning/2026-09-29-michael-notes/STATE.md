# Michael's overlay notes: proposed plan

Status: local implementation complete and verified. Daniel authorized production deployment on 2026-09-29; paired release in progress.
Input: `C:/Users/dsbog/Downloads/Overlay changes needed.md` (including two embedded screenshots). Treat Michael's instructions as proposals, not Daniel's approved requirements.

## Current evidence

- Active checkout: crc-overlays-vercel, branch google-signin, HEAD 9e55d20. Pre-existing untracked .playwright-mcp and three planning directories preserved.
- RELEASE-STATE.md records both production workspaces at c965df8. Production deployment authorized by Daniel after local verification.
- Existing editor has independent Hebrew/transliteration/title size values; investigate control coverage rather than assuming all typography is shared.
- Large print currently selects fixed sizes (42/35/34) in app/author/look-drawer.tsx and lib/template-looks.ts. A larger existing size could therefore be reduced; auto-fit as a further cause is unverified.
- app/author/wording-edits.ts attaches a translation editor through pairedBlockIds[0]. Reproduce Birchot's selection and pairing before choosing a fix.
- Together/In blocks controls language arrangement. Existing Group tabs select passages within a graphic; separate slides are a different concept. Clarify desired grouping behavior before extending it.
- Screenshot labeled English actually shows transliteration. Separate Hebrew, transliteration, and translation in the design.

## Approved scope and decisions

Daniel approved the proposed summary and implementation by GPT-6 Sol subagents. Popup decisions: legacy styling is optional and existing defaults stay; custom grouping supports both groups within a graphic and separate slides, with distinct controls. A follow-up about abbreviating Shalom Aleichem has no answer yet; preserve source wording and deliver the tools, rather than silently changing the prayer. The first verse in the current source uses hasharet, later verses hashalom.

1. Reproduce/fix Large Print and Birchot editing; improve text-edit affordance.
2. Add missing typography controls by text role, manual line breaks, and keep-together behavior. Preserve saved graphics and canonical source text. Offer usable editor actions rather than requiring invisible typed characters.
3. Preview selectable serif Hebrew and optional legacy accent-title styling. Decide default alignment and scope before changing existing appearances.
4. Build explicit slide-content grouping on existing selection machinery, separate from language arrangement. Use Hineih Mah Tov, Eliyahu Hanavi, and Birchot as acceptance examples.
5. If approved, make the abbreviated Shalom Aleichem arrangement a named local graphic/variant; do not rewrite the source prayer.

Large Print acceptance: never silently reduce rendered size; if larger text cannot fit, clearly report that and offer a content split. Serif readability is a preference to assess with pointed Hebrew previews, not an established universal advantage.

## Execution and verification

Astra owns contracts, acceptance criteria, and integration. Two GPT-6 Sol workers implement wording/grouping and typography/rendering in bounded packets with explicit file ownership. Root implemented the Look controls and browser acceptance checks. Existing work is preserved; no deployment or production data changes.

### Implementation evidence so far

- Birchot has two real storage shapes: legacy paired translations and newer English-only source passages. The bilingual editor now exposes both, with canonical local-variant provenance retained. Regression tests use real sources.
- Optional role typography covers Hebrew, transliteration, translation/English reading and titles; bundled David Libre and Frank Ruhl Libre choices; top/center/bottom alignment; classic watermark style; protected hyphens. Manual break and keep-together editor actions use plain Unicode text.
- Large Print uses floors above normal auto-growth and retains larger explicit sizes. Flagged graphics report overflow instead of shrinking. Browser checks caught and corrected the English-only floor and watermark clipping.
- Explicit slide pages extend split_draft_into_set with source coverage/pair checks, local variants, presentation and retry protection. The editor saves the current form first.
- Within-graphic visual grouping uses an optional preserveGroups content flag, independent of language arrangement. Absent means historical behavior.
- Local browser fixture exercised actual Look/Siddur components: numeric typing, classic style, Large Print preserving size, paired/inline English edits, Enter line breaks, keep-together action, add/move groups, and slide callback. Fixture removed from app after verification; scratch copy/logs under work/michael-notes.
- 12 baseline layout stills captured before changes. Final comparison: all 12 pixel-identical. New optional settings were checked in Chromium across side panels, lower thirds, corner cards, English-only and Hebrew-only text. Both serif faces were visually inspected with nikkud.

### Final verification

- `tsc --noEmit`: pass.
- `npm test`: 1,281 TypeScript tests + 35 MJS tests pass; 12 existing skips, zero failures. First integration run found two stale expectations (translation editor anchor and final text-size MCP description); updated those and reran successfully.
- `npm run lint`: zero errors, two pre-existing unused-import warnings in lib/authoring.ts.
- `npm run build`: pass. Review-only app route removed before build; dev server stopped. Its generated dev types were preserved under ignored work/michael-notes/dev-types-review to avoid stale route references.
- `git diff --check`: pass.
- Browser control fixture: new role controls, native numeric entry, classic style, Large Print retaining larger size, legacy paired and expanded inline English editors, native and button line breaks, keep-together selection, manual groups, preserveGroups checkbox, and separate-slide callback pass.
- `scripts/check-michael-notes.mjs`: real renderer acceptance across roles/fonts/spacing, manual breaks/protected hyphens, watermark clipping/fit, alignment, Large Print no shrink and overflow, including single-channel layouts.
- Evidence and screenshots: `work/michael-notes/` (ignored scratch artifacts). Existing graphics without optional fields retain their baseline appearance. No source prayer wording or production data changed; no migrations or relay work needed.

Focused behavior tests and browser checks during each packet; tsc, npm test, lint, build at integration. Verify save/reopen, editor/preview/render/fit agreement, nikkud, long phrases, both panel directions, and unchanged existing graphics. Production release is separate.

Next: deploy the verified commit to CRC and TBI, verify both deployment identities, and update RELEASE-STATE.md. The optional abbreviated Shalom Aleichem arrangement was not created without a wording decision; manual editing and grouping tools support making a local version. Hardware/viewing-distance acceptance remains an operator check, not claimed by these browser tests.
