import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONNECTION_REF, PAGE_TEMPLATES, PALETTE, WORKSPACE_COMPANION, stableId,
  type CompanionDeck, type DeckButton, type DeckPage,
} from '../lib/companion-deck/model.ts'
import { renderDeck } from '../lib/companion-deck/render.ts'
import { seedCrcDeck, type CrcSeedData, type CueManifest } from '../lib/companion-deck/seed.ts'
import { catalogCueLookups, validateDeck, type CueLookups, type Finding, type ModuleDefinitions } from '../lib/companion-deck/validate.ts'

const root = path.resolve(import.meta.dirname, '..')
const plan = path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion')
const manifest = JSON.parse(fs.readFileSync(path.join(plan, 'CUE-MANIFEST.json'), 'utf8')) as CueManifest
const seedData = JSON.parse(fs.readFileSync(path.join(root, 'lib/companion-deck/crc-seed-data.json'), 'utf8')) as CrcSeedData
const definitions = JSON.parse(fs.readFileSync(path.join(root, 'companion/definitions.json'), 'utf8')) as ModuleDefinitions
const snapshot = JSON.parse(fs.readFileSync(path.join(plan, 'catalog-snapshot-2026-09-23.json'), 'utf8')) as { drafts: { id: string; name: string; archived: boolean; activeRevision: number }[] }

const everyCue: CueLookups = { isPublished: () => true, isRetired: () => false }
// Cloned: the seed shares gesture objects with the manifest, and these tests mutate decks.
const crc = () => structuredClone(seedCrcDeck(manifest, seedData))
const errors = (findings: Finding[]) => findings.filter((f) => f.severity === 'error')
const codes = (findings: Finding[]) => [...new Set(errors(findings).map((f) => f.code))].sort()

/** A minimal TBI deck on the provisional TBI template: Companion's built-in nav in column 0, cue keys beside it. */
function tbiDeck(): CompanionDeck {
  const cue = (row: number, col: number, cueId: string, label: string, page: number): DeckButton =>
    ({ row, col, spec: { kind: 'cue', cueId, label, role: 'single' }, ids: { ctx: `tbi/${page}/${row}/${col}`, base: 0 } })
  const nav = (): DeckButton[] => (['pageup', 'pagenum', 'pagedown'] as const).map((control, row) => ({ row, col: 0, spec: { kind: 'builtin', control } }))
  const page = (number: number, name: string, buttons: DeckButton[]): DeckPage => ({ number, id: stableId(`tbi-page:${number}`), name, template: 'service', buttons: [...nav(), ...buttons] })
  return {
    schema: 1, workspace: 'tbi',
    companion: { release: WORKSPACE_COMPANION.tbi.release, build: '5.0.5+test', exportVersion: WORKSPACE_COMPANION.tbi.exportVersion },
    palette: { ...PALETTE }, switcher: { mergeDurationMs: 1000, presetWaitMs: 1300 }, grid: { rows: 4, columns: 8 },
    chains: [],
    connections: [
      { id: 'TBIOVL', label: 'TBI_Overlays', moduleId: 'tbi-overlays', moduleVersionId: definitions.version, sortOrder: 0, updatePolicy: 'stable', lastUpgradeIndex: -1, role: 'overlays' },
      { id: 'BIRD', label: 'BirdDog', moduleId: 'birddog-ptz', moduleVersionId: '3.4.1', sortOrder: 1, updatePolicy: 'manual', lastUpgradeIndex: 6 },
    ],
    templates: structuredClone(PAGE_TEMPLATES.tbi),
    pages: [
      page(1, 'Shabbat 1', [
        cue(0, 1, 'tbi-lcha-1', "L'cha Dodi 1", 1), cue(1, 1, 'tbi-lcha-2', "L'cha Dodi 2", 1),
        { row: 3, col: 7, spec: { kind: 'fragment', fragment: 'ptz-preset-1', text: 'Cam\npreset 1' } },
      ]),
      page(2, 'Shabbat 2', [cue(0, 1, 'tbi-shalom-1', 'Shalom Aleichem 1', 2)]),
    ],
    fragments: {
      'ptz-preset-1': {
        kind: 'control', source: 'test', style: { set: {} }, options: {}, feedbacks: [], localVariables: [],
        steps: { 0: { action_sets: { down: [{ type: 'action', id: 'p1', definitionId: 'recallPset', connectionId: `${CONNECTION_REF}BirdDog`, options: { val: { value: 1, isExpression: false } }, upgradeIndex: 6 }], up: [] }, options: { runWhileHeld: [] } } },
      },
    },
    triggers: {}, customVariables: {},
  }
}

