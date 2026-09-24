import { randomUUID } from 'node:crypto'

export type OverlayAction = 'in' | 'out' | 'clear' | 'cut' | 'bug' | 'logo'
/** The second live-state field: the scan card, and the optional short page beside it. */
export interface BugState { on: boolean; page: string | null }
/**
 * The third live-state field: whether the operator wants the resting corner logo. A separate
 * feature from the scan card above, with no page and no address of its own — and a preference,
 * not a picture. The site hides the mark under any graphic without touching this field, so a
 * button that paints `logo.on` as "showing" would be lying whenever a prayer is up. See
 * `logoStatusLabel`.
 */
export interface LogoState { on: boolean }
export interface RendererState { id: string; revision: number; cue: string | null; phase: 'settled' | 'transition' | 'error'; seen: number }
export interface OverlaySnapshot { revision: number; cue: string | null; mode: string; updated: number; cuePayload?: unknown; catalogVersion: string; renderers: RendererState[]; serverTime: number; bug?: BugState; logo?: LogoState }
export interface CommandReceipt extends OverlaySnapshot { commandId: string }
/**
 * When each controller class last pressed, as the live service records it (MCP plan V1): 'control'
 * is the console, 'companion' a paired deck, 'mcp' an AI agent. Served on the HTTP command answer
 * and GET /api/state only, never in a realtime frame; a service that predates it sends none.
 */
export interface LastPress { control: number | null; companion: number | null; mcp: number | null }
export type LastSource = 'control' | 'companion' | 'mcp'
export interface FeedbackState { requestedCue: string | null; renderedCue: string | null; rendered: boolean; disconnected: boolean }
export interface RealtimeBootstrap { url: string; ticket: string; heartbeatMs: number; staleMs: number; protocol: 1 }
export interface VersionedCatalog<T = unknown> { cues: T; version: string; slots?: unknown; roles?: unknown }
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
export type WebSocketFactory = (url: string, protocols: string[]) => RealtimeSocket

export interface OverlayClientOptions {
  baseUrl: string; credential: string; clientId: string; fetch?: typeof globalThis.fetch; now?: () => number
  sleep?: (milliseconds: number) => Promise<void>; retryDelays?: number[]; requestTimeoutMs?: number
  webSocketFactory?: WebSocketFactory; reconnectDelays?: number[]
  client?: string; version?: string | null
}

const MAX_REALTIME_MESSAGE_BYTES = 256 * 1024
const HANDSHAKE_TIMEOUT_MS = 10_000
const OPEN = 1

class ApiError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}

export class OverlayClient {
  readonly #baseUrl: string
  readonly #credential: string
  readonly #clientId: string
  readonly #fetch: typeof globalThis.fetch
  readonly #now: () => number
  readonly #sleep: (milliseconds: number) => Promise<void>
  readonly #retryDelays: number[]
  readonly #requestTimeoutMs: number
  readonly #webSocketFactory: WebSocketFactory
  readonly #reconnectDelays: number[]
  readonly #client: string
  readonly #version: string | null
  #lastSequence = 0

  constructor(options: OverlayClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.#credential = options.credential
    this.#clientId = options.clientId
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#now = options.now ?? Date.now
    this.#sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    this.#retryDelays = options.retryDelays ?? [150, 400]
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 4_000
    this.#webSocketFactory = options.webSocketFactory ?? ((url, protocols) => new WebSocket(url, protocols))
    this.#reconnectDelays = options.reconnectDelays ?? [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
    this.#client = options.client ?? 'companion'
    this.#version = options.version ?? null
  }

