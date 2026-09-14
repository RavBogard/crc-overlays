// The hello frame reports the module version so the relay, and the health page
// behind it, can name what is connected. The relay accepts three dot-separated
// numbers of at most 32 characters and treats anything else as null, so this
// module never invents a version: if no packaged metadata can be read, it sends
// null rather than a guess.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = /^\d{1,10}\.\d{1,10}\.\d{1,10}$/

export function parseVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length <= 32 && VERSION.test(trimmed) ? trimmed : null
}

// Source and build layouts keep the metadata one directory above the entry point
// (`src/`, `dist/`); the packaged archive puts it beside the bundled entry point.
export function versionCandidates(moduleDir: string): string[] {
  return [
    join(moduleDir, 'package.json'),
    join(moduleDir, '..', 'package.json'),
    join(moduleDir, 'companion', 'manifest.json'),
    join(moduleDir, '..', 'companion', 'manifest.json'),
  ]
}

export function readVersionFrom(candidates: readonly string[], read: (path: string) => string): string | null {
  for (const candidate of candidates) {
    let parsed: unknown
    try { parsed = JSON.parse(read(candidate)) } catch { continue }
    const version = parseVersion((parsed as { version?: unknown } | null)?.version)
    if (version) return version
  }
  return null
}

let cached: string | null | undefined

export function moduleVersion(): string | null {
  if (cached === undefined) {
    try {
      cached = readVersionFrom(versionCandidates(dirname(fileURLToPath(import.meta.url))), path => readFileSync(path, 'utf8'))
    } catch {
      cached = null
    }
  }
  return cached
}
