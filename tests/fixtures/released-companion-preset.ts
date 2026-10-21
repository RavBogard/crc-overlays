import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {gzipSync, gunzipSync} from 'node:zlib'

export const RELEASED_SHA256 = 'bfc718e1b74fc5224da3e32e2db459f7b43ea5fca8bd5e2ef2320942713a1113'
export const RELEASED_JSON_SHA256 = '52d1da91e481e06767472e700bebf0e5a0923094eac65d5597b09e53bd232efd'
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

/** The released preset was gzipped on Windows (OS byte 10). Compare every
 * other byte exactly, and separately verify the native platform OS header.
 * Linux's OS byte 3 changes its hash, not its compressed data or JSON. */
export function assertReleasedPreset(bytes: Buffer): string {
  assert.equal(bytes[9], gzipSync(Buffer.alloc(0), {level: 9})[9], 'native gzip OS header')
  const releasedPlatformBytes = Buffer.from(bytes)
  releasedPlatformBytes[9] = 10
  assert.equal(sha256(releasedPlatformBytes), RELEASED_SHA256, 'released gzip bytes except platform OS header')
  assert.equal(sha256(gunzipSync(bytes)), RELEASED_JSON_SHA256, 'released JSON bytes')
  return sha256(bytes)
}
