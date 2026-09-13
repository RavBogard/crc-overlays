import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {GET} from '../app/api/workspace/route';
import {getPublicWorkspace} from '../lib/workspace';
import {overlayBrandingFromWorkspace} from '../lib/branding';
import {baselineCatalogForWorkspace} from '../lib/workspace-catalog';
import cues from '../lib/cues.json';

test('CRC is the complete, validated default workspace', () => {
  const workspace = getPublicWorkspace({});
  assert.equal(workspace.id, 'crc');
  assert.equal(workspace.organizationName, 'Central Reform Congregation');
  assert.equal(workspace.productName, 'CRC Overlays');
  assert.equal(workspace.stage, 'trial');
  assert.equal(workspace.deployment.usesDefaultCrcIdentity, true);
  assert.equal(workspace.deployment.isolationVerified, false);
  assert.deepEqual(workspace.setupDownloads.map(item => item.kind), ['module', 'pages', 'pages']);
});

test('a second deployment can supply its own public identity without inheriting CRC downloads', () => {
  const workspace = getPublicWorkspace({
    WORKSPACE_ID: 'second-congregation',
    WORKSPACE_ORGANIZATION_NAME: 'Example Community',
    WORKSPACE_SHORT_NAME: 'EC',
    WORKSPACE_PRODUCT_NAME: 'Example Community Graphics',
    WORKSPACE_OUTPUT_NAME: 'EC sanctuary graphics',
    WORKSPACE_LOGO_PATH: '/workspace/logo.svg',
    WORKSPACE_LOGO_ALT: 'Example Community logo',
    WORKSPACE_PRIMARY_COLOR: '#336699',
    WORKSPACE_DEEP_COLOR: '#102030',
    WORKSPACE_ACCENT_COLOR: '#ffcc00',
    WORKSPACE_STAGE: 'production',
    WORKSPACE_SUPPORT_EMAIL: 'av@example.org',
    WORKSPACE_COMPANION_MODULE_PATH: '/downloads/community-module.tgz',
    WORKSPACE_COMPANION_PAGE_PATHS: '/downloads/community-page.companionconfig',
    WORKSPACE_ISOLATION_VERIFIED: 'true',
  });
  assert.equal(workspace.organizationName, 'Example Community');
  assert.equal(workspace.outputName, 'EC sanctuary graphics');
  assert.equal(workspace.deployment.usesDefaultCrcIdentity, false);
  assert.equal(workspace.deployment.isolationVerified, true);
  assert.deepEqual(workspace.setupDownloads.map(item => item.href), [
    '/downloads/community-module.tgz',
    '/downloads/community-page.companionconfig',
  ]);

  const withoutFiles = getPublicWorkspace({
    WORKSPACE_ID: 'second-congregation',
    WORKSPACE_ORGANIZATION_NAME: 'Example Community',
    WORKSPACE_SHORT_NAME: 'EC',
    WORKSPACE_PRODUCT_NAME: 'Example Community Graphics',
    WORKSPACE_OUTPUT_NAME: 'EC sanctuary graphics',
    WORKSPACE_LOGO_PATH: '/workspace/logo.svg',
    WORKSPACE_LOGO_ALT: 'Example Community logo',
    WORKSPACE_PRIMARY_COLOR: '#336699',
    WORKSPACE_DEEP_COLOR: '#102030',
    WORKSPACE_ACCENT_COLOR: '#ffcc00',
  });
  assert.deepEqual(withoutFiles.setupDownloads, []);
});

test('workspace validation rejects unsafe public configuration', () => {
  assert.throws(() => getPublicWorkspace({WORKSPACE_ID: '../crc'}), /Workspace ID/);
  assert.throws(() => getPublicWorkspace({WORKSPACE_LOGO_PATH: '/assets/../private-key'}), /public path/);
  assert.throws(() => getPublicWorkspace({WORKSPACE_PRIMARY_COLOR: 'red'}), /hex color/);
  assert.throws(() => getPublicWorkspace({WORKSPACE_SUPPORT_EMAIL: 'not-an-email'}), /support email/);
  assert.throws(() => getPublicWorkspace({WORKSPACE_ID: 'unknown-workspace'}), /Custom workspace is missing/);
});

