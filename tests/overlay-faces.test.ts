import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {waitForOverlayFonts} from '../lib/overlay-assets.ts';

const ASSETS_DIR = new URL('../public/assets/', import.meta.url);

// Same fake-document.fonts technique as tests/player.test.ts: waitForOverlayFonts only
// touches document.fonts.load/.ready/.check, so a minimal stub is enough.
function stubDocument() {
  const calls: string[] = [];
  (globalThis as unknown as {document: unknown}).document = {
    fonts: {
      load: async (spec: string) => { calls.push(spec); return []; },
      ready: Promise.resolve(),
      check: () => true,
    },
  };
  return calls;
}

test('waitForOverlayFonts loads only the default faces when faces is omitted or "default"', async () => {
  const calls = stubDocument();
  await waitForOverlayFonts();
  assert.deepEqual(calls, [
    '400 40px "Noto Sans Hebrew"',
    '500 40px "Noto Sans Hebrew"',
    '400 40px "WorkRefresh"',
    '500 40px "WorkRefresh"',
  ]);

  const explicitDefaultCalls = stubDocument();
  await waitForOverlayFonts(undefined, 'default');
  assert.deepEqual(explicitDefaultCalls, calls);
});

test('waitForOverlayFonts additionally loads the book faces when faces==="book"', async () => {
  const calls = stubDocument();
  await waitForOverlayFonts(undefined, 'book');
  assert.deepEqual(calls, [
    '400 40px "Noto Sans Hebrew"',
    '500 40px "Noto Sans Hebrew"',
    '400 40px "WorkRefresh"',
    '500 40px "WorkRefresh"',
    '400 40px "David Libre"',
    '500 40px "David Libre"',
    '400 40px "Frank Ruhl Libre"',
    '500 40px "Frank Ruhl Libre"',
  ]);
});

test('waitForOverlayFonts rejects when a book face fails to load, same as an existing face', async () => {
  (globalThis as unknown as {document: unknown}).document = {
    fonts: {
      load: async (spec: string) => { if (spec.includes('David Libre')) throw Error('font load failed'); return []; },
      ready: Promise.resolve(),
      check: () => true,
    },
  };
  await assert.rejects(waitForOverlayFonts(undefined, 'book'));
});

test('each book face font file exists, is non-empty, and has an OFL license beside it', () => {
  const dir = fileURLToPath(ASSETS_DIR);
  const named = ['DavidLibre-Regular.ttf', 'DavidLibre-Medium.ttf', 'DavidLibre-OFL.txt', 'FrankRuhlLibre-OFL.txt'];
  for (const name of named) {
    const stats = statSync(fileURLToPath(new URL(name, ASSETS_DIR)));
    assert.ok(stats.isFile() && stats.size > 0, `${name} is missing or empty`);
  }
  // Frank Ruhl Libre ships upstream only as a variable font; if that's still true its exact
  // bracketed filename is kept rather than renamed (an OFL Reserved Font Name concern).
  const frankRuhlFonts = readdirSync(dir).filter(name => name.startsWith('FrankRuhlLibre') && name.endsWith('.ttf'));
  assert.ok(frankRuhlFonts.length > 0, 'no Frank Ruhl Libre font file found in public/assets/');
  for (const name of frankRuhlFonts) {
    const stats = statSync(fileURLToPath(new URL(name, ASSETS_DIR)));
    assert.ok(stats.isFile() && stats.size > 0, `${name} is missing or empty`);
  }
});

test('app/overlay-faces.css references only font files that exist in public/assets/', () => {
  const css = readFileSync(fileURLToPath(new URL('../app/overlay-faces.css', import.meta.url)), 'utf8');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(urls.length > 0, 'app/overlay-faces.css declares no @font-face src urls');
  for (const url of urls) {
    assert.ok(url.startsWith('/assets/'), `${url} is outside /assets/`);
    assert.ok(existsSync(fileURLToPath(new URL(`../public${url}`, import.meta.url))), `${url} referenced by overlay-faces.css does not exist`);
  }
});
