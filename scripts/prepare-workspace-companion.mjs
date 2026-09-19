import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { deriveTbiPackage, CRC_MODULE_PATH, TBI_MODULE_PATH, LEGACY_TBI_MODULE_PATHS } from './build-tbi-companion-module.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(repoRoot, 'public', 'workspaces', 'temple-bnai-israel');
const downloadsRoot = resolve(workspaceRoot, 'downloads');
const catalogMap = JSON.parse(readFileSync(resolve(repoRoot, 'workspaces', 'temple-bnai-israel', 'catalog-map.json'), 'utf8'));
const cueIds = new Map(catalogMap.items.map(item => [item.sourceCueId, item.destinationCueId]));
const sourcePages = [
  ['crc-morning-page-1.companionconfig', 'tbi-morning-page-1.companionconfig', 'TBI Morning Rehearsal'],
  ['crc-morning-page-2.companionconfig', 'tbi-morning-page-2.companionconfig', 'TBI Morning Continued'],
];
const usedCueIds = new Set();

function fail(message) {
  throw new Error(message);
}

function unwrapOption(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

function setOption(value, replacement) {
  if (value && typeof value === 'object' && 'value' in value) value.value = replacement;
  else return replacement;
  return value;
}

function visit(value) {
  if (Array.isArray(value)) {
    value.forEach(visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const actionName = value.definitionId ?? value.actionId;
  if (value.type === 'action' && (actionName === 'show_cue' || actionName === 'toggle_cue')) {
    const sourceCueId = unwrapOption(value.options?.cue);
    const destinationCueId = cueIds.get(sourceCueId);
    if (!destinationCueId) fail(`Companion page references an unapproved cue: ${sourceCueId}`);
    value.options.cue = setOption(value.options.cue, destinationCueId);
    usedCueIds.add(sourceCueId);
  }
  Object.values(value).forEach(visit);
}

mkdirSync(downloadsRoot, { recursive: true });
for (const [sourceName, destinationName, pageName] of sourcePages) {
  const source = resolve(repoRoot, 'public', 'downloads', sourceName);
  const data = JSON.parse(gunzipSync(readFileSync(source)).toString('utf8'));
  if (data.type !== 'page' || !data.page) fail(`${sourceName} is not a Companion page export`);
  visit(data.page);
  data.page.name = pageName;
  const instances = Object.values(data.instances ?? {});
  if (instances.length !== 1) fail(`${sourceName} must contain exactly one module connection template`);
  const instance = instances[0];
  if (instance.moduleId !== 'crc-overlays') fail(`${sourceName} uses an unexpected Companion module`);
  instance.moduleId = 'tbi-overlays';
  instance.label = 'TBI_Overlays';
  instance.config = { ...instance.config, baseUrl: 'https://tbi-overlays.vercel.app' };
  instance.secrets = { controlKey: '' };
  instance.enabled = false;
  const serialized = JSON.stringify(data);
  // Either CRC host counts as a leak: the swap to overlays.centralreform.org did not retire
  // the Vercel hostname, and a config carrying either one points an operator at CRC.
  const crcHosts = ['https://overlays.centralreform.org', 'https://crc-overlays.vercel.app'];
  if (crcHosts.some(host => serialized.includes(host)) || serialized.includes('CRC Morning') || serialized.includes('"crc-overlays"')) {
    fail(`${sourceName} retained CRC operator-facing configuration`);
  }
  writeFileSync(resolve(downloadsRoot, destinationName), gzipSync(Buffer.from(serialized), { mtime: 0 }));
}

if (usedCueIds.size !== 24 || [...cueIds.keys()].some(id => !usedCueIds.has(id))) {
  fail(`Companion pages must cover all 24 approved starter cues; found ${usedCueIds.size}`);
}

mkdirSync(dirname(TBI_MODULE_PATH), { recursive: true });
writeFileSync(TBI_MODULE_PATH, deriveTbiPackage(readFileSync(CRC_MODULE_PATH)));
for (const legacy of LEGACY_TBI_MODULE_PATHS) if (existsSync(legacy)) rmSync(legacy);
console.log('Prepared two TBI Companion pages and the TBI Overlays module package derived from the reviewed CRC package.');
