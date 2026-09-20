#!/usr/bin/env node
// Convert Singular.live actions in a Bitfocus Companion export to the
// congregation's own "crc-overlays" Companion module.
//
// One-off migration tool. Node 22, plain ESM, node built-ins only.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

export const SINGULAR_MODULE = 'singularlive-studio'
export const NEW_MODULE = 'crc-overlays'

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** 21-char nanoid-like id using the Companion alphabet. */
export function makeId(len = 21) {
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += ID_ALPHABET[bytes[i] & 63]
  return out
}

/* ------------------------------------------------------------------ io --- */

export function isGzip(buf) {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b
}

export function readConfig(file) {
  const raw = fs.readFileSync(file)
  const gzipped = isGzip(raw)
  const text = (gzipped ? zlib.gunzipSync(raw) : raw).toString('utf8')
  return { data: JSON.parse(text), gzipped }
}

export function writeConfig(file, data, gzipped) {
  const text = JSON.stringify(data)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, gzipped ? zlib.gzipSync(Buffer.from(text, 'utf8')) : Buffer.from(text, 'utf8'))
}

/* ------------------------------------------------------------- catalog --- */

const normName = (s) => String(s ?? '').trim().toLowerCase()

// Compositions whose names in Companion differ from the catalog entry.
const NAME_ALIASES = new Map([
  ['ahava rabbah ahavtanu (ncomplete)', 'ahava rabbah ahavtanu (partial)'],
])

export function buildCatalogIndex(catalog) {
  const index = new Map()
  for (const [name, entry] of Object.entries(catalog)) {
    const cueId = typeof entry === 'string' ? entry : entry?.cueId
    if (!cueId) continue
    const rec = { cueId, name }
    if (entry && typeof entry === 'object') {
      if (entry.aliasOf) rec.aliasOf = entry.aliasOf
      if (entry.newButton) rec.newButton = true
      if (entry.status) rec.status = entry.status
      if (entry.source) rec.source = entry.source
    }
    index.set(normName(name), rec)
  }
  return index
}

export function lookupCue(index, comp) {
  const key = normName(comp)
  if (index.has(key)) return index.get(key)
  const alias = NAME_ALIASES.get(key)
  if (alias && index.has(alias)) return index.get(alias)
  return null
}

/* ---------------------------------------------------------- connection --- */

/**
 * Build the new connection record in the SAME schema as the sibling
 * connections in the input file, so Companion can import and upgrade it.
 */
export function buildConnection(instances, { label, baseUrl }) {
  const siblings = Object.values(instances)
  const maxSort = siblings.reduce((m, i) => Math.max(m, Number(i?.sortOrder) || 0), 0)
  const hasKey = (k) => siblings.some((i) => Object.prototype.hasOwnProperty.call(i ?? {}, k))

  const conn = {
    instance_type: NEW_MODULE,
    sortOrder: maxSort + 1,
    label,
    isFirstInit: false,
    config: { baseUrl, pairingCode: '', controlKey: '' },
    lastUpgradeIndex: -1,
    enabled: true,
  }
  // Mirror whatever optional keys the siblings in THIS file carry.
  if (hasKey('moduleVersionId')) conn.moduleVersionId = '1.1.0'
  if (hasKey('updatePolicy')) conn.updatePolicy = 'stable'
  if (hasKey('secrets')) conn.secrets = {}
  if (hasKey('moduleInstanceType')) conn.moduleInstanceType = 'connection'
  return conn
}

/* ------------------------------------------------------------ feedback --- */

const FB_REQUESTED_STYLE = { bgcolor: 16711680, color: 16777215 }
const FB_RENDERED_STYLE = { bgcolor: 65280, color: 0 }
const FB_BUG_STYLE = { bgcolor: 16711680, color: 16777215 }

function feedback(definitionId, connectionId, options, style) {
  return {
    id: makeId(),
    definitionId,
    connectionId,
    options,
    type: 'feedback',
    style,
    isInverted: false,
  }
}

/* --------------------------------------------------------- new buttons --- */

export const NEW_PAGE_DEFAULT = 53
export const NEW_PAGE_NAME = 'Overlays — part 2'

// Companion's own navigation controls; they sit on every page and are not
// "content" for the purpose of picking an empty page.
const NAV_TYPES = new Set(['pageup', 'pagedown', 'pagenum'])

export function isNavControl(ctrl) {
  return !!ctrl && typeof ctrl === 'object' && NAV_TYPES.has(ctrl.type)
}

