import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type {AuthInfo} from '@modelcontextprotocol/server'
import {createAuthoringMcpHandler} from '../lib/mcp.ts'
import {companionLabel} from '../lib/companion-deck/model.ts'
import {renderDeck} from '../lib/companion-deck/render.ts'
import {MemoryCompanionDeckRepository} from '../lib/companion-deck/repository.ts'
import {PgCompanionDeckRepository} from '../lib/companion-deck/postgres-repository.ts'
import {exportSigningKey, signExport, verifyExport} from '../lib/companion-deck/export.ts'
import {DEFAULT_SEEDS, DeckToolError, deckCatalogCues, deckToolOperation, labelFor, sameSlot, serviceView, slotTokens, type DeckCatalogCue, type DeckServiceView, type DeckToolContext} from '../lib/companion-deck/tools.ts'
import {DECK_TOOL_NAMES} from '../lib/companion-deck/tool-schemas.ts'
import {handleDeckDownload} from '../app/api/companion/deck/handler.ts'

/* C3 (R-C3, R-C4 full scope) - the Companion deck tools against an in-memory deck store seeded with CRC's
   released deck and a catalog built from the 2026-09-23 snapshot. Nothing here reaches a database, the
   relay or a booth. */

const root = path.resolve(import.meta.dirname, '..')
const plan = path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion')
const snapshot = JSON.parse(fs.readFileSync(path.join(plan, 'catalog-snapshot-2026-09-23.json'), 'utf8')) as {drafts: {id: string; name: string; title?: string; archived: boolean; activeRevision: number}[]}
// C1's hashes: the preset released to Michael on 2026-09-23 (gzip, and the JSON inside it).
const RELEASED_SHA256 = 'bfc718e1b74fc5224da3e32e2db459f7b43ea5fca8bd5e2ef2320942713a1113'
const RELEASED_JSON_SHA256 = '52d1da91e481e06767472e700bebf0e5a0923094eac65d5597b09e53bd232efd'
const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex')

const SEEDED_AT = Date.parse('2026-09-23')
const LATER = SEEDED_AT + 86_400_000
const KIDDUSH_DEBBIE: DeckCatalogCue = {id: 'kiddush-debbie', name: 'Friday Night Kiddush (Debbie Friedman)', title: 'Kiddush', published: true, retired: false, revision: 1, updatedAt: LATER}
const HAREINI = 'e1bd7775-ddf1-468b-b3f7-ac98f11df958'
const KIDDUSH_LONG = 'e1a495c8-836c-4877-a2ac-06f3eec8ac1b'
const KIDDUSH_LONG_2 = '19661732-76c4-4845-a06d-83b71484f782'
const KEY = Buffer.alloc(32, 7)
const ACTOR = 'mcp:test-actor'

function fixture(extra: DeckCatalogCue[] = []) {
  const repository = new MemoryCompanionDeckRepository()
  const catalog = new Map<string, DeckCatalogCue>(snapshot.drafts.map((d) => [d.id, {id: d.id, name: d.name, title: d.title, published: !d.archived && d.activeRevision > 0, retired: false, revision: d.activeRevision, updatedAt: 0}]))
  for (const c of extra) catalog.set(c.id, c)
  const services = new Map<string, DeckServiceView>()
  let now = LATER + 1000, n = 0
  const context: DeckToolContext = {
    workspace: 'crc', repository, catalog: async () => structuredClone([...catalog.values()]),
    service: async (id) => { const s = services.get(id); if (!s) throw new DeckToolError('not_found', `No prepared service has the id ${id}. Call list_services to find it.`, 404); return s },
    now: () => ++now, id: () => `id-${++n}`, signingKey: KEY, origin: 'https://crc.example',
  }
  const run = (op: string, input: Record<string, unknown> = {}) => deckToolOperation(op, input, ACTOR, context) as Promise<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
  const refused = async (op: string, input: Record<string, unknown>, pattern: RegExp) => {
    await assert.rejects(run(op, input), (e: unknown) => { assert.ok(e instanceof DeckToolError, String(e)); assert.match((e as Error).message, pattern); return true })
  }
  const version = async () => (await run('get_deck')).deckVersion as number
  const stored = async () => (await repository.get('crc'))!
  return {repository, catalog, services, context, run, refused, version, stored}
}
const cell = (page: Record<string, any>, row: number, column: number) => // eslint-disable-line @typescript-eslint/no-explicit-any
  (page.cells as {row: number; column: number}[]).find((c) => c.row === row && c.column === column) as Record<string, any> | undefined // eslint-disable-line @typescript-eslint/no-explicit-any

/* ------------------------------------------------------------ store and seed --- */