/* ------------------------------------------------------------ acceptance --- */

test("CRC's current preset (the C1 seed) passes, with the catalog snapshot's published and retired lookups", () => {
  const cues = catalogCueLookups(snapshot.drafts)
  const { ok, findings, summary, exported } = validateDeck(crc(), { module: definitions, cues })
  assert.deepEqual(errors(findings), [])
  assert.ok(ok)
  assert.equal(summary.cueIdsBound, 235)
  assert.equal(summary.cueKeys, '439 (419 one-step, 20 camera gestures)')
  assert.equal(summary.buttons, 1460)
  assert.equal(summary.companion, '5.0.3 (export v12)')
  assert.ok(exported && Object.keys(exported.pages).length === 56)
  // Carried booth buttons that fire a cue without the lights are surfaced, not failed.
  assert.ok(findings.filter((f) => f.code === 'cue-action-outside-cue-key').every((f) => f.severity === 'warning' && f.page! >= 31))
  assert.ok(findings.some((f) => f.code === 'upgrade-skipped' && f.severity === 'info'))
})

test('a TBI deck with Companion built-in nav passes on the TBI template', () => {
  const deck = tbiDeck()
  const { ok, findings, exported } = validateDeck(deck, { module: definitions, cues: everyCue })
  assert.deepEqual(errors(findings), [])
  assert.ok(ok)
  const controls = (exported!.pages['1'] as { controls: Record<string, Record<string, unknown>> }).controls
  assert.deepEqual(controls['0']['0'], { type: 'pageup' })
  assert.deepEqual(controls['2']['0'], { type: 'pagedown' })
  assert.deepEqual(Object.keys(exported!.instances).sort(), ['BIRD', 'TBIOVL'])
})

test('built-in nav is refused where the template does not allow it', () => {
  const deck = crc()
  deck.pages.find((p) => p.number === 27)!.buttons.push({ row: 0, col: 0, spec: { kind: 'builtin', control: 'pageup' } })
  const f = errors(validateDeck(deck, { module: definitions, cues: everyCue }).findings)
  assert.deepEqual(f.filter((x) => x.code !== 'page-unreachable').map((x) => [x.code, x.page, x.row, x.column]), [['builtin-nav-not-allowed', 27, 0, 0]])
  assert.match(f.find((x) => x.code === 'builtin-nav-not-allowed')!.message, /built-in pageup button, which the "spare" page template does not allow/)
})

test('a connection-label mismatch fails with the exact button and label', () => {
  const deck = crc()
  const gestured = deck.pages.flatMap((p) => p.buttons.map((b) => ({ p, b }))).find(({ b }) => b.spec.kind === 'cue' && b.spec.gesture?.in?.conn === 'Left')!
  if (gestured.b.spec.kind !== 'cue') throw new Error('unreachable')
  gestured.b.spec.gesture!.in!.conn = 'left'
  const { ok, findings } = validateDeck(deck, { module: definitions, cues: everyCue })
  assert.ok(!ok)
  const f = errors(findings).filter((x) => x.code === 'connection-label-unknown')
  assert.equal(f.length, 1)
  assert.deepEqual([f[0].page, f[0].row, f[0].column], [gestured.p.number, gestured.b.row, gestured.b.col])
  assert.match(f[0].message, new RegExp(`^Page ${gestured.p.number} ".+", row ${gestured.b.row} column ${gestured.b.col} \\(".+"\\) uses the connection "left", but the deck has no connection labelled exactly that\\.`))
  assert.match(f[0].message, /first connection of the same module, silently\. Did you mean "Left"\?$/)
  // The button is explained once: no separate render failure for it.
  assert.ok(!errors(findings).some((x) => x.code === 'render-failed'))
})

