#!/usr/bin/env node
// Builds the fresh Companion preset for Michael from the stored deck model (lib/companion-deck):
// CRC's seed deck (cue bindings from CUE-MANIFEST.json, device fragments and id seeds from
// lib/companion-deck/crc-seed-data.json) rendered by the pure renderDeck().
//
//   node scripts/build-companion-preset.mjs [--manifest <CUE-MANIFEST.json>] [--seed <crc-seed-data.json>]
//        [--out <preset.companionconfig>]
//   node scripts/build-companion-preset.mjs --extract <released.companionconfig> [--seed <crc-seed-data.json>]
//
// Deterministic: the same manifest and seed data always produce the same bytes. Michael's raw export
// is not read: the seed data was derived from the released preset, whose connections are stubs.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { chainNeighbours as neighbours, companionLabel, parseCell, stableId, unwrap, w, wrapLabel } from '../lib/companion-deck/model.ts'
import { encodeCompanionConfig, renderDeck } from '../lib/companion-deck/render.ts'
import { CARRIED, CHAINS, PAGE_REMAP, remapLocation, seedCrcDeck } from '../lib/companion-deck/seed.ts'
import { extractCrcSeedData, formatSeedData } from '../lib/companion-deck/extract.ts'

export { CARRIED, CHAINS, PAGE_REMAP, companionLabel, parseCell, remapLocation, stableId, unwrap, w, wrapLabel }

const root = path.resolve(import.meta.dirname, '..')
export const DEFAULTS = {
  manifest: path.join(root, 'docs/planning/2026-09-23-overlay-consistency/companion/CUE-MANIFEST.json'),
  seed: path.join(root, 'lib/companion-deck/crc-seed-data.json'),
  out: path.join(root, 'work/companion-preset/2026-09-23/CRC-FRESH-PRESET-2026-09-23.companionconfig'),
}
/** Michael's raw 16 September export (gitignored; holds connection config). Only the audit reads it. */
export const SOURCE_EXPORT = path.join(root, 'work/companion-conversion/2026-09-22/ProductionDSKTP-2026-09-16-source.companionconfig')

// The Overlays connection on Michael's machine (from the 2026-09-22 converted deck).
export const OVERLAYS = { id: 'JKUO3gbCLf6mwwpsZCYae', moduleId: 'crc-overlays', label: 'Overlays', moduleVersionId: '1.7.0' }
export const SINGULAR_MODULE = 'singularlive-studio'
export const chainNeighbours = (page) => neighbours(CHAINS, page)

/* ------------------------------------------------------------------ io --- */

export function readGz(file) {
  const raw = fs.readFileSync(file)
  return JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString('utf8'))
}
/** Load a Companion export and immediately drop every connection/surface config and secret. */
export function loadExportSafe(file) {
  const data = readGz(file)
  for (const group of ['instances', 'surfaceInstances']) {
    for (const inst of Object.values(data[group] ?? {})) {
      if (inst && typeof inst === 'object') { delete inst.config; delete inst.secrets }
    }
  }
  return data
}
export const readSeedData = (file = DEFAULTS.seed) => JSON.parse(fs.readFileSync(file, 'utf8'))
export const readManifest = (file = DEFAULTS.manifest) => JSON.parse(fs.readFileSync(file, 'utf8'))

/** The CRC preset as the deck model renders it. */
export function buildPreset(manifest = readManifest(), seedData = readSeedData()) {
  return { preset: renderDeck(seedCrcDeck(manifest, seedData)), notes: [] }
}

export function writePreset(file, preset) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encodeCompanionConfig(preset))
}

function parseArgs(argv) {
  const args = { ...DEFAULTS, extract: null }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    if (!(key in args)) throw new Error(`unknown option ${argv[i]}`)
    args[key] = path.resolve(argv[i + 1])
  }
  return args
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  if (args.extract) {
    const bytes = fs.readFileSync(args.extract)
    const data = extractCrcSeedData(loadExportSafe(args.extract), readManifest(args.manifest), { file: path.basename(args.extract), sha256: sha256(bytes) })
    fs.writeFileSync(args.seed, formatSeedData(data))
    console.log(`Wrote ${path.relative(root, args.seed)}: ${Object.keys(data.fragments).length} fragments, ${Object.keys(data.idBases).length} id seeds, from ${data.source.file} (sha256 ${data.source.sha256})`)
  } else {
    const { preset } = buildPreset(readManifest(args.manifest), readSeedData(args.seed))
    writePreset(args.out, preset)
    const buttons = Object.values(preset.pages).reduce((n, p) => n + Object.values(p.controls).reduce((m, row) => m + Object.keys(row).length, 0), 0)
    console.log(`Wrote ${path.relative(root, args.out)}: ${Object.keys(preset.pages).length} pages, ${buttons} buttons, ${Object.keys(preset.triggers).length} triggers, ${Object.keys(preset.instances).length} connection stubs (no config), sha256 ${sha256(fs.readFileSync(args.out))}`)
  }
}
