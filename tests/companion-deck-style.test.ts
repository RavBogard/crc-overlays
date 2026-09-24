import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stableId, type CompanionDeck, type CueRole } from '../lib/companion-deck/model.ts'
import { ROLE_COLOURS } from '../lib/companion-deck/palette.ts'
import { MemoryCompanionDeckRepository } from '../lib/companion-deck/repository.ts'
import { seedCrcDeck, type CrcSeedData, type CueManifest } from '../lib/companion-deck/seed.ts'
import { DECK_STYLES, parseDeckStyle, panelLabelOk, suggestPanelLabel, type CueSetLookup } from '../lib/companion-deck/style.ts'
import { seedTbiDeck, type ExportSeedData } from '../lib/companion-deck/tbi-seed.ts'
import { deckToolOperation, type DeckCatalogCue } from '../lib/companion-deck/tools.ts'
import { PLACEHOLDER_SOURCE, catalogCueLookups, validateDeck, type CueLookups, type Finding, type ModuleDefinitions } from '../lib/companion-deck/validate.ts'

/* S3 - each operator's deck style as data (lib/companion-deck/styles/*.json) and validate_deck's style
   check: every multi-panel graphic has one key per panel, placed and labelled by that operator's rules. */

const root = path.resolve(import.meta.dirname, '..')
const plan = path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion')
const manifest = JSON.parse(fs.readFileSync(path.join(plan, 'CUE-MANIFEST.json'), 'utf8')) as CueManifest
const crcData = JSON.parse(fs.readFileSync(path.join(root, 'lib/companion-deck/crc-seed-data.json'), 'utf8')) as CrcSeedData
const tbiData = JSON.parse(fs.readFileSync(path.join(root, 'lib/companion-deck/tbi-seed-data.json'), 'utf8')) as ExportSeedData
const snapshot = JSON.parse(fs.readFileSync(path.join(plan, 'catalog-snapshot-2026-09-23.json'), 'utf8')) as { drafts: Parameters<typeof catalogCueLookups>[0] }
const definitions = (d: CompanionDeck) => JSON.parse(fs.readFileSync(path.join(root, 'companion/definitions', `${d.connections.find((c) => c.role === 'overlays')?.moduleVersionId ?? '1.7.0'}.json`), 'utf8')) as ModuleDefinitions

const styleFindings = (fs_: Finding[]) => fs_.filter((f) => f.code.startsWith('style-'))
const check = (deck: CompanionDeck, sets: Record<string, CueSetLookup> = {}) => {
  const cues: CueLookups = { isPublished: () => true, isRetired: () => false, set: (id) => sets[id] }
  return validateDeck(deck, { module: definitions(deck), cues })
}

/** Simone's seeded deck with every placeholder key taken off, so a test lays its own keys. */
function bareTbi(): CompanionDeck {
  const deck = seedTbiDeck(tbiData)
  for (const p of deck.pages) p.buttons = p.buttons.filter((b) => !(b.spec.kind === 'fragment' && PLACEHOLDER_SOURCE.test(deck.fragments[b.spec.fragment]?.source ?? '')))
  return deck
}
/** A TBI set key at page 5, the way apply_deck_plan binds a draft-set part (her colour, sequence from the set). */
function key(deck: CompanionDeck, row: number, col: number, label: string, index: number, count: number, bg = 0x76d650, page = 5) {
  const p = deck.pages.find((x) => x.number === page)!
  p.buttons = p.buttons.filter((b) => !(b.row === row && b.col === col))
  p.buttons.push({ row, col, ids: { ctx: `t/${page}/${row}/${col}`, base: 0 }, spec: { kind: 'cue', cueId: `aleinu-${index}`, label, role: 'sequence-part' as CueRole, sequence: { name: 'Aleinu', index, count }, bg, color: 0 } })
}
const aleinuSet = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`aleinu-${i + 1}`, { id: 'set-aleinu', index: i + 1, count }]))

