// Every CRC brand string the module carries lives here, so the TBI module can be derived
// from the compiled CRC module by scripts/build-tbi-companion-module.mjs without depending on
// how many times each string appears. That script replaces these values by prefix (every
// `crc_overlay…` preset id, every `CRC Overlay…` label, every CRC host) and then fails if any
// CRC brand string survives, so a new preset section just needs to start with the prefixes.
//
// Keep the wire-protocol identifiers (`X-CRC-Catalog-Version`, `crc-overlays-v1`) out of this
// file: the server requires them unchanged for both congregations.

export const DEFAULT_BASE_URL = 'https://overlays.centralreform.org'

/** Preset section ids start with `crc_overlay_`; labels start with `CRC Overlay`. */
export const PRESET_SECTION_ID_PREFIX = 'crc_overlay_'
export const PRESET_SECTION_LABEL_PREFIX = 'CRC Overlay'

export const PRESET_SECTION_CONTROLS = { id: 'crc_overlay_controls', name: 'CRC Overlay Controls' } as const
