// Pure renderer: CompanionDeck → Companion full export (v12 layered, as Companion 5.0.x exports it).
// Deterministic: the same deck always produces the same object, and encodeCompanionConfig() the same
// bytes. Connection stubs carry only import-mapping fields (id, module, label); never config.
import zlib from 'node:zlib'
import {
  CONNECTION_REF, INSTANCE_CONTROL, connectionByLabel, connectionByRole, roleColour, stableId, w, wrapLabel,
  type ButtonSpec, type CompanionDeck, type DeckButton, type DeviceFragment, type FragmentStyle, type IdSeed, type JsonObject,
} from './model.ts'

type Obj = Record<string, unknown>
type Next = () => string

/* ------------------------------------------------- built-in button template --- */

const wv = (value: unknown) => ({ value, isExpression: false })
const frame = () => ({ enabled: wv(true), opacity: wv(100), x: wv(0), y: wv(0), width: wv(100), height: wv(100), rotation: wv(0) })

/**
 * The built-in layered button (canvas, background box, image, text), exactly as Companion 5.0.3 writes a
 * plain button. Replaces the old clone of the export's page 76 r0c0. Box colour black, text empty, white.
 */
export function templateLayers(): Obj[] {
  return [
    { id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: wv('default'), showStatusIcons: wv('default') },
    { id: 'box0', name: 'Background', usage: 'auto', type: 'box', ...frame(), color: wv(0), borderWidth: wv(0), borderColor: wv(0), borderPosition: wv('inside') },
    { id: 'image0', name: 'Image', usage: 'auto', type: 'image', ...frame(), base64Image: wv(null), halign: wv('center'), valign: wv('center'), fillMode: wv('fit') },
    {
      id: 'text0', name: 'Text', usage: 'auto', type: 'text', ...frame(), text: wv(''), color: wv(0xffffff), halign: wv('center'), valign: wv('center'),
      fontsize: wv(100), fontsizeAllowShrink: wv(true), font: wv('companion-sans'), outlineColor: wv(4278190080),
    },
  ]
}
/** "layerId.key" → value, for every template key. */
export const TEMPLATE_KEYS: ReadonlySet<string> = new Set(templateLayers().flatMap((l) => Object.keys(l).map((k) => `${l.id}.${k}`)))

export const BUTTON_OPTIONS = { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: true, notes: '' }

export function expandStyle(style: FragmentStyle): Obj {
  if ('style' in style) return structuredClone(style.style) as Obj
  const layers = templateLayers()
  for (const [path, value] of Object.entries(style.set)) {
    const dot = path.indexOf('.')
    const layer = layers.find((l) => l.id === path.slice(0, dot))
    const key = path.slice(dot + 1)
    if (!layer || !(key in layer)) throw new Error(`style override ${path} is not a template key`)
    layer[key] = structuredClone(value)
  }
  return { layers }
}

/* --------------------------------------------------------------- entities --- */

const opts = (options: Obj) => Object.fromEntries(Object.entries(options).map(([k, v]) => [k, w(v)]))
function action(next: Next, definitionId: string, connectionId: string, options: Obj = {}, extra: Obj = {}): Obj {
  return {
    type: 'action', id: next(), definitionId, connectionId, options: opts(options),
    ...(connectionId === 'internal' ? { children: {} } : { upgradeIndex: -1 }), ...extra,
  }
}
const override = (next: Next, elementId: string, value: number) => ({ overrideId: next(), elementId, elementProperty: 'color', override: w(value) })
function feedback(next: Next, definitionId: string, connectionId: string, options: Obj, box: number | null, text: number | null): Obj {
  return {
    type: 'feedback', id: next(), definitionId, connectionId, options: opts(options), isInverted: w(false),
    ...(connectionId === 'internal' ? {} : { upgradeIndex: -1 }),
    styleOverrides: [...(text == null ? [] : [override(next, 'text0', text)]), ...(box == null ? [] : [override(next, 'box0', box)])],
    children: {},
  }
}
const step = (down: Obj[]) => ({ action_sets: { down, up: [] }, options: { runWhileHeld: [] } })

/** Give every entity a fresh id (children before their parent), as the original generator did. */
function reid<T>(value: T, next: Next): T {
  if (Array.isArray(value)) return value.map((v) => reid(v, next)) as T
  if (!value || typeof value !== 'object') return value
  const out: Obj = {}
  for (const [k, v] of Object.entries(value)) out[k] = reid(v, next)
  if ((out.type === 'action' || out.type === 'feedback') && typeof out.id === 'string') out.id = next()
  if (typeof out.overrideId === 'string') out.overrideId = next()
  return out as T
}

