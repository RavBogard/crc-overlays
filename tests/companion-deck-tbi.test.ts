import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { PAGE_TEMPLATES, PALETTE, stableId, type CompanionDeck, type DeckButton } from '../lib/companion-deck/model.ts'
import { renderDeck } from '../lib/companion-deck/render.ts'
import { MemoryCompanionDeckRepository } from '../lib/companion-deck/repository.ts'
import {
  TBI_OVERLAYS_CONNECTION, deriveExportSeedData, formatExportSeedData, readCompanionExport, seedTbiDeck, type ExportSeedData,
} from '../lib/companion-deck/tbi-seed.ts'
import {
  DeckConversionError, applyConversion, convertSingularDeck, deckConversionOperation, prayersNamed, type DeckConversionDeps,
} from '../lib/companion-deck/convert.ts'
import { catalogCueLookups, validateDeck, type ModuleDefinitions } from '../lib/companion-deck/validate.ts'
import type { Cue } from '../lib/player.ts'

const root = path.resolve(import.meta.dirname, '..')
const seedFile = path.join(root, 'lib/companion-deck/tbi-seed-data.json')
const seedText = fs.readFileSync(seedFile, 'utf8')
const seedData = JSON.parse(seedText) as ExportSeedData
// Checked against the module version the TBI deck asks for (companion/definitions/<version>.json), not the newest package.
const definitions = JSON.parse(fs.readFileSync(path.join(root, 'companion/definitions', `${TBI_OVERLAYS_CONNECTION.moduleVersionId}.json`), 'utf8')) as ModuleDefinitions
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/tbi-catalog-2026-09-15.json'), 'utf8')) as { cues: { id: string; name: string; layout: string | null; archived?: boolean }[] }
const cue = (id: string, name: string): Cue => ({ id, name, layout: 'bottom', texts: {}, animations: [], duration: {} })
const catalog = snapshot.cues.filter((c) => !c.archived).map((c) => cue(c.id, c.name))
const lookups = catalogCueLookups(snapshot.cues.map((c) => ({ id: c.id, name: c.name, archived: !!c.archived, activeRevision: 1 })))
const tbi = () => seedTbiDeck(seedData)
const errors = (d: CompanionDeck) => validateDeck(d, { module: definitions, cues: lookups }).findings.filter((f) => f.severity === 'error')
const RAW = process.env.TBI_SOURCE_EXPORT || path.join(root, 'work/companion-conversion/tbi-2026-09-14/TBIComputer-2026-09-14-1618-source.companionconfig')

/* ------------------------------------------------------------------- seed --- */

