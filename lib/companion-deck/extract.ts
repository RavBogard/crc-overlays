// Derives crc-seed-data.json from the released CRC preset (a sanitized Companion export: its
// connections are import-mapping stubs with no config or secrets). Run once, through
// `node scripts/build-companion-preset.mjs --extract <released.companionconfig>`; the result must
// render back to the same bytes, and extraction refuses if any button would differ.
import {
  CONNECTION_REF, INSTANCE_CONTROL, PALETTE, WORKSPACE_COMPANION, assertSanitized, stableId,
  type CompanionDeck, type DeckConnection, type DeviceFragment, type FragmentStyle, type JsonObject,
} from './model.ts'
import { renderButton, templateLayers } from './render.ts'
import { CARRIED, DEVICE_CELLS, buildCrcDeck, type CrcSeedData, type CueManifest } from './seed.ts'

type Obj = Record<string, unknown>
type Released = Obj & { version: number; companionBuild: string; pages: Record<string, { controls: Record<string, Record<string, Obj>> }>; triggers: Obj; custom_variables: Obj; instances: Record<string, Obj> }

const CONTROL_KEYS = 'type,style,options,feedbacks,steps,localVariables'
const shape = (layers: Obj[]) => JSON.stringify(layers.map((l) => [l.id, l.type, Object.keys(l)]))
const TEMPLATE_SHAPE = shape(templateLayers())

function compactStyle(style: Obj): FragmentStyle {
  const layers = style.layers as Obj[] | undefined
  if (Object.keys(style).join(',') !== 'layers' || !Array.isArray(layers) || shape(layers) !== TEMPLATE_SHAPE) return { style: structuredClone(style) as JsonObject }
  const base = templateLayers()
  const set: Record<string, JsonObject[string]> = {}
  layers.forEach((layer, i) => {
    for (const [k, v] of Object.entries(layer)) if (JSON.stringify(v) !== JSON.stringify(base[i][k])) set[`${layer.id}.${k}`] = structuredClone(v) as JsonObject[string]
  })
  return { set }
}

/** Every entity id and style-override id in a control. */
function idsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) { value.forEach((v) => idsIn(v, into)); return into }
  if (!value || typeof value !== 'object') return into
  const o = value as Obj
  if ((o.type === 'action' || o.type === 'feedback') && typeof o.id === 'string') into.add(o.id)
  if (typeof o.overrideId === 'string') into.add(o.overrideId)
  Object.values(o).forEach((v) => idsIn(v, into))
  return into
}

const withoutIds = (value: unknown) => JSON.stringify(value, (k, v) => (k === 'id' || k === 'overrideId' ? undefined : v))
/** Whether a carried page's Home key is the built-in jump (else the original key, tally corners and all, is kept). */
function isPlainHomeJump(ctrl: Obj): boolean {
  const deck = { palette: PALETTE, switcher: { mergeDurationMs: 1000, presetWaitMs: 1300 } } as unknown as CompanionDeck
  const jump = renderButton(deck, { row: 1, col: 7, spec: { kind: 'jump', text: 'Home\n$(this:page_name)', page: 1 }, ids: { ctx: 'probe', base: 0 } })
  return withoutIds(jump) === withoutIds(ctrl)
}

