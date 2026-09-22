import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceStatus, combineRgb } from '@companion-module/base'
import { CatalogStore, categoryColour, slotVariableValue, validateCatalog, validateSlots, type CatalogCue } from '../src/catalog.js'
import { parseCatalogBody } from '../src/client.js'
import { config, destroyAll, harness, secrets, snapshotFrame, start, PAIRED_TOKEN, CUE } from './harness.js'

afterEach(destroyAll)

const STUDENT = '17db1877-425a-4ea7-b123-664a9756f2ae'
const TORAH_1 = 'e3624fda-b7ff-44a0-b3ef-7add80524ef7'

const slotCatalog: CatalogCue[] = [
  { id: CUE, name: 'Barechu', layout: 'bottom', category: 'core_liturgy' },
  { id: STUDENT, name: 'Student name', layout: 'bottom', category: 'names', slot: { key: 'student_name' } },
  { id: TORAH_1, name: 'Torah reading 1', layout: 'bottom', category: 'names', slot: { key: 'torah_1' } },
]

const envelope = (slots: Array<{ cueId: string; key: string; text: string }>) => () =>
  new Response(JSON.stringify({ version: 'catalog-2', cues: slotCatalog, slots }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CRC-Catalog-Version': 'catalog-2' } })

describe('the slot half of the catalog', () => {
  it('reads either shape the catalog endpoint may answer with', () => {
    expect(parseCatalogBody([{ id: CUE }])).toEqual({ cues: [{ id: CUE }] })
    expect(parseCatalogBody({ version: 'v', cues: [], slots: [] })).toEqual({ cues: [], slots: [] })
  })

  it('accepts a slot marker and a category, and refuses a key that could not be a variable name', () => {
    expect(validateCatalog(slotCatalog)[1]?.slot).toEqual({ key: 'student_name' })
    expect(validateCatalog(slotCatalog)[0]?.category).toBe('core_liturgy')
    expect(() => validateCatalog([{ ...slotCatalog[1], slot: { key: 'Student Name' } }])).toThrow(/slot key/)
    expect(() => validateCatalog([{ ...slotCatalog[0], category: 'Core Liturgy' }])).toThrow(/category/)
  })

  it('refuses a slot index that names a cue the catalog does not carry', () => {
    const store = new CatalogStore([slotCatalog[0]!])
    expect(store.replace(slotCatalog, [{ cueId: STUDENT, key: 'student_name', text: 'Noa' }])).toBe(true)
    expect(store.replace(slotCatalog, [{ cueId: '75ff6cbd-86f3-49ea-a007-77686ec3eaa4', key: 'ghost', text: '' }])).toBe(false)
    expect(store.slots).toEqual([{ cueId: STUDENT, key: 'student_name', text: 'Noa' }])
  })

  it('treats an absent slot index as no slots rather than a failure', () => {
    expect(validateSlots(undefined)).toEqual([])
    expect(() => validateSlots([{ cueId: STUDENT, key: 'student_name', text: 'a'.repeat(401) }])).toThrow()
  })

  it('cuts one Stream Deck line out of the slot text', () => {
    expect(slotVariableValue('')).toBe('')
    expect(slotVariableValue('  Noa  ')).toBe('Noa')
    expect(slotVariableValue('Noa Bogard\nEzra Bogard')).toBe('Noa Bogard')
    expect(slotVariableValue('Bartholomew Fitzwilliam Abernathy')).toBe('Bartholomew Fitzwilliam…')
    expect(slotVariableValue('Bartholomew Fitzwilliam Abernathy')).toHaveLength(24)
  })

  it('colours an unknown or absent category as core liturgy rather than refusing it', () => {
    expect(categoryColour('names')).toEqual({ bgcolor: combineRgb(255, 255, 64), color: combineRgb(0, 0, 0) })
    expect(categoryColour(undefined)).toEqual(categoryColour('core_liturgy'))
    expect(categoryColour('no_such_category')).toEqual(categoryColour('core_liturgy'))
  })
})

describe('slot variables and presets in a connected module', () => {
  const connected = async (slots: Array<{ cueId: string; key: string; text: string }>) => {
    const h = start(harness({ catalog: envelope(slots) }))
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
    h.sockets[0]!.emit('open')
    h.sockets[0]!.message(snapshotFrame({ catalogVersion: 'catalog-1' }))
    await vi.waitFor(() => expect(h.variableDefinitions.slot_student_name).toBeDefined())
    return h
  }

  it('declares one variable per slot without anyone pressing Refresh cue catalog', async () => {
    const h = await connected([{ cueId: STUDENT, key: 'student_name', text: 'Noa Bogard' }, { cueId: TORAH_1, key: 'torah_1', text: '' }])
    expect(h.variableDefinitions.slot_student_name).toEqual({ name: 'Slot: Student name' })
    expect(h.variableDefinitions.slot_torah_1).toEqual({ name: 'Slot: Torah reading 1' })
    expect(h.variableDefinitions.requested_cue_id).toEqual({ name: 'Requested cue ID' })
    await vi.waitFor(() => expect(h.variables.at(-1)?.slot_student_name).toBe('Noa Bogard'))
    expect(h.variables.at(-1)?.slot_torah_1).toBe('')
    expect(h.variables.at(-1)?.requested_cue_id).toBe(CUE)
    expect(h.variables.at(-1)?.requested_cue).toBe('Barechu')
  })

  it('offers a slot preset that reads the slot variable and dims while it is empty', async () => {
    const h = await connected([{ cueId: STUDENT, key: 'student_name', text: 'Noa Bogard' }, { cueId: TORAH_1, key: 'torah_1', text: '' }])
    const preset = h.presets[`slot_${STUDENT}`]
    expect(preset?.style?.text).toBe('Student name\n$(overlays:slot_student_name)')
    expect(preset?.steps?.[0]?.down).toEqual([{ actionId: 'toggle_cue', options: { cue: STUDENT } }])
    expect(preset?.feedbacks?.map(feedback => feedback.feedbackId)).toEqual(['slot_empty', 'requested', 'rendered', 'disconnected'])
    expect(h.feedbacks.slot_empty?.callback({ options: { cue: TORAH_1 } })).toBe(true)
    expect(h.feedbacks.slot_empty?.callback({ options: { cue: STUDENT } })).toBe(false)
    expect(h.feedbacks.slot_empty?.callback({ options: { cue: CUE } })).toBe(false)
  })

  it('colours the generated presets by category', async () => {
    const h = await connected([{ cueId: STUDENT, key: 'student_name', text: 'Noa' }, { cueId: TORAH_1, key: 'torah_1', text: '' }])
    expect(h.presets[`show_${CUE}`]?.style).toMatchObject({ bgcolor: combineRgb(0, 102, 153), color: combineRgb(255, 255, 255) })
    expect(h.presets[`slot_${STUDENT}`]?.style).toMatchObject({ bgcolor: combineRgb(255, 255, 64), color: combineRgb(0, 0, 0) })
  })

  it('still starts and simply has no slot variables against a server that answers the bare array', async () => {
    const h = start(harness({ catalog: () => new Response(JSON.stringify(slotCatalog.map(({ slot: _slot, ...cue }) => cue)), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CRC-Catalog-Version': 'catalog-2' } }) }))
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
    h.sockets[0]!.emit('open')
    h.sockets[0]!.message(snapshotFrame({ catalogVersion: 'catalog-1' }))
    await vi.waitFor(() => expect(h.presets[`show_${STUDENT}`]).toBeDefined())
    expect(Object.keys(h.variableDefinitions).some(key => key.startsWith('slot_'))).toBe(false)
    expect(Object.keys(h.presets).some(key => key.startsWith('slot_'))).toBe(false)
    expect(h.statuses.at(-1)?.status).not.toBe(InstanceStatus.ConnectionFailure)
  })
})

describe('the presets an operator expects to find', () => {
  it('offers Previous panel, Refresh catalog and Set page, and exactly one Clear now', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.presets.previous_panel?.style?.text).toBe('Previous\npanel')
    expect(h.presets.previous_panel?.steps?.[0]?.down).toEqual([{ actionId: 'previous_panel', options: { set: '' } }])
    expect(h.presets.refresh_catalog?.steps?.[0]?.down).toEqual([{ actionId: 'refresh_catalog', options: {} }])
    expect(h.presets.set_page?.steps?.[0]?.down).toEqual([{ actionId: 'set_page', options: { page: '' } }])
    expect(Object.values(h.presets).filter(preset => preset.name === 'Clear now')).toHaveLength(1)
    expect(h.presets.clear_now?.style?.text).toBe('CLEAR\nNOW')
  })
})

describe('red means it is up', () => {
  it('gives rendered the same red as the Singular buttons beside it, and leaves the clear buttons green', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.feedbacks.rendered?.defaultStyle).toEqual({ bgcolor: combineRgb(255, 0, 0), color: combineRgb(255, 255, 255) })
    expect(h.feedbacks.requested?.defaultStyle).toEqual({ bgcolor: combineRgb(180, 110, 0), color: combineRgb(255, 255, 255) })
    expect(h.feedbacks.disconnected?.defaultStyle).toEqual({ bgcolor: combineRgb(175, 0, 0), color: combineRgb(255, 255, 255) })
    const cuePreset = h.presets[`show_${CUE}`]
    expect(cuePreset?.feedbacks?.find(feedback => feedback.feedbackId === 'rendered')?.style).toEqual({ bgcolor: combineRgb(255, 0, 0) })
    // Both clear buttons light when the output is confirmed CLEAR: nothing is on screen,
    // so red there would contradict the rule the colours teach.
    expect(h.presets.animate_out?.feedbacks?.find(feedback => feedback.feedbackId === 'rendered')?.style).toEqual({ bgcolor: combineRgb(0, 130, 70) })
    expect(h.presets.clear_now?.feedbacks?.find(feedback => feedback.feedbackId === 'rendered')?.style).toEqual({ bgcolor: combineRgb(0, 130, 70) })
  })
})

describe('a press while the realtime connection is down', () => {
  it('sends the command anyway and says so', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
    // The socket never opened: this is exactly the reconnect window a press used to fall into.
    h.requests.length = 0
    await h.actions.toggle_cue!.callback({ options: { cue: CUE } })

    const command = h.requests.find(request => request.url.endsWith('/api/command'))
    expect(command).toBeDefined()
    expect(command?.body).toMatchObject({ action: 'in', cue: CUE })
    const status = h.statuses.at(-1)
    expect(status?.status).toBe(InstanceStatus.UnknownWarning)
    expect(status?.message).toBe('Sent without the live connection. Confirmation will follow when it reconnects.')
  })

  it('does not buy that reliability by lying about what is on screen', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
    await h.actions.toggle_cue!.callback({ options: { cue: CUE } })
    expect(h.feedbacks.rendered?.callback({ options: { cue: CUE } })).toBe(false)
    expect(h.variables.at(-1)?.current_name).toBe('')
  })
})