test("TBI seed keeps Simone's pages, positions and colours, her BirdDog and OBS buttons, and built-in nav", () => {
  const deck = tbi()
  assert.equal(deck.workspace, 'tbi')
  assert.equal(deck.companion.release, '5.0.5')
  assert.match(deck.companion.build, /^5\.0\.5\+/)
  assert.equal(deck.pages.length, 99)
  assert.deepEqual(deck.pages.filter((p) => p.template === 'service').map((p) => p.number), [1, 2, 3, 4, 5, 6, 8, 95, 96, 97, 98, 99])
  assert.ok(deck.pages.every((p) => ['pageup', 'pagenum', 'pagedown'].every((control, row) => p.buttons.some((b) => b.row === row && b.col === 0 && b.spec.kind === 'builtin' && b.spec.control === control))))
  const all = deck.pages.flatMap((p) => p.buttons.map((b) => ({ page: p.number, b })))
  assert.equal(all.filter((x) => x.b.singular).length, 254)
  const devices = all.filter((x) => x.b.spec.kind === 'fragment' && !x.b.singular)
  assert.deepEqual([devices.filter((x) => x.page === 1).length, devices.filter((x) => x.page === 8).length, devices.length], [20, 2, 22])
  // Connections: TBI_Overlays added, her camera and OBS kept by label, every Singular connection dropped.
  assert.deepEqual(deck.connections.map((c) => [c.label, c.moduleId, c.role ?? null]), [['TBI_Overlays', 'tbi-overlays', 'overlays'], ['obs', 'obs-studio', null], ['Birddog', 'birddog-ptz', null]])
  assert.equal(TBI_OVERLAYS_CONNECTION.moduleVersionId, definitions.version)
  assert.deepEqual(seedData.dropped.map((d) => d.label), ['kab', 'morn', 'singular__HHDs'])
  assert.equal(seedData.connectionSettingsDiscarded, 5)
  // Her label and colours on a graphic button, and what it fired.
  const lecha = deck.pages.find((p) => p.number === 2)!.buttons.find((b) => b.row === 0 && b.col === 3)!
  assert.deepEqual(lecha.singular, { in: { app: 'kab', comp: "L'cha Dodi 1" }, out: { app: 'kab', comp: "L'cha Dodi 1" } })
  const mizmor = convertSingularDeck(deck, { cues: [] }).rows.find((r) => r.id === '2/0/4')!
  assert.deepEqual([mizmor.label, mizmor.bg, mizmor.color], ['Mizmor Shir 1', 0xffff00, 0x000000])
  // Real TBI templates: built-in nav fixed in column 0, no chains, no gesture.
  for (const t of Object.values(PAGE_TEMPLATES.tbi)) {
    assert.ok(t.builtInNav && !t.chainNav && !t.gesture)
    assert.deepEqual(t.fixed.map((f) => `${f.row}/${f.col}:${f.role}`), ['0/0:page-up', '1/0:page-number', '2/0:page-down'])
  }
})

test('the TBI seed renders to a full export that passes C2 with built-in nav, and no Singular connection', () => {
  const deck = tbi()
  const result = validateDeck(deck, { module: definitions, cues: lookups })
  assert.deepEqual(result.findings.filter((f) => f.severity === 'error'), [])
  assert.ok(result.ok)
  const exported = renderDeck(deck)
  assert.equal(exported.companionBuild, deck.companion.build)
  assert.equal(Object.keys(exported.pages).length, 99)
  assert.deepEqual((exported.pages['5'].controls as Record<string, Record<string, unknown>>)['0']['0'], { type: 'pageup' })
  assert.deepEqual(Object.values(exported.instances).map((i) => i.label).sort(), ['Birddog', 'obs'])
  assert.ok(!JSON.stringify(exported).includes('singularlive'))
  // A carried BirdDog key fires its camera by the export's own connection id.
  const zoom = (exported.pages['1'].controls as Record<string, Record<string, { steps: Record<string, { action_sets: { down: { connectionId: string; definitionId: string }[] } }> }>>)['0']['2']
  assert.deepEqual(zoom.steps['0'].action_sets.down.map((a) => [a.connectionId, a.definitionId]), [['MYmbyCzG20RV089EPhqvx', 'zoom']])
})

test('the seed data file is exactly what the formatter writes', () => {
  assert.equal(seedText.replace(/\r\n/g, '\n'), formatExportSeedData(seedData))
})

/* ------------------------------------------------------------- conversion --- */

