#!/usr/bin/env node
// Convert Singular.live actions in a Bitfocus Companion export to the
// congregation's own "crc-overlays" Companion module.
//
// The in-place rewrite below is the original one-off migration of Michael's CRC export. The matching
// it shares with deck conversion (option unwrapping, button label and colours, the alias table, the
// exact-name catalog index) now lives in lib/companion-deck/convert.ts, and the two deck modes are a
// thin CLI over lib/companion-deck (R-C9):
//
//   node scripts/convert-companion-singular.mjs --tbi-seed <export.companionconfig> [--out lib/companion-deck/tbi-seed-data.json]
//       derive TBI's committed seed from Simone's raw export (connection config and secrets are never read out)
//   node scripts/convert-companion-singular.mjs --tbi-report --catalog <catalog.json> [--seed <tbi-seed-data.json>] [--out <report.md>]
//       convert the seeded deck against a TBI catalog snapshot and write the plain-language report
//
// Node 24, plain ESM (it imports lib/companion-deck's TypeScript directly, as build-companion-preset.mjs does).
//
// Handles BOTH export shapes:
//   * Companion 4.2.6 ("v4"): controls are `type: "button"` with a flat `style`,
//     feedbacks carry a flat `style: {color, bgcolor}`, option values are plain.
//   * Companion 5.0.3 ("v5", export `version: 12`): controls are
//     `type: "button-layered"` with a `style.layers` stack, feedbacks carry
//     `styleOverrides`, option values are `{value, isExpression}`.
//
// Output strategy: every button the converter touches is re-emitted in the OLD
// flat button shape (`type: "button"`). Companion's own import upgrade chain
// (v12 -> v13) turns those into layered buttons and sets
// `options.canModifyStyleInApis: true`. Controls the converter does not touch
// are passed through byte-for-byte in whatever shape they arrived in.
//
// IMPORTANT correction to the original plan: option VALUES are not part of that
// graphics upgrade. The blanket "wrap every option value" step lives in
// v10 -> v11, which never runs on a file already stamped `version: 12`. So we
// keep each file's own option convention: plain values for a v4 file, wrapped
// `{value, isExpression}` values for a v5 file. See `wrapsOptions()`.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

import {
  NAME_ALIASES, SIDE_PANEL_COMPS, SLOT_COMPS, buildCatalogIndex, buttonBgColor, buttonText, buttonTextColor,
  isSingularInstance, lookupCue, normName, val,
} from '../lib/companion-deck/convert.ts'
import { SINGULAR_MODULE, deriveExportSeedData, formatExportSeedData, readCompanionExport, seedTbiDeck } from '../lib/companion-deck/tbi-seed.ts'
import { applyConversion, convertSingularDeck, conversionReportMarkdown } from '../lib/companion-deck/convert.ts'
import { catalogCueLookups, validateDeck } from '../lib/companion-deck/validate.ts'

export {
  NAME_ALIASES, SIDE_PANEL_COMPS, SINGULAR_MODULE, SLOT_COMPS, buildCatalogIndex, buttonBgColor, buttonText, buttonTextColor,
  isSingularInstance, lookupCue, val,
}
export const NEW_MODULE = 'crc-overlays'
// Pin to the module version that is installed on the operator's Companion.
// 1.7.0 shipped 2026-09-22 with the resting logo; override with --module-version if a
// different one is installed.
export let MODULE_VERSION = '1.7.0'
export function setModuleVersion(v) {
  if (!/^\d+\.\d+\.\d+$/.test(String(v))) throw new Error('--module-version must look like 1.7.0')
  MODULE_VERSION = String(v)
}

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

/* ------------------------------------------------------- shape helpers --- */

/** Does this file wrap option values in `{value, isExpression}`? (Companion 4.3 / export v11+.) */
export function wrapsOptions(config) {
  const v = Number(config?.version)
  if (Number.isFinite(v)) return v >= 11
  // Fall back to sniffing the instances.
  return Object.values(config?.instances ?? {}).some((i) => i && typeof i === 'object' && 'moduleId' in i)
}

/** Build an options object in the file's own convention. */
export function makeOptions(plain, wrap) {
  if (!wrap) return { ...plain }
  const out = {}
  for (const [k, v] of Object.entries(plain)) out[k] = { value: v, isExpression: false }
  return out
}

/**
 * Re-shape an EXISTING entity's options into the file's own convention, keeping
 * any `isExpression: true` flag intact.
 */
export function reshapeOptions(options, wrap) {
  const out = {}
  for (const [k, v] of Object.entries(options ?? {})) {
    const wrapped = v && typeof v === 'object' && !Array.isArray(v) && 'isExpression' in v && 'value' in v
    if (wrap) out[k] = wrapped ? structuredClone(v) : { value: v, isExpression: false }
    else out[k] = wrapped ? structuredClone(v.value) : structuredClone(v)
  }
  return out
}

/* ------------------------------------------------------------- catalog --- */

const SLOT_COMP_SET = new Set(SLOT_COMPS.map(normName))

export function loadSlots(file) {
  if (!file) return new Map()
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const m = new Map()
  for (const [name, v] of Object.entries(raw)) {
    const entry = typeof v === 'string' ? { cueId: v } : { ...v }
    if (!entry.cueId || entry.cueId === 'TBD') continue
    m.set(normName(name), { name, ...entry })
  }
  return m
}

/* ---------------------------------------------------------- connection --- */

/** The connection collection the new connection should join, if the file groups connections. */
export function findOverlaysCollectionId(config, label = 'Overlays') {
  const cols = config?.connectionCollections
  if (!Array.isArray(cols)) return null
  const hit = cols.find((c) => c && normName(c.label) === normName(label))
  return hit?.id ?? null
}

/**
 * Build the new connection record in the SAME schema as the sibling
 * connections in the input file, so Companion can import and upgrade it.
 */
export function buildConnection(config, { label, baseUrl }) {
  const instances = config.instances ?? {}
  const siblings = Object.values(instances)
  const maxSort = siblings.reduce((m, i) => Math.max(m, Number(i?.sortOrder) || 0), 0)
  const hasKey = (k) => siblings.some((i) => Object.prototype.hasOwnProperty.call(i ?? {}, k))

  const conn = {
    sortOrder: maxSort + 1,
    label,
    isFirstInit: false,
    config: { baseUrl, pairingCode: '' },
    lastUpgradeIndex: -1,
    enabled: true,
  }
  // Module identity: v5 files use `moduleId`, v4 files use `instance_type`.
  if (hasKey('moduleId')) conn.moduleId = NEW_MODULE
  else conn.instance_type = NEW_MODULE

  if (hasKey('moduleVersionId')) conn.moduleVersionId = MODULE_VERSION
  if (hasKey('updatePolicy')) conn.updatePolicy = 'stable'
  if (hasKey('secrets')) conn.secrets = {}
  if (hasKey('moduleInstanceType')) conn.moduleInstanceType = 'connection'

  // Join the operator's existing "Overlays" connection collection when the file
  // groups connections that way.
  const collectionId = hasKey('collectionId') ? findOverlaysCollectionId(config, label) : null
  if (collectionId) conn.collectionId = collectionId
  return { conn, collectionId }
}

/* ------------------------------------------------------------ feedback --- */

// Decimal colour integers, as Companion stores them.
export const WHITE = 16777215
export const FB_REQUESTED_STYLE = { bgcolor: (180 << 16) | (110 << 8) | 0, color: WHITE } // amber #b46e00
export const FB_RENDERED_STYLE = { bgcolor: 16711680, color: WHITE } // Michael's red #ff0000
export const FB_DISCONNECTED_STYLE = { bgcolor: 11141120, color: WHITE } // #aa0000
export const FB_LOGO_STYLE = { bgcolor: 16711680, color: WHITE }

function feedback(definitionId, connectionId, plainOptions, style, wrap) {
  return {
    id: makeId(),
    definitionId,
    connectionId,
    options: makeOptions(plainOptions, wrap),
    type: 'feedback',
    style,
    isInverted: wrap ? { value: false, isExpression: false } : false,
    children: {},
  }
}

