#!/usr/bin/env node
// Read-only audit of the fresh Companion preset. Exits non-zero on any failure.
//
//   node scripts/audit-companion-preset.mjs [--preset <file>] [--export <source>] [--manifest <json>]
//        [--snapshot <catalog-snapshot.json>] [--coverage <CAPABILITY-COVERAGE.md>]
//
// It proves navigation, bindings, camera and audio invariants, capability coverage and the absence
// of credentials in the file. It does not prove anything about hardware.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHAINS, OVERLAYS, SINGULAR_MODULE, chainNeighbours, companionLabel, loadExportSafe, unwrap } from './build-companion-preset.mjs'

const root = path.resolve(import.meta.dirname, '..')
const plan = 'docs/planning/2026-09-23-overlay-consistency/companion'
export const AUDIT_DEFAULTS = {
  preset: path.join(root, 'work/companion-preset/2026-09-23/CRC-FRESH-PRESET-2026-09-23.companionconfig'),
  export: path.join(root, 'work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig'),
  manifest: path.join(root, plan, 'CUE-MANIFEST.json'),
  snapshot: path.join(root, plan, 'catalog-snapshot-2026-09-23.json'),
  coverage: path.join(root, plan, 'CAPABILITY-COVERAGE.md'),
  moduleSource: path.join(root, 'companion/src/main.ts'),
  moduleManifest: path.join(root, 'companion/companion/manifest.json'),
  upgradeBundle: path.join(root, 'work/companion-conversion/2026-09-22/tools/upgrade-bundle.mjs'),
}
const SUPERSEDED = [/^Copy of Thank you$/, /^Mourners Kaddish 3( TT)?$/, /^Vahavta trans$/, /^Psalm 96$/, /Shiru La.Adonai \(Complete · Shirei supplement\) — 0\d of 05/]
const CUE_ACTIONS = new Set(['toggle_cue', 'show_cue', 'animate_out'])
const CUE_FEEDBACKS = new Set(['requested', 'rendered', 'slot_empty'])

/* ----------------------------------------------------------- walkers --- */
export function* cells(pages) {
  for (const [p, page] of Object.entries(pages ?? {})) {
    for (const [r, row] of Object.entries(page.controls ?? {})) {
      for (const [c, ctrl] of Object.entries(row ?? {})) if (ctrl) yield { page: Number(p), row: Number(r), col: Number(c), ctrl }
    }
  }
}
export function entities(value, out = []) {
  if (Array.isArray(value)) { value.forEach((v) => entities(v, out)); return out }
  if (!value || typeof value !== 'object') return out
  if ((value.type === 'action' || value.type === 'feedback') && value.definitionId) out.push(value)
  Object.values(value).forEach((v) => entities(v, out))
  return out
}
const stepActions = (ctrl, step) => (ctrl?.steps?.[step]?.action_sets?.down ?? [])
const enabled = (list) => list.filter((a) => !a.disabled)
/** Strip ids so two controls can be compared by content. */
export function normalise(ctrl) {
  return JSON.stringify(ctrl, (k, v) => (k === 'id' || k === 'overrideId' ? undefined : v))
}
const setPageTarget = (ctrl) => {
  const a = enabled(stepActions(ctrl, '0')).find((x) => x.definitionId === 'set_page' && x.connectionId === 'internal')
  return a ? Number(unwrap(a.options.page)) : null
}