test('a device fragment naming a connection label that is not in the registry fails at every button that uses it', () => {
  const deck = crc()
  const mute = JSON.stringify(deck.fragments['bimah-mute']).split(`${CONNECTION_REF}x32"`).join(`${CONNECTION_REF}X32"`)
  deck.fragments['bimah-mute'] = JSON.parse(mute)
  const f = errors(validateDeck(deck, { module: definitions, cues: everyCue }).findings)
  const users = deck.pages.flatMap((p) => p.buttons.filter((b) => b.spec.kind === 'fragment' && b.spec.fragment === 'bimah-mute').map((b) => `${p.number}/${b.row}/${b.col}`))
  assert.ok(users.length > 20)
  const labelled = f.filter((x) => x.code === 'connection-label-unknown')
  assert.deepEqual(labelled.map((x) => `${x.page}/${x.row}/${x.column}`).sort(), [...new Set(users)].sort())
  assert.ok(labelled.every((x) => /uses the connection "X32".*Did you mean "x32"\?/.test(x.message)))
})

test('a binding to an unpublished or retired cue fails with the button and cue', () => {
  const deck = crc()
  const [first, second] = manifest.bindings
  const cues: CueLookups = {
    isPublished: (id) => id !== first.cueId,
    isRetired: (id) => id === second.cueId,
    name: (id) => (id === second.cueId ? 'Old Kiddush' : undefined),
  }
  const f = errors(validateDeck(deck, { module: definitions, cues }).findings)
  const cellOf = (b: typeof first) => { const m = /^r(\d)c(\d)$/.exec(b.cell)!; return [b.page, Number(m[1]), Number(m[2])] }
  const unpublished = f.filter((x) => x.code === 'cue-unpublished')
  const retired = f.filter((x) => x.code === 'cue-retired')
  const cellsFor = (id: string) => manifest.bindings.filter((b) => b.cueId === id).map(cellOf)
  assert.deepEqual(unpublished.map((x) => [x.page, x.row, x.column]), cellsFor(first.cueId))
  assert.deepEqual(retired.map((x) => [x.page, x.row, x.column]), cellsFor(second.cueId))
  assert.match(unpublished[0].message, new RegExp(`is bound to cue ${first.cueId}, which is not published\\. Publish it or bind a published cue\\.$`))
  assert.match(retired[0].message, new RegExp(`is bound to cue "Old Kiddush" \\(${second.cueId}\\), which has been retired\\.`))
  assert.deepEqual(codes(f), ['cue-retired', 'cue-unpublished'])
})