export function extractCrcSeedData(released: Released, manifest: CueManifest, source: { file: string; sha256: string }): CrcSeedData {
  for (const inst of Object.values(released.instances)) {
    if ('config' in inst || 'secrets' in inst) throw new Error('the released preset carries connection config; refusing to derive a seed from it')
  }
  const connections: DeckConnection[] = Object.entries(released.instances).map(([id, i]) => ({
    id, label: String(i.label), moduleId: String(i.moduleId), moduleVersionId: String(i.moduleVersionId),
    sortOrder: Number(i.sortOrder), updatePolicy: String(i.updatePolicy), lastUpgradeIndex: Number(i.lastUpgradeIndex),
    ...(i.moduleId === 'crc-overlays' ? { role: 'overlays' as const } : i.label === 'vmix' ? { role: 'switcher' as const } : {}),
  }))
  const labelById = new Map(connections.map((c) => [c.id, c.label]))
  const toRefs = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(toRefs) as T
    if (!value || typeof value !== 'object') return value
    const out: Obj = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === 'connectionId' && typeof v === 'string' && v !== 'internal') {
        const label = labelById.get(v)
        if (!label) throw new Error(`connection ${v} has no stub in the released preset`)
        out[k] = `${CONNECTION_REF}${label}`
      } else out[k] = toRefs(v)
    }
    // Companion's enable/disable-connection action names its target in an option.
    const target = out.definitionId === INSTANCE_CONTROL ? (out.options as Obj | undefined)?.instance_id as Obj | undefined : undefined
    if (target && typeof target.value === 'string' && labelById.has(target.value)) target.value = `${CONNECTION_REF}${labelById.get(target.value)}`
    return out as T
  }
  const cell = (p: number, r: number, c: number): Obj => {
    const ctrl = released.pages[p]?.controls?.[r]?.[c]
    if (!ctrl) throw new Error(`released preset has no ${p}/${r}/${c}`)
    return ctrl
  }
  const control = (kind: 'control' | 'control-template', src: string, ctrl: Obj): DeviceFragment => {
    if (Object.keys(ctrl).join(',') !== CONTROL_KEYS || ctrl.type !== 'button-layered') throw new Error(`${src}: unexpected control shape`)
    const c = toRefs(ctrl)
    return {
      kind, source: src, style: compactStyle(c.style as Obj), options: c.options as JsonObject, feedbacks: c.feedbacks as JsonObject[],
      steps: c.steps as JsonObject, localVariables: c.localVariables as JsonObject[],
    }
  }
  const entities = (src: string, list: unknown): DeviceFragment => ({ kind: 'entities', source: src, entities: toRefs(structuredClone(list)) as JsonObject[] })
  const down = (ctrl: Obj) => ((ctrl.steps as Obj)['0'] as { action_sets: { down: unknown[] } }).action_sets.down

  const fragments: Record<string, DeviceFragment> = {}
  const tally = (cell(3, 0, 0).feedbacks as Obj[])[0]
  if (tally?.definitionId !== 'inputLive') throw new Error('3/0/0 does not carry the vMix tally feedback')
  fragments['camera-tally'] = entities('original 18/1/3 inputLive feedback', [tally])
  fragments['bimah-mute'] = control('control-template', 'original 16/3/7', cell(1, 3, 7))
  fragments['vmix-bus-x-on'] = entities('original 21/0/4 step 1, second action', down(cell(2, 2, 4)))
  fragments['seder-merge-dinner'] = entities('original 21/0/4 step 0 (disabled)', down(cell(30, 2, 3)))
  fragments['seder-merge-bima'] = entities('original 21/0/4 step 1', down(cell(30, 3, 3)))
  for (const [p, r, c, orig] of DEVICE_CELLS) fragments[`${p}/${r}/${c}`] = control('control', `original ${orig}`, cell(p, r, c))
  for (const [n, [o]] of Object.entries(CARRIED)) {
    for (const [r, row] of Object.entries(released.pages[n].controls)) {
      for (const [c, ctrl] of Object.entries(row)) {
        const [R, C] = [Number(r), Number(c)]
        if (C === 7 && (R === 0 || R === 2)) continue
        if (C === 7 && R === 1 && isPlainHomeJump(ctrl)) continue // rendered as a jump
        fragments[`${n}/${r}/${c}`] = control('control', `original ${o}/${r}/${c}`, ctrl)
      }
    }
  }

  const data: CrcSeedData = {
    about: 'Derived from the released CRC preset; connections are import-mapping stubs and fragments name connections by label. No connection config or secrets.',
    source,
    companion: { build: released.companionBuild, exportVersion: released.version },
    connections,
    triggers: toRefs(structuredClone(released.triggers)) as JsonObject,
    customVariables: structuredClone(released.custom_variables) as JsonObject,
    fragments,
    idBases: {},
  }
  if (!released.companionBuild.startsWith(WORKSPACE_COMPANION.crc.release)) throw new Error(`released build ${released.companionBuild} is not CRC's ${WORKSPACE_COMPANION.crc.release}`)

  // Recover each generated button's id seed: the first counter value whose id the released control carries.
  const { deck, order } = buildCrcDeck(manifest, data)
  let cursor = 0
  for (const { page, button } of order) {
    if (!button.ids) continue
    const ids = idsIn(cell(page, button.row, button.col))
    const find = (from: number, to: number) => {
      for (let k = from; k < to; k++) if (ids.has(stableId(`${button.ids!.ctx}#${k}`))) return k
      return -1
    }
    let base = find(cursor, cursor + 5000)
    if (base < 0) base = find(0, 200000)
    if (base < 0) throw new Error(`${page} r${button.row}c${button.col}: no id seed reproduces the released ids`)
    button.ids.base = base
    data.idBases[button.ids.ctx] = base
    cursor = base
  }
  // Every button must render back to the released control.
  for (const page of deck.pages) {
    for (const button of page.buttons) {
      const want = JSON.stringify(cell(page.number, button.row, button.col))
      if (JSON.stringify(renderButton(deck, button)) !== want) throw new Error(`${page.number} r${button.row}c${button.col} does not render back to the released control`)
    }
  }
  assertSanitized(data, 'seed data')
  return data
}

/** One fragment/id-seed per line, so the committed file diffs by button. */
export function formatSeedData(data: CrcSeedData): string {
  const lines = ['{']
  const entries = Object.entries(data)
  entries.forEach(([k, v], i) => {
    const comma = i === entries.length - 1 ? '' : ','
    if ((k === 'fragments' || k === 'idBases' || k === 'triggers') && v && typeof v === 'object') {
      const inner = Object.entries(v as Obj)
      lines.push(`  ${JSON.stringify(k)}: {`)
      inner.forEach(([ik, iv], j) => lines.push(`    ${JSON.stringify(ik)}: ${JSON.stringify(iv)}${j === inner.length - 1 ? '' : ','}`))
      lines.push(`  }${comma}`)
    } else if (k === 'connections' && Array.isArray(v)) {
      lines.push(`  ${JSON.stringify(k)}: [`)
      v.forEach((c, j) => lines.push(`    ${JSON.stringify(c)}${j === v.length - 1 ? '' : ','}`))
      lines.push(`  ]${comma}`)
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`)
  })
  lines.push('}')
  return lines.join('\n') + '\n'
}
