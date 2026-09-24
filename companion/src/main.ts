import { combineRgb, InstanceBase, InstanceStatus, type CompanionActionDefinitions, type CompanionFeedbackDefinitions, type CompanionPresetDefinitions, type CompanionPresetSection, type InstanceTypes, type SomeCompanionConfigField } from '@companion-module/base'
import { CatalogStore, categoryColour, cuePresetId, hasCatalogCue, slotCatalogCues, slotPresetId, slotVariableValue, visibleCatalogCues, type CatalogCue } from './catalog.js'
import { CatalogRefreshCoordinator, deriveFeedback, isNewerSnapshot, logoStatusLabel, OverlayClient, toggleAction, validBugPage, type BugState, type FeedbackState, type LogoState, type OverlaySnapshot, type RealtimeSubscription, type RendererState, type WebSocketFactory } from './client.js'
import { DEFAULT_BASE_URL, PRESET_SECTION_CONTROLS } from './brand.js'
import { redeemPairingCode } from './pairing.js'
import { panelSets, panelTarget } from './panel.js'
import { connectionLabel, overlayVariables } from './variables.js'
import { moduleVersion } from './version.js'

// The red disconnected indicator waits this long before painting, so a socket that
// drops and reconnects inside the first reconnect delay does not flash the buttons red.
const DISCONNECTED_GRACE_MS = 3_000
const RENDERER_STALE_MS = 30_000
const PAGE_TOOLTIP = 'A page number or short label shown beside the scan card. Clear now removes it.'
// Michael has operated for years with one rule in his hands: red means it is up. That red
// used to come from Companion's own step feedback, which only knew he had pressed the
// button. `rendered` knows the picture actually settled, so it takes the same red.
const RENDERED_RED = combineRgb(255, 0, 0)
const CLEAR_CONFIRMED_GREEN = combineRgb(0, 130, 70)
const CHARCOAL = combineRgb(35, 35, 35)
const SLOT_EMPTY_BG = combineRgb(50, 50, 50)
const SLOT_EMPTY_TEXT = combineRgb(140, 140, 140)

const FALLBACK_CUES: CatalogCue[] = [
  { id: 'efa9fad4-f7d5-4091-a708-82103028861b', name: 'Barechu', layout: 'bottom' },
  { id: 'eac2dee3-17f3-4a52-9ca5-4d7611f0f9dc', name: 'Modeh Ani (Bottom)', layout: 'bottom' },
  { id: 'bbd7c98b-f1de-41ee-9719-2bb27a30d0db', name: 'Mah Tovu', layout: 'left' },
]

interface Config { baseUrl: string; pairingCode: string; [key: string]: string | number }
interface Secrets { controlKey: string; deviceToken: string; [key: string]: string }

// Injected only by the tests; Companion constructs the class with the context alone.
export interface OverlayDependencies { fetch?: typeof globalThis.fetch; webSocketFactory?: WebSocketFactory }
interface Manifest extends InstanceTypes {
  config: Config; secrets: Secrets
  actions: {
    show_cue: { options: { cue: string } }
    toggle_cue: { options: { cue: string } }
    animate_out: { options: { cue: string } }
    animate_clear: { options: Record<string, never> }
    clear_now: { options: Record<string, never> }
    refresh_catalog: { options: Record<string, never> }
    bug_on: { options: Record<string, never> }
    bug_off: { options: Record<string, never> }
    logo_on: { options: Record<string, never> }
    logo_off: { options: Record<string, never> }
    logo_toggle: { options: Record<string, never> }
    set_page: { options: { page: string } }
    next_panel: { options: { set: string } }
    previous_panel: { options: { set: string } }
  }
  feedbacks: {
    requested: { type: 'boolean'; options: { cue: string } }
    rendered: { type: 'boolean'; options: { cue: string } }
    disconnected: { type: 'boolean'; options: Record<string, never> }
    bug_visible: { type: 'boolean'; options: Record<string, never> }
    logo_enabled: { type: 'boolean'; options: Record<string, never> }
    logo_held: { type: 'boolean'; options: Record<string, never> }
    slot_empty: { type: 'boolean'; options: { cue: string } }
  }
  variables: {
    requested_cue: string; requested_cue_id: string; revision: number; renderer_status: string
    current_name: string; current_panel: string; panel_count: string; connection: string; requested_name: string
    bug: string; bug_page: string
    logo: string; logo_state: string
    // One `slot_<key>` per slot in the catalog, declared dynamically by #defineVariables.
    [key: string]: string | number
  }
}

