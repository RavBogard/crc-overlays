import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import type { CompanionDeck } from '../lib/companion-deck/model.ts'
import { renderDeck } from '../lib/companion-deck/render.ts'
import { MemoryCompanionDeckRepository } from '../lib/companion-deck/repository.ts'
import { seedTbiDeck, type ExportSeedData } from '../lib/companion-deck/tbi-seed.ts'
import { DeckToolError, deckToolOperation, type DeckCatalogCue, type DeckToolContext } from '../lib/companion-deck/tools.ts'
import { PLAN_BUILD_KEY } from '../lib/companion-deck/tool-schemas.ts'
import { DeckPlanError, contrastText, deckPlanFromCsv, deckPlanFromText, deviceParts, parseCsv } from '../lib/companion-deck/deck-plan.ts'
import { BUILD_KEY_PATTERN, MemoryBuildKeyRepository, type BuildKeyKind } from '../lib/build-keys.ts'
import { MemoryImportRepository, bytesSha256, tokenHash, type ImportKind } from '../lib/imports.ts'

/* G6 (TBI redo) - apply_deck_plan against Simone's seeded deck in an in-memory store, a small catalog and
   in-memory build keys and imports. Nothing here reaches a database, the relay or a booth. */

const root = path.resolve(import.meta.dirname, '..')
const seedData = JSON.parse(fs.readFileSync(path.join(root, 'lib/companion-deck/tbi-seed-data.json'), 'utf8')) as ExportSeedData
const ACTOR = 'mcp:test-actor'
const WS = 'temple-bnai-israel-kalamazoo'
const HEADER = 'page,row,col,label,bg,targetKind,targetKey,panelIndex,notes'

const cue = (id: string, name: string, set?: DeckCatalogCue['set']): DeckCatalogCue => ({ id, name, published: true, retired: false, revision: 1, ...(set ? { set, title: name.replace(/ — .*/, '') } : {}) })

async function fixture(options: { deck?: (d: CompanionDeck) => void } = {}) {
  const repository = new MemoryCompanionDeckRepository()
  const deck = seedTbiDeck(seedData)
  options.deck?.(deck)
  await repository.create('tbi', deck, 'seed', 1)
  const catalog = new Map<string, DeckCatalogCue>([
    ['draft-shir', cue('draft-shir', 'Shir Chadash (Silver)')],
    ['draft-jlicense', cue('draft-jlicense', 'JLicense Friday')],
    ['draft-unpublished', { ...cue('draft-unpublished', 'Not yet'), published: false }],
    ['lecha-1', cue('lecha-1', "L'cha Dodi — 1 of 2", { id: 'set-lecha', index: 1, count: 2 })],
    ['lecha-2', cue('lecha-2', "L'cha Dodi — 2 of 2", { id: 'set-lecha', index: 2, count: 2 })],
    ['other-cue', cue('other-cue', 'Other graphic')],
  ])
  const buildKeys = new MemoryBuildKeyRepository()
  const key = (kind: BuildKeyKind, k: string, targetId: string) => buildKeys.put({ workspaceId: WS, kind, key: k, targetId, createdBy: 'test', createdAt: 1, updatedAt: 1 })
  await key('draft', 'song-shir-chadash-silver', 'draft-shir')
  await key('draft', 'tbi-jlicense-kabbalat-shabbat', 'draft-jlicense')
  await key('draft', 'not-published', 'draft-unpublished')
  await key('draft-set', 'lcha-dodi', 'set-lecha')
  const imports = new MemoryImportRepository()
  let n = 0, now = 1_000_000
  const context: DeckToolContext = { workspace: 'tbi', repository, catalog: async () => structuredClone([...catalog.values()]), buildKeys, imports, now: () => ++now, id: () => `id-${++n}`, signingKey: null, origin: 'https://tbi.example' }
  const run = (input: Record<string, unknown>) => deckToolOperation('apply_deck_plan', input, ACTOR, context) as Promise<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
  const refused = async (input: Record<string, unknown>, pattern: RegExp) => {
    await assert.rejects(run(input), (e: unknown) => { assert.ok(e instanceof DeckToolError, String(e)); assert.match((e as Error).message, pattern); return true })
  }
  const stored = async () => (await repository.get('tbi'))!
  const at = async (page: number, row: number, col: number) => (await stored()).deck.pages.find((p) => p.number === page)!.buttons.find((b) => b.row === row && b.col === col)
  const addImport = async (text: string, kind: ImportKind = 'deck-plan') => {
    const id = `import_${String(++n).padStart(32, '0')}`, data = new TextEncoder().encode(text)
    await imports.insert({ id, workspaceId: WS, kind, tokenSha256: tokenHash(id), linkExpiresAt: now + 1e6, status: 'waiting', fileName: 'deck-plan.csv', mediaType: 'text/csv', totalBytes: data.byteLength, receivedBytes: 0, nextChunk: 0, sha256: null, refusal: null, note: null, createdBy: 'test', createdAt: now, updatedAt: now, expiresAt: now + 1e9 })
    await imports.append(id, 0, data, now)
    await imports.update(id, { status: 'ready', sha256: bytesSha256(data) })
    return id
  }
  return { repository, catalog, buildKeys, context, run, refused, stored, at, addImport }
}
const row = (page: number, r: number, col: number, label: string, bg: string, targetKind: string, targetKey: string | null = null, panelIndex: number | null = null) => ({ page, row: r, col, label, bg, targetKind, targetKey, panelIndex })

