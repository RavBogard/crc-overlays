import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULTS, SOURCE_EXPORT, buildPreset, chainNeighbours, companionLabel, parseCell, remapLocation, stableId, wrapLabel, writePreset,
} from '../scripts/build-companion-preset.mjs'
import { audit, droppedInCoverage, moduleDefinitions, normalise } from '../scripts/audit-companion-preset.mjs'

const root = path.resolve(import.meta.dirname, '..')
// The audit compares the preset with Michael's raw export (gitignored; read through loadExportSafe, which
// drops every connection config and secret). COMPANION_SOURCE_EXPORT points at it from another checkout.
const sourceExport = process.env.COMPANION_SOURCE_EXPORT || SOURCE_EXPORT
const haveExport = fs.existsSync(sourceExport)

test('stableId is deterministic, 21 characters, Companion alphabet', () => {
  assert.equal(stableId('a'), stableId('a'))
  assert.notEqual(stableId('a'), stableId('b'))
  assert.match(stableId('x'), /^[A-Za-z0-9_-]{21}$/)
})

test('cell, label and connection helpers', () => {
  assert.deepEqual(parseCell('r2c5'), [2, 5])
  assert.throws(() => parseCell('c5r2'))
  assert.equal(wrapLabel('Kaddish'), 'Kaddish')
  assert.equal(wrapLabel('Mi Chamocha 1/2'), 'Mi\nChamocha 1/2')
  assert.equal(wrapLabel('Home\n$(this:page_name)'), 'Home\n$(this:page_name)')
  assert.equal(companionLabel('Door_Cam (steve)'), 'Door_Cam__steve_')
})

test('service chains run Home → pages → Home with no neighbours outside a chain', () => {
  assert.deepEqual(chainNeighbours(4), { prev: 1, next: 5 })
  assert.deepEqual(chainNeighbours(9), { prev: 8, next: 1 })
  assert.deepEqual(chainNeighbours(16), { prev: 15, next: 1 })
  assert.deepEqual(chainNeighbours(17), { prev: 1, next: 18 })
  assert.deepEqual(chainNeighbours(25), { prev: 24, next: 1 })
  assert.equal(chainNeighbours(3), null)
  assert.equal(chainNeighbours(26), null)
})

test('absolute button locations follow the carried pages; relative ones pass through', () => {
  assert.deepEqual(remapLocation('99/2/1'), { value: '52/2/1', ok: true })
  assert.deepEqual(remapLocation('93/1/0'), { value: '35/1/0', ok: true })
  assert.deepEqual(remapLocation('$(this:page)/2/5'), { value: '$(this:page)/2/5', ok: true })
  assert.equal(remapLocation('70/0/0').ok, false)
})

test('module definitions are read from companion/src/main.ts', () => {
  const defs = moduleDefinitions(fs.readFileSync(path.join(root, 'companion/src/main.ts'), 'utf8'))
  for (const id of ['toggle_cue', 'show_cue', 'animate_out', 'animate_clear', 'clear_now', 'logo_toggle', 'refresh_catalog']) assert.ok(defs.actions.has(id), id)
  for (const id of ['requested', 'rendered', 'disconnected', 'logo_enabled']) assert.ok(defs.feedbacks.has(id), id)
  assert.ok(!defs.actions.has('requested'))
})

test('coverage document lists the two intentional drops', () => {
  const dropped = droppedInCoverage(fs.readFileSync(path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion/CAPABILITY-COVERAGE.md'), 'utf8'))
  assert.deepEqual([...dropped].sort(), ['button_release', 'panic_bank'])
})

test('normalise ignores entity ids only', () => {
  assert.equal(normalise({ id: 'a', x: 1, s: [{ overrideId: 'q', v: 2 }] }), normalise({ id: 'b', x: 1, s: [{ overrideId: 'r', v: 2 }] }))
  assert.notEqual(normalise({ x: 1 }), normalise({ x: 2 }))
})

test('generator output passes the preset audit and is byte-deterministic', async (t) => {
  if (!haveExport) { t.skip('original export is not present (work/ is gitignored)'); return }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-preset-'))
  const manifest = JSON.parse(fs.readFileSync(DEFAULTS.manifest, 'utf8'))
  const a = path.join(dir, 'a.companionconfig'), b = path.join(dir, 'b.companionconfig')
  const { preset } = buildPreset(manifest)
  writePreset(a, preset)
  writePreset(b, buildPreset(manifest).preset)
  assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), 'two runs differ')
  for (const inst of Object.values(preset.instances)) assert.ok(!('config' in inst) && !('secrets' in inst))
  const { failures, summary } = await audit({ preset: a, export: sourceExport })
  assert.deepEqual(failures, [])
  assert.equal(summary.cueIdsBound, 235)
  assert.equal(summary.cueIdsBound, manifest.counts.uniqueCuesBound)
  assert.equal(summary.bindings, `${manifest.counts.bindings} (419 one-step, 20 camera gestures)`)
  assert.equal(manifest.counts.bindings, 439)

  // The three corner cards are one-step toggle_cue keys at their manifest cells, and the audit refuses a
  // bound cue that the snapshot does not list as published.
  const CORNER = ['44ae41a4-8280-44ac-b016-b0cc81e0584f', 'b06f734d-99e4-46a9-84cd-29f17083f8dc', 'd39673be-de53-4e3d-b450-4fa6ecb9a1cf']
  const cornerCells = manifest.bindings.filter((x) => CORNER.includes(x.cueId)).map((x) => `${x.page}/${x.cell}`)
  assert.deepEqual(cornerCells.sort(), ['1/r3c4', '15/r3c2', '15/r3c4', '16/r1c4', '23/r1c5', '8/r3c2', '8/r3c4', '9/r1c5'])
  for (const x of manifest.bindings.filter((y) => CORNER.includes(y.cueId))) {
    const [r, col] = parseCell(x.cell)
    const acts = preset.pages[String(x.page)].controls[r][col].steps['0'].action_sets.down
    assert.deepEqual(acts.map((act) => [act.definitionId, act.options.cue.value]), [['toggle_cue', x.cueId]])
  }
  const snapshot = JSON.parse(fs.readFileSync(path.join(path.dirname(DEFAULTS.manifest), 'catalog-snapshot-2026-09-23.json'), 'utf8'))
  const noCorner = path.join(dir, 'snapshot-no-corner.json')
  fs.writeFileSync(noCorner, JSON.stringify({ ...snapshot, drafts: snapshot.drafts.filter((d) => d.id !== CORNER[0]) }))
  assert.match((await audit({ preset: a, snapshot: noCorner, export: sourceExport })).failures.join('\n'), new RegExp(`cue ${CORNER[0]} is not in the catalog snapshot`))

  // The audit catches broken navigation, credentials and a changed Bimah Mute.
  const broken = structuredClone(preset)
  delete broken.pages['5'].controls['2']['7']
  broken.pages['6'].controls['0']['1'].style.layers.find((l) => l.type === 'text').text.value = 'my token'
  broken.instances[Object.keys(broken.instances)[0]].config = {}
  const mute = broken.pages['8'].controls['3']['7'].steps['0'].action_sets.down[0]
  mute.options.target = { value: '12/on', isExpression: false }
  const c = path.join(dir, 'c.companionconfig')
  writePreset(c, broken)
  const result = await audit({ preset: c, export: sourceExport })
  const all = result.failures.join('\n')
  assert.match(all, /page 5 Next/)
  assert.match(all, /password\/passwd\/secret\/token/)
  assert.match(all, /carries config/)
  assert.match(all, /page 8 Bimah Mute actions/)
})
