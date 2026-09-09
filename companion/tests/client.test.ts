import { describe, expect, it, vi } from 'vitest'
import { deriveFeedback, isNewerSnapshot, OverlayClient, type OverlaySnapshot } from '../src/client.js'

const snapshot = (overrides: Partial<OverlaySnapshot> = {}): OverlaySnapshot => ({
  revision: 4, cue: 'cue-a', mode: 'animate', updated: 1_000, serverTime: 10_000,
  renderers: [{ id: 'output', revision: 4, cue: 'cue-a', phase: 'settled', seen: 9_500 }], ...overrides,
})
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('OverlayClient ordering', () => {
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

  it('aborts a hung state request at the configured deadline', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }))
      const client = new OverlayClient({ baseUrl: 'https://example.test', controlKey: 'secret', clientId: 'companion-test', fetch: fetchMock, requestTimeoutMs: 20 })
      const pending = expect(client.state()).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(21)
      await pending
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('truthful feedback', () => {
  it('reports rendered only for a fresh, matching, settled renderer', () => {
    expect(deriveFeedback(snapshot(), 10_000, 10_100)).toMatchObject({ rendered: true, disconnected: false, renderedCue: 'cue-a' })
    expect(deriveFeedback(snapshot({ renderers: [{ id: 'output', revision: 3, cue: 'cue-a', phase: 'settled', seen: 9_500 }] }), 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: false })
    expect(deriveFeedback(snapshot({ renderers: [{ id: 'output', revision: 4, cue: 'cue-a', phase: 'transition', seen: 9_500 }] }), 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: false })
  })

  it('reports disconnected for a stale poll or stale renderer heartbeat', () => {
    expect(deriveFeedback(snapshot(), 1_000, 10_000)).toMatchObject({ rendered: false, disconnected: true })
    expect(deriveFeedback(snapshot({ renderers: [] }), 10_000, 10_100)).toMatchObject({ rendered: false, disconnected: true })
  })

  it('ages a renderer heartbeat while a cached snapshot is held', () => {
    expect(deriveFeedback(snapshot(), 10_000, 17_000)).toMatchObject({ rendered: true, disconnected: false })
    expect(deriveFeedback(snapshot(), 10_000, 17_600)).toMatchObject({ rendered: false, disconnected: true })
  })

  it('rejects delayed snapshots that would roll state backward', () => {
    const current = snapshot({ revision: 8, serverTime: 20_000, cue: null })
    expect(isNewerSnapshot(current, snapshot({ revision: 7, serverTime: 21_000 }))).toBe(false)
    expect(isNewerSnapshot(current, snapshot({ revision: 8, serverTime: 19_000 }))).toBe(false)
    expect(isNewerSnapshot(current, snapshot({ revision: 8, serverTime: 20_001 }))).toBe(true)
    expect(isNewerSnapshot(current, snapshot({ revision: 9, serverTime: 19_000 }))).toBe(true)
  })
})
