// node --test convert-companion-singular.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  val, wrapsOptions, buttonText, buttonBgColor, buttonTextColor,
  buildCatalogIndex, lookupCue, convert, buildConnection, findOverlaysCollectionId,
  NEW_MODULE, MODULE_VERSION,
} from '../scripts/convert-companion-singular.mjs'

/* ------------------------------------------------------------ fixtures --- */

const SING = 'sing-conn-id'
const CATALOG = {
  'Hareini': { cueId: 'cue-hareini', status: 'published' },
  'Mah Tovu': { cueId: 'cue-mahtovu', status: 'published' },
  'Starting Soon': { cueId: 'cue-starting', status: 'published' },
  'Retired Prayer': { cueId: 'cue-retired', status: 'unpublished' },
  'Vahavta 2': { cueId: 'cue-vahavta2', status: 'published' },
  'Spare Panel 2': { cueId: 'cue-spare2', status: 'published', newButton: true },
}
const index = () => buildCatalogIndex(CATALOG)

const emptyPage = (name = 'PAGE') => ({
  name,
  gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 },
  controls: { 0: { 7: { type: 'pageup' } }, 1: { 7: { type: 'pagenum' } }, 2: { 7: { type: 'pagedown' } } },
})

function v4Action(definitionId, comp) {
  return { type: 'action', id: 'a' + definitionId + comp, definitionId, connectionId: SING, options: comp === null ? {} : { comp }, upgradeIndex: -1 }
}
function v5Action(definitionId, comp) {
  return {
    type: 'action', id: 'a' + definitionId + comp, definitionId, connectionId: SING,
    options: comp === null ? {} : { comp: { value: comp, isExpression: false } }, upgradeIndex: -1,
  }
}

function v4Button(text, bgcolor, steps, feedbacks = []) {
  return {
    type: 'button',
    style: { text, textExpression: false, size: 'auto', png64: null, alignment: 'center:center', pngalignment: 'center:center', color: 16777215, bgcolor, show_topbar: 'default', png: null, latch: true },
    options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false },
    feedbacks,
    steps,
    localVariables: [],
  }
}

function v5Button(text, bgcolor, steps, feedbacks = []) {
  return {
    type: 'button-layered',
    style: {
      layers: [
        { id: 'canvas', type: 'canvas', decoration: { value: 'default', isExpression: false } },
        { id: 'box0', type: 'box', color: { value: bgcolor, isExpression: false } },
        { id: 'image0', type: 'image', base64Image: { value: null, isExpression: false } },
        { id: 'text0', type: 'text', text: { value: text, isExpression: false }, color: { value: 16777215, isExpression: false }, fontsize: { value: 100, isExpression: false } },
      ],
    },
    options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false, canModifyStyleInApis: true, notes: '' },
    feedbacks,
    steps,
    localVariables: [],
  }
}

const twoStep = (mk, comp) => ({
  0: { action_sets: { down: [mk('animateIn', comp)], up: [] }, options: { runWhileHeld: [] } },
  1: { action_sets: { down: [mk('animateOut', comp)], up: [] }, options: { runWhileHeld: [] } },
})

function baseConfig({ version, instanceKey, pages }) {
  const conf = {
    version,
    type: 'full',
    pages,
    instances: {
      [SING]: { [instanceKey]: 'singularlive-studio', label: 'Master', sortOrder: 0, enabled: true, collectionId: 'coll-overlays', moduleInstanceType: 'connection', moduleVersionId: '2.1.2', updatePolicy: 'stable' },
      other: { [instanceKey]: 'studiocoast-vmix', label: 'vmix', sortOrder: 1, enabled: true },
    },
    connectionCollections: [{ id: 'coll-overlays', label: 'Overlays', sortOrder: 0, children: [] }],
  }
  if (instanceKey === 'moduleId') conf.instances[SING].secrets = {}
  return conf
}

const v4Config = (pages) => baseConfig({ version: 9, instanceKey: 'instance_type', pages })
const v5Config = (pages) => baseConfig({ version: 12, instanceKey: 'moduleId', pages })