test('get_deck seeds CRC on the first read (version 1) and answers in brief; TBI refuses until it is seeded', async () => {
  const f = fixture()
  assert.equal(await f.repository.get('crc'), null)
  const deck = await f.run('get_deck')
  assert.equal(deck.deckVersion, 1)
  assert.equal(deck.counts.pages, 54)
  assert.equal(deck.counts.buttons, 1460)
  assert.equal(deck.syncedAt, SEEDED_AT)
  assert.deepEqual(deck.chains[0], [4, 5, 6, 7, 8, 9])
  assert.ok(deck.connections.some((c: {label: string; role?: string}) => c.role === 'overlays'))
  assert.equal((await f.stored()).createdBy, 'seed')
  assert.equal((await f.run('get_deck')).deckVersion, 1, 'a second read does not re-seed')
  const tbi = {...f.context, workspace: 'tbi' as const}
  await assert.rejects(deckToolOperation('get_deck', {}, ACTOR, tbi), /The TBI deck hasn't been seeded yet/)
  await assert.rejects(deckToolOperation('get_deck', {}, ACTOR, {...f.context, workspace: null}), /not one of the congregations with a Companion deck/)
})

test('the seed never shares gesture or sequence objects with the manifest (C2 note)', async () => {
  const a = await DEFAULT_SEEDS.crc!(), b = await DEFAULT_SEEDS.crc!()
  const key = a.pages.find((p) => p.number === 4)!.buttons.find((x) => x.row === 0 && x.col === 2)!
  assert.equal(key.spec.kind, 'cue')
  ;(key.spec as {gesture: {in: {preset: number}}}).gesture.in.preset = 99
  const again = b.pages.find((p) => p.number === 4)!.buttons.find((x) => x.row === 0 && x.col === 2)!
  assert.notEqual((again.spec as {gesture: {in: {preset: number}}}).gesture.in.preset, 99)
})

test('get_deck_page reads a page cell by cell with fixed keys, cues, gestures and free cells', async () => {
  const f = fixture()
  const page = await f.run('get_deck_page', {page: 9})
  assert.equal(page.name, 'Fri 6')
  assert.deepEqual(page.chain, {prev: 8, next: 1})
  assert.equal(cell(page, 0, 1)!.cueId, KIDDUSH_LONG)
  assert.equal(cell(page, 0, 1)!.role, 'sequence-part')
  assert.equal(cell(page, 1, 6)!.fixed, 'clear-now')
  assert.ok(page.free.includes('r2c2'))
  const fri1 = await f.run('get_deck_page', {page: 4})
  assert.equal(cell(fri1, 0, 2)!.gesture.in.camera, 'Left')
  await f.refused('get_deck_page', {page: 70}, /no page 70/)
})

test('PgCompanionDeckRepository: versioned insert and replace, conflicts, sanitized documents', async () => {
  const rows = new Map<string, {workspace_id: string; document: unknown; version: number; created_at: number; updated_at: number; created_by: string; updated_by: string}>()
  const sql: string[] = []
  const connection = {
    async query(text: string, values: unknown[] = []) {
      sql.push(text.split(' ')[0])
      if (text.startsWith('SELECT')) { const r = rows.get(values[0] as string); return {rows: r ? [r] : [], rowCount: r ? 1 : 0} }
      if (text.startsWith('INSERT')) {
        if (rows.has(values[0] as string)) return {rows: [], rowCount: 0}
        const r = {workspace_id: values[0] as string, document: values[1], version: 1, created_at: values[2] as number, updated_at: values[2] as number, created_by: values[3] as string, updated_by: values[3] as string}
        rows.set(r.workspace_id, r); return {rows: [r], rowCount: 1}
      }
      const r = rows.get(values[0] as string)
      if (!r || r.version !== values[4]) return {rows: [], rowCount: 0}
      Object.assign(r, {document: values[1], version: r.version + 1, updated_at: values[2], updated_by: values[3]})
      return {rows: [r], rowCount: 1}
    },
  }
  const repo = new PgCompanionDeckRepository(connection)
  const deck = await DEFAULT_SEEDS.crc!()
  assert.equal(await repo.get('crc'), null)
  const created = await repo.create('crc', deck, 'seed', 5)
  assert.equal(created.version, 1)
  await assert.rejects(repo.create('crc', deck, 'seed', 6), /changed in another session/)
  const replaced = await repo.replace('crc', deck, 1, 'mcp:a', 7)
  assert.equal(replaced.version, 2); assert.equal(replaced.updatedBy, 'mcp:a'); assert.equal(replaced.createdAt, 5)
  await assert.rejects(repo.replace('crc', deck, 1, 'mcp:b', 8), /changed in another session/)
  await assert.rejects(repo.create('tbi', deck, 'seed', 9), /cannot be stored for tbi/)
  const dirty = structuredClone(deck); (dirty.connections[0] as unknown as {config: unknown}).config = {}
  await assert.rejects(repo.replace('crc', dirty, 2, 'x', 10), /config must never be stored/)
  assert.deepEqual(sql, ['SELECT', 'INSERT', 'INSERT', 'UPDATE', 'UPDATE'])
})

/* ------------------------------------------------------------------- export --- */

test('export of the unchanged seed is the released preset byte for byte, and every connection label is exact', async () => {
  const f = fixture()
  const link = await f.run('export_deck_config', {scope: 'full'})
  assert.equal(link.sha256, RELEASED_SHA256)
  assert.equal(link.deckVersion, 1)
  assert.match(link.url, /^https:\/\/crc\.example\/api\/companion\/deck\?token=/)
  assert.ok(link.connections.length > 0)
  for (const c of link.connections) { assert.equal(c.exact, true, c.label); assert.equal(companionLabel(c.label), c.label) }
  const deck = (await f.stored()).deck
  const labels = new Set(deck.connections.map((c) => c.label))
  for (const inst of Object.values(renderDeck(deck).instances)) assert.ok(labels.has(String(inst.label)))

  // The signed link serves exactly those bytes.
  const response = await handleDeckDownload(new Request(link.url), {context: f.context, member: async () => null, signingKey: KEY, now: () => LATER + 2000})
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-disposition')!, /attachment; filename="crc-companion-deck-v1-\d{4}-\d{2}-\d{2}\.companionconfig"/)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(sha256(bytes), RELEASED_SHA256)
  assert.equal(sha256(zlib.gunzipSync(bytes)), RELEASED_JSON_SHA256)
  assert.ok(!/"config"|"secrets"/.test(zlib.gunzipSync(bytes).toString('utf8')))
})

test('export links: expired, tampered and stale links are refused; the Setup download needs a member', async () => {
  const f = fixture([KIDDUSH_DEBBIE])
  const link = await f.run('export_deck_config', {})
  const req = (url: string) => new Request(url)
  const deps = (now: number, member: {id: string} | null = null) => ({context: f.context, member: async () => member, signingKey: KEY, now: () => now})
  assert.equal((await handleDeckDownload(req(link.url), deps(link.expiresAt + 1))).status, 403)
  assert.equal((await handleDeckDownload(req(link.url.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A'))), deps(LATER))).status, 403)
  const other = signExport({w: 'crc', v: 1, scope: 'full', sha: 'x', exp: LATER + 10_000}, Buffer.alloc(32, 1))
  assert.equal((await handleDeckDownload(req(`https://crc.example/api/companion/deck?token=${other}`), deps(LATER))).status, 403)
  // The deck changes: the old link names version 1 and is refused in words.
  await f.run('sync_deck_with_catalog', {dryRun: false, expectedVersion: 1})
  const stale = await handleDeckDownload(req(link.url), deps(LATER + 5000))
  assert.equal(stale.status, 410)
  assert.match(await stale.text(), /version 1, and the deck is now at version 2. Ask for a new export link/)
  // Setup page: signed-in member → redirect to a fresh link; nobody → 401.
  assert.equal((await handleDeckDownload(req('https://crc.example/api/companion/deck?download=full'), deps(LATER))).status, 401)
  const redirect = await handleDeckDownload(req('https://crc.example/api/companion/deck?download=full'), deps(LATER, {id: 'm1'}))
  assert.equal(redirect.status, 303)
  const fresh = await handleDeckDownload(req(redirect.headers.get('location')!), deps(LATER + 1))
  assert.equal(fresh.status, 200)
  // Keys: a dedicated key wins, otherwise one derived from a deployment secret, never the secret itself.
  assert.equal(exportSigningKey({}), null)
  assert.deepEqual(exportSigningKey({COMPANION_EXPORT_KEY: 'k'.repeat(40)}), Buffer.from('k'.repeat(40)))
  const derived = exportSigningKey({RELAY_SECRET: 'relay-secret-value'})!
  assert.notDeepEqual(derived, Buffer.from('relay-secret-value'))
  assert.equal(verifyExport(signExport({w: 'crc', v: 3, scope: 'full', sha: 'a', exp: 10}, derived), derived, 5)?.v, 3)
  await assert.rejects(deckToolOperation('export_deck_config', {}, ACTOR, {...f.context, signingKey: null}), /not configured/)
})

test('export refuses a deck with errors, and a stale expectedVersion', async () => {
  const f = fixture()
  await f.refused('export_deck_config', {expectedVersion: 4}, /version 1, not 4/)
  f.catalog.get(HAREINI)!.published = false
  await f.refused('export_deck_config', {}, /so it was not exported.*Hareini.*not published/)
})

/* ----------------------------------------------------------------- the sync --- */

test('acceptance: a new Friday Kiddush alternate lands in the Kiddush column of the Friday page (Fri 6)', async () => {
  const f = fixture([KIDDUSH_DEBBIE])
  const dry = await f.run('sync_deck_with_catalog', {})
  assert.equal(dry.dryRun, true)
  assert.equal(dry.placed.length, 1)
  assert.deepEqual({page: dry.placed[0].page, row: dry.placed[0].row, column: dry.placed[0].column, role: dry.placed[0].role, label: dry.placed[0].label}, {page: 9, row: 2, column: 2, role: 'alternate', label: 'Kiddush (Debbie Friedman)'})
  assert.match(dry.placed[0].why, /shares column 2 with its slot/)
  assert.equal(await f.version(), 1, 'a dry run saves nothing')
  await f.refused('sync_deck_with_catalog', {dryRun: false}, /Pass expectedVersion/)
  const applied = await f.run('sync_deck_with_catalog', {dryRun: false, expectedVersion: 1})
  assert.equal(applied.deckVersion, 2)
  assert.equal(applied.validation.ok, true)
  const page = await f.run('get_deck_page', {page: 9})
  assert.equal(cell(page, 2, 2)!.cueId, 'kiddush-debbie')
  assert.equal(cell(page, 0, 2)!.label, 'Kiddush Shirei 1/2', 'the slot column keeps its keys')
  const again = await f.run('sync_deck_with_catalog', {})
  assert.equal(again.placed.length, 0, 'once placed and synced, nothing more to do')
  assert.equal((await f.run('validate_deck')).ok, true)
})

test('sync: a cue that shares a slot on several pages is reported with the candidates until a placement says which', async () => {
  const f = fixture([{id: 'kiddush-klepper', name: 'Kiddush (Klepper)', published: true, retired: false, revision: 1, updatedAt: LATER}])
  const dry = await f.run('sync_deck_with_catalog', {})
  assert.equal(dry.placed.length, 0)
  assert.deepEqual(dry.unplaced[0].candidatePages.map((p: {page: number}) => p.page), [9, 16, 25])
  assert.match(dry.unplaced[0].reason, /Say which with placements/)
  const placed = await f.run('sync_deck_with_catalog', {placements: [{cueId: 'kiddush-klepper', page: 16}]})
  assert.equal(placed.placed[0].page, 16)
  const exact = await f.run('sync_deck_with_catalog', {placements: [{cueId: 'kiddush-klepper', page: 9, row: 3, column: 2, label: 'Klepper'}]})
  assert.deepEqual([exact.placed[0].page, exact.placed[0].row, exact.placed[0].column, exact.placed[0].label], [9, 3, 2, 'Klepper'])
  const none = await f.run('sync_deck_with_catalog', {cueIds: ['nope']})
  assert.match(none.unplaced[0].reason, /not in the catalog/)
  const unrelated = fixture([{id: 'new-song', name: 'Zzyzx Niggun', published: true, retired: false, revision: 1, updatedAt: LATER}])
  assert.match((await unrelated.run('sync_deck_with_catalog', {})).unplaced[0].reason, /No page holds its slot yet/)
})

test('sync: a new sequence part continues down its column and into the next', async () => {
  const set = (index: number, count = 3) => ({id: 'kiddush-long-set', index, count})
  const f = fixture([{id: 'kiddush-long-3', name: 'Kiddush (long) 3', published: true, retired: false, revision: 1, updatedAt: LATER, set: set(3)}])
  f.catalog.get(KIDDUSH_LONG)!.set = set(1); f.catalog.get(KIDDUSH_LONG_2)!.set = set(2)
  const dry = await f.run('sync_deck_with_catalog', {})
  // Column 1 is full (Kiddush 1/2, 2/2, short, wine), so the third part continues into column 2's first free cell.
  assert.deepEqual([dry.placed[0].page, dry.placed[0].row, dry.placed[0].column, dry.placed[0].role], [9, 2, 2, 'sequence-part'])
  assert.match(dry.placed[0].why, /continues its sequence into column 2/)
  assert.equal(dry.placed[0].label, 'Kiddush (long) 3')
  // A new two-part sequence with no empty column on its page is reported, not squeezed in.
  const g = fixture([1, 2].map((i) => ({id: `medley-${i}`, name: `Friday Night Kiddush Medley — ${i} of 2`, title: 'Kiddush Medley', published: true, retired: false, revision: 1, updatedAt: LATER, set: {id: 'medley', index: i, count: 2}})))
  const r = await g.run('sync_deck_with_catalog', {})
  assert.equal(r.placed.length, 0)
  assert.match(r.unplaced[0].reason, /no empty column to start its sequence/)
})

test('sync: renamed cues are relabelled when the label came from the name, hand-written labels are flagged, revisions noted', async () => {
  const f = fixture()
  f.catalog.get(HAREINI)!.name = 'Hareini (Carlebach)'
  f.catalog.get(KIDDUSH_LONG)!.name = 'Kiddush (long form)'
  f.catalog.get(KIDDUSH_LONG_2)!.revision = 7
  const dry = await f.run('sync_deck_with_catalog', {})
  const hareini = dry.relabelled.filter((x: {cueId: string}) => x.cueId === HAREINI)
  assert.deepEqual(hareini.map((x: {page: number; to: string}) => [x.page, x.to]), [[4, 'Hareini (Carlebach)'], [10, 'Hareini (Carlebach)']])
  const flagged = dry.flagged.find((x: {cueId: string}) => x.cueId === KIDDUSH_LONG)
  assert.match(flagged.reason, /renamed from "Kiddush \(long\)" to "Kiddush \(long form\)".*written by hand/)
  assert.equal(dry.revised.find((x: {cueId: string}) => x.cueId === KIDDUSH_LONG_2).revision.to, 7)
  const all = await f.run('sync_deck_with_catalog', {relabelHandWritten: true})
  assert.ok(all.relabelled.some((x: {cueId: string; to: string}) => x.cueId === KIDDUSH_LONG && x.to === 'Kiddush (long form)'))
  // Quote-mark-only differences (’ vs ') are not a rename.
  assert.ok(!dry.flagged.some((x: {reason: string}) => /Shiru/.test(x.reason)))
})

test('sync: keys bound to a retired cue are removed (or flagged); unpublished ones are flagged, never removed', async () => {
  const f = fixture()
  f.catalog.get(HAREINI)!.retired = true
  const flagOnly = await f.run('sync_deck_with_catalog', {retired: 'flag'})
  assert.equal(flagOnly.removed.length, 0)
  assert.equal(flagOnly.flagged.filter((x: {cueId: string}) => x.cueId === HAREINI).length, 2)
  const applied = await f.run('sync_deck_with_catalog', {dryRun: false, expectedVersion: 1})
  assert.deepEqual(applied.removed.map((x: {page: number; row: number; column: number}) => [x.page, x.row, x.column]), [[4, 0, 2], [10, 2, 2]])
  assert.equal(cell(await f.run('get_deck_page', {page: 4}), 0, 2), undefined)
  const g = fixture()
  g.catalog.get(HAREINI)!.published = false
  const r = await g.run('sync_deck_with_catalog', {})
  assert.equal(r.removed.length, 0)
  assert.match(r.flagged.find((x: {cueId: string}) => x.cueId === HAREINI).reason, /no longer published/)
})

/* ------------------------------------------------------- check_service_on_deck --- */

test('check_service_on_deck reports placed and missing graphics, and where the missing ones would go', async () => {
  const f = fixture([KIDDUSH_DEBBIE, {id: 'draft-only', name: 'Unpublished thing', published: false, retired: false, revision: null}])
  f.services.set('svc-1', serviceView({
    id: 'svc-1', name: 'Friday night', service: 'Shabbat Evening',
    entries: [{id: 'e1', label: 'Hareini', cueIds: [HAREINI]}, {id: 'e2', label: 'Kiddush', cueIds: ['kiddush-debbie', KIDDUSH_LONG]}],
    coverage: [{id: 'c1', label: 'Sermon slide', status: 'covered', cueId: 'draft-only'}, {id: 'c2', label: 'Blessing', status: 'needs-cue'}],
    rows: [{label: 'Hareini', entryId: 'e1'}, {label: 'Kiddush', entryId: 'e2'}, {label: 'Sermon slide', coverageId: 'c1'}, {label: 'Blessing', coverageId: 'c2'}],
  }))
  const check = await f.run('check_service_on_deck', {serviceId: 'svc-1'})
  assert.equal(check.ready, false)
  assert.equal(check.needed, 4)
  assert.deepEqual(check.placed.map((p: {cueId: string}) => p.cueId), [HAREINI, KIDDUSH_LONG])
  assert.deepEqual(check.placed[0].on.map((o: {page: number}) => o.page), [4, 10])
  const debbie = check.missing.find((m: {cueId: string}) => m.cueId === 'kiddush-debbie')
  assert.deepEqual([debbie.wouldGo.page, debbie.wouldGo.row, debbie.wouldGo.column], [9, 2, 2])
  assert.match(check.missing.find((m: {cueId: string}) => m.cueId === 'draft-only').reason, /not published/)
  assert.equal(await f.version(), 1, 'the check reads only')
  // The headline step: sync, then the check passes for everything placeable.
  f.catalog.get('draft-only')!.published = true
  await f.run('sync_deck_with_catalog', {dryRun: false, expectedVersion: 1, cueIds: ['kiddush-debbie']})
  const after = await f.run('check_service_on_deck', {serviceId: 'svc-1'})
  assert.equal(after.missing.filter((m: {cueId: string}) => m.cueId === 'kiddush-debbie').length, 0)
  await f.refused('check_service_on_deck', {serviceId: 'nope'}, /No prepared service has the id nope/)
})

/* ----------------------------------------------------------------- page tools --- */

test('create, rename, move and delete a page: chains, Prev/Next labels and jumps follow', async () => {
  const f = fixture()
  const created = await f.run('create_page', {expectedVersion: 1, page: 57, name: 'Fri 7', template: 'service', chainAfter: 9})
  assert.equal(created.deckVersion, 2); assert.equal(created.validation.ok, true)
  const fri6 = await f.run('get_deck_page', {page: 9})
  assert.equal(cell(fri6, 2, 7)!.label, 'Next ▸\nFri 7'); assert.equal(cell(fri6, 2, 7)!.jumpsTo, 57)
  const fri7 = await f.run('get_deck_page', {page: 57})
  assert.deepEqual(fri7.chain, {prev: 9, next: 1})
  assert.equal(cell(fri7, 0, 7)!.label, '◂ Prev\nFri 6'); assert.equal(cell(fri7, 3, 7)!.label, 'Bimah\nMute'); assert.equal(cell(fri7, 0, 0)!.kind, 'camera')
  await f.run('rename_page', {expectedVersion: 2, page: 57, name: 'Fri 7 · Oneg'})
  assert.equal(cell(await f.run('get_deck_page', {page: 9}), 2, 7)!.label, 'Next ▸\nFri 7 · Oneg')
  await f.run('move_page', {expectedVersion: 3, page: 57, to: 58})
  assert.deepEqual((await f.run('get_deck')).chains[0], [4, 5, 6, 7, 8, 9, 58])
  assert.equal(cell(await f.run('get_deck_page', {page: 9}), 2, 7)!.jumpsTo, 58)
  await f.run('delete_page', {expectedVersion: 4, page: 58})
  const back = await f.run('get_deck_page', {page: 9})
  assert.equal(cell(back, 2, 7)!.label, 'Next ▸\nHome')
  assert.deepEqual((await f.run('get_deck')).chains[0], [4, 5, 6, 7, 8, 9])
  // The unchanged-again deck renders the released preset.
  assert.equal((await f.run('export_deck_config', {})).sha256, RELEASED_SHA256)
})

test('page tools refuse in plain sentences, and a page nothing reaches is refused', async () => {
  const f = fixture()
  await f.refused('create_page', {expectedVersion: 1, page: 9, name: 'x', template: 'service'}, /Page 9 already exists \("Fri 6"\)/)
  await f.refused('create_page', {expectedVersion: 1, page: 60, name: 'x', template: 'nope'}, /no page template "nope"/)
  await f.refused('create_page', {expectedVersion: 1, page: 60, name: 'Loose', template: 'utility'}, /nothing was saved.*cannot be reached from Home/)
  const linked = await f.run('create_page', {expectedVersion: 1, page: 60, name: 'Loose', template: 'utility', jumpFrom: {page: 1, row: 0, column: 7}})
  assert.equal(linked.validation.ok, true)
  await f.refused('delete_page', {expectedVersion: 2, page: 60}, /1 key still jump to page 60 \(first: page 1 "Home", row 0 column 7\)/)
  await f.refused('delete_page', {expectedVersion: 2, page: 1}, /Home; it cannot be deleted/)
  await f.refused('move_page', {expectedVersion: 2, page: 1, to: 70}, /Home.*cannot move/)
  await f.refused('rename_page', {expectedVersion: 1, page: 9, name: 'x'}, /version 2, not 1; it changed since you read it/)
})

test('apply_template puts back the template keys and is a no-op on a page that has them', async () => {
  const f = fixture()
  const noop = await f.run('apply_template', {expectedVersion: 1, page: 5})
  assert.equal(noop.changed, false); assert.match(noop.change, /already carries every key/)
  await f.refused('remove_button', {expectedVersion: 1, page: 5, row: 1, column: 6}, /nothing was saved.*should hold the clear-now key/)
  await f.refused('apply_template', {expectedVersion: 1, page: 27, template: 'service'}, /nothing was saved/)
})

/* --------------------------------------------------------------- button tools --- */

test('place, move, bind and remove keys; a key the deck forbids is refused and nothing is saved', async () => {
  const f = fixture([KIDDUSH_DEBBIE, {id: 'not-yet', name: 'Not yet', published: false, retired: false, revision: null}])
  const placed = await f.run('place_button', {expectedVersion: 1, page: 9, row: 2, column: 2, button: {kind: 'cue', cueId: 'kiddush-debbie', role: 'alternate'}})
  assert.equal(placed.deckVersion, 2)
  assert.equal(cell(await f.run('get_deck_page', {page: 9}), 2, 2)!.label, 'Kiddush (Debbie Friedman)')
  await f.refused('place_button', {expectedVersion: 2, page: 9, row: 2, column: 2, button: {kind: 'merge'}}, /already holds "Kiddush \(Debbie Friedman\)"/)
  await f.refused('place_button', {expectedVersion: 2, page: 9, row: 3, column: 2, button: {kind: 'cue', cueId: 'missing'}}, /no cue missing in the catalog/)
  await f.refused('place_button', {expectedVersion: 2, page: 9, row: 3, column: 2, button: {kind: 'cue', cueId: 'not-yet'}}, /nothing was saved.*not published/)
  await f.refused('place_button', {expectedVersion: 2, page: 9, row: 3, column: 2, button: {kind: 'builtin', control: 'pageup'}}, /nothing was saved.*built-in pageup/)
  await f.refused('place_button', {expectedVersion: 2, page: 9, row: 5, column: 2, button: {kind: 'merge'}}, /outside the deck's 4×8 grid/)
  assert.equal(await f.version(), 2)
  await f.run('move_button', {expectedVersion: 2, page: 9, row: 2, column: 2, to: {page: 9, row: 3, column: 2}})
  const moved = await f.run('get_deck_page', {page: 9})
  assert.equal(cell(moved, 3, 2)!.cueId, 'kiddush-debbie'); assert.equal(cell(moved, 2, 2), undefined)
  const bound = await f.run('bind_cue', {expectedVersion: 3, page: 4, row: 0, column: 2, cueId: 'kiddush-debbie'})
  assert.match(bound.change, /now fires "Friday Night Kiddush \(Debbie Friedman\)" \(was Hareini\)/)
  const fri1 = await f.run('get_deck_page', {page: 4})
  assert.equal(cell(fri1, 0, 2)!.gesture.in.camera, 'Left', 'the gesture stays with the key')
  assert.equal(cell(fri1, 0, 2)!.label, 'Kiddush (Debbie Friedman)', 'the new label drops the service word the Friday page already says')
  await f.refused('bind_cue', {expectedVersion: 4, page: 4, row: 0, column: 7, cueId: HAREINI}, /is a jump key/)
  await f.run('remove_button', {expectedVersion: 4, page: 9, row: 3, column: 2})
  assert.equal(cell(await f.run('get_deck_page', {page: 9}), 3, 2), undefined)
})

test('placing a device key twice mints new ids; a copy never shares an entity id with its original', async () => {
  const f = fixture()
  await f.version()
  const before = (await f.stored()).deck
  assert.equal(before.fragments['1/0/3']?.kind, 'control')
  await f.run('place_button', {expectedVersion: 1, page: 1, row: 0, column: 7, button: {kind: 'copy', from: {page: 1, row: 0, column: 3}}})
  await f.run('place_button', {expectedVersion: 2, page: 1, row: 2, column: 7, button: {kind: 'fragment', fragment: '1/0/3'}})
  const deck = (await f.stored()).deck
  const exported = renderDeck(deck)
  const ids = (ctrl: unknown): string[] => [...(JSON.stringify(ctrl).match(/"id":"[A-Za-z0-9_-]{21}"/g) ?? [])]
  const home = exported.pages['1'].controls as Record<string, Record<string, unknown>>
  const original = ids(home[0][3]), copy = ids(home[0][7]), third = ids(home[2][7])
  assert.ok(original.length > 0)
  assert.equal(original.filter((id) => copy.includes(id) || third.includes(id)).length, 0)
  assert.equal(copy.filter((id) => third.includes(id)).length, 0)
  // Everything else still renders exactly as released.
  const released = renderDeck((await DEFAULT_SEEDS.crc!()))
  assert.equal(JSON.stringify(exported.pages['9']), JSON.stringify(released.pages['9']))
})

test('attach_camera_gesture: add with the page return, copy, remove; refused where the template has no gestures', async () => {
  const f = fixture([KIDDUSH_DEBBIE])
  await f.run('place_button', {expectedVersion: 1, page: 9, row: 2, column: 2, button: {kind: 'cue', cueId: 'kiddush-debbie'}})
  const added = await f.run('attach_camera_gesture', {expectedVersion: 2, page: 9, row: 2, column: 2, gesture: {in: {camera: 'Left', preset: 2, input: 'left cam 2'}}})
  assert.equal(added.validation.ok, true)
  const g = cell(await f.run('get_deck_page', {page: 9}), 2, 2)!.gesture
  assert.deepEqual(g, {in: {camera: 'Left', preset: 2, input: 'left cam 2'}, out: {camera: 'Center', preset: 1, input: 'center cam 1'}})
  await f.refused('attach_camera_gesture', {expectedVersion: 3, page: 9, row: 2, column: 2, gesture: {in: {camera: 'Nowhere', preset: 2, input: 'left cam 2'}}}, /nothing was saved.*"Nowhere".*silently/)
  await f.run('attach_camera_gesture', {expectedVersion: 3, page: 9, row: 2, column: 2, gesture: null})
  assert.equal(cell(await f.run('get_deck_page', {page: 9}), 2, 2)!.gesture, undefined)
  await f.run('attach_camera_gesture', {expectedVersion: 4, page: 9, row: 2, column: 2, from: {page: 4, row: 0, column: 2}})
  assert.equal(cell(await f.run('get_deck_page', {page: 9}), 2, 2)!.gesture.in.preset, 3)
  await f.refused('attach_camera_gesture', {expectedVersion: 5, page: 1, row: 1, column: 5, gesture: {in: {camera: 'Left', preset: 2, input: 'left cam 2'}}}, /allows no camera gestures/)
})

test('layout_column: the grammar order, an explicit order, and back', async () => {
  const f = fixture()
  const same = await f.run('layout_column', {expectedVersion: 1, page: 9, column: 1})
  assert.equal(same.changed, false)
  const page = await f.run('get_deck_page', {page: 9})
  const col2 = [cell(page, 0, 2)!.cueId, cell(page, 1, 2)!.cueId]
  await f.run('layout_column', {expectedVersion: 1, page: 9, column: 2, order: [col2[1], col2[0]]})
  const swapped = await f.run('get_deck_page', {page: 9})
  assert.deepEqual([cell(swapped, 0, 2)!.cueId, cell(swapped, 1, 2)!.cueId], [col2[1], col2[0]])
  await f.run('layout_column', {expectedVersion: 2, page: 9, column: 2})
  const restored = await f.run('get_deck_page', {page: 9})
  assert.deepEqual([cell(restored, 0, 2)!.cueId, cell(restored, 1, 2)!.cueId], col2)
  await f.refused('layout_column', {expectedVersion: 3, page: 9, column: 2, order: [col2[0]]}, /must list the 2 cue ids/)
  await f.refused('layout_column', {expectedVersion: 3, page: 9, column: 0}, /Column 0 of page 9 holds no cue keys/)
})

test('validate_deck returns findings with page, row and column', async () => {
  const f = fixture()
  const ok = await f.run('validate_deck')
  assert.equal(ok.ok, true); assert.equal(ok.errors.length, 0); assert.ok(ok.summary.cueIdsBound > 200)
  f.catalog.get(HAREINI)!.retired = true
  const bad = await f.run('validate_deck')
  assert.equal(bad.ok, false)
  assert.deepEqual(bad.errors.filter((e: {code: string}) => e.code === 'cue-retired').map((e: {page: number; row: number; column: number}) => [e.page, e.row, e.column]), [[4, 0, 2], [10, 2, 2]])
})

test('grammar helpers: slot words and labels', () => {
  assert.deepEqual([...slotTokens("Friday Night Kiddush with Vay'chulu (Supplement) — 1 of 2")], ['kiddush', 'vaychulu'])
  assert.ok(sameSlot(slotTokens('Kiddush (long) 2'), slotTokens('Friday Night Kiddush (Debbie Friedman)')))
  assert.ok(!sameSlot(slotTokens('Shalom Rav'), slotTokens('Shalom Aleichem 1')))
  assert.equal(labelFor('Aleinu — 2 of 4'), 'Aleinu 2/4')
  assert.equal(labelFor('Friday Night Kiddush (Debbie Friedman)', ['friday night', 'friday']), 'Kiddush (Debbie Friedman)')
})

/* ------------------------------------------------------------------------ MCP --- */

test('MCP: every deck tool is registered, writes need the workspace, refusals come back as sentences', async () => {
  const f = fixture([KIDDUSH_DEBBIE])
  const authInfo = {token: 't', clientId: 'c', scopes: ['crc.authoring'], expiresAt: Math.floor(Date.now() / 1000) + 60, resource: new URL('https://crc.example/api/mcp'), extra: {actor: ACTOR}} satisfies AuthInfo
  const handler = createAuthoringMcpHandler((op, input, actor) => deckToolOperation(op, input, actor, f.context))
  let rpc = 0
  const call = async (method: string, params: unknown) => {
    const response = await handler.fetch(new Request('https://crc.example/api/mcp', {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'}, body: JSON.stringify({jsonrpc: '2.0', id: ++rpc, method, params})}), {authInfo})
    const text = await response.text()
    return JSON.parse(response.headers.get('content-type')?.includes('application/json') ? text : text.split(/\r?\n/).find((l) => l.startsWith('data: '))!.slice(6)) as {result: {tools?: {name: string; inputSchema: {required?: string[]}}[]; isError?: boolean; content: {text: string}[]}}
  }
  const tools = (await call('tools/list', {})).result.tools!
  for (const name of DECK_TOOL_NAMES) assert.ok(tools.some((t) => t.name === name), name)
  assert.ok(!tools.some((t) => t.name === 'generate_service_page'), 'no weekly service page (STATE decision 8)')
  assert.ok(tools.find((t) => t.name === 'place_button')!.inputSchema.required!.includes('workspace'))
  assert.ok(!(tools.find((t) => t.name === 'get_deck')!.inputSchema.required ?? []).includes('workspace'))
  const read = await call('tools/call', {name: 'get_deck', arguments: {}})
  const body = JSON.parse(read.result.content[0].text)
  assert.equal(body.shortName, 'CRC'); assert.equal(body.deckVersion, 1)
  const noWorkspace = await call('tools/call', {name: 'sync_deck_with_catalog', arguments: {}})
  assert.equal(noWorkspace.result.isError, true)
  const conflict = await call('tools/call', {name: 'remove_button', arguments: {workspace: 'crc', expectedVersion: 9, page: 9, row: 0, column: 1}})
  assert.equal(conflict.result.isError, true)
  assert.match(conflict.result.content[0].text, /deck is at version 1, not 9/)
  const synced = await call('tools/call', {name: 'sync_deck_with_catalog', arguments: {workspace: 'crc'}})
  assert.equal(JSON.parse(synced.result.content[0].text).placed[0].page, 9)
})

test('the deck catalog knows a graphic A3 retired, in the catalog or already gone from it', () => {
  const base = {version: 3, sourcePin: {} as never, activeDraftVersion: 2, createdAt: 1, updatedAt: 2, createdBy: 'a', updatedBy: 'a', name: 'Kiddush', title: 'Kiddush'}
  const live = {...base, id: 'cue-live', activeRevision: 2} as unknown as Parameters<typeof deckCatalogCues>[1][number]
  const retired = {...base, id: 'cue-retired', activeRevision: null, retired: {revision: 2, draftVersion: 2, retiredAt: 3, retiredBy: 'mcp:x'}} as unknown as Parameters<typeof deckCatalogCues>[1][number]
  const cues = deckCatalogCues([{id: 'cue-live', name: 'Kiddush'}], [live, retired])
  assert.deepEqual(cues.map((cue) => [cue.id, cue.retired, cue.published]), [['cue-live', false, true], ['cue-retired', true, false]])
})
