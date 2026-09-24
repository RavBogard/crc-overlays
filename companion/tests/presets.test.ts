import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { combineRgb } from '@companion-module/base'
import { CatalogStore, categoryColour, roleColour, validateRoles, type CatalogCue } from '../src/catalog.js'
import { parseCatalogBody } from '../src/client.js'
import { PALETTE } from '../src/palette.js'
import { presetSections } from '../src/preset-layout.js'
import * as released from './fixtures/released-1.7.0/parse.js'
import { config, destroyAll, harness, secrets, snapshotFrame, start, PAIRED_TOKEN, CUE } from './harness.js'
// @ts-expect-error -- a plain .mjs build script with no type declarations
import { PALETTE_COPY, PALETTE_SOURCE, paletteCopy } from '../scripts/write-palette.mjs'

afterEach(destroyAll)

const KADDISH_1 = 'c2d2c129-7d7d-4bbc-a296-46cc1fb9f48e'
const KADDISH_2 = 'f15c1944-da76-4d61-95c8-05c032d47c4d'
const WELCOME = 'bb52a63a-e892-4518-b7c2-a59e8ce730b9'
const ALT = '02fe9320-56dd-4271-85b8-d046f683074d'
const ALT_IN_SET = '2a4775f3-3339-4f1a-85c0-d51cdafd767c'
const NEW_CUE = '75ff6cbd-86f3-49ea-a007-77686ec3eaa4'
const STUDENT = '17db1877-425a-4ea7-b123-664a9756f2ae'

// Catalog order deliberately puts Kaddish part 2 before part 1: the Sets group is in panel order.
const cues: CatalogCue[] = [
  { id: CUE, name: 'Barechu', layout: 'bottom', category: 'core_liturgy' },
  { id: KADDISH_2, name: 'Kaddish 2/2', layout: 'left', category: 'core_liturgy' },
  { id: WELCOME, name: 'Guest Speaker', layout: 'bottom', category: 'core_liturgy' },
  { id: KADDISH_1, name: 'Kaddish 1/2', layout: 'left', category: 'core_liturgy' },
  { id: ALT, name: 'Take This Soul', layout: 'bottom', category: 'core_liturgy' },
  { id: ALT_IN_SET, name: 'Aleinu 3', layout: 'left', category: 'core_liturgy' },
  { id: NEW_CUE, name: 'New graphic', layout: 'bottom', category: 'core_liturgy' },
  { id: STUDENT, name: 'Student name', layout: 'bottom', category: 'names', slot: { key: 'student_name' } },
]
const kaddish = (index: number) => ({ id: 'mourners-kaddish', name: "Mourner's Kaddish", index, count: 2 })
const roles = [
  { cueId: CUE, role: 'single' },
  { cueId: KADDISH_2, role: 'sequence-part', set: kaddish(2) },
  { cueId: WELCOME, role: 'announcement' },
  { cueId: KADDISH_1, role: 'sequence-part', set: kaddish(1) },
  { cueId: ALT, role: 'alternate' },
  { cueId: ALT_IN_SET, role: 'alternate', set: { id: 'aleinu', name: 'Aleinu', index: 3, count: 4 } },
]
const body = (withRoles: unknown) => ({ version: 'catalog-2', cues, slots: [{ cueId: STUDENT, key: 'student_name', text: 'Noa' }], ...(withRoles === undefined ? {} : { roles: withRoles }) })
const respond = (value: unknown) => () => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CRC-Catalog-Version': 'catalog-2' } })

async function connected(value: unknown) {
  const h = start(harness({ catalog: respond(value) }))
  await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
  await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
  h.sockets[0]!.emit('open')
  h.sockets[0]!.message(snapshotFrame({ catalogVersion: 'catalog-1' }))
  await vi.waitFor(() => expect(h.presets[`show_${NEW_CUE}`]).toBeDefined())
  return h
}
const structureOf = (h: { presetStructure: unknown }) => h.presetStructure as Array<{ id: string; name: string; definitions: Array<string | { id: string; name: string; presets: string[] }> }>

