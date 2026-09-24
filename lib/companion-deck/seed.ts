// CRC's deck as released on 2026-09-23 (docs/planning/2026-09-23-overlay-consistency/companion/
// PRESET-DESIGN.md), built as a CompanionDeck. Cue bindings come from CUE-MANIFEST.json; device
// fragments, connection stubs, triggers, custom variables and each button's id seed come from
// crc-seed-data.json, which extract.ts derives from the released preset (no connection config or
// secrets exist there to derive). renderDeck(seedCrcDeck(manifest, data)) is that preset, byte for byte.
import {
  PAGE_TEMPLATES, PALETTE, WORKSPACE_COMPANION, chainNeighbours, parseCell, stableId, wrapLabel,
  type ButtonSpec, type CameraGesture, type CompanionDeck, type CueRole, type DeckButton, type DeckConnection, type DeckPage,
  type DeviceFragment, type FixedRole, type JsonObject,
} from './model.ts'

/* ------------------------------------------------------------ manifest --- */

export type ManifestBinding = {
  cueId: string; draftName: string; activeRevision?: number; page: number; pageName: string; cell: string; label: string; role: CueRole
  sequence?: { name: string; index: number; count: number }; cameraGesture?: CameraGesture
}
export type CueManifest = { generatedAt?: string; bindings: ManifestBinding[] }

/* --------------------------------------------------------- seed data --- */

export type CrcSeedData = {
  about: string
  source: { file: string; sha256: string }
  companion: { build: string; exportVersion: number }
  connections: DeckConnection[]
  triggers: JsonObject
  customVariables: JsonObject
  fragments: Record<string, DeviceFragment>
  /** Button id seeds by context ("4/r3c1", "2/0/0"): the first counter value each button consumed. */
  idBases: Record<string, number>
}

/* ------------------------------------------------------------ CRC layout --- */

/** Explicit Prev/Next chains per service. Home is page 1. */
export const CHAINS = [
  [4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 15, 16],
  [17, 18],
  [19, 20, 21, 22, 23, 24, 25],
]

/** Carried device pages: new page → [original page, new name]. */
export const CARRIED: Record<number, [number, string]> = {
  31: [96, 'Cams · Morning'], 32: [98, 'Cams · Evening'], 33: [95, 'Cams · Torah'], 34: [94, "Cams · B'nai Mitzvah"],
  35: [93, "Cams · B'nai Mitzvah save"], 36: [97, 'Cams · Candles save'], 37: [18, 'Cams · Funeral'], 38: [92, 'Cam · Left'],
  39: [91, 'Cam · Center'], 40: [90, 'Cam · Right (Door)'], 41: [89, 'Cam · Bimah (Black)'], 42: [88, 'Cam · Dorothy'],
  43: [86, 'Cam · Dorothy spin'], 44: [85, 'Cams · Oneg'], 45: [82, 'Cams · Right Oneg'], 46: [84, 'Cams · Shir Shabbat'],
  47: [81, 'Cams · Rainbow'], 48: [80, 'Cams · Rainbow 2'], 49: [87, 'Adv Cam Control'], 50: [43, 'PTZ pad · Right (Door)'],
  51: [44, 'PTZ pad · Left'], 52: [99, 'AV / Stream'], 53: [79, 'Startup tools'], 54: [75, 'Self-production'],
  55: [83, 'Media Player (VLC)'], 56: [20, 'Audio presets'],
}
/** Original page number → new page number (Home stays 1). */
export const PAGE_REMAP: Record<number, number> = Object.fromEntries([[1, 1], ...Object.entries(CARRIED).map(([n, [o]]) => [o, Number(n)])])

/** Remap an absolute "page/row/col" location; relative `$(this:...)` locations pass through. */
export function remapLocation(loc: unknown): { value: unknown; ok: boolean } {
  const m = /^(\d+)\/(.+)$/.exec(String(loc ?? ''))
  if (!m) return { value: loc, ok: true }
  const to = PAGE_REMAP[Number(m[1])]
  return to ? { value: `${to}/${m[2]}`, ok: true } : { value: loc, ok: false }
}

/**
 * Device buttons carried from Michael's export onto the hand-placed pages, in build order:
 * [page, row, col, original "page/row/col", label]. Their fragments are keyed "page/row/col".
 */