export function pageHasContent(page) {
  for (const row of Object.values(page?.controls ?? {})) {
    for (const ctrl of Object.values(row ?? {})) {
      if (ctrl && typeof ctrl === 'object' && !isNavControl(ctrl)) return true
    }
  }
  return false
}

/** Wrap a graphic name onto two lines when it is longer than 10 characters. */
export function wrapLabel(name, max = 10) {
  const s = String(name ?? '')
  if (s.length <= max) return s
  // Greedy: pack as many whole words as fit on the first line.
  let best = -1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ' && i <= max) best = i
  }
  if (best > 0) return s.slice(0, best) + '\n' + s.slice(best + 1)
  // No usable space (one long word): split down the middle.
  const mid = Math.floor(s.length / 2)
  return s.slice(0, mid) + '\n' + s.slice(mid)
}

/** Every grid cell of a page, in row-then-column order. */
export function gridCells(page) {
  const g = page?.gridSize ?? { minRow: 0, maxRow: 3, minColumn: 0, maxColumn: 7 }
  const cells = []
  for (let r = Number(g.minRow ?? 0); r <= Number(g.maxRow ?? 3); r++) {
    for (let c = Number(g.minColumn ?? 0); c <= Number(g.maxColumn ?? 7); c++) cells.push([r, c])
  }
  return cells
}

const DEFAULT_HOUSE = {
  bgcolor: 10027059,
  bankCurrentStep: {
    definitionId: 'bank_current_step',
    connectionId: 'internal',
    options: {
      location_target: 'this',
      location_text: '$(this:page)/$(this:row)/$(this:column)',
      location_expression: "concat($(this:page), '/', $(this:row), '/', $(this:column))",
      step: 2,
    },
    type: 'feedback',
    style: { color: 16777215, bgcolor: 16711680 },
    isInverted: false,
    children: {},
  },
}

function makeNewButton(name, cueId, connectionId, house) {
  const bcs = structuredClone(house.bankCurrentStep ?? DEFAULT_HOUSE.bankCurrentStep)
  bcs.id = makeId()
  return {
    type: 'button',
    style: {
      text: wrapLabel(name),
      textExpression: false,
      size: '14',
      png64: null,
      alignment: 'center:center',
      pngalignment: 'center:center',
      color: 16777215,
      bgcolor: house.bgcolor ?? DEFAULT_HOUSE.bgcolor,
      show_topbar: 'default',
      png: null,
      latch: true,
    },
    options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false },
    feedbacks: [
      feedback('requested', connectionId, { cue: cueId }, { ...FB_REQUESTED_STYLE }),
      feedback('rendered', connectionId, { cue: cueId }, { ...FB_RENDERED_STYLE }),
      bcs,
    ],
    steps: {
      0: {
        action_sets: {
          down: [{ type: 'action', id: makeId(), definitionId: 'show_cue', connectionId, options: { cue: cueId }, upgradeIndex: -1 }],
          up: [],
        },
        options: { runWhileHeld: [] },
      },
      1: {
        action_sets: {
          down: [{ type: 'action', id: makeId(), definitionId: 'animate_out', connectionId, options: { cue: cueId }, upgradeIndex: -1 }],
          up: [],
        },
        options: { runWhileHeld: [] },
      },
    },
    localVariables: [],
  }
}

/**
 * Append a button for every catalog entry flagged `newButton` to the
 * requested page (or the next empty one), in row/column order.
 */
export function placeNewButtons(config, { entries, connectionId, requestedPage, house }) {
  const result = {
    requestedPage,
    page: null,
    pageName: null,
    moved: false,
    placed: 0,
    skipped: [],
    items: [],
  }
  if (!entries.length) return result

  const pageIds = Object.keys(config.pages ?? {})
  const startIdx = pageIds.indexOf(String(requestedPage))
  let chosen = null
  if (startIdx !== -1) {
    for (let i = startIdx; i < pageIds.length; i++) {
      if (!pageHasContent(config.pages[pageIds[i]])) {
        chosen = pageIds[i]
        break
      }
    }
  }
  if (chosen === null) return result
  result.page = chosen
  result.moved = String(chosen) !== String(requestedPage)

  const page = config.pages[chosen]
  page.controls = page.controls ?? {}
  const free = gridCells(page).filter(([r, c]) => page.controls[r]?.[c] == null)

  for (const e of entries) {
    const cell = free.shift()
    if (!cell) {
      result.skipped.push(e.name)
      continue
    }
    const [r, c] = cell
    page.controls[r] = page.controls[r] ?? {}
    page.controls[r][c] = makeNewButton(e.name, e.cueId, connectionId, house)
    result.placed++
    result.items.push({ name: e.name, cueId: e.cueId, row: r, column: c })
  }
  page.name = NEW_PAGE_NAME
  result.pageName = page.name
  return result
}