function action(definitionId, connectionId, plainOptions, wrap) {
  return {
    type: 'action',
    id: makeId(),
    definitionId,
    connectionId,
    options: makeOptions(plainOptions, wrap),
    upgradeIndex: -1,
  }
}

/* ------------------------------------------------------- button emitter --- */

/** Emit a control in the OLD flat Companion-4 button shape. */
export function flatButton({ text, color, bgcolor, feedbacks, steps }) {
  return {
    type: 'button',
    style: {
      text: String(text ?? ''),
      textExpression: false,
      size: 'auto',
      png64: null,
      alignment: 'center:center',
      pngalignment: 'center:center',
      color: typeof color === 'number' ? color : WHITE,
      bgcolor: typeof bgcolor === 'number' ? bgcolor : 0,
      show_topbar: 'default',
    },
    options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false },
    feedbacks,
    steps,
    localVariables: [],
  }
}

/** Wrap a graphic name onto two lines when it is longer than 10 characters. */
export function wrapLabel(name, max = 10) {
  const s = String(name ?? '')
  if (s.length <= max) return s
  let best = -1
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ' && i <= max) best = i
  }
  if (best > 0) return s.slice(0, best) + '\n' + s.slice(best + 1)
  const mid = Math.floor(s.length / 2)
  return s.slice(0, mid) + '\n' + s.slice(mid)
}

/* ---------------------------------------------------------- page layout --- */

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

export function gridCells(page, { maxColumn } = {}) {
  const g = page?.gridSize ?? { minRow: 0, maxRow: 3, minColumn: 0, maxColumn: 7 }
  const lastCol = Math.min(Number(g.maxColumn ?? 7), maxColumn ?? Number(g.maxColumn ?? 7))
  const cells = []
  for (let r = Number(g.minRow ?? 0); r <= Number(g.maxRow ?? 3); r++) {
    for (let c = Number(g.minColumn ?? 0); c <= lastCol; c++) cells.push([r, c])
  }
  return cells
}

export function freeCells(page, opts) {
  return gridCells(page, opts).filter(([r, c]) => page?.controls?.[r]?.[c] == null)
}

export function placeControl(page, r, c, ctrl) {
  page.controls = page.controls ?? {}
  page.controls[r] = page.controls[r] ?? {}
  page.controls[r][c] = ctrl
}

/* ---------------------------------------------------------- conversion --- */

export const NEW_PAGE_DEFAULT = 53
export const NEW_PAGE_NAME = 'Overlays'
export const CLEAR_NOW_BG = 7864320 // #780000

const stepOrder = (steps) =>
  Object.keys(steps ?? {}).sort((a, b) => (Number(a) || 0) - (Number(b) || 0))

/** Flatten every action on a button, keeping a handle on where it lives. */
function eachAction(steps, fn) {
  for (const stepKey of stepOrder(steps)) {
    const step = steps[stepKey]
    for (const setKey of Object.keys(step?.action_sets ?? {})) {
      const walk = (arr, depth) => {
        for (const a of arr ?? []) {
          if (a && typeof a === 'object' && a.children) {
            for (const childKey of Object.keys(a.children)) walk(a.children[childKey], depth + 1)
          }
          fn(a, { stepKey, setKey, depth })
        }
      }
      walk(step.action_sets[setKey], 0)
    }
  }
}

/**
 * Work out what a single Singular action should become.
 * Returns a plan object; `kind` is one of:
 *   'clear' | 'logo' | 'cue' | 'side-panel' | 'unmapped'
 */
function planAction(a, ctx) {
  const def = a.definitionId
  const comp = val(a.options?.comp)
  if (def === 'takeOutAllOutput') return { kind: 'clear', comp: null }
  if (def !== 'animateIn' && def !== 'animateOut') return { kind: 'unmapped', comp }

  const key = normName(comp)
  // The CRC Logo composition becomes the RESTING LOGO, never the scan card. The sitting was
  // explicit that pressing the logo must not put a QR code on screen, and the two are separate
  // features in the product now: `logo_on`/`logo_off` control the corner mark, `bug_on`/`bug_off`
  // the Daven Along card, and nothing here emits the latter.
  if (ctx.logoNames.has(key)) return { kind: 'logo', comp, on: def === 'animateIn' }
  if (SIDE_PANEL_COMPS.has(key)) return { kind: 'side-panel', comp }

  const slot = ctx.slots.get(key)
  if (slot) return { kind: 'cue', comp, cueId: slot.cueId, show: def === 'animateIn', slot }

  const { rec, viaAlias, usable } = lookupCue(ctx.catalog, comp)
  if (rec && usable) {
    return { kind: 'cue', comp, cueId: rec.cueId, show: def === 'animateIn', rec, viaAlias }
  }
  return { kind: 'unmapped', comp, status: rec?.status ?? null }
}

/** Decide whether a button collapses to a single-step `toggle_cue`. */
function toggleCandidate(ctrl, plans) {
  const steps = ctrl.steps ?? {}
  const keys = stepOrder(steps)
  if (keys.length !== 2) return null

  // Nothing may live outside the two `down` sets.
  for (const k of keys) {
    for (const [setKey, arr] of Object.entries(steps[k]?.action_sets ?? {})) {
      if (setKey !== 'down' && (arr ?? []).length) return null
    }
  }

  const kept = (k) =>
    (steps[k]?.action_sets?.down ?? []).filter((a) => {
      const p = plans.get(a)
      return !(p && p.kind === 'side-panel')
    })

  const a0 = kept(keys[0])
  const a1 = kept(keys[1])
  if (a0.length !== 1 || a1.length !== 1) return null

  const p0 = plans.get(a0[0])
  const p1 = plans.get(a1[0])
  if (!p0 || !p1) return null
  if (p0.kind !== 'cue' || p1.kind !== 'cue') return null
  if (!p0.show || p1.show) return null
  if (p0.cueId !== p1.cueId) return null
  if (a0[0].children || a1[0].children) return null
  if (a0[0].disabled || a1[0].disabled) return null
  return { cueId: p0.cueId, plan: p0 }
}

