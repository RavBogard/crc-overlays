# Release return — 74f2051

Paired CRC/TBI web deployment completed 2026-09-23T01:42:35.426Z from clean exact SHA
`74f20513063a5f7b562e3ab6462b9a8c39f5757c`.

- CRC: `dpl_7y3jnWdf98JA3G1mJfLL3HVqgoSE`; TBI: `dpl_3TxGsHmHGBpSQpJDzhmdp5vLGuNB`.
  Both Vercel deployment records reported `READY`; both custom and alternate aliases returned
  HTTP 200.
- The change top-aligns a left/right **single-channel** reading block beneath the title. A
  single `textMain` also has the legacy `combined` class, so the CSS selector is narrowed by
  `.single-channel`; bilingual stacks, structured rows, and lower-thirds retain their existing
  geometry. No text, source, authoring draft, fit call, relay, push, publication, or human
  review receipt was part of this release.
- Required gates passed before deployment: `tsc --noEmit`; `npm test` (784 pass, 9 skipped,
  plus 24 MJS pass); `npm run lint`; and `npm run build` (42 routes). The focused renderer
  contract also passed 26/26 when the CSS change was made.

Verbose gate and deployment logs are ignored at
`work/sitting-2026-09-22/single-channel-top-align-release/`.
