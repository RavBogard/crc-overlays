export interface CatalogCue {
  id: string
  name: string
  layout: string
  hidden?: boolean
  /**
   * What kind of graphic this is, used only to colour the generated preset. An unknown
   * value is read as core liturgy rather than refused: a preset in the wrong colour is a
   * cosmetic miss, and a module that rejects the catalog is an outage.
   */
  category?: string
  /** Present when this cue is a slot whose text is typed weekly on "This service". */
  slot?: { key: string }
}

/** One slot's current text, as `GET /api/catalog?include=slots` reports it. */
export interface CatalogSlot { cueId: string; key: string; text: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// A names list for a service is materialized into the live catalog only, under the id
// `names:<collectionId>:<NN>` (lib/names-list.ts). It is a real, showable graphic, so the
// module has to accept it -- but only in exactly that shape: both forms are bounded, free of
// path, quote and whitespace characters, and therefore safe inside a preset id.
const NAMES_CUE_ID = /^names:[A-Za-z0-9_-]{1,80}:\d{1,4}$/
const validCueId = (value: string): boolean => UUID.test(value) || NAMES_CUE_ID.test(value)
const SAFE_LAYOUT = /^[a-z][a-z0-9_-]{0,39}$/
const SAFE_CATEGORY = /^[a-z][a-z0-9_-]{0,39}$/
// A slot key becomes a Companion variable name (`slot_<key>`), so it is bounded the same
// boring way as a layout and carries only the characters a variable name may hold.
const SAFE_SLOT_KEY = /^[a-z][a-z0-9_]{0,39}$/
const UNSAFE_NAME = /[<>\u0000-\u001f\u007f]/
// Slot text is plain text typed by a person. Newlines are the one control character it may
// carry, because a two-line name card is exactly two lines.
const UNSAFE_SLOT_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f]/
const SLOT_TEXT_MAX = 400

export function validateCatalog(value: unknown): CatalogCue[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Catalog must be a non-empty array')
  const cues = value.map((entry): CatalogCue => {
    if (!entry || typeof entry !== 'object') throw new Error('Catalog entry must be an object')
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.id !== 'string' || !validCueId(candidate.id)) throw new Error('Catalog cue ID must be a UUID or a names panel ID')
    if (typeof candidate.name !== 'string' || candidate.name.length === 0 || candidate.name.length > 80 || UNSAFE_NAME.test(candidate.name)) throw new Error('Catalog cue name must be safe plain text')
    if (typeof candidate.layout !== 'string' || !SAFE_LAYOUT.test(candidate.layout)) throw new Error('Catalog cue layout is invalid')
    if (candidate.hidden !== undefined && typeof candidate.hidden !== 'boolean') throw new Error('Catalog cue hidden flag must be boolean')
    if (candidate.category !== undefined && (typeof candidate.category !== 'string' || !SAFE_CATEGORY.test(candidate.category))) throw new Error('Catalog cue category is invalid')
    if (candidate.slot !== undefined) {
      const slot = candidate.slot as Record<string, unknown> | null
      if (!slot || typeof slot !== 'object' || typeof slot.key !== 'string' || !SAFE_SLOT_KEY.test(slot.key)) throw new Error('Catalog cue slot key is invalid')
    }
    return {
      id: candidate.id, name: candidate.name, layout: candidate.layout,
      ...(candidate.hidden !== undefined ? { hidden: candidate.hidden } : {}),
      ...(candidate.category !== undefined ? { category: candidate.category as string } : {}),
      ...(candidate.slot !== undefined ? { slot: { key: (candidate.slot as { key: string }).key } } : {}),
    }
  })
  if (new Set(cues.map(cue => cue.id)).size !== cues.length) throw new Error('Catalog cue IDs must be unique')
  return cues
}

/**
 * The slot index from the `?include=slots` envelope. A server that does not carry the
 * change sends nothing at all, which is an empty index and not a failure; anything that IS
 * sent has to be well formed, because a malformed slot key would reach a variable name.
 */