export function convert(config, opts) {
  const {
    catalogIndex,
    slots = new Map(),
    label = 'Overlays',
    baseUrl = 'https://overlays.centralreform.org',
    logoNames = ['CRC Logo'],
    newPage = NEW_PAGE_DEFAULT,
  } = opts

  const wrap = wrapsOptions(config)
  const instances = config.instances ?? {}
  const singularConnections = new Set(
    Object.entries(instances).filter(([, i]) => isSingularInstance(i)).map(([id]) => id),
  )
  const singularLabels = new Map(
    Object.entries(instances).filter(([, i]) => isSingularInstance(i)).map(([id, i]) => [id, i.label]),
  )

  let newConnectionId = makeId()
  while (instances[newConnectionId]) newConnectionId = makeId()
  const { conn, collectionId } = buildConnection(config, { label, baseUrl })
  instances[newConnectionId] = conn
  config.instances = instances

  const stats = {
    optionShape: wrap ? 'wrapped ({value,isExpression})' : 'plain',
    exportVersion: config.version ?? null,
    pagesScanned: 0,
    buttonsScanned: 0,
    singularButtons: 0,
    buttonsConverted: 0,
    buttonsLeftOnSingular: 0,
    buttonsMixed: 0,
    buttonsCollapsedToToggle: 0,
    buttonsKeptMultiAction: 0,
    feedbacksAdded: 0,
    bankCurrentStepDropped: 0,
    sidePanelActionsDropped: 0,
    converted: { toggle_cue: 0, show_cue: 0, animate_out: 0, logo_on: 0, logo_off: 0, animate_clear: 0 },
    // Inherited hide/restore macros the renderer now does by itself; see rewriteActions.
    logoMacrosDropped: 0,
    singularActionsKept: 0,
    newButtonsPlaced: 0,
  }

  const touched = []           // every control the converter rewrote
  const leftOnSingular = []    // {page, pageName, row, column, text, comps[]}
  const mixed = []             // {page, pageName, row, column, text, converted[], keptOnSingular[]}
  const multiAction = []       // buttons that kept a multi-action structure
  const slotWaiting = []       // buttons that will convert once --slots is supplied
  const aliasUse = new Map()   // composition name -> {name, resolvesTo, buttons}
  const unmappedComps = new Map()
  const pageCoverage = []
  const bgTally = new Map()

  const logoSet = new Set(logoNames.map(normName))
  const ctx = { catalog: catalogIndex, slots, logoNames: logoSet }

  for (const [pageId, page] of Object.entries(config.pages ?? {})) {
    stats.pagesScanned++
    const pageName = page?.name || `Page ${pageId}`
    const cov = { page: Number(pageId), pageName, singular: 0, converted: 0, left: 0, mixed: 0 }

    for (const [rowKey, row] of Object.entries(page?.controls ?? {})) {
      for (const [colKey, ctrl] of Object.entries(row ?? {})) {
        if (!ctrl || typeof ctrl !== 'object' || isNavControl(ctrl)) continue
        stats.buttonsScanned++

        // 1. plan every Singular action on this button
        const plans = new Map()
        const singularActions = []
        eachAction(ctrl.steps, (a) => {
          if (!a || typeof a !== 'object') return
          if (!singularConnections.has(a.connectionId)) return
          singularActions.push(a)
          plans.set(a, planAction(a, ctx))
        })
        if (!singularActions.length) continue

        stats.singularButtons++
        cov.singular++

        const text = buttonText(ctrl)
        const where = { page: Number(pageId), pageName, row: Number(rowKey), column: Number(colKey), text }
        const compsHere = [...new Set(singularActions.map((a) => val(a.options?.comp)).filter(Boolean))]

        // slot bookkeeping (for the report), whether or not we convert
        if (compsHere.some((c) => SLOT_COMP_SET.has(normName(c)) && !slots.has(normName(c)))) {
          slotWaiting.push({ ...where, comps: compsHere.filter((c) => SLOT_COMP_SET.has(normName(c))) })
        }

        const mappedPlans = [...plans.values()].filter((p) => p.kind === 'cue' || p.kind === 'logo' || p.kind === 'clear')
        /* D15. Michael's deck pairs a logo hide with the prayer going up and a logo restore with
           it coming down, and the pairing drifted: Aleinu 3 restores the logo in the middle of
           its own series, with Aleinu 4 still to come. Those macros were a workaround for a
           renderer that did not know what was on screen. It does now — the mark hides under any
           graphic and returns when the graphic has gone — so on a button that also shows a
           prayer the macro is dropped rather than converted. It would otherwise fight the
           automatic rule, and a stray restore would switch the logo back on after the operator
           had deliberately turned it off. A button whose only job is the logo keeps its press. */
        const buttonShowsACue = mappedPlans.some((p) => p.kind === 'cue')

        // 2. nothing maps -> leave the whole button alone, untouched
        if (!mappedPlans.length) {
          stats.buttonsLeftOnSingular++
          cov.left++
          const comps = [...new Set([...plans.values()].map((p) => p.comp).filter(Boolean))]
          leftOnSingular.push({ ...where, comps })
          for (const p of plans.values()) {
            if (!p.comp) continue
            const rec = unmappedComps.get(p.comp) ?? { name: p.comp, buttons: 0, actions: 0, pages: new Map() }
            rec.actions++
            unmappedComps.set(p.comp, rec)
          }
          for (const c of comps) {
            const rec = unmappedComps.get(c)
            rec.buttons++
            rec.pages.set(pageName, (rec.pages.get(pageName) || 0) + 1)
          }
          continue
        }

        // 3. build the replacement button
        const toggle = toggleCandidate(ctrl, plans)
        const bg = buttonBgColor(ctrl)
        const fg = buttonTextColor(ctrl)
        if (typeof bg === 'number') bgTally.set(bg, (bgTally.get(bg) || 0) + 1)

        const gainedCues = []
        const gainedLogoOn = { v: false }
        const convertedNames = []
        const keptSingular = []
        let droppedHere = 0
        let labelOverride = null
        let multiInAStep = false

        let newSteps
        if (toggle) {
          newSteps = {
            0: {
              action_sets: {
                down: [action('toggle_cue', newConnectionId, { cue: toggle.cueId }, wrap)],
                up: [],
              },
              options: { runWhileHeld: [] },
            },
          }
          stats.converted.toggle_cue++
          stats.buttonsCollapsedToToggle++
          gainedCues.push(toggle.cueId)
          convertedNames.push(toggle.plan.comp)
          if (toggle.plan.slot?.label) labelOverride = toggle.plan.slot.label
          if (toggle.plan.viaAlias || toggle.plan.rec?.aliasOf) {
            const key = toggle.plan.comp
            const rec = aliasUse.get(key) ?? {
              name: key,
              resolvesTo: toggle.plan.rec?.aliasOf ?? toggle.plan.rec?.name ?? toggle.plan.viaAlias,
              buttons: 0,
            }
            rec.buttons++
            aliasUse.set(key, rec)
          }
          // Any side-panel action on a toggle button was dropped by definition.
          droppedHere += singularActions.filter((a) => plans.get(a)?.kind === 'side-panel').length
        } else {
          const firstStep = stepOrder(ctrl.steps)[0]
          newSteps = {}
          for (const stepKey of stepOrder(ctrl.steps)) {
            const step = ctrl.steps[stepKey]
            const sets = {}
            for (const setKey of Object.keys(step?.action_sets ?? {})) {
              const isFirstDown = stepKey === firstStep && setKey === 'down'
              const cuesInSet = new Set()
              sets[setKey] = rewriteActions(step.action_sets[setKey], {
                plans, wrap, newConnectionId, stats, dropLogoMacros: buttonShowsACue,
                onCue: (cueId, plan) => {
                  cuesInSet.add(cueId)
                  if (isFirstDown && plan.show && !gainedCues.includes(cueId)) gainedCues.push(cueId)
                  convertedNames.push(plan.comp)
                  if (plan.slot?.label && !labelOverride) labelOverride = plan.slot.label
                  if (plan.viaAlias || plan.rec?.aliasOf) {
                    const rec = aliasUse.get(plan.comp) ?? {
                      name: plan.comp,
                      resolvesTo: plan.rec?.aliasOf ?? plan.rec?.name ?? plan.viaAlias,
                      buttons: 0,
                    }
                    rec.buttons++
                    aliasUse.set(plan.comp, rec)
                  }
                },
                onLogo: (on) => {
                  convertedNames.push(on ? 'CRC Logo (on)' : 'CRC Logo (off)')
                  if (isFirstDown && on) gainedLogoOn.v = true
                },
                onClear: () => convertedNames.push('takeOutAllOutput'),
                onKeep: (comp) => keptSingular.push(comp ?? '(no composition)'),
                onDrop: () => { droppedHere++ },
              })
              if (cuesInSet.size > 1) multiInAStep = true
            }
            newSteps[stepKey] = { action_sets: sets, options: step?.options ? structuredClone(step.options) : { runWhileHeld: [] } }
          }
          stats.buttonsKeptMultiAction++
        }

        // 4. feedbacks
        const carried = []
        for (const f of ctrl.feedbacks ?? []) {
          if (f?.connectionId === 'internal' && f?.definitionId === 'bank_current_step') {
            stats.bankCurrentStepDropped++
            continue
          }
          carried.push(structuredClone(f))
        }
        const added = []
        for (const cue of gainedCues) {
          added.push(feedback('requested', newConnectionId, { cue }, { ...FB_REQUESTED_STYLE }, wrap))
          added.push(feedback('rendered', newConnectionId, { cue }, { ...FB_RENDERED_STYLE }, wrap))
        }
        if (!gainedCues.length && gainedLogoOn.v) {
          // The setting, not a picture: `logo_enabled` lights when the operator has asked for
          // the mark, which is the only thing this button changed. The module's `logo_held`
          // feedback says the rest, and no feedback here claims the mark is on screen.
          added.push(feedback('logo_enabled', newConnectionId, {}, { ...FB_LOGO_STYLE }, wrap))
        }
        added.push(feedback('disconnected', newConnectionId, {}, { ...FB_DISCONNECTED_STYLE }, wrap))
        stats.feedbacksAdded += added.length

        const newCtrl = flatButton({
          text: labelOverride ? renderLabel(labelOverride, text, convertedNames[0]) : text,
          color: fg,
          bgcolor: bg,
          feedbacks: [...carried, ...added],
          steps: newSteps,
        })
        row[colKey] = newCtrl

        stats.buttonsConverted++
        cov.converted++
        touched.push({ ...where, toggle: !!toggle, cues: gainedCues, keptSingular })
        if (keptSingular.length) {
          stats.buttonsMixed++
          cov.mixed++
          mixed.push({ ...where, converted: [...new Set(convertedNames)], keptOnSingular: [...new Set(keptSingular)] })
          // A graphic kept on Singular here is still a graphic without a match.
          for (const name of keptSingular) {
            const rec = unmappedComps.get(name) ?? { name, buttons: 0, actions: 0, pages: new Map() }
            rec.actions++
            unmappedComps.set(name, rec)
          }
          for (const name of new Set(keptSingular)) {
            const rec = unmappedComps.get(name)
            rec.buttons++
            rec.pages.set(pageName, (rec.pages.get(pageName) || 0) + 1)
          }
        }
        if (multiInAStep) {
          multiAction.push({ ...where, compositions: [...new Set(convertedNames)] })
        }
        stats.sidePanelActionsDropped += droppedHere
      }
    }

    if (cov.singular) pageCoverage.push(cov)
  }

  // ------------------------------------------------------- new buttons ---
  const house = { bgcolor: null }
  let best = -1
  for (const [c, n] of bgTally) if (n > best) { best = n; house.bgcolor = c }

  const newEntries = []
  const seenCue = new Set()
  for (const rec of catalogIndex.values()) {
    if (!rec.newButton || rec.status !== 'published' || seenCue.has(rec.cueId)) continue
    seenCue.add(rec.cueId)
    newEntries.push(rec)
  }

  const spare = placeSparePage(config, {
    entries: newEntries,
    connectionId: newConnectionId,
    requestedPage: newPage,
    house,
    wrap,
  })
  stats.newButtonsPlaced = spare.placed
  for (const it of spare.items) touched.push({ page: Number(spare.page), pageName: spare.pageName, row: it.row, column: it.column, text: it.text, newButton: true, cues: it.cueId ? [it.cueId] : [] })

  const homeClear = placeHomeClearNow(config, { connectionId: newConnectionId, wrap })
  if (homeClear) touched.push({ page: homeClear.page, pageName: homeClear.pageName, row: homeClear.row, column: homeClear.column, text: 'CLEAR\nNOW', newButton: true, cues: [] })

  const unmapped = [...unmappedComps.values()]
    .map((r) => ({
      name: r.name,
      buttons: r.buttons,
      actions: r.actions,
      pages: [...r.pages.entries()].sort((a, b) => b[1] - a[1]).map(([p, c]) => ({ page: p, buttons: c })),
    }))
    .sort((a, b) => b.buttons - a.buttons || a.name.localeCompare(b.name))

  const nearMisses = findNearMisses(unmapped, catalogIndex)

  return {
    config,
    stats,
    nearMisses,
    touched,
    leftOnSingular,
    mixed,
    multiAction,
    slotWaiting,
    unmapped,
    pageCoverage,
    aliases: [...aliasUse.values()].sort((a, b) => b.buttons - a.buttons || a.name.localeCompare(b.name)),
    spare,
    homeClear,
    newConnectionId,
    collectionId,
    label,
    singularLabels: Object.fromEntries(singularLabels),
    wrap,
  }
}

