// The one Companion palette: the deck renderer (render.ts, through model.ts) and the Companion
// module's presets (companion/src/palette.ts) colour a cue by the same role rule from the same
// values, so a preset dragged onto a key matches the deck around it.
//
// The module cannot import web code at runtime, so companion/scripts/write-palette.mjs copies this
// file verbatim into companion/src/palette.ts at module build time (`npm run build` in companion/),
// and a test on each side fails when the copy is stale. Keep this file free of imports and of
// anything but plain TypeScript: it must compile unchanged under both tsconfigs.

/** Named colours, as Companion's 24-bit RGB integers. */
export const PALETTE = {
  white: 0xffffff, black: 0x000000, teal: 0x006699, burgundy: 0x990033, navy: 0x000066, blue: 0x003399,
  orange: 0xcc6500, darkRed: 0x780000, charcoal: 0x242424, purple: 0x660066,
  requested: 0xb46e00, rendered: 0xff0000, disconnected: 0xaa0000, logoEnabled: 0x5a4600, stepText: 0xffff00,
} as const
export type PaletteName = keyof typeof PALETTE
export type Palette = Record<PaletteName, number>

/** What a cue key is for, as the deck model records it. */
export const CUE_ROLES = ['utility', 'announcement', 'single', 'sequence-part', 'alternate', 'short-selection'] as const
export type CueRole = (typeof CUE_ROLES)[number]
export const isCueRole = (value: unknown): value is CueRole => typeof value === 'string' && (CUE_ROLES as readonly string[]).includes(value)

/** The role rule: the palette colour a cue key's background takes. */
export const ROLE_COLOURS: Record<CueRole, PaletteName> = {
  utility: 'navy',
  announcement: 'navy',
  single: 'burgundy',
  'sequence-part': 'teal',
  alternate: 'burgundy',
  'short-selection': 'burgundy',
}
/** An alternate that belongs to a set reads as part of the set. */
export const ALTERNATE_IN_SET: PaletteName = 'teal'

/** The palette name of a cue key's background, by role (and set membership, for an alternate). */
export function roleColourName(role: CueRole, inSet: boolean): PaletteName {
  return role === 'alternate' && inSet ? ALTERNATE_IN_SET : ROLE_COLOURS[role]
}
