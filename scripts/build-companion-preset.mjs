#!/usr/bin/env node
// Builds the fresh Companion preset for Michael from the accepted design
// (docs/planning/2026-09-23-overlay-consistency/companion/PRESET-DESIGN.md).
//
//   node scripts/build-companion-preset.mjs [--export <source.companionconfig>]
//        [--manifest <CUE-MANIFEST.json>] [--out <preset.companionconfig>]
//
// Deterministic: the same export and manifest always produce the same bytes.
// Every cue binding comes from CUE-MANIFEST.json. Device actions, connection ids, the six
// triggers and the carried device pages come from Michael's 16 September export, which is read
// through loadExportSafe(): every connection/surface `config` and `secrets` is deleted on load,
// so no credential is ever held, printed or written. The output carries connection entries only
// as import-mapping stubs (id, module, label), with no config.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
export const DEFAULTS = {
  export: path.join(root, 'work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig'),
  manifest: path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion/CUE-MANIFEST.json'),
  out: path.join(root, 'work/companion-preset/2026-09-23/CRC-FRESH-PRESET-2026-09-23.companionconfig'),
}

// The Overlays connection on Michael's machine (from the 2026-09-22 converted deck).
export const OVERLAYS = { id: 'JKUO3gbCLf6mwwpsZCYae', moduleId: 'crc-overlays', label: 'Overlays', moduleVersionId: '1.7.0' }
export const SINGULAR_MODULE = 'singularlive-studio'

/* ----------------------------------------------------------- pure helpers --- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
/** Deterministic 21-character Companion-style id derived from a seed string. */
export function stableId(seed, len = 21) {
  const bytes = crypto.createHash('sha256').update(String(seed)).digest()
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] & 63]
  return out
}

export const w = (value) => ({ value, isExpression: false })
export const unwrap = (x) => (x && typeof x === 'object' && !Array.isArray(x) && 'isExpression' in x && 'value' in x ? x.value : x)

/** Parse a manifest cell like "r2c5" into [row, column]. */
export function parseCell(cell) {
  const m = /^r(\d)c(\d)$/.exec(String(cell))
  if (!m) throw new Error(`bad cell ${cell}`)
  return [Number(m[1]), Number(m[2])]
}

/** Companion label: wrap onto two lines once it is longer than `max` characters. */
export function wrapLabel(text, max = 10) {
  const s = String(text ?? '')
  if (s.includes('\n') || s.length <= max) return s
  let best = -1
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && i <= max) best = i
  if (best < 0) best = s.indexOf(' ')
  return best > 0 ? s.slice(0, best) + '\n' + s.slice(best + 1) : s
}

/** Connection label as Companion stores it ("Door_Cam (steve)" → "Door_Cam__steve_"). */
export const companionLabel = (label) => String(label).replace(/[^A-Za-z0-9_-]/g, '_')

/** Explicit Prev/Next chains per service. Home is page 1. */
export const CHAINS = [
  [4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 15, 16],
  [17, 18],
  [19, 20, 21, 22, 23, 24, 25],
]
export function chainNeighbours(page) {
  for (const chain of CHAINS) {
    const i = chain.indexOf(page)
    if (i >= 0) return { prev: i === 0 ? 1 : chain[i - 1], next: i === chain.length - 1 ? 1 : chain[i + 1] }
  }
  return null
}

// Carried device pages: new page → [original page, new name].
export const CARRIED = {
  31: [96, 'Cams · Morning'], 32: [98, 'Cams · Evening'], 33: [95, 'Cams · Torah'], 34: [94, "Cams · B'nai Mitzvah"],
  35: [93, "Cams · B'nai Mitzvah save"], 36: [97, 'Cams · Candles save'], 37: [18, 'Cams · Funeral'], 38: [92, 'Cam · Left'],
  39: [91, 'Cam · Center'], 40: [90, 'Cam · Right (Door)'], 41: [89, 'Cam · Bimah (Black)'], 42: [88, 'Cam · Dorothy'],
  43: [86, 'Cam · Dorothy spin'], 44: [85, 'Cams · Oneg'], 45: [82, 'Cams · Right Oneg'], 46: [84, 'Cams · Shir Shabbat'],
  47: [81, 'Cams · Rainbow'], 48: [80, 'Cams · Rainbow 2'], 49: [87, 'Adv Cam Control'], 50: [43, 'PTZ pad · Right (Door)'],
  51: [44, 'PTZ pad · Left'], 52: [99, 'AV / Stream'], 53: [79, 'Startup tools'], 54: [75, 'Self-production'],
  55: [83, 'Media Player (VLC)'], 56: [20, 'Audio presets'],
}
/** Original page number → new page number (Home stays 1). */
export const PAGE_REMAP = Object.fromEntries([[1, 1], ...Object.entries(CARRIED).map(([n, [o]]) => [o, Number(n)])])

