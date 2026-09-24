import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceStatus } from '@companion-module/base'
import { moduleVersion, parseVersion, readVersionFrom, versionCandidates } from '../src/version.js'
import { parseSnapshot } from '../src/client.js'
import { config, destroyAll, harness, secrets, snapshotFrame, start, PAIRED_TOKEN, PREVIOUS_TOKEN } from './harness.js'

afterEach(destroyAll)

describe('pairing through the module configuration', () => {
  it('a successful redeem persists the token and blanks the code', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets())
    await h.instance.configUpdated(config('123456'), secrets())

    const redeem = h.requests.find(request => request.url.endsWith('/api/pairing/redeem'))
    expect(redeem?.body).toEqual({ code: '123456' })
    expect(h.saved).toHaveLength(1)
    expect(h.saved[0]?.config).toMatchObject({ baseUrl: 'https://example.test', pairingCode: '' })
    expect(h.saved[0]?.secrets).toEqual({ controlKey: '', deviceToken: PAIRED_TOKEN })

    await vi.waitFor(() => expect(h.requests.some(request => request.url.includes('/api/realtime'))).toBe(true))
    expect(h.requests.find(request => request.url.includes('/api/realtime'))?.authorization).toBe(`Bearer ${PAIRED_TOKEN}`)
  })

  it('a failed redeem leaves the previous credential intact', async () => {
    const h = start(harness({ redeem: () => new Response(JSON.stringify({ error: 'That pairing code has expired' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) }))
    await h.instance.init(config(), true, secrets({ deviceToken: PREVIOUS_TOKEN }))
    h.requests.length = 0
    await h.instance.configUpdated(config('123456'), secrets({ deviceToken: PREVIOUS_TOKEN }))

    expect(h.saved).toHaveLength(0)
    expect(h.statuses.some(entry => entry.message === 'That pairing code has expired')).toBe(true)
    await vi.waitFor(() => expect(h.requests.some(request => request.url.includes('/api/realtime'))).toBe(true))
    expect(h.requests.find(request => request.url.includes('/api/realtime'))?.authorization).toBe(`Bearer ${PREVIOUS_TOKEN}`)
  })

  it('the control key still takes precedence over a paired device token', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ controlKey: 'legacy-control-key', deviceToken: PREVIOUS_TOKEN }))
    await vi.waitFor(() => expect(h.requests.some(request => request.url.includes('/api/realtime'))).toBe(true))
    expect(h.requests.find(request => request.url.includes('/api/realtime'))?.authorization).toBe('Bearer legacy-control-key')
  })

  it('no credential at all is a bad configuration and sends nothing', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets())
    expect(h.requests).toHaveLength(0)
    expect(h.statuses.at(-1)).toEqual({ status: InstanceStatus.BadConfig, message: 'Enter a pairing code or a control key' })
  })

  it('exposes the pairing code beside the device token in the configuration fields', () => {
    const h = start(harness())
    const fields = h.instance.getConfigFields().map(field => ({ id: field.id, type: field.type, label: field.label }))
    expect(fields).toEqual([
      { id: 'baseUrl', type: 'textinput', label: 'Overlay base URL' },
      { id: 'pairingCode', type: 'textinput', label: 'Pairing code' },
      { id: 'deviceToken', type: 'secret-text', label: 'Device token' },
      { id: 'controlKey', type: 'secret-text', label: 'Control key' },
      { id: 'meaning', type: 'static-text', label: 'Feedback meaning' },
    ])
  })
})