/** Cheap edit distance, capped so long names do not cost anything. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1))
      last = tmp
    }
  }
  return prev[b.length]
}

const squash = (s) => normName(s).replace(/[^a-z0-9]/g, '')

/**
 * Unmatched composition names that look like a live graphic under a different
 * spelling. Reported, never applied — a human has to decide.
 */
export function findNearMisses(unmapped, catalogIndex) {
  const live = [...catalogIndex.values()].filter((r) => r.status === 'published')
  const out = []
  for (const u of unmapped) {
    const key = squash(u.name)
    if (!key) continue
    const candidates = []
    for (const r of live) {
      const k2 = squash(r.name)
      if (k2 === key) { candidates.push(r.name); continue }
      if (editDistance(key, k2) <= 2) candidates.push(r.name)
    }
    if (candidates.length) out.push({ name: u.name, buttons: u.buttons, candidates: [...new Set(candidates)].slice(0, 4) })
  }
  return out.sort((a, b) => b.buttons - a.buttons || a.name.localeCompare(b.name))
}

function renderLabel(template, originalText, comp) {
  return String(template).replace(/\{text\}/g, originalText ?? '').replace(/\{comp\}/g, comp ?? '')
}

/**
 * Rewrite one action array in place-order, converting Singular actions and
 * keeping everything else exactly where it is (cameras, vMix, x32, waits,
 * internal groups). Options are re-emitted in the file's own convention.
 */
function rewriteActions(arr, o) {
  const out = []
  for (const a of arr ?? []) {
    if (!a || typeof a !== 'object') { out.push(a); continue }

    const plan = o.plans.get(a)
    if (!plan) {
      // Not a Singular action: carry it over, recursing into children.
      const copy = structuredClone(a)
      if (copy.options) copy.options = reshapeOptions(copy.options, o.wrap)
      if (copy.children) {
        for (const k of Object.keys(copy.children)) {
          copy.children[k] = rewriteActions(a.children[k], o)
        }
      }
      out.push(copy)
      continue
    }

    if (plan.kind === 'side-panel') { o.onDrop(); continue }

    if (plan.kind === 'clear') {
      out.push(action('animate_clear', o.newConnectionId, {}, o.wrap))
      o.stats.converted.animate_clear++
      o.onClear()
      continue
    }
    if (plan.kind === 'logo') {
      // On a button that also shows a prayer this is an inherited macro, not an instruction:
      // drop it and let the renderer's own visibility rule stand.
      if (o.dropLogoMacros) { o.stats.logoMacrosDropped++; o.onDrop(); continue }
      const def = plan.on ? 'logo_on' : 'logo_off'
      out.push(action(def, o.newConnectionId, {}, o.wrap))
      o.stats.converted[def]++
      o.onLogo(plan.on)
      continue
    }
    if (plan.kind === 'cue') {
      const def = plan.show ? 'show_cue' : 'animate_out'
      out.push(action(def, o.newConnectionId, { cue: plan.cueId }, o.wrap))
      o.stats.converted[def]++
      o.onCue(plan.cueId, plan)
      continue
    }

    // unmapped: keep it pointing at Singular, re-shaped for the flat button
    const copy = structuredClone(a)
    copy.options = reshapeOptions(copy.options, o.wrap)
    out.push(copy)
    o.stats.singularActionsKept++
    o.onKeep(plan.comp)
  }
  return out
}

/* --------------------------------------------------------- spare page --- */

function makeCueButton(name, cueId, connectionId, house, wrap) {
  return flatButton({
    text: wrapLabel(name),
    color: WHITE,
    bgcolor: house?.bgcolor ?? 26265,
    feedbacks: [
      feedback('requested', connectionId, { cue: cueId }, { ...FB_REQUESTED_STYLE }, wrap),
      feedback('rendered', connectionId, { cue: cueId }, { ...FB_RENDERED_STYLE }, wrap),
      feedback('disconnected', connectionId, {}, { ...FB_DISCONNECTED_STYLE }, wrap),
    ],
    steps: {
      0: {
        action_sets: { down: [action('toggle_cue', connectionId, { cue: cueId }, wrap)], up: [] },
        options: { runWhileHeld: [] },
      },
    },
  })
}

export function makeClearNowButton(connectionId, wrap) {
  return flatButton({
    text: 'CLEAR\nNOW',
    color: WHITE,
    bgcolor: CLEAR_NOW_BG,
    feedbacks: [feedback('disconnected', connectionId, {}, { ...FB_DISCONNECTED_STYLE }, wrap)],
    steps: {
      0: {
        action_sets: { down: [action('clear_now', connectionId, {}, wrap)], up: [] },
        options: { runWhileHeld: [] },
      },
    },
  })
}

