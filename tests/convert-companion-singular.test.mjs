import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  convert,
  buildCatalogIndex,
  readConfig,
  writeConfig,
  isGzip,
  buildReportJson,
} from '../scripts/convert-companion-singular.mjs'

const SING = 'SiNgUlArConn000000001'
const CATALOG = {
  'Mah Tovu': { cueId: 'cue-mah-tovu', status: 'published' },
  'Barechu': { cueId: 'cue-barechu', status: 'draft' },
}

function action(id, definitionId, connectionId, options) {
  return { type: 'action', id, definitionId, connectionId, options, upgradeIndex: -1 }
}

function button(text, feedbacks, steps) {
  return {
    type: 'button',
    style: { text, size: 'auto', color: 0, bgcolor: 16777024 },
    options: { stepProgression: 'auto' },
    feedbacks,
    steps,
    localVariables: [],
  }
}

function fixture() {
  return {
    version: 9,
    type: 'full',
    instances: {
      x32conn: { instance_type: 'behringer-x32', sortOrder: 1, label: 'x32', isFirstInit: false, config: { host: '10.0.0.1' }, lastUpgradeIndex: 0, enabled: true, moduleVersionId: '3.0.0', moduleInstanceType: 'connection' },
      [SING]: { instance_type: 'singularlive-studio', sortOrder: 2, label: 'HHD', isFirstInit: false, config: { token: 'secret' }, lastUpgradeIndex: 0, enabled: true, moduleVersionId: '1.0.0', moduleInstanceType: 'connection' },
    },
    pages: {
      1: {
        id: 'p1',
        name: 'Home',
        gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 },
        controls: {
          0: {
            // mapped in/out pair, with an x32 mute in the same action set
            0: button('Mah Tovu', [
              { id: 'fb-existing', definitionId: 'bank_current_step', connectionId: 'internal', options: { step: 2 }, type: 'feedback', style: { color: 16777215, bgcolor: 16711680 }, isInverted: false, children: {} },
            ], {
              0: { action_sets: { down: [action('a1', 'animateIn', SING, { comp: 'Mah Tovu' }), action('a2', 'mute_channel', 'x32conn', { channel: 3, mute: true })], up: [] }, options: { runWhileHeld: [] } },
              1: { action_sets: { down: [action('a3', 'animateOut', SING, { comp: 'Mah Tovu' })], up: [] }, options: { runWhileHeld: [] } },
            }),
            // CRC Logo bug button
            1: button('Toggle Logo', [], {
              0: { action_sets: { down: [action('b1', 'animateIn', SING, { comp: 'CRC Logo' })], up: [] }, options: {} },
              1: { action_sets: { down: [action('b2', 'animateOut', SING, { comp: 'CRC Logo' })], up: [] }, options: {} },
            }),
          },
        },
      },
      2: {
        id: 'p2',
        name: 'HHD',
        gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 },
        controls: {
          0: {
            // unmapped comp
            0: button('Vidui', [], {
              0: { action_sets: { down: [action('c1', 'animateIn', SING, { comp: 'Vidui' })], up: [] }, options: {} },
              1: { action_sets: { down: [action('c2', 'animateOut', SING, { comp: 'Vidui' })], up: [] }, options: {} },
            }),
            // takeOutAllOutput, nested inside an internal action_group
            1: button('Clear', [], {
              0: {
                action_sets: {
                  down: [
                    {
                      type: 'action', id: 'g1', definitionId: 'action_group', connectionId: 'internal', options: { execution_mode: 'concurrent' }, upgradeIndex: -1,
                      children: { default: [action('d1', 'takeOutAllOutput', SING, {})] },
                    },
                  ],
                  up: [],
                },
                options: {},
              },
            }),
          },
        },
      },
    },
  }
}

function run(cfg = fixture()) {
  return convert(cfg, { catalogIndex: buildCatalogIndex(CATALOG), label: 'Overlays', baseUrl: 'https://crc-overlays.vercel.app', bugNames: ['CRC Logo'] })
}