/** Remap an absolute "page/row/col" location; relative `$(this:...)` locations pass through. */
export function remapLocation(loc) {
  const m = /^(\d+)\/(.+)$/.exec(String(loc ?? ''))
  if (!m) return { value: loc, ok: true }
  const to = PAGE_REMAP[Number(m[1])]
  return to ? { value: `${to}/${m[2]}`, ok: true } : { value: loc, ok: false }
}

// Colours (Companion decimal RGB).
export const C = {
  white: 0xffffff, black: 0x000000, teal: 0x006699, burgundy: 0x990033, navy: 0x000066, blue: 0x003399,
  orange: 0xcc6500, darkRed: 0x780000, charcoal: 0x242424, purple: 0x660066,
  requested: 0xb46e00, rendered: 0xff0000, disconnected: 0xaa0000, logoEnabled: 0x5a4600, stepText: 0xffff00,
}
export function roleColour(binding) {
  if (binding.role === 'announcement' || binding.role === 'utility') return C.navy
  if (binding.role === 'sequence-part') return C.teal
  if (binding.role === 'alternate') return binding.sequence ? C.teal : C.burgundy
  return C.burgundy // single, short-selection
}

/* ------------------------------------------------------------------ io --- */

export function readGz(file) {
  const raw = fs.readFileSync(file)
  return JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString('utf8'))
}
/** Load a Companion export and immediately drop every connection/surface config and secret. */
export function loadExportSafe(file) {
  const data = readGz(file)
  for (const group of ['instances', 'surfaceInstances']) {
    for (const inst of Object.values(data[group] ?? {})) {
      if (inst && typeof inst === 'object') { delete inst.config; delete inst.secrets }
    }
  }
  return data
}

/* ------------------------------------------------------------- builder --- */

