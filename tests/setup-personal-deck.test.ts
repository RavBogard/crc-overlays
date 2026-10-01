import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import type {AccessMember, AccessPermission} from '../lib/access.ts'
import {MemoryDeviceStore, parseDeviceToken} from '../lib/devices.ts'
import {fullExport} from '../lib/companion-deck/export.ts'
import {assertSanitized, type CompanionDeck} from '../lib/companion-deck/model.ts'
import {PersonalDeckError, VALUES_ENV, personalExport, personalFileName, readConnectionValues, type ValuesSecret} from '../lib/companion-deck/personal.ts'
import {MemoryCompanionDeckRepository} from '../lib/companion-deck/repository.ts'
import {DEFAULT_SEEDS, validatedDeck, type DeckCatalogCue, type DeckToolContext} from '../lib/companion-deck/tools.ts'
import {SETUP_FLOWS, companionPress, foldPress, personalDeviceName, pressRendered, textRuns} from '../lib/setup-flow.ts'
import {pickTestKey, setupDeckSummary} from '../lib/setup-deck.ts'
import {handleGraphicsUrl, handlePersonalDeck, handleSetupDeck, type PersonalDeps} from '../lib/setup-http.ts'
import {currentGraphicsUrl, mintGraphicsUrl, sealToken, setupSealKey, unsealToken} from '../lib/setup-output.ts'

/* The operator's personal Companion file (PLAN.md S2) and the Setup page's requests. Nothing here
   touches Postgres, the relay, the environment or a real backup: the connection values are made up. */

const root = path.resolve(import.meta.dirname, '..')
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion/catalog-snapshot-2026-09-23.json'), 'utf8')) as {drafts: {id: string; name: string; title?: string; archived: boolean; activeRevision: number}[]}
const NOW = Date.parse('2026-09-24T15:00:00Z')
const ORIGIN = 'https://crc.example'
const crc = SETUP_FLOWS.crc, tbi = SETUP_FLOWS.tbi

const owner: AccessMember = {id: 'owner-1', email: 'michael@example.test', name: 'Michael', role: 'owner', enabled: true}
const editor: AccessMember = {...owner, id: 'editor-1', role: 'editor'}
const legacy: AccessMember = {...owner, id: 'legacy-control'}

let seeded: CompanionDeck | null = null
const seed = async () => structuredClone(seeded ??= await DEFAULT_SEEDS.crc!())

/** Made-up settings for every connection the CRC deck carries values for (never a real backup). */
async function crcValues(): Promise<ValuesSecret> {
  const deck = await seed()
  const labels = Object.values(fullExport(deck).exported.instances).map((c) => ({label: String(c.label), moduleId: String(c.moduleId)}))
  return {v: 1, source: 'test', connections: labels.filter((c) => c.label !== 'Overlays' && c.label !== 'obs').map((c) => ({...c, config: {host: `10.0.0.${c.label.length}`, port: 1}, secrets: {pass: `secret-${c.label}`}}))}
}
const encoded = (values: unknown) => Buffer.from(JSON.stringify(values)).toString('base64url')
const decode = (bytes: Buffer) => JSON.parse(zlib.gunzipSync(bytes).toString('utf8')) as {instances: Record<string, Record<string, unknown>>}

function context(): DeckToolContext {
  const catalog = snapshot.drafts.map((d): DeckCatalogCue => ({id: d.id, name: d.name, title: d.title, published: !d.archived && d.activeRevision > 0, retired: false, revision: d.activeRevision, updatedAt: 0}))
  let n = 0
  return {workspace: 'crc', repository: new MemoryCompanionDeckRepository(), catalog: async () => structuredClone(catalog), now: () => NOW, id: () => `id-${++n}`, signingKey: Buffer.alloc(32, 7), origin: ORIGIN}
}

const request = (method = 'POST', origin = ORIGIN) => new Request(`${ORIGIN}/api/setup/companion`, {method, headers: {origin}})
const authorizeAs = (member: AccessMember | null) => async (_request: Request, permission: AccessPermission) => {
  if (!member) return null
  if (permission === 'owner' && member.role !== 'owner') return null
  if (permission === 'author' && member.role === 'operator') return null
  return member
}

