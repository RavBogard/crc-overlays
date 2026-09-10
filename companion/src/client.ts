import { randomUUID } from 'node:crypto'

export type OverlayAction = 'in' | 'out' | 'clear' | 'cut'
export interface RendererState { id: string; revision: number; cue: string | null; phase: 'settled' | 'transition' | 'error'; seen: number }
export interface OverlaySnapshot { revision: number; cue: string | null; mode: string; updated: number; cuePayload?: unknown; catalogVersion: string; renderers: RendererState[]; serverTime: number }
export interface CommandReceipt extends OverlaySnapshot { commandId: string }
export interface FeedbackState { requestedCue: string | null; renderedCue: string | null; rendered: boolean; disconnected: boolean }
export interface RealtimeBootstrap { url: string; ticket: string; heartbeatMs: number; staleMs: number; protocol: 1 }
export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected'
export interface RealtimeHandlers {
  onSnapshot(snapshot: OverlaySnapshot): void
  onPresence(renderers: RendererState[], serverTime: number): void
  onCatalog(version: string): void
  onConnection(state: RealtimeConnectionState, detail?: string): void
}

interface RealtimeSocket {
  readonly protocol: string
  readonly readyState: number
  addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: (event: Event | MessageEvent) => void): void
  send(data: string): void
  close(code?: number, reason?: string): void
}
type WebSocketFactory = (url: string, protocols: string[]) => RealtimeSocket

export interface OverlayClientOptions {
  baseUrl: string; controlKey: string; clientId: string; fetch?: typeof globalThis.fetch; now?: () => number
  sleep?: (milliseconds: number) => Promise<void>; retryDelays?: number[]; requestTimeoutMs?: number
  webSocketFactory?: WebSocketFactory; reconnectDelays?: number[]
}

const MAX_REALTIME_MESSAGE_BYTES = 256 * 1024
const HANDSHAKE_TIMEOUT_MS = 10_000
const OPEN = 1

class ApiError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}

export class OverlayClient {
  readonly #baseUrl: string
  readonly #controlKey: string
  readonly #clientId: string
  readonly #fetch: typeof globalThis.fetch
  readonly #now: () => number
  readonly #sleep: (milliseconds: number) => Promise<void>
  readonly #retryDelays: number[]
  readonly #requestTimeoutMs: number
  readonly #webSocketFactory: WebSocketFactory
  readonly #reconnectDelays: number[]
  #lastSequence = 0

  constructor(options: OverlayClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.#controlKey = options.controlKey
    this.#clientId = options.clientId
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#now = options.now ?? Date.now
    this.#sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    this.#retryDelays = options.retryDelays ?? [150, 400]
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 4_000
    this.#webSocketFactory = options.webSocketFactory ?? ((url, protocols) => new WebSocket(url, protocols))
    this.#reconnectDelays = options.reconnectDelays ?? [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
  }