describe('the shared palette', () => {
  it('is the deck renderer palette, copied at build time and never edited here', () => {
    expect(readFileSync(PALETTE_COPY, 'utf8').replace(/\r\n/g, '\n')).toBe(paletteCopy(readFileSync(PALETTE_SOURCE, 'utf8')))
  })

  it('colours by the deck role rule: sets teal, prayers and alternates burgundy, announcements navy', () => {
    expect(roleColour({ cueId: CUE, role: 'sequence-part', set: kaddish(1) }).bgcolor).toBe(0x006699)
    expect(roleColour({ cueId: CUE, role: 'single' }).bgcolor).toBe(0x990033)
    expect(roleColour({ cueId: CUE, role: 'alternate' }).bgcolor).toBe(0x990033)
    expect(roleColour({ cueId: CUE, role: 'alternate', set: kaddish(1) }).bgcolor).toBe(0x006699)
    expect(roleColour({ cueId: CUE, role: 'short-selection' }).bgcolor).toBe(0x990033)
    expect(roleColour({ cueId: CUE, role: 'announcement' })).toEqual({ bgcolor: 0x000066, color: PALETTE.white })
    expect(roleColour({ cueId: CUE, role: 'utility' }).bgcolor).toBe(0x000066)
  })
})

describe('presets grouped by the deck roles in the catalog envelope', () => {
  it('puts the controls first, each set as one group in panel order, then the graphics by role', async () => {
    const h = await connected(body(roles))
    expect(structureOf(h)).toEqual([
      { id: 'crc_overlay_controls', name: 'CRC Overlay Controls', definitions: ['animate_out', 'clear_now', 'logo', 'bug', 'set_page', 'next_panel', 'previous_panel', 'refresh_catalog', 'connection_status', 'current_panel', 'last_source'] },
      { id: 'crc_overlay_sets', name: 'CRC Overlay Sets', definitions: [
        { id: 'set_mourners-kaddish', type: 'simple', name: "Mourner's Kaddish", presets: [`show_${KADDISH_1}`, `show_${KADDISH_2}`] },
        { id: 'set_aleinu', type: 'simple', name: 'Aleinu', presets: [`show_${ALT_IN_SET}`] },
      ] },
      { id: 'crc_overlay_prayers', name: 'CRC Overlay Prayers', definitions: [`show_${CUE}`] },
      { id: 'crc_overlay_alternates', name: 'CRC Overlay Alternates', definitions: [`show_${ALT}`] },
      { id: 'crc_overlay_announcements', name: 'CRC Overlay Announcements', definitions: [`show_${WELCOME}`] },
      { id: 'crc_overlay_slots', name: 'CRC Overlay Slots', definitions: [`slot_${STUDENT}`] },
      { id: 'crc_overlay_other', name: 'CRC Overlay Other graphics', definitions: [`show_${NEW_CUE}`, `show_${STUDENT}`] },
    ])
    // Every preset is placed exactly once.
    const placed = structureOf(h).flatMap(section => section.definitions.flatMap(entry => typeof entry === 'string' ? [entry] : entry.presets))
    expect([...placed].sort()).toEqual(Object.keys(h.presets).sort())
  })

  it('colours a cue with a role by the deck palette, and one without by its category as before', async () => {
    const h = await connected(body(roles))
    expect(h.presets[`show_${KADDISH_1}`]?.style).toMatchObject({ bgcolor: PALETTE.teal, color: PALETTE.white })
    expect(h.presets[`show_${CUE}`]?.style).toMatchObject({ bgcolor: PALETTE.burgundy })
    expect(h.presets[`show_${WELCOME}`]?.style).toMatchObject({ bgcolor: PALETTE.navy })
    expect(h.presets[`show_${ALT}`]?.style).toMatchObject({ bgcolor: PALETTE.burgundy })
    expect(h.presets[`show_${ALT_IN_SET}`]?.style).toMatchObject({ bgcolor: PALETTE.teal })
    expect(h.presets[`show_${NEW_CUE}`]?.style).toMatchObject(categoryColour('core_liturgy'))
    expect(h.presets[`slot_${STUDENT}`]?.style).toMatchObject(categoryColour('names'))
  })

  it('without roles (an older web) keeps the one flat 1.7.0 section, in the same order', async () => {
    const h = await connected(body(undefined))
    expect(structureOf(h)).toEqual([{ id: 'crc_overlay_controls', name: 'CRC Overlay Controls', definitions: Object.keys(h.presets) }])
    expect(Object.keys(h.presets).slice(0, cues.length + 1)).toEqual([...cues.map(cue => `show_${cue.id}`), `slot_${STUDENT}`])
    expect(h.presets[`show_${KADDISH_1}`]?.style).toMatchObject(categoryColour('core_liturgy'))
  })

  it('never lets a malformed role cost the catalog: bad entries are dropped one by one', () => {
    expect(validateRoles('nope')).toEqual([])
    expect(validateRoles([
      { cueId: CUE, role: 'headline' },
      { cueId: 'not-a-uuid', role: 'single' },
      { cueId: KADDISH_1, role: 'sequence-part', set: { id: 'Bad Id', name: 'x', index: 1, count: 2 } },
      { cueId: KADDISH_2, role: 'sequence-part', set: { id: 'k', name: '<b>', index: 1, count: 2 } },
      { cueId: WELCOME, role: 'announcement', set: { id: 'k', name: 'K', index: 3, count: 2 } },
      { cueId: ALT, role: 'alternate' },
      { cueId: ALT, role: 'single' },
    ])).toEqual([{ cueId: ALT, role: 'alternate' }])
    const store = new CatalogStore(cues)
    expect(store.replace(cues, [], { not: 'a list' })).toBe(true)
    expect(store.hasRoles).toBe(false)
    expect(store.replace(cues, [], [...roles, { cueId: '9e6a5a33-5f6c-4d35-9d1c-1e2b3c4d5e6f', role: 'single' }])).toBe(true)
    expect(store.roleOf('9e6a5a33-5f6c-4d35-9d1c-1e2b3c4d5e6f')).toBeUndefined()
    expect(store.roleOf(KADDISH_1)?.set?.index).toBe(1)
  })

  it('leaves out empty sections', () => {
    const sections = presetSections({ cues: [cues[0]!], roleOf: () => ({ cueId: CUE, role: 'single' }), cuePresetId: id => `show_${id}`, slotPresetIds: [], controlPresetIds: ['clear_now'] })
    expect(sections.map(section => section.id)).toEqual(['crc_overlay_controls', 'crc_overlay_prayers'])
  })
})