/** Replace `label:<label>` connection references with the deck's connection ids. */
export function resolveConnections<T>(value: T, deck: CompanionDeck): T {
  if (Array.isArray(value)) return value.map((v) => resolveConnections(v, deck)) as T
  if (!value || typeof value !== 'object') return value
  const byRef = (ref: string) => {
    const label = ref.slice(CONNECTION_REF.length)
    const found = deck.connections.find((c) => c.label === label)
    if (!found) throw new Error(`connection ${label} is not in the deck`)
    return found.id
  }
  const out: Obj = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === 'connectionId' && typeof v === 'string' && v.startsWith(CONNECTION_REF) ? byRef(v) : resolveConnections(v, deck)
  }
  const target = out.definitionId === INSTANCE_CONTROL ? (out.options as Obj | undefined)?.instance_id as Obj | undefined : undefined
  if (target && typeof target.value === 'string' && target.value.startsWith(CONNECTION_REF)) target.value = byRef(target.value)
  return out as T
}

/* ---------------------------------------------------------------- buttons --- */

function relabel(ctrl: Obj, text?: string, bg?: number): Obj {
  for (const layer of ((ctrl.style as Obj | undefined)?.layers as Obj[] | undefined) ?? []) {
    if (layer.type === 'text' && text != null) layer.text = w(String(text))
    if (layer.type === 'box' && bg != null) layer.color = w(bg)
  }
  return ctrl
}
function plain(text: string, bg: number, color: number, feedbacks: Obj[], steps: Obj[][]): Obj {
  const layers = templateLayers()
  for (const layer of layers) {
    if (layer.type === 'box') layer.color = w(bg)
    if (layer.type === 'text') { layer.text = w(String(text)); layer.color = w(color) }
  }
  return {
    type: 'button-layered', style: { layers }, options: { ...BUTTON_OPTIONS }, feedbacks,
    steps: Object.fromEntries(steps.map((down, i) => [String(i), step(down)])), localVariables: [],
  }
}
function fragmentControl(fragment: DeviceFragment): Obj {
  if (fragment.kind === 'entities') throw new Error(`fragment ${fragment.source} holds entities, not a control`)
  return structuredClone({
    type: 'button-layered', style: expandStyle(fragment.style), options: fragment.options, feedbacks: fragment.feedbacks,
    steps: fragment.steps, localVariables: fragment.localVariables,
  }) as Obj
}


function idSource(ids: IdSeed | undefined, where: string): Next {
  if (!ids) return () => { throw new Error(`${where} needs an id seed`) }
  let n = ids.base
  return () => stableId(`${ids.ctx}#${n++}`)
}

/** Render one button spec into a Companion layered control. */
export function renderButton(deck: CompanionDeck, button: DeckButton, where = `r${button.row}c${button.col}`): Obj {
  const spec: ButtonSpec = button.spec
  const P = deck.palette
  const next = idSource(button.ids, where)
  const fragment = (key: string) => {
    const f = deck.fragments[key]
    if (!f) throw new Error(`${where}: fragment ${key} is not in the deck`)
    return resolveConnections(f, deck)
  }
  const overlays = () => connectionByRole(deck, 'overlays').id
  const vmixCmd = (command: string) => action(next, 'command', connectionByRole(deck, 'switcher').id, { command, encode: false }, { upgradeIndex: 13 })
  const merge = (input: string) => vmixCmd(`merge input=${input}&duration=${deck.switcher.mergeDurationMs}`)
  const disc = () => feedback(next, 'disconnected', overlays(), {}, P.disconnected, P.white)

  switch (spec.kind) {
    case 'cue': {
      const bg = roleColour(P, spec)
      const text = wrapLabel(spec.label)
      const cueFeedbacks = () => [
        feedback(next, 'requested', overlays(), { cue: spec.cueId }, P.requested, P.white),
        feedback(next, 'rendered', overlays(), { cue: spec.cueId }, P.rendered, P.white),
        disc(),
      ]
      const g = spec.gesture
      if (!g) {
        const feedbacks = cueFeedbacks()
        return plain(text, bg, P.white, feedbacks, [[action(next, 'toggle_cue', overlays(), { cue: spec.cueId })]])
      }
      const recall = (conn: string, preset: number | null) => action(next, 'recallPset', connectionByLabel(deck, conn).id, { val: preset }, { upgradeIndex: 6 })
      const wait = () => action(next, 'wait', 'internal', { time: deck.switcher.presetWaitMs })
      const s1 = [action(next, 'show_cue', overlays(), { cue: spec.cueId })]
      if (g.in) {
        if (!g.in.conn) throw new Error(`${where}: a gesture's in-move needs a camera`)
        s1.push(recall(g.in.conn, g.in.preset), wait(), merge(g.in.input))
      }
      const s2 = [action(next, 'animate_out', overlays(), { cue: spec.cueId })]
      if (g.out) {
        if (g.out.conn) s2.push(recall(g.out.conn, g.out.preset), wait())
        s2.push(merge(g.out.input))
      }
      const stepFb = feedback(next, 'bank_current_step', 'internal', { step: 2, location: '$(this:location)' }, null, P.stepText)
      return plain(text, bg, P.white, [stepFb, ...cueFeedbacks()], [s1, s2])
    }
    case 'jump':
      return plain(spec.text, P.black, P.white, [], [[action(next, 'set_page', 'internal', { page: spec.page, surfaceId: 'self' })]])
    case 'module': {
      const extra = spec.logoFeedback ? [feedback(next, 'logo_enabled', overlays(), {}, P.logoEnabled, P.white)] : []
      const feedbacks = [...extra, disc()]
      return plain(spec.text, spec.bg, P.white, feedbacks, [[action(next, spec.action, overlays(), {})]])
    }
    case 'camera': {
      const f = fragment('camera-tally')
      if (f.kind !== 'entities' || f.entities.length !== 1) throw new Error('camera-tally must be one feedback')
      const tally = reid(f.entities[0], next) as Obj
      tally.options = { ...(tally.options as Obj), input: w(String(spec.tally)) }
      return plain(spec.text, P.blue, P.white, [tally], [[merge(spec.input)]])
    }
    case 'merge':
      return plain('Merge\nPVW→PGM', P.orange, P.white, [], [[vmixCmd(`merge preview=&duration=${deck.switcher.mergeDurationMs}`)]])
    case 'fragment': {
      const f = fragment(spec.fragment)
      if (f.kind === 'entities') throw new Error(`${where}: fragment ${spec.fragment} holds entities, not a control`)
      const ctrl = f.kind === 'control-template' ? reid(fragmentControl(f), next) : fragmentControl(f)
      return relabel(ctrl, spec.text, spec.bg)
    }
    case 'actions': {
      const steps = spec.steps.map((keys) => keys.flatMap((key) => {
        const f = fragment(key)
        if (f.kind !== 'entities') throw new Error(`${where}: fragment ${key} is a control, not actions`)
        return reid(f.entities, next) as Obj[]
      }))
      return plain(spec.text, spec.bg, P.white, [], steps)
    }
  }
}

