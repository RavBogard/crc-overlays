// Derives the Temple B'nai Israel Companion module archive from the reviewed CRC
// archive. The CRC archive at public/downloads/crc-overlays-1.6.0.tgz is the only
// reviewed input and is never rebuilt or modified here.
//
// Companion keys installed modules by manifest `id`, so the derived package uses
// id `tbi-overlays`. That lets one Companion install hold both congregations'
// modules side by side.
//
// The archive is written deterministically (sorted entries, mtime 0, uid/gid 0,
// fixed modes, gzip header with a zeroed timestamp) so the committed file can be
// re-derived and compared byte for byte by scripts/audit-companion-packages.mjs.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const BLOCK = 512;
const SOURCE_PREFIX = 'crc-overlays/';
const TARGET_PREFIX = 'tbi-overlays/';

function fail(message) {
  throw new Error(message);
}

function octalField(buffer, offset, length) {
  const raw = buffer.subarray(offset, offset + length).toString('binary').replace(/\0.*$/s, '').trim();
  if (raw === '') return 0;
  if (!/^[0-7]+$/.test(raw)) fail(`Unsupported non-octal tar header field at offset ${offset}: ${JSON.stringify(raw)}`);
  return parseInt(raw, 8);
}

function stringField(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString('utf8').replace(/\0.*$/s, '');
}

// Minimal ustar reader. Fails loudly on any header form it does not handle
// (pax extended headers, GNU long names/links, sparse files, links, devices).
function readUstar(tar) {
  const entries = [];
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every(byte => byte === 0)) break;

    const magic = header.subarray(257, 263).toString('binary');
    if (magic !== 'ustar\0' && magic !== 'ustar ') {
      fail(`Unsupported tar header magic ${JSON.stringify(magic)} at offset ${offset}; expected ustar`);
    }

    const stored = octalField(header, 148, 8);
    const forChecksum = Buffer.from(header);
    forChecksum.fill(0x20, 148, 156);
    let unsigned = 0;
    for (const byte of forChecksum) unsigned += byte;
    if (unsigned !== stored) fail(`Tar header checksum mismatch at offset ${offset}: stored ${stored}, computed ${unsigned}`);

    const typeFlag = String.fromCharCode(header[156]) === '\0' ? '0' : String.fromCharCode(header[156]);
    if (typeFlag !== '0' && typeFlag !== '5') {
      fail(`Unsupported tar entry type ${JSON.stringify(typeFlag)} at offset ${offset}; only regular files (0) and directories (5) are handled`);
    }

    const prefix = stringField(header, 345, 155);
    const name = stringField(header, 0, 100);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = octalField(header, 124, 12);
    const linkname = stringField(header, 157, 100);
    if (linkname !== '') fail(`Unsupported tar link entry ${fullName} at offset ${offset}`);

    const body = typeFlag === '5' ? Buffer.alloc(0) : tar.subarray(offset + BLOCK, offset + BLOCK + size);
    if (body.length !== (typeFlag === '5' ? 0 : size)) fail(`Truncated tar entry body for ${fullName}`);
    entries.push({ name: fullName, typeFlag, body });
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}

function writeOctal(header, offset, length, value) {
  header.write(value.toString(8).padStart(length - 1, '0') + '\0', offset, length, 'binary');
}

