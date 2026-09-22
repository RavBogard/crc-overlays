import { InstanceStatus } from '@companion-module/base'
import CrcOverlaysInstance from '../src/main.js'

export const PAIRED_TOKEN = 'cd_abcdefghijkl.mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ'
export const PREVIOUS_TOKEN = 'cd_zyxwvutsrqpo.0123456789abcdefghijklmnopqrstuvwxyzABCDE'
export const CUE = 'efa9fad4-f7d5-4091-a708-82103028861b'

export const bootstrap = { url: 'wss://relay.example.test/connect', ticket: 'one-time-ticket', heartbeatMs: 10_000, staleMs: 30_000, protocol: 1 }

export const snapshotFrame = (overrides: Record<string, unknown> = {}) => ({
  type: 'snapshot',
  snapshot: {
    revision: 4, cue: CUE, mode: 'animate', updated: 1_000, catalogVersion: 'catalog-1', serverTime: 10_000,
    renderers: [{ id: 'output', revision: 4, cue: CUE, phase: 'settled', seen: 9_500 }],
    ...overrides,
  },
})

export class FakeSocket {
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

export interface HarnessAction {
  name: string
  description?: string
  options: Array<Record<string, unknown>>
  callback: (event: { options: Record<string, unknown> }) => Promise<void>
}
export interface HarnessStyle { text?: string; size?: string; color?: number; bgcolor?: number }
export interface HarnessFeedback {
  type: string
  name: string
  options: Array<Record<string, unknown>>
  defaultStyle?: HarnessStyle
  callback: (event: { options: Record<string, unknown> }) => boolean
}
export interface HarnessPreset {
  name?: string
  style?: HarnessStyle
  steps?: Array<{ down: Array<{ actionId: string; options: Record<string, unknown> }>; up: unknown[] }>
  feedbacks?: Array<{ feedbackId: string; options: Record<string, unknown>; style?: HarnessStyle }>
}

export interface Harness {
  instance: CrcOverlaysInstance
  saved: Array<{ config: Record<string, unknown> | undefined; secrets: Record<string, unknown> | undefined }>
  statuses: Array<{ status: InstanceStatus; message: string | null }>
  variables: Array<Record<string, unknown>>
  variableDefinitions: Record<string, { name: string }>
  presets: Record<string, HarnessPreset>
  actions: Record<string, HarnessAction>
  feedbacks: Record<string, HarnessFeedback>
  requests: Array<{ url: string; authorization: string | null; body: unknown }>
  sockets: FakeSocket[]
}

export interface HarnessOptions {
  redeem?: () => Response
  catalog?: () => Response
  command?: (body: Record<string, unknown>) => Response
}

export function harness(options: HarnessOptions = {}): Harness {
  const saved: Harness['saved'] = []
  const statuses: Harness['statuses'] = []
  const variables: Harness['variables'] = []
  const requests: Harness['requests'] = []
  const sockets: FakeSocket[] = []
  let variableDefinitions: Record<string, { name: string }> = {}
  let presets: Record<string, HarnessPreset> = {}
  let actions: Record<string, HarnessAction> = {}
  let feedbacks: Record<string, HarnessFeedback> = {}

  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    requests.push({ url: target, authorization: new Headers(init?.headers).get('Authorization'), body })
    if (target.endsWith('/api/pairing/redeem')) return options.redeem?.() ?? new Response(JSON.stringify({ token: PAIRED_TOKEN, name: 'Sanctuary PC', kind: 'companion' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (target.includes('/api/realtime')) return new Response(JSON.stringify(bootstrap), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (target.endsWith('/api/command')) return options.command?.(body ?? {}) ?? new Response(JSON.stringify({ commandId: String(body?.commandId ?? ''), ...snapshotFrame().snapshot }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return options.catalog?.() ?? new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CRC-Catalog-Version': 'catalog-1' } })
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
    setActionDefinitions: (value: Record<string, HarnessAction>) => { actions = value },
    subscribeActions: () => undefined,
    unsubscribeActions: () => undefined,
    setFeedbackDefinitions: (value: Record<string, HarnessFeedback>) => { feedbacks = value },
    unsubscribeFeedbacks: () => undefined,
    checkFeedbacks: () => undefined,
    checkAllFeedbacks: () => undefined,
    checkFeedbacksById: () => undefined,
    setPresetDefinitions: (_structure: unknown, value: Record<string, HarnessPreset>) => { presets = value },
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
    get actions() { return actions },
    get feedbacks() { return feedbacks },
  } as Harness
}

export const config = (pairingCode = '') => ({ baseUrl: 'https://example.test', pairingCode })
export const secrets = (overrides: { controlKey?: string; deviceToken?: string } = {}) => ({ controlKey: '', deviceToken: '', ...overrides })

const live: CrcOverlaysInstance[] = []
export const start = (h: Harness): Harness => { live.push(h.instance); return h }
export const destroyAll = async (): Promise<void> => { while (live.length) await live.pop()?.destroy() }