const run = (config, extra = {}) => convert(config, { catalogIndex: index(), ...extra })
const cellOf = (cfg, page, r, c) => cfg.pages[page].controls[r][c]

/* --------------------------------------------------------------- tests --- */

test('val() unwraps v5 options and passes plain values through', () => {
  assert.equal(val({ value: 'Hareini', isExpression: false }), 'Hareini')
  assert.equal(val('Hareini'), 'Hareini')
  assert.equal(val(undefined), undefined)
  assert.deepEqual(val({ a: 1 }), { a: 1 })
})

test('wrapsOptions() tells a v4 file from a v5 file', () => {
  assert.equal(wrapsOptions({ version: 9 }), false)
  assert.equal(wrapsOptions({ version: 12 }), true)
})

test('a v4 input still converts', () => {
  const pages = { 1: { name: 'Home', gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 }, controls: { 0: { 0: v4Button('Hareini', 26265, twoStep(v4Action, 'Hareini')) } } }, 53: emptyPage() }
  const cfg = v4Config(pages)
  const res = run(cfg)
  const b = cellOf(res.config, 1, 0, 0)
  assert.equal(b.type, 'button')
  assert.equal(b.style.text, 'Hareini')
  assert.equal(b.style.bgcolor, 26265)
  const a = b.steps[0].action_sets.down[0]
  assert.equal(a.definitionId, 'toggle_cue')
  assert.equal(a.options.cue, 'cue-hareini', 'v4 output keeps plain option values')
  assert.equal(res.stats.buttonsConverted, 1)
})

test('a v5 input is parsed for text, background and option values', () => {
  const btn = v5Button('Student Name Noa', 16776768, twoStep(v5Action, 'Mah Tovu'))
  assert.equal(buttonText(btn), 'Student Name Noa')
  assert.equal(buttonBgColor(btn), 16776768)
  assert.equal(buttonTextColor(btn), 16777215)

  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: btn } } }, 53: emptyPage() })
  const res = run(cfg)
  const b = cellOf(res.config, 1, 0, 0)
  assert.equal(b.type, 'button')
  assert.equal(b.style.text, 'Student Name Noa', 'the original label is kept exactly')
  assert.equal(b.style.bgcolor, 16776768)
  assert.equal(b.style.size, 'auto')
  const a = b.steps[0].action_sets.down[0]
  assert.deepEqual(a.options, { cue: { value: 'cue-mahtovu', isExpression: false } }, 'v5 output keeps wrapped option values')
})

test('untouched controls pass through deep-equal', () => {
  const stranger = v5Button('vMix only', 102, {
    0: { action_sets: { down: [{ type: 'action', id: 'x1', definitionId: 'command', connectionId: 'other', options: { command: { value: 'cut', isExpression: false } }, upgradeIndex: 3 }], up: [] }, options: { runWhileHeld: [] } },
  })
  const unmappedSingular = v5Button('Rehbein', 0, twoStep(v5Action, 'Rehbein'))
  const before = structuredClone({ stranger, unmappedSingular })

  const cfg = v5Config({
    1: { name: 'Home', controls: { 0: { 0: stranger, 1: unmappedSingular, 7: { type: 'pageup' } } } },
    53: emptyPage(),
  })
  const res = run(cfg)
  assert.deepEqual(cellOf(res.config, 1, 0, 0), before.stranger)
  assert.deepEqual(cellOf(res.config, 1, 0, 1), before.unmappedSingular)
  assert.deepEqual(cellOf(res.config, 1, 0, 7), { type: 'pageup' })
})

test('a button with no matching graphic is left on Singular and reported', () => {
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: v5Button('Rehbein', 0, twoStep(v5Action, 'Rehbein')) } } }, 53: emptyPage() })
  const res = run(cfg)
  assert.equal(res.stats.buttonsLeftOnSingular, 1)
  assert.equal(res.stats.buttonsConverted, 0)
  assert.equal(res.leftOnSingular[0].comps[0], 'Rehbein')
  assert.equal(cellOf(res.config, 1, 0, 0).type, 'button-layered')
})

