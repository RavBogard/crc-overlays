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
