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

/** The sections presets are grouped into when the catalog reports each cue's deck role (1.8.0). */
export const PRESET_SECTIONS = {
  sets: { id: 'crc_overlay_sets', name: 'CRC Overlay Sets' },
  prayers: { id: 'crc_overlay_prayers', name: 'CRC Overlay Prayers' },
  alternates: { id: 'crc_overlay_alternates', name: 'CRC Overlay Alternates' },
  shortSelections: { id: 'crc_overlay_short_selections', name: 'CRC Overlay Short selections' },
  announcements: { id: 'crc_overlay_announcements', name: 'CRC Overlay Announcements' },
  utility: { id: 'crc_overlay_utility', name: 'CRC Overlay Utility graphics' },
  slots: { id: 'crc_overlay_slots', name: 'CRC Overlay Slots' },
  other: { id: 'crc_overlay_other', name: 'CRC Overlay Other graphics' },
} as const