test('an unpublished catalogue entry counts as no match', () => {
  const idx = index()
  assert.equal(lookupCue(idx, 'Retired Prayer').usable, false)
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: v5Button('Retired', 0, twoStep(v5Action, 'Retired Prayer')) } } }, 53: emptyPage() })
  const res = run(cfg)
  assert.equal(res.stats.buttonsLeftOnSingular, 1)
})

test('converted prayer buttons become one single-step toggle with the right colour indicators', () => {
  const bcs = { id: 'fb1', definitionId: 'bank_current_step', connectionId: 'internal', type: 'feedback', options: {}, styleOverrides: [], children: {} }
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: v5Button('Hareini', 26265, twoStep(v5Action, 'Hareini'), [bcs]) } } }, 53: emptyPage() })
  const res = run(cfg)
  const b = cellOf(res.config, 1, 0, 0)

  assert.deepEqual(Object.keys(b.steps), ['0'], 'exactly one step')
  assert.equal(b.steps[0].action_sets.down.length, 1)
  assert.equal(b.steps[0].action_sets.down[0].definitionId, 'toggle_cue')
  assert.deepEqual(b.options, { stepProgression: 'auto', stepExpression: '', rotaryActions: false })
  assert.deepEqual(b.localVariables, [])

  assert.equal(b.feedbacks.find((f) => f.definitionId === 'bank_current_step'), undefined, 'step indicator dropped')
  assert.deepEqual(b.feedbacks.map((f) => f.definitionId), ['requested', 'rendered', 'disconnected'])
  assert.deepEqual(b.feedbacks[0].style, { bgcolor: 11824640, color: 16777215 })
  assert.deepEqual(b.feedbacks[1].style, { bgcolor: 16711680, color: 16777215 })
  assert.deepEqual(b.feedbacks[2].style, { bgcolor: 11141120, color: 16777215 })
  assert.equal(b.feedbacks[0].options.cue.value, 'cue-hareini')
  assert.equal(res.stats.bankCurrentStepDropped, 1)
})

test('"Start soon right" is dropped beside a real graphic, and kept when it is alone', () => {
  const paired = v5Button('Starting Soon', 102, {
    0: { action_sets: { down: [v5Action('animateIn', 'Starting Soon'), v5Action('animateIn', 'Start soon right')], up: [] }, options: { runWhileHeld: [] } },
    1: { action_sets: { down: [v5Action('animateOut', 'Starting Soon'), v5Action('animateOut', 'Start soon right')], up: [] }, options: { runWhileHeld: [] } },
  })
  const alone = v5Button('Side panel', 102, twoStep(v5Action, 'Start soon right'))
  const aloneBefore = structuredClone(alone)

  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: paired, 1: alone } } }, 53: emptyPage() })
  const res = run(cfg)

  const b = cellOf(res.config, 1, 0, 0)
  assert.deepEqual(Object.keys(b.steps), ['0'], 'still collapses to a toggle')
  assert.equal(b.steps[0].action_sets.down.length, 1)
  assert.equal(res.stats.sidePanelActionsDropped, 2)
  assert.equal(res.stats.buttonsMixed, 0, 'the dropped side panel does not make it a mixed button')
  assert.deepEqual(cellOf(res.config, 1, 0, 1), aloneBefore, 'a side-panel-only button is untouched')
})

test('CRC Logo becomes the resting logo on/off — never the scan card — and HHD Logo does not', () => {
  const logo = v5Button('Toggle Logo', 16711680, twoStep(v5Action, 'CRC Logo'))
  const hhd = v5Button('HHD Logo', 6697728, twoStep(v5Action, 'HHD Logo'))
  const hhdBefore = structuredClone(hhd)
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: logo, 1: hhd } } }, 53: emptyPage() })
  const res = run(cfg)

  const b = cellOf(res.config, 1, 0, 0)
  const defs = Object.values(b.steps).flatMap((s) => s.action_sets.down.map((a) => a.definitionId))
  // The sitting's instruction: pressing the logo must not put a QR code on screen. Nothing in
  // the converted deck emits a scan-card action, and the feedback is the setting, not a picture.
  assert.deepEqual(defs, ['logo_on', 'logo_off'])
  assert.ok(!defs.some((d) => String(d).startsWith('bug_')), 'the scan card is a different feature and a different button')
  assert.deepEqual(b.feedbacks.map((f) => f.definitionId), ['logo_enabled', 'disconnected'])
  assert.deepEqual(cellOf(res.config, 1, 0, 1), hhdBefore, 'HHD Logo has no match, so the button is untouched')
})

