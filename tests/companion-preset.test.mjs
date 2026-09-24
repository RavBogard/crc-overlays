import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULTS, buildPreset, chainNeighbours, companionLabel, parseCell, remapLocation, stableId, wrapLabel, writePreset,
} from '../scripts/build-companion-preset.mjs'
import { audit } from '../scripts/audit-companion-preset.mjs'
import { seedCrcDeck } from '../lib/companion-deck/seed.ts'

const plan = path.dirname(DEFAULTS.manifest)

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

// The audit is a thin CLI over lib/companion-deck/validate.ts and reads no raw export: it always runs.
test('generator output passes the deck audit and is byte-deterministic', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-preset-'))
  const manifest = JSON.parse(fs.readFileSync(DEFAULTS.manifest, 'utf8'))
  const a = path.join(dir, 'a.companionconfig'), b = path.join(dir, 'b.companionconfig')
  const { preset } = buildPreset(manifest)
  writePreset(a, preset)
  writePreset(b, buildPreset(manifest).preset)
  assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), 'two runs differ')
  for (const inst of Object.values(preset.instances)) assert.ok(!('config' in inst) && !('secrets' in inst))
  const { ok, findings, summary } = await audit({ preset: a })
  assert.deepEqual(findings.filter((f) => f.severity === 'error'), [])
  assert.ok(ok)
  assert.equal(summary.cueIdsBound, 235)
  assert.equal(summary.cueIdsBound, manifest.counts.uniqueCuesBound)
  assert.equal(summary.cueKeys, `${manifest.counts.bindings} (419 one-step, 20 camera gestures)`)
  assert.equal(manifest.counts.bindings, 439)

  // The three corner cards are one-step toggle_cue keys at their manifest cells, and the audit refuses a
  // bound cue that the snapshot does not list as published, naming each button.
  const CORNER = ['44ae41a4-8280-44ac-b016-b0cc81e0584f', 'b06f734d-99e4-46a9-84cd-29f17083f8dc', 'd39673be-de53-4e3d-b450-4fa6ecb9a1cf']
  const cornerCells = manifest.bindings.filter((x) => CORNER.includes(x.cueId)).map((x) => `${x.page}/${x.cell}`)
  assert.deepEqual(cornerCells.sort(), ['1/r3c4', '15/r3c2', '15/r3c4', '16/r1c4', '23/r1c5', '8/r3c2', '8/r3c4', '9/r1c5'])
  for (const x of manifest.bindings.filter((y) => CORNER.includes(y.cueId))) {
    const [r, col] = parseCell(x.cell)
    const acts = preset.pages[String(x.page)].controls[r][col].steps['0'].action_sets.down
    assert.deepEqual(acts.map((act) => [act.definitionId, act.options.cue.value]), [['toggle_cue', x.cueId]])
  }
  const snapshot = JSON.parse(fs.readFileSync(path.join(plan, 'catalog-snapshot-2026-09-23.json'), 'utf8'))
  const noCorner = path.join(dir, 'snapshot-no-corner.json')
  fs.writeFileSync(noCorner, JSON.stringify({ ...snapshot, drafts: snapshot.drafts.filter((d) => d.id !== CORNER[0]) }))
  const unpublished = (await audit({ snapshot: noCorner })).findings.filter((f) => f.code === 'cue-unpublished')
  const want = manifest.bindings.filter((x) => x.cueId === CORNER[0]).map((x) => `${x.page}/${x.cell}`).sort()
  assert.deepEqual(unpublished.map((f) => `${f.page}/r${f.row}c${f.column}`).sort(), want)
  assert.ok(unpublished.every((f) => f.message.includes(`cue ${CORNER[0]}, which is not published`)))

  // A snapshot-era superseded name counts as retired.
  const renamed = path.join(dir, 'snapshot-superseded.json')
  fs.writeFileSync(renamed, JSON.stringify({ ...snapshot, drafts: snapshot.drafts.map((d) => (d.id === CORNER[1] ? { ...d, name: 'Psalm 96' } : d)) }))
  assert.ok((await audit({ snapshot: renamed })).findings.some((f) => f.code === 'cue-retired' && f.message.includes('"Psalm 96"')))

  // A preset file that is not what the deck renders is refused.
  const broken = structuredClone(preset)
  delete broken.pages['5'].controls['2']['7']
  const c = path.join(dir, 'c.companionconfig')
  writePreset(c, broken)
  assert.deepEqual((await audit({ preset: c })).findings.filter((f) => f.severity === 'error').map((f) => f.code), ['preset-differs'])

  // A stored deck file is audited the same way: credentials, a changed Bimah Mute, a label mismatch.
  const deck = seedCrcDeck(manifest, JSON.parse(fs.readFileSync(DEFAULTS.seed, 'utf8')))
  deck.pages.find((p) => p.number === 6).name = 'my token page'
  const mute = deck.pages.find((p) => p.number === 8).buttons.find((btn) => btn.row === 3 && btn.col === 7)
  mute.spec.text = 'Bimah\nmute 2'
  deck.connections.find((x) => x.label === 'Center').label = 'Centre'
  const deckFile = path.join(dir, 'deck.json')
  fs.writeFileSync(deckFile, JSON.stringify(deck))
  const result = await audit({ deck: deckFile })
  assert.ok(!result.ok)
  const codes = new Set(result.findings.filter((f) => f.severity === 'error').map((f) => f.code))
  for (const code of ['credential-text', 'fixed-cell-differs', 'connection-label-unknown']) assert.ok(codes.has(code), code)
  assert.ok(result.findings.some((f) => f.code === 'connection-label-unknown' && /uses the connection "Center"/.test(f.message)))
})
