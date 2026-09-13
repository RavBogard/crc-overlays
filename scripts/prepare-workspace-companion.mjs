import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

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
  if (value.type === 'action' && actionName === 'show_cue') {
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
  instance.label = 'TBI_Overlays';
  instance.config = { ...instance.config, baseUrl: 'https://tbi-overlays.vercel.app' };
  instance.secrets = { controlKey: '' };
  instance.enabled = false;
  const serialized = JSON.stringify(data);
  if (serialized.includes('https://crc-overlays.vercel.app') || serialized.includes('CRC Morning')) {
    fail(`${sourceName} retained CRC operator-facing configuration`);
  }
  writeFileSync(resolve(downloadsRoot, destinationName), gzipSync(Buffer.from(serialized), { mtime: 0 }));
}

if (usedCueIds.size !== 24 || [...cueIds.keys()].some(id => !usedCueIds.has(id))) {
  fail(`Companion pages must cover all 24 approved starter cues; found ${usedCueIds.size}`);
}

const moduleSource = resolve(repoRoot, 'public', 'downloads', 'crc-overlays-1.2.0.tgz');
const moduleDestination = resolve(downloadsRoot, 'companion-module-1.2.0.tgz');
mkdirSync(dirname(moduleDestination), { recursive: true });
copyFileSync(moduleSource, moduleDestination);
console.log('Prepared two TBI Companion pages and the compatible module package.');