test("conversion of Simone's deck against the 15 September TBI catalog: counts and the known defects", () => {
  const { rows, summary } = convertSingularDeck(tbi(), { cues: catalog })
  assert.equal(summary.buttons, 254)
  assert.deepEqual(summary.byStatus, { covered: 192, 'needs-review': 46, 'needs-a-graphic': 16 })
  assert.equal(summary.compositions.total, 220)
  const row = (id: string) => rows.find((r) => r.id === id)!
  // Page 3 r0c5 animates in "Sing the song 159" but out "Twilight People 2".
  const p3 = row('3/0/5')
  assert.equal(p3.status, 'needs-review')
  assert.deepEqual(p3.defects.map((d) => d.code).sort(), ['in-out-mismatch', 'working-note-label'])
  assert.match(p3.defects.find((d) => d.code === 'in-out-mismatch')!.message, /"Sing the song 159" \(kab\) but the second press takes out "Twilight People 2" \(kab\)/)
  // Page 95 r3c5 "V'ne-emar" fires Aleinu 2.
  const p95 = row('95/3/5')
  assert.equal(p95.status, 'needs-review')
  assert.ok(p95.defects.some((d) => d.code === 'label-names-other-prayer' && /"V'ne-emar" names V'ne'emar, but the button fires "Aleinu 2"/.test(d.message)))
  assert.ok(p95.defects.some((d) => d.code === 'same-graphic-different-labels'))
  // Two buttons, one label, different graphics.
  assert.deepEqual(rows.filter((r) => r.defects.some((d) => d.code === 'duplicate-label')).map((r) => r.id), ['8/1/2', '8/1/4', '95/0/4', '95/1/2', '95/1/4', '95/2/2', '97/2/7', '97/3/7', '99/1/5', '99/2/5'])
  assert.ok(row('96/0/3').defects.some((d) => d.code === 'duplicate-button'))
  assert.equal(row('96/0/3').status, 'covered') // same graphic twice is a note, not a block
  // A plain match stays Covered and names its graphic; Amidah 3 firing Avot 2 is not a label mismatch.
  assert.equal(row('2/0/3').status, 'covered')
  assert.deepEqual(row('97/0/7').defects, [])
  assert.equal(row('97/0/7').status, 'covered')
})

test('prayer names on labels: variants, and the Amidah holding its parts', () => {
  assert.deepEqual(prayersNamed("V'ne-emar"), ["V'ne'emar"])
  assert.deepEqual(prayersNamed('Kiddusha 1'), ['Kedusha'])
  assert.deepEqual(prayersNamed('Kiddush 2'), ['Kiddush'])
  assert.deepEqual(prayersNamed('Mourners Kaddish 2 Shabbat Shuva'), ['Kaddish'])
  assert.deepEqual(prayersNamed('Veehavta 1'), ["V'ahavta"])
  assert.deepEqual(prayersNamed('Open Up Our Eyes - Klepper'), [])
})

/** A small seeded deck with placeholders, for status and binding tests. */
function miniDeck(buttons: { row: number; col: number; label: string; inComp: string; outComp?: string }[]): CompanionDeck {
  const deck = seedTbiDeck({ ...seedData, pages: [], fragments: {}, connections: [] })
  deck.connections.push({ id: 'SING', label: 'kab', moduleId: 'singularlive-studio', moduleVersionId: '2.1.2', sortOrder: 1, updatePolicy: 'stable', lastUpgradeIndex: -1 })
  const nav: DeckButton[] = (['pageup', 'pagenum', 'pagedown'] as const).map((control, row) => ({ row, col: 0, spec: { kind: 'builtin', control } }))
  deck.pages = [{ number: 1, id: stableId('mini:1'), name: 'PAGE', template: 'service', buttons: [...nav] }]
  for (const b of buttons) {
    const key = `1/${b.row}/${b.col}`
    deck.fragments[key] = {
      kind: 'control', source: `export ${key} (Singular graphic, not yet converted)`,
      style: { set: { 'box0.color': { value: 0x3333ff, isExpression: false }, 'text0.text': { value: b.label, isExpression: false } } },
      options: {}, feedbacks: [], steps: { 0: { action_sets: { down: [], up: [] }, options: { runWhileHeld: [] } } }, localVariables: [],
    }
    deck.pages[0].buttons.push({ row: b.row, col: b.col, spec: { kind: 'fragment', fragment: key }, singular: { in: { app: 'kab', comp: b.inComp }, out: { app: 'kab', comp: b.outComp ?? b.inComp } } })
  }
  return deck
}
const miniCues = [cue('c-lcha1', "L'cha Dodi 1"), cue('c-shalom-a', 'Shalom Rav — 01 of 02'), cue('c-shalom-b', 'Shalom Rav — 02 of 02'), cue('c-hinei', 'Hinei Ma Tov')]