const btn = (r, p, row, col) => r.config.pages[p].controls[row][col]

test('adds one crc-overlays connection and preserves the Singular one', () => {
  const r = run()
  const entries = Object.entries(r.config.instances)
  const crc = entries.filter(([, v]) => v.instance_type === 'crc-overlays')
  assert.equal(crc.length, 1)
  const [id, conn] = crc[0]
  assert.equal(id.length, 21)
  assert.match(id, /^[A-Za-z0-9_-]{21}$/)
  assert.equal(conn.label, 'Overlays')
  assert.equal(conn.enabled, true)
  assert.deepEqual(conn.config, { baseUrl: 'https://crc-overlays.vercel.app', pairingCode: '', controlKey: '' })
  assert.equal(conn.sortOrder, 3)
  assert.equal(conn.lastUpgradeIndex, -1)
  assert.equal(conn.moduleInstanceType, 'connection')
  // Singular connection untouched and still enabled
  assert.equal(r.config.instances[SING].instance_type, 'singularlive-studio')
  assert.equal(r.config.instances[SING].enabled, true)
})

test('maps animateIn/animateOut and leaves non-Singular actions byte-identical', () => {
  const r = run()
  const b = btn(r, 1, 0, 0)
  const down0 = b.steps[0].action_sets.down
  assert.equal(down0.length, 2)
  assert.deepEqual(down0[0], {
    type: 'action', id: 'a1', definitionId: 'show_cue',
    connectionId: r.newConnectionId, options: { cue: 'cue-mah-tovu' }, upgradeIndex: -1,
  })
  // x32 action untouched, still second in the set
  assert.deepEqual(down0[1], action('a2', 'mute_channel', 'x32conn', { channel: 3, mute: true }))
  const down1 = b.steps[1].action_sets.down
  assert.deepEqual(down1[0], {
    type: 'action', id: 'a3', definitionId: 'animate_out',
    connectionId: r.newConnectionId, options: { cue: 'cue-mah-tovu' }, upgradeIndex: -1,
  })
})

test('draft-status catalog entries are still mappable', () => {
  const idx = buildCatalogIndex(CATALOG)
  assert.equal(idx.get('barechu').cueId, 'cue-barechu')
})

test('CRC Logo maps to bug_on / bug_off with empty options', () => {
  const r = run()
  const b = btn(r, 1, 0, 1)
  assert.equal(b.steps[0].action_sets.down[0].definitionId, 'bug_on')
  assert.deepEqual(b.steps[0].action_sets.down[0].options, {})
  assert.equal(b.steps[1].action_sets.down[0].definitionId, 'bug_off')
  assert.equal(b.steps[0].action_sets.down[0].connectionId, r.newConnectionId)
})

test('inserts requested+rendered feedbacks at the start and keeps bank_current_step', () => {
  const r = run()
  const fb = btn(r, 1, 0, 0).feedbacks
  assert.equal(fb.length, 3)
  assert.equal(fb[0].definitionId, 'requested')
  assert.deepEqual(fb[0].options, { cue: 'cue-mah-tovu' })
  assert.deepEqual(fb[0].style, { bgcolor: 16711680, color: 16777215 })
  assert.equal(fb[0].type, 'feedback')
  assert.equal(fb[0].isInverted, false)
  assert.match(fb[0].id, /^[A-Za-z0-9_-]{21}$/)
  assert.notEqual(fb[0].id, fb[1].id)
  assert.equal(fb[1].definitionId, 'rendered')
  assert.deepEqual(fb[1].style, { bgcolor: 65280, color: 0 })
  assert.equal(fb[2].definitionId, 'bank_current_step')
  // bug button gets a single bug_visible feedback
  const bugFb = btn(r, 1, 0, 1).feedbacks
  assert.equal(bugFb.length, 1)
  assert.equal(bugFb[0].definitionId, 'bug_visible')
  assert.deepEqual(bugFb[0].style, { bgcolor: 16711680, color: 16777215 })
})