/* ------------------------------------------------------------------ reading --- */

test('CSV: quoted fields, commas and quotes in labels, CRLF, a BOM and a line break inside quotes', () => {
  assert.deepEqual(parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"two\nlines",\n'), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'two\nlines', '']])
  const rows = deckPlanFromCsv(`${HEADER}\n2,0,1,"Shir, Chadash",#ff80ff,local,song-shir-chadash-silver,0,"her ""note"", with commas"\n1,0,2,Zoom in,#000000,birddog,Birddog:zoom:in,,\n`)
  assert.equal(rows.length, 2)
  assert.deepEqual([rows[0].label, rows[0].notes, rows[0].panelIndex, rows[0].line], ['Shir, Chadash', 'her "note", with commas', 0, 2])
  assert.deepEqual([rows[1].targetKind, rows[1].targetKey, rows[1].panelIndex], ['birddog', 'Birddog:zoom:in', null])
  assert.throws(() => parseCsv('a,"b\n'), DeckPlanError)
  assert.throws(() => deckPlanFromCsv('page,row,label\n1,0,x\n'), /lacks col, bg, targetKind, targetKey, panelIndex/)
  assert.throws(() => deckPlanFromCsv(`${HEADER},colour\n`), /"colour", which a plan does not use/)
  assert.throws(() => deckPlanFromCsv(`${HEADER}\n2,0,1,A,#fff,local,k,0,\nx,0,1,B,#000000,sparkle,k,0,\n`), /Line 3: page .*targetKind/)
  // A JSON array import reads the same rows.
  assert.equal(deckPlanFromText(JSON.stringify([{ page: '2', row: 0, col: 1, label: 'A', bg: '#000000', targetKind: 'local', targetKey: 'k', panelIndex: '' }]))[0].page, 2)
  assert.deepEqual(deviceParts('Birddog:pt:up_left; Birddog:pt:stop'), [{ conn: 'Birddog', action: 'pt', value: 'up_left' }, { conn: 'Birddog', action: 'pt', value: 'stop' }])
  assert.deepEqual(deviceParts('obs:set_scene:Singular.live - Evening'), [{ conn: 'obs', action: 'set_scene', value: 'Singular.live - Evening' }])
  assert.equal(String(PLAN_BUILD_KEY), String(BUILD_KEY_PATTERN), 'the schema\'s build-key pattern is lib/build-keys.ts\'s')
  assert.deepEqual([contrastText(0xffff00), contrastText(0x000099)], [0x000000, 0xffffff])
})

test('an importId reads a deck-plan import (CSV or JSON); other kinds and both inputs are refused', async () => {
  const f = await fixture()
  const csv = await f.addImport(`${HEADER}\n2,0,1,Shir Chadash - Silver,#ff80ff,local,song-shir-chadash-silver,0,\n`)
  const dry = await f.run({ importId: csv })
  assert.equal(dry.counts.placed, 1)
  const json = await f.addImport(JSON.stringify([row(2, 0, 1, 'Shir', '#ff80ff', 'local', 'song-shir-chadash-silver', 0)]))
  assert.equal((await f.run({ importId: json })).counts.placed, 1)
  await f.refused({ importId: await f.addImport('[]', 'local-sources') }, /That import is a local-sources file, not deck-plan/)
  await f.refused({ importId: csv, rows: [row(2, 0, 1, 'x', '', 'empty')] }, /importId .* or as rows, not both/)
  await f.refused({}, /importId .* or as rows/)
  await f.refused({ importId: `import_${'f'.repeat(32)}` }, /no such import/)
})

/* --------------------------------------------------------------- resolution --- */

test('keys resolve to published cues: a draft, a set member by panelIndex, and targets overriding both', async () => {
  const f = await fixture()
  const out = await f.run({ dryRun: false, expectedVersion: 1, rows: [
    row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0),
    row(2, 0, 3, 'Lecha Dodi 1', '#009900', 'crc', 'lcha-dodi', 0),
    row(2, 1, 3, 'Lecha Dodi 2', '#009900', 'crc', 'lcha-dodi', 1),
    row(1, 0, 1, 'JLicense Friday', '#000000', 'slide', 'tbi-jlicense-kabbalat-shabbat', 0),
  ], targets: { 'tbi-jlicense-kabbalat-shabbat': 'other-cue' } })
  assert.equal(out.deckVersion, 2)
  assert.deepEqual(out.counts.placed, 4)
  const shir = (await f.at(2, 0, 1))!.spec, l2 = (await f.at(2, 1, 3))!.spec, jl = (await f.at(1, 0, 1))!.spec
  assert.ok(shir.kind === 'cue' && l2.kind === 'cue' && jl.kind === 'cue')
  assert.deepEqual([shir.cueId, shir.label, shir.bg, shir.role], ['draft-shir', 'Shir Chadash - Silver', 0xff80ff, 'single'])
  assert.deepEqual([l2.cueId, l2.role, l2.sequence], ['lecha-2', 'sequence-part', { name: "L'cha Dodi", index: 2, count: 2 }])
  assert.equal(jl.cueId, 'other-cue', 'targets wins over the build key')
  // The same plan again changes nothing.
  const again = await f.run({ dryRun: false, expectedVersion: 2, rows: [row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0)] })
  assert.deepEqual([again.changed, again.counts.unchanged, again.deckVersion], [false, 1, 2])
  // Rebinding a cue key keeps its ids.
  const ids = (await f.at(2, 0, 1))!.ids
  const re = await f.run({ dryRun: false, expectedVersion: 2, rows: [row(2, 0, 1, 'Shir (new)', '#ff80ff', 'local', 'song-shir-chadash-silver', 0)], targets: { 'song-shir-chadash-silver': ['other-cue'] } })
  assert.equal(re.counts.rebound, 1)
  assert.deepEqual((await f.at(2, 0, 1))!.ids, ids)
})

