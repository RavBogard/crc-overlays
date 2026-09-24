import type { CatalogCue, CatalogCueRole } from './catalog.js'
import type { CueRole } from './palette.js'
import { PRESET_SECTION_CONTROLS, PRESET_SECTIONS } from './brand.js'

/** A preset section as Companion takes it: preset ids, or (for sets) one group per set. */
export type PresetGroup = { id: string; type: 'simple'; name: string; presets: string[] }
export type PresetSection = { id: string; name: string; definitions: string[] | PresetGroup[] }

type SectionKey = keyof typeof PRESET_SECTIONS
/** Where a cue with a role and no set goes. A sequence part whose set was not reported reads as a prayer. */
const ROLE_SECTION: Record<CueRole, SectionKey> = {
  single: 'prayers', 'sequence-part': 'prayers', alternate: 'alternates', 'short-selection': 'shortSelections',
  announcement: 'announcements', utility: 'utility',
}
/** The order the sections appear in Companion's preset list, after the controls. */
const SECTION_ORDER: SectionKey[] = ['sets', 'prayers', 'alternates', 'shortSelections', 'announcements', 'utility', 'slots', 'other']

/** The preset group id of a set. Set ids are `[a-z0-9-]`, so this is a plain, stable identifier. */
export const setGroupId = (setId: string): string => `set_${setId}`

/**
 * The preset structure. Without any role from the server (an older web, or a congregation whose
 * deck reports none) it is exactly the one flat Controls section of 1.7.0, in the same order. With
 * roles, the controls come first, then each multipart set as its own group with its parts
 * consecutive and in panel order, then the graphics by role, the slots, and whatever the deck does
 * not place (a newly published graphic, a names list) under Other graphics. Empty sections are left out.
 */
export function presetSections(input: {
  cues: readonly CatalogCue[]
  roleOf: (cueId: string) => CatalogCueRole | undefined
  cuePresetId: (cueId: string) => string
  slotPresetIds: readonly string[]
  controlPresetIds: readonly string[]
}): PresetSection[] {
  const { cues, roleOf, cuePresetId, slotPresetIds, controlPresetIds } = input
  const withRoles = cues.some(cue => roleOf(cue.id) !== undefined)
  if (!withRoles) return [{ ...PRESET_SECTION_CONTROLS, definitions: [...cues.map(cue => cuePresetId(cue.id)), ...slotPresetIds, ...controlPresetIds] }]

  const flat: Record<SectionKey, string[]> = { sets: [], prayers: [], alternates: [], shortSelections: [], announcements: [], utility: [], slots: [...slotPresetIds], other: [] }
  const sets = new Map<string, { name: string; parts: { index: number; order: number; presetId: string }[] }>()
  cues.forEach((cue, order) => {
    const role = roleOf(cue.id)
    const presetId = cuePresetId(cue.id)
    if (!role) { flat.other.push(presetId); return }
    if (role.set) {
      const set = sets.get(role.set.id) ?? { name: role.set.name, parts: [] }
      set.parts.push({ index: role.set.index, order, presetId })
      sets.set(role.set.id, set)
      return
    }
    flat[ROLE_SECTION[role.role]].push(presetId)
  })
  const groups: PresetGroup[] = [...sets].map(([id, set]) => ({
    id: setGroupId(id), type: 'simple', name: set.name,
    presets: [...set.parts].sort((a, b) => a.index - b.index || a.order - b.order).map(part => part.presetId),
  }))

  const sections: PresetSection[] = [{ ...PRESET_SECTION_CONTROLS, definitions: [...controlPresetIds] }]
  for (const key of SECTION_ORDER) {
    const definitions = key === 'sets' ? groups : flat[key]
    if (definitions.length) sections.push({ ...PRESET_SECTIONS[key], definitions })
  }
  return sections
}