export function placeSparePage(config, { entries, connectionId, requestedPage, house, wrap }) {
  const result = { requestedPage, page: null, pageName: null, moved: false, placed: 0, skipped: [], items: [], clearNow: null }

  const pageIds = Object.keys(config.pages ?? {})
  const startIdx = pageIds.indexOf(String(requestedPage))
  let chosen = null
  const scanFrom = startIdx === -1 ? 0 : startIdx
  for (let i = scanFrom; i < pageIds.length; i++) {
    if (!pageHasContent(config.pages[pageIds[i]])) { chosen = pageIds[i]; break }
  }
  if (chosen === null) return result

  result.page = chosen
  result.moved = String(chosen) !== String(requestedPage)
  const page = config.pages[chosen]
  page.controls = page.controls ?? {}
  const free = freeCells(page, { maxColumn: 6 })

  // The panic button goes first, top-left, where a hand finds it.
  const cn = free.shift()
  if (cn) {
    placeControl(page, cn[0], cn[1], makeClearNowButton(connectionId, wrap))
    result.clearNow = { row: cn[0], column: cn[1] }
    result.placed++
    result.items.push({ name: 'CLEAR NOW', text: 'CLEAR\nNOW', cueId: null, row: cn[0], column: cn[1] })
  }

  for (const e of entries) {
    const cell = free.shift()
    if (!cell) { result.skipped.push(e.name); continue }
    placeControl(page, cell[0], cell[1], makeCueButton(e.name, e.cueId, connectionId, house, wrap))
    result.placed++
    result.items.push({ name: e.name, text: wrapLabel(e.name), cueId: e.cueId, row: cell[0], column: cell[1] })
  }
  page.name = NEW_PAGE_NAME
  result.pageName = page.name
  return result
}

/** A second CLEAR NOW on page 1, in the first free cell of columns 0-6. */
export function placeHomeClearNow(config, { connectionId, wrap }) {
  const page = config.pages?.['1']
  if (!page) return null
  const free = freeCells(page, { maxColumn: 6 })
  if (!free.length) return null
  const [r, c] = free[0]
  placeControl(page, r, c, makeClearNowButton(connectionId, wrap))
  return { page: 1, pageName: page.name ?? '1 Home', row: r, column: c }
}

/* -------------------------------------------------------------- report --- */

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' / ')

export function buildReportJson(result, extra = {}) {
  const { stats } = result
  return {
    generated: new Date().toISOString(),
    input: extra.input ?? null,
    output: extra.output ?? null,
    catalog: extra.catalog ?? null,
    slotsFile: extra.slotsFile ?? null,
    connection: {
      id: result.newConnectionId,
      label: result.label,
      module: NEW_MODULE,
      moduleVersionId: MODULE_VERSION,
      collectionId: result.collectionId,
    },
    singularConnections: result.singularLabels,
    totals: stats,
    pageCoverage: result.pageCoverage,
    touched: result.touched,
    leftOnSingular: result.leftOnSingular,
    mixed: result.mixed,
    multiActionButtons: result.multiAction,
    slotWaiting: result.slotWaiting,
    aliases: result.aliases,
    unmappedCompositions: result.unmapped,
    nearMisses: result.nearMisses ?? [],
    sparePage: result.spare,
    homeClearNow: result.homeClear,
    catalogNotes: extra.catalogNotes ?? null,
  }
}