test('an unresolved or unpublished target refuses the whole apply; the dry run lists every one', async () => {
  const f = await fixture()
  const rows = [
    row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0),
    row(2, 0, 2, 'Candles', '#ff4040', 'crc', 'candle-ks', 0),
    row(2, 0, 4, 'Mizmor Shir 1', '#ffff00', 'corpus', 'not-published', 0),
    row(2, 1, 4, 'Mizmor Shir 3', '#ffff00', 'crc', 'lcha-dodi', 2),
    row(2, 1, 5, 'Shir 2', '#ffff00', 'local', 'song-shir-chadash-silver', 1),
    row(2, 2, 5, 'Nothing', '#ffff00', 'local', null),
  ]
  const dry = await f.run({ rows })
  assert.equal(dry.dryRun, true)
  assert.deepEqual(dry.findings.filter((x: { blocking: boolean }) => x.blocking).map((x: { code: string; page: number; row: number; column: number }) => `${x.page}/${x.row}/${x.column}:${x.code}`),
    ['2/0/2:unresolved', '2/0/4:draft-unpublished', '2/1/4:set-part-unpublished', '2/1/5:draft-not-set', '2/2/5:no-key'])
  const first = dry.findings.find((x: { code: string }) => x.code === 'unresolved')
  assert.deepEqual([first.page, first.row, first.column, first.label, first.key], [2, 0, 2, 'Candles', 'candle-ks'])
  assert.match(first.message, /no graphic has been built under the key candle-ks/)
  assert.match(dry.next, /Settle the 5 blocking findings/)
  await f.refused({ rows, dryRun: false, expectedVersion: 1 }, /The plan has 5 rows that can't be applied, so nothing was changed\. Page 2, row 0 column 2 \("Candles", candle-ks\): no graphic/)
  assert.equal((await f.stored()).version, 1)
  assert.equal((await f.at(2, 0, 1))!.spec.kind, 'fragment', 'nothing was placed, not even the resolved row')
  await f.refused({ rows, dryRun: false, expectedVersion: 1, targets: { 'candle-ks': 'nope' } }, /targets names nope for candle-ks, which is not in the catalog/)
})

