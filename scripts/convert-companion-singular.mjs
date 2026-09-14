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
    if (cueId) index.set(normName(name), { cueId, name })
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
    baseUrl = 'https://crc-overlays.vercel.app',
    bugNames = ['CRC Logo'],
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
  }
  // name -> { buttons:Set<string>, actions:number, pages:Map<pageName,count> }
  const unmapped = new Map()
  const pageCoverage = []

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
        const ctx = {
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

  return { config, stats, unmapped: unmappedList, pageCoverage, newConnectionId, label }
}

/* -------------------------------------------------------------- report --- */

export function buildReport(result) {
  const { stats, unmapped, pageCoverage, label } = result
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
  L.push('')

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
    },
    unmapped: result.unmapped,
    pageCoverage: result.pageCoverage,
    publishNext: result.unmapped.map((u) => ({ name: u.name, buttons: u.buttons })),
  }
}

/* ----------------------------------------------------------------- cli --- */

export function parseArgs(argv) {
  const out = { label: 'Overlays', baseUrl: 'https://crc-overlays.vercel.app', bugNames: ['CRC Logo'] }
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
  console.log(`Report: ${args.report} and ${jsonPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
}