test('statuses: one clear match is Covered, several are Needs review, none is Needs a graphic; the label only ever proposes', () => {
  const deck = miniDeck([
    { row: 0, col: 1, label: 'Lecha Dodi 1', inComp: "L'cha Dodi 1" },
    { row: 1, col: 1, label: 'Shalom Rav', inComp: 'Shalom Rav' },
    { row: 2, col: 1, label: 'Unknown', inComp: 'Nothing like it' },
    { row: 3, col: 1, label: 'Hinei Ma Tov', inComp: 'Hineih Mah Tov' },
  ])
  const { rows, summary } = convertSingularDeck(deck, { cues: miniCues, compositions: [{ app: 'kab', comp: "L'cha Dodi 1" }, { app: 'kab', comp: 'Shalom Rav' }, { app: 'kab', comp: 'Hineih Mah Tov' }] })
  const by = Object.fromEntries(rows.map((r) => [r.id, r]))
  assert.equal(by['1/0/1'].status, 'covered')
  assert.deepEqual(by['1/0/1'].cue, { id: 'c-lcha1', name: "L'cha Dodi 1" })
  assert.equal(by['1/1/1'].status, 'needs-review')
  assert.deepEqual(by['1/1/1'].candidates.map((c) => c.cueId).sort(), ['c-shalom-a', 'c-shalom-b'])
  assert.equal(by['1/2/1'].status, 'needs-a-graphic')
  assert.ok(by['1/2/1'].defects.some((d) => d.code === 'composition-missing'))
  // Her label finds "Hinei Ma Tov", but a label match is a candidate for review, never Covered.
  assert.equal(by['1/3/1'].status, 'needs-review')
  assert.deepEqual(by['1/3/1'].candidates.map((c) => c.cueId), ['c-hinei'])
  assert.equal(by['1/3/1'].match.method, 'title+label')
  assert.deepEqual(summary.byStatus, { covered: 1, 'needs-review': 2, 'needs-a-graphic': 1 })
})

test('binding: only confirmed Covered rows, as one-press keys with her colours and the Rendered light; Singular stubs go', () => {
  const deck = miniDeck([{ row: 0, col: 1, label: 'Lecha Dodi 1', inComp: "L'cha Dodi 1" }, { row: 1, col: 1, label: 'Shalom Rav', inComp: 'Shalom Rav' }])
  const result = convertSingularDeck(deck, { cues: miniCues })
  assert.throws(() => applyConversion(deck, result, ['1/0/1', '1/1/1']), (e: unknown) => e instanceof DeckConversionError && /Nothing was bound: only Covered rows can be bound, and page 1 row 1 column 1 \("Shalom Rav"\) is Needs review, not Covered/.test((e as Error).message))
  const { deck: bound, removedConnections } = applyConversion(deck, result, ['1/0/1'])
  assert.deepEqual(removedConnections, ['kab'])
  const key = bound.pages[0].buttons.find((b) => b.row === 0 && b.col === 1)!
  assert.deepEqual(key.spec, { kind: 'cue', cueId: 'c-lcha1', label: 'Lecha Dodi 1', role: 'sequence-part', bg: 0x3333ff, color: 0xffffff })
  assert.ok(key.singular, 'the button keeps what it fired on Singular')
  assert.ok(!bound.fragments['1/0/1'] && bound.fragments['1/1/1'], 'the bound placeholder fragment is dropped, the waiting one kept')
  const ctrl = (renderDeck(bound).pages['1'].controls as Record<string, Record<string, { feedbacks: { definitionId: string }[]; steps: Record<string, { action_sets: { down: { definitionId: string }[] } }>; style: { layers: { type: string; color?: { value: number } }[] } }>>)['0']['1']
  assert.deepEqual(ctrl.feedbacks.map((f) => f.definitionId), ['requested', 'rendered', 'disconnected'])
  assert.deepEqual(Object.values(ctrl.steps).map((s) => s.action_sets.down.map((a) => a.definitionId)), [['toggle_cue']])
  assert.equal(ctrl.style.layers.find((l) => l.type === 'box')!.color!.value, 0x3333ff)
  // Converting again reports the bound row as bound.
  const again = convertSingularDeck(bound, { cues: miniCues }).rows.find((r) => r.id === '1/0/1')!
  assert.deepEqual([again.bound, again.status, again.cue?.id], [true, 'covered', 'c-lcha1'])
  assert.throws(() => applyConversion(bound, convertSingularDeck(bound, { cues: miniCues }), ['1/0/1']), /already bound/)
})

