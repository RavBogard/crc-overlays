# Authoring release acceptance

This milestone adds source-backed authoring to CRC's overlay service. It does not
establish a complete service migration or broadcast hardware acceptance.

## Required behavior

- Authenticated search returns canonical legacy CRC source blocks and provenance.
- Drafts select paired Hebrew/transliteration blocks; source text is not rewritten.
- Original English readings retain the explicit source role restriction.
- Existing cues can be adopted for editing without changing their Companion IDs.
- Web preview uses the output renderer in isolation, without live commands or acknowledgments.
- Edits use optimistic versions; stale writes cannot overwrite another editor.
- Publication requires review of the exact saved version. Browser fit measurements
  are browser-reported evidence, not independent server rendering.
- Publication and rollback create retained history and change future cue selections.
- The active output retains the selected cue payload through publication and reload.
- OAuth MCP tokens permit authoring; output-only credentials cannot author.
- Remote MCP discovery, initialization, tool calls, and OAuth PKCE are tested.
- Actual ChatGPT and Claude account connection tests are recorded separately from protocol tests.

## Cutover still requires

Complete the service's required prayer/reading set, then rehearse the physical
Stream Deck, Companion camera actions, transparent vMix/OBS output, next-page
sequences, manual hide, and network interruption/recovery. An output browser's
acknowledgment is not proof that a graphic is on air.

## Content ownership

Code and templates remain in the private repository. Canonical source packages
remain server-only and source-pinned. Drafts, publications, and history live in
the database, so a content edit does not require deploying application code.
Daniel has authorized Simone and Temple Bnai Israel to use the complete current and future CRC overlay and source library. That library is a read-only upstream; congregation account, draft, publication, control, and live-output isolation remain required.
