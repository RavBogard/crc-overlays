// The catalog parse path of the released 1.7.0 module, frozen so a test can prove a newer web
// envelope still validates in the modules already installed in the booths. catalog.ts beside this
// file is `git show 91a35a9:companion/src/catalog.ts` verbatim (the commit that built
// public/downloads/crc-overlays-1.7.0.tgz; its LF-normalized sha256 is pinned in the tests), and
// parseCatalogBody/isRecord below are copied verbatim from that commit's src/client.ts. Never edit.
export { CatalogStore, validateCatalog, validateSlots } from './catalog.js'

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

export function parseCatalogBody(body: unknown): { cues: unknown; slots?: unknown } {
  if (Array.isArray(body)) return { cues: body }
  if (isRecord(body) && Array.isArray(body.cues)) return { cues: body.cues, slots: body.slots }
  return { cues: body }
}