/* D15, and the reason it is worth changing behaviour rather than copying the deck. Michael's
   buttons paired a logo hide with the prayer going up and a restore with it coming down, because
   the old renderer did not know what was on screen. Ours does. Keeping the macros would mean a
   second, uncoordinated opinion about the mark — and, as Aleinu 3 shows, a restore that fires in
   the middle of a series, or one that switches the logo back on after the operator turned it off.
   So on a button that also shows a prayer the macro is dropped; the button's own job is intact. */
test('a prayer button loses its inherited logo macro, keeping its steps and its cue actions', () => {
  const btn = v5Button('Mah Tovu', 26265, {
    0: { action_sets: { down: [v5Action('animateIn', 'Mah Tovu'), v5Action('animateOut', 'CRC Logo')], up: [] }, options: { runWhileHeld: [] } },
    1: { action_sets: { down: [v5Action('animateOut', 'Mah Tovu'), v5Action('animateIn', 'CRC Logo')], up: [] }, options: { runWhileHeld: [] } },
  })
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: btn } } }, 53: emptyPage() })
  const res = run(cfg)
  const b = cellOf(res.config, 1, 0, 0)
  assert.deepEqual(Object.keys(b.steps), ['0', '1'])
  assert.deepEqual(b.steps[0].action_sets.down.map((a) => a.definitionId), ['show_cue'])
  assert.deepEqual(b.steps[1].action_sets.down.map((a) => a.definitionId), ['animate_out'])
  assert.deepEqual(b.feedbacks.map((f) => f.definitionId), ['requested', 'rendered', 'disconnected'])
  assert.equal(res.stats.logoMacrosDropped, 2, 'both halves of the pairing are dropped, and counted')
})

/* The Aleinu 3 case by name: a mid-series restore. The button still shows and clears its own
   panel; the stray restore no longer fires while Aleinu 4 is still to come, and no longer
   re-enables a mark the operator deliberately turned off. */
test('a mid-series logo restore is dropped, and the panel button is otherwise unchanged', () => {
  const btn = v5Button('Aleinu 3', 26265, {
    0: { action_sets: { down: [v5Action('animateIn', 'Mah Tovu'), v5Action('animateIn', 'CRC Logo')], up: [] }, options: { runWhileHeld: [] } },
  })
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: btn } } }, 53: emptyPage() })
  const res = run(cfg)
  const b = cellOf(res.config, 1, 0, 0)
  const defs = Object.values(b.steps).flatMap((s) => s.action_sets.down.map((a) => a.definitionId))
  assert.deepEqual(defs, ['show_cue'])
  assert.equal(res.stats.logoMacrosDropped, 1)
  assert.ok(!b.feedbacks.some((f) => f.definitionId === 'logo_enabled'), 'a prayer button does not claim the logo setting')
})

/* A button whose only job is the logo is a deliberate operator control and keeps its press. */
test('a logo-only button keeps its press while a prayer button loses the macro', () => {
  const toggle = v5Button('Toggle Logo', 16711680, twoStep(v5Action, 'CRC Logo'))
  const prayer = v5Button('Mah Tovu', 26265, {
    0: { action_sets: { down: [v5Action('animateIn', 'Mah Tovu'), v5Action('animateOut', 'CRC Logo')], up: [] }, options: { runWhileHeld: [] } },
  })
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: toggle, 1: prayer } } }, 53: emptyPage() })
  const res = run(cfg)
  const kept = Object.values(cellOf(res.config, 1, 0, 0).steps).flatMap((s) => s.action_sets.down.map((a) => a.definitionId))
  const dropped = Object.values(cellOf(res.config, 1, 0, 1).steps).flatMap((s) => s.action_sets.down.map((a) => a.definitionId))
  assert.deepEqual(kept, ['logo_on', 'logo_off'], 'the deliberate control survives')
  assert.deepEqual(dropped, ['show_cue'], 'the inherited macro does not')
})