export default class CrcOverlaysInstance extends InstanceBase<Manifest> {
  #config: Config = { baseUrl: DEFAULT_BASE_URL, pairingCode: '' }
  #credential = ''
  #controlKey = ''
  #deviceToken = ''
  readonly #fetch: typeof globalThis.fetch | undefined
  readonly #webSocketFactory: WebSocketFactory | undefined
  #client: OverlayClient | null = null
  #snapshot: OverlaySnapshot | null = null
  #transportConnected = false
  #presenceReceivedAt: number | null = null
  #presenceTimer: NodeJS.Timeout | null = null
  #subscription: RealtimeSubscription | null = null
  #catalogRefresh: CatalogRefreshCoordinator | null = null
  #catalogVersion = ''
  #generation = 0
  #destroyed = false
  #unhealthySince: number | null = null
  #graceTimer: NodeJS.Timeout | null = null
  #catalog = new CatalogStore(FALLBACK_CUES)

  constructor(internal: unknown, dependencies: OverlayDependencies = {}) {
    super(internal)
    this.#fetch = dependencies.fetch
    this.#webSocketFactory = dependencies.webSocketFactory
  }

  async init(config: Config, _isFirstInit: boolean, secrets: Secrets): Promise<void> {
    this.#destroyed = false
    this.#defineVariables(); this.#defineActions(); this.#defineFeedbacks(); this.#definePresets()
    await this.#applyConfig(config, secrets)
  }
  async destroy(): Promise<void> { this.#destroyed = true; this.#generation += 1; this.#client = null; this.#stopRealtime() }
  // A pairing code is redeemed once, here, and then blanked: the durable device
  // token it returns is what every later request carries. A refusal writes
  // nothing at all, so the previous credential keeps working.
  async configUpdated(config: Config, secrets: Secrets): Promise<void> {
    const baseUrl = this.#baseUrl(config)
    const result = await redeemPairingCode({ baseUrl, code: config?.pairingCode, fetch: this.#fetch })
    if (result.outcome === 'paired') {
      const nextConfig: Config = { ...config, baseUrl, pairingCode: '' }
      const nextSecrets: Secrets = { ...secrets, deviceToken: result.token }
      this.saveConfig(nextConfig, nextSecrets)
      this.log('info', result.name ? `Paired this connection: ${result.name}` : 'Paired this connection')
      await this.#applyConfig(nextConfig, nextSecrets)
      return
    }
    if (result.outcome === 'refused') {
      this.log('warn', result.message)
      await this.#applyConfig(config, secrets, result.message)
      return
    }
    await this.#applyConfig(config, secrets)
  }

  #baseUrl(config: Config | undefined): string {
    return String(config?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      { type: 'textinput', id: 'baseUrl', label: 'Overlay base URL', width: 12, default: DEFAULT_BASE_URL, regex: '^https?://.+' },
      { type: 'textinput', id: 'pairingCode', label: 'Pairing code', width: 6, default: '', regex: '^$|^[0-9]{6}$', tooltip: 'Six digits from the setup page. It is cleared once the device token is stored.' },
      { type: 'secret-text', id: 'deviceToken', label: 'Device token', width: 6, tooltip: 'Stored automatically when a pairing code is accepted.' },
      { type: 'secret-text', id: 'controlKey', label: 'Control key', width: 12, tooltip: 'The older shared key. When it is set it is used instead of the device token.' },
      { type: 'static-text', id: 'meaning', label: 'Feedback meaning', width: 12, value: '<strong>Rendered</strong> means a connected graphics browser reports the requested revision settled. Realtime feedback expires after 30 seconds without presence. It is not a broadcast on-air/tally signal.' },
    ]
  }

  async #applyConfig(config: Config, secrets: Secrets, notice?: string): Promise<void> {
    const generation = ++this.#generation
    this.#stopRealtime()
    this.#config = { baseUrl: this.#baseUrl(config), pairingCode: '' }
    this.#controlKey = String(secrets?.controlKey || '')
    this.#deviceToken = String(secrets?.deviceToken || '')
    // The shared key wins when it is set, so a 1.3.0 configuration upgrades in place.
    this.#credential = this.#controlKey || this.#deviceToken
    this.#snapshot = null; this.#transportConnected = false; this.#presenceReceivedAt = null; this.#catalogVersion = ''; this.#catalogRefresh = null
    if (!this.#credential) {
      this.#client = null; this.updateStatus(InstanceStatus.BadConfig, notice ?? 'Enter a pairing code or a control key'); this.#publishFeedback(); return
    }
    const client = new OverlayClient({ baseUrl: this.#config.baseUrl, credential: this.#credential, clientId: `companion-${this.id}`, version: moduleVersion(), ...(this.#fetch ? { fetch: this.#fetch } : {}), ...(this.#webSocketFactory ? { webSocketFactory: this.#webSocketFactory } : {}) })
    this.#client = client
    this.#catalogRefresh = new CatalogRefreshCoordinator(
      () => client.catalogWithVersion(),
      catalog => {
        if (generation !== this.#generation || this.#destroyed) return
        if (!this.#catalog.replace(catalog.cues, catalog.slots)) throw new Error('Catalog validation failed')
        this.#catalogVersion = catalog.version
        // Slot variables are catalog-derived, so their definitions are redeclared here
        // beside the actions, feedbacks and presets rather than only once in init().
        this.#defineVariables(); this.#defineActions(); this.#defineFeedbacks(); this.#definePresets()
        this.#publishFeedback()
      },
    )
    if (notice) this.updateStatus(InstanceStatus.UnknownWarning, notice)
    else this.updateStatus(InstanceStatus.Connecting)
    const subscription = client.subscribe({
      onSnapshot: snapshot => {
        if (generation !== this.#generation || this.#destroyed) return
        this.#transportConnected = true
        this.#acceptSnapshot(snapshot, true)
        if (snapshot.catalogVersion !== this.#catalogVersion) void this.#refreshCatalog(generation, false, snapshot.catalogVersion)
        this.updateStatus(InstanceStatus.Ok)
        this.#publishFeedback()
      },
      onPresence: (renderers, serverTime) => {
        if (generation !== this.#generation || this.#destroyed) return
        this.#acceptPresence(renderers, serverTime)
        this.#publishFeedback()
      },
      onCatalog: version => {
        if (generation !== this.#generation || this.#destroyed || version === this.#catalogVersion) return
        void this.#refreshCatalog(generation, false, version)
      },
      onConnection: (state, detail) => {
        if (generation !== this.#generation || this.#destroyed) return
        if (state === 'connected') { this.#transportConnected = true; this.updateStatus(InstanceStatus.Ok) }
        else if (state === 'connecting') this.updateStatus(InstanceStatus.Connecting)
        else {
          this.#transportConnected = false
          const reason = detail ? this.#safeError(new Error(detail)) : 'Realtime connection closed'
          if (detail) this.log('warn', reason)
          this.updateStatus(InstanceStatus.ConnectionFailure, reason)
        }
        this.#publishFeedback()
      },
    })
    this.#subscription = subscription
    subscription.start()
  }
  #stopRealtime(): void {
    this.#subscription?.stop(); this.#subscription = null
    if (this.#presenceTimer) clearTimeout(this.#presenceTimer)
    this.#presenceTimer = null
    this.#transportConnected = false
    this.#clearGrace()
  }
  #clearGrace(): void {
    this.#unhealthySince = null
    if (this.#graceTimer) clearTimeout(this.#graceTimer)
    this.#graceTimer = null
  }
  async #command(action: 'in' | 'out' | 'clear' | 'cut' | 'bug' | 'logo', cue?: string, bug?: BugState, logo?: LogoState): Promise<void> {
    const client = this.#client
    const generation = this.#generation
    if (!client || this.#destroyed) return
    // The command path is ordinary authenticated HTTP and does not need the realtime
    // socket. A press during a reconnect used to be dropped with only a status line
    // nobody reads mid-service; it is sent now. The feedback is not faked to match:
    // `rendered` still waits for a graphics browser to report, which is the whole point
    // of the feedback, so the button stays unlit until the socket is back.
    const offline = !this.#transportConnected
    try {
      const snapshot = await client.activate(action, cue, bug, logo)
      if (generation !== this.#generation || this.#destroyed) return
      this.#acceptSnapshot(snapshot)
      if (offline) this.updateStatus(InstanceStatus.UnknownWarning, 'Sent without the live connection. Confirmation will follow when it reconnects.')
      else this.updateStatus(InstanceStatus.Ok)
    } catch (error) {
      if (generation !== this.#generation || this.#destroyed) return
      this.updateStatus(InstanceStatus.ConnectionFailure, this.#safeError(error))
    }
    if (generation === this.#generation && !this.#destroyed) this.#publishFeedback()
  }
  #acceptSnapshot(snapshot: OverlaySnapshot, fromRealtime = false): void {
    if (!isNewerSnapshot(this.#snapshot, snapshot)) return
    this.#snapshot = snapshot
    if (fromRealtime) this.#markPresence()
  }
  #acceptPresence(renderers: RendererState[], serverTime: number): void {
    if (!this.#snapshot) return
    this.#snapshot = { ...this.#snapshot, renderers, serverTime: Math.max(this.#snapshot.serverTime, serverTime) }
    this.#markPresence()
  }
  #markPresence(): void {
    this.#presenceReceivedAt = Date.now()
    if (this.#presenceTimer) clearTimeout(this.#presenceTimer)
    this.#presenceTimer = setTimeout(() => {
      this.#presenceTimer = null
      if (!this.#destroyed) this.#publishFeedback()
    }, 30_000)
  }
  async #refreshCatalog(generation = this.#generation, operatorRequested = true, version = this.#snapshot?.catalogVersion ?? ''): Promise<void> {
    const refresh = this.#catalogRefresh
    if (!refresh || generation !== this.#generation || this.#destroyed) return
    try { await refresh.request(version) }
    catch {
      if (generation !== this.#generation || this.#destroyed) return
      this.log('warn', 'Catalog refresh failed; retaining the last validated catalog.')
      if (operatorRequested) this.updateStatus(InstanceStatus.UnknownWarning, 'Catalog unavailable; retained previous cue list')
      return
    }
    if (generation !== this.#generation || this.#destroyed) return
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
    let message = error instanceof Error ? error.message : 'Overlay API request failed'
    for (const secret of [this.#controlKey, this.#deviceToken]) if (secret) message = message.replaceAll(secret, '[redacted]')
    return message
  }
  #feedbackState(): FeedbackState {
    return deriveFeedback(this.#snapshot, this.#transportConnected, this.#presenceReceivedAt, Date.now(), RENDERER_STALE_MS, this.#unhealthySince, DISCONNECTED_GRACE_MS)
  }
  /**
   * The fixed variables plus one `slot_<key>` per slot in the catalog. Slots come and go
   * with the catalog, so this is redeclared on every catalog change rather than once in
   * `init()`, in the same place the actions, feedbacks and presets are redeclared.
   */
  #defineVariables(): void {
    const definitions = {
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
    } as Record<string, { name: string }>
    for (const cue of slotCatalogCues(this.#catalog.cues)) definitions[`slot_${cue.slot!.key}`] = { name: `Slot: ${cue.name}` }
    this.setVariableDefinitions(definitions as Parameters<typeof this.setVariableDefinitions>[0])
  }

  /** `slot_<key>` values, one Stream Deck line each. An empty slot is an empty string. */
  #slotValues(): Record<string, string> {
    const text = this.#catalog.slotText()
    const values: Record<string, string> = {}
    for (const cue of slotCatalogCues(this.#catalog.cues)) values[`slot_${cue.slot!.key}`] = slotVariableValue(text.get(cue.slot!.key) ?? '')
    return values
  }

  #publishFeedback(): void {
    const rawDisconnected = deriveFeedback(this.#snapshot, this.#transportConnected, this.#presenceReceivedAt).disconnected
    if (!rawDisconnected) this.#clearGrace()
    else if (this.#unhealthySince === null) {
      this.#unhealthySince = Date.now()
      if (this.#graceTimer) clearTimeout(this.#graceTimer)
      this.#graceTimer = setTimeout(() => {
        this.#graceTimer = null
        if (!this.#destroyed) this.#publishFeedback()
      }, DISCONNECTED_GRACE_MS)
    }
    const state = this.#feedbackState()
    const requestedName = this.#cueName(state.requestedCue)
    this.setVariableValues({ ...this.#slotValues(), ...overlayVariables({
      requestedName,
      requestedCueId: state.requestedCue ?? '',
      // Rendered means a browser reports this exact requested revision settled, so
      // the current graphic is the requested one; otherwise nothing is known.
      currentName: state.rendered ? requestedName : '',
      revision: this.#snapshot?.revision ?? 0,
      connection: connectionLabel(!rawDisconnected, state.disconnected),
      bugOn: this.#snapshot?.bug?.on === true,
      bugPage: this.#bugPage(),
      logoOn: this.#snapshot?.logo?.on === true,
      logoState: logoStatusLabel(this.#snapshot),
    }) })
    this.checkAllFeedbacks()
  }

  /** The page the live state currently carries, blank when there is no scan card. */
  #bugPage(): string {
    return this.#snapshot?.bug?.page ?? ''
  }

  // A page the relay would refuse never becomes a request: the refusal is the
  // same sentence the console shows, and the live state is left untouched.
  async #setPage(page: string): Promise<void> {
    // The console trims before it validates, so a field of spaces clears the page there
    // rather than being refused. Trim here too, or the two surfaces disagree about the
    // same keystrokes and a blank-looking field is sent as a page the relay refuses.
    page = page.trim()
    if (!validBugPage(page)) {
      this.log('warn', 'Page must be 12 characters or fewer.')
      this.updateStatus(InstanceStatus.UnknownWarning, 'Page must be 12 characters or fewer.')
      return
    }
    await this.#command('bug', undefined, { on: true, page: page || null })
  }

  // The target comes from the live cue's published name and the catalog only.
  // Nothing selected and nothing to derive means nothing is sent.
  async #panelStep(step: 1 | -1, selectedSet: string): Promise<void> {
    // Only the cues the operator can choose by hand are navigable: a hidden graphic is
    // not offered in any dropdown, so Next/Previous panel must not be the one path that
    // puts it on air.
    const target = panelTarget(visibleCatalogCues(this.#catalog.cues), this.#snapshot?.cue ?? null, step, selectedSet)
    if (!target) return
    await this.#cueCommand('in', target)
  }

  /** True when a cue is a slot whose text is blank — the dim state on the deck. */
  #slotIsEmpty(cueId: string): boolean {
    const cue = this.#catalog.cues.find(entry => entry.id === cueId)
    if (!cue?.slot) return false
    return (this.#catalog.slotText().get(cue.slot.key) ?? '').trim().length === 0
  }

  #cueName(cue: string | null): string {
    return this.#catalog.cues.find(entry => entry.id === cue)?.name ?? cue ?? 'Clear'
  }

  #defineActions(): void {
    const choices = visibleCatalogCues(this.#catalog.cues).map(cue => ({ id: cue.id, label: cue.name }))
    const defaultCue = choices[0]?.id ?? FALLBACK_CUES[0]!.id
    // "None" is the resting state of the panel-set option: with nothing chosen,
    // Next panel only ever continues a set that is already on screen.
    const setChoices = [{ id: '', label: 'None' }, ...panelSets(visibleCatalogCues(this.#catalog.cues)).map(set => ({ id: set.id, label: set.label }))]
    const defaultSet = ''
    const actions: CompanionActionDefinitions<Manifest['actions']> = {
      show_cue: { name: 'Show cue', description: 'Request a cue with its In animation.', options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices, default: defaultCue }], callback: async event => this.#cueCommand('in', String(event.options.cue)) },
      toggle_cue: { name: 'Toggle cue', description: 'Shows the cue with its In animation, or animates it out if it is already the requested cue.', options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices, default: defaultCue }], callback: async event => { const cue = String(event.options.cue); return this.#cueCommand(toggleAction(this.#snapshot?.cue ?? null, cue), cue) } },
      animate_out: { name: 'Animate cue out', description: 'Clear only if the selected cue is currently requested.', options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices, default: defaultCue }], callback: async event => this.#cueCommand('out', String(event.options.cue)) },
      animate_clear: { name: 'Animate out', description: 'Animate the currently requested graphic out, regardless of which cue it is.', options: [], callback: async () => this.#command('clear') },
      clear_now: { name: 'Clear now', description: 'Immediately cancel animation and clear the graphics output.', options: [], callback: async () => this.#command('cut') },
      refresh_catalog: { name: 'Refresh cue catalog', description: 'Fetch and validate the authenticated cue catalog, retaining the prior list on failure.', options: [], callback: async () => this.#refreshCatalog() },
      bug_on: { name: 'Bug on', description: 'Show the scan card, keeping whichever page is set.', options: [], callback: async () => this.#command('bug', undefined, { on: true, page: this.#snapshot?.bug?.page ?? null }) },
      bug_off: { name: 'Bug off', description: 'Hide the scan card and its page.', options: [], callback: async () => this.#command('bug', undefined, { on: false, page: null }) },
      // The resting logo, and never the scan card: these three change only the standing corner
      // mark. "On" is a setting, not a picture — while a graphic is up the site holds the mark
      // back and brings it out again once the graphic has finished leaving. Clear now turns the
      // setting off, so after an urgent clear the mark waits for a deliberate press.
      logo_on: { name: 'Resting logo on', description: 'Ask for the corner logo while the output is otherwise empty. It stays hidden under any graphic and returns when the graphic has gone.', options: [], callback: async () => this.#command('logo', undefined, undefined, { on: true }) },
      logo_off: { name: 'Resting logo off', description: 'Stop showing the corner logo, now and after the next graphic clears.', options: [], callback: async () => this.#command('logo', undefined, undefined, { on: false }) },
      logo_toggle: { name: 'Resting logo toggle', description: 'Turn the corner logo setting on or off.', options: [], callback: async () => this.#command('logo', undefined, undefined, { on: this.#snapshot?.logo?.on !== true }) },
      set_page: { name: 'Set page', description: 'Show the scan card with this page beside it.', options: [{ type: 'textinput', id: 'page', label: 'Page', default: '', regex: '^$|^[A-Za-z0-9 .,\\-–]{1,12}$', tooltip: PAGE_TOOLTIP }], callback: async event => this.#setPage(String(event.options.page ?? '')) },
      next_panel: { name: 'Next panel', description: 'Show the next panel of the multipart graphic on screen, wrapping at the last one. From anything else, show panel 01 of the chosen set.', options: [{ type: 'dropdown', id: 'set', label: 'Panel set', choices: setChoices, default: defaultSet }], callback: async event => this.#panelStep(1, String(event.options.set ?? '')) },
      previous_panel: { name: 'Previous panel', description: 'Show the previous panel of the multipart graphic on screen, wrapping at the first one. From anything else, show panel 01 of the chosen set.', options: [{ type: 'dropdown', id: 'set', label: 'Panel set', choices: setChoices, default: defaultSet }], callback: async event => this.#panelStep(-1, String(event.options.set ?? '')) },
    }
    this.setActionDefinitions(actions)
  }
  #defineFeedbacks(): void {
    const targets = [{ id: '', label: 'Clear' }, ...this.#catalog.cues.map(cue => ({ id: cue.id, label: cue.name }))]
    const slotTargets = slotCatalogCues(this.#catalog.cues).map(cue => ({ id: cue.id, label: cue.name }))
    const defaultCue = this.#catalog.cues[0]?.id ?? FALLBACK_CUES[0]!.id
    const feedbacks: CompanionFeedbackDefinitions<Manifest['feedbacks']> = {
      requested: { type: 'boolean', name: 'Cue requested', description: 'The API accepted this desired state; it does not prove rendering.', defaultStyle: { bgcolor: combineRgb(180, 110, 0), color: combineRgb(255, 255, 255) }, options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices: targets, default: defaultCue }], callback: event => String(event.options.cue || '') === (this.#snapshot?.cue ?? '') },
      rendered: { type: 'boolean', name: 'Cue rendered', description: 'A connected graphics browser reports this exact requested revision settled. Not an on-air/tally signal.', defaultStyle: { bgcolor: RENDERED_RED, color: combineRgb(255, 255, 255) }, options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices: targets, default: defaultCue }], callback: event => { const state = this.#feedbackState(); return state.rendered && String(event.options.cue || '') === (this.#snapshot?.cue ?? '') } },
      bug_visible: { type: 'boolean', name: 'Scan card visible', description: 'The live state carries a scan card.', defaultStyle: { bgcolor: combineRgb(0, 90, 140), color: combineRgb(255, 255, 255) }, options: [], callback: () => this.#snapshot?.bug?.on === true },
      // Two feedbacks rather than one, because the operator's setting and what is on screen are
      // different facts and a single lamp would have to lie about one of them. Neither is a
      // rendered report: no graphics browser acknowledges the corner mark, and `rendered`
      // remains the only feedback in this module that waits for one.
      logo_enabled: { type: 'boolean', name: 'Resting logo enabled', description: 'The operator has asked for the corner logo. It is a setting, not proof of a picture.', defaultStyle: { bgcolor: combineRgb(90, 70, 0), color: combineRgb(255, 255, 255) }, options: [], callback: () => this.#snapshot?.logo?.on === true },
      logo_held: { type: 'boolean', name: 'Resting logo held back', description: 'The corner logo is enabled but a graphic or the scan card is requested, so the site is keeping it off screen.', defaultStyle: { bgcolor: combineRgb(60, 60, 60), color: combineRgb(200, 200, 200) }, options: [], callback: () => logoStatusLabel(this.#snapshot) === 'On (held)' },
      slot_empty: { type: 'boolean', name: 'Slot is empty', description: 'The text of this slot has not been filled in for this service.', defaultStyle: { bgcolor: SLOT_EMPTY_BG, color: SLOT_EMPTY_TEXT }, options: [{ type: 'dropdown', id: 'cue', label: 'Cue', choices: slotTargets, default: slotTargets[0]?.id ?? '' }], callback: event => this.#slotIsEmpty(String(event.options.cue || '')) },
      disconnected: { type: 'boolean', name: 'Realtime or renderer disconnected', description: 'The realtime subscription is closed or no graphics browser presence has arrived for 30 seconds.', defaultStyle: { bgcolor: combineRgb(175, 0, 0), color: combineRgb(255, 255, 255) }, options: [], callback: () => this.#feedbackState().disconnected },
    }
    this.setFeedbackDefinitions(feedbacks)
  }
  #definePresets(): void {
    const presets: CompanionPresetDefinitions<Manifest> = {}
    const disconnected = { feedbackId: 'disconnected' as const, options: {}, style: { bgcolor: combineRgb(175, 0, 0) } }
    for (const cue of visibleCatalogCues(this.#catalog.cues)) {
      const colour = categoryColour(cue.category)
      presets[cuePresetId(cue.id)] = {
        type: 'simple', name: `Toggle ${cue.name}`, style: { text: cue.name, size: '14', color: colour.color, bgcolor: colour.bgcolor },
        steps: [{ down: [{ actionId: 'toggle_cue', options: { cue: cue.id } }], up: [] }],
        feedbacks: [
          { feedbackId: 'requested', options: { cue: cue.id }, style: { bgcolor: combineRgb(180, 110, 0) } },
          { feedbackId: 'rendered', options: { cue: cue.id }, style: { bgcolor: RENDERED_RED } },
          disconnected,
        ],
      }
    }
    // Button text reads this connection's own variables, so the label is resolved
    // at definition time and redefined whenever the connection is renamed.
    const label = this.label || 'overlays'
    // A slot preset carries the slot's short label over the slot's own variable, so the
    // deck reads "Student / Noa" and changes by itself the moment the text is saved.
    // Nobody ever relabels the button.
    for (const cue of slotCatalogCues(this.#catalog.cues)) {
      const colour = categoryColour('names')
      presets[slotPresetId(cue.id)] = {
        type: 'simple', name: `Slot: ${cue.name}`,
        style: { text: `${cue.name}\n$(${label}:slot_${cue.slot!.key})`, size: '14', color: colour.color, bgcolor: colour.bgcolor },
        steps: [{ down: [{ actionId: 'toggle_cue', options: { cue: cue.id } }], up: [] }],
        feedbacks: [
          { feedbackId: 'slot_empty', options: { cue: cue.id }, style: { bgcolor: SLOT_EMPTY_BG, color: SLOT_EMPTY_TEXT } },
          { feedbackId: 'requested', options: { cue: cue.id }, style: { bgcolor: combineRgb(180, 110, 0) } },
          { feedbackId: 'rendered', options: { cue: cue.id }, style: { bgcolor: RENDERED_RED } },
          disconnected,
        ],
      }
    }
    // The two clear buttons stay green: they light when the output is confirmed CLEAR, so
    // painting them red would contradict the rule the colours now teach.
    presets.animate_out = { type: 'simple', name: 'Animate out', style: { text: 'Animate\nOut', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(65, 65, 65) }, steps: [{ down: [{ actionId: 'animate_clear', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'rendered', options: { cue: '' }, style: { bgcolor: CLEAR_CONFIRMED_GREEN } }, disconnected] }
    presets.clear_now = { type: 'simple', name: 'Clear now', style: { text: 'CLEAR\nNOW', size: '14', color: combineRgb(255, 255, 255), bgcolor: combineRgb(120, 0, 0) }, steps: [{ down: [{ actionId: 'clear_now', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'rendered', options: { cue: '' }, style: { bgcolor: CLEAR_CONFIRMED_GREEN } }, disconnected] }
    presets.logo = { type: 'simple', name: 'Resting logo', style: { text: 'Resting\nlogo', size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [{ actionId: 'logo_toggle', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'logo_enabled', options: {}, style: { bgcolor: combineRgb(90, 70, 0) } }, { feedbackId: 'logo_held', options: {}, style: { bgcolor: combineRgb(60, 60, 60) } }, disconnected] }
    presets.bug = { type: 'simple', name: 'Scan card', style: { text: 'Scan\ncard', size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [{ actionId: 'bug_on', options: {} }], up: [] }, { down: [{ actionId: 'bug_off', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'bug_visible', options: {}, style: { bgcolor: combineRgb(0, 90, 140) } }, disconnected] }
    presets.set_page = { type: 'simple', name: 'Set page', style: { text: 'Set\npage', size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [{ actionId: 'set_page', options: { page: '' } }], up: [] }], feedbacks: [disconnected] }
    presets.next_panel = { type: 'simple', name: 'Next panel', style: { text: 'Next\npanel', size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [{ actionId: 'next_panel', options: { set: '' } }], up: [] }], feedbacks: [disconnected] }
    presets.previous_panel = { type: 'simple', name: 'Previous panel', style: { text: 'Previous\npanel', size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [{ actionId: 'previous_panel', options: { set: '' } }], up: [] }], feedbacks: [disconnected] }
    // The button to press when a publish did not reach the booth.
    presets.refresh_catalog = { type: 'simple', name: 'Refresh catalog', style: { text: 'Refresh\ncatalog', size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [{ actionId: 'refresh_catalog', options: {} }], up: [] }], feedbacks: [disconnected] }
    presets.connection_status = { type: 'simple', name: 'Connection and current graphic', style: { text: `$(${label}:connection)\n$(${label}:current_name)`, size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [], up: [] }], feedbacks: [disconnected] }
    presets.current_panel = { type: 'simple', name: 'Current panel', style: { text: `$(${label}:current_panel) of $(${label}:panel_count)`, size: '14', color: combineRgb(255, 255, 255), bgcolor: CHARCOAL }, steps: [{ down: [], up: [] }], feedbacks: [disconnected] }
    const structure: CompanionPresetSection<Manifest>[] = [{ ...PRESET_SECTION_CONTROLS, definitions: Object.keys(presets) }]
    this.setPresetDefinitions(structure, presets)
  }
}
