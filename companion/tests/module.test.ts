import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstanceStatus } from '@companion-module/base'
import CrcOverlaysInstance from '../src/main.js'
import { moduleVersion, parseVersion, readVersionFrom, versionCandidates } from '../src/version.js'
import { parseSnapshot } from '../src/client.js'

const PAIRED_TOKEN = 'cd_abcdefghijkl.mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ'
const PREVIOUS_TOKEN = 'cd_zyxwvutsrqpo.0123456789abcdefghijklmnopqrstuvwxyzABCDE'
const CUE = 'efa9fad4-f7d5-4091-a708-82103028861b'

const bootstrap = { url: 'wss://relay.example.test/connect', ticket: 'one-time-ticket', heartbeatMs: 10_000, staleMs: 30_000, protocol: 1 }
const snapshotFrame = (overrides: Record<string, unknown> = {}) => ({
  type: 'snapshot',
  snapshot: {
    revision: 4, cue: CUE, mode: 'animate', updated: 1_000, catalogVersion: 'catalog-1', serverTime: 10_000,
    renderers: [{ id: 'output', revision: 4, cue: CUE, phase: 'settled', seen: 9_500 }],
    ...overrides,
  },
})

class FakeSocket {
  protocol = 'crc-overlays-v1'
  readyState = 1
  sent: string[] = []
  readonly listeners = new Map<string, Array<(event: Event | MessageEvent) => void>>()
  addEventListener(type: string, listener: (event: Event | MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  send(data: string): void { this.sent.push(data) }
  close(code?: number, reason?: string): void { this.readyState = 3; this.emit('close', new CloseEvent('close', { code, reason })) }
  emit(type: string, event: Event | MessageEvent = new Event(type)): void { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  message(value: unknown): void { this.emit('message', new MessageEvent('message', { data: JSON.stringify(value) })) }
}

interface Harness {
  instance: CrcOverlaysInstance
  saved: Array<{ config: Record<string, unknown> | undefined; secrets: Record<string, unknown> | undefined }>
  statuses: Array<{ status: InstanceStatus; message: string | null }>
  variables: Array<Record<string, unknown>>
  variableDefinitions: Record<string, { name: string }>
  presets: Record<string, { style?: { text?: string } }>
  requests: Array<{ url: string; authorization: string | null; body: unknown }>
  sockets: FakeSocket[]
}

function harness(options: { redeem?: () => Response } = {}): Harness {
  const saved: Harness['saved'] = []
  const statuses: Harness['statuses'] = []
  const variables: Harness['variables'] = []
  const requests: Harness['requests'] = []
  const sockets: FakeSocket[] = []
  let variableDefinitions: Record<string, { name: string }> = {}
  let presets: Record<string, { style?: { text?: string } }> = {}

  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url)
    requests.push({ url: target, authorization: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : null })
    if (target.endsWith('/api/pairing/redeem')) return options.redeem?.() ?? new Response(JSON.stringify({ token: PAIRED_TOKEN, name: 'Sanctuary PC', kind: 'companion' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (target.includes('/api/realtime')) return new Response(JSON.stringify(bootstrap), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CRC-Catalog-Version': 'catalog-1' } })
  }) as unknown as typeof globalThis.fetch

  const context = {
    _isInstanceContext: true as const,
    id: 'instance-1',
    label: 'overlays',
    upgradeScripts: [],
    saveConfig: (config: Record<string, unknown> | undefined, secrets: Record<string, unknown> | undefined) => { saved.push({ config, secrets }) },
    updateStatus: (status: InstanceStatus, message: string | null) => { statuses.push({ status, message }) },
    oscSend: () => undefined,
    recordAction: () => undefined,
    setActionDefinitions: () => undefined,
    subscribeActions: () => undefined,
    unsubscribeActions: () => undefined,
    setFeedbackDefinitions: () => undefined,
    unsubscribeFeedbacks: () => undefined,
    checkFeedbacks: () => undefined,
    checkAllFeedbacks: () => undefined,
    checkFeedbacksById: () => undefined,
    setPresetDefinitions: (_structure: unknown, value: Record<string, { style?: { text?: string } }>) => { presets = value },
    setVariableDefinitions: (value: Record<string, { name: string }>) => { variableDefinitions = value },
    setVariableValues: (values: Record<string, unknown>) => { variables.push(values) },
    getVariableValue: () => undefined,
    sharedUdpSocketHandlers: new Map(),
    sharedUdpSocketJoin: async () => '',
    sharedUdpSocketLeave: async () => undefined,
    sharedUdpSocketSend: async () => undefined,
  }

  const instance = new CrcOverlaysInstance(context, {
    fetch: fetchMock,
    webSocketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket },
  })

  return {
    instance, saved, statuses, variables, requests, sockets,
    get variableDefinitions() { return variableDefinitions },
    get presets() { return presets },
  } as Harness
}

const config = (pairingCode = '') => ({ baseUrl: 'https://example.test', pairingCode })
const secrets = (overrides: { controlKey?: string; deviceToken?: string } = {}) => ({ controlKey: '', deviceToken: '', ...overrides })
const live: CrcOverlaysInstance[] = []
const start = (h: Harness) => { live.push(h.instance); return h }

afterEach(async () => { while (live.length) await live.pop()?.destroy() })

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

    const keys = ['current_name', 'current_panel', 'panel_count', 'connection', 'requested_name', 'requested_cue', 'revision', 'renderer_status']
    expect(h.variables.length).toBeGreaterThan(1)
    for (const published of h.variables) expect(Object.keys(published).sort()).toEqual([...keys].sort())
    expect(h.variables.at(-1)).toMatchObject({ current_name: 'Barechu', requested_name: 'Barechu', requested_cue: 'Barechu', connection: 'Connected', renderer_status: 'Rendered', revision: 4, current_panel: '', panel_count: '' })
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
      revision: { name: 'Requested revision' },
      renderer_status: { name: 'Renderer status' },
    })
  })

  it('offers presets whose button text shows the new variables', async () => {
    const h = start(harness())
    await h.instance.init(config(), true, secrets({ deviceToken: PAIRED_TOKEN }))
    expect(h.presets.connection_status?.style?.text).toBe('$(overlays:connection)\n$(overlays:current_name)')
    expect(h.presets.current_panel?.style?.text).toBe('$(overlays:current_panel) of $(overlays:panel_count)')
  })
})