export const DEVICE_CELLS: [number, number, number, string, string][] = [
  [1, 0, 3, '1/1/3', 'No-prod\nStart Stream'], [1, 1, 3, '1/2/3', 'No-prod\nEnd Stream'], [1, 2, 3, '1/0/3', 'Start HHD\nStream'],
  [1, 3, 3, '1/3/3', 'Music Rec'], [1, 0, 4, '1/3/0', 'Security\nCam'], [1, 1, 4, '1/3/7', 'Booth Mic\nMute'],
  [2, 0, 2, '84/3/4', 'Bimah +5\n(stream)'], [2, 1, 2, '84/3/5', 'Bimah −8\n(stream)'], [2, 2, 2, '84/3/6', 'Mute bimahs\n(stream)'],
  [2, 3, 2, '1/3/7', 'Booth Mic\nMute'], [2, 0, 3, '20/3/6', 'ARD audio\npreset'], [2, 1, 3, '20/3/7', 'Computer\naudio preset'],
  [2, 2, 3, '99/0/2', 'Close audio'], [2, 3, 3, '20/3/3', 'Bimah mute\n(old ch01)'],
  [30, 0, 1, '72/0/1', 'F1 · Left\n(2nd deck)'], [30, 1, 1, '72/0/2', 'F2 · Center\n(2nd deck)'], [30, 2, 1, '72/0/3', 'F3 · Right\n(2nd deck)'],
  [30, 3, 1, '72/0/4', 'F4 · Bimah\n(2nd deck)'], [30, 0, 2, '72/0/5', 'F5 · Dorothy\n(2nd deck)'], [30, 1, 2, '72/0/6', 'F6 · preview 8'],
  [30, 2, 2, '76/3/0', 'Right cam 3\nno overlay'], [30, 3, 2, '1/3/0', 'Security\nCam'],
  [30, 0, 3, '99/0/5', 'Start\nPreRoll'], [30, 1, 3, '99/0/6', 'End\nPreRoll'],
]

/** Entity fragments re-ided at each use, and where the released preset carries one instance of each. */
export const TEMPLATE_FRAGMENTS = {
  'camera-tally': 'vMix inputLive tally feedback (original 18/1/3)',
  'bimah-mute': 'X32 Bimah Mute key (original 16/3/7)',
  'vmix-bus-x-on': "vMix Bus X audio on (second action of the original Seder 'Dinner!' key, 21/0/4)",
  'seder-merge-dinner': "Merge dinner (first step of the original 'Dinner!' key, carried disabled)",
  'seder-merge-bima': "Merge bima cam 4 + Bus X (second step of the original 'Dinner!' key)",
} as const

export const CRC_CONTEXT = { chains: CHAINS, carried: CARRIED }

/* --------------------------------------------------------------- builder --- */

export type SeedOrder = { page: number; button: DeckButton }[]

/**
 * Build CRC's deck. Buttons are created in the original generator's order; `order` lists them that way
 * (extract.ts uses it to recover each button's id seed from the released preset).
 */