export function validateSlots(value: unknown): CatalogSlot[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('Catalog slots must be an array')
  const slots = value.map((entry): CatalogSlot => {
    if (!entry || typeof entry !== 'object') throw new Error('Catalog slot must be an object')
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.cueId !== 'string' || !validCueId(candidate.cueId)) throw new Error('Catalog slot cue ID must be a UUID or a names panel ID')
    if (typeof candidate.key !== 'string' || !SAFE_SLOT_KEY.test(candidate.key)) throw new Error('Catalog slot key is invalid')
    if (typeof candidate.text !== 'string' || candidate.text.length > SLOT_TEXT_MAX || UNSAFE_SLOT_TEXT.test(candidate.text)) throw new Error('Catalog slot text must be safe plain text')
    return { cueId: candidate.cueId, key: candidate.key, text: candidate.text }
  })
  if (new Set(slots.map(slot => slot.key)).size !== slots.length) throw new Error('Catalog slot keys must be unique')
  return slots
}

export class CatalogStore {
  #cues: CatalogCue[]
  #slots: CatalogSlot[] = []

  constructor(initial: CatalogCue[]) { this.#cues = validateCatalog(initial) }
  get cues(): readonly CatalogCue[] { return this.#cues }
  get slots(): readonly CatalogSlot[] { return this.#slots }

  /** `key -> text` for every slot the server reported. Nothing reported is an empty map. */
  slotText(): Map<string, string> { return new Map(this.#slots.map(slot => [slot.key, slot.text])) }

  // Cues and slots are replaced together or not at all: a slot index that names a cue the
  // catalog does not carry would light a preset for a button that cannot fire.
  replace(value: unknown, slots?: unknown): boolean {
    try {
      const cues = validateCatalog(value)
      const index = validateSlots(slots)
      const ids = new Set(cues.map(cue => cue.id))
      for (const slot of index) if (!ids.has(slot.cueId)) throw new Error('Catalog slot names a cue that is not in the catalog')
      this.#cues = cues
      this.#slots = index
      return true
    } catch {
      return false
    }
  }

  async refresh(load: () => Promise<unknown>): Promise<boolean> {
    try {
      return this.replace(await load())
    } catch {
      return false
    }
  }
}

export function cuePresetId(cueId: string): string { return `show_${cueId}` }
export function slotPresetId(cueId: string): string { return `slot_${cueId}` }
export function hasCatalogCue(cues: readonly CatalogCue[], cueId: string): boolean { return cues.some(cue => cue.id === cueId) }
export function visibleCatalogCues(cues: readonly CatalogCue[]): readonly CatalogCue[] { return cues.filter(cue => !cue.hidden) }
export function slotCatalogCues(cues: readonly CatalogCue[]): readonly CatalogCue[] { return visibleCatalogCues(cues).filter(cue => cue.slot) }

/**
 * The one line a Stream Deck key can hold: the first line of the slot's text, trimmed, and
 * cut to 24 characters with an ellipsis when it is longer. An empty slot is an empty string.
 */
export const SLOT_VARIABLE_MAX = 24
export function slotVariableValue(text: string): string {
  const first = (text.split('\n')[0] ?? '').trim()
  return first.length > SLOT_VARIABLE_MAX ? `${first.slice(0, SLOT_VARIABLE_MAX - 1)}…` : first
}

/**
 * The colour a generated preset takes, by category. Michael's deck is legible because his
 * colours mean something; two hundred identical charcoal presets would be unusable. An
 * unknown or absent category reads as core liturgy.
 */
export interface PresetColour { bgcolor: number; color: number }
const WHITE = 16777215
const BLACK = 0
const rgb = (red: number, green: number, blue: number): number => (red << 16) | (green << 8) | blue
export const CATEGORY_COLOURS: Record<string, PresetColour> = {
  core_liturgy: { bgcolor: rgb(0, 102, 153), color: WHITE },
  sung_liturgy: { bgcolor: rgb(153, 0, 51), color: WHITE },
  readings: { bgcolor: rgb(1, 42, 62), color: WHITE },
  alternates: { bgcolor: rgb(89, 1, 31), color: WHITE },
  markers: { bgcolor: rgb(0, 0, 102), color: WHITE },
  names: { bgcolor: rgb(255, 255, 64), color: BLACK },
}
export const DEFAULT_CATEGORY = 'core_liturgy'
export function categoryColour(category: string | undefined): PresetColour {
  return CATEGORY_COLOURS[category ?? DEFAULT_CATEGORY] ?? CATEGORY_COLOURS[DEFAULT_CATEGORY]!
}