/* ---------------------------------------------------------- conversion --- */

/**
 * Walk an action array (recursing into `children`, which internal
 * action_group actions use) and convert every Singular action in place.
 */
function convertActionArray(arr, ctx) {
  if (!Array.isArray(arr)) return arr
  const out = []
  for (const action of arr) {
    if (action && typeof action === 'object' && action.children) {
      for (const key of Object.keys(action.children)) {
        action.children[key] = convertActionArray(action.children[key], ctx)
      }
    }
    if (!action || !ctx.singularConnections.has(action.connectionId)) {
      out.push(action)
      continue
    }

    ctx.button.singularTotal++
    const def = action.definitionId
    const comp = action.options?.comp

    if (def === 'takeOutAllOutput') {
      action.connectionId = ctx.newConnectionId
      action.definitionId = 'animate_clear'
      action.options = {}
      ctx.stats.converted.animate_clear++
      ctx.button.mapped++
      out.push(action)
      continue
    }

    const isBug = ctx.bugNames.has(normName(comp))
    if (isBug && (def === 'animateIn' || def === 'animateOut')) {
      action.connectionId = ctx.newConnectionId
      action.definitionId = def === 'animateIn' ? 'bug_on' : 'bug_off'
      action.options = {}
      ctx.stats.converted[action.definitionId]++
      ctx.button.mapped++
      if (action.definitionId === 'bug_on') ctx.setGained.bug = true
      out.push(action)
      continue
    }

    const hit = def === 'animateIn' || def === 'animateOut' ? lookupCue(ctx.catalog, comp) : null
    if (hit) {
      action.connectionId = ctx.newConnectionId
      action.definitionId = def === 'animateIn' ? 'show_cue' : 'animate_out'
      action.options = { cue: hit.cueId }
      ctx.stats.converted[action.definitionId]++
      ctx.button.mapped++
      if (action.definitionId === 'show_cue') ctx.setGained.cues.add(hit.cueId)
      if (hit.aliasOf) ctx.buttonAliases.set(hit.name, hit.aliasOf)
      out.push(action)
      continue
    }

    // Unmapped: drop the action entirely.
    ctx.button.unmapped++
    ctx.stats.unmappedActions++
    const name = String(comp ?? '(no comp)')
    ctx.recordUnmapped(name)
  }
  return out
}