export function buildCrcDeck(manifest: CueManifest, data: CrcSeedData): { deck: CompanionDeck; order: SeedOrder } {
  const P = PALETTE
  const templates = PAGE_TEMPLATES.crc
  const order: SeedOrder = []
  const pages = new Map<number, DeckPage>()
  const newPage = (n: number, name: string, template: string) => {
    if (!templates[template]) throw new Error(`no CRC page template ${template}`)
    pages.set(n, { number: n, id: stableId(`page:${n}`), name, template, buttons: [] })
  }
  const name = (n: number) => {
    const p = pages.get(n)
    if (!p) throw new Error(`page ${n} is not in the deck`)
    return p.name
  }
  const place = (n: number, row: number, col: number, spec: ButtonSpec, ctx: string | null) => {
    const page = pages.get(n)
    if (!page) throw new Error(`page ${n} is not in the deck`)
    if (page.buttons.some((b) => b.row === row && b.col === col)) throw new Error(`page ${n} r${row}c${col} assigned twice`)
    const button: DeckButton = { row, col, spec, ...(ctx == null ? {} : { ids: { ctx, base: data.idBases[ctx] ?? 0 } }) }
    page.buttons.push(button)
    order.push({ page: n, button })
  }
  const at = (n: number, r: number, c: number) => `${n}/${r}/${c}`

  // Fixed cells from the page's template, in the original order: c6 recovery, then c7, then c0.
  const fixedSpec = (n: number, role: FixedRole): ButtonSpec | null => {
    switch (role) {
      case 'animate-out': return { kind: 'module', text: 'Animate\nout', bg: P.black, action: 'animate_clear' }
      case 'clear-now': return { kind: 'module', text: 'Clear\nnow', bg: P.darkRed, action: 'clear_now' }
      case 'logo-toggle': return { kind: 'module', text: 'Logo\non/off', bg: P.charcoal, action: 'logo_toggle', logoFeedback: true }
      case 'prev': case 'next': {
        const nb = chainNeighbours(CHAINS, n)
        if (!nb) return null
        const to = role === 'prev' ? nb.prev : nb.next
        const title = to === 1 ? 'Home' : name(to)
        return { kind: 'jump', text: role === 'prev' ? `◂ Prev\n${title}` : `Next ▸\n${title}`, page: to }
      }
      case 'home': return { kind: 'jump', text: 'Home\n$(this:page_name)', page: 1 }
      case 'bimah-mute': return { kind: 'fragment', fragment: 'bimah-mute', text: 'Bimah\nMute', bg: P.purple }
      case 'camera-center': return { kind: 'camera', text: 'Center\ncam 1', input: 'center cam 1', tally: 1 }
      case 'camera-left': return { kind: 'camera', text: 'Left\ncam 2', input: 'left cam 2', tally: 2 }
      case 'camera-right': return { kind: 'camera', text: 'Right\ncam 3', input: 'right cam 3', tally: 3 }
      case 'merge': return { kind: 'merge' }
      default: throw new Error(`role ${role} is placed by the carried-page builder`)
    }
  }
  const applyTemplate = (n: number) => {
    const t = templates[pages.get(n)!.template]
    const seq = (cells: typeof t.fixed) => cells.forEach((f) => {
      const spec = fixedSpec(n, f.role)
      if (spec) place(n, f.row, f.col, spec, at(n, f.row, f.col))
    })
    seq(t.fixed.filter((f) => f.col === 6))
    seq(t.fixed.filter((f) => f.col === 7))
    seq(t.fixed.filter((f) => f.col === 0))
  }

  const bindingsByPage = new Map<number, ManifestBinding[]>()
  for (const b of manifest.bindings) {
    if (!bindingsByPage.has(b.page)) bindingsByPage.set(b.page, [])
    bindingsByPage.get(b.page)!.push(b)
  }

  // Page names first, so Prev/Next labels can name their targets.
  for (let n = 1; n <= 26; n++) {
    const pageName = bindingsByPage.get(n)?.[0]?.pageName
    if (!pageName) throw new Error(`manifest has no bindings for page ${n}`)
    newPage(n, pageName, n >= 3 ? 'service' : 'utility')
  }
  newPage(27, 'Spare', 'spare'); newPage(28, 'Spare', 'spare'); newPage(29, 'Devices', 'utility'); newPage(30, 'Cameras', 'utility')
  for (const [n, [, pageName]] of Object.entries(CARRIED)) newPage(Number(n), pageName, 'carried')

  // Service and utility pages 1–26: manifest cue cells, then the template's fixed cells.
  for (let n = 1; n <= 26; n++) {
    for (const b of bindingsByPage.get(n)!) {
      const [r, c] = parseCell(b.cell)
      const spec: ButtonSpec = {
        kind: 'cue', cueId: b.cueId, label: b.label, role: b.role,
        // Cloned: the deck is edited in place by the deck tools, and must never share objects with the manifest.
        ...(b.sequence ? { sequence: structuredClone(b.sequence) } : {}), ...(b.cameraGesture ? { gesture: structuredClone(b.cameraGesture) } : {}),
        catalog: { name: b.draftName, revision: b.activeRevision ?? null },
      }
      place(n, r, c, spec, `${n}/${b.cell}`)
    }
    applyTemplate(n)
  }

  const J = (n: number, r: number, c: number, text: string, to: number) => place(n, r, c, { kind: 'jump', text, page: to }, at(n, r, c))
  const device = (n: number, r: number, c: number, text?: string) =>
    place(n, r, c, { kind: 'fragment', fragment: at(n, r, c), ...(text == null ? {} : { text }) }, null)
  const devices = (n: number, from: number, to: number) =>
    DEVICE_CELLS.filter(([p]) => p === n).slice(from, to).forEach(([, r, c, , text]) => device(n, r, c, text))

  // 1 · Home
  J(1, 0, 0, 'Friday ▸', 4); J(1, 1, 0, 'Shabbat AM ▸', 10); J(1, 2, 0, "B'nai\nMitzvah ▸", 17); J(1, 3, 0, 'Havdalah ▸', 18)
  J(1, 0, 1, 'Holy Days ▸', 19); J(1, 1, 1, 'Kol Nidre ·\nNeilah ▸', 24); J(1, 2, 1, 'Memorial ▸', 26); J(1, 3, 1, 'Anytime ▸', 3)
  J(1, 0, 2, 'Cameras ▸', 30); J(1, 1, 2, 'Devices ▸', 29); J(1, 2, 2, 'AV /\nStream ▸', 52); J(1, 3, 2, 'Output &\nAudio ▸', 2)
  devices(1, 0, Infinity)
  place(1, 2, 4, { kind: 'module', text: 'Refresh\ncatalog', bg: P.charcoal, action: 'refresh_catalog' }, '1/2/4')

  // 2 · Output & Audio
  place(2, 0, 0, { kind: 'module', text: 'Logo ON', bg: P.charcoal, action: 'logo_on', logoFeedback: true }, '2/0/0')
  place(2, 1, 0, { kind: 'module', text: 'Logo OFF', bg: P.charcoal, action: 'logo_off' }, '2/1/0')
  place(2, 2, 0, { kind: 'module', text: 'Refresh\ncatalog', bg: P.charcoal, action: 'refresh_catalog' }, '2/2/0')
  devices(2, 0, Infinity)
  J(2, 0, 4, 'Media\nPlayer ▸', 55); J(2, 1, 4, 'Audio\npresets ▸', 56)
  place(2, 2, 4, { kind: 'actions', text: 'vMix Bus X\naudio on', bg: P.black, steps: [['vmix-bus-x-on']] }, '2/2/4')

  // 29 · Devices (index) and 30 · Cameras (hub).
  const DEVICES = [[31, 35, 39, 43, 47, 51], [32, 36, 40, 44, 48, 52], [33, 37, 41, 45, 49, 53], [34, 38, 42, 46, 50, 54]]
  DEVICES.forEach((row, r) => row.forEach((to, c) => J(29, r, c, `${wrapLabel(name(to), 12)} ▸`, to)))
  for (const [r, role] of [[0, 'camera-center'], [1, 'camera-left'], [2, 'camera-right'], [3, 'merge']] as const) place(30, r, 0, fixedSpec(30, role)!, at(30, r, 0))
  devices(30, 0, Infinity)
  // The original Seder "Dinner!" key: its first step (merge dinner) was disabled; carried disabled, as it was.
  place(30, 2, 3, { kind: 'actions', text: 'Merge dinner\n(Seder)', bg: P.orange, steps: [['seder-merge-dinner']] }, '30/2/3')
  place(30, 3, 3, { kind: 'actions', text: 'Merge bima\ncam 4 + Bus X', bg: P.orange, steps: [['seder-merge-bima']] }, '30/3/3')
  ;[[31, 38], [32, 39], [33, 40], [34, 29]].forEach(([to, to2], r) => {
    J(30, r, 4, `${wrapLabel(name(to), 12)} ▸`, to); J(30, r, 5, `${wrapLabel(name(to2), 12)} ▸`, to2)
  })
  applyTemplate(29); applyTemplate(30)

  // Carried device pages 31–56: every carried cell, then the Devices ring in c7.
  const carried = Object.keys(CARRIED).map(Number)
  for (const n of carried) {
    for (const key of Object.keys(data.fragments)) {
      const m = /^(\d+)\/(\d)\/(\d)$/.exec(key)
      if (!m || Number(m[1]) !== n) continue
      if (Number(m[3]) === 7 && Number(m[2]) <= 2) continue // the nav column below
      device(n, Number(m[2]), Number(m[3]))
    }
    const prev = n === 31 ? 29 : n - 1, next = n === 56 ? 29 : n + 1
    J(n, 0, 7, `◂ ${wrapLabel(name(prev), 12)}`, prev)
    // Camera pages keep their own Home key: it carries the vMix preview/program tally corners.
    if (data.fragments[at(n, 1, 7)]) place(n, 1, 7, { kind: 'fragment', fragment: at(n, 1, 7), text: 'Home\n$(this:page_name)' }, null)
    else J(n, 1, 7, 'Home\n$(this:page_name)', 1)
    J(n, 2, 7, `${wrapLabel(name(next), 12)} ▸`, next)
  }

  const deck: CompanionDeck = {
    schema: 1,
    workspace: 'crc',
    companion: { release: WORKSPACE_COMPANION.crc.release, build: data.companion.build, exportVersion: data.companion.exportVersion },
    palette: { ...PALETTE },
    switcher: { mergeDurationMs: 1000, presetWaitMs: 1300 },
    grid: { rows: 4, columns: 8 },
    chains: CHAINS.map((c) => [...c]),
    connections: structuredClone(data.connections),
    templates: structuredClone(templates),
    pages: [...pages.values()].sort((a, b) => a.number - b.number),
    fragments: structuredClone(data.fragments),
    triggers: structuredClone(data.triggers),
    customVariables: structuredClone(data.customVariables),
  }
  return { deck, order }
}

/** CRC's deck as released. */
export function seedCrcDeck(manifest: CueManifest, data: CrcSeedData): CompanionDeck {
  return buildCrcDeck(manifest, data).deck
}