  // `bug` is sent only for `action:'bug'` and `logo` only for `action:'logo'`, and both of
  // those actions always carry an explicit `cue:null`, so the body matches the relay's command
  // shape exactly. The two fields never travel together: the relay refuses a command that
  // carries the wrong one, which is what keeps the scan card and the resting logo separate.
  activate(action: OverlayAction, cue?: string, bug?: BugState, logo?: LogoState): Promise<CommandReceipt> {
    const sequence = this.#nextSequence()
    const commandId = randomUUID()
    const target = action === 'bug' ? { cue: null, bug: bug ?? { on: false, page: null } } : action === 'logo' ? { cue: null, logo: logo ?? { on: false } } : cue ? { cue } : {}
    const body = JSON.stringify({ action, ...target, commandId, clientId: this.#clientId, sequence })
    return this.#request<CommandReceipt>('/api/command', { method: 'POST', body }, true)
  }

  catalog(): Promise<unknown> { return this.catalogWithVersion().then(result => result.cues) }
  // `?include=slots` asks for the envelope. A deployment that does not carry the change
  // ignores the query string and answers the bare array it always has, so both shapes are
  // read here: a module that hard-failed against an older server would be a bad afternoon
  // in the booth.
  catalogWithVersion(): Promise<VersionedCatalog> {
    return this.#request<VersionedCatalog>('/api/catalog?include=slots', { method: 'GET' }, false, async response => {
      const version = response.headers.get('X-CRC-Catalog-Version')
      if (!version || version.length > 200) throw new ApiError('Overlay catalog version header is invalid', false)
      return { ...parseCatalogBody(await response.json() as unknown), version }
    })
  }
  // Read only for `lastPress`: the realtime snapshot says what changed, never who changed it, so the
  // module asks the same state endpoint the output uses. A server without the field answers null.
  lastPress(): Promise<LastPress | null> {
    return this.#request<LastPress | null>('/api/state', { method: 'GET' }, false, async response => parseLastPress(await response.json() as unknown))
  }
  realtimeBootstrap(): Promise<RealtimeBootstrap> { return this.#request<RealtimeBootstrap>('/api/realtime?role=control', { method: 'GET' }, false) }
  subscribe(handlers: RealtimeHandlers): RealtimeSubscription {
    return new RealtimeSubscription({ clientId: randomUUID(), bootstrap: () => this.realtimeBootstrap(), socketFactory: this.#webSocketFactory, now: this.#now, reconnectDelays: this.#reconnectDelays, client: this.#client, version: this.#version, handlers })
  }

  #nextSequence(): number {
    const clockSequence = this.#now() * 1_000
    this.#lastSequence = Math.max(this.#lastSequence + 1, clockSequence)
    return this.#lastSequence
  }

  async #request<T>(path: string, init: RequestInit, retryable: boolean, read: (response: Response) => Promise<T> = async response => await response.json() as T): Promise<T> {
    const attempts = retryable ? this.#retryDelays.length + 1 : 1
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new ApiError('Overlay API request timed out', true)), this.#requestTimeoutMs)
      try {
        const response = await this.#fetch(`${this.#baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: { Authorization: `Bearer ${this.#credential}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        })
        if (!response.ok) {
          const message = await response.text()
          const error = new ApiError(`Overlay API ${response.status}: ${message || response.statusText}`, response.status >= 500)
          if (response.status < 500 || attempt === attempts - 1) throw error
          lastError = error
        } else return await read(response)
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

export class CatalogRefreshCoordinator<T = unknown> {
  readonly #load: () => Promise<VersionedCatalog<T>>
  readonly #apply: (catalog: VersionedCatalog<T>) => void | Promise<void>
  #active: Promise<void> | null = null
  #requestSerial = 0
  #requestedVersion = ''

  constructor(load: () => Promise<VersionedCatalog<T>>, apply: (catalog: VersionedCatalog<T>) => void | Promise<void>) {
    this.#load = load
    this.#apply = apply
  }

  request(version = ''): Promise<void> {
    this.#requestSerial += 1
    if (version) this.#requestedVersion = version
    if (this.#active) return this.#active
    const active = this.#run()
    this.#active = active
    const clear = () => { if (this.#active === active) this.#active = null }
    void active.then(clear, clear)
    return active
  }

  async #run(): Promise<void> {
    while (true) {
      const requestSerial = this.#requestSerial
      const catalog = await this.#load()
      await this.#apply(catalog)
      if (this.#requestSerial === requestSerial || this.#requestedVersion === catalog.version) return
    }
  }
}

interface SubscriptionOptions {
  clientId: string
  bootstrap: () => Promise<RealtimeBootstrap>
  socketFactory: WebSocketFactory
  now: () => number
  reconnectDelays: number[]
  client: string
  version: string | null
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
        socket.send(JSON.stringify({ type: 'hello', id: this.#options.clientId, client: this.#options.client, version: this.#options.version }))
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
      socket.addEventListener('close', event => {
        if (!this.#isCurrent(socket, generation)) return
        this.#socket = null
        if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer)
        if (this.#handshakeTimer) clearTimeout(this.#handshakeTimer)
        this.#heartbeatTimer = null
        this.#handshakeTimer = null
        this.#setDisconnected(closeDetail(event))
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

/**
 * Either shape the catalog endpoint may answer with: the bare `Cue[]` every deployment has
 * always returned, or the `{version, cues, slots}` envelope `?include=slots` adds (with `roles`
 * from a web that carries R-C5). Anything else is left for the catalog validator to refuse.
 */
export function parseCatalogBody(body: unknown): { cues: unknown; slots?: unknown; roles?: unknown } {
  if (Array.isArray(body)) return { cues: body }
  if (isRecord(body) && Array.isArray(body.cues)) return { cues: body.cues, slots: body.slots, ...(body.roles !== undefined ? { roles: body.roles } : {}) }
  return { cues: body }
}

export function toggleAction(requestedCue: string | null, cue: string): 'in' | 'out' {
  return requestedCue === cue ? 'out' : 'in'
}

function closeDetail(event: Event): string | undefined {
  const close = event as CloseEvent
  const code = typeof close.code === 'number' ? close.code : null
  if (code === null) return undefined
  const reason = typeof close.reason === 'string' ? close.reason.slice(0, 200) : ''
  return `Realtime closed (${code}${reason ? ' ' + reason : ''})`
}

export function deriveFeedback(snapshot: OverlaySnapshot | null, transportConnected: boolean, presenceReceivedAt: number | null, now = Date.now(), rendererStaleMs = 30_000, unhealthySince: number | null = null, graceMs = 0): FeedbackState {
  const raw = !snapshot || !transportConnected || presenceReceivedAt === null || now - presenceReceivedAt >= rendererStaleMs || snapshot.renderers.length === 0
  // A grace window only delays the red indicator: with graceMs 0 (the default) the
  // raw condition is reported immediately, exactly as before.
  if (raw) return { requestedCue: snapshot?.cue ?? null, renderedCue: null, rendered: false, disconnected: graceMs <= 0 || (unhealthySince !== null && now - unhealthySince >= graceMs) }
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

export function parseSnapshot(value: unknown): OverlaySnapshot | null {
  if (!isRecord(value) || !isNonnegativeInteger(value.revision) || !(value.cue === null || typeof value.cue === 'string') || typeof value.mode !== 'string' || !isFiniteNumber(value.updated) || typeof value.catalogVersion !== 'string' || !isFiniteNumber(value.serverTime)) return null
  const renderers = parseRenderers(value.renderers)
  if (!renderers) return null
  // A malformed bug is read as no bug. The card is an added layer, never a reason
  // to drop a snapshot that otherwise describes the graphic on screen correctly.
  const bug = Object.hasOwn(value, 'bug') ? parseBug(value.bug) : null
  // Same posture for the resting logo, and for the same reason: an added layer is never a
  // reason to drop an otherwise correct snapshot. An absent field reads as off, which is also
  // what a server that predates the feature answers.
  const logo = Object.hasOwn(value, 'logo') ? parseLogo(value.logo) : null
  return { revision: value.revision, cue: value.cue, mode: value.mode, updated: value.updated, ...(Object.hasOwn(value, 'cuePayload') ? { cuePayload: value.cuePayload } : {}), catalogVersion: value.catalogVersion, renderers, serverTime: value.serverTime, ...(bug ? { bug } : {}), ...(logo ? { logo } : {}) }
}

// The same bounded page the relay accepts: an empty value, or at most twelve
// characters of letters, digits, spaces and light punctuation.
const BUG_PAGE = /^$|^[A-Za-z0-9 .,\-–]{1,12}$/
export function validBugPage(value: unknown): value is string { return typeof value === 'string' && BUG_PAGE.test(value) }

function parseBug(value: unknown): BugState | null {
  if (!isRecord(value) || typeof value.on !== 'boolean') return null
  if (value.page !== null && !validBugPage(value.page)) return null
  return { on: value.on, page: value.page as string | null }
}

function parseLogo(value: unknown): LogoState | null {
  if (!isRecord(value) || typeof value.on !== 'boolean') return null
  return { on: value.on }
}

/**
 * How a deck may describe the resting logo in one line, from the same live state the button
 * writes. `Off` and `On` are the preference; `On (held)` says something else is requested and
 * the site is keeping the mark out of the way. None of the three is a report from a graphics
 * browser, so none of them may be shown as rendered truth — that is what the `rendered`
 * feedback is for, and it only ever answers about a cue.
 */
export function logoStatusLabel(snapshot: OverlaySnapshot | null | undefined): 'Off' | 'On' | 'On (held)' {
  if (snapshot?.logo?.on !== true) return 'Off'
  return snapshot.cue !== null || snapshot.bug?.on === true ? 'On (held)' : 'On'
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

/** `lastPress` from any answer body, read defensively: anything malformed is no report at all. */
export function parseLastPress(value: unknown): LastPress | null {
  const body = isRecord(value) && isRecord(value.lastPress) ? value.lastPress : null
  if (!body) return null
  const time = (item: unknown) => isNonnegativeInteger(item) && Number.isSafeInteger(item) ? item : null
  return { control: time(body.control), companion: time(body.companion), mcp: time(body.mcp) }
}

/** The class that pressed most recently, or null when nothing has been recorded. */
export function lastSource(press: LastPress | null): LastSource | null {
  if (!press) return null
  let newest: LastSource | null = null
  for (const source of ['control', 'companion', 'mcp'] as const) {
    const at = press[source]
    if (at !== null && (newest === null || at > (press[newest] as number))) newest = source
  }
  return newest
}