/** Action and feedback ids a module version defines, read from companion/src/main.ts. */
export function moduleDefinitions(source) {
  const block = (name) => {
    const start = source.indexOf(`  ${name}: {`, source.indexOf('interface Manifest'))
    const end = source.indexOf('\n  }', start)
    return [...source.slice(start, end).matchAll(/^\s{4}(\w+): \{/gm)].map((m) => m[1])
  }
  return { actions: new Set(block('actions')), feedbacks: new Set(block('feedbacks')) }
}

/** (connection, definition) pairs the coverage document says are intentionally dropped. */
export function droppedInCoverage(markdown) {
  const dropped = new Set()
  for (const line of markdown.split('\n')) {
    if (!/dropped/i.test(line)) continue
    for (const m of line.matchAll(/\*\*([a-z_]+)[^*]*— dropped\*\*/gi)) dropped.add(m[1])
  }
  return dropped
}

/* -------------------------------------------------------------- audit --- */
export async function audit(opts = {}) {
  const o = { ...AUDIT_DEFAULTS, ...opts }
  const failures = []
  const fail = (m) => failures.push(m)
  const raw = fs.readFileSync(o.preset)
  const text = (raw[0] === 0x1f && raw[1] === 0x8b ? (await import('node:zlib')).gunzipSync(raw) : raw).toString('utf8')
  const preset = JSON.parse(text)
  const src = loadExportSafe(o.export)
  const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'))
  const snapshot = JSON.parse(fs.readFileSync(o.snapshot, 'utf8'))
  const coverage = fs.readFileSync(o.coverage, 'utf8')
  const summary = {}

  // 1. File shape and credentials.
  if (preset.version !== src.version) fail(`version ${preset.version} ≠ export ${src.version}`)
  if (preset.type !== 'full') fail(`type ${preset.type}`)
  if (/password|passwd|secret|token/i.test(text)) fail('output contains a password/passwd/secret/token string')
  const STUB_KEYS = new Set(['moduleInstanceType', 'moduleId', 'moduleVersionId', 'label', 'enabled', 'sortOrder', 'updatePolicy', 'lastUpgradeIndex', 'isFirstInit'])
  for (const [id, inst] of Object.entries(preset.instances ?? {})) {
    const extra = Object.keys(inst).filter((k) => !STUB_KEYS.has(k))
    if (extra.length) fail(`connection ${id} carries ${extra.join(', ')}`)
    if (inst.moduleId === SINGULAR_MODULE) fail(`Singular connection ${inst.label} present`)
    if (id === OVERLAYS.id) { if (inst.moduleId !== OVERLAYS.moduleId || inst.label !== OVERLAYS.label) fail('Overlays stub mismatch'); continue }
    const s = src.instances[id]
    if (!s || s.label !== inst.label || s.moduleId !== inst.moduleId) fail(`connection ${id} does not match the export (id/label/module)`)
  }
  if (Object.keys(preset.surfaceInstances ?? {}).length || Object.keys(preset.surfaces ?? {}).length) fail('preset carries surfaces')
  summary.connections = Object.keys(preset.instances ?? {}).length

  const pages = preset.pages
  const all = [...cells(pages)]
  const at = (p, r, c) => pages[String(p)]?.controls?.[r]?.[c]
  const allEntities = entities(pages).concat(entities(preset.triggers))
  for (const e of allEntities) if (e.connectionId !== 'internal' && !preset.instances[e.connectionId]) fail(`entity ${e.definitionId} uses unknown connection ${e.connectionId}`)

  // 2. Navigation targets exist; no relative page controls.
  let navTargets = 0
  for (const { page, row, col, ctrl } of all) {
    if (['pageup', 'pagedown', 'pagenum'].includes(ctrl.type)) fail(`${page} r${row}c${col} is a ${ctrl.type} control`)
    for (const e of entities(ctrl)) {
      if (e.connectionId !== 'internal') continue
      if (e.definitionId === 'set_page') {
        navTargets++
        const t = Number(unwrap(e.options.page))
        if (!pages[String(t)] || !Object.keys(pages[String(t)].controls ?? {}).length) fail(`${page} r${row}c${col} set_page → missing or empty page ${t}`)
      }
      const loc = unwrap(e.options?.location)
      const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(String(loc ?? ''))
      if (m && !at(m[1], m[2], m[3])) fail(`${page} r${row}c${col} ${e.definitionId} → missing ${loc}`)
    }
  }
  summary.setPageActions = navTargets

  // 3. Prev/Next chains and Home on every page.
  const used = Object.keys(pages).map(Number).filter((p) => Object.keys(pages[p].controls ?? {}).length)
  for (const p of used) if (setPageTarget(at(p, 1, 7) ?? {}) !== 1) fail(`page ${p} r1c7 is not Home`)
  for (const chain of CHAINS) {
    for (const p of chain) {
      const nb = chainNeighbours(p)
      if (setPageTarget(at(p, 0, 7) ?? {}) !== nb.prev) fail(`page ${p} Prev ≠ ${nb.prev}`)
      if (setPageTarget(at(p, 2, 7) ?? {}) !== nb.next) fail(`page ${p} Next ≠ ${nb.next}`)
    }
    let p = chain[0], walked = [p]
    while (walked.length <= chain.length) { const n = setPageTarget(at(p, 2, 7)); if (n === 1) break; if (n == null) { walked.push('dead end'); break } p = n; walked.push(p) }
    if (walked.join() !== chain.join()) fail(`chain ${chain[0]}→ walks ${walked.join('→')}`)
  }
  for (const p of [3, 26]) if (at(p, 0, 7) || at(p, 2, 7)) fail(`single page ${p} has Prev/Next`)
  // Reachability from Home.
  const seen = new Set([1]), queue = [1]
  while (queue.length) {
    const p = queue.shift()
    for (const { ctrl } of cells({ [p]: pages[p] })) for (const e of entities(ctrl)) {
      if (e.connectionId === 'internal' && e.definitionId === 'set_page') { const t = Number(unwrap(e.options.page)); if (!seen.has(t)) { seen.add(t); queue.push(t) } }
    }
  }
  const unreachable = used.filter((p) => !seen.has(p))
  if (unreachable.length) fail(`pages unreachable from Home: ${unreachable.join(', ')}`)
  summary.chains = CHAINS.map((c) => `${c[0]}→${c.at(-1)}`).join(', ')

  // 4. Fixed columns identical on service pages 3–26.
  const ref = (r, c) => normalise(at(3, r, c) ?? null)
  let fixedChecked = 0
  for (let p = 3; p <= 26; p++) {
    for (const [r, c] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 6], [1, 6], [2, 6], [3, 6], [1, 7], [3, 7]]) {
      fixedChecked++
      if (!at(p, r, c)) fail(`page ${p} r${r}c${c} missing`)
      else if (normalise(at(p, r, c)) !== ref(r, c)) fail(`page ${p} r${r}c${c} differs from page 3`)
    }
  }
  summary.fixedCellsChecked = fixedChecked

  // 5. Cue bindings: manifest-only, published, not archived or superseded.
  const byId = new Map(snapshot.drafts.map((d) => [d.id, d]))
  const manifestIds = new Set(manifest.bindings.map((b) => b.cueId))
  const boundIds = new Set()
  for (const e of allEntities) {
    if (e.connectionId !== OVERLAYS.id) continue
    if (!CUE_ACTIONS.has(e.definitionId) && !CUE_FEEDBACKS.has(e.definitionId)) continue
    const id = unwrap(e.options.cue)
    boundIds.add(id)
  }
  for (const id of boundIds) {
    const d = byId.get(id)
    if (!manifestIds.has(id)) fail(`cue ${id} is not in the manifest`)
    if (!d) fail(`cue ${id} is not in the catalog snapshot`)
    else if (d.archived) fail(`cue ${id} (${d.name}) is archived`)
    else if (!(d.activeRevision > 0)) fail(`cue ${id} (${d.name}) has no published revision`)
    if (d && SUPERSEDED.some((re) => re.test(d.name))) fail(`cue ${id} (${d.name}) is superseded`)
  }
  const supersededInSnapshot = snapshot.drafts.filter((d) => d.archived && SUPERSEDED.some((re) => re.test(d.name)))
  summary.cueIdsBound = boundIds.size
  summary.supersededIdsChecked = supersededInSnapshot.length
  // Each manifest binding sits at its cell with the right shape, and no other cue button exists on 1–26.
  const bindingAt = new Map(manifest.bindings.map((b) => [`${b.page}/${b.cell}`, b]))
  let gestures = 0, singles = 0
  for (const b of manifest.bindings) {
    const [, r, c] = /^r(\d)c(\d)$/.exec(b.cell)
    const ctrl = at(b.page, r, c)
    if (!ctrl) { fail(`binding ${b.page}/${b.cell} missing`); continue }
    const s0 = stepActions(ctrl, '0'), s1 = stepActions(ctrl, '1')
    const g = b.cameraGesture
    if (!g) {
      singles++
      if (Object.keys(ctrl.steps).length !== 1 || s0.length !== 1 || s0[0].definitionId !== 'toggle_cue' || unwrap(s0[0].options.cue) !== b.cueId) fail(`binding ${b.page}/${b.cell} is not a one-step toggle_cue ${b.cueId}`)
    } else {
      gestures++
      const d = (a) => [a.connectionId === 'internal' ? 'internal' : preset.instances[a.connectionId]?.label, a.definitionId, JSON.stringify(Object.fromEntries(Object.entries(a.options).map(([k, v]) => [k, unwrap(v)])))].join(' ')
      const want0 = [`Overlays show_cue {"cue":"${b.cueId}"}`]
      if (g.in) want0.push(`${companionLabel(g.in.conn)} recallPset {"val":${g.in.preset}}`, 'internal wait {"time":1300}', `vmix command {"command":"merge input=${g.in.input}&duration=1000","encode":false}`)
      const want1 = [`Overlays animate_out {"cue":"${b.cueId}"}`]
      if (g.out) {
        if (g.out.conn) want1.push(`${companionLabel(g.out.conn)} recallPset {"val":${g.out.preset}}`, 'internal wait {"time":1300}')
        want1.push(`vmix command {"command":"merge input=${g.out.input}&duration=1000","encode":false}`)
      }
      if (s0.map(d).join('|') !== want0.join('|') || s1.map(d).join('|') !== want1.join('|') || Object.keys(ctrl.steps).length !== 2) fail(`camera gesture ${b.page}/${b.cell} differs from the manifest`)
      if (g.out && g.out.conn && (g.out.input !== 'center cam 1' || g.out.preset !== 1)) fail(`gesture ${b.page}/${b.cell} does not return to Center preset 1`)
      if (g.out && g.out.input !== 'center cam 1') fail(`gesture ${b.page}/${b.cell} does not return to center cam 1`)
    }
  }
  if (gestures !== manifest.counts.cameraGestureBindings) fail(`gesture bindings ${gestures} ≠ manifest count ${manifest.counts.cameraGestureBindings}`)
  const PTZ = new Set(Object.entries(preset.instances).filter(([, i]) => i.moduleId === 'birddog-ptz').map(([id]) => id))
  for (const { page, row, col, ctrl } of all) {
    if (page > 26) continue
    const es = entities(ctrl)
    const cueish = es.some((e) => e.connectionId === OVERLAYS.id && CUE_ACTIONS.has(e.definitionId))
    const b = bindingAt.get(`${page}/r${row}c${col}`)
    if (cueish && !b) fail(`${page} r${row}c${col} carries a cue action but has no manifest binding`)
    if (b && !b.cameraGesture && es.some((e) => PTZ.has(e.connectionId) || (e.definitionId === 'wait'))) fail(`${page} r${row}c${col} has camera actions but no manifest gesture`)
  }
  summary.bindings = `${manifest.bindings.length} (${singles} one-step, ${gestures} camera gestures)`

  // 6. Bimah Mute exact on every page that has one.
  let bimah = 0
  for (const p of used.filter((x) => x <= 30)) {
    const ctrl = at(p, 3, 7)
    if (!ctrl) { fail(`page ${p} has no Bimah Mute`); continue }
    bimah++
    const acts = enabled(stepActions(ctrl, '0')).map((a) => `${preset.instances[a.connectionId]?.label} ${a.definitionId} ${unwrap(a.options.source)}→${unwrap(a.options.target)} mute=${unwrap(a.options.mute)}`)
    if (acts.join('|') !== 'x32 mute_channel_send /ch/26→11/on mute=2|x32 mute_channel_send /ch/27→11/on mute=2') fail(`page ${p} Bimah Mute actions: ${acts.join(', ')}`)
    const fb = (ctrl.feedbacks ?? []).find((f) => f.definitionId === 'mute_channel_send')
    if (!fb || unwrap(fb.options.source) !== '/ch/26' || unwrap(fb.options.target) !== '11/on') fail(`page ${p} Bimah Mute feedback is not /ch/26 → 11/on`)
  }
  summary.bimahMuteKeys = bimah

  // 7. Module actions only from the packaged module version.
  const defs = moduleDefinitions(fs.readFileSync(o.moduleSource, 'utf8'))
  const modVersion = JSON.parse(fs.readFileSync(o.moduleManifest, 'utf8')).version
  if (modVersion !== '1.7.0' || preset.instances[OVERLAYS.id]?.moduleVersionId !== modVersion) fail(`module version ${modVersion} / stub ${preset.instances[OVERLAYS.id]?.moduleVersionId}`)
  const moduleUse = new Set()
  for (const e of allEntities) {
    if (e.connectionId !== OVERLAYS.id) continue
    moduleUse.add(e.definitionId)
    const set = e.type === 'action' ? defs.actions : defs.feedbacks
    if (!set.has(e.definitionId)) fail(`module ${e.type} ${e.definitionId} is not defined in module ${modVersion}`)
    if (['next_panel', 'previous_panel', 'set_page', 'slot_empty'].includes(e.definitionId)) fail(`module ${e.definitionId} is used but the design excludes it`)
  }
  summary.moduleDefinitionsUsed = [...moduleUse].sort().join(', ')

  // 8. Capability coverage against the original export.
  const key = (instances, e) => {
    if (e.connectionId === 'internal') return `internal.${e.definitionId}`
    const i = instances[e.connectionId]
    return `${i?.label ?? e.connectionId}.${e.definitionId}`
  }
  const before = new Map()
  for (const e of entities(src.pages).concat(entities(src.triggers))) {
    const i = src.instances[e.connectionId]
    before.set(key(src.instances, e), i?.moduleId ?? 'internal')
  }
  const after = new Set(allEntities.map((e) => key(preset.instances, e)))
  const dropped = droppedInCoverage(coverage)
  const replacedSection = /## Singular overlays \(replaced by the CRC Overlays module\)/.test(coverage)
  let preserved = 0, replaced = 0, droppedCount = 0
  for (const [k, moduleId] of before) {
    if (after.has(k)) { preserved++; continue }
    if (moduleId === SINGULAR_MODULE && replacedSection) { replaced++; continue }
    const def = k.split('.').pop()
    if (k.startsWith('internal.') && dropped.has(def)) { droppedCount++; continue }
    fail(`capability ${k} from the export is neither in the preset nor listed as dropped`)
  }
  summary.capabilities = `${before.size} (connection, definition) pairs: ${preserved} present, ${replaced} Singular replaced, ${droppedCount} dropped per CAPABILITY-COVERAGE`
  summary.triggers = Object.keys(preset.triggers ?? {}).length
  if (normalise(preset.triggers) !== normalise(src.triggers)) fail('triggers differ from the export')

  // 9. Companion 5.0.3's own import upgrade chain (when the local bundle exists).
  if (fs.existsSync(o.upgradeBundle)) {
    const { upgradeImport } = await import(pathToFileURL(o.upgradeBundle).href)
    const up = upgradeImport(structuredClone(preset))
    let changed = 0
    for (const { page, row, col, ctrl } of cells(preset.pages)) {
      const out = up.pages?.[page]?.controls?.[row]?.[col]
      if (!out || out.type !== 'button-layered' || JSON.stringify(out) !== JSON.stringify(ctrl)) changed++
    }
    if (changed) fail(`${changed} controls change under Companion 5.0.3's import upgrade`)
    if (Object.keys(up.pages).length !== Object.keys(preset.pages).length) fail('upgrade changed the page count')
    summary.companionUpgrade = `v${preset.version}→v${up.version}, ${all.length - changed}/${all.length} controls unchanged`
  } else summary.companionUpgrade = 'skipped (work/.../tools/upgrade-bundle.mjs not present)'

  summary.pages = used.length
  summary.buttons = all.length
  return { failures, summary }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) opts[argv[i].replace(/^--/, '')] = path.resolve(argv[i + 1])
  const { failures, summary } = await audit(opts)
  for (const [k, v] of Object.entries(summary)) console.log(`${k}: ${v}`)
  if (failures.length) { console.log(`\nFAIL (${failures.length}):`); for (const f of failures.slice(0, 50)) console.log(`  - ${f}`) }
  else console.log('\nPASS: preset audit clean (automated checks only; hardware is proven in rehearsal)')
  process.exitCode = failures.length ? 1 : 0
}
