import { describe, expect, it } from 'vitest'
import { CatalogStore, cuePresetId, hasCatalogCue, validateCatalog, visibleCatalogCues, type CatalogCue } from '../src/catalog.js'
import { panelSets, panelTarget } from '../src/panel.js'

const original: CatalogCue[] = [
  { id: 'efa9fad4-f7d5-4091-a708-82103028861b', name: 'Barechu', layout: 'bottom' },
  { id: 'eac2dee3-17f3-4a52-9ca5-4d7611f0f9dc', name: 'Modeh Ani (Bottom)', layout: 'bottom' },
  { id: 'bbd7c98b-f1de-41ee-9719-2bb27a30d0db', name: 'Mah Tovu', layout: 'left' },
]
const added = { id: '75ff6cbd-86f3-49ea-a007-77686ec3eaa4', name: 'New Reviewed Cue', layout: 'bottom' }

describe('authenticated catalog state', () => {
  it('expands choices from a newly reviewed catalog entry', async () => {
    const store = new CatalogStore(original)
    expect(await store.refresh(async () => [...original, added, { id: 'eb119ce5-1e9c-4b26-9320-5eaf68a72de9', name: 'Song & Prayer', layout: 'left' }])).toBe(true)
    expect(store.cues.map(cue => cue.name)).toContain('New Reviewed Cue')
    expect(store.cues.map(cue => cue.name)).toContain('Song & Prayer')
    expect(store.cues).toHaveLength(5)
  })

  it('retains the previous valid catalog when refresh is unavailable or invalid', async () => {
    const store = new CatalogStore(original)
    expect(await store.refresh(async () => { throw new Error('offline') })).toBe(false)
    expect(store.cues).toEqual(original)
    expect(store.replace([{ ...added, name: '<img src=x>' }])).toBe(false)
    expect(store.cues).toEqual(original)
    expect(() => validateCatalog([{ id: 'not-a-uuid', name: 'Bad', layout: 'bottom' }])).toThrow()
  })

  it('preserves the established UUID-derived preset IDs', () => {
    expect(original.map(cue => cuePresetId(cue.id))).toEqual([
      'show_efa9fad4-f7d5-4091-a708-82103028861b',
      'show_eac2dee3-17f3-4a52-9ca5-4d7611f0f9dc',
      'show_bbd7c98b-f1de-41ee-9719-2bb27a30d0db',
    ])
    expect(hasCatalogCue(original, original[0]!.id)).toBe(true)
    expect(hasCatalogCue(original, '75ff6cbd-86f3-49ea-a007-77686ec3eaa4')).toBe(false)
  })

  it('preserves hidden aliases for old commands and feedback while excluding operator choices', () => {
    const hidden = { ...added, hidden: true }
    const cues = validateCatalog([...original, hidden])
    expect(cues.at(-1)).toEqual(hidden)
    expect(hasCatalogCue(cues, hidden.id)).toBe(true)
    expect(cues.find(cue => cue.id === hidden.id)?.name).toBe(hidden.name)
    expect(visibleCatalogCues(cues).map(cue => cue.id)).not.toContain(hidden.id)
    expect(visibleCatalogCues(cues)).toEqual(original)
    expect(() => validateCatalog([{ ...added, hidden: 'yes' }])).toThrow(/hidden flag/)
  })
})


describe('a names list is a real graphic in the live catalog', () => {
  const names: CatalogCue[] = [
    { id: 'names:4f1c2a9e-0d3b-4c5a-9e7f-1a2b3c4d5e6f:01', name: 'Mi Shebeirach — 01 of 02', layout: 'left' },
    { id: 'names:4f1c2a9e-0d3b-4c5a-9e7f-1a2b3c4d5e6f:02', name: 'Mi Shebeirach — 02 of 02', layout: 'left' },
  ]

  it('validates a catalog that mixes published cues and a service names list', () => {
    const cues = validateCatalog([...original, ...names])
    expect(cues).toHaveLength(5)
    expect(cues.map(cue => cue.id)).toEqual([...original.map(cue => cue.id), ...names.map(cue => cue.id)])
  })

  it('refuses any id that is neither a UUID nor exactly the names panel shape', () => {
    for (const id of [
      'names:',
      'names:collection:',
      'names:collection',
      'names::01',
      'names:collection:01:02',
      'names:collection:ab',
      'names:collection:12345',
      'names:coll ection:01',
      'names:coll/ection:01',
      'names:collection:01 ',
      'NAMES:collection:01',
      'not-a-uuid',
    ]) expect(() => validateCatalog([{ id, name: 'Bad', layout: 'bottom' }])).toThrow()
  })

  it('derives a preset id and a catalog membership check from a names id unchanged', () => {
    expect(cuePresetId(names[0]!.id)).toBe('show_names:4f1c2a9e-0d3b-4c5a-9e7f-1a2b3c4d5e6f:01')
    expect(hasCatalogCue(validateCatalog([...original, ...names]), names[1]!.id)).toBe(true)
  })

  it('carries a validated names catalog into panel set derivation', () => {
    const cues = validateCatalog([...original, ...names])
    expect(panelSets(cues).map(set => ({ id: set.id, label: set.label }))).toEqual([
      { id: 'names:4f1c2a9e-0d3b-4c5a-9e7f-1a2b3c4d5e6f:Mi Shebeirach', label: 'Mi Shebeirach (names for this service)' },
    ])
    expect(panelTarget(cues, names[1]!.id, 1)).toBe(names[0]!.id)
  })
})