/* ---------------------------------------------------------- devices and nav --- */

test('camera and OBS keys are kept exactly as they are; one that is not where the plan says is reported', async () => {
  const f = await fixture()
  const before = await f.at(1, 0, 2)
  const out = await f.run({ dryRun: false, expectedVersion: 1, rows: [
    row(1, 0, 2, 'Zoom in', '#000000', 'birddog', 'Birddog:zoom:in'),
    row(1, 0, 5, '', '#000000', 'birddog', 'Birddog:pt:up_left; Birddog:pt:stop'),
    row(8, 2, 1, 'Singular.live - Evening', '#000000', 'obs', 'obs:set_scene:Singular.live - Evening'),
    row(1, 1, 2, 'Zoom in', '#000000', 'birddog', 'Birddog:zoom:in'),
    row(1, 3, 6, 'Tilt', '#000000', 'birddog', 'Birddog:tilt:up'),
    row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0),
  ] })
  assert.equal(out.counts.keptDevice, 3)
  assert.deepEqual(out.findings.map((x: { code: string; blocking: boolean }) => [x.code, x.blocking]), [['device-elsewhere', false], ['device-missing', false]])
  assert.match(out.findings[0].message, /the cell holds "Zoom out"; the deck has it at page 1, row 0 column 2\. Device keys are kept as they are and never rebuilt/)
  assert.match(out.findings[1].message, /the cell is empty, and the deck has no such key anywhere/)
  assert.deepEqual(await f.at(1, 0, 2), before)
  assert.equal((await f.at(1, 1, 2))!.spec.kind, 'fragment', 'the key at the reported cell is untouched')
  // A graphic row on a device key or on the built-in nav is refused; an empty row there is reported and kept.
  await f.refused({ dryRun: false, expectedVersion: 2, rows: [row(1, 0, 3, 'Graphic', '#000000', 'local', 'song-shir-chadash-silver')] }, /holds "Recall\\nPSET\\n1"|holds "Recall/)
  await f.refused({ dryRun: false, expectedVersion: 2, rows: [row(2, 1, 0, 'Graphic', '#000000', 'local', 'song-shir-chadash-silver')] }, /template's page-number key, which a plan never replaces/)
  const kept = await f.run({ dryRun: false, expectedVersion: 2, rows: [row(2, 0, 0, '', '', 'empty'), row(1, 2, 2, '', '', 'empty')] })
  assert.deepEqual(kept.findings.map((x: { code: string }) => x.code), ['empty-kept', 'empty-kept'])
  assert.equal(kept.changed, false)
  assert.deepEqual((await f.at(2, 0, 0))!.spec, { kind: 'builtin', control: 'pageup' })
})

/* ------------------------------------------------------------ empty, dropped --- */

test('empty clears a graphic key; dropped is not placed and takes its old key with it unless another row uses the cell', async () => {
  const f = await fixture()
  const out = await f.run({ dryRun: false, expectedVersion: 1, rows: [
    row(4, 0, 4, 'NEED 176 part 1', '#ffff00', 'empty'),
    row(5, 0, 7, "Ani v'Atah 2", '#660066', 'dropped', "Ani v'atah pt 2"),
    row(5, 1, 7, "Ani v'Atah 1", '#660066', 'dropped', "Ani v'Atah pt 1"),
    row(5, 1, 7, 'Mourn Kadd 2', '#000099', 'local', 'song-shir-chadash-silver', 0),
    row(6, 3, 7, '', '', 'empty'),
  ] })
  assert.deepEqual([out.counts.emptied, out.counts.dropped, out.counts.placed, out.counts.unchanged], [1, 2, 1, 1])
  assert.equal(await f.at(4, 0, 4), undefined)
  assert.equal(await f.at(5, 0, 7), undefined)
  const mk = (await f.at(5, 1, 7))!.spec
  assert.ok(mk.kind === 'cue' && mk.label === 'Mourn Kadd 2')
  assert.deepEqual(out.findings.map((x: { code: string; blocking: boolean }) => [x.code, x.blocking]), [['dropped', false], ['dropped', false]])
  assert.match(out.findings[1].message, /its cell is used by another row/)
  // Two rows claiming one cell refuse.
  await f.refused({ dryRun: false, expectedVersion: 2, rows: [row(2, 0, 1, 'A', '#000000', 'local', 'song-shir-chadash-silver'), row(2, 0, 1, 'B', '', 'empty')] }, /puts two things on page 2, row 0 column 1/)
})

/* -------------------------------------------------------- versions, dry run --- */

test('expectedVersion is required to apply, a stale one is refused, and a dry run writes nothing', async () => {
  const f = await fixture()
  const rows = [row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0)]
  const before = structuredClone(await f.stored())
  const dry = await f.run({ rows })
  assert.deepEqual([dry.dryRun, dry.deckVersion, dry.counts.placed], [true, 1, 1])
  assert.deepEqual(dry.changes, [{ page: 2, row: 0, column: 1, action: 'placed', label: 'Shir Chadash - Silver', cueId: 'draft-shir', cueName: 'Shir Chadash (Silver)', was: 'Shir Chadash - Silver' }])
  assert.match(dry.next, /dryRun:false and expectedVersion:1/)
  assert.deepEqual(await f.stored(), before, 'the dry run saved nothing')
  await f.refused({ rows, dryRun: false }, /Pass expectedVersion/)
  await f.refused({ rows, dryRun: false, expectedVersion: 7 }, /at version 1, not 7; it changed since you read it\. Nothing was changed/)
  assert.deepEqual(await f.stored(), before)
})