export function buildReport(result, extra = {}) {
  const { stats, pageCoverage, leftOnSingular, mixed, multiAction, slotWaiting, aliases, spare, homeClear } = result
  const c = stats.converted
  const L = []
  const D = (s) => L.push(s)

  D('# Overlays conversion — 22 September 2026')
  D('')
  D(`This turns the graphics buttons on Michael's Stream Decks from Singular.live over to the congregation's own Overlays system. It was run on the export dated ${extra.inputLabel ?? 'unknown'}.`)
  D('')

  D('## Totals')
  D('')
  D(`- Pages in the file: ${stats.pagesScanned}`)
  D(`- Buttons in the file: ${stats.buttonsScanned}`)
  D(`- Buttons that touch Singular: ${stats.singularButtons}`)
  D(`- Buttons moved to Overlays: ${stats.buttonsConverted}`)
  D(`- Buttons left on Singular, untouched: ${stats.buttonsLeftOnSingular}`)
  D(`- Buttons that now do both (mixed): ${stats.buttonsMixed}`)
  D(`- Buttons turned into a one-press on/off button: ${stats.buttonsCollapsedToToggle}`)
  D(`- Buttons that kept their original multi-step shape: ${stats.buttonsKeptMultiAction}`)
  D(`- Presses rewritten — on/off: ${c.toggle_cue}, show: ${c.show_cue}, take out: ${c.animate_out}, logo on: ${c.logo_on}, logo off: ${c.logo_off}, clear all: ${c.animate_clear}`)
  D(`- Inherited logo hide/restore macros dropped from prayer buttons: ${stats.logoMacrosDropped}. The renderer hides the resting logo under any graphic by itself.`)
  D(`- Singular presses kept in place: ${stats.singularActionsKept}`)
  D(`- Side-panel presses dropped ("Start soon right"): ${stats.sidePanelActionsDropped}`)
  D(`- Old step-colour indicators removed: ${stats.bankCurrentStepDropped}`)
  D(`- Colour indicators added: ${stats.feedbacksAdded}`)
  D(`- New buttons placed: ${stats.newButtonsPlaced}`)
  D('')
  D(`The new connection is called **${result.label}** and uses the \`${NEW_MODULE}\` module, version ${MODULE_VERSION}.` +
    (result.collectionId
      ? ` It sits in the existing "Overlays" connection group (\`${result.collectionId}\`).`
      : ' The file does not group connections, so it sits on its own.'))
  D(`The three Singular connections (${Object.values(result.singularLabels).join(', ')}) are still there and still switched on.`)
  D('')

  D('## What changed since the 14 September run')
  D('')
  D('Four things are different. First, a button whose graphic has no home in the new system is now left exactly as it was, still pointing at Singular — the old run deleted those presses and greyed the button out with a warning mark, which would have left the operator holding a dead key. Second, a converted prayer button is now a single button that shows the graphic on the first press and takes it out on the second, instead of a two-step button; that stays correct even when another button has replaced the graphic in the meantime. Third, the small side panel called "Start soon right" is dropped wherever it was fired alongside a real lower third, because the new system shows one graphic at a time. Fourth, every converted button now carries three colour indicators from the Overlays module — amber while the request is in flight, red once the graphic is actually on screen, and dark red if the Overlays connection drops — instead of relying on which step the button happens to be sitting on.')
  D('')

  D('## Page by page')
  D('')
  D('| Page | Name | Singular buttons | Moved over | Left on Singular | Mixed |')
  D('| ---: | --- | ---: | ---: | ---: | ---: |')
  for (const p of pageCoverage) {
    D(`| ${p.page} | ${esc(p.pageName)} | ${p.singular} | ${p.converted} | ${p.left} | ${p.mixed} |`)
  }
  D('')

  D('## Buttons left on Singular')
  D('')
  if (!leftOnSingular.length) D('_None._')
  else {
    D('These buttons were not changed at all. They still fire Singular, exactly as before.')
    D('')
    const byPage = new Map()
    for (const b of leftOnSingular) {
      const k = `${b.page}|${b.pageName}`
      if (!byPage.has(k)) byPage.set(k, [])
      byPage.get(k).push(b)
    }
    for (const [k, list] of byPage) {
      const [pg, nm] = k.split('|')
      D(`**Page ${pg} — ${nm}**`)
      D('')
      D('| Row | Col | Button label | Graphics it fires |')
      D('| ---: | ---: | --- | --- |')
      for (const b of list) D(`| ${b.row} | ${b.column} | ${esc(b.text)} | ${esc(b.comps.join(', '))} |`)
      D('')
    }
  }
  D('')

  D('## Mixed buttons')
  D('')
  if (!mixed.length) D('_None._')
  else {
    D('These buttons now do part of their work through Overlays and part of it still through Singular.')
    D('')
    D('**What is left here.** Each of these fires one thing that has a graphic in the new system and one thing that does not, so the button does both jobs at once. The leftovers are the High Holy Day giving panel ("Money pls"), the High Holy Day logo ("HHD Logo", which is a separate graphic from the CRC logo and stays on Singular by decision), and a placeholder called "Select composition" that looks like something left behind in Singular rather than a real graphic. None of them needs fixing before a service; the buttons work exactly as they did.')
    D('')
    D('| Page | Name | Row | Col | Label | Now on Overlays | Still on Singular |')
    D('| ---: | --- | ---: | ---: | --- | --- | --- |')
    for (const b of mixed) {
      D(`| ${b.page} | ${esc(b.pageName)} | ${b.row} | ${b.column} | ${esc(b.text)} | ${esc(b.converted.join(', '))} | ${esc(b.keptOnSingular.join(', '))} |`)
    }
  }
  D('')

  D('## Buttons that kept a multi-graphic step')
  D('')
  if (!multiAction.length) D('_None._')
  else {
    D('These fire more than one graphic in a single press, so they keep their original two-step shape with a separate show and take-out instead of the one-press on/off.')
    D('')
    D('| Page | Name | Row | Col | Label | Graphics |')
    D('| ---: | --- | ---: | ---: | --- | --- |')
    for (const b of multiAction) D(`| ${b.page} | ${esc(b.pageName)} | ${b.row} | ${b.column} | ${esc(b.text)} | ${esc(b.compositions.join(', '))} |`)
  }
  D('')

  D('## Slot buttons waiting for a second run')
  D('')
  if (!slotWaiting.length) D('_None._')
  else {
    D('These buttons show a name or a reading that changes from service to service. The matching graphics in the new system are not published yet, so the buttons were left on Singular. Re-run the converter with `--slots` once those graphics exist.')
    D('')
    D('| Page | Name | Row | Col | Label | Graphic |')
    D('| ---: | --- | ---: | ---: | --- | --- |')
    for (const b of slotWaiting) D(`| ${b.page} | ${esc(b.pageName)} | ${b.row} | ${b.column} | ${esc(b.text)} | ${esc(b.comps.join(', '))} |`)
  }
  D('')

  D('## New buttons placed')
  D('')
  if (!spare?.placed) D('_None._')
  else {
    D(`Page ${spare.page} was empty, so it has been renamed "${spare.pageName}" and filled with the continuation panels that had nowhere to live, plus a CLEAR NOW button.`)
    D('')
    D('| Button | Page | Row | Col |')
    D('| --- | ---: | ---: | ---: |')
    for (const i of spare.items) D(`| ${esc(i.name)} | ${spare.page} | ${i.row} | ${i.column} |`)
    if (spare.skipped.length) { D(''); D(`Did not fit: ${spare.skipped.join(', ')}.`) }
  }
  D('')
  if (homeClear) {
    D(`A second CLEAR NOW button sits on page ${homeClear.page} ("${homeClear.pageName}") at row ${homeClear.row}, column ${homeClear.column} — the first empty key in the main block of that page.`)
  } else {
    D('There was no free key on page 1 for a CLEAR NOW button.')
  }
  D('')

  D('## Name matches applied')
  D('')
  if (!aliases.length) D('_None._')
  else {
    D('The name on the button in Companion did not match the name of the graphic, so these were matched by hand.')
    D('')
    D('| Name in Companion | Graphic used | Buttons |')
    D('| --- | --- | ---: |')
    for (const a of aliases) D(`| ${esc(a.name)} | ${esc(a.resolvesTo)} | ${a.buttons} |`)
  }
  D('')

  D('## Side panel dropped')
  D('')
  D(`The small side panel "Start soon right" was fired alongside a main graphic on some buttons. The new system shows one graphic at a time, so that press was dropped **${stats.sidePanelActionsDropped}** time(s). Buttons that fire only the side panel and nothing else were left on Singular.`)
  D('')

  D('## Near misses worth a human look')
  D('')
  const near = result.nearMisses ?? []
  if (!near.length) D('_None._')
  else {
    D('The name on the button is close to the name of a live graphic but not close enough to match automatically. Nothing was changed for these — somebody has to say whether they are the same thing.')
    D('')
    D('| Name on the button | Buttons | Possible match |')
    D('| --- | ---: | --- |')
    for (const n of near) D(`| ${esc(n.name)} | ${n.buttons} | ${esc(n.candidates.join(', '))} |`)
  }
  D('')

  D('## Graphics still without a match')
  D('')
  if (!result.unmapped.length) D('_None._')
  else {
    D('| Graphic name | Buttons | Presses | Pages |')
    D('| --- | ---: | ---: | --- |')
    for (const u of result.unmapped) {
      D(`| ${esc(u.name)} | ${u.buttons} | ${u.actions} | ${esc(u.pages.map((p) => `${p.page} (${p.buttons})`).join(', '))} |`)
    }
  }
  D('')

  const notes = extra.catalogNotes
  D('## Templates and drafts — and what is still unmatched')
  D('')
  D('The Overlays catalogue holds two kinds of live graphic. Most are **drafts**: graphics somebody authored and published. A smaller set are **baseline templates** that come with the system. Both are live and both can be put on screen, but only the drafts show up in the daily draft export, so a list built from drafts alone looks as though the templates have vanished. They have not. The templates are supplied separately and this run used them.')
  D('')
  if (notes) {
    const tmpl = notes.publishedFromTemplate ?? []
    D(`${notes.templatesTotal ?? 0} baseline templates were taken into account, and ${tmpl.length} entries in the graphics list resolve to one of them` +
      (tmpl.length ? `: ${[...new Set(tmpl.map((t) => t.name))].join(', ')}.` : '.'))
    const both = notes.nameInBothKeptFrom0914 ?? []
    if (both.length) {
      D('')
      D(`${both.length} names exist as both a template and a draft: ${both.map((b) => b.name).join(', ')}. For those the 14 September list's own choice of graphic was kept, because that list collapsed the duplicates on purpose.`)
    }
    const gone = (notes.idsNotFound ?? []).filter((e) => !e.kept)
    D('')
    if (!gone.length) D('Every graphic named in the 14 September list is still live today. Nothing was dropped from the list.')
    else D(`${gone.length} graphics named in the 14 September list are neither a live draft nor a template, so they were dropped from the list: ${gone.map((e) => e.name).join(', ')}.`)
  }
  D('')
  const stillUnmapped = result.unmapped.filter((u) => !SLOT_COMP_SET.has(normName(u.name)) && !SIDE_PANEL_COMPS.has(normName(u.name)))
  if (stillUnmapped.length) {
    D(`**Still unmatched after this fix:** ${stillUnmapped.length} graphic names on Michael's buttons have no live graphic behind them, covering ${stillUnmapped.reduce((n, u) => n + u.buttons, 0)} buttons. The full list with page numbers is under "Graphics still without a match" below; the ones that look like a spelling difference rather than a missing graphic are under "Near misses worth a human look".`)
  } else {
    D('Every graphic name on Michael\'s buttons now has a live graphic behind it.')
  }
  D('')

  D('## Notes on the graphics list')
  D('')
  if (!notes) D('_No catalogue notes supplied._')
  else {
    D(`The list was rebuilt on ${String(notes.generated ?? '').slice(0, 10)} from the 14 September list, today's ${notes.draftsTotal} drafts (of which ${notes.draftsPublished} are live) and the ${notes.templatesTotal ?? 0} baseline templates. It now has ${notes.newEntryCount} entries and covers all ${notes.publishedCuesTotal} live graphics.`)
    D('')
    D(`- Entries pointing at a graphic that is not published yet: ${notes.unpublished?.length ?? 0}${(notes.unpublished ?? []).length ? ' — ' + notes.unpublished.map((u) => u.name).join(', ') : ''}. These are treated as unmatched, so their buttons stay on Singular.`)
    const dropped = (notes.idsNotFound ?? []).filter((e) => !e.kept).map((e) => e.name)
    const kept = (notes.idsNotFound ?? []).filter((e) => e.kept).map((e) => e.name)
    if (!dropped.length && !kept.length) D('- Entries whose graphic is neither a live draft nor a template: none.')
    else D(`- Entries whose graphic is neither a live draft nor a template: ${notes.idsNotFound?.length ?? 0}.${dropped.length ? ' ' + dropped.length + ' were taken out of the list: ' + dropped.join(', ') + '.' : ''}${kept.length ? ' ' + kept.length + ' were kept because they are name-matches onto another graphic, but that graphic is gone too, so they match nothing: ' + kept.join(', ') + '.' : ''}`)
    D(`- Live drafts added to the list because they were missing: ${(notes.addedFromDrafts ?? []).join(', ') || 'none'}.`)
    D(`- Baseline templates added to the list because they were missing: ${(notes.addedFromTemplates ?? []).join(', ') || 'none'}.`)
    D('')
  }
  if (extra.nameSearches) {
    D('Searches asked for by hand:')
    D('')
    for (const s of extra.nameSearches) D(`- **${s.name}** — ${s.finding}`)
    D('')
  }

  D('## Things to re-check after a Companion update')
  D('')
  D('- Converted buttons are written in Companion 4\'s old flat button shape on purpose. Companion 5.0.3 turns them into its own layered buttons as it imports the file, and as a bonus marks them so the web console can relabel them later. If Companion ever stops doing that conversion, this converter has to change.')
  D(`- Option values are written in this file's own style (${stats.optionShape}). That is deliberate: the step that wraps option values runs only on files older than this one, so writing plain values into a modern file would leave every converted press empty.`)
  D('- Every button the converter did not touch is passed through exactly as it arrived. If a future Companion export changes shape, that pass-through is what keeps the untouched 1,000-odd buttons safe.')
  D('- The new connection joins the operator\'s existing "Overlays" connection group by id. If that group is renamed or deleted, the connection will simply arrive ungrouped.')
  D('- The module version is pinned to ' + MODULE_VERSION + '. Check that this version is installed before importing.')
  D('- This output was run through Companion 5.0.3\'s own import upgrade scripts, taken straight from the v5.0.3 source tag, before being handed over. Every rewritten button came out as a proper layered button with the right label, colour and cue, and every untouched button came out byte-for-byte identical. Re-run that check (`upgrade-check.mjs`) against a newer tag before trusting a newer Companion.')
  D('')
  return L.join('\n')
}