test('findings are {severity, page, row, column, code, message} with plain sentences', () => {
  const deck = crc()
  deck.chains[0] = [4, 5, 7, 6, 8, 9]
  const { findings } = validateDeck(deck, { module: definitions, cues: { isPublished: () => false, isRetired: () => false } })
  assert.ok(findings.length > 0)
  for (const f of findings) {
    assert.deepEqual(Object.keys(f), ['severity', 'page', 'row', 'column', 'code', 'message'])
    assert.ok(['error', 'warning', 'info'].includes(f.severity))
    assert.match(f.message, /^[A-Z][^]*[.?]$/, f.message)
    assert.doesNotMatch(f.message, /undefined|\[object/)
  }
})

/* ----------------------------------------------------------------- rules --- */

test('template rules: chains, fixed cells, gestures', () => {
  const deck = crc()
  deck.chains[0] = [4, 5, 7, 6, 8, 9] // pages keep their rendered Next keys, so the chain no longer matches
  const page10 = deck.pages.find((p) => p.number === 10)!
  const clear = page10.buttons.find((b) => b.row === 1 && b.col === 6)!
  clear.spec = { kind: 'module', text: 'Clear\nnow', bg: PALETTE.darkRed, action: 'animate_clear' }
  const page12 = deck.pages.find((p) => p.number === 12)!
  const merge = page12.buttons.find((b) => b.row === 3 && b.col === 0)!
  page12.buttons.splice(page12.buttons.indexOf(merge), 1)
  const gesture = deck.pages.flatMap((p) => p.buttons.map((b) => ({ p, b }))).find(({ b }) => b.spec.kind === 'cue' && b.spec.gesture?.out)!
  if (gesture.b.spec.kind !== 'cue') throw new Error('unreachable')
  gesture.b.spec.gesture!.out!.input = 'left cam 2'
  const utility = deck.pages.find((p) => p.number === 2)!
  utility.buttons.push({ row: 3, col: 5, spec: { kind: 'cue', cueId: manifest.bindings[0].cueId, label: 'x', role: 'single', gesture: { in: null, out: { conn: null, preset: null, input: 'center cam 1' } } }, ids: { ctx: 'test', base: 0 } })
  const f = errors(validateDeck(deck, { module: definitions, cues: everyCue }).findings)
  const has = (code: string, page: number, row?: number, column?: number) =>
    assert.ok(f.some((x) => x.code === code && x.page === page && (row == null || (x.row === row && x.column === column))), `${code} on ${page}`)
  has('chain-nav-wrong', 5, 2, 7)
  has('chain-walk', 4)
  has('fixed-cell-wrong', 10, 1, 6)
  has('fixed-cell-missing', 12, 3, 0)
  has('gesture-return', gesture.p.number, gesture.b.row, gesture.b.col)
  has('gesture-not-allowed', 2, 3, 5)
})

test('fixed keys must be the same on every page of a template', () => {
  const deck = crc()
  const bimah = deck.pages.find((p) => p.number === 9)!.buttons.find((b) => b.row === 3 && b.col === 7)!
  if (bimah.spec.kind !== 'fragment') throw new Error('expected the Bimah Mute fragment')
  bimah.spec.bg = PALETTE.black
  const f = errors(validateDeck(deck, { module: definitions, cues: everyCue }).findings)
  assert.deepEqual(f.map((x) => [x.code, x.page, x.row, x.column]), [['fixed-cell-differs', 9, 3, 7]])
  assert.match(f[0].message, /differs from the same bimah-mute key on page 3/)
})

test('module rules: definitions from the JSON manifest, options, excluded definitions, version', () => {
  const deck = crc()
  const noToggle: ModuleDefinitions = structuredClone(definitions)
  delete noToggle.actions.toggle_cue
  const f1 = errors(validateDeck(deck, { module: noToggle, cues: everyCue }).findings)
  assert.equal(f1.filter((x) => x.code === 'module-definition-unknown').length, 419)
  assert.match(f1[0].message, /uses the Overlays action "toggle_cue", which module 1\.7\.0 does not define\./)

  deck.pages.find((p) => p.number === 27)!.buttons.push({ row: 0, col: 0, spec: { kind: 'module', text: 'Next', bg: 0, action: 'next_panel' }, ids: { ctx: 'n', base: 0 } })
  deck.connections.find((c) => c.role === 'overlays')!.moduleVersionId = '1.6.0'
  assert.deepEqual(codes(validateDeck(deck, { module: definitions, cues: everyCue }).findings), ['module-definition-excluded', 'module-version', 'page-unreachable'])
  const tbiWrongModule = tbiDeck()
  tbiWrongModule.connections[0].moduleId = 'crc-overlays'
  assert.deepEqual(codes(validateDeck(tbiWrongModule, { module: definitions, cues: everyCue }).findings), ['module-id'])
})

test('registry rules: duplicate and non-Companion labels, the booth registry, credentials', () => {
  const deck = tbiDeck()
  deck.connections.push({ ...deck.connections[1], id: 'BIRD2' })
  deck.connections.push({ id: 'X', label: 'Door Cam', moduleId: 'birddog-ptz', moduleVersionId: '1', sortOrder: 9, updatePolicy: 'manual', lastUpgradeIndex: 0 })
  deck.pages[1].name = 'Shabbat token page'
  const f = errors(validateDeck(deck, { module: definitions, cues: everyCue, boothConnections: [{ label: 'TBI_Overlays', moduleId: 'tbi-overlays' }, { label: 'BirdDog', moduleId: 'obs-studio' }] }).findings)
  assert.deepEqual(codes(f), ['connection-label-duplicate', 'connection-label-invalid', 'connection-not-at-booth', 'credential-text'])
  assert.match(f.find((x) => x.code === 'connection-not-at-booth')!.message, /The booth's connection "BirdDog" is a obs-studio, but the deck expects a birddog-ptz \(first used by Page 1 "Shabbat 1", row 3 column 7 \("Cam preset 1"\)\)\./)
  const leaky = tbiDeck() as unknown as { connections: Record<string, unknown>[] }
  leaky.connections[1].config = { host: '10.0.0.1' }
  assert.deepEqual(codes(validateDeck(leaky as unknown as CompanionDeck, { module: definitions, cues: everyCue }).findings), ['credential-key'])
})

test('navigation rules: jump targets, reachability', () => {
  const deck = crc()
  const home = deck.pages.find((p) => p.number === 1)!
  const toSpare = home.buttons.find((b) => b.spec.kind === 'jump' && b.spec.page === 26)!
  if (toSpare.spec.kind !== 'jump') throw new Error('unreachable')
  toSpare.spec.page = 28
  const f = errors(validateDeck(deck, { module: definitions, cues: everyCue }).findings)
  assert.ok(f.some((x) => x.code === 'nav-target-missing' && x.page === 1 && /jumps to page 28, which has no buttons\./.test(x.message)))
  assert.ok(f.some((x) => x.code === 'page-unreachable' && x.page === 26))
  // A TBI page with no nav at all is unreachable unless a reachable page steps through with built-in nav.
  const tbi = tbiDeck()
  tbi.pages[0].buttons = tbi.pages[0].buttons.filter((b) => b.spec.kind !== 'builtin')
  tbi.pages[1].buttons = tbi.pages[1].buttons.filter((b) => b.spec.kind !== 'builtin')
  const navless = errors(validateDeck(tbi, { module: definitions, cues: everyCue }).findings)
  assert.deepEqual(navless.filter((x) => x.code !== 'fixed-cell-missing').map((x) => [x.code, x.page]), [['page-unreachable', 2]])
  // TBI's page templates (C4) fix the built-in nav column, so each missing nav button is named too.
  assert.deepEqual(navless.filter((x) => x.code === 'fixed-cell-missing').map((x) => `${x.page}/${x.row}/${x.column}`).sort(), ['1/0/0', '1/1/0', '1/2/0', '2/0/0', '2/1/0', '2/2/0'])
})

test("upgrade check runs only against the deck's recorded Companion build", () => {
  const deck = tbiDeck()
  const other = validateDeck(deck, { module: definitions, cues: everyCue, upgrade: { release: '5.0.3', upgradeImport: (x) => x } })
  assert.ok(other.ok)
  assert.match(other.findings.find((f) => f.code === 'upgrade-skipped')!.message, /bundle available is for 5\.0\.3, and this deck targets 5\.0\.5\./)
  const same = validateDeck(deck, { module: definitions, cues: everyCue, upgrade: { release: '5.0.5', upgradeImport: (x) => ({ ...(x as object), version: 16 }) } })
  assert.ok(same.ok)
  assert.equal(same.summary.companionUpgrade, 'v12→v16, 10/10 controls unchanged')
  const changing = validateDeck(deck, {
    module: definitions, cues: everyCue,
    upgrade: { release: '5.0.5', upgradeImport: (x) => { const y = structuredClone(x) as ReturnType<typeof renderDeck>; (y.pages['2'] as { controls: Record<string, Record<string, unknown>> }).controls['0']['1'] = { type: 'button' }; return y } },
  })
  assert.deepEqual(codes(changing.findings), ['upgrade-changes-controls'])
  assert.match(changing.findings[0].message, /changes 1 buttons \(first: 2\/0\/1\)/)
})

test('catalogCueLookups: published is an active revision and not archived; retirement from the row or a rule', () => {
  const lookups = catalogCueLookups([
    { id: 'a', name: 'A', activeRevision: 2, archived: false },
    { id: 'b', name: 'B', activeRevision: 0, archived: false },
    { id: 'c', name: 'C', activeRevision: 3, archived: true },
    { id: 'd', name: 'D', activeRevision: 1, retired: true },
    { id: 'e', name: 'Copy of Thank you', activeRevision: 1 },
  ], (d) => d.name === 'Copy of Thank you')
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'z'].map(lookups.isPublished), [true, false, false, true, true, false])
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'z'].map(lookups.isRetired), [false, false, false, true, true, false])
  assert.equal(lookups.name!('a'), 'A')
})