/* --------------------------------------------------- lights, colour, validation --- */

test('every placed graphic key carries the Requested and Rendered lights, colours follow the plan, and the validator runs', async () => {
  const f = await fixture()
  const out = await f.run({ dryRun: false, expectedVersion: 1, rows: [
    row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0),
    row(2, 0, 3, 'Lecha Dodi 1', '#FF0000', 'crc', 'lcha-dodi', 0),
    row(2, 1, 3, 'Lecha Dodi 2', '#ffff00', 'crc', 'lcha-dodi', 1),
    row(3, 0, 2, 'New cell', '#000099', 'local', 'song-shir-chadash-silver', 0),
  ] })
  assert.deepEqual(out.findings.map((x: { code: string; blocking: boolean }) => [x.code, x.blocking]), [['colour-hides-light', false]])
  // The seed's other buttons are still unbound placeholders (an error each, so no export leaves with them); nothing else fails.
  assert.deepEqual(out.validation.errors.filter((e: { code: string }) => e.code !== 'placeholder-unbound'), [])
  assert.ok(out.validation.errors.length > 0 && !out.validation.ok)
  assert.equal(out.validation.summary.workspace, 'tbi')
  const deck = (await f.stored()).deck, exported = renderDeck(deck)
  let keys = 0
  for (const p of deck.pages) for (const b of p.buttons) {
    if (b.spec.kind !== 'cue') continue
    keys++
    const ctrl = (exported.pages[p.number] as { controls: Record<string, Record<string, { feedbacks: { definitionId: string; options: { cue?: { value: string } } }[] }>> }).controls[b.row][b.col]
    const lights = ctrl.feedbacks.filter((x) => x.options.cue?.value === (b.spec as { cueId: string }).cueId).map((x) => x.definitionId)
    assert.deepEqual(lights, ['requested', 'rendered'], `${p.number}/${b.row}/${b.col}`)
  }
  assert.equal(keys, 4)
  const lecha2 = (await f.at(2, 1, 3))!.spec, fresh = (await f.at(3, 0, 2))!.spec
  assert.ok(lecha2.kind === 'cue' && fresh.kind === 'cue')
  assert.deepEqual([lecha2.bg, lecha2.color], [0xffff00, 0x000000], 'text colour reads on a new background')
  assert.deepEqual([fresh.bg, fresh.color], [0x000099, 0xffffff])
  // A colour that is not #rrggbb refuses; so does a label longer than a key takes.
  await f.refused({ dryRun: false, expectedVersion: 2, rows: [row(2, 0, 1, 'X', 'red', 'local', 'song-shir-chadash-silver')] }, /the colour "red" is not #rrggbb/)
  await f.refused({ dryRun: false, expectedVersion: 2, rows: [row(2, 0, 1, 'X'.repeat(41), '#000000', 'local', 'song-shir-chadash-silver')] }, /the label is 41 characters; a key takes at most 40/)
  // The dry run reports validate_deck's findings on the would-be deck: a cue that leaves the catalog fails it.
  f.catalog.set('draft-shir', { ...f.catalog.get('draft-shir')!, published: false })
  f.catalog.set('other-cue', f.catalog.get('other-cue')!)
  const dry = await f.run({ rows: [row(2, 0, 4, 'Other', '#000000', 'local', 'x-key')], targets: { 'x-key': 'other-cue' } })
  assert.equal(dry.validation.ok, false)
  assert.ok(dry.validation.errors.some((e: { code: string; page: number; row: number; column: number }) => e.code === 'cue-unpublished' && e.page === 2 && e.row === 0 && e.column === 1))
})