/* ------------------------------------------------------------------- deck --- */

/** Every connection id a rendered value references (excluding Companion's internal one). */
export function referencedConnections(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) { value.forEach((v) => referencedConnections(v, into)); return into }
  if (!value || typeof value !== 'object') return into
  const cid = (value as Obj).connectionId
  if (typeof cid === 'string' && cid !== 'internal') into.add(cid)
  Object.values(value).forEach((v) => referencedConnections(v, into))
  return into
}

export type CompanionExport = Obj & { pages: Record<string, Obj>; triggers: Obj; instances: Record<string, Obj> }

/** Render the whole deck as a Companion full export. Pure. */
export function renderDeck(deck: CompanionDeck): CompanionExport {
  const pages: Record<string, Obj> = {}
  for (const page of [...deck.pages].sort((a, b) => a.number - b.number)) {
    const controls: Record<string, Record<string, Obj>> = {}
    for (const button of page.buttons) {
      if (button.row < 0 || button.row >= deck.grid.rows || button.col < 0 || button.col >= deck.grid.columns) {
        throw new Error(`page ${page.number} r${button.row}c${button.col} is outside the grid`)
      }
      const row = (controls[button.row] ??= {})
      if (row[button.col]) throw new Error(`page ${page.number} r${button.row}c${button.col} assigned twice`)
      row[button.col] = renderButton(deck, button, `page ${page.number} r${button.row}c${button.col}`)
    }
    pages[page.number] = { id: page.id, name: page.name, controls, gridSize: { minColumn: 0, maxColumn: deck.grid.columns - 1, minRow: 0, maxRow: deck.grid.rows - 1 } }
  }
  const triggers = resolveConnections(structuredClone(deck.triggers), deck) as Obj
  const used = referencedConnections(triggers, referencedConnections(pages))
  const instances: Record<string, Obj> = {}
  for (const id of [...used].sort()) {
    const c = deck.connections.find((x) => x.id === id)
    if (!c) throw new Error(`referenced connection ${id} is not in the deck`)
    instances[id] = {
      moduleInstanceType: 'connection', moduleId: c.moduleId, moduleVersionId: c.moduleVersionId, label: c.label, enabled: false,
      sortOrder: c.sortOrder, updatePolicy: c.updatePolicy, lastUpgradeIndex: c.lastUpgradeIndex, isFirstInit: false,
    }
  }
  return {
    version: deck.companion.exportVersion,
    type: 'full',
    companionBuild: deck.companion.build,
    pages,
    triggers,
    triggerCollections: [],
    custom_variables: structuredClone(deck.customVariables),
    customVariablesCollections: [],
    expressionVariables: {},
    expressionVariablesCollections: [],
    instances,
    connectionCollections: [],
    surfaces: {},
    surfaceGroups: {},
    surfacesRemote: {},
    surfaceInstances: {},
    surfaceInstanceCollections: [],
    imageLibrary: [],
    imageLibraryCollections: [],
  }
}

/** The .companionconfig bytes: gzip level 9 of the JSON (gzip mtime 0, so bytes are deterministic). */
export function encodeCompanionConfig(exported: CompanionExport): Buffer {
  return zlib.gzipSync(Buffer.from(JSON.stringify(exported), 'utf8'), { level: 9 })
}

export type { JsonObject }