/* ----------------------------------------------------------------- the data --- */

test('both styles load and say what the decks as built do', () => {
  assert.deepEqual(Object.keys(DECK_STYLES).sort(), ['crc', 'tbi'])
  // CRC's colour meaning is the role rule itself (palette.ts), and a set's panels are teal.
  const crc = DECK_STYLES.crc
  assert.ok(crc.colours.rule === 'role')
  assert.deepEqual(crc.colours.roles, ROLE_COLOURS)
  assert.equal(crc.colours.set, 'teal')
  assert.equal(DECK_STYLES.tbi.colours.rule, 'one-per-set')
  // Page roles name the template each page has in the seeded decks.
  for (const [w, deck] of [['crc', seedCrcDeck(manifest, crcData)], ['tbi', seedTbiDeck(tbiData)]] as const) {
    for (const r of DECK_STYLES[w].pages) for (let n = r.from; n <= r.to; n++) {
      assert.equal(deck.pages.find((p) => p.number === n)?.template, r.template, `${w} page ${n}`)
    }
  }
  // TBI's graphics pages are exactly her service-template pages.
  assert.deepEqual(DECK_STYLES.tbi.pages.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)),
    seedTbiDeck(tbiData).pages.filter((p) => p.template === 'service').map((p) => p.number))
  // Every label example follows its own pattern.
  assert.ok(panelLabelOk(DECK_STYLES.tbi, 'Mourn Kadd 2', 2, 2) && panelLabelOk(DECK_STYLES.tbi, '148 pt 1', 1, 2) && !panelLabelOk(DECK_STYLES.tbi, 'Mourn Kadd 2', 1, 2))
  assert.ok(panelLabelOk(DECK_STYLES.crc, 'Aleinu 3/4', 3, 4) && panelLabelOk(DECK_STYLES.crc, '2 Likrat', 2, 9) && !panelLabelOk(DECK_STYLES.crc, 'Aleinu', 1, 4))
  assert.equal(suggestPanelLabel(DECK_STYLES.tbi, 'Mourn Kadd 2', 2, 3, 3), 'Mourn Kadd 3')
  assert.equal(suggestPanelLabel(DECK_STYLES.tbi, '148 pt 2', 2, 3, 3), '148 pt 3')
  assert.equal(suggestPanelLabel(DECK_STYLES.crc, 'Aleinu 2/4', 2, 3, 4), 'Aleinu 3/4')
  assert.equal(suggestPanelLabel(DECK_STYLES.crc, '2 Likrat', 2, 3, 9), null)
  // A malformed style is refused.
  assert.throws(() => parseDeckStyle({ ...DECK_STYLES.tbi, labels: { ...DECK_STYLES.tbi.labels, panel: ['no number'] } }), /has no \{i\}/)
  assert.throws(() => parseDeckStyle({ ...DECK_STYLES.tbi, growth: { direction: 'across' } }), /growth/)
})

/* ---------------------------------------------------------------- CRC seed --- */

test("CRC's seeded deck (what production holds) passes the style check with no finding, and stays exportable", () => {
  const deck = seedCrcDeck(manifest, crcData)
  const result = validateDeck(deck, { module: definitions(deck), cues: catalogCueLookups(snapshot.drafts) })
  assert.deepEqual(styleFindings(result.findings), [])
  assert.equal(result.summary.style, 'crc: 69 multi-panel sets, 173 panel keys')
  assert.equal(result.summary.placeholders, 0)
  assert.deepEqual(result.findings.filter((f) => f.severity === 'error'), [])
})