test('a page the plan needs is created on the service template with the built-in nav, and pageName renames', async () => {
  const f = await fixture({ deck: (d) => { d.pages = d.pages.filter((p) => p.number !== 50) } })
  const out = await f.run({ dryRun: false, expectedVersion: 1, rows: [
    { ...row(50, 0, 1, 'Shir', '#ff80ff', 'local', 'song-shir-chadash-silver', 0), pageName: 'Extra' },
    { ...row(2, 0, 1, 'Shir Chadash - Silver', '#ff80ff', 'local', 'song-shir-chadash-silver', 0), pageName: 'Friday' },
  ] })
  assert.deepEqual([out.counts.pagesCreated, out.counts.pagesRenamed], [1, 1])
  assert.deepEqual(out.validation.errors.filter((e: { code: string }) => e.code !== 'placeholder-unbound'), [], 'only the unbound placeholders of the seed fail')
  const page = (await f.stored()).deck.pages.find((p) => p.number === 50)!
  assert.deepEqual([page.name, page.template], ['Extra', 'service'])
  assert.deepEqual(page.buttons.filter((b) => b.spec.kind === 'builtin').map((b) => `${b.row}/${b.col}`), ['0/0', '1/0', '2/0'])
  assert.equal((await f.stored()).deck.pages.find((p) => p.number === 2)!.name, 'Friday')
  await f.refused({ dryRun: false, expectedVersion: 2, rows: [{ ...row(2, 0, 1, 'A', '', 'empty'), pageName: 'One' }, { ...row(2, 0, 2, 'B', '', 'empty'), pageName: 'Two' }] }, /names page 2 "One" and "Two"/)
})