export function convert(config, opts) {
  const {
    catalogIndex,
    label = 'Overlays',
    baseUrl = 'https://overlays.centralreform.org',
    bugNames = ['CRC Logo'],
    newPage = NEW_PAGE_DEFAULT,
  } = opts

  const instances = config.instances ?? {}
  const singularConnections = new Set(
    Object.entries(instances)
      .filter(([, i]) => i?.instance_type === SINGULAR_MODULE || i?.moduleId === SINGULAR_MODULE)
      .map(([id]) => id),
  )

  let newConnectionId = makeId()
  while (instances[newConnectionId]) newConnectionId = makeId()
  instances[newConnectionId] = buildConnection(instances, { label, baseUrl })
  config.instances = instances

  const stats = {
    pagesScanned: 0,
    buttonsScanned: 0,
    buttonsTouched: 0,
    buttonsMarkedDead: 0,
    feedbacksAdded: 0,
    converted: { show_cue: 0, animate_out: 0, bug_on: 0, bug_off: 0, animate_clear: 0 },
    unmappedActions: 0,
    aliasedButtons: 0,
    newButtonsPlaced: 0,
  }
  // name -> { buttons:Set<string>, actions:number, pages:Map<pageName,count> }
  const unmapped = new Map()
  const pageCoverage = []
  // catalog name -> { name, aliasOf, buttons }
  const aliasUse = new Map()
  // House pattern harvested from the first converted prayer button.
  const house = { bgcolor: null, bankCurrentStep: null }

  const bugSet = new Set(bugNames.map(normName))

  for (const [pageId, page] of Object.entries(config.pages ?? {})) {
    stats.pagesScanned++
    const pageName = page?.name || `Page ${pageId}`
    let pageSingularButtons = 0
    let pageMappedButtons = 0

    for (const row of Object.values(page?.controls ?? {})) {
      for (const btn of Object.values(row ?? {})) {
        if (!btn || typeof btn !== 'object') continue
        stats.buttonsScanned++

        const button = { singularTotal: 0, mapped: 0, unmapped: 0 }
        const setGained = { cues: new Set(), bug: false }
        const seenHere = new Set()
        const buttonAliases = new Map()
        const ctx = {
          buttonAliases,
          singularConnections,
          newConnectionId,
          catalog: catalogIndex,
          bugNames: bugSet,
          stats,
          button,
          setGained,
          recordUnmapped(name) {
            let rec = unmapped.get(name)
            if (!rec) {
              rec = { name, actions: 0, buttons: 0, pages: new Map() }
              unmapped.set(name, rec)
            }
            rec.actions++
            if (!seenHere.has(name)) {
              seenHere.add(name)
              rec.buttons++
              rec.pages.set(pageName, (rec.pages.get(pageName) || 0) + 1)
            }
          },
        }

        for (const [stepKey, step] of Object.entries(btn.steps ?? {})) {
          for (const setKey of Object.keys(step?.action_sets ?? {})) {
            // step-0 `down` gains drive feedback insertion
            const isStepZeroDown = stepKey === '0' && setKey === 'down'
            const before = { cues: new Set(setGained.cues), bug: setGained.bug }
            step.action_sets[setKey] = convertActionArray(step.action_sets[setKey], ctx)
            if (!isStepZeroDown) {
              // revert gains recorded outside step-0/down
              setGained.cues = before.cues
              setGained.bug = before.bug
            }
          }
        }

        if (button.singularTotal === 0) continue
        pageSingularButtons++
        if (button.mapped > 0) pageMappedButtons++
        stats.buttonsTouched++

        for (const [name, aliasOf] of buttonAliases) {
          let rec = aliasUse.get(name)
          if (!rec) {
            rec = { name, aliasOf, buttons: 0 }
            aliasUse.set(name, rec)
          }
          rec.buttons++
        }
        if (buttonAliases.size) stats.aliasedButtons++

        // Harvest the house pattern from a real converted prayer button.
        if (button.mapped > 0 && setGained.cues.size) {
          if (house.bgcolor === null && typeof btn.style?.bgcolor === 'number' && btn.style.bgcolor !== 0x333333) {
            house.bgcolor = btn.style.bgcolor
          }
          if (house.bankCurrentStep === null && Array.isArray(btn.feedbacks)) {
            const sample = btn.feedbacks.find((f) => f?.definitionId === 'bank_current_step')
            if (sample) {
              const clone = structuredClone(sample)
              delete clone.id
              house.bankCurrentStep = clone
            }
          }
        }

        // Feedback improvement
        const newFeedbacks = []
        for (const cue of setGained.cues) {
          newFeedbacks.push(feedback('requested', newConnectionId, { cue }, { ...FB_REQUESTED_STYLE }))
          newFeedbacks.push(feedback('rendered', newConnectionId, { cue }, { ...FB_RENDERED_STYLE }))
        }
        if (setGained.bug) {
          newFeedbacks.push(feedback('bug_visible', newConnectionId, {}, { ...FB_BUG_STYLE }))
        }
        if (newFeedbacks.length) {
          if (!Array.isArray(btn.feedbacks)) btn.feedbacks = []
          btn.feedbacks.unshift(...newFeedbacks)
          stats.feedbacksAdded += newFeedbacks.length
        }

        // Dead-button marking: only when EVERY Singular action was unmapped.
        if (button.mapped === 0 && button.unmapped > 0) {
          btn.style = btn.style ?? {}
          const text = String(btn.style.text ?? '')
          if (!text.endsWith(' ⚠')) btn.style.text = text + ' ⚠'
          btn.style.bgcolor = 0x333333
          stats.buttonsMarkedDead++
        }
      }
    }

    if (pageSingularButtons > 0) {
      pageCoverage.push({
        page: pageName,
        mapped: pageMappedButtons,
        total: pageSingularButtons,
      })
    }
  }

  const unmappedList = [...unmapped.values()]
    .map((r) => ({
      name: r.name,
      buttons: r.buttons,
      actions: r.actions,
      pages: [...r.pages.entries()].sort((a, b) => b[1] - a[1]).map(([p, c]) => ({ page: p, buttons: c })),
    }))
    .sort((a, b) => b.buttons - a.buttons || a.name.localeCompare(b.name))

  const aliases = [...aliasUse.values()].sort((a, b) => b.buttons - a.buttons || a.name.localeCompare(b.name))

  // New buttons for catalog entries that have no Singular composition at all.
  const newEntries = []
  const seenCue = new Set()
  for (const rec of catalogIndex.values()) {
    if (!rec.newButton || seenCue.has(rec.cueId)) continue
    seenCue.add(rec.cueId)
    newEntries.push(rec)
  }
  const newButtons = placeNewButtons(config, {
    entries: newEntries,
    connectionId: newConnectionId,
    requestedPage: newPage,
    house,
  })
  stats.newButtonsPlaced = newButtons.placed

  return { config, stats, unmapped: unmappedList, pageCoverage, aliases, newButtons, newConnectionId, label }
}