async function personalDeps(member: AccessMember | null, overrides: Partial<PersonalDeps> = {}) {
  const devices = new MemoryDeviceStore(), ctx = context(), values = await crcValues()
  const deps: PersonalDeps = {
    flow: crc, authorize: authorizeAs(member), sameSite: (r) => r.headers.get('origin') === ORIGIN, origin: () => ORIGIN, now: () => NOW, devices,
    deck: () => validatedDeck(ctx), values: () => values, fileName: personalFileName,
    build: (stored, v, flow, overlays) => personalExport(stored.deck, {values: v, valueLabels: flow.valueLabels, noValues: flow.noValues, enableFilled: flow.enableFilled, overlays}),
    ...overrides,
  }
  return {deps, devices, values}
}

/* ------------------------------------------------------------------ the secret --- */

test('the connection values secret: unset reads as none, a bad one throws a sentence that never holds the value', () => {
  assert.equal(readConnectionValues({}), null)
  assert.throws(() => readConnectionValues({[VALUES_ENV]: 'not json'}), (e: Error) => !e.message.includes('not json'))
  assert.throws(() => readConnectionValues({[VALUES_ENV]: encoded({v: 1, source: 's', connections: [{label: 'obs', moduleId: 'obs-studio', config: {}}, {label: 'obs', moduleId: 'obs-studio', config: {}}]})}), /twice/)
  const read = readConnectionValues({[VALUES_ENV]: encoded({v: 1, source: 's', connections: [{label: 'obs', moduleId: 'obs-studio', config: {pass: 'p'}}]})})
  assert.deepEqual(read?.connections, [{label: 'obs', moduleId: 'obs-studio', config: {pass: 'p'}, secrets: {}}])
})

/* ------------------------------------------------------------- the personal file --- */

test('the personal file fills every value connection by label and module, pairs Overlays, and leaves the stored deck bare', async () => {
  const deck = await seed(), before = structuredClone(deck), values = await crcValues()
  const file = personalExport(deck, {values, valueLabels: 'deck', noValues: ['obs'], enableFilled: false, overlays: {baseUrl: ORIGIN, deviceToken: 'cd_abcdefghijkl.' + 'x'.repeat(43)}})
  const instances = decode(file.bytes).instances
  const overlays = deck.connections.find((c) => c.role === 'overlays')!
  assert.deepEqual(instances[overlays.id].config, {baseUrl: ORIGIN, pairingCode: ''})
  assert.deepEqual(instances[overlays.id].secrets, {deviceToken: 'cd_abcdefghijkl.' + 'x'.repeat(43), controlKey: ''})
  assert.equal(instances[overlays.id].enabled, true)
  for (const value of values.connections) {
    const instance = Object.values(instances).find((c) => c.label === value.label)!
    assert.deepEqual(instance.config, value.config, value.label)
    assert.deepEqual(instance.secrets, value.secrets, value.label)
    assert.equal(instance.enabled, false, 'a merge import keeps the booth’s own connections, so CRC’s filled ones stay as the deck has them')
  }
  const obs = Object.values(instances).find((c) => c.label === 'obs')!
  assert.equal('config' in obs || 'secrets' in obs, false, 'the legacy obs connection carries no values')
  assert.deepEqual(deck, before, 'rendering the personal file never changes the stored deck')
  assertSanitized(deck)
  assert.equal(file.filled.length, values.connections.length)
})