describe('the hello frame', () => {
  it('names the client and the module version', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
    h.sockets[0]!.emit('open')
    const hello = JSON.parse(h.sockets[0]!.sent[0]!) as { type: string; id: string; client: string; version: string | null }
    expect(hello.type).toBe('hello')
    expect(hello.client).toBe('companion')
    expect(hello.version).toBe(moduleVersion())
    expect(hello.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('reports the packaged module version', () => {
    const packaged = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(moduleVersion()).toBe(packaged.version)
  })

  it('reads the version from whichever packaged layout exists', () => {
    const files: Record<string, string> = { '/module/companion/manifest.json': JSON.stringify({ version: '9.9.9' }) }
    const read = (path: string) => { const value = files[path.split('\\').join('/')]; if (value === undefined) throw new Error('missing'); return value }
    expect(readVersionFrom(versionCandidates('/module').map(path => path.split('\\').join('/')), read)).toBe('9.9.9')
  })

  it('never invents a version the relay would reject', () => {
    expect(parseVersion('1.4.0')).toBe('1.4.0')
    expect(parseVersion('1.4.0-beta')).toBeNull()
    expect(parseVersion('1.4')).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
    expect(readVersionFrom(['/nowhere.json'], () => { throw new Error('missing') })).toBeNull()
  })
})

describe('snapshot tolerance and published variables', () => {
  it('parseSnapshot tolerates the new controllers array', () => {
    const withControllers = { ...snapshotFrame().snapshot, controllers: [{ id: 'c1', client: 'companion', version: '1.4.0', seen: 9_400 }] }
    expect(parseSnapshot(withControllers)).toEqual(snapshotFrame().snapshot)
  })

  it('publishes every variable on each feedback publish', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    await vi.waitFor(() => expect(h.sockets).toHaveLength(1))
    h.sockets[0]!.emit('open')
    h.sockets[0]!.message(snapshotFrame())
    // A presence frame carrying the new controllers array must not break the client.
    h.sockets[0]!.message({ type: 'presence', renderers: snapshotFrame().snapshot.renderers, controllers: [{ id: 'c1', client: 'companion', version: '1.4.0', seen: 9_400 }], serverTime: 10_100 })

    const keys = ['current_name', 'current_panel', 'panel_count', 'connection', 'requested_name', 'requested_cue', 'requested_cue_id', 'revision', 'renderer_status', 'bug', 'bug_page', 'logo', 'logo_state']
    expect(h.variables.length).toBeGreaterThan(1)
    for (const published of h.variables) expect(Object.keys(published).sort()).toEqual([...keys].sort())
    expect(h.variables.at(-1)).toMatchObject({ current_name: 'Barechu', requested_name: 'Barechu', requested_cue: 'Barechu', connection: 'Connected', renderer_status: 'Rendered', revision: 4, current_panel: '', panel_count: '', bug: 'Off', bug_page: '' })
  })

  it('names every variable for the operator', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.variableDefinitions).toEqual({
      current_name: { name: 'Current graphic' },
      current_panel: { name: 'Current panel' },
      panel_count: { name: 'Panels' },
      connection: { name: 'Connection' },
      requested_name: { name: 'Requested graphic' },
      requested_cue: { name: 'Requested cue' },
      requested_cue_id: { name: 'Requested cue ID' },
      revision: { name: 'Requested revision' },
      renderer_status: { name: 'Renderer status' },
      bug: { name: 'Scan card' },
      bug_page: { name: 'Scan card page' },
      logo: { name: 'Resting logo' },
      logo_state: { name: 'Resting logo state' },
    })
  })

  it('offers presets whose button text shows the new variables', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.presets.connection_status?.style?.text).toBe('$(overlays:connection)\n$(overlays:current_name)')
    expect(h.presets.current_panel?.style?.text).toBe('$(overlays:current_panel) of $(overlays:panel_count)')
  })

  // The brand strings live in src/brand.ts; the TBI module is derived from the compiled
  // module by prefix (scripts/build-tbi-companion-module.mjs). These are the CRC values.
  it('keeps the CRC default base URL and one Overlay Controls preset section', async () => {
    const h = start(harness())
    const baseUrl = h.instance.getConfigFields().find(field => field.id === 'baseUrl') as { default?: string } | undefined
    expect(baseUrl?.default).toBe('https://overlays.centralreform.org')
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.presetStructure).toEqual([{ id: 'crc_overlay_controls', name: 'CRC Overlay Controls', definitions: Object.keys(h.presets) }])
  })

  it('offers a scan card toggle preset and a next panel preset', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.presets.bug?.name).toBe('Scan card')
    expect(h.presets.bug?.steps?.map(step => step.down.map(action => action.actionId))).toEqual([['bug_on'], ['bug_off']])
    expect(h.presets.bug?.feedbacks?.map(feedback => feedback.feedbackId)).toContain('bug_visible')
    expect(h.presets.next_panel?.name).toBe('Next panel')
    expect(h.presets.next_panel?.steps?.[0]?.down).toEqual([{ actionId: 'next_panel', options: { set: '' } }])
  })
})

describe('the action and feedback surface', () => {
  it('registers exactly these actions, with these option fields and labels', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    const shape = Object.entries(h.actions).map(([id, action]) => ({ id, name: action.name, options: action.options.map(option => ({ id: option.id, type: option.type, label: option.label })) }))
    expect(shape).toEqual([
      { id: 'show_cue', name: 'Show cue', options: [{ id: 'cue', type: 'dropdown', label: 'Cue' }] },
      { id: 'toggle_cue', name: 'Toggle cue', options: [{ id: 'cue', type: 'dropdown', label: 'Cue' }] },
      { id: 'animate_out', name: 'Animate cue out', options: [{ id: 'cue', type: 'dropdown', label: 'Cue' }] },
      { id: 'animate_clear', name: 'Animate out', options: [] },
      { id: 'clear_now', name: 'Clear now', options: [] },
      { id: 'refresh_catalog', name: 'Refresh cue catalog', options: [] },
      { id: 'bug_on', name: 'Bug on', options: [] },
      { id: 'bug_off', name: 'Bug off', options: [] },
      { id: 'logo_on', name: 'Resting logo on', options: [] },
      { id: 'logo_off', name: 'Resting logo off', options: [] },
      { id: 'logo_toggle', name: 'Resting logo toggle', options: [] },
      { id: 'set_page', name: 'Set page', options: [{ id: 'page', type: 'textinput', label: 'Page' }] },
      { id: 'next_panel', name: 'Next panel', options: [{ id: 'set', type: 'dropdown', label: 'Panel set' }] },
      { id: 'previous_panel', name: 'Previous panel', options: [{ id: 'set', type: 'dropdown', label: 'Panel set' }] },
    ])
  })

  it('names the page field with the tooltip Daniel wrote and validates it in the field itself', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    const page = h.actions.set_page!.options[0]!
    expect(page.tooltip).toBe('A page number or short label shown beside the scan card. Clear now removes it.')
    expect(page.regex).toBe('^$|^[A-Za-z0-9 .,\\-–]{1,12}$')
  })

  it('registers the scan card and resting logo feedbacks beside the existing three', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(Object.entries(h.feedbacks).map(([id, feedback]) => ({ id, name: feedback.name, type: feedback.type }))).toEqual([
      { id: 'requested', name: 'Cue requested', type: 'boolean' },
      { id: 'rendered', name: 'Cue rendered', type: 'boolean' },
      { id: 'bug_visible', name: 'Scan card visible', type: 'boolean' },
      { id: 'logo_enabled', name: 'Resting logo enabled', type: 'boolean' },
      { id: 'logo_held', name: 'Resting logo held back', type: 'boolean' },
      { id: 'slot_empty', name: 'Slot is empty', type: 'boolean' },
      { id: 'disconnected', name: 'Realtime or renderer disconnected', type: 'boolean' },
    ])
  })
})