/* -------------------------------------------------------------- report --- */

export function buildReport(result) {
  const { stats, unmapped, pageCoverage, label, aliases = [], newButtons } = result
  const c = stats.converted
  const L = []
  L.push('# Companion Singular.live → CRC Overlays conversion report', '')
  L.push(`New connection: **${label}** (module \`${NEW_MODULE}\`). The three Singular connections were left in place and enabled.`, '')
  L.push('## Totals', '')
  L.push(`- Pages scanned: ${stats.pagesScanned}`)
  L.push(`- Buttons scanned: ${stats.buttonsScanned}`)
  L.push(`- Buttons touched (had ≥1 Singular action): ${stats.buttonsTouched}`)
  L.push(`- Buttons marked dead (⚠, all Singular actions unmapped): ${stats.buttonsMarkedDead}`)
  L.push(`- Feedbacks added: ${stats.feedbacksAdded}`)
  L.push(`- Actions converted — show_cue: ${c.show_cue}, animate_out: ${c.animate_out}, bug_on: ${c.bug_on}, bug_off: ${c.bug_off}, animate_clear: ${c.animate_clear}`)
  L.push(`- Actions converted (total): ${c.show_cue + c.animate_out + c.bug_on + c.bug_off + c.animate_clear}`)
  L.push(`- Unmapped Singular actions removed: ${stats.unmappedActions} (${unmapped.length} distinct composition names)`)
  L.push(`- Buttons aliased to another graphic: ${stats.aliasedButtons} (${aliases.length} distinct composition names)`)
  const nbPage = newButtons?.page
  L.push(`- New buttons placed: ${stats.newButtonsPlaced}${nbPage ? ` on page ${nbPage} ("${newButtons.pageName}")` : ''}`)
  L.push('')

  L.push('## New buttons', '')
  if (!newButtons || !newButtons.placed) {
    L.push('_None placed._', '')
  } else {
    if (newButtons.moved) {
      L.push(`Page ${newButtons.requestedPage} already had content, so the new buttons went to page **${newButtons.page}** instead, renamed "${newButtons.pageName}".`, '')
    } else {
      L.push(`Placed on page **${newButtons.page}**, renamed "${newButtons.pageName}".`, '')
    }
    L.push('| Graphic | Page | Row | Column |')
    L.push('| --- | ---: | ---: | ---: |')
    for (const i of newButtons.items) {
      L.push(`| ${i.name.replace(/\|/g, '\\|')} | ${newButtons.page} | ${i.row} | ${i.column} |`)
    }
    if (newButtons.skipped.length) {
      L.push('', `Did not fit on the page: ${newButtons.skipped.join(', ')}.`)
    }
    L.push('')
  }

  L.push('## Aliased to another graphic', '')
  if (!aliases.length) L.push('_None._', '')
  else {
    L.push('These buttons keep their old name but now show the surviving graphic.', '')
    L.push('| Button name | Now shows | Buttons |')
    L.push('| --- | --- | ---: |')
    for (const a of aliases) {
      L.push(`| ${a.name.replace(/\|/g, '\\|')} | ${a.aliasOf.replace(/\|/g, '\\|')} | ${a.buttons} |`)
    }
    L.push('')
  }

  L.push('## Unmapped compositions', '')
  if (!unmapped.length) L.push('_None._', '')
  else {
    L.push('| Composition | Buttons | Actions | Pages |')
    L.push('| --- | ---: | ---: | --- |')
    for (const u of unmapped) {
      const pages = u.pages.map((p) => `${p.page} (${p.buttons})`).join(', ')
      L.push(`| ${u.name.replace(/\|/g, '\\|')} | ${u.buttons} | ${u.actions} | ${pages.replace(/\|/g, '\\|')} |`)
    }
    L.push('')
  }

  L.push('## Per-page coverage (Singular buttons)', '')
  L.push('| Page | Mapped | Total | Coverage |')
  L.push('| --- | ---: | ---: | ---: |')
  for (const p of pageCoverage) {
    const pct = p.total ? Math.round((p.mapped / p.total) * 100) : 0
    L.push(`| ${p.page.replace(/\|/g, '\\|')} | ${p.mapped} | ${p.total} | ${pct}% |`)
  }
  L.push('')

  L.push('## Publish next', '')
  L.push('Unmapped composition names, most-used first:', '')
  unmapped.forEach((u, i) => L.push(`${i + 1}. ${u.name} — ${u.buttons} button${u.buttons === 1 ? '' : 's'}`))
  L.push('')
  return L.join('\n')
}