test('a full reset (TBI) enables what it fills; a missing or wrong-module value locks the file instead of shipping it half-filled', async () => {
  const deck = await seed(), values = await crcValues()
  const vmix = values.connections.find((c) => c.label === 'vmix')!
  const file = personalExport(deck, {values: {...values, connections: [vmix]}, valueLabels: ['vmix'], noValues: [], enableFilled: true, overlays: {baseUrl: ORIGIN, deviceToken: 't'}})
  const instances = Object.values(decode(file.bytes).instances)
  assert.equal(instances.find((c) => c.label === 'vmix')!.enabled, true)
  assert.equal(instances.find((c) => c.label === 'x32')!.enabled, false)
  assert.equal('config' in instances.find((c) => c.label === 'x32')!, false)
  assert.throws(() => personalExport(deck, {values: {...values, connections: [{...vmix, moduleId: 'obs-studio'}]}, valueLabels: ['vmix'], noValues: [], enableFilled: true, overlays: {baseUrl: ORIGIN, deviceToken: 't'}}), (e: unknown) => e instanceof PersonalDeckError && /vmix/.test((e as Error).message))
  assert.throws(() => personalExport(deck, {values: null, valueLabels: 'deck', noValues: ['obs'], enableFilled: false, overlays: {baseUrl: ORIGIN, deviceToken: 't'}}), PersonalDeckError)
})

test('every MCP export still carries no connection config or secrets', async () => {
  const deck = await seed()
  const file = fullExport(deck)
  for (const instance of Object.values(file.exported.instances)) assert.equal('config' in instance || 'secrets' in instance, false)
  for (const instance of Object.values(decode(file.bytes).instances)) assert.equal('config' in instance || 'secrets' in instance, false)
})

test('only the Setup routes can reach the personal file or the values: no MCP area, deck tool or export imports them', () => {
  const sources: string[] = []
  const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, {withFileTypes: true})) { const full = path.join(dir, entry.name); if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full) } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) sources.push(full) } }
  for (const dir of ['app', 'lib', 'companion/src', 'relay/src']) walk(path.join(root, dir))
  const reaching = sources.filter((file) => /companion-deck\/personal|COMPANION_CONNECTION_VALUES|VALUES_ENV/.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(root, file).replace(/\\/g, '/')).sort()
  assert.deepEqual(reaching, ['app/api/setup/companion/route.ts', 'app/api/setup/deck/route.ts', 'lib/companion-deck/personal.ts', 'lib/setup-http.ts'])
  const setupHttp = fs.readFileSync(path.join(root, 'lib/setup-http.ts'), 'utf8')
  assert.deepEqual(setupHttp.match(/^import .*companion-deck\/personal.*$/gm), ["import type {ValuesSecret} from './companion-deck/personal.ts';"], 'the handler only names the type')
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app/api/setup/deck/route.ts'), 'utf8'), /personalExport/, 'the summary route only asks whether values are set')
  assert.doesNotMatch(setupHttp, /console\.\w+\([^)]*(issued|values|file|stored|overlays|request)/, 'no log line carries the token, the values or the file')
})

/* ------------------------------------------------------------ the download route --- */

test('an Owner gets the file, with a named, revocable Companion token already in it; nothing is cached', async () => {
  const {deps, devices, values} = await personalDeps(owner)
  const response = await handlePersonalDeck(request(), deps)
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="CRC deck \(deck v1, 2026-09-24\)\.companionconfig"/)
  const instances = decode(Buffer.from(await response.arrayBuffer())).instances
  const token = String((Object.values(instances).find((c) => c.moduleId === 'crc-overlays')!.secrets as Record<string, unknown>).deviceToken)
  assert.ok(parseDeviceToken(token), 'a real device token')
  const [credential] = await devices.list()
  assert.equal(credential.name, 'Michael’s Companion (downloaded 2026-09-24)')
  assert.equal(credential.kind, 'companion')
  assert.equal((await devices.verify(token, NOW))?.id, credential.id)
  assert.equal(Object.values(instances).find((c) => c.label === 'vmix')!.config && true, true)
  assert.equal(values.connections.length > 5, true)
})

test('an editor, a shared key, a signed-out visitor and another website are all refused, and no token is minted', async () => {
  for (const [member, origin, status] of [[editor, ORIGIN, 401], [legacy, ORIGIN, 401], [null, ORIGIN, 401], [owner, 'https://evil.example', 403]] as const) {
    const {deps, devices} = await personalDeps(member)
    assert.equal((await handlePersonalDeck(request('POST', origin), deps)).status, status)
    assert.deepEqual(await devices.list(), [])
  }
})