test('CRC: a set key off its role colour, a wrong label and a missing panel are each reported', () => {
  const deck = seedCrcDeck(manifest, crcData)
  const fri5 = deck.pages.find((p) => p.number === 8)! // Fri 5: Aleinu 1/4-4/4 down c3
  const at = (r: number, c: number) => fri5.buttons.find((b) => b.row === r && b.col === c)!
  const a2 = at(1, 3).spec, a4 = at(3, 3)
  assert.ok(a2.kind === 'cue' && a2.label === 'Aleinu 2/4')
  a2.bg = 0x990033
  a2.label = 'Aleinu'
  fri5.buttons.splice(fri5.buttons.indexOf(a4), 1)
  const f = styleFindings(check(deck).findings)
  assert.deepEqual(f.map((x) => [x.severity, x.code, x.page, x.row, x.column]), [
    ['error', 'style-panel-missing', 8, 0, 3], ['warning', 'style-label', 8, 1, 3], ['warning', 'style-colour', 8, 1, 3],
  ])
  assert.match(f[0].message, /"Aleinu" has 4 panels, and page 8 "Fri 5" has keys for panels 1, 2, 3\. Add panel 4 \(by CRC's layout: row 3 column 3, labelled "Aleinu 4\/4"\)/)
})

/* --------------------------------------------------------------------- TBI --- */

test('TBI: a correct set passes, and a set that continues at the top of the next column passes', () => {
  const deck = bareTbi()
  key(deck, 0, 1, 'Aleinu 1', 1, 3); key(deck, 1, 1, 'Aleinu 2', 2, 3); key(deck, 2, 1, 'Aleinu 3', 3, 3)
  assert.deepEqual(styleFindings(check(deck, aleinuSet(3)).findings), [])
  // Her Avot on page 3: r3c6 then r0c7 (the column is full below the first panel).
  const wrap = bareTbi()
  key(wrap, 3, 6, 'Avot 1', 1, 2); key(wrap, 0, 7, 'Avot 2', 2, 2)
  assert.deepEqual(styleFindings(check(wrap, aleinuSet(2)).findings), [])
  // Continuing past an occupied cell: r0c4, r1c4, another key at r2c4, then r0c5.
  const past = bareTbi()
  key(past, 0, 4, 'Aleinu 1', 1, 3); key(past, 1, 4, 'Aleinu 2', 2, 3); key(past, 0, 5, 'Aleinu 3', 3, 3)
  past.pages.find((p) => p.number === 5)!.buttons.push({ row: 2, col: 4, ids: { ctx: 't/other', base: 0 }, spec: { kind: 'cue', cueId: 'other', label: 'Other', role: 'single', bg: 0x2962ff } })
  assert.deepEqual(styleFindings(check(past, aleinuSet(3)).findings), [])
})

test('TBI: the graphic grew to three panels and the page has two keys: an error naming where and how the third goes', () => {
  const deck = bareTbi()
  // The deck's keys still say two panels (bound when the set had two); the catalog now has three.
  key(deck, 1, 2, 'Mourn Kadd 1', 1, 2); key(deck, 2, 2, 'Mourn Kadd 2', 2, 2)
  const result = check(deck, aleinuSet(3))
  const f = styleFindings(result.findings)
  assert.deepEqual(f.map((x) => [x.severity, x.code, x.page, x.row, x.column]), [['error', 'style-panel-missing', 5, 1, 2]])
  assert.match(f[0].message, /has 3 panels, and page 5 "PAGE" has keys for panels 1, 2\. Add panel 3 \(by TBI's layout: row 3 column 2, labelled "Mourn Kadd 3"\)/)
  assert.equal(result.ok, false)
  // Without the catalog's set, the deck's own record (two panels) is complete.
  assert.deepEqual(styleFindings(check(deck).findings), [])
})

test('TBI: a duplicated panel is an error; a wrong column, a wrong label and a second colour are warnings', () => {
  const dup = bareTbi()
  key(dup, 0, 1, 'Aleinu 1', 1, 2); key(dup, 1, 1, 'Aleinu 2', 2, 2); key(dup, 2, 1, 'Aleinu 2', 2, 2)
  assert.deepEqual(styleFindings(check(dup, aleinuSet(2)).findings).map((x) => [x.severity, x.code, x.row, x.column]), [['error', 'style-panel-duplicate', 2, 1]])

  const deck = bareTbi()
  key(deck, 0, 1, 'Aleinu 1', 1, 3)
  key(deck, 0, 2, 'Aleinu 2', 2, 3) // across the row, while r1c1 below is free
  key(deck, 1, 2, 'Aleinu', 3, 3, 0xe55c5e) // no panel number, and another colour
  const f = styleFindings(check(deck, aleinuSet(3)).findings)
  assert.deepEqual(f.map((x) => [x.severity, x.code, x.row, x.column]), [
    ['warning', 'style-placement', 0, 2], ['warning', 'style-label', 1, 2], ['warning', 'style-colour', 1, 2],
  ])
  assert.match(f[0].message, /after row 0 column 1 it would sit at row 1 column 1/)
  // style:null skips the check.
  assert.deepEqual(styleFindings(validateDeck(deck, { module: definitions(deck), cues: { isPublished: () => true, isRetired: () => false, set: (id) => aleinuSet(3)[id] }, style: null }).findings), [])
})

/* ------------------------------------------------------------ placeholders --- */

test("an unbound placeholder key (a Singular button not yet bound to a cue) is an error, so export is refused while one remains", () => {
  const deck = seedTbiDeck(tbiData)
  const result = check(deck)
  const placeholders = result.findings.filter((f) => f.code === 'placeholder-unbound')
  assert.ok(placeholders.length > 100 && placeholders.every((f) => f.severity === 'error'))
  assert.match(placeholders[0].message, /is a placeholder for a graphic that is not bound to a cue yet, so pressing it does nothing/)
  assert.equal(bareTbi().pages.some((p) => p.buttons.some((b) => b.spec.kind === 'fragment' && PLACEHOLDER_SOURCE.test(deck.fragments[b.spec.fragment]?.source ?? ''))), false)
})

/* ------------------------------------------------------ through the deck tools --- */

test("validate_deck and export read each set's panel count from the catalog's draft sets", async () => {
  const repository = new MemoryCompanionDeckRepository()
  await repository.create('crc', seedCrcDeck(manifest, crcData), 'seed', 1)
  const cues = new Map<string, DeckCatalogCue>(manifest.bindings.map((b) => [b.cueId, { id: b.cueId, name: b.draftName, published: true, retired: false, revision: b.activeRevision ?? 1 }]))
  const ctx = { workspace: 'crc' as const, repository, catalog: async () => [...cues.values()], signingKey: Buffer.from('k'.repeat(32)), origin: 'https://crc.example', now: () => 1e6, id: () => stableId('x') }
  const run = (name: string) => deckToolOperation(name as any, {}, 'mcp:test', ctx) as Promise<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal((await run('validate_deck')).ok, true)
  // Adon Olam (three keys on Fri 5, Sat 6 and Memorial) becomes a four-part draft set in the catalog: every page that carries it is short a key.
  const adon = manifest.bindings.filter((b) => b.page === 8 && b.sequence?.name === 'Adon Olam').sort((a, b) => a.sequence!.index - b.sequence!.index)
  assert.equal(adon.length, 3)
  adon.forEach((b, i) => cues.set(b.cueId, { ...cues.get(b.cueId)!, set: { id: 'set-adon', index: i + 1, count: 4 } }))
  const v = await run('validate_deck')
  assert.equal(v.ok, false)
  assert.deepEqual(v.errors.map((e: Finding) => [e.code, e.page, e.row, e.column]), [8, 15, 26].map((n) => ['style-panel-missing', n, 0, 5]))
  assert.match(v.errors[0].message, /Add panel 4 \(no free graphics cell follows panel 3, so make room below it, labelled "Adon Olam 4\/4"\)/)
  await assert.rejects(run('export_deck_config'), /has 3 errors, so it was not exported/)
})