describe('the agent-activity preset', () => {
  it('shows who pressed last and turns purple while that was an AI agent', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    const preset = h.presets.last_source
    expect(preset?.name).toBe('Last command came from')
    expect(preset?.style?.text).toBe('Last press\n$(overlays:last_source)')
    expect(preset?.steps).toEqual([{ down: [], up: [] }])
    expect(preset?.feedbacks?.map(feedback => feedback.feedbackId)).toEqual(['last_source_agent', 'disconnected'])
    expect(preset?.feedbacks?.[0]?.style).toEqual({ bgcolor: combineRgb(90, 40, 140) })
  })
})

describe('the modules already installed keep validating the new envelope', () => {
  it('the frozen 1.7.0 parser is the released one', () => {
    const frozen = readFileSync(fileURLToPath(new URL('./fixtures/released-1.7.0/catalog.ts', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(frozen).digest('hex')).toBe('b9fcc2962ecf265a893603e249bc7e1b9c2529e03668306f6875c2cdc8b3f5af')
  })

  it('1.7.0 accepts an envelope with roles exactly as it accepts one without', () => {
    for (const value of [body(roles), body(undefined)]) {
      const parsed = released.parseCatalogBody(JSON.parse(JSON.stringify(value)))
      const store = new released.CatalogStore([cues[0]!])
      expect(store.replace(parsed.cues, parsed.slots)).toBe(true)
      expect(store.cues.map(cue => cue.id)).toEqual(cues.map(cue => cue.id))
      expect(store.slots).toEqual([{ cueId: STUDENT, key: 'student_name', text: 'Noa' }])
    }
    // And this module reads the roles the old one ignores.
    expect(parseCatalogBody(body(roles)).roles).toEqual(roles)
    expect('roles' in parseCatalogBody(body(undefined))).toBe(false)
  })
})
