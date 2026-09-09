import { combineRgb, InstanceBase, InstanceStatus, type CompanionActionDefinitions, type CompanionFeedbackDefinitions, type CompanionPresetDefinitions, type CompanionPresetSection, type InstanceTypes, type SomeCompanionConfigField } from '@companion-module/base'
import { CatalogStore, cuePresetId, hasCatalogCue, visibleCatalogCues, type CatalogCue } from './catalog.js'
import { deriveFeedback, isNewerSnapshot, OverlayClient, type OverlaySnapshot } from './client.js'

const FALLBACK_CUES: CatalogCue[] = [
  { id: 'efa9fad4-f7d5-4091-a708-82103028861b', name: 'Barechu', layout: 'bottom' },
  { id: 'eac2dee3-17f3-4a52-9ca5-4d7611f0f9dc', name: 'Modeh Ani (Bottom)', layout: 'bottom' },
  { id: 'bbd7c98b-f1de-41ee-9719-2bb27a30d0db', name: 'Mah Tovu', layout: 'left' },
]

interface Config { baseUrl: string; pollInterval: number; [key: string]: string | number }
interface Secrets { controlKey: string; [key: string]: string }
interface Manifest extends InstanceTypes {
  config: Config; secrets: Secrets
  actions: {
    show_cue: { options: { cue: string } }
    animate_out: { options: { cue: string } }
    animate_clear: { options: Record<string, never> }
    clear_now: { options: Record<string, never> }
    refresh_catalog: { options: Record<string, never> }
  }
  feedbacks: {
    requested: { type: 'boolean'; options: { cue: string } }
    rendered: { type: 'boolean'; options: { cue: string } }
    disconnected: { type: 'boolean'; options: Record<string, never> }
  }
  variables: { requested_cue: string; revision: number; renderer_status: string }
}

export default class CrcOverlaysInstance extends InstanceBase<Manifest> {
  #config: Config = { baseUrl: 'https://crc-overlays.vercel.app', pollInterval: 1_000 }
  #controlKey = ''
  #client: OverlayClient | null = null
  #snapshot: OverlaySnapshot | null = null
  #pollReceivedAt: number | null = null
  #pollTimer: NodeJS.Timeout | null = null
  #pollInFlight: { generation: number } | null = null
  #generation = 0
  #destroyed = false
  #catalog = new CatalogStore(FALLBACK_CUES)

  async init(config: Config, _isFirstInit: boolean, secrets: Secrets): Promise<void> {
    this.#destroyed = false
    this.setVariableDefinitions({
      requested_cue: { name: 'Requested cue' },
      revision: { name: 'Requested revision' },
      renderer_status: { name: 'Renderer status' },
    })
    this.#defineActions(); this.#defineFeedbacks(); this.#definePresets()
    await this.#applyConfig(config, secrets)
  }
  async destroy(): Promise<void> { this.#destroyed = true; this.#generation += 1; this.#client = null; this.#stopPolling() }
  async configUpdated(config: Config, secrets: Secrets): Promise<void> { await this.#applyConfig(config, secrets) }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      { type: 'textinput', id: 'baseUrl', label: 'Overlay base URL', width: 12, default: 'https://crc-overlays.vercel.app', regex: '^https?://.+' },
      { type: 'secret-text', id: 'controlKey', label: 'Control key', width: 12 },
      { type: 'number', id: 'pollInterval', label: 'Feedback polling interval (ms)', width: 6, default: 1_000, min: 500, max: 5_000, step: 100 },
      { type: 'static-text', id: 'meaning', label: 'Feedback meaning', width: 12, value: '<strong>Rendered</strong> means a fresh graphics browser reports the requested revision settled. It is not a broadcast on-air/tally signal.' },
    ]
  }

