import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceStatus } from '@companion-module/base'
import { parseSnapshot } from '../src/client.js'
import { config, destroyAll, harness, secrets, snapshotFrame, start, type Harness, type HarnessOptions, PAIRED_TOKEN } from './harness.js'

afterEach(destroyAll)

const PANEL_SET = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Mi Shebeirach — 01 of 03', layout: 'bottom' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Mi Shebeirach — 02 of 03', layout: 'bottom' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Mi Shebeirach — 03 of 03', layout: 'bottom' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Kaddish — 01 of 02', layout: 'bottom' },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Kaddish — 02 of 02', layout: 'bottom' },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Barechu', layout: 'bottom' },
]
const catalogResponse = () => new Response(JSON.stringify(PANEL_SET), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CRC-Catalog-Version': 'catalog-panels' } })

/** A connected module holding one snapshot, with the panel catalog loaded on request. */
async function connected(options: HarnessOptions & { panels?: boolean; snapshot?: Record<string, unknown> } = {}): Promise<Harness> {
  const { panels, snapshot, ...rest } = options
  const h = start(harness({ ...rest, ...(panels ? { catalog: catalogResponse } : {}) }))
  await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
  await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
  h.sockets[0]!.emit('open')
  h.sockets[0]!.message(snapshotFrame({ catalogVersion: panels ? 'catalog-panels' : 'catalog-1', ...(snapshot ?? {}) }))
  if (panels) await vi.waitFor(() => expect(h.actions.next_panel!.options[0]!.choices).toHaveLength(3))
  h.requests.length = 0
  return h
}

const commands = (h: Harness) => h.requests.filter(request => request.url.endsWith('/api/command')).map(request => request.body as Record<string, unknown>)
const withoutIdentity = (body: Record<string, unknown>) => { const { commandId, clientId, sequence, ...rest } = body; return rest }

describe('the scan card actions', () => {
  it('Bug on shows the card and carries the page the live state already has', async () => {
    const h = await connected({ snapshot: { bug: { on: true, page: '142' } } })
    await h.actions.bug_on!.callback({ options: {} })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'bug', cue: null, bug: { on: true, page: '142' } }])
  })

  it('Bug on with no card yet sends a null page rather than inventing one', async () => {
    const h = await connected()
    await h.actions.bug_on!.callback({ options: {} })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'bug', cue: null, bug: { on: true, page: null } }])
  })

  it('Bug off hides the card and its page', async () => {
    const h = await connected({ snapshot: { bug: { on: true, page: '142' } } })
    await h.actions.bug_off!.callback({ options: {} })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'bug', cue: null, bug: { on: false, page: null } }])
  })

  it('Set page shows the card with that page', async () => {
    const h = await connected()
    await h.actions.set_page!.callback({ options: { page: 'p. 142' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'bug', cue: null, bug: { on: true, page: 'p. 142' } }])
  })

  it('an empty page keeps the card on and carries no page', async () => {
    const h = await connected()
    await h.actions.set_page!.callback({ options: { page: '' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'bug', cue: null, bug: { on: true, page: null } }])
  })

  it('refuses a thirteen character page before any request leaves the module', async () => {
    const h = await connected()
    await h.actions.set_page!.callback({ options: { page: '1234567890123' } })
    expect(commands(h)).toEqual([])
    expect(h.statuses.at(-1)).toEqual({ status: InstanceStatus.UnknownWarning, message: 'Page must be 12 characters or fewer.' })
  })

  it('refuses a page with characters the relay does not accept', async () => {
    const h = await connected()
    await h.actions.set_page!.callback({ options: { page: 'p<142>' } })
    expect(commands(h)).toEqual([])
  })

  it('reports a refused scan card command in the server’s own words and changes no variable', async () => {
    const h = await connected({ command: () => new Response(JSON.stringify({ error: 'The scan card is not set up for this congregation.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) })
    h.variables.length = 0
    await h.actions.bug_on!.callback({ options: {} })
    expect(h.statuses.at(-1)?.status).toBe(InstanceStatus.ConnectionFailure)
    expect(h.statuses.at(-1)?.message).toContain('The scan card is not set up for this congregation.')
    for (const published of h.variables) expect(published).toMatchObject({ bug: 'Off', bug_page: '' })
  })
})

describe('the scan card feedback and variables', () => {
  it('a snapshot without a bug reads Off and blank, never undefined', async () => {
    const h = await connected()
    const published = h.variables.at(-1)!
    expect(published.bug).toBe('Off')
    expect(published.bug_page).toBe('')
    expect(h.feedbacks.bug_visible!.callback({ options: {} })).toBe(false)
  })

  it('lights Scan card visible and publishes the page when the snapshot carries one', async () => {
    const h = await connected({ snapshot: { bug: { on: true, page: '142' } } })
    expect(h.feedbacks.bug_visible!.callback({ options: {} })).toBe(true)
    const published = h.variables.at(-1)!
    expect(published.bug).toBe('On')
    expect(published.bug_page).toBe('142')
  })

  it('treats a malformed bug as absent rather than failing the whole snapshot', () => {
    const base = snapshotFrame().snapshot
    expect(parseSnapshot({ ...base, bug: { on: 'yes', page: null } })).toEqual(base)
    expect(parseSnapshot({ ...base, bug: { on: true, page: 'far too long a page' } })).toEqual(base)
    expect(parseSnapshot({ ...base, bug: null })).toEqual(base)
    expect(parseSnapshot({ ...base, bug: { on: true, page: '142' } })).toEqual({ ...base, bug: { on: true, page: '142' } })
  })

  it('a snapshot with no bug key leaves the variables Off and blank', async () => {
    const h = await connected()
    h.variables.length = 0
    h.sockets[0]!.message({ type: 'presence', renderers: snapshotFrame().snapshot.renderers, serverTime: 10_100 })
    expect(h.variables.at(-1)).toMatchObject({ bug: 'Off', bug_page: '' })
    expect(h.variables.at(-1)!.bug_page).not.toBeUndefined()
  })
})

describe('generic panel navigation', () => {
  it('Next panel from 2 of 3 shows 3 of 3', async () => {
    const h = await connected({ panels: true, snapshot: { cue: PANEL_SET[1]!.id } })
    await h.actions.next_panel!.callback({ options: { set: '' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'in', cue: PANEL_SET[2]!.id }])
  })

  it('Next panel from 3 of 3 wraps to 1 of 3', async () => {
    const h = await connected({ panels: true, snapshot: { cue: PANEL_SET[2]!.id } })
    await h.actions.next_panel!.callback({ options: { set: '' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'in', cue: PANEL_SET[0]!.id }])
  })

  it('Previous panel from 1 of 3 wraps to 3 of 3', async () => {
    const h = await connected({ panels: true, snapshot: { cue: PANEL_SET[0]!.id } })
    await h.actions.previous_panel!.callback({ options: { set: '' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'in', cue: PANEL_SET[2]!.id }])
  })

  it('Next panel from a single-part graphic shows panel 01 of the selected set', async () => {
    const h = await connected({ panels: true, snapshot: { cue: PANEL_SET[5]!.id } })
    await h.actions.next_panel!.callback({ options: { set: 'Kaddish' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'in', cue: PANEL_SET[3]!.id }])
  })

  it('Next panel from a cleared output shows panel 01 of the selected set', async () => {
    const h = await connected({ panels: true, snapshot: { cue: null } })
    await h.actions.next_panel!.callback({ options: { set: 'Mi Shebeirach' } })
    expect(commands(h).map(withoutIdentity)).toEqual([{ action: 'in', cue: PANEL_SET[0]!.id }])
  })

  it('Next panel with nothing selected and nothing to continue sends no request', async () => {
    const h = await connected({ panels: true, snapshot: { cue: PANEL_SET[5]!.id } })
    await h.actions.next_panel!.callback({ options: { set: '' } })
    expect(commands(h)).toEqual([])
  })

  it('offers the panel sets of the catalog, and None, as the set choices', async () => {
    const h = await connected({ panels: true })
    expect(h.actions.next_panel!.options[0]!.choices).toEqual([
      { id: '', label: 'None' },
      { id: 'Mi Shebeirach', label: 'Mi Shebeirach' },
      { id: 'Kaddish', label: 'Kaddish' },
    ])
  })
})