test('a deck that does not validate locks the file with the reason, before any token exists', async () => {
  const {deps, devices} = await personalDeps(owner, {deck: async () => {
    const ctx = context(), {stored, validation} = await validatedDeck(ctx)
    return {stored, validation: {...validation, ok: false, findings: [...validation.findings, {severity: 'error', page: 4, row: 0, column: 3, code: 'cue-unpublished', message: 'Page 4 row 0 column 3 names a graphic that is not published.'}]}}
  }})
  const response = await handlePersonalDeck(request(), deps)
  assert.equal(response.status, 409)
  assert.match(await response.text(), /not ready.*1 problem: Page 4 row 0 column 3 names a graphic that is not published\./)
  assert.deepEqual(await devices.list(), [])
})

test('a file that cannot be made revokes the token it minted, so a failed download leaves no device behind', async () => {
  const {deps, devices} = await personalDeps(owner, {values: () => null})
  const response = await handlePersonalDeck(request(), deps)
  assert.equal(response.status, 409)
  assert.match(await response.text(), /no saved settings for .*file is locked/)
  const [credential] = await devices.list()
  assert.ok(credential.revokedAt !== null)
})

/* -------------------------------------------------------------- graphics URL --- */

test('the graphics URL is sealed, shown again on the next visit, and gone once revoked', async () => {
  const key = Buffer.alloc(32, 3), devices = new MemoryDeviceStore()
  assert.equal(unsealToken(sealToken('cd_x', key), key), 'cd_x')
  assert.equal(unsealToken(sealToken('cd_x', key), Buffer.alloc(32, 4)), null)
  assert.equal(setupSealKey({}), null)
  assert.ok(setupSealKey({RELAY_SECRET: 'r'})?.equals(setupSealKey({RELAY_SECRET: 'r'})!))
  const deps = {flow: tbi, authorize: authorizeAs(editor), sameSite: () => true, origin: () => ORIGIN, now: () => NOW, devices, key, current: currentGraphicsUrl, mint: mintGraphicsUrl, outputName: 'TBI sanctuary graphics'}
  const first = await (await handleGraphicsUrl(new Request(`${ORIGIN}/api/setup/graphics-url`), deps)).json()
  assert.deepEqual(first, {url: null, durable: false})
  const minted = await handleGraphicsUrl(new Request(`${ORIGIN}/api/setup/graphics-url`, {method: 'POST'}), deps)
  assert.equal(minted.status, 201)
  const {url} = await minted.json() as {url: string}
  assert.match(url, /^https:\/\/crc\.example\/output#device=cd_/)
  const again = await (await handleGraphicsUrl(new Request(`${ORIGIN}/api/setup/graphics-url`, {method: 'POST'}), deps)).json() as {url: string}
  assert.equal(again.url, url, 'a second press copies the same URL instead of minting another device')
  assert.equal((await devices.list()).length, 1)
  await devices.revoke((await devices.list())[0].id, NOW)
  assert.equal((await (await handleGraphicsUrl(new Request(`${ORIGIN}/api/setup/graphics-url`), deps)).json() as {url: string | null}).url, null)
  const operator = {...deps, authorize: authorizeAs({...owner, role: 'operator'})}
  assert.equal((await handleGraphicsUrl(new Request(`${ORIGIN}/api/setup/graphics-url`), operator)).status, 401)
})

/* ------------------------------------------------------------- the deck summary --- */

test('the deck summary names its version, keys and labels, and picks the test keys by page and position', async () => {
  const ctx = context(), {stored, validation} = await validatedDeck(ctx)
  const cues = new Map(snapshot.drafts.map((d) => [d.id, {name: d.name, layout: 'left'}]))
  const lowerThird = stored.deck.pages.find((p) => p.name === 'Fri 1')!.buttons.find((b) => b.spec.kind === 'cue')!
  if (lowerThird.spec.kind === 'cue') cues.set(lowerThird.spec.cueId, {name: 'Welcome', layout: 'bottom'})
  const summary = setupDeckSummary(stored, validation, crc, cues, new Set(['Welcome']))
  assert.equal(summary.ready, validation.findings.every((f) => f.severity !== 'error'))
  assert.equal(summary.deck.keys, 1460)
  assert.ok(summary.connections.some((c) => c.label === 'vmix') && summary.connections.some((c) => c.label === 'Overlays'))
  assert.deepEqual(summary.tests.map((t) => t.found), [true, true, true])
  assert.equal(summary.tests[0].pageName, 'Fri 1')
  assert.equal(pickTestKey(stored.deck, {what: 'x', pages: [900, 999]}, cues, new Set()).found, false)
  const response = await handleSetupDeck(new Request(`${ORIGIN}/api/setup/deck`), {flow: crc, authorize: authorizeAs(legacy), sameSite: () => true, origin: () => ORIGIN, summary: async () => summary, reviewBoard: async () => null, valuesConfigured: () => true})
  assert.equal(response.status, 401, 'a shared key is not a person')
  const ok = await (await handleSetupDeck(new Request(`${ORIGIN}/api/setup/deck`), {flow: crc, authorize: authorizeAs(editor), sameSite: () => true, origin: () => ORIGIN, summary: async () => summary, reviewBoard: async () => ({id: 'board_x', title: 'TBI review'}), valuesConfigured: () => true})).json() as Record<string, unknown>
  assert.deepEqual(ok.personal, {owner: false, configured: true})
  assert.deepEqual(ok.reviewBoard, {id: 'board_x', title: 'TBI review'})
})

/* ------------------------------------------------------------------ flow data --- */

test('both flows keep the order the plan sets, with no picker, legacy key or per-page import left', () => {
  assert.deepEqual(tbi.steps.map((s) => s.key), ['backup', 'module', 'deck-download', 'import', 'graphics', 'test', 'graphics-links'])
  assert.deepEqual(crc.steps.map((s) => s.key), ['backup', 'update', 'module', 'labels', 'deck-download', 'import', 'pair', 'graphics', 'test', 'graphics-links'])
  const text = JSON.stringify(SETUP_FLOWS)
  assert.doesNotMatch(text, /access key|private output URL|Recreate|picker/i)
  assert.match(tbi.steps[3].text[0], /Full Reset & Import/)
  assert.match(crc.steps[5].text[0], /Import Preserving Unselected/)
  assert.deepEqual(textRuns('a **b** c'), [{text: 'a ', bold: false}, {text: 'b', bold: true}, {text: ' c', bold: false}])
  assert.equal(personalDeviceName(tbi, NOW), 'Simone’s Companion (downloaded 2026-09-24)')
  assert.equal(personalDeviceName(tbi, NOW, 'paired'), 'Simone’s Companion (paired 2026-09-24 15:00 UTC)')
})

test('the press readout shows each Companion press and whether a graphics browser rendered it', () => {
  const state = (at: number, phase: string, revision = 7) => ({revision, cue: 'c1', cuePayload: {id: 'c1', name: 'Barechu'}, renderers: [{revision, cue: 'c1', phase}], lastPress: {companion: at, control: null, mcp: null}})
  assert.equal(companionPress({revision: 1, cue: null, renderers: [], lastPress: {companion: null}}), null)
  let rows = foldPress([], companionPress(state(100, 'entering')))
  assert.equal(rows[0].status, 'in transition')
  assert.equal(pressRendered(rows), false)
  rows = foldPress(rows, companionPress(state(100, 'settled')))
  assert.equal(rows.length, 1)
  assert.deepEqual([rows[0].name, rows[0].status], ['Barechu', 'rendered'])
  assert.equal(pressRendered(rows), true)
  rows = foldPress(rows, companionPress(state(200, 'entering', 8)))
  assert.deepEqual(rows.map((r) => r.at), [200, 100])
})