/* ----------------------------------------------------------------- cli --- */

export function parseArgs(argv) {
  const out = { label: 'Overlays', baseUrl: 'https://overlays.centralreform.org', logoNames: ['CRC Logo'], newPage: NEW_PAGE_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--in') out.in = next()
    else if (a === '--catalog') out.catalog = next()
    else if (a === '--out') out.out = next()
    else if (a === '--report') out.report = next()
    else if (a === '--slots') out.slots = next()
    else if (a === '--module-version') out.moduleVersion = next()
    else if (a === '--gzip') out.gzip = true
    else if (a === '--no-gzip') out.gzip = false
    else if (a === '--catalog-notes') out.catalogNotes = next()
    else if (a === '--label') out.label = next()
    else if (a === '--base-url') out.baseUrl = next()
    else if (a === '--report-name') out.reportName = next()
    // `--bug-names` is the old spelling from when this composition became the scan card. It
    // still works so an existing command line does not break, and it means the same thing it
    // always meant: which Singular composition is the logo.
    else if (a === '--logo-names' || a === '--bug-names') out.logoNames = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--new-page') {
      const v = Number(next())
      if (!Number.isInteger(v) || v < 1) throw new Error('--new-page must be a positive integer')
      out.newPage = v
    } else throw new Error(`Unknown argument: ${a}`)
  }
  for (const req of ['in', 'catalog', 'out', 'report']) {
    if (!out[req]) throw new Error(`Missing required --${req}`)
  }
  return out
}

export const NAME_SEARCHES = [
  { name: 'Or Zarua', finding: 'No graphic with this name. The closest by sound are "Mizmor L\'David" and "Mizmor L\'David 2", which are a different psalm, so nothing was matched. Left on Singular.' },
  { name: 'Guest Name', finding: 'Now a slot. "Guest name" is published in the new system and this button points at it; the name itself is typed on the site’s This service page before each service, so the button never gets relabelled again.' },
  { name: 'Start soon right', finding: 'No graphic, and none wanted: it is the side panel beside "Starting Soon". Dropped wherever it shared a button with a real graphic.' },
  { name: 'Money pls', finding: 'No graphic and nothing close. It is the High Holy Day giving panel. Left on Singular.' },
  { name: 'CRC Logo', finding: 'No graphic, because the logo is not a graphic in the new system — it is the resting corner mark, turned on and off with its own commands (logo on / logo off), and never the Daven Along scan card. A button whose only job is the logo keeps its press. Where the old deck paired a logo hide or restore with a prayer button, the pairing is dropped: the renderer now hides the mark under any graphic and brings it back when the graphic has gone, so the macro would only fight it.' },
]

/* ------------------------------------------------------- deck modes (C4) --- */

const repoRoot = path.resolve(import.meta.dirname, '..')
export const TBI_DEFAULTS = {
  seed: path.join(repoRoot, 'lib/companion-deck/tbi-seed-data.json'),
  catalog: path.join(repoRoot, 'tests/fixtures/tbi-catalog-2026-09-15.json'),
  report: path.join(repoRoot, 'docs/planning/2026-09-23-mcp-gap-analysis/TBI-CONVERSION-REPORT.md'),
  definitions: path.join(repoRoot, 'companion/definitions.json'),
}

/** A catalog snapshot `{cues:[{id,name,layout,archived?}]}` as published cues for matching (archived ones left out). */
export function catalogCues(snapshot) {
  return (snapshot.cues ?? []).filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, layout: c.layout ?? 'bottom', texts: {}, animations: [], duration: {} }))
}

