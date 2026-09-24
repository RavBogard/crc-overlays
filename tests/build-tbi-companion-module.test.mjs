import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CRC_MODULE_PATH, TBI_MODULE_PATH, deriveTbiPackage, packModuleArchive, unpackModuleArchive,
} from '../scripts/build-tbi-companion-module.mjs'

const root = path.resolve(import.meta.dirname, '..')
const crcArchive = fs.readFileSync(CRC_MODULE_PATH)

function fileOf(archive, relative) {
  const entry = unpackModuleArchive(archive).find(item => item.typeFlag === '0' && item.name.endsWith(`/${relative}`))
  assert.ok(entry, `archive has ${relative}`)
  return entry.body.toString('utf8')
}

/** The reviewed CRC archive with one file's text rewritten, as a module rebuild would change it. */
function crcArchiveWith(relative, edit) {
  const entries = unpackModuleArchive(crcArchive).map(entry => {
    if (entry.typeFlag !== '0' || entry.name !== `crc-overlays/${relative}`) return entry
    const before = entry.body.toString('utf8')
    const after = edit(before)
    assert.notEqual(after, before, `the edit changed ${relative}`)
    return { ...entry, body: Buffer.from(after, 'utf8') }
  })
  return packModuleArchive(entries)
}

// The compiled bundle spells each preset section as an object literal; this adds more beside the controls, the way a new preset
// section (R-C5's "Sets", "This week's service") would appear in the compiled bundle.
const CONTROLS_SECTION = '{id:"crc_overlay_controls",name:"CRC Overlay Controls"'
const withSection = (extra) => (text) => {
  assert.ok(text.includes(CONTROLS_SECTION), 'the compiled bundle still spells the controls section as expected')
  return text.replace(CONTROLS_SECTION, `${extra},${CONTROLS_SECTION}`)
}

test('the reviewed CRC archive derives to the committed TBI archive byte for byte', () => {
  assert.ok(deriveTbiPackage(crcArchive).equals(fs.readFileSync(TBI_MODULE_PATH)))
})

test('the module source brand constant keeps the CRC runtime strings unchanged', () => {
  const brand = fs.readFileSync(path.join(root, 'companion', 'src', 'brand.ts'), 'utf8')
  const main = fileOf(crcArchive, 'main.js')
  for (const value of ['https://overlays.centralreform.org', 'crc_overlay_controls', 'CRC Overlay Controls']) {
    assert.ok(brand.includes(`'${value}'`), `brand.ts names ${value}`)
    assert.ok(main.includes(value), `the compiled CRC module carries ${value}`)
  }
})

test('an extra preset section carrying the brand strings derives without touching the script', () => {
  const extra = '{id:"crc_overlay_sets",name:"CRC Overlay Sets",definitions:[]},{id:"crc_overlay_service",name:"CRC Overlay Controls: This week",definitions:[]}'
  // An extra default base URL too: the old derivation asserted exactly three.
  const archive = crcArchiveWith('main.js', text => withSection(extra)(text).replace('regex:"^https?://.+"', 'regex:"^https?://.+",placeholder:"https://overlays.centralreform.org"'))
  const main = fileOf(deriveTbiPackage(archive), 'main.js')
  assert.ok(main.includes('{id:"tbi_overlay_sets",name:"TBI Overlay Sets",definitions:[]}'))
  assert.ok(main.includes('{id:"tbi_overlay_service",name:"TBI Overlay Controls: This week",definitions:[]}'))
  assert.ok(main.includes('{id:"tbi_overlay_controls",name:"TBI Overlay Controls"'))
  // Every spelling of the CRC host maps, however many the bundle carries (the placeholder adds one).
  const crcHosts = fileOf(archive, 'main.js').split('https://overlays.centralreform.org').length - 1
  assert.ok(crcHosts >= 2)
  assert.equal(main.split('https://overlays.templebnaiisrael.com').length - 1, crcHosts)
  assert.doesNotMatch(main, /crc_overlay|CRC Overlay|centralreform/)
  // Protocol identifiers survive.
  assert.ok(main.includes('X-CRC-Catalog-Version'))
  assert.ok(main.includes('crc-overlays-v1'))
})

test('a brand string outside the known prefixes still fails the derivation', () => {
  for (const [extra, shown] of [
    ['{id:"crc_sets",name:"Sets",definitions:[]}', 'crc_sets'],
    ['{id:"sets",name:"CRC Sets",definitions:[]}', 'CRC Sets'],
    ['{id:"sets",name:"Central Reform Congregation sets",definitions:[]}', 'Central Reform'],
    ['{id:"sets",name:"Sets",help:"see crc-overlays.example.org",definitions:[]}', 'crc-overlays.example'],
  ]) {
    assert.throws(() => deriveTbiPackage(crcArchiveWith('main.js', withSection(extra))), error => {
      assert.match(error.message, /main\.js still carries CRC brand string/)
      assert.ok(error.message.includes(shown), `the failure shows ${shown}: ${error.message}`)
      return true
    })
  }
})

test('HELP.md with a missed brand string fails too', () => {
  const archive = crcArchiveWith('companion/HELP.md', text => `${text}\nAsk the CRC booth.\n`)
  assert.throws(() => deriveTbiPackage(archive), /HELP\.md still carries CRC brand string/)
})

test('losing the controls section, the base URL or a protocol identifier fails the derivation', () => {
  assert.throws(
    () => deriveTbiPackage(crcArchiveWith('main.js', text => text.replace(CONTROLS_SECTION, '{id:"controls",name:"Controls"'))),
    /main\.js is missing "tbi_overlay_controls"/,
  )
  assert.throws(
    () => deriveTbiPackage(crcArchiveWith('main.js', text => text.split('https://overlays.centralreform.org').join('https://example.org'))),
    /expected a CRC base URL/,
  )
  assert.throws(
    () => deriveTbiPackage(crcArchiveWith('main.js', text => text.split('X-CRC-Catalog-Version').join('X-Catalog-Version'))),
    /missing the expected protocol identifier X-CRC-Catalog-Version/,
  )
})
