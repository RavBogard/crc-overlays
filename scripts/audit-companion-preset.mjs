#!/usr/bin/env node
// Read-only audit of a Companion deck: a thin CLI over lib/companion-deck/validate.ts. Exits non-zero on
// any error finding.
//
//   node scripts/audit-companion-preset.mjs [--deck <deck.json>] [--manifest <CUE-MANIFEST.json>]
//        [--seed <crc-seed-data.json>] [--snapshot <catalog-snapshot.json>] [--definitions <definitions.json>]
//        [--preset <file.companionconfig>] [--upgrade-bundle <upgrade-bundle.mjs>] [--json]
//
// With no --deck it audits CRC's seed deck (CUE-MANIFEST.json + crc-seed-data.json). Module definitions
// come from companion/definitions/<version>.json for the module version the deck's Overlays connection
// asks for (a deck keeps the version it was built for), unless --definitions names a file; published/retired
// from the catalog snapshot. --preset also checks
// that file is byte-for-byte what the deck renders. Companion's own import upgrade runs only when the
// (gitignored, local) upgrade bundle exists for the deck's recorded build. Michael's raw export is not
// read. Nothing here proves anything about hardware.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULTS as BUILD_DEFAULTS, readGz } from './build-companion-preset.mjs'
import { seedCrcDeck } from '../lib/companion-deck/seed.ts'
import { encodeCompanionConfig } from '../lib/companion-deck/render.ts'
import { catalogCueLookups, validateDeck } from '../lib/companion-deck/validate.ts'
import { definitionsPathFor } from '../companion/scripts/write-definitions.mjs'

const root = path.resolve(import.meta.dirname, '..')
const plan = 'docs/planning/2026-09-23-overlay-consistency/companion'
export const AUDIT_DEFAULTS = {
  deck: null,
  manifest: BUILD_DEFAULTS.manifest,
  seed: BUILD_DEFAULTS.seed,
  snapshot: path.join(root, plan, 'catalog-snapshot-2026-09-23.json'),
  /** null: the definitions of the module version the deck asks for. */
  definitions: null,
  preset: null,
  'upgrade-bundle': path.join(root, 'work/companion-conversion/2026-09-22/tools/upgrade-bundle.mjs'),
}
/** The Companion release the local upgrade bundle was extracted from (Michael's booth). */
export const UPGRADE_BUNDLE_RELEASE = '5.0.3'

/**
 * Cues retired before the catalog carried retirement (A3): the snapshot-era superseded names. A catalog
 * row's own `retired` / `retiredAt` wins once A3 lands; these only add to it.
 */
export const SUPERSEDED = [/^Copy of Thank you$/, /^Mourners Kaddish 3( TT)?$/, /^Vahavta trans$/, /^Psalm 96$/, /Shiru La.Adonai \(Complete · Shirei supplement\) — 0\d of 05/]

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/** companion/definitions/<version>.json for the version the deck's Overlays connection asks for; definitions.json when it asks for none. */
export function deckDefinitionsPath(deck) {
  const version = deck.connections?.find((c) => c.role === 'overlays')?.moduleVersionId
  return version ? definitionsPathFor(version) : path.join(root, 'companion/definitions.json')
}

/** Validate a deck with the repo's module definitions, a catalog snapshot and, when present, the upgrade bundle. */
export async function audit(opts = {}) {
  const o = { ...AUDIT_DEFAULTS, ...opts }
  const deck = o.deck ? readJson(o.deck) : seedCrcDeck(readJson(o.manifest), readJson(o.seed))
  const snapshot = readJson(o.snapshot)
  const cues = o.cues ?? catalogCueLookups(snapshot.drafts, (d) => SUPERSEDED.some((re) => re.test(d.name ?? '')))
  let upgrade = null
  if (o['upgrade-bundle'] && fs.existsSync(o['upgrade-bundle'])) {
    const { upgradeImport } = await import(pathToFileURL(o['upgrade-bundle']).href)
    upgrade = { release: UPGRADE_BUNDLE_RELEASE, upgradeImport }
  }
  const result = validateDeck(deck, { module: readJson(o.definitions ?? deckDefinitionsPath(deck)), cues, upgrade })
  if (o.preset && result.exported) {
    const rendered = encodeCompanionConfig(result.exported)
    const same = fs.readFileSync(o.preset).equals(rendered) || JSON.stringify(readGz(o.preset)) === JSON.stringify(result.exported)
    if (!same) result.findings.push({ severity: 'error', page: null, row: null, column: null, code: 'preset-differs', message: `${path.basename(o.preset)} is not what this deck renders. Rebuild it with scripts/build-companion-preset.mjs.` })
    result.ok = !result.findings.some((f) => f.severity === 'error')
  }
  return result
}

const where = (f) => (f.page == null ? '' : f.row == null ? `page ${f.page}: ` : `${f.page}/${f.row}/${f.column}: `)

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = {}
  const argv = process.argv.slice(2)
  let json = false
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    if (key === 'json') { json = true; continue }
    if (!(key in AUDIT_DEFAULTS)) throw new Error(`unknown option ${argv[i]}`)
    opts[key] = path.resolve(argv[++i])
  }
  const { ok, findings, summary } = await audit(opts)
  if (json) console.log(JSON.stringify({ ok, summary, findings }, null, 2))
  else {
    for (const [k, v] of Object.entries(summary)) console.log(`${k}: ${v}`)
    const errors = findings.filter((f) => f.severity === 'error')
    for (const f of findings.filter((x) => x.severity !== 'error')) console.log(`${f.severity}: ${where(f)}${f.message}`)
    if (errors.length) { console.log(`\nFAIL (${errors.length}):`); for (const f of errors.slice(0, 50)) console.log(`  - [${f.code}] ${where(f)}${f.message}`) }
    else console.log('\nPASS: deck audit clean (automated checks only; hardware is proven in rehearsal)')
  }
  process.exitCode = ok ? 0 : 1
}
