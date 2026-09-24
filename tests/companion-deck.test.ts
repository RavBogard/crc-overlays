import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  CONNECTION_REF, PAGE_TEMPLATES, PALETTE, WORKSPACE_COMPANION, assertSanitized, chainNeighbours, roleColour, stableId,
  type CompanionDeck, type DeckButton,
} from '../lib/companion-deck/model.ts'
import { encodeCompanionConfig, expandStyle, renderButton, renderDeck, resolveConnections, templateLayers } from '../lib/companion-deck/render.ts'
import { CHAINS, buildCrcDeck, seedCrcDeck, type CrcSeedData, type CueManifest } from '../lib/companion-deck/seed.ts'
import { DeckConflictError, MemoryCompanionDeckRepository } from '../lib/companion-deck/repository.ts'

const root = path.resolve(import.meta.dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion/CUE-MANIFEST.json'), 'utf8')) as CueManifest
const seedFile = path.join(root, 'lib/companion-deck/crc-seed-data.json')
const seedText = fs.readFileSync(seedFile, 'utf8')
const seedData = JSON.parse(seedText) as CrcSeedData

// The preset released to Michael on 2026-09-23 (crc-coordination/releases/2026-09-23-michael/fresh-preset/,
// MANIFEST.md): the gzip file and the JSON inside it.
const RELEASED_SHA256 = 'bfc718e1b74fc5224da3e32e2db459f7b43ea5fca8bd5e2ef2320942713a1113'
const RELEASED_JSON_SHA256 = '52d1da91e481e06767472e700bebf0e5a0923094eac65d5597b09e53bd232efd'
const sha256 = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex')

/** A small deck for renderer tests. */
function miniDeck(buttons: DeckButton[] = [], extra: Partial<CompanionDeck> = {}): CompanionDeck {
  return {
    schema: 1, workspace: 'crc', companion: { release: '5.0.3', build: '5.0.3+test', exportVersion: 12 },
    palette: { ...PALETTE }, switcher: { mergeDurationMs: 1000, presetWaitMs: 1300 }, grid: { rows: 4, columns: 8 },
    chains: [[4, 5]],
    connections: [
      { id: 'OVL', label: 'Overlays', moduleId: 'crc-overlays', moduleVersionId: '1.7.0', sortOrder: 7, updatePolicy: 'stable', lastUpgradeIndex: -1, role: 'overlays' },
      { id: 'VMX', label: 'vmix', moduleId: 'studiocoast-vmix', moduleVersionId: '4.1.1', sortOrder: 6, updatePolicy: 'stable', lastUpgradeIndex: 13, role: 'switcher' },
      { id: 'CAM', label: 'Door_Cam__steve_', moduleId: 'birddog-ptz', moduleVersionId: '3.4.1', sortOrder: 2, updatePolicy: 'manual', lastUpgradeIndex: 6 },
      { id: 'UNUSED', label: 'reaper', moduleId: 'cockos-reaper', moduleVersionId: '2.4.1', sortOrder: 4, updatePolicy: 'stable', lastUpgradeIndex: 1 },
    ],
    templates: PAGE_TEMPLATES.crc,
    pages: [{ number: 1, id: stableId('page:1'), name: 'Home', template: 'utility', buttons }],
    fragments: {
      'camera-tally': { kind: 'entities', source: 'test', entities: [{ type: 'feedback', id: 'x', definitionId: 'inputLive', connectionId: `${CONNECTION_REF}vmix`, options: { input: { value: '0', isExpression: false } } }] },
      'cam-toggle': { kind: 'entities', source: 'test', entities: [{ type: 'action', id: 'y', definitionId: 'instance_control', connectionId: 'internal', options: { instance_id: { isExpression: false, value: `${CONNECTION_REF}Door_Cam__steve_` } } }] },
    },
    triggers: {}, customVariables: {},
    ...extra,
  }
}
const at = (row: number, col: number, spec: DeckButton['spec'], ctx = `t/${row}/${col}`): DeckButton => ({ row, col, spec, ids: { ctx, base: 0 } })
type Ctrl = { style: { layers: { type: string; text?: { value: unknown }; color: { value: unknown } }[] }; feedbacks: { definitionId: string; id: string }[]; steps: Record<string, { action_sets: { down: { definitionId: string; connectionId: string; id: string; options: Record<string, { value: unknown }> }[] } }> }
const layer = (ctrl: Ctrl, type: string) => ctrl.style.layers.find((l) => l.type === type)!

/* ---------------------------------------------------------------- model --- */

test('model helpers: role colours, chains, the recorded Companion build per workspace', () => {
  assert.equal(roleColour(PALETTE, { role: 'utility' }), PALETTE.navy)
  assert.equal(roleColour(PALETTE, { role: 'sequence-part' }), PALETTE.teal)
  assert.equal(roleColour(PALETTE, { role: 'alternate', sequence: { name: 'x', index: 1, count: 2 } }), PALETTE.teal)
  assert.equal(roleColour(PALETTE, { role: 'alternate' }), PALETTE.burgundy)
  assert.equal(roleColour(PALETTE, { role: 'single' }), PALETTE.burgundy)
  assert.deepEqual(chainNeighbours(CHAINS, 10), { prev: 1, next: 11 })
  assert.equal(chainNeighbours(CHAINS, 26), null)
  assert.equal(WORKSPACE_COMPANION.crc.release, '5.0.3')
  assert.equal(WORKSPACE_COMPANION.tbi.release, '5.0.5')
  assert.ok(PAGE_TEMPLATES.tbi.service.builtInNav)
  assert.ok(!PAGE_TEMPLATES.crc.service.builtInNav)
})

test('assertSanitized refuses connection config, secrets and credential-looking keys', () => {
  assert.throws(() => assertSanitized({ connections: [{ id: 'a', config: {} }] }), /config must never be stored/)
  assert.throws(() => assertSanitized({ x: [{ secrets: {} }] }), /secrets must never be stored/)
  assert.throws(() => assertSanitized({ apiKey: 'x' }), /credential-looking/)
  assert.doesNotThrow(() => assertSanitized({ label: 'vmix', options: { cue: 'x' } }))
})

/* ------------------------------------------------------------- renderer --- */

test('built-in template: a plain jump is the layered button with the colour and text set', () => {
  const ctrl = renderButton(miniDeck(), at(1, 7, { kind: 'jump', text: 'Home', page: 1 })) as unknown as Ctrl
  assert.deepEqual(Object.keys(ctrl), ['type', 'style', 'options', 'feedbacks', 'steps', 'localVariables'])
  assert.deepEqual(ctrl.style.layers.map((l) => l.type), ['canvas', 'box', 'image', 'text'])
  assert.equal(layer(ctrl, 'text').text!.value, 'Home')
  assert.equal(layer(ctrl, 'box').color.value, PALETTE.black)
  const act = ctrl.steps['0'].action_sets.down[0]
  assert.equal(act.definitionId, 'set_page')
  assert.equal(act.options.page.value, 1)
  assert.equal(act.id, stableId('t/1/7#0'), 'entity ids come from the button seed')
})

test('cue keys: one-step toggle, or the two-step camera gesture resolved by connection label', () => {
  const deck = miniDeck()
  const one = renderButton(deck, at(0, 1, { kind: 'cue', cueId: 'c1', label: 'Mi Chamocha 1/2', role: 'sequence-part' })) as unknown as Ctrl
  assert.deepEqual(one.feedbacks.map((f) => f.definitionId), ['requested', 'rendered', 'disconnected'])
  assert.deepEqual(Object.values(one.steps).map((s) => s.action_sets.down.map((a) => a.definitionId)), [['toggle_cue']])
  assert.equal(layer(one, 'text').text!.value, 'Mi\nChamocha 1/2')
  assert.equal(layer(one, 'box').color.value, PALETTE.teal)

  const two = renderButton(deck, at(0, 2, {
    kind: 'cue', cueId: 'c2', label: 'Candles', role: 'single',
    gesture: { in: { conn: 'Door_Cam (steve)', preset: 3, input: 'right cam 3' }, out: { conn: null, preset: null, input: 'center cam 1' } },
  })) as unknown as Ctrl
  const steps = Object.values(two.steps).map((s) => s.action_sets.down)
  assert.deepEqual(steps.map((d) => d.map((a) => a.definitionId)), [['show_cue', 'recallPset', 'wait', 'command'], ['animate_out', 'command']])
  assert.equal(steps[0][1].connectionId, 'CAM')
  assert.equal(steps[0][2].options.time.value, 1300)
  assert.equal(steps[0][3].options.command.value, 'merge input=right cam 3&duration=1000')
  assert.equal(two.feedbacks[0].definitionId, 'bank_current_step')
  assert.throws(() => renderButton(deck, at(0, 3, { kind: 'cue', cueId: 'c', label: 'x', role: 'single', gesture: { in: { conn: 'Nope', preset: 1, input: 'x' }, out: null } })), /connection Nope is not in the deck/)
})

test('camera keys re-id the tally fragment; label references resolve to connection ids', () => {
  const deck = miniDeck()
  const a = renderButton(deck, at(0, 0, { kind: 'camera', text: 'Center', input: 'center cam 1', tally: 1 })) as unknown as Ctrl
  const b = renderButton(deck, at(1, 0, { kind: 'camera', text: 'Left', input: 'left cam 2', tally: 2 })) as unknown as Ctrl
  assert.notEqual(a.feedbacks[0].id, b.feedbacks[0].id)
  assert.equal((a.feedbacks[0] as unknown as { connectionId: string }).connectionId, 'VMX')
  const resolved = resolveConnections(deck.fragments['cam-toggle'], deck) as unknown as { entities: { options: { instance_id: { value: string } } }[] }
  assert.equal(resolved.entities[0].options.instance_id.value, 'CAM')
  assert.deepEqual(Object.keys(resolved.entities[0].options.instance_id), ['isExpression', 'value'], 'option key order is kept')
})

test('fragment styles: overrides apply only to template keys', () => {
  const layers = expandStyle({ set: { 'text0.fontsize': { value: 44, isExpression: false } } }).layers as { id: string; fontsize?: { value: number } }[]
  assert.equal(layers.find((l) => l.id === 'text0')!.fontsize!.value, 44)
  assert.equal(layers.length, templateLayers().length)
  assert.throws(() => expandStyle({ set: { 'text0.nope': 1 } }), /not a template key/)
})

test('renderDeck: stubs only for referenced connections, grid and placement are enforced', () => {
  const deck = miniDeck([at(0, 0, { kind: 'module', text: 'Clear', bg: PALETTE.darkRed, action: 'clear_now' }), at(3, 0, { kind: 'merge' })])
  const out = renderDeck(deck)
  assert.deepEqual(Object.keys(out.instances), ['OVL', 'VMX'])
  for (const inst of Object.values(out.instances)) assert.ok(!('config' in inst) && !('secrets' in inst))
  assert.equal(out.instances.OVL.enabled, false)
  assert.equal(out.companionBuild, '5.0.3+test')
  assert.throws(() => renderDeck(miniDeck([at(0, 0, { kind: 'merge' }), at(0, 0, { kind: 'merge' })])), /assigned twice/)
  assert.throws(() => renderDeck(miniDeck([at(4, 0, { kind: 'merge' })])), /outside the grid/)
  assert.throws(() => renderDeck(miniDeck([at(0, 0, { kind: 'fragment', fragment: 'missing' })])), /fragment missing is not in the deck/)
  assert.throws(() => renderButton(miniDeck(), { row: 0, col: 0, spec: { kind: 'merge' } }), /needs an id seed/)
})

test('id seeds are per button: adding a button leaves every other control unchanged', () => {
  const deck = seedCrcDeck(manifest, seedData)
  const before = renderDeck(deck)
  const spare = deck.pages.find((p) => p.number === 27)!
  spare.buttons.push(at(0, 0, { kind: 'jump', text: 'Home', page: 1 }, 'new-button'))
  const after = renderDeck(deck)
  for (const [n, page] of Object.entries(before.pages)) {
    if (n === '27') continue
    assert.equal(JSON.stringify(after.pages[n]), JSON.stringify(page), `page ${n} changed`)
  }
})

/* ------------------------------------------------------------------ seed --- */

test('renderDeck(seed) reproduces the released CRC preset byte for byte', () => {
  const exported = renderDeck(seedCrcDeck(manifest, seedData))
  assert.equal(sha256(JSON.stringify(exported)), RELEASED_JSON_SHA256)
  assert.equal(sha256(encodeCompanionConfig(exported)), RELEASED_SHA256)
  assert.equal(seedData.source.sha256, RELEASED_SHA256)
  const released = process.env.COMPANION_RELEASED_PRESET
  if (released && fs.existsSync(released)) assert.ok(fs.readFileSync(released).equals(encodeCompanionConfig(exported)))
})

test('the CRC seed: 56 pages on named templates, 439 cue bindings, CRC build recorded', () => {
  const { deck } = buildCrcDeck(manifest, seedData)
  assert.equal(deck.pages.length, 56)
  assert.equal(deck.companion.release, '5.0.3')
  assert.match(deck.companion.build, /^5\.0\.3\+/)
  for (const page of deck.pages) assert.ok(deck.templates[page.template], `page ${page.number} template ${page.template}`)
  assert.deepEqual([...new Set(deck.pages.filter((p) => p.number >= 3 && p.number <= 26).map((p) => p.template))], ['service'])
  assert.deepEqual([...new Set(deck.pages.filter((p) => p.number >= 31).map((p) => p.template))], ['carried'])
  const cues = deck.pages.flatMap((p) => p.buttons).filter((b) => b.spec.kind === 'cue')
  assert.equal(cues.length, 439)
  assert.equal(cues.filter((b) => b.spec.kind === 'cue' && b.spec.gesture).length, 20)
  // The built-in template, not a page-76 clone: no generated button is a fragment of the export.
  const kinds = new Set(deck.pages.flatMap((p) => p.buttons).map((b) => b.spec.kind))
  assert.deepEqual([...kinds].sort(), ['actions', 'camera', 'cue', 'fragment', 'jump', 'merge', 'module'])
})

/* ---------------------------------------------------------- sanitization --- */

test('seed data and its output hold no connection config or secrets', () => {
  assertSanitized(seedData, 'seed data')
  const exported = renderDeck(seedCrcDeck(manifest, seedData))
  for (const inst of Object.values(exported.instances)) {
    assert.deepEqual(Object.keys(inst), ['moduleInstanceType', 'moduleId', 'moduleVersionId', 'label', 'enabled', 'sortOrder', 'updatePolicy', 'lastUpgradeIndex', 'isFirstInit'])
  }
  assert.deepEqual(exported.surfaceInstances, {})
  // Fragments and triggers name connections by label: a raw connection id appears only in the stub list.
  const withoutConnections = JSON.stringify({ ...seedData, connections: [] })
  for (const c of seedData.connections) assert.ok(!withoutConnections.includes(c.id), `connection ${c.label} id outside the stubs`)
})

test("no value from the raw export's connection config/secrets appears in the seed beyond the released preset", (t) => {
  const raw = process.env.COMPANION_SOURCE_EXPORT || path.join(root, 'work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig')
  const releasedFile = process.env.COMPANION_RELEASED_PRESET
  if (!fs.existsSync(raw) || !releasedFile || !fs.existsSync(releasedFile)) { t.skip('raw export or released preset not present (work/ is gitignored)'); return }
  // Held in memory only; nothing from config or secrets is printed, even on failure.
  const bytes = fs.readFileSync(raw)
  const data = JSON.parse((bytes[0] === 0x1f ? zlib.gunzipSync(bytes) : bytes).toString('utf8')) as Record<string, Record<string, Record<string, unknown>>>
  const values = new Set<string>()
  const collect = (v: unknown) => {
    if (typeof v === 'string' && v.length >= 6) values.add(v)
    else if (v && typeof v === 'object') Object.values(v).forEach(collect)
  }
  for (const group of ['instances', 'surfaceInstances']) {
    for (const inst of Object.values(data[group] ?? {})) { collect(inst?.config); collect(inst?.secrets) }
  }
  assert.ok(values.size > 0, 'expected the raw export to carry connection config')
  const releasedText = zlib.gunzipSync(fs.readFileSync(releasedFile)).toString('utf8')
  let leaked = 0
  for (const v of values) {
    const quoted = JSON.stringify(v).slice(1, -1)
    if (seedText.includes(quoted) && !releasedText.includes(quoted)) leaked++
  }
  assert.equal(leaked, 0, `${leaked} connection config/secret values appear in the seed data but not in the released preset`)
})

/* ------------------------------------------------------------ repository --- */

test('deck repository: optimistic version, workspace match, sanitized connections', async () => {
  const repo = new MemoryCompanionDeckRepository()
  const deck = miniDeck()
  assert.equal(await repo.get('crc'), null)
  const created = await repo.create('crc', deck, 'daniel', 100)
  assert.equal(created.version, 1)
  await assert.rejects(repo.create('crc', deck, 'daniel', 101), DeckConflictError)
  const renamed = { ...deck, pages: [{ ...deck.pages[0], name: 'Home 2' }] }
  const v2 = await repo.replace('crc', renamed, 1, 'michael', 200)
  assert.equal(v2.version, 2)
  assert.equal(v2.createdBy, 'daniel')
  assert.equal(v2.updatedBy, 'michael')
  await assert.rejects(repo.replace('crc', deck, 1, 'simone', 300), (e: Error) => e instanceof DeckConflictError && /Read it again/.test(e.message))
  assert.equal((await repo.get('crc'))!.deck.pages[0].name, 'Home 2')
  await assert.rejects(repo.create('tbi', deck, 'simone', 1), /a crc deck cannot be stored for tbi/)
  const leaky = { ...deck, connections: [{ ...deck.connections[0], config: { host: 'x' } }] } as unknown as CompanionDeck
  await assert.rejects(repo.replace('crc', leaky, 2, 'daniel', 400), /config must never be stored/)
  const stored = (await repo.get('crc'))!
  stored.deck.pages[0].name = 'mutated'
  assert.equal((await repo.get('crc'))!.deck.pages[0].name, 'Home 2', 'reads are copies')
})