test("every Covered button of Simone's deck bound: the export passes C2 and every graphic key carries the Rendered light", () => {
  const deck = tbi()
  const result = convertSingularDeck(deck, { cues: catalog })
  const ids = result.rows.filter((r) => r.status === 'covered').map((r) => r.id)
  const { deck: converted } = applyConversion(deck, result, ids)
  assert.deepEqual(errors(converted), [])
  const exported = renderDeck(converted)
  assert.deepEqual(Object.values(exported.instances).map((i) => i.label).sort(), ['Birddog', 'TBI_Overlays', 'obs'])
  let keys = 0
  for (const page of Object.values(exported.pages)) {
    for (const row of Object.values(page.controls as Record<string, Record<string, { feedbacks?: { definitionId: string }[]; steps?: Record<string, { action_sets: { down: { definitionId: string }[] } }> }>>)) {
      for (const ctrl of Object.values(row)) {
        if (!ctrl.steps || !Object.values(ctrl.steps).some((s) => s.action_sets.down.some((a) => a.definitionId === 'toggle_cue'))) continue
        keys++
        assert.ok(ctrl.feedbacks!.some((f) => f.definitionId === 'rendered'))
      }
    }
  }
  assert.equal(keys, ids.length)
})

/* ----------------------------------------------------------------- secrets --- */

/** A tiny Companion 5 export whose connections carry config and secrets with sentinel values. */
function syntheticExport() {
  const w = (value: unknown) => ({ value, isExpression: false })
  const layers = (text: string) => [
    { id: 'canvas', name: 'Canvas', usage: 'auto', type: 'canvas', decoration: w('default'), showStatusIcons: w('default') },
    { id: 'box0', name: 'Background', usage: 'auto', type: 'box', enabled: w(true), opacity: w(100), x: w(0), y: w(0), width: w(100), height: w(100), rotation: w(0), color: w(0x990033), borderWidth: w(0), borderColor: w(0), borderPosition: w('inside') },
    { id: 'image0', name: 'Image', usage: 'auto', type: 'image', enabled: w(true), opacity: w(100), x: w(0), y: w(0), width: w(100), height: w(100), rotation: w(0), base64Image: w(null), halign: w('center'), valign: w('center'), fillMode: w('fit') },
    { id: 'text0', name: 'Text', usage: 'auto', type: 'text', enabled: w(true), opacity: w(100), x: w(0), y: w(0), width: w(100), height: w(100), rotation: w(0), text: w(text), color: w(0xffffff), halign: w('center'), valign: w('center'), fontsize: w(100), fontsizeAllowShrink: w(true), font: w('companion-sans'), outlineColor: w(4278190080) },
  ]
  const button = (text: string, steps: unknown) => ({ type: 'button-layered', style: { layers: layers(text) }, options: { stepProgression: 'auto' }, feedbacks: [], steps, localVariables: [] })
  const step = (down: unknown[]) => ({ action_sets: { down, up: [] }, options: { runWhileHeld: [] } })
  const act = (connectionId: string, definitionId: string, options: Record<string, unknown>) => ({ type: 'action', id: `${definitionId}-${Math.random()}`, definitionId, connectionId, options, upgradeIndex: -1 })
  return {
    version: 12, type: 'full', companionBuild: '5.0.5+test',
    instances: {
      SING: { moduleInstanceType: 'connection', moduleId: 'singularlive-studio', label: 'kab', moduleVersionId: '2.1.2', sortOrder: 1, updatePolicy: 'stable', lastUpgradeIndex: -1, config: { app_url: 'https://sentinel-app-url.example/abcdef' }, secrets: { token: 'SENTINEL-SINGULAR-TOKEN' } },
      OBS: { moduleInstanceType: 'connection', moduleId: 'obs-studio', label: 'obs', moduleVersionId: '3.15.3', sortOrder: 2, updatePolicy: 'stable', lastUpgradeIndex: 8, config: { host: '10.99.88.77', port: 4455 }, secrets: { pass: 'SENTINEL-OBS-PASS' } },
    },
    pages: {
      1: {
        id: 'page-one', name: 'PAGE', gridSize: { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 },
        controls: {
          0: { 0: { type: 'pageup' }, 1: button('Shema', { 0: step([act('SING', 'animateIn', { comp: w('Shema') })]), 1: step([act('SING', 'animateOut', { comp: w('Shema') })]) }) },
          1: { 0: { type: 'pagenum' }, 1: button('Scene', { 0: step([act('OBS', 'set_scene', { scene: w('Main') })]) }) },
          2: { 0: { type: 'pagedown' } },
        },
      },
    },
    triggers: {}, custom_variables: {},
  }
}

