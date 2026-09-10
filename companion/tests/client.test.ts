import { describe, expect, it, vi } from 'vitest'
import { deriveFeedback, isNewerSnapshot, OverlayClient, type OverlaySnapshot, type RealtimeConnectionState } from '../src/client.js'

const snapshot = (overrides: Partial<OverlaySnapshot> = {}): OverlaySnapshot => ({
  revision: 4, cue: 'cue-a', mode: 'animate', updated: 1_000, catalogVersion: 'catalog-1', serverTime: 10_000,
  renderers: [{ id: 'output', revision: 4, cue: 'cue-a', phase: 'settled', seen: 9_500 }], ...overrides,
})
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const bootstrap = { url: 'wss://relay.example.test/connect', ticket: 'one-time-ticket', heartbeatMs: 10_000, staleMs: 30_000, protocol: 1 as const }

class FakeSocket {
  protocol = 'crc-overlays-v1'
  readyState = 1
  sent: string[] = []
  closes: Array<{ code?: number; reason?: string }> = []
  readonly listeners = new Map<string, Array<(event: Event | MessageEvent) => void>>()
  addEventListener(type: string, listener: (event: Event | MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  send(data: string): void { this.sent.push(data) }
  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason })
    this.readyState = 3
    this.emit('close', new Event('close'))
  }
  emit(type: string, event: Event | MessageEvent = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
  message(value: unknown): void { this.emit('message', new MessageEvent('message', { data: JSON.stringify(value) })) }
}

describe('OverlayClient ordering', () => {
  it('loads the catalog through the authenticated API route', async () => {
    let request: { url: string; authorization: string | null } | null = null
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      request = { url: String(url), authorization: new Headers(init?.headers).get('Authorization') }
      return response([])
    })
    const client = new OverlayClient({ baseUrl: 'https://example.test/', controlKey: 'secret', clientId: 'companion-test', fetch: fetchMock })
    await client.catalog()
    expect(request).toEqual({ url: 'https://example.test/api/catalog', authorization: 'Bearer secret' })
  })

  it('a delayed In cannot supersede a later Cut', async () => {
    const arrivals: Array<{ action: string; sequence: number }> = []
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as { action: string; sequence: number }
      if (command.action === 'in') await new Promise(resolve => setTimeout(resolve, 20))
      arrivals.push(command)
      return response({ commandId: 'ack', ...snapshot({ cue: command.action === 'cut' ? null : 'cue-a' }) })
    })
    const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'companion-test', fetch: fetchMock, now: () => 123, retryDelays: [] })
    await Promise.all([client.activate('in', 'cue-a'), client.activate('cut')])
    const cut = arrivals.find(command => command.action === 'cut')!
    const delayedIn = arrivals.find(command => command.action === 'in')!
    expect(arrivals.map(command => command.action)).toEqual(['cut', 'in'])
    expect(cut.sequence).toBeGreaterThan(delayedIn.sequence)
    expect([...arrivals].sort((a, b) => a.sequence - b.sequence).at(-1)?.action).toBe('cut')
  })

  it('retries use the same command ID and sequence', async () => {
    const bodies: Array<{ commandId: string; sequence: number }> = []
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      if (bodies.length === 1) return response({ error: 'temporary' }, 503)
      return response({ commandId: bodies[0]!.commandId, ...snapshot() })
    })
    const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'companion-test', fetch: fetchMock, now: () => 456, sleep: async () => undefined, retryDelays: [0] })
    await client.activate('in', 'cue-a')
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual(bodies[0])
  })

  it('sends an unconditional animated clear without a cue', async () => {
    let body: Record<string, unknown> = {}
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return response({ commandId: body.commandId, ...snapshot({ cue: null }) })
    })
    const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'companion-test', fetch: fetchMock, retryDelays: [] })
    await client.activate('clear')
    expect(body).toMatchObject({ action: 'clear', clientId: 'companion-test' })
    expect(body).not.toHaveProperty('cue')
  })

  it('aborts a hung realtime bootstrap request at the configured deadline', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }))
      const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'companion-test', fetch: fetchMock, requestTimeoutMs: 20 })
      const pending = expect(client.realtimeBootstrap()).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(21)
      await pending
    } finally { vi.useRealTimers() }
  })
})

