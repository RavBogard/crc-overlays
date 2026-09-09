# CRC Overlay Control — rehearsal console

Vercel-hosted controller, durable cue state, and transparent 1920×1080 graphics output. The source-backed rehearsal catalog contains twenty cues, including the opening Shabbat-morning sequence, Barechu, Oseh Shalom, and Mourners Kaddish 1–3. This remains an engineering rehearsal.

## Run locally

Start with `npm run dev` (port 5175). `.env` supplies `CONTROL_KEY` and `OUTPUT_KEY`; never commit keys or Companion exports. Controller: `http://localhost:5175/`. Output: `/output#key=OUTPUT_KEY`; add it to vMix or OBS as a transparent 1920×1080 Browser source. Preview is excluded from output acknowledgments.

## Control contract

`GET /api/catalog`, `GET /api/state`, and `POST /api/ack` accept an output or control Bearer key. `POST /api/command` requires a control key. Commands use `action: in|out|clear|cut`, a known cue for `in`/`out`, and optional command identity and sequence metadata. `cut` clears immediately. Output holds its last graphic on disconnection; rendered means the browser matched requested state and does not establish that vMix or OBS is on air.

## Companion

Use the installed native CRC Overlays Companion module 1.1.0 and its dynamic catalog presets for rehearsal. It supplies ordered commands, retry identity, and requested/rendered/disconnected feedback. Generic HTTP requests are a legacy fallback and do not provide sequencing or retry identity. Physical Stream Deck operation, vMix/OBS integration, and full-service rehearsal remain unverified.

## Source and licensing

Prayer cues select the exact Hebrew and transliteration blocks listed in `content/legacy-crc-shabbat-morning.sources.json`; English translations are excluded. As We Bless is an explicitly declared original English reading; its selectors must carry source role `original`. Ordinary bilingual cues must cover the same source units and blocks in both languages. The source map pins the feed, selected units, archive compositions, and generated text objects. Run `python scripts/generate-cues.py --check` to fail closed on source drift. Singular supplies stable composition records and authorized non-liturgical Thank you copy; it is not the prayer-text authority. Direct authorized art and refreshed templates are Siona-inspired and are not presented as exact legacy fidelity.

## Evidence — 2026-09-09

- `scripts/check-api.py`: 19 local assertions passed for authentication, cue validation, in/out, duplicate IDs, conflicts, delayed sequence, acknowledgments, and clear.
- Source guard checks passed with `python scripts/generate-cues.py --check`.
- The initial eight-cue batch passed exact DOM output, overflow, rapid cut and prayer replacement checks. Expanded-catalog visual verification is recorded separately for its release.
- WebMCP registration, read-back, valid and invalid cue handling, and immediate clear passed through the supported browser runtime.
- Native Companion 1.1.0 is installed locally; catalog expansion is verified separately against each deployed release.

The remaining 142 archived graphics, overrides, camera-linked buttons, and prayer authoring remain migration work. Physical Stream Deck, vMix/OBS, and full-service restart/network rehearsal are separate unverified gates.

## Hosting

Primary source: https://github.com/RavBogard/crc-overlays (private). Live controller: https://crc-overlays.vercel.app. Production uses its own Neon database; `DATABASE_URL`, `CONTROL_KEY`, and `OUTPUT_KEY` are runtime secrets. Release deployment and visual verification are confirmed separately from a source commit. See [broadcast rehearsal](docs/REHEARSAL.md) for the hardware and compositor checks.