test('seeding strips every connection config and secret before anything is kept, and never keeps the file', async () => {
  const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(syntheticExport())))
  const { data, summary } = deriveExportSeedData(readCompanionExport(bytes), { workspace: 'tbi', source: { file: 'x.companionconfig', sha256: 'h' } })
  const text = JSON.stringify(data)
  for (const sentinel of ['sentinel-app-url', 'SENTINEL-SINGULAR-TOKEN', '10.99.88.77', 'SENTINEL-OBS-PASS', '"config"', '"secrets"']) assert.ok(!text.includes(sentinel), sentinel)
  assert.equal(summary.connectionSettingsDiscarded, 2)
  assert.deepEqual([summary.graphics, summary.devices, summary.builtInNav], [1, 1, 3])
  assert.deepEqual(data.connections.map((c) => Object.keys(c).sort()), [['id', 'label', 'lastUpgradeIndex', 'moduleId', 'moduleVersionId', 'sortOrder', 'updatePolicy']])
  // The MCP operation: a dry run stores nothing; a stored deck carries none of it either.
  const repo = new MemoryCompanionDeckRepository()
  const deps: DeckConversionDeps = { workspace: 'tbi', repository: repo, cues: async () => [cue('c-shema', 'Shema')], committedSeed: async () => seedData, now: () => 1000 }
  const upload = bytes.toString('base64')
  const dry = await deckConversionOperation('seed_deck_from_export', { export: upload }, 'mcp:t', deps) as { dryRun: boolean; seed: { graphicButtons: number; connectionSettingsDiscarded: number } }
  assert.deepEqual([dry.dryRun, dry.seed.graphicButtons, dry.seed.connectionSettingsDiscarded], [true, 1, 2])
  assert.equal(await repo.get('tbi'), null)
  await deckConversionOperation('seed_deck_from_export', { export: upload, dryRun: false }, 'mcp:t', deps)
  const stored = JSON.stringify(await repo.get('tbi'))
  for (const sentinel of ['sentinel-app-url', 'SENTINEL-SINGULAR-TOKEN', '10.99.88.77', 'SENTINEL-OBS-PASS', upload.slice(0, 40)]) assert.ok(!stored.includes(sentinel), sentinel)
})

test('a carried button naming a password is refused, and an unreadable file is a sentence', () => {
  const exp = syntheticExport() as unknown as { pages: Record<string, { controls: Record<string, Record<string, { style: { layers: { id: string; text?: { value: string } }[] } }>> }> }
  exp.pages[1].controls[1][1].style.layers.find((l) => l.id === 'text0')!.text!.value = 'obs password'
  assert.throws(() => deriveExportSeedData(exp as never, { workspace: 'tbi', source: { file: 'x', sha256: 'h' } }), /contains the word password, secret or token\. Nothing was stored\./)
  assert.throws(() => readCompanionExport(Buffer.from('not json')), /not a Companion export/)
})