describe('realtime subscription', () => {
  it('bootstraps with control auth and opens the ticket subprotocol without polling state', async () => {
    const sockets: FakeSocket[] = []
    const socketArgs: Array<{ url: string; protocols: string[] }> = []
    const requests: string[] = []
    const authorization: Array<string | null> = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(String(url)); authorization.push(new Headers(init?.headers).get('Authorization'))
      return response(bootstrap)
    })
    const connections: RealtimeConnectionState[] = []
    const client = new OverlayClient({
      baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'command-client', fetch: fetchMock,
      webSocketFactory: (url, protocols) => { socketArgs.push({ url, protocols }); const socket = new FakeSocket(); sockets.push(socket); return socket },
    })
    const subscription = client.subscribe({ onSnapshot: vi.fn(), onPresence: vi.fn(), onCatalog: vi.fn(), onConnection: state => connections.push(state) })
    subscription.start()
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    sockets[0]!.emit('open')
    const hello = JSON.parse(sockets[0]!.sent[0]!) as { type: string; id: string }
    expect(requests).toEqual(['https://example.test/api/realtime?role=control'])
    expect(authorization).toEqual(['Bearer secret'])
    expect(requests.some(url => url.includes('/api/state'))).toBe(false)
    expect(socketArgs).toEqual([{ url: bootstrap.url, protocols: ['crc-overlays-v1', 'ticket.one-time-ticket'] }])
    expect(hello.type).toBe('hello')
    expect(hello.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(connections).toEqual(['connecting'])
    subscription.stop()
  })

  it('delivers snapshot, presence, and catalog events and connects only after snapshot', async () => {
    const socket = new FakeSocket()
    const onSnapshot = vi.fn(); const onPresence = vi.fn(); const onCatalog = vi.fn()
    const connections: RealtimeConnectionState[] = []
    const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'commands', fetch: vi.fn(async () => response(bootstrap)), webSocketFactory: () => socket })
    const subscription = client.subscribe({ onSnapshot, onPresence, onCatalog, onConnection: state => connections.push(state) })
    subscription.start(); await vi.waitFor(() => expect(socket.listeners.has('open')).toBe(true)); socket.emit('open')
    expect(connections).toEqual(['connecting'])
    socket.message({ type: 'snapshot', snapshot: snapshot() })
    socket.message({ type: 'presence', renderers: [], serverTime: 11_000 })
    socket.message({ type: 'catalog', version: 'catalog-2' })
    socket.message({ type: 'pong', serverTime: 11_001 })
    expect(onSnapshot).toHaveBeenCalledWith(snapshot())
    expect(onPresence).toHaveBeenCalledWith([], 11_000)
    expect(onCatalog).toHaveBeenCalledWith('catalog-2')
    expect(connections).toEqual(['connecting', 'connected'])
    subscription.stop()
  })

  it('heartbeats every ten seconds, closes stale transport, and reconnects with a fresh ticket', async () => {
    vi.useFakeTimers()
    try {
      const sockets: FakeSocket[] = []
      let ticket = 0
      const fetchMock = vi.fn(async () => response({ ...bootstrap, ticket: `ticket-${++ticket}` }))
      const connections: RealtimeConnectionState[] = []
      const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'commands', fetch: fetchMock, reconnectDelays: [100], webSocketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket } })
      const subscription = client.subscribe({ onSnapshot: vi.fn(), onPresence: vi.fn(), onCatalog: vi.fn(), onConnection: state => connections.push(state) })
      subscription.start(); await vi.advanceTimersByTimeAsync(0); sockets[0]!.emit('open'); sockets[0]!.message({ type: 'snapshot', snapshot: snapshot() })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({ type: 'heartbeat' })
      await vi.advanceTimersByTimeAsync(20_000)
      expect(sockets[0]!.closes.at(-1)).toEqual({ code: 4000, reason: 'Realtime connection stale' })
      expect(connections.at(-1)).toBe('disconnected')
      await vi.advanceTimersByTimeAsync(100)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(sockets).toHaveLength(2)
      subscription.stop()
    } finally { vi.useRealTimers() }
  })

  it('marks a closed socket disconnected immediately', async () => {
    const socket = new FakeSocket()
    const connections: RealtimeConnectionState[] = []
    const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'commands', fetch: vi.fn(async () => response(bootstrap)), reconnectDelays: [60_000], webSocketFactory: () => socket })
    const subscription = client.subscribe({ onSnapshot: vi.fn(), onPresence: vi.fn(), onCatalog: vi.fn(), onConnection: state => connections.push(state) })
    subscription.start(); await vi.waitFor(() => expect(socket.listeners.has('open')).toBe(true)); socket.emit('open'); socket.message({ type: 'snapshot', snapshot: snapshot() })
    socket.close(1006, 'network lost')
    expect(connections.at(-1)).toBe('disconnected')
    subscription.stop()
  })
})

describe('truthful feedback', () => {
  it('reports rendered only for a connected, matching, settled renderer', () => {
    expect(deriveFeedback(snapshot(), true, 10_000, 10_100)).toMatchObject({ rendered: true, disconnected: false, renderedCue: 'cue-a' })
    expect(deriveFeedback(snapshot({ renderers: [{ id: 'output', revision: 3, cue: 'cue-a', phase: 'settled', seen: 9_500 }] }), true, 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: false })
    expect(deriveFeedback(snapshot({ renderers: [{ id: 'output', revision: 4, cue: 'cue-a', phase: 'transition', seen: 9_500 }] }), true, 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: false })
  })

  it('fails closed on transport close, missing renderer, or stale presence', () => {
    expect(deriveFeedback(snapshot(), false, 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: true })
    expect(deriveFeedback(snapshot({ renderers: [] }), true, 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: true })
    expect(deriveFeedback(snapshot(), true, 10_000, 40_000)).toMatchObject({ rendered: false, disconnected: true })
  })

  it('rejects delayed snapshots that would roll state backward', () => {
    const current = snapshot({ revision: 8, serverTime: 20_000, cue: null })
    expect(isNewerSnapshot(current, snapshot({ revision: 7, serverTime: 21_000 }))).toBe(false)
    expect(isNewerSnapshot(current, snapshot({ revision: 8, serverTime: 19_000 }))).toBe(false)
    expect(isNewerSnapshot(current, snapshot({ revision: 8, serverTime: 20_001 }))).toBe(true)
    expect(isNewerSnapshot(current, snapshot({ revision: 9, serverTime: 19_000 }))).toBe(true)
  })
})