test('mixed buttons keep their unmatched Singular actions, in place and in order', () => {
  const btn = v5Button('Mah Tovu + Rehbein', 26265, {
    0: {
      action_sets: {
        down: [
          v5Action('animateIn', 'Mah Tovu'),
          { type: 'action', id: 'ptz', definitionId: 'recallPset', connectionId: 'other', options: { val: { value: 5, isExpression: false } }, upgradeIndex: 2 },
          v5Action('animateIn', 'Rehbein'),
        ],
        up: [],
      },
      options: { runWhileHeld: [] },
    },
    1: { action_sets: { down: [v5Action('animateOut', 'Mah Tovu')], up: [] }, options: { runWhileHeld: [] } },
  })
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: btn } } }, 53: emptyPage() })
  const res = run(cfg)
  const b = cellOf(res.config, 1, 0, 0)
  const down = b.steps[0].action_sets.down
  assert.deepEqual(down.map((a) => a.definitionId), ['show_cue', 'recallPset', 'animateIn'])
  assert.equal(down[2].connectionId, SING, 'the unmatched graphic still points at Singular')
  assert.equal(down[2].options.comp.value, 'Rehbein')
  assert.equal(down[1].connectionId, 'other', 'the camera move is kept where it was')
  assert.equal(down[1].options.val.value, 5)
  assert.equal(res.stats.buttonsMixed, 1)
  assert.deepEqual(res.mixed[0].keptOnSingular, ['Rehbein'])
})

test('takeOutAllOutput becomes clear-all', () => {
  const btn = v5Button('Start Up', 16711680, {
    0: { action_sets: { down: [v5Action('takeOutAllOutput', null)], up: [] }, options: { runWhileHeld: [] } },
  })
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: btn } } }, 53: emptyPage() })
  const res = run(cfg)
  assert.equal(cellOf(res.config, 1, 0, 0).steps[0].action_sets.down[0].definitionId, 'animate_clear')
})

test('name aliases resolve (Veehavta 2 -> Vahavta 2)', () => {
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: v5Button('Veehavta 2', 26265, twoStep(v5Action, 'Veehavta 2')) } } }, 53: emptyPage() })
  const res = run(cfg)
  assert.equal(cellOf(res.config, 1, 0, 0).steps[0].action_sets.down[0].options.cue.value, 'cue-vahavta2')
  assert.equal(res.aliases[0].name, 'Veehavta 2')
})

test('the hand-confirmed spelling aliases resolve', () => {
  const catalog = {
    'Psukei DZimrah 1': { cueId: 'cue-pd1', status: 'published' },
    'Elohai Nshama': { cueId: 'cue-en', status: 'published' },
    'Ahava Rabbah Ahavtanu (Partial)': { cueId: 'cue-ara', status: 'published' },
    'Mi Chamocha (Friday) 1': { cueId: 'cue-mcf1', status: 'published' },
    'Kedusha 1': { cueId: 'cue-k1', status: 'published' },
    'Kedusha 2': { cueId: 'cue-k2', status: 'published' },
    'Kedusha 3': { cueId: 'cue-k3', status: 'published' },
  }
  const idx = buildCatalogIndex(catalog)
  const pairs = [
    ["Psukei d'Zimrah", 'cue-pd1'],
    ['Elohai Neshama', 'cue-en'],
    ['Ahavah Rabbah Ahavtanu', 'cue-ara'],
    ['Mi Chamocha (Friday)', 'cue-mcf1'],
    ['Keddusha 1', 'cue-k1'],
    ['Keddusha 2', 'cue-k2'],
    ['Keddusha 3', 'cue-k3'],
  ]
  for (const [comp, cueId] of pairs) {
    const hit = lookupCue(idx, comp)
    assert.equal(hit.usable, true, `${comp} should resolve`)
    assert.equal(hit.rec.cueId, cueId, `${comp} should resolve to ${cueId}`)
  }
  // Names deliberately left alone.
  for (const comp of ['Select composition', 'Money pls', 'HHD Logo']) {
    assert.equal(lookupCue(idx, comp).usable, false, `${comp} should stay unmatched`)
  }
})