test("no value from the raw export's connection config/secrets appears in the committed TBI seed", (t) => {
  if (!fs.existsSync(RAW)) { t.skip('raw export not present (work/ is gitignored)'); return }
  // Held in memory only; nothing from config or secrets is printed, even on failure.
  const bytes = fs.readFileSync(RAW)
  const data = JSON.parse((bytes[0] === 0x1f ? zlib.gunzipSync(bytes) : bytes).toString('utf8')) as Record<string, Record<string, Record<string, unknown>>>
  const secretValues = new Set<string>()
  const collect = (v: unknown, into: Set<string>) => {
    if (typeof v === 'string' && v.length >= 4) into.add(v)
    else if (typeof v === 'number' && String(v).length >= 4) into.add(String(v))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => collect(x, into))
  }
  for (const group of ['instances', 'surfaceInstances']) {
    for (const inst of Object.values(data[group] ?? {})) { collect(inst?.config, secretValues); collect(inst?.secrets, secretValues) }
  }
  assert.ok(secretValues.size > 0, 'expected the raw export to carry connection config')
  // Values that also appear outside config/secrets (a scene name, "default") are not exclusive to them.
  const stripped = structuredClone(data)
  for (const group of ['instances', 'surfaceInstances']) for (const inst of Object.values(stripped[group] ?? {})) { delete inst.config; delete inst.secrets }
  const elsewhere = JSON.stringify(stripped)
  let leaked = 0
  for (const v of secretValues) {
    const quoted = JSON.stringify(v).slice(1, -1)
    if (!elsewhere.includes(quoted) && seedText.includes(quoted)) leaked++
  }
  assert.equal(leaked, 0, `${leaked} connection config/secret values appear in the seed data`)
  // And the committed seed is exactly what the raw export derives today.
  const fresh = deriveExportSeedData(data, { workspace: 'tbi', source: { file: path.basename(RAW), sha256: crypto.createHash('sha256').update(bytes).digest('hex') } }).data
  assert.equal(formatExportSeedData(fresh), seedText.replace(/\r\n/g, '\n'))
})

/* ------------------------------------------------------------- MCP operations --- */

