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
/**
 * A set is every catalog cue that shares one title *and* one id namespace under the
 * multipart convention. The title alone is not the identity: a names list for a service
 * is published under the operator's own title, so a list called "Mi Shebeirach" would
 * otherwise merge with the published multipart set of the same name and Next panel could
 * step out of the live list and into the library. Two names lists on two services can
 * carry the same title as well, so the namespace is the whole `names:<collectionId>:`
 * prefix, not just `names:`.
 */
export interface PanelSet {
  /** The dropdown value the operator's button stores; stable across catalog refreshes. */
  id: string
  /** The published title, with the panel suffix removed. */
  title: string
  /** '' for published and baseline graphics, `names:<collectionId>:` for a names list. */
  namespace: string
  /** What the operator reads in the dropdown; a names list says so. */
  label: string
  cues: PanelCue[]
}

const NAMES_NAMESPACE = 'names:'
/** How a names set is distinguished from a published set of the same title. */
const NAMES_SET_SUFFIX = ' (names for this service)'

/**
 * The id namespace a cue belongs to. Everything published or baseline shares the one
 * anonymous namespace; a names cue id is `names:<collectionId>:<NN>` (lib/names-list.ts),
 * so its namespace is the prefix up to and including the last colon.
 */
export function panelNamespace(cueId: string): string {
  if (!cueId.startsWith(NAMES_NAMESPACE)) return ''
  const lastColon = cueId.lastIndexOf(':')
  return lastColon < NAMES_NAMESPACE.length ? NAMES_NAMESPACE : cueId.slice(0, lastColon + 1)
}

/**
 * The dropdown value for a set. A published set keeps using its bare title, so a button
 * saved before this distinction existed still resolves to the same published set.
 */
function setId(namespace: string, title: string): string { return namespace + title }

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
    const namespace = panelNamespace(cue.id)
    const id = setId(namespace, position.name)
    const existing = sets.get(id)
    if (existing) existing.cues.push(cue)
    else sets.set(id, {
      id,
      title: position.name,
      namespace,
      label: namespace ? `${position.name}${NAMES_SET_SUFFIX}` : position.name,
      cues: [cue],
    })
  }
  return [...sets.values()]
}

function memberAt(cues: readonly PanelCue[], namespace: string, title: string, index: number): PanelCue | null {
  for (const cue of cues) {
    if (panelNamespace(cue.id) !== namespace) continue
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
 *
 * Navigation never leaves the live cue's own set, and a set is title *and* id
 * namespace: from panel 03 of a service's names list the step wraps to panel 01 of that
 * same list, never to panel 01 of an identically titled published set or of another
 * service's list. `selectedSet` is resolved against the same set identities, so the
 * fallback lands inside the chosen set's namespace too.
 */
export function panelTarget(cues: readonly PanelCue[], liveCue: string | null, step: 1 | -1, selectedSet = ''): string | null {
  const live = liveCue ? cues.find(cue => cue.id === liveCue) : undefined
  const position = live ? parsePanelName(live.name) : null
  if (live && position) {
    const total = Number(position.count)
    const index = Number(position.panel)
    const wrapped = ((index - 1 + step + total) % total) + 1
    const neighbour = memberAt(cues, panelNamespace(live.id), position.name, wrapped)
    if (neighbour) return neighbour.id
  }
  if (!selectedSet) return null
  const set = panelSets(cues).find(candidate => candidate.id === selectedSet)
  if (!set) return null
  return memberAt(cues, set.namespace, set.title, 1)?.id ?? null
}