test('public workspace endpoint returns only the public contract', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.version, 1);
  assert.equal(Object.hasOwn(body, 'credentials'), false);
  assert.equal(Object.hasOwn(body, 'sourcePackages'), false);
  assert.equal(Object.hasOwn(body, 'relay'), false);
});

test('prepared Temple Bnai Israel profile validates and remains visibly unprovisioned', () => {
  const profile = JSON.parse(readFileSync(new URL('../workspaces/temple-bnai-israel/workspace.json', import.meta.url), 'utf8'));
  const workspace = getPublicWorkspace(profile.environment);
  assert.equal(workspace.id, 'temple-bnai-israel-kalamazoo');
  assert.equal(workspace.organizationName, "Temple B'nai Israel");
  assert.equal(workspace.shortName, 'TBI');
  assert.equal(workspace.logo.src, '/workspaces/temple-bnai-israel/official-footer.png');
  assert.equal(workspace.deployment.isolationVerified, false);
  assert.equal(profile.status, 'prepared-not-provisioned');
  assert.equal(profile.provisioning.isolatedDatabase, true);
  assert.equal(profile.provisioning.isolatedRelay, true);
  assert.equal(profile.provisioning.isolatedCredentials, true);
  assert.equal(profile.provisioning.isolatedDeployment, false);
  assert.equal(profile.provisioning.membersInvited, false);
  assert.equal(profile.provisioning.publicSiteCreated, false);
  assert.deepEqual(workspace.setupDownloads, []);
});

test('Temple Bnai Israel is selectable as a complete built-in profile with one deployment setting', () => {
  const workspace = getPublicWorkspace({WORKSPACE_ID: 'temple-bnai-israel-kalamazoo'});
  const outputBranding = overlayBrandingFromWorkspace(workspace);
  assert.equal(workspace.organizationName, "Temple B'nai Israel");
  assert.equal(workspace.logo.src, '/workspaces/temple-bnai-israel/official-footer.png');
  assert.deepEqual(workspace.setupDownloads, []);
  assert.deepEqual(outputBranding, {
    name: 'TBI',
    organizationName: "Temple B'nai Israel",
    titleColor: '#2b5672',
    titleShade: '#183646',
    accentColor: '#e55c5e',
    logo: '/workspaces/temple-bnai-israel/official-footer.png',
    logoAlt: "Colorful tree and Star of David artwork used by Temple B'nai Israel",
  });
});

test('prepared TBI starter selection exactly tracks the visible CRC baseline and its rights evidence', () => {
  const starter = JSON.parse(readFileSync(new URL('../workspaces/temple-bnai-israel/starter-collection.json', import.meta.url), 'utf8'));
  const visible = (cues as Array<{id:string; hidden?:boolean; provenance?:{liturgy?:{license?:unknown}}}>).filter(cue => !cue.hidden);
  assert.equal(starter.status, 'approved-selection-prepared-not-imported');
  assert.equal(starter.items.length, 24);
  assert.deepEqual(new Set(starter.items.map((item:{sourceCueId:string}) => item.sourceCueId)), new Set(visible.map(cue => cue.id)));
  for (const cue of visible) {
    const item = starter.items.find((candidate:{sourceCueId:string}) => candidate.sourceCueId === cue.id);
    assert.ok(item);
    assert.equal(item.shareMode, 'full-private-copy-with-license-metadata');
  }
});

test('TBI baseline duplicates all visible content under independent cue IDs and retained provenance', () => {
  const crc = baselineCatalogForWorkspace('crc');
  const tbi = baselineCatalogForWorkspace('temple-bnai-israel-kalamazoo');
  assert.equal(tbi.length, 24);
  assert.equal(new Set(tbi.map(cue => cue.id)).size, 24);
  assert.equal(tbi.some(cue => crc.some(source => source.id === cue.id)), false);
  for (const cue of tbi) {
    const transfer = cue.provenance?.workspaceTransfer as {sourceCueId?:string; destinationWorkspace?:string; automaticUpdates?:boolean}|undefined;
    assert.equal(transfer?.destinationWorkspace, 'temple-bnai-israel-kalamazoo');
    assert.equal(transfer?.automaticUpdates, false);
    const source = crc.find(candidate => candidate.id === transfer?.sourceCueId);
    assert.equal(source?.name, cue.name);
    assert.deepEqual(source?.texts, cue.texts);
  }
  assert.throws(() => baselineCatalogForWorkspace('unconfigured-community'), /No baseline catalog/);
});