// Minimal deterministic ustar writer: mtime 0, uid/gid 0, 0644 files, 0755 dirs.
function writeUstar(entries) {
  const blocks = [];
  for (const entry of entries) {
    if (Buffer.byteLength(entry.name, 'utf8') > 100) fail(`Entry name too long for plain ustar: ${entry.name}`);
    const header = Buffer.alloc(BLOCK);
    header.write(entry.name, 0, 100, 'utf8');
    writeOctal(header, 100, 8, entry.typeFlag === '5' ? 0o755 : 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, entry.body.length);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header.write(entry.typeFlag, 156, 1, 'binary');
    header.write('ustar\0', 257, 6, 'binary');
    header.write('00', 263, 2, 'binary');
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'binary');
    blocks.push(header);
    if (entry.body.length) {
      const padded = Buffer.alloc(Math.ceil(entry.body.length / BLOCK) * BLOCK);
      entry.body.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(blocks);
}

function gzipDeterministic(tar) {
  const gz = gzipSync(tar, { level: 9 });
  gz.writeUInt32LE(0, 4); // MTIME
  gz[9] = 3; // OS = Unix, independent of the building platform
  return gz;
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

function replaceExactly(text, needle, replacement, expected, label) {
  const found = countOf(text, needle);
  if (found !== expected) fail(`${label}: expected ${expected} occurrence(s) of ${JSON.stringify(needle)}, found ${found}`);
  return text.split(needle).join(replacement);
}

function deriveManifest(body) {
  const text = body.toString('utf8');
  const trailer = text.endsWith('\n') ? '\n' : '';
  const source = trailer ? text.slice(0, -1) : text;
  const manifest = JSON.parse(source);
  if (JSON.stringify(manifest) !== source) {
    fail('companion/manifest.json is not the minified single-line JSON this derivation preserves');
  }
  if (manifest.id !== 'crc-overlays') fail(`Unexpected source manifest id ${manifest.id}`);
  // Key order is preserved: every assignment below targets an existing key.
  manifest.id = 'tbi-overlays';
  manifest.name = 'TBI Overlays';
  manifest.shortname = 'TBI Overlays';
  manifest.manufacturer = "Temple B'nai Israel";
  if (!Array.isArray(manifest.products) || manifest.products.length !== 1) fail('Unexpected manifest products list');
  manifest.products = ["TBI Overlays"];
  if (!Array.isArray(manifest.maintainers) || manifest.maintainers.length !== 1) fail('Unexpected manifest maintainers list');
  manifest.maintainers = manifest.maintainers.map(entry => ({ ...entry, name: "Temple B'nai Israel" }));
  manifest.keywords = manifest.keywords.map(keyword => (keyword === 'CRC' ? 'TBI' : keyword));
  return Buffer.from(JSON.stringify(manifest) + trailer, 'utf8');
}

function derivePackageJson(body) {
  const text = body.toString('utf8');
  const trailer = text.endsWith('\n') ? '\n' : '';
  const source = trailer ? text.slice(0, -1) : text;
  const pkg = JSON.parse(source);
  if (JSON.stringify(pkg) !== source) fail('package.json is not the minified single-line JSON this derivation preserves');
  if (pkg.name !== 'CRC Overlays') fail(`Unexpected source package name ${pkg.name}`);
  pkg.name = 'TBI Overlays';
  return Buffer.from(JSON.stringify(pkg) + trailer, 'utf8');
}

/**
 * CRC is primary on overlays.centralreform.org since 2026-09-15 and TBI on
 * overlays.templebnaiisrael.com since 2026-09-14, but both Vercel hostnames still answer and
 * the module package committed today was built before the swap. So each CRC host maps to the
 * matching TBI host and a package is allowed to carry either spelling: the one in the tree
 * derives now, and one rebuilt from the current source derives after. Both are checked on the
 * way out, so neither CRC host can survive into the TBI module.
 */
const CRC_HOSTS = ['https://overlays.centralreform.org', 'https://crc-overlays.vercel.app'];
const TBI_HOSTS = ['https://overlays.templebnaiisrael.com', 'https://tbi-overlays.vercel.app'];
const CRC_BARE = ['overlays.centralreform.org', 'crc-overlays.vercel.app'];
const TBI_BARE = ['overlays.templebnaiisrael.com', 'tbi-overlays.vercel.app'];

function deriveHelp(body) {
  let text = body.toString('utf8');
  text = text.split('CRC Overlay Controls').join('TBI Overlay Controls');
  text = text.split('CRC Overlays').join('TBI Overlays');
  CRC_BARE.forEach((host, index) => { text = text.split(host).join(TBI_BARE[index]); });
  for (const host of CRC_BARE) if (text.includes(host)) fail(`HELP.md still references the CRC deployment host ${host}`);
  return Buffer.from(text, 'utf8');
}

function deriveMainJs(body) {
  const source = body.toString('utf8');
  // These are wire-protocol identifiers the server requires; they must survive unchanged.
  const protocolCounts = {
    'X-CRC-Catalog-Version': countOf(source, 'X-CRC-Catalog-Version'),
    'crc-overlays-v1': countOf(source, 'crc-overlays-v1'),
  };
  if (protocolCounts['X-CRC-Catalog-Version'] < 1 || protocolCounts['crc-overlays-v1'] < 1) {
    fail('main.js is missing the expected protocol identifiers');
  }

  let text = source;
  // Three base URLs, whichever CRC host this package was built against. The count is asserted
  // over both spellings together so a package cannot quietly lose one.
  const baseUrls = CRC_HOSTS.reduce((total, host) => total + countOf(text, host), 0);
  if (baseUrls !== 3) fail(`main.js base URL: expected 3 CRC base URLs across ${CRC_HOSTS.join(' and ')}, found ${baseUrls}`);
  CRC_HOSTS.forEach((host, index) => { text = text.split(host).join(TBI_HOSTS[index]); });
  text = replaceExactly(text, 'crc_overlay_controls', 'tbi_overlay_controls', 1, 'main.js preset category id');
  text = replaceExactly(text, 'CRC Overlay Controls', 'TBI Overlay Controls', 1, 'main.js preset category label');

  for (const [needle, expected] of Object.entries(protocolCounts)) {
    const found = countOf(text, needle);
    if (found !== expected) fail(`main.js protocol identifier ${needle} changed: ${expected} before, ${found} after`);
  }
  for (const host of CRC_BARE) if (text.includes(host)) fail(`main.js still references the CRC deployment host ${host}`);
  return Buffer.from(text, 'utf8');
}

/**
 * Pure derivation: CRC module archive bytes in, TBI module archive bytes out.
 * @param {Buffer} crcTgzBuffer
 * @returns {Buffer}
 */
export function deriveTbiPackage(crcTgzBuffer) {
  const entries = readUstar(gunzipSync(crcTgzBuffer));
  if (!entries.length) fail('The CRC module archive contains no entries');

  const derived = entries.map(entry => {
    if (!entry.name.startsWith(SOURCE_PREFIX)) fail(`Unexpected entry outside ${SOURCE_PREFIX}: ${entry.name}`);
    const relative = entry.name.slice(SOURCE_PREFIX.length);
    let body = entry.body;
    if (entry.typeFlag === '0') {
      if (relative === 'companion/manifest.json') body = deriveManifest(body);
      else if (relative === 'package.json') body = derivePackageJson(body);
      else if (relative === 'companion/HELP.md') body = deriveHelp(body);
      else if (relative === 'main.js') body = deriveMainJs(body);
      else if (relative === 'LICENSE') body = Buffer.from(body);
      else fail(`Unhandled file in the CRC module archive: ${entry.name}`);
    }
    return { name: TARGET_PREFIX + relative, typeFlag: entry.typeFlag, body };
  });

  derived.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return gzipDeterministic(writeUstar(derived));
}

/** Reads the manifest out of a module archive without touching the filesystem. */
export function readManifest(tgzBuffer) {
  for (const entry of readUstar(gunzipSync(tgzBuffer))) {
    if (entry.typeFlag === '0' && entry.name.endsWith('/companion/manifest.json')) {
      return JSON.parse(entry.body.toString('utf8'));
    }
  }
  return fail('Module archive has no companion/manifest.json');
}

const repoRoot = resolve(import.meta.dirname, '..');
export const CRC_MODULE_PATH = resolve(repoRoot, 'public', 'downloads', 'crc-overlays-1.6.0.tgz');
export const TBI_MODULE_PATH = resolve(repoRoot, 'public', 'workspaces', 'temple-bnai-israel', 'downloads', 'tbi-overlays-1.6.0.tgz');
// Superseded artifacts removed on every derivation run. The 1.3.0 and 1.4.0 pairs
// are deliberately absent: TBI must keep serving tbi-overlays-1.3.0.tgz and
// tbi-overlays-1.4.0.tgz so operators who have not upgraded can still download the
// module they are running.
export const LEGACY_TBI_MODULE_PATHS = [
  resolve(repoRoot, 'public', 'workspaces', 'temple-bnai-israel', 'downloads', 'companion-module-1.2.0.tgz'),
  resolve(repoRoot, 'public', 'workspaces', 'temple-bnai-israel', 'downloads', 'tbi-overlays-1.2.0.tgz'),
];

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const tbi = deriveTbiPackage(readFileSync(CRC_MODULE_PATH));
  mkdirSync(resolve(TBI_MODULE_PATH, '..'), { recursive: true });
  writeFileSync(TBI_MODULE_PATH, tbi);
  for (const legacy of LEGACY_TBI_MODULE_PATHS) if (existsSync(legacy)) rmSync(legacy);
  const manifest = readManifest(tbi);
  const entryCount = readUstar(gunzipSync(tbi)).filter(entry => entry.typeFlag === '0').length;
  console.log(JSON.stringify({
    module: { id: manifest.id, name: manifest.name, version: manifest.version },
    files: entryCount,
    bytes: tbi.length,
    sha256: createHash('sha256').update(tbi).digest('hex'),
    output: TBI_MODULE_PATH,
  }, null, 2));
}