  activate(action: OverlayAction, cue?: string): Promise<CommandReceipt> {
    const sequence = this.#nextSequence()
    const commandId = randomUUID()
    const body = JSON.stringify({ action, ...(cue ? { cue } : {}), commandId, clientId: this.#clientId, sequence })
    return this.#request<CommandReceipt>('/api/command', { method: 'POST', body }, true)
  }

  catalog(): Promise<unknown> { return this.#request<unknown>('/api/catalog', { method: 'GET' }, false) }
  realtimeBootstrap(): Promise<RealtimeBootstrap> { return this.#request<RealtimeBootstrap>('/api/realtime?role=control', { method: 'GET' }, false) }
  subscribe(handlers: RealtimeHandlers): RealtimeSubscription {
    return new RealtimeSubscription({ clientId: randomUUID(), bootstrap: () => this.realtimeBootstrap(), socketFactory: this.#webSocketFactory, now: this.#now, reconnectDelays: this.#reconnectDelays, handlers })
  }

  #nextSequence(): number {
    const clockSequence = this.#now() * 1_000
    this.#lastSequence = Math.max(this.#lastSequence + 1, clockSequence)
    return this.#lastSequence
  }

  async #request<T>(path: string, init: RequestInit, retryable: boolean): Promise<T> {
    const attempts = retryable ? this.#retryDelays.length + 1 : 1
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new ApiError('Overlay API request timed out', true)), this.#requestTimeoutMs)
      try {
        const response = await this.#fetch(`${this.#baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: { Authorization: `Bearer ${this.#controlKey}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        })
        if (!response.ok) {
          const message = await response.text()
          const error = new ApiError(`Overlay API ${response.status}: ${message || response.statusText}`, response.status >= 500)
          if (response.status < 500 || attempt === attempts - 1) throw error
          lastError = error
        } else return (await response.json()) as T
      } catch (error) {
        lastError = error
        if (error instanceof ApiError && !error.retryable) throw error
        if (attempt === attempts - 1) throw error
      } finally { clearTimeout(timeout) }
      await this.#sleep(this.#retryDelays[attempt] ?? 0)
    }
    throw lastError instanceof Error ? lastError : new Error('Overlay API request failed')
  }
}

interface SubscriptionOptions {
  clientId: string
  bootstrap: () => Promise<RealtimeBootstrap>
  socketFactory: WebSocketFactory
  now: () => number
  reconnectDelays: number[]
  handlers: RealtimeHandlers
}

export class RealtimeSubscription {
  readonly #options: SubscriptionOptions
  #socket: RealtimeSocket | null = null
  #heartbeatTimer: NodeJS.Timeout | null = null
  #handshakeTimer: NodeJS.Timeout | null = null
  #reconnectTimer: NodeJS.Timeout | null = null
  #stopped = true
  #generation = 0
  #reconnectAttempt = 0
  #lastFrameAt = 0
  #connected = false

  constructor(options: SubscriptionOptions) { this.#options = options }
  start(): void {
    if (!this.#stopped) return
    this.#stopped = false
    this.#generation += 1
    this.#options.handlers.onConnection('connecting')
    void this.#connect(this.#generation)
  }
  stop(): void {
    if (this.#stopped) return
    this.#stopped = true
    this.#generation += 1
    this.#clearTimers()
    const socket = this.#socket
    this.#socket = null
    if (socket) socket.close(1000, 'Companion stopping')
    this.#setDisconnected()
  }

  async #connect(generation: number): Promise<void> {
    try {
      const bootstrap = validateBootstrap(await this.#options.bootstrap())
      if (this.#stopped || generation !== this.#generation) return
      const socket = this.#options.socketFactory(bootstrap.url, ['crc-overlays-v1', `ticket.${bootstrap.ticket}`])
      this.#socket = socket
      this.#handshakeTimer = setTimeout(() => {
        if (this.#isCurrent(socket, generation)) socket.close(4001, 'Realtime snapshot timeout')
      }, HANDSHAKE_TIMEOUT_MS)
      socket.addEventListener('open', () => {
        if (!this.#isCurrent(socket, generation)) return
        if (socket.protocol !== 'crc-overlays-v1') { socket.close(1002, 'Realtime protocol mismatch'); return }
        this.#lastFrameAt = this.#options.now()
        socket.send(JSON.stringify({ type: 'hello', id: this.#options.clientId }))
        this.#heartbeatTimer = setInterval(() => {
          if (!this.#isCurrent(socket, generation)) return
          if (this.#options.now() - this.#lastFrameAt >= bootstrap.staleMs) { socket.close(4000, 'Realtime connection stale'); return }
          if (socket.readyState === OPEN) socket.send(JSON.stringify({ type: 'heartbeat' }))
        }, bootstrap.heartbeatMs)
      })
      socket.addEventListener('message', event => {
        if (!this.#isCurrent(socket, generation)) return
        const data = (event as MessageEvent).data
        if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > MAX_REALTIME_MESSAGE_BYTES) { socket.close(1009, 'Realtime message invalid'); return }
        let value: unknown
        try { value = JSON.parse(data) } catch { socket.close(1002, 'Realtime JSON invalid'); return }
        const parsed = parseRealtimeEvent(value)
        if (!parsed) { socket.close(1002, 'Realtime event invalid'); return }
        this.#lastFrameAt = this.#options.now()
        if (parsed.type === 'snapshot') {
          if (this.#handshakeTimer) clearTimeout(this.#handshakeTimer)
          this.#handshakeTimer = null
          this.#reconnectAttempt = 0
          this.#connected = true
          this.#options.handlers.onSnapshot(parsed.snapshot)
          this.#options.handlers.onConnection('connected')
        } else if (parsed.type === 'presence') this.#options.handlers.onPresence(parsed.renderers, parsed.serverTime)
        else if (parsed.type === 'catalog') this.#options.handlers.onCatalog(parsed.version)
      })
      socket.addEventListener('error', () => { if (this.#isCurrent(socket, generation)) socket.close(1011, 'Realtime transport error') })
      socket.addEventListener('close', () => {
        if (!this.#isCurrent(socket, generation)) return
        this.#socket = null
        if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer)
        if (this.#handshakeTimer) clearTimeout(this.#handshakeTimer)
        this.#heartbeatTimer = null
        this.#handshakeTimer = null
        this.#setDisconnected()
        this.#scheduleReconnect(generation)
      })
    } catch (error) {
      if (this.#stopped || generation !== this.#generation) return
      this.#setDisconnected(error instanceof Error ? error.message : 'Realtime bootstrap failed')
      this.#scheduleReconnect(generation)
    }
  }

  #scheduleReconnect(generation: number): void {
    if (this.#stopped || generation !== this.#generation || this.#reconnectTimer) return
    const index = Math.min(this.#reconnectAttempt, this.#options.reconnectDelays.length - 1)
    const delay = this.#options.reconnectDelays[index] ?? 30_000
    this.#reconnectAttempt += 1
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      if (this.#stopped || generation !== this.#generation) return
      this.#options.handlers.onConnection('connecting')
      void this.#connect(generation)
    }, delay)
  }
  #isCurrent(socket: RealtimeSocket, generation: number): boolean { return !this.#stopped && generation === this.#generation && socket === this.#socket }
  #setDisconnected(detail?: string): void {
    this.#connected = false
    this.#options.handlers.onConnection('disconnected', detail)
  }
  #clearTimers(): void {
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer)
    if (this.#handshakeTimer) clearTimeout(this.#handshakeTimer)
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer)
    this.#heartbeatTimer = null
    this.#handshakeTimer = null
    this.#reconnectTimer = null
  }
}

export function deriveFeedback(snapshot: OverlaySnapshot | null, transportConnected: boolean, presenceReceivedAt: number | null, now = Date.now(), rendererStaleMs = 30_000): FeedbackState {
  if (!snapshot || !transportConnected || presenceReceivedAt === null || now - presenceReceivedAt >= rendererStaleMs || snapshot.renderers.length === 0) return { requestedCue: snapshot?.cue ?? null, renderedCue: null, rendered: false, disconnected: true }
  const renderedMatch = snapshot.renderers.find(renderer => renderer.phase === 'settled' && renderer.revision === snapshot.revision && renderer.cue === snapshot.cue)
  return { requestedCue: snapshot.cue, renderedCue: renderedMatch?.cue ?? null, rendered: Boolean(renderedMatch), disconnected: false }
}

export function isNewerSnapshot(current: OverlaySnapshot | null, candidate: OverlaySnapshot): boolean {
  return current === null || candidate.revision > current.revision || (candidate.revision === current.revision && candidate.serverTime >= current.serverTime)
}

function validateBootstrap(value: unknown): RealtimeBootstrap {
  if (!isRecord(value) || value.protocol !== 1 || typeof value.url !== 'string' || !validRealtimeUrl(value.url) || typeof value.ticket !== 'string' || !value.ticket || !isPositiveInteger(value.heartbeatMs) || !isPositiveInteger(value.staleMs) || value.staleMs <= value.heartbeatMs) throw new Error('Realtime bootstrap response is invalid')
  return value as unknown as RealtimeBootstrap
}

type ParsedRealtimeEvent = { type: 'snapshot'; snapshot: OverlaySnapshot } | { type: 'presence'; renderers: RendererState[]; serverTime: number } | { type: 'catalog'; version: string } | { type: 'pong'; serverTime: number }

function parseRealtimeEvent(value: unknown): ParsedRealtimeEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'snapshot') { const snapshot = parseSnapshot(value.snapshot); return snapshot ? { type: 'snapshot', snapshot } : null }
  if (value.type === 'presence') { const renderers = parseRenderers(value.renderers); return renderers && isFiniteNumber(value.serverTime) ? { type: 'presence', renderers, serverTime: value.serverTime } : null }
  if (value.type === 'catalog') return typeof value.version === 'string' && value.version.length > 0 && value.version.length <= 200 ? { type: 'catalog', version: value.version } : null
  if (value.type === 'pong') return isFiniteNumber(value.serverTime) ? { type: 'pong', serverTime: value.serverTime } : null
  return null
}

function parseSnapshot(value: unknown): OverlaySnapshot | null {
  if (!isRecord(value) || !isNonnegativeInteger(value.revision) || !(value.cue === null || typeof value.cue === 'string') || typeof value.mode !== 'string' || !isFiniteNumber(value.updated) || typeof value.catalogVersion !== 'string' || !isFiniteNumber(value.serverTime)) return null
  const renderers = parseRenderers(value.renderers)
  if (!renderers) return null
  return { revision: value.revision, cue: value.cue, mode: value.mode, updated: value.updated, ...(Object.hasOwn(value, 'cuePayload') ? { cuePayload: value.cuePayload } : {}), catalogVersion: value.catalogVersion, renderers, serverTime: value.serverTime }
}

function parseRenderers(value: unknown): RendererState[] | null {
  if (!Array.isArray(value)) return null
  const renderers: RendererState[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || !isNonnegativeInteger(item.revision) || !(item.cue === null || typeof item.cue === 'string') || !['settled', 'transition', 'error'].includes(String(item.phase)) || !isFiniteNumber(item.seen)) return null
    renderers.push({ id: item.id, revision: item.revision, cue: item.cue, phase: item.phase as RendererState['phase'], seen: item.seen })
  }
  return renderers
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function validRealtimeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return false
    if (url.protocol === 'wss:') return true
    return url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch { return false }
}
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function isPositiveInteger(value: unknown): value is number { return Number.isInteger(value) && Number(value) > 0 }
function isNonnegativeInteger(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0 }