export function buildPreset(exportData, manifest) {
  const src = exportData
  const byLabel = Object.fromEntries(Object.entries(src.instances).map(([id, i]) => [i.label, id]))
  const conn = (label) => {
    const id = byLabel[companionLabel(label)] ?? byLabel[label]
    if (!id) throw new Error(`connection ${label} not in export`)
    return id
  }
  const VMIX = conn('vmix')
  const singular = new Set(Object.entries(src.instances).filter(([, i]) => i.moduleId === SINGULAR_MODULE).map(([id]) => id))
  const notes = []
  const template = src.pages['76'].controls['0']['0'] // plain layered "center cam" button

  // --- entity builders (layered v12 shape, as Companion 5.0.3 exports it) ---
  let seedCounter = 0
  const nextSeed = (ctx) => `${ctx}#${seedCounter++}`
  const action = (ctx, definitionId, connectionId, options = {}, extra = {}) => ({
    type: 'action', id: stableId(nextSeed(ctx)), definitionId, connectionId,
    options: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, w(v)])),
    ...(connectionId === 'internal' ? { children: {} } : { upgradeIndex: -1 }), ...extra,
  })
  const override = (ctx, elementId, value) => ({ overrideId: stableId(nextSeed(ctx)), elementId, elementProperty: 'color', override: w(value) })
  const feedback = (ctx, definitionId, connectionId, options, box, text = C.white) => ({
    type: 'feedback', id: stableId(nextSeed(ctx)), definitionId, connectionId,
    options: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, w(v)])),
    isInverted: w(false),
    ...(connectionId === 'internal' ? {} : { upgradeIndex: -1 }),
    styleOverrides: [...(text == null ? [] : [override(ctx, 'text0', text)]), ...(box == null ? [] : [override(ctx, 'box0', box)])],
    children: {},
  })
  const step = (down) => ({ action_sets: { down, up: [] }, options: { runWhileHeld: [] } })
  const button = ({ text, bg, color = C.white, feedbacks = [], steps }) => {
    const ctrl = structuredClone(template)
    for (const layer of ctrl.style.layers) {
      if (layer.type === 'box') layer.color = w(bg)
      if (layer.type === 'text') { layer.text = w(String(text)); layer.color = w(color) }
    }
    ctrl.options = { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: true, notes: '' }
    ctrl.feedbacks = feedbacks
    ctrl.steps = Object.fromEntries(steps.map((down, i) => [String(i), step(down)]))
    ctrl.localVariables = []
    return ctrl
  }
  /** Clone an original layered control and give every entity a fresh deterministic id. */
  const reid = (value, ctx) => {
    if (Array.isArray(value)) return value.map((v) => reid(v, ctx))
    if (!value || typeof value !== 'object') return value
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = reid(v, ctx)
    if ((out.type === 'action' || out.type === 'feedback') && typeof out.id === 'string') out.id = stableId(nextSeed(ctx))
    if (typeof out.overrideId === 'string') out.overrideId = stableId(nextSeed(ctx))
    return out
  }
  const relabel = (ctrl, text, bg) => {
    for (const layer of ctrl.style?.layers ?? []) {
      if (layer.type === 'text' && text != null) layer.text = w(String(text))
      if (layer.type === 'box' && bg != null) layer.color = w(bg)
    }
    return ctrl
  }
  const orig = (p, r, c) => {
    const ctrl = src.pages[String(p)]?.controls?.[r]?.[c]
    if (!ctrl) throw new Error(`original ${p}/${r}/${c} missing`)
    return ctrl
  }

  // --- manifest lookups ---
  const bindingsByPage = new Map()
  for (const b of manifest.bindings) {
    if (!bindingsByPage.has(b.page)) bindingsByPage.set(b.page, [])
    bindingsByPage.get(b.page).push(b)
  }
  const cueByDraftName = (name) => {
    const b = manifest.bindings.find((x) => x.draftName === name)
    if (!b) throw new Error(`manifest has no binding for "${name}"`)
    return b.cueId
  }

  // --- standard buttons ---
  const disc = (ctx) => feedback(ctx, 'disconnected', OVERLAYS.id, {}, C.disconnected)
  const cueFeedbacks = (ctx, cue) => [
    feedback(ctx, 'requested', OVERLAYS.id, { cue }, C.requested),
    feedback(ctx, 'rendered', OVERLAYS.id, { cue }, C.rendered),
    disc(ctx),
  ]
  const vmixCmd = (ctx, command) => action(ctx, 'command', VMIX, { command, encode: false }, { upgradeIndex: 13 })
  const recall = (ctx, label, preset) => action(ctx, 'recallPset', conn(label), { val: preset }, { upgradeIndex: 6 })
  const wait = (ctx, ms) => action(ctx, 'wait', 'internal', { time: ms })
  const setPage = (ctx, page) => action(ctx, 'set_page', 'internal', { page, surfaceId: 'self' })

  const cueButton = (ctx, b) => {
    const bg = roleColour(b)
    const text = wrapLabel(b.label)
    const g = b.cameraGesture
    if (!g) {
      return button({ text, bg, feedbacks: cueFeedbacks(ctx, b.cueId), steps: [[action(ctx, 'toggle_cue', OVERLAYS.id, { cue: b.cueId })]] })
    }
    const s1 = [action(ctx, 'show_cue', OVERLAYS.id, { cue: b.cueId })]
    if (g.in) s1.push(recall(ctx, g.in.conn, g.in.preset), wait(ctx, 1300), vmixCmd(ctx, `merge input=${g.in.input}&duration=1000`))
    const s2 = [action(ctx, 'animate_out', OVERLAYS.id, { cue: b.cueId })]
    if (g.out) {
      if (g.out.conn) s2.push(recall(ctx, g.out.conn, g.out.preset), wait(ctx, 1300))
      s2.push(vmixCmd(ctx, `merge input=${g.out.input}&duration=1000`))
    }
    const stepFb = feedback(ctx, 'bank_current_step', 'internal', { step: 2, location: '$(this:location)' }, null, C.stepText)
    return button({ text, bg, feedbacks: [stepFb, ...cueFeedbacks(ctx, b.cueId)], steps: [s1, s2] })
  }
  const camButton = (ctx, text, input, n) => {
    const tally = reid(orig(18, 1, 3).feedbacks.find((f) => f.definitionId === 'inputLive'), ctx)
    tally.options.input = w(String(n))
    return button({ text, bg: C.blue, feedbacks: [tally], steps: [[vmixCmd(ctx, `merge input=${input}&duration=1000`)]] })
  }
  const mergeButton = (ctx) => button({ text: 'Merge\nPVW→PGM', bg: C.orange, steps: [[vmixCmd(ctx, 'merge preview=&duration=1000')]] })
  const moduleButton = (ctx, text, bg, id, extraFb = []) =>
    button({ text, bg, feedbacks: [...extraFb, disc(ctx)], steps: [[action(ctx, id, OVERLAYS.id, {})]] })
  const jump = (ctx, text, page) => button({ text, bg: C.black, steps: [[setPage(ctx, page)]] })
  const bimahMute = (ctx) => relabel(reid(orig(16, 3, 7), ctx), 'Bimah\nMute', C.purple)
  const pageTitle = (p) => (p === 1 ? 'Home' : pagesMeta[p])
  const pagesMeta = {}

  // --- clone a device button, remapping page references and replacing Singular actions ---
  const COMP_TO_DRAFT = { 'Thank you': 'Thank you', 'Start soon right': 'Starting Soon', Siddurim: 'Siddurim' }
  const unresolved = []
  function transformEntities(list, ctx, where) {
    const out = []
    let clearedHere = false
    for (const e of list ?? []) {
      if (!e || typeof e !== 'object') { out.push(e); continue }
      if (singular.has(e.connectionId)) {
        if (e.type !== 'action' || e.disabled) continue
        if (e.definitionId === 'takeOutAllOutput') {
          if (!clearedHere) out.push(action(ctx, 'clear_now', OVERLAYS.id, {}))
          clearedHere = true
          continue
        }
        const comp = unwrap(e.options?.comp)
        const draft = COMP_TO_DRAFT[comp]
        if (draft && (e.definitionId === 'animateIn' || e.definitionId === 'animateOut')) {
          out.push(action(ctx, e.definitionId === 'animateIn' ? 'show_cue' : 'animate_out', OVERLAYS.id, { cue: cueByDraftName(draft) }))
        } else {
          notes.push(`${where}: dropped Singular ${e.definitionId} "${comp}" (no published cue)`)
        }
        continue
      }
      const copy = { ...e }
      if (copy.definitionId === 'instance_control' && singular.has(unwrap(copy.options?.instance_id))) continue
      if (copy.connectionId === 'internal' && copy.options) {
        copy.options = { ...copy.options }
        if (copy.definitionId === 'set_page') {
          const target = Number(unwrap(copy.options.page))
          const to = PAGE_REMAP[target]
          if (!to) unresolved.push(`${where}: set_page ${target}`)
          else copy.options.page = { ...copy.options.page, value: to }
        }
        if ('location' in copy.options) {
          const r = remapLocation(unwrap(copy.options.location))
          if (!r.ok) unresolved.push(`${where}: ${copy.definitionId} ${unwrap(copy.options.location)}`)
          copy.options.location = { ...copy.options.location, value: r.value }
        }
      }
      if (copy.children) copy.children = Object.fromEntries(Object.entries(copy.children).map(([k, v]) => [k, transformEntities(v, ctx, where)]))
      out.push(copy)
    }
    return out
  }
  const countEntities = (ctrl) => JSON.stringify(ctrl.steps ?? {}).split('"type":"action"').length - 1
  function device(p, r, c, ctx, { text, bg } = {}) {
    const source = orig(p, r, c)
    const ctrl = reid(source, ctx)
    const hadSingular = JSON.stringify(source).match(new RegExp([...singular].join('|')))
    ctrl.feedbacks = transformEntities(ctrl.feedbacks, ctx, `${p}/${r}/${c}`)
    for (const s of Object.values(ctrl.steps ?? {})) {
      for (const k of Object.keys(s.action_sets ?? {})) s.action_sets[k] = transformEntities(s.action_sets[k], ctx, `${p}/${r}/${c}`)
    }
    if (hadSingular && countEntities(ctrl) === 0) return null
    return relabel(ctrl, text, bg)
  }

  // --- page assembly ---
  const pages = {}
  const newPage = (n, name) => {
    pagesMeta[n] = name
    pages[n] = { id: stableId(`page:${n}`), name, controls: {}, gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 } }
    return pages[n]
  }
  const place = (n, r, c, ctrl, what) => {
    if (!ctrl) return
    const page = pages[n]
    page.controls[r] = page.controls[r] ?? {}
    if (page.controls[r][c]) throw new Error(`page ${n} r${r}c${c} assigned twice (${what})`)
    page.controls[r][c] = ctrl
  }
  // c6: Animate out / Clear now / Logo. Be Right Back (r3c6) is a manifest binding on pages 1–26.
  const recovery = (n) => {
    place(n, 0, 6, moduleButton(`${n}/0/6`, 'Animate\nout', C.black, 'animate_clear'), 'c6')
    place(n, 1, 6, moduleButton(`${n}/1/6`, 'Clear\nnow', C.darkRed, 'clear_now'), 'c6')
    place(n, 2, 6, moduleButton(`${n}/2/6`, 'Logo\non/off', C.charcoal, 'logo_toggle', [feedback(`${n}/2/6`, 'logo_enabled', OVERLAYS.id, {}, C.logoEnabled)]), 'c6')
  }
  const navColumn = (n, { chain }) => {
    const nb = chain ? chainNeighbours(n) : null
    if (nb) place(n, 0, 7, jump(`${n}/0/7`, `◂ Prev\n${nb.prev === 1 ? 'Home' : pageTitle(nb.prev)}`, nb.prev), 'prev')
    place(n, 1, 7, jump(`${n}/1/7`, 'Home\n$(this:page_name)', 1), 'home')
    if (nb) place(n, 2, 7, jump(`${n}/2/7`, `Next ▸\n${nb.next === 1 ? 'Home' : pageTitle(nb.next)}`, nb.next), 'next')
    place(n, 3, 7, bimahMute(`${n}/3/7`), 'bimah')
  }

  // Page names first, so Prev/Next labels can name their targets.
  for (let n = 1; n <= 26; n++) {
    const name = bindingsByPage.get(n)?.[0]?.pageName
    if (!name) throw new Error(`manifest has no bindings for page ${n}`)
    newPage(n, name)
  }
  newPage(27, 'Spare'); newPage(28, 'Spare'); newPage(29, 'Devices'); newPage(30, 'Cameras')
  for (const [n, [, name]] of Object.entries(CARRIED)) newPage(Number(n), name)

  // Service and utility pages 1–26: manifest cue cells, then the fixed columns.
  for (let n = 1; n <= 26; n++) {
    for (const b of bindingsByPage.get(n)) {
      const [r, c] = parseCell(b.cell)
      place(n, r, c, cueButton(`${n}/${b.cell}`, b), `cue ${b.cueId}`)
    }
    recovery(n)
    navColumn(n, { chain: n >= 3 })
    if (n >= 3) {
      place(n, 0, 0, camButton(`${n}/0/0`, 'Center\ncam 1', 'center cam 1', 1), 'cam')
      place(n, 1, 0, camButton(`${n}/1/0`, 'Left\ncam 2', 'left cam 2', 2), 'cam')
      place(n, 2, 0, camButton(`${n}/2/0`, 'Right\ncam 3', 'right cam 3', 3), 'cam')
      place(n, 3, 0, mergeButton(`${n}/3/0`), 'merge')
    }
  }

  // 1 · Home
  const J = (n, r, c, text, to) => place(n, r, c, jump(`${n}/${r}/${c}`, text, to), `jump ${to}`)
  J(1, 0, 0, 'Friday ▸', 4); J(1, 1, 0, 'Shabbat AM ▸', 10); J(1, 2, 0, "B'nai\nMitzvah ▸", 17); J(1, 3, 0, 'Havdalah ▸', 18)
  J(1, 0, 1, 'Holy Days ▸', 19); J(1, 1, 1, 'Kol Nidre ·\nNeilah ▸', 24); J(1, 2, 1, 'Memorial ▸', 26); J(1, 3, 1, 'Anytime ▸', 3)
  J(1, 0, 2, 'Cameras ▸', 30); J(1, 1, 2, 'Devices ▸', 29); J(1, 2, 2, 'AV /\nStream ▸', 52); J(1, 3, 2, 'Output &\nAudio ▸', 2)
  place(1, 0, 3, device(1, 1, 3, '1/0/3', { text: 'No-prod\nStart Stream' }), 'dev')
  place(1, 1, 3, device(1, 2, 3, '1/1/3', { text: 'No-prod\nEnd Stream' }), 'dev')
  place(1, 2, 3, device(1, 0, 3, '1/2/3', { text: 'Start HHD\nStream' }), 'dev')
  place(1, 3, 3, device(1, 3, 3, '1/3/3', { text: 'Music Rec' }), 'dev')
  place(1, 0, 4, device(1, 3, 0, '1/0/4', { text: 'Security\nCam' }), 'dev')
  place(1, 1, 4, device(1, 3, 7, '1/1/4', { text: 'Booth Mic\nMute' }), 'dev')
  place(1, 2, 4, moduleButton('1/2/4', 'Refresh\ncatalog', C.charcoal, 'refresh_catalog'), 'dev')

  // 2 · Output & Audio
  place(2, 0, 0, moduleButton('2/0/0', 'Logo ON', C.charcoal, 'logo_on', [feedback('2/0/0', 'logo_enabled', OVERLAYS.id, {}, C.logoEnabled)]), 'dev')
  place(2, 1, 0, moduleButton('2/1/0', 'Logo OFF', C.charcoal, 'logo_off'), 'dev')
  place(2, 2, 0, moduleButton('2/2/0', 'Refresh\ncatalog', C.charcoal, 'refresh_catalog'), 'dev')
  place(2, 0, 2, device(46, 3, 4, '2/0/2', { text: 'Bimah +5\n(stream)' }), 'dev')
  place(2, 1, 2, device(46, 3, 5, '2/1/2', { text: 'Bimah −8\n(stream)' }), 'dev')
  place(2, 2, 2, device(46, 3, 6, '2/2/2', { text: 'Mute bimahs\n(stream)' }), 'dev')
  place(2, 3, 2, device(1, 3, 7, '2/3/2', { text: 'Booth Mic\nMute' }), 'dev')
  place(2, 0, 3, device(20, 3, 6, '2/0/3', { text: 'ARD audio\npreset' }), 'dev')
  place(2, 1, 3, device(20, 3, 7, '2/1/3', { text: 'Computer\naudio preset' }), 'dev')
  place(2, 2, 3, device(99, 0, 2, '2/2/3', { text: 'Close audio' }), 'dev')
  place(2, 3, 3, device(20, 3, 3, '2/3/3', { text: 'Bimah mute\n(old ch01)' }), 'dev')
  J(2, 0, 4, 'Media\nPlayer ▸', 55); J(2, 1, 4, 'Audio\npresets ▸', 56)
  const dinner = orig(21, 0, 4).steps
  const busX = reid(dinner['1'].action_sets.down[1], '2/2/4')
  place(2, 2, 4, button({ text: 'vMix Bus X\naudio on', bg: C.black, steps: [[busX]] }), 'dev')

  // 29 · Devices (index) and 30 · Cameras (hub): c6 recovery and c7 as on Home (no BRB: see notes).
  const DEVICES = [[31, 35, 39, 43, 47, 51], [32, 36, 40, 44, 48, 52], [33, 37, 41, 45, 49, 53], [34, 38, 42, 46, 50, 54]]
  DEVICES.forEach((row, r) => row.forEach((to, c) => J(29, r, c, `${wrapLabel(pagesMeta[to], 12)} ▸`, to)))
  place(30, 0, 0, camButton('30/0/0', 'Center\ncam 1', 'center cam 1', 1), 'cam')
  place(30, 1, 0, camButton('30/1/0', 'Left\ncam 2', 'left cam 2', 2), 'cam')
  place(30, 2, 0, camButton('30/2/0', 'Right\ncam 3', 'right cam 3', 3), 'cam')
  place(30, 3, 0, mergeButton('30/3/0'), 'merge')
  place(30, 0, 1, device(72, 0, 1, '30/0/1', { text: 'F1 · Left\n(2nd deck)' }), 'F')
  place(30, 1, 1, device(72, 0, 2, '30/1/1', { text: 'F2 · Center\n(2nd deck)' }), 'F')
  place(30, 2, 1, device(72, 0, 3, '30/2/1', { text: 'F3 · Right\n(2nd deck)' }), 'F')
  place(30, 3, 1, device(72, 0, 4, '30/3/1', { text: 'F4 · Bimah\n(2nd deck)' }), 'F')
  place(30, 0, 2, device(72, 0, 5, '30/0/2', { text: 'F5 · Dorothy\n(2nd deck)' }), 'F')
  place(30, 1, 2, device(72, 0, 6, '30/1/2', { text: 'F6 · preview 8' }), 'F')
  place(30, 2, 2, device(76, 3, 0, '30/2/2', { text: 'Right cam 3\nno overlay' }), 'dev')
  place(30, 3, 2, device(1, 3, 0, '30/3/2', { text: 'Security\nCam' }), 'dev')
  place(30, 0, 3, device(99, 0, 5, '30/0/3', { text: 'Start\nPreRoll' }), 'dev')
  place(30, 1, 3, device(99, 0, 6, '30/1/3', { text: 'End\nPreRoll' }), 'dev')
  // The original Seder "Dinner!" key: its first step (merge dinner) was disabled. Main-thread decision
  // 2026-09-23: carry it disabled exactly as it was (device actions preserved as they were).
  const dinnerMerge = reid(dinner['0'].action_sets.down[0], '30/2/3')
  if (!dinnerMerge.disabled) throw new Error('expected the original Merge dinner action to be disabled')
  place(30, 2, 3, button({ text: 'Merge dinner\n(Seder)', bg: C.orange, steps: [[dinnerMerge]] }), 'dev')
  notes.push('30 r2c3 Merge dinner: carried disabled, as in the original')
  place(30, 3, 3, button({ text: 'Merge bima\ncam 4 + Bus X', bg: C.orange, steps: [reid(dinner['1'].action_sets.down, '30/3/3')] }), 'dev')
  ;[[31, 38], [32, 39], [33, 40], [34, 29]].forEach(([to, to2], r) => { J(30, r, 4, `${wrapLabel(pagesMeta[to], 12)} ▸`, to); J(30, r, 5, `${wrapLabel(pagesMeta[to2], 12)} ▸`, to2) })
  for (const n of [29, 30]) { recovery(n); navColumn(n, { chain: false }) }

  // Carried device pages 31–56.
  const carriedNumbers = Object.keys(CARRIED).map(Number)
  for (const n of carriedNumbers) {
    const [o] = CARRIED[n]
    for (const [r, row] of Object.entries(src.pages[String(o)].controls ?? {})) {
      for (const [c, ctrl] of Object.entries(row ?? {})) {
        if (Number(c) === 7 && Number(r) <= 2) continue // replaced by the explicit nav column
        if (!ctrl || ctrl.type !== 'button-layered') continue
        const out = device(o, r, c, `${n}/${r}/${c}`)
        if (out) place(n, Number(r), Number(c), out, 'carried')
        else notes.push(`${n} r${r}c${c} (orig ${o}): Singular-only button removed`)
      }
    }
    const prev = n === 31 ? 29 : n - 1, next = n === 56 ? 29 : n + 1
    place(n, 0, 7, jump(`${n}/0/7`, `◂ ${wrapLabel(pagesMeta[prev], 12)}`, prev), 'prev')
    // Camera pages keep their own Home key: it carries the vMix preview/program tally corners.
    const homeSrc = src.pages[String(o)].controls?.['1']?.['7']
    const homeActs = homeSrc?.type === 'button-layered' ? Object.values(homeSrc.steps ?? {}).flatMap((s) => s.action_sets?.down ?? []) : []
    const keepHome = homeActs.length === 1 && homeActs[0].definitionId === 'set_page' && Number(unwrap(homeActs[0].options.page)) === 1
    place(n, 1, 7, keepHome ? relabel(device(o, 1, 7, `${n}/1/7`), 'Home\n$(this:page_name)') : jump(`${n}/1/7`, 'Home\n$(this:page_name)', 1), 'home')
    place(n, 2, 7, jump(`${n}/2/7`, `${wrapLabel(pagesMeta[next], 12)} ▸`, next), 'next')
  }
  if (unresolved.length) throw new Error(`unresolved page references:\n${unresolved.join('\n')}`)

  // Connection stubs: only connections the preset references, no config and no secrets.
  const used = new Set()
  const scan = (v) => {
    if (Array.isArray(v)) return v.forEach(scan)
    if (!v || typeof v !== 'object') return
    if (typeof v.connectionId === 'string' && v.connectionId !== 'internal') used.add(v.connectionId)
    Object.values(v).forEach(scan)
  }
  scan(pages); scan(src.triggers)
  const instances = {}
  for (const id of [...used].sort()) {
    if (id === OVERLAYS.id) {
      instances[id] = { moduleInstanceType: 'connection', moduleId: OVERLAYS.moduleId, moduleVersionId: OVERLAYS.moduleVersionId, label: OVERLAYS.label, enabled: false, sortOrder: 7, updatePolicy: 'stable', lastUpgradeIndex: -1, isFirstInit: false }
      continue
    }
    const i = src.instances[id]
    if (!i) throw new Error(`referenced connection ${id} missing from export`)
    if (i.moduleId === SINGULAR_MODULE) throw new Error(`Singular connection ${i.label} still referenced`)
    instances[id] = { moduleInstanceType: 'connection', moduleId: i.moduleId, moduleVersionId: i.moduleVersionId, label: i.label, enabled: false, sortOrder: i.sortOrder ?? 0, updatePolicy: i.updatePolicy, lastUpgradeIndex: i.lastUpgradeIndex ?? -1, isFirstInit: false }
  }

  const preset = {
    version: src.version,
    type: 'full',
    companionBuild: src.companionBuild,
    pages,
    triggers: structuredClone(src.triggers),
    triggerCollections: [],
    custom_variables: structuredClone(src.custom_variables),
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
  return { preset, notes }
}

export function writePreset(file, preset) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // mtime 0 keeps the gzip bytes deterministic.
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(JSON.stringify(preset), 'utf8'), { level: 9 }))
}

function parseArgs(argv) {
  const args = { ...DEFAULTS }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    if (!(key in DEFAULTS)) throw new Error(`unknown option ${argv[i]}`)
    args[key] = path.resolve(argv[i + 1])
  }
  return args
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  const { preset, notes } = buildPreset(loadExportSafe(args.export), JSON.parse(fs.readFileSync(args.manifest, 'utf8')))
  writePreset(args.out, preset)
  const buttons = Object.values(preset.pages).reduce((n, p) => n + Object.values(p.controls).reduce((m, row) => m + Object.keys(row).length, 0), 0)
  const hash = crypto.createHash('sha256').update(fs.readFileSync(args.out)).digest('hex')
  console.log(`Wrote ${path.relative(root, args.out)}: ${Object.keys(preset.pages).length} pages, ${buttons} buttons, ${Object.keys(preset.triggers).length} triggers, ${Object.keys(preset.instances).length} connection stubs (no config), sha256 ${hash}`)
  for (const note of notes) console.log(`  note: ${note}`)
}
