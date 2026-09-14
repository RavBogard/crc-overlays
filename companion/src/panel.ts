// The authoring tool publishes multipart graphics with a name of the form
// `<name> — 01 of 03`: an em dash (U+2014) with a single space on each side, and
// both numbers zero padded to the same width (at least two digits). Parsing that
// name is the only way the module learns the panel position, so the match is
// deliberately strict: a hyphen, an en dash, or any other separator is not this
// convention and yields no panel variables at all rather than a guess.

const MULTIPART_NAME = /^(?<name>.+?) — (?<panel>\d{1,4}) of (?<count>\d{1,4})$/

export interface PanelPosition {
  /** The graphic name with the panel suffix removed. */
  name: string
  /** The panel number exactly as published, so `01` stays `01`. */
  panel: string
  /** The panel total exactly as published. */
  count: string
}

/** The minimum a catalog entry has to look like for panel navigation. */
export interface PanelCue { id: string; name: string }
/** A set is every catalog cue that shares one title under the multipart convention. */
export interface PanelSet { title: string; cues: PanelCue[] }

export function parsePanelName(value: unknown): PanelPosition | null {
  if (typeof value !== 'string') return null
  const match = MULTIPART_NAME.exec(value)
  const groups = match?.groups
  if (!groups) return null
  const name = groups.name ?? ''
  const panel = groups.panel ?? ''
  const count = groups.count ?? ''
  if (!name.trim() || !panel || !count) return null
  const index = Number(panel)
  const total = Number(count)
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < index) return null
  return { name: name.trim(), panel, count }
}

/**
 * The panel sets present in a catalog, in catalog order: every distinct title
 * that has at least one `<title> — NN of MM` member. A single-part graphic is
 * not a set, so it never appears in the operator's set list.
 */
export function panelSets(cues: readonly PanelCue[]): PanelSet[] {
  const sets = new Map<string, PanelSet>()
  for (const cue of cues) {
    const position = parsePanelName(cue.name)
    if (!position) continue
    const existing = sets.get(position.name)
    if (existing) existing.cues.push(cue)
    else sets.set(position.name, { title: position.name, cues: [cue] })
  }
  return [...sets.values()]
}

function memberAt(cues: readonly PanelCue[], title: string, index: number): PanelCue | null {
  for (const cue of cues) {
    const position = parsePanelName(cue.name)
    if (position && position.name === title && Number(position.panel) === index) return cue
  }
  return null
}

/**
 * The next or previous panel of whatever is live, derived from the live cue's
 * published name and the catalog alone — the server keeps no cursor.
 *
 * From panel *n* of *m*, `step` 1 targets *n+1* and wraps from *m* to 1; `step`
 * -1 targets *n-1* and wraps from 1 to *m*. When the live cue is not a panel, is
 * not in the catalog, or its neighbour is not published, the target is panel 01
 * of `selectedSet`; with no set selected there is no target and the caller sends
 * nothing rather than guessing.
 */
export function panelTarget(cues: readonly PanelCue[], liveCue: string | null, step: 1 | -1, selectedSet = ''): string | null {
  const live = liveCue ? cues.find(cue => cue.id === liveCue) : undefined
  const position = live ? parsePanelName(live.name) : null
  if (position) {
    const total = Number(position.count)
    const index = Number(position.panel)
    const wrapped = ((index - 1 + step + total) % total) + 1
    const neighbour = memberAt(cues, position.name, wrapped)
    if (neighbour) return neighbour.id
  }
  if (!selectedSet) return null
  return memberAt(cues, selectedSet, 1)?.id ?? null
}
