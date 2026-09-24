// Role and set for each cue a deck binds: the metadata the catalog envelope carries so the Companion
// module can group and colour its presets the way the deck does (R-C5). The deck binds a cue per key,
// and a few cues sit on more than one key under different roles (Aleinu is a set on Friday and an
// alternate elsewhere), so each cue gets exactly one entry: its first binding that is not an
// alternate, in page order, or its first alternate binding when it is only ever an alternate.
import type { CompanionDeck, CueRole } from './model.ts'

export type CueSet = { id: string; name: string; index: number; count: number }
export type CueRoleEntry = { role: CueRole; set?: CueSet }

/** A set's id: its name, lowercased, folded to ASCII and joined with hyphens ("Mourner's Kaddish" → "mourners-kaddish"). */
export function cueSetId(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

/** cueId → role and set, for every cue key in the deck. Throws when two differently named sets share an id. */
export function deckCueRoles(deck: CompanionDeck): Record<string, CueRoleEntry> {
  const chosen = new Map<string, CueRoleEntry & { alternate: boolean }>()
  const setNames = new Map<string, string>()
  for (const page of [...deck.pages].sort((a, b) => a.number - b.number)) {
    for (const button of page.buttons) {
      const spec = button.spec
      if (spec.kind !== 'cue') continue
      const alternate = spec.role === 'alternate'
      const previous = chosen.get(spec.cueId)
      // Keep the first binding, unless it was an alternate and this one is not.
      if (previous && (!previous.alternate || alternate)) continue
      let set: CueSet | undefined
      if (spec.sequence) {
        const id = cueSetId(spec.sequence.name)
        const known = setNames.get(id)
        if (known !== undefined && known !== spec.sequence.name) throw new Error(`sets "${known}" and "${spec.sequence.name}" would share the id ${id}`)
        setNames.set(id, spec.sequence.name)
        set = { id, name: spec.sequence.name, index: spec.sequence.index, count: spec.sequence.count }
      }
      chosen.set(spec.cueId, { role: spec.role, ...(set ? { set } : {}), alternate })
    }
  }
  const out: Record<string, CueRoleEntry> = {}
  for (const [cueId, { role, set }] of [...chosen].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) out[cueId] = { role, ...(set ? { set } : {}) }
  return out
}