export function buildReportJson(result) {
  return {
    totals: {
      pagesScanned: result.stats.pagesScanned,
      buttonsScanned: result.stats.buttonsScanned,
      buttonsTouched: result.stats.buttonsTouched,
      buttonsMarkedDead: result.stats.buttonsMarkedDead,
      feedbacksAdded: result.stats.feedbacksAdded,
      actionsConverted: result.stats.converted,
      unmappedActions: result.stats.unmappedActions,
      unmappedDistinctNames: result.unmapped.length,
      aliasedButtons: result.stats.aliasedButtons,
      aliasedDistinctNames: (result.aliases ?? []).length,
      newButtonsPlaced: result.stats.newButtonsPlaced,
      newButtonsPage: result.newButtons?.page ?? null,
    },
    aliases: result.aliases ?? [],
    newButtons: result.newButtons ?? null,
    unmapped: result.unmapped,
    pageCoverage: result.pageCoverage,
    publishNext: result.unmapped.map((u) => ({ name: u.name, buttons: u.buttons })),
  }
}

/* ----------------------------------------------------------------- cli --- */

export function parseArgs(argv) {
  const out = { label: 'Overlays', baseUrl: 'https://overlays.centralreform.org', bugNames: ['CRC Logo'], newPage: NEW_PAGE_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--in') out.in = next()
    else if (a === '--catalog') out.catalog = next()
    else if (a === '--out') out.out = next()
    else if (a === '--report') out.report = next()
    else if (a === '--label') out.label = next()
    else if (a === '--base-url') out.baseUrl = next()
    else if (a === '--bug-names') out.bugNames = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--new-page') {
      const v = Number(next())
      if (!Number.isInteger(v) || v < 1) throw new Error('--new-page must be a positive integer')
      out.newPage = v
    }
    else throw new Error(`Unknown argument: ${a}`)
  }
  for (const req of ['in', 'catalog', 'out', 'report']) {
    if (!out[req]) throw new Error(`Missing required --${req}`)
  }
  return out
}

function main(argv) {
  const args = parseArgs(argv)
  const { data, gzipped } = readConfig(args.in)
  const catalog = JSON.parse(fs.readFileSync(args.catalog, 'utf8'))
  const result = convert(data, {
    catalogIndex: buildCatalogIndex(catalog),
    label: args.label,
    baseUrl: args.baseUrl,
    bugNames: args.bugNames,
    newPage: args.newPage,
  })
  writeConfig(args.out, result.config, gzipped)

  const md = buildReport(result)
  fs.mkdirSync(path.dirname(args.report), { recursive: true })
  fs.writeFileSync(args.report, md)
  const jsonPath = args.report.replace(/\.md$/i, '') + '.json'
  fs.writeFileSync(jsonPath, JSON.stringify(buildReportJson(result), null, 2))

  const c = result.stats.converted
  console.log(`Wrote ${args.out} (${gzipped ? 'gzip' : 'plain'})`)
  console.log(`Pages ${result.stats.pagesScanned}, buttons ${result.stats.buttonsScanned}, touched ${result.stats.buttonsTouched}`)
  console.log(`Converted show_cue=${c.show_cue} animate_out=${c.animate_out} bug_on=${c.bug_on} bug_off=${c.bug_off} animate_clear=${c.animate_clear}; unmapped removed=${result.stats.unmappedActions}`)
  console.log(`Aliased buttons=${result.stats.aliasedButtons}; new buttons placed=${result.stats.newButtonsPlaced}${result.newButtons?.page ? ` on page ${result.newButtons.page}` : ''}`)
  console.log(`Report: ${args.report} and ${jsonPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
}