test('unmapped button: actions removed, step kept, marked once with warning and grey', () => {
  const r = run()
  const b = btn(r, 2, 0, 0)
  assert.deepEqual(b.steps[0].action_sets.down, [])
  assert.deepEqual(b.steps[1].action_sets.down, [])
  assert.ok(b.steps[1])
  assert.equal(b.style.text, 'Vidui ⚠')
  assert.equal((b.style.text.match(/⚠/g) || []).length, 1)
  assert.equal(b.style.bgcolor, 0x333333)
  assert.equal(b.feedbacks.length, 0)
  assert.equal(r.stats.unmappedActions, 2)
  assert.equal(r.unmapped[0].name, 'Vidui')
  assert.equal(r.unmapped[0].buttons, 1)
  assert.deepEqual(r.unmapped[0].pages, [{ page: 'HHD', buttons: 1 }])
})

test('mixed button keeps its colours and gains no marking', () => {
  const r = run()
  const b = btn(r, 1, 0, 0)
  assert.equal(b.style.text, 'Mah Tovu')
  assert.equal(b.style.bgcolor, 16777024)
})

test('takeOutAllOutput nested in an action_group becomes animate_clear', () => {
  const r = run()
  const group = btn(r, 2, 0, 1).steps[0].action_sets.down[0]
  assert.equal(group.definitionId, 'action_group')
  assert.equal(group.connectionId, 'internal')
  const inner = group.children.default[0]
  assert.equal(inner.definitionId, 'animate_clear')
  assert.equal(inner.connectionId, r.newConnectionId)
  assert.deepEqual(inner.options, {})
  assert.equal(inner.id, 'd1')
  assert.equal(inner.upgradeIndex, -1)
})

test('totals and page coverage', () => {
  const r = run()
  assert.equal(r.stats.pagesScanned, 2)
  assert.equal(r.stats.buttonsScanned, 4)
  assert.equal(r.stats.buttonsTouched, 4)
  assert.equal(r.stats.buttonsMarkedDead, 1)
  assert.deepEqual(r.stats.converted, { show_cue: 1, animate_out: 1, bug_on: 1, bug_off: 1, animate_clear: 1 })
  assert.deepEqual(r.pageCoverage, [
    { page: 'Home', mapped: 2, total: 2 },
    { page: 'HHD', mapped: 1, total: 2 },
  ])
  const j = buildReportJson(r)
  assert.equal(j.totals.unmappedDistinctNames, 1)
  assert.deepEqual(j.publishNext, [{ name: 'Vidui', buttons: 1 }])
})

test('gzip round-trip: gzip in → gzip out, plain in → plain out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'))
  const gzPath = path.join(dir, 'in.companionconfig')
  const plainPath = path.join(dir, 'in-plain.companionconfig')
  writeConfig(gzPath, fixture(), true)
  writeConfig(plainPath, fixture(), false)
  assert.ok(isGzip(fs.readFileSync(gzPath)))
  assert.ok(!isGzip(fs.readFileSync(plainPath)))

  for (const [src, gz] of [[gzPath, true], [plainPath, false]]) {
    const { data, gzipped } = readConfig(src)
    assert.equal(gzipped, gz)
    const r = convert(data, { catalogIndex: buildCatalogIndex(CATALOG), bugNames: ['CRC Logo'] })
    const out = path.join(dir, `out-${gz}.companionconfig`)
    writeConfig(out, r.config, gzipped)
    assert.equal(isGzip(fs.readFileSync(out)), gz)
    const back = readConfig(out)
    assert.equal(back.data.version, 9)
    assert.equal(Object.keys(back.data.pages).length, 2)
    assert.equal(back.data.pages[1].controls[0][0].steps[0].action_sets.down[0].definitionId, 'show_cue')
  }
  fs.rmSync(dir, { recursive: true, force: true })
})
