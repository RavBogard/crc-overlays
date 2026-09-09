export interface CatalogCue {
  id: string
  name: string
  layout: string
  hidden?: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_LAYOUT = /^[a-z][a-z0-9_-]{0,39}$/
const UNSAFE_NAME = /[<>\u0000-\u001f\u007f]/

export function validateCatalog(value: unknown): CatalogCue[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Catalog must be a non-empty array')
  const cues = value.map((entry): CatalogCue => {
    if (!entry || typeof entry !== 'object') throw new Error('Catalog entry must be an object')
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.id !== 'string' || !UUID.test(candidate.id)) throw new Error('Catalog cue ID must be a UUID')
    if (typeof candidate.name !== 'string' || candidate.name.length === 0 || candidate.name.length > 80 || UNSAFE_NAME.test(candidate.name)) throw new Error('Catalog cue name must be safe plain text')
    if (typeof candidate.layout !== 'string' || !SAFE_LAYOUT.test(candidate.layout)) throw new Error('Catalog cue layout is invalid')
    if (candidate.hidden !== undefined && typeof candidate.hidden !== 'boolean') throw new Error('Catalog cue hidden flag must be boolean')
    return { id: candidate.id, name: candidate.name, layout: candidate.layout, ...(candidate.hidden !== undefined ? { hidden: candidate.hidden } : {}) }
  })
  if (new Set(cues.map(cue => cue.id)).size !== cues.length) throw new Error('Catalog cue IDs must be unique')
  return cues
}

export class CatalogStore {
  #cues: CatalogCue[]

  constructor(initial: CatalogCue[]) { this.#cues = validateCatalog(initial) }
  get cues(): readonly CatalogCue[] { return this.#cues }

  replace(value: unknown): boolean {
    try {
      this.#cues = validateCatalog(value)
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
export function hasCatalogCue(cues: readonly CatalogCue[], cueId: string): boolean { return cues.some(cue => cue.id === cueId) }
export function visibleCatalogCues(cues: readonly CatalogCue[]): readonly CatalogCue[] { return cues.filter(cue => !cue.hidden) }