test('MCP operations: dry runs by default, expectedVersion on writes, only Covered bound, refusals are sentences', async () => {
  const repo = new MemoryCompanionDeckRepository()
  const deps: DeckConversionDeps = { workspace: 'tbi', repository: repo, cues: async () => catalog, committedSeed: async () => seedData, now: () => 1000 }
  const run = (op: string, input: unknown) => deckConversionOperation(op, input, 'mcp:tester', deps) as Promise<Record<string, unknown>>
  await assert.rejects(run('convert_singular_deck', {}), /No TBI deck is stored yet\. Seed one with seed_deck_from_export/)
  const preview = await run('convert_singular_deck', { deck: 'committed-seed' })
  assert.deepEqual([preview.dryRun, (preview.counts as { covered: number }).covered], [true, 192])
  await assert.rejects(run('seed_deck_from_export', {}), /Pass either export .* or useCommittedSeed:true/)
  const seeded = await run('seed_deck_from_export', { useCommittedSeed: true, dryRun: false })
  assert.deepEqual(seeded.stored, { version: 1 })
  await assert.rejects(run('seed_deck_from_export', { useCommittedSeed: true, dryRun: false }), /already stored \(version 1\).*pass expectedVersion:1/)
  const dry = await run('convert_singular_deck', { status: 'needs-a-graphic' })
  assert.equal((dry.rows as unknown[]).length, 16)
  assert.equal((await repo.get('tbi'))!.version, 1, 'a dry run writes nothing')
  const bindable = dry.bindable as string[]
  assert.equal(bindable.length, 192)
  await assert.rejects(run('convert_singular_deck', { dryRun: false, bind: bindable }), /Pass expectedVersion:1/)
  await assert.rejects(run('convert_singular_deck', { dryRun: false, expectedVersion: 1, bind: ['3/0/5'] }), /Nothing was bound: only Covered rows can be bound, and page 3 row 0 column 5 \("NEED mi chamocha pt 2"\) is Needs review/)
  assert.equal((await repo.get('tbi'))!.version, 1)
  const applied = await run('convert_singular_deck', { dryRun: false, expectedVersion: 1, bind: bindable })
  assert.deepEqual([applied.version, applied.bound], [2, 192])
  await assert.rejects(run('convert_singular_deck', { dryRun: false, expectedVersion: 1, bind: bindable }), /changed in another session/)
  const after = await run('convert_singular_deck', {})
  assert.equal((after.counts as { alreadyBound: number }).alreadyBound, 192)
  assert.deepEqual(after.bindable, [])
  // CRC's deck is not seeded from an export.
  await assert.rejects(deckConversionOperation('seed_deck_from_export', { useCommittedSeed: true }, 'mcp:t', { ...deps, workspace: 'crc' }), /CRC's deck is seeded from its released preset/)
  // No deck store on this deployment yet: a dry run still works, a write is a sentence.
  const unwired: DeckConversionDeps = { ...deps, repository: null }
  assert.equal(((await deckConversionOperation('seed_deck_from_export', { useCommittedSeed: true }, 'mcp:t', unwired)) as { dryRun: boolean }).dryRun, true)
  await assert.rejects(deckConversionOperation('seed_deck_from_export', { useCommittedSeed: true, dryRun: false }, 'mcp:t', unwired), /no Companion deck store yet/)
})

test('palette sanity: bound TBI keys keep her colours, not the CRC role colours', () => {
  const deck = tbi()
  const result = convertSingularDeck(deck, { cues: catalog })
  const { deck: converted } = applyConversion(deck, result, ['2/0/3'])
  const spec = converted.pages.find((p) => p.number === 2)!.buttons.find((b) => b.row === 0 && b.col === 3)!.spec
  assert.equal(spec.kind, 'cue')
  if (spec.kind !== 'cue') return
  assert.equal(spec.bg, 0x009900)
  assert.notEqual(spec.bg, PALETTE.teal)
})

test('one deck store: a TBI deck seeded and converted here is the deck the C3 deck tools read and check', async () => {
  const { deckToolOperation } = await import('../lib/companion-deck/tools.ts')
  const repo = new MemoryCompanionDeckRepository()
  const deps: DeckConversionDeps = { workspace: 'tbi', repository: repo, cues: async () => catalog, committedSeed: async () => seedData, now: () => 1000 }
  await deckConversionOperation('seed_deck_from_export', { useCommittedSeed: true, dryRun: false }, 'mcp:t', deps)
  const dry = await deckConversionOperation('convert_singular_deck', {}, 'mcp:t', deps) as { bindable: string[] }
  await deckConversionOperation('convert_singular_deck', { dryRun: false, expectedVersion: 1, bind: dry.bindable }, 'mcp:t', deps)
  const ctx = { workspace: 'tbi' as const, repository: repo, catalog: async () => catalog.map((c) => ({ id: c.id, name: c.name, published: true, revision: 1, retired: false })), signingKey: null }
  const brief = await deckToolOperation('get_deck', {}, 'mcp:t', ctx) as { deckVersion: number; workspace: string; counts: { cueKeys: number } }
  assert.deepEqual([brief.deckVersion, brief.workspace], [2, 'tbi'])
  assert.ok(brief.counts.cueKeys >= 192, 'the bound keys are cue keys on the C3 side')
  const page = await deckToolOperation('get_deck_page', { page: 3 }, 'mcp:t', ctx) as { page: number }
  assert.equal(page.page, 3)
  await deckToolOperation('validate_deck', {}, 'mcp:t', ctx)
})