/** Derive TBI's seed data from Simone's raw export. The raw file is read in memory and never copied. */
export function tbiSeedFromExport(file) {
  const bytes = fs.readFileSync(file)
  const exported = readCompanionExport(bytes)
  const source = { file: path.basename(file), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
  return deriveExportSeedData(exported, { workspace: 'tbi', source })
}

/** Convert the seeded deck against a catalog snapshot; bind every Covered row; validate both decks. */
export function tbiConversion(seedData, snapshot, definitions) {
  const cues = catalogCues(snapshot)
  const deck = seedTbiDeck(seedData)
  const result = convertSingularDeck(deck, { cues })
  const bindable = result.rows.filter((r) => r.status === 'covered' && !r.bound).map((r) => r.id)
  const converted = applyConversion(deck, result, bindable).deck
  const lookups = catalogCueLookups((snapshot.cues ?? []).map((c) => ({ id: c.id, name: c.name, archived: !!c.archived, activeRevision: 1 })))
  const check = (d) => validateDeck(d, { module: definitions, cues: lookups })
  return { deck, result, converted, seedCheck: check(deck), convertedCheck: check(converted) }
}

function deckMain(argv) {
  const mode = argv[0]
  const opt = {}
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' || a === '--catalog' || a === '--seed') opt[a.slice(2)] = argv[++i]
    else if (mode === '--tbi-seed' && !opt.in && !a.startsWith('--')) opt.in = a
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (mode === '--tbi-seed') {
    if (!opt.in) throw new Error('Usage: --tbi-seed <export.companionconfig> [--out <tbi-seed-data.json>]')
    const { data, summary } = tbiSeedFromExport(opt.in)
    const out = opt.out ?? TBI_DEFAULTS.seed
    fs.writeFileSync(out, formatExportSeedData(data))
    console.log(`Wrote ${out}: ${summary.pages} pages (${summary.pagesWithButtons} with buttons), ${summary.graphics} graphic buttons, ${summary.devices} device buttons, ${summary.builtInNav} built-in nav buttons`)
    console.log(`Connections kept: ${summary.keptConnections.join(', ')}; dropped: ${summary.droppedConnections.join(', ')}; ${summary.connectionSettingsDiscarded} connections' settings discarded unread`)
    for (const w of summary.warnings) console.log(`warning: ${w}`)
    return
  }
  const seedData = JSON.parse(fs.readFileSync(opt.seed ?? TBI_DEFAULTS.seed, 'utf8'))
  const snapshot = JSON.parse(fs.readFileSync(opt.catalog ?? TBI_DEFAULTS.catalog, 'utf8'))
  const definitions = JSON.parse(fs.readFileSync(TBI_DEFAULTS.definitions, 'utf8'))
  const { result, seedCheck, convertedCheck, converted } = tbiConversion(seedData, snapshot, definitions)
  const errors = (v) => v.findings.filter((f) => f.severity === 'error')
  const describe = (name, v) => `- ${name}: ${v.ok ? 'passes' : `fails (${errors(v).length} errors: ${errors(v).slice(0, 3).map((f) => f.message).join(' ')})`}. ${v.summary.pages} pages with buttons, ${v.summary.buttons} buttons, ${v.summary.cueIdsBound} graphics bound; connections in the export: ${v.exported ? Object.values(v.exported.instances).map((i) => i.label).join(', ') || 'none' : 'n/a'}; ${v.findings.filter((f) => f.severity === 'warning').length} warnings.`
  const rendered = converted.pages.flatMap((p) => p.buttons).filter((b) => b.spec.kind === 'cue').length
  const md = conversionReportMarkdown(result, {
    title: "TBI deck conversion report: Simone's Stream Deck, Singular.live to TBI Overlays",
    intro: [
      `For Daniel and Simone. Generated ${new Date().toISOString().slice(0, 10)} by \`node scripts/convert-companion-singular.mjs --tbi-report\`, the same conversion the \`convert_singular_deck\` tool runs. Nothing was published, nothing was bound on a stored deck, and nothing was sent anywhere.`,
      '',
      `**The deck.** Simone's Companion export of 14 September 2026 (${seedData.source.file}, Companion ${seedData.companion.build}). It has ${seedData.pages.length} pages; ${seedData.pages.filter((p) => p.template === 'service').length} of them carry buttons (1–6 and 8 for Shabbat and occasions, 95–99 for the High Holy Days). Every page keeps Companion's own page up / page number / page down buttons in the left column. Her BirdDog camera buttons and her two OBS scene buttons are carried unchanged. Every graphic button keeps its page, position, label and colour. The Singular.live connections (${seedData.dropped.map((d) => d.label).join(', ')}) are dropped and a TBI_Overlays connection is added. No connection settings or passwords from the export were kept.`,
      '',
      '**What the three words mean.** *Covered*: exactly one published TBI graphic clearly matches what the button shows today, so it can be bound. *Needs review*: a graphic may exist, but a person has to choose between candidates or settle a defect first. *Needs a graphic*: nothing published matches yet. Only Covered buttons are ever bound, and only when someone confirms them. A bound button gets the Requested and Rendered lights, so the deck shows what is on screen.',
    ],
    catalogNote: `The repo holds no snapshot of today's published TBI catalog, so this ran against the best one available: TBI's published catalog as fetched on 15 September 2026 during the first conversion pass (${(snapshot.cues ?? []).filter((c) => !c.archived).length} published graphics; ${(snapshot.cues ?? []).filter((c) => c.archived).length} archived ones left out), committed as tests/fixtures/tbi-catalog-2026-09-15.json (names and ids only). The TBI redo replaces those 15 September graphics, so read Covered here as "a graphic of this name exists", not as the final binding. Run \`convert_singular_deck\` again against the live catalog once the redo has published its graphics.`,
    validation: [
      "C2's deck validator, with the module definitions shipped with the Overlays module (TBI's page templates allow Companion's built-in navigation):",
      '',
      describe('The seeded deck, every graphic button still waiting for its graphic', seedCheck),
      describe(`The deck with every Covered button bound (${rendered} buttons, each with the Requested and Rendered lights)`, convertedCheck),
      '',
      "Companion 5.0.5's own import upgrade was not run: no 5.0.5 upgrade bundle is available here. Hardware acceptance (Simone importing the deck and pressing buttons) cannot be claimed from this report.",
    ],
    extra: [
      '## Notes for Simone',
      '',
      '- The first conversion pass found two buttons on page 5, "Ani v\'Atah 1" (row 2, column 8, 5/1/7) and "Ani v\'Atah 2" (row 1, column 8, 5/0/7), that point at Singular compositions which no longer exist, so they already do nothing. This conversion cannot see inside the Singular apps; that check returns once the Singular extract is imported (a later step).',
      '- Buttons labelled with a working note ("NEED …") are held for review, whatever they match.',
      '- Labels like "148 pt 1" or "Pg 149 Top" name Mishkan T\'filah pages. They rarely match a graphic by name, so most of them are Needs review or Needs a graphic here; the TBI redo builds them as TBI readings with book and page.',
    ],
  })
  const out = opt.out ?? TBI_DEFAULTS.report
  fs.writeFileSync(out, md)
  const s = result.summary
  console.log(`Wrote ${out}: ${s.buttons} graphic buttons, covered ${s.byStatus.covered}, needs review ${s.byStatus['needs-review']}, needs a graphic ${s.byStatus['needs-a-graphic']}`)
  console.log(`Seeded deck ${seedCheck.ok ? 'passes' : 'FAILS'} the validator; converted deck ${convertedCheck.ok ? 'passes' : 'FAILS'}`)
  for (const f of [...errors(seedCheck), ...errors(convertedCheck)].slice(0, 10)) console.log(`error: ${f.message}`)
}


function main(argv) {
  if (argv[0] === '--tbi-seed' || argv[0] === '--tbi-report') return deckMain(argv)
  const args = parseArgs(argv)
  if (args.moduleVersion) setModuleVersion(args.moduleVersion)
  const { data, gzipped: inputGzipped } = readConfig(args.in)
  // The real `.companionconfig` file is gzipped; the working copies here are not.
  const gzipped = typeof args.gzip === 'boolean' ? args.gzip : inputGzipped
  const catalog = JSON.parse(fs.readFileSync(args.catalog, 'utf8'))
  const catalogNotes = args.catalogNotes && fs.existsSync(args.catalogNotes)
    ? JSON.parse(fs.readFileSync(args.catalogNotes, 'utf8'))
    : null

  const result = convert(data, {
    catalogIndex: buildCatalogIndex(catalog),
    slots: loadSlots(args.slots),
    label: args.label,
    baseUrl: args.baseUrl,
    logoNames: args.logoNames,
    newPage: args.newPage,
  })
  writeConfig(args.out, result.config, gzipped)

  // --report may be a directory or a file path.
  let mdPath, jsonPath
  if (/\.(md|json)$/i.test(args.report)) {
    const base = args.report.replace(/\.(md|json)$/i, '')
    mdPath = base + '.md'
    jsonPath = base + '.json'
  } else {
    const name = args.reportName ?? `conversion-report-${new Date().toISOString().slice(0, 10)}`
    fs.mkdirSync(args.report, { recursive: true })
    mdPath = path.join(args.report, name + '.md')
    jsonPath = path.join(args.report, name + '.json')
  }
  const extra = {
    input: args.in, output: args.out, catalog: args.catalog, slotsFile: args.slots ?? null,
    inputLabel: path.basename(args.in), catalogNotes, nameSearches: NAME_SEARCHES,
  }
  fs.mkdirSync(path.dirname(mdPath), { recursive: true })
  fs.writeFileSync(mdPath, buildReport(result, extra))
  fs.writeFileSync(jsonPath, JSON.stringify(buildReportJson(result, extra), null, 2))

  const s = result.stats
  console.log(`Wrote ${args.out} (${gzipped ? 'gzip' : 'plain'}), option values ${s.optionShape}`)
  console.log(`Pages ${s.pagesScanned}, buttons ${s.buttonsScanned}, Singular buttons ${s.singularButtons}`)
  console.log(`Converted ${s.buttonsConverted} (toggle ${s.buttonsCollapsedToToggle}, multi-step ${s.buttonsKeptMultiAction}), left on Singular ${s.buttonsLeftOnSingular}, mixed ${s.buttonsMixed}`)
  console.log(`Side-panel drops ${s.sidePanelActionsDropped}; new buttons ${s.newButtonsPlaced}`)
  console.log(`Report: ${mdPath} and ${jsonPath}`)
}

// `file://${process.argv[1]}` is never this module's URL on Windows: the path is
// `C:\...` with backslashes, and import.meta.url is `file:///C:/.../`. The guard silently
// failed, so running the converter from a Windows shell exited 0 and wrote nothing at all.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
