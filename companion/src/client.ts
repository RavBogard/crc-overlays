import { randomUUID } from 'node:crypto'

export type OverlayAction = 'in' | 'out' | 'clear' | 'cut'
export interface RendererState { id: string; revision: number; cue: string | null; phase: 'settled' | 'transition' | 'error'; seen: number }
export interface OverlaySnapshot { revision: number; cue: string | null; mode: string; updated: number; renderers: RendererState[]; serverTime: number }
export interface CommandReceipt extends OverlaySnapshot { commandId: string }
export interface FeedbackState { requestedCue: string | null; renderedCue: string | null; rendered: boolean; disconnected: boolean }
export interface OverlayClientOptions {
  baseUrl: string; controlKey: string; clientId: string; fetch?: typeof globalThis.fetch; now?: () => number
  sleep?: (milliseconds: number) => Promise<void>; retryDelays?: number[]; requestTimeoutMs?: number
}

const RENDERER_FRESH_MS = 8_000

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
  }

  activate(action: OverlayAction, cue?: string): Promise<CommandReceipt> {
    const sequence = this.#nextSequence()
    const commandId = randomUUID()
    const body = JSON.stringify({ action, ...(cue ? { cue } : {}), commandId, clientId: this.#clientId, sequence })
    return this.#request<CommandReceipt>('/api/command', { method: 'POST', body }, true)
  }

  state(): Promise<OverlaySnapshot> { return this.#request<OverlaySnapshot>('/api/state', { method: 'GET' }, false) }

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
      } finally {
        clearTimeout(timeout)
      }
      await this.#sleep(this.#retryDelays[attempt] ?? 0)
    }
    throw lastError instanceof Error ? lastError : new Error('Overlay API request failed')
  }
}

export function deriveFeedback(snapshot: OverlaySnapshot | null, pollReceivedAt: number | null, now = Date.now(), pollStaleMs = 8_000): FeedbackState {
  if (!snapshot || pollReceivedAt === null || now - pollReceivedAt > pollStaleMs) {
    return { requestedCue: snapshot?.cue ?? null, renderedCue: null, rendered: false, disconnected: true }
  }
  const estimatedServerNow = snapshot.serverTime + Math.max(0, now - pollReceivedAt)
  const fresh = (renderer: RendererState) => estimatedServerNow - renderer.seen <= RENDERER_FRESH_MS
  const renderedMatch = snapshot.renderers.find(renderer => fresh(renderer) && renderer.phase === 'settled' && renderer.revision === snapshot.revision && renderer.cue === snapshot.cue)
  return { requestedCue: snapshot.cue, renderedCue: renderedMatch?.cue ?? null, rendered: Boolean(renderedMatch), disconnected: !snapshot.renderers.some(fresh) }
}

export function isNewerSnapshot(current: OverlaySnapshot | null, candidate: OverlaySnapshot): boolean {
  return current === null || candidate.revision > current.revision || (candidate.revision === current.revision && candidate.serverTime >= current.serverTime)
}