  async #applyConfig(config: Config, secrets: Secrets): Promise<void> {
    const generation = ++this.#generation
    this.#stopPolling()
    this.#config = { baseUrl: String(config.baseUrl || 'https://crc-overlays.vercel.app').replace(/\/+$/, ''), pollInterval: Math.min(5_000, Math.max(500, Number(config.pollInterval) || 1_000)) }
    this.#controlKey = String(secrets.controlKey || '')
    this.#snapshot = null; this.#pollReceivedAt = null
    if (!this.#controlKey) {
      this.#client = null; this.updateStatus(InstanceStatus.BadConfig, 'Control key required'); this.#publishFeedback(); return
    }
    const client = new OverlayClient({ baseUrl: this.#config.baseUrl, controlKey: this.#controlKey, clientId: `companion-${this.id}` })
    this.#client = client
    this.updateStatus(InstanceStatus.Connecting)
    await this.#refreshCatalog(generation, client, false)
    if (generation !== this.#generation || this.#destroyed) return
    await this.#poll(generation, client)
    if (generation !== this.#generation || this.#destroyed) return
    this.#pollTimer = setInterval(() => void this.#poll(), this.#config.pollInterval)
  }
  #stopPolling(): void { if (this.#pollTimer) clearInterval(this.#pollTimer); this.#pollTimer = null }

  async #poll(generation = this.#generation, client = this.#client): Promise<void> {
    if (!client || generation !== this.#generation || this.#destroyed) return
    if (this.#pollInFlight?.generation === generation) { this.#publishFeedback(); return }
    const token = { generation }
    this.#pollInFlight = token
    try {
      const snapshot = await client.state()
      if (generation !== this.#generation || this.#destroyed) return
      this.#acceptSnapshot(snapshot)
      this.updateStatus(InstanceStatus.Ok)
    } catch (error) {
      if (generation !== this.#generation || this.#destroyed) return
      this.#pollReceivedAt = null; this.updateStatus(InstanceStatus.ConnectionFailure, this.#safeError(error))
    } finally {
      if (this.#pollInFlight === token) this.#pollInFlight = null
      if (generation === this.#generation && !this.#destroyed) this.#publishFeedback()
    }
  }
  async #command(action: 'in' | 'out' | 'clear' | 'cut', cue?: string): Promise<void> {
    const client = this.#client
    const generation = this.#generation
    if (!client || this.#destroyed) return
    try {
      const snapshot = await client.activate(action, cue)
      if (generation !== this.#generation || this.#destroyed) return
      this.#acceptSnapshot(snapshot)
      this.updateStatus(InstanceStatus.Ok)
    } catch (error) {
      if (generation !== this.#generation || this.#destroyed) return
      this.#pollReceivedAt = null; this.updateStatus(InstanceStatus.ConnectionFailure, this.#safeError(error))
    }
    if (generation === this.#generation && !this.#destroyed) this.#publishFeedback()
  }
  #acceptSnapshot(snapshot: OverlaySnapshot): void {
    if (!isNewerSnapshot(this.#snapshot, snapshot)) return
    this.#snapshot = snapshot
    this.#pollReceivedAt = Date.now()
  }
  async #refreshCatalog(generation = this.#generation, client = this.#client, operatorRequested = true): Promise<void> {
    if (!client || generation !== this.#generation || this.#destroyed) return
    let value: unknown
    try { value = await client.catalog() }
    catch {
      if (generation !== this.#generation || this.#destroyed) return
      this.log('warn', 'Catalog refresh failed; retaining the last validated catalog.')
      if (operatorRequested) this.updateStatus(InstanceStatus.UnknownWarning, 'Catalog unavailable; retained previous cue list')
      return
    }
    if (generation !== this.#generation || this.#destroyed) return
    if (!this.#catalog.replace(value)) {
      this.log('warn', 'Catalog validation failed; retaining the last validated catalog.')
      if (operatorRequested) this.updateStatus(InstanceStatus.UnknownWarning, 'Catalog invalid; retained previous cue list')
      return
    }
    this.#defineActions(); this.#defineFeedbacks(); this.#definePresets()
    if (operatorRequested) this.updateStatus(InstanceStatus.Ok, `Catalog refreshed: ${this.#catalog.cues.length} cues`)
  }
  async #cueCommand(action: 'in' | 'out', cue: string): Promise<void> {
    if (!hasCatalogCue(this.#catalog.cues, cue)) {
      this.updateStatus(InstanceStatus.UnknownWarning, 'Cue is not in the current catalog; refresh before using it')
      return
    }
    await this.#command(action, cue)
  }
  #safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Overlay API request failed'
    return this.#controlKey ? message.replaceAll(this.#controlKey, '[redacted]') : message
  }
  #publishFeedback(): void {
    const state = deriveFeedback(this.#snapshot, this.#pollReceivedAt)
    const requestedName = this.#catalog.cues.find(cue => cue.id === state.requestedCue)?.name ?? state.requestedCue ?? 'Clear'
    this.setVariableValues({ requested_cue: requestedName, revision: this.#snapshot?.revision ?? 0, renderer_status: state.disconnected ? 'Disconnected' : state.rendered ? 'Rendered' : 'Requested' })
    this.checkAllFeedbacks()
  }

  #defineActions(): void {
    const choices = visibleCatalogCues(this.#catalog.cues).map(cue => ({ id: cue.id, label: cue.name }))
    const defaultCue = choices[0]?.id ?? FALLBACK_CUES[0]!.id
    const actions: CompanionActionDefinitions<Manifest['actions']> = {
      show_cue: { name: 'Show cue', description: 'Request a cue with its In animation.', options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices, default: defaultCue }], callback: async event => this.#cueCommand('in', String(event.options.cue)) },
      animate_out: { name: 'Animate cue out', description: 'Clear only if the selected cue is currently requested.', options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices, default: defaultCue }], callback: async event => this.#cueCommand('out', String(event.options.cue)) },
      animate_clear: { name: 'Animate out', description: 'Animate the currently requested graphic out, regardless of which cue it is.', options: [], callback: async () => this.#command('clear') },
      clear_now: { name: 'Clear now', description: 'Immediately cancel animation and clear the graphics output.', options: [], callback: async () => this.#command('cut') },
      refresh_catalog: { name: 'Refresh cue catalog', description: 'Fetch and validate the authenticated cue catalog, retaining the prior list on failure.', options: [], callback: async () => this.#refreshCatalog() },
    }
    this.setActionDefinitions(actions)
  }
  #defineFeedbacks(): void {
    const targets = [{ id: '', label: 'Clear' }, ...this.#catalog.cues.map(cue => ({ id: cue.id, label: cue.name }))]
    const defaultCue = this.#catalog.cues[0]?.id ?? FALLBACK_CUES[0]!.id
    const feedbacks: CompanionFeedbackDefinitions<Manifest['feedbacks']> = {
      requested: { type: 'boolean', name: 'Cue requested', description: 'The API accepted this desired state; it does not prove rendering.', defaultStyle: { bgcolor: combineRgb(180, 110, 0), color: combineRgb(255, 255, 255) }, options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices: targets, default: defaultCue }], callback: event => String(event.options.cue || '') === (this.#snapshot?.cue ?? '') },
      rendered: { type: 'boolean', name: 'Cue rendered', description: 'A fresh graphics browser reports this exact requested revision settled. Not an on-air/tally signal.', defaultStyle: { bgcolor: combineRgb(0, 130, 70), color: combineRgb(255, 255, 255) }, options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices: targets, default: defaultCue }], callback: event => { const state = deriveFeedback(this.#snapshot, this.#pollReceivedAt); return state.rendered && String(event.options.cue || '') === (this.#snapshot?.cue ?? '') } },
      disconnected: { type: 'boolean', name: 'API or renderer disconnected', description: 'The state poll is stale/unavailable or no graphics browser heartbeat is fresh.', defaultStyle: { bgcolor: combineRgb(175, 0, 0), color: combineRgb(255, 255, 255) }, options: [], callback: () => deriveFeedback(this.#snapshot, this.#pollReceivedAt).disconnected },
    }
    this.setFeedbackDefinitions(feedbacks)
  }
  #definePresets(): void {
    const presets: CompanionPresetDefinitions<Manifest> = {}
    for (const cue of visibleCatalogCues(this.#catalog.cues)) presets[cuePresetId(cue.id)] = {
      type: 'simple', name: `Show ${cue.name}`, style: { text: cue.name, size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(35, 35, 35) },
      steps: [{ down: [{ actionId: 'show_cue', options: { cue: cue.id } }], up: [] }],
      feedbacks: [
        { feedbackId: 'requested', options: { cue: cue.id }, style: { bgcolor: combineRgb(180, 110, 0) } },
        { feedbackId: 'rendered', options: { cue: cue.id }, style: { bgcolor: combineRgb(0, 130, 70) } },
        { feedbackId: 'disconnected', options: {}, style: { bgcolor: combineRgb(175, 0, 0) } },
      ],
    }
    presets.animate_out = { type: 'simple', name: 'Animate out', style: { text: 'Animate\nOut', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(65, 65, 65) }, steps: [{ down: [{ actionId: 'animate_clear', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'rendered', options: { cue: '' }, style: { bgcolor: combineRgb(0, 130, 70) } }, { feedbackId: 'disconnected', options: {}, style: { bgcolor: combineRgb(175, 0, 0) } }] }
    presets.clear_now = { type: 'simple', name: 'Clear now', style: { text: 'CLEAR\nNOW', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(120, 0, 0) }, steps: [{ down: [{ actionId: 'clear_now', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'rendered', options: { cue: '' }, style: { bgcolor: combineRgb(0, 130, 70) } }, { feedbackId: 'disconnected', options: {}, style: { bgcolor: combineRgb(175, 0, 0) } }] }
    const structure: CompanionPresetSection<Manifest>[] = [{ id: 'crc_overlay_controls', name: 'CRC Overlay Controls', definitions: Object.keys(presets) }]
    this.setPresetDefinitions(structure, presets)
  }
}