test('slots convert only when a --slots map supplies a cue id', () => {
  const page = () => ({ 1: { name: 'Home', controls: { 0: { 0: v5Button('Student Name Noa', 16777215, twoStep(v5Action, 'Student Name')) } } }, 53: emptyPage() })

  const without = run(v5Config(page()))
  assert.equal(without.stats.buttonsLeftOnSingular, 1)
  assert.equal(without.slotWaiting.length, 1)

  const slots = new Map([['student name', { name: 'Student Name', cueId: 'cue-slot-name', label: 'NAME' }]])
  const withSlots = run(v5Config(page()), { slots })
  const b = cellOf(withSlots.config, 1, 0, 0)
  assert.equal(b.steps[0].action_sets.down[0].options.cue.value, 'cue-slot-name')
  assert.equal(b.style.text, 'NAME', 'the label template wins when one is given')
})

test('the spare page gets CLEAR NOW plus the homeless continuation panels, and page 1 gets a CLEAR NOW', () => {
  const cfg = v5Config({
    1: { name: '1 Home', gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 }, controls: { 0: { 0: v5Button('Hareini', 26265, twoStep(v5Action, 'Hareini')), 7: { type: 'pageup' } } } },
    53: emptyPage(),
  })
  const res = run(cfg)

  assert.equal(res.spare.page, '53')
  assert.equal(res.config.pages[53].name, 'Overlays')
  const clear = cellOf(res.config, 53, res.spare.clearNow.row, res.spare.clearNow.column)
  assert.equal(clear.style.text, 'CLEAR\nNOW')
  assert.equal(clear.style.bgcolor, 7864320)
  assert.equal(clear.steps[0].action_sets.down[0].definitionId, 'clear_now')
  assert.deepEqual(clear.feedbacks.map((f) => f.definitionId), ['disconnected'])

  const spare2 = res.spare.items.find((i) => i.name === 'Spare Panel 2')
  assert.ok(spare2, 'the newButton entry was placed')
  assert.equal(cellOf(res.config, 53, spare2.row, spare2.column).steps[0].action_sets.down[0].definitionId, 'toggle_cue')

  assert.equal(res.homeClear.page, 1)
  assert.ok(res.homeClear.column <= 6)
  assert.equal(cellOf(res.config, 1, res.homeClear.row, res.homeClear.column).style.text, 'CLEAR\nNOW')
})

test('the new connection joins the existing Overlays group and the Singular connections survive', () => {
  const cfg = v5Config({ 1: { name: 'Home', controls: { 0: { 0: v5Button('Hareini', 26265, twoStep(v5Action, 'Hareini')) } } }, 53: emptyPage() })
  assert.equal(findOverlaysCollectionId(cfg), 'coll-overlays')
  const res = run(cfg)
  const conn = res.config.instances[res.newConnectionId]
  assert.equal(conn.moduleId, NEW_MODULE)
  assert.equal(conn.moduleVersionId, MODULE_VERSION)
  assert.equal(conn.enabled, true)
  assert.equal(conn.collectionId, 'coll-overlays')
  assert.deepEqual(conn.config, { baseUrl: 'https://overlays.centralreform.org', pairingCode: '' })
  assert.deepEqual(conn.secrets, {}, 'no secrets are written into the file')
  assert.equal(conn.sortOrder, 2)
  assert.equal(res.config.instances[SING].enabled, true)
  assert.equal(res.config.instances[SING].moduleId, 'singularlive-studio')
})

test('a v4 file gets a v4-shaped connection record', () => {
  const cfg = v4Config({ 1: { name: 'Home', controls: {} }, 53: emptyPage() })
  const { conn } = buildConnection(cfg, { label: 'Overlays', baseUrl: 'https://x' })
  assert.equal(conn.instance_type, NEW_MODULE)
  assert.equal(conn.moduleId, undefined)
})
