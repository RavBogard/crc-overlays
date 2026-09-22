#!/usr/bin/env node
// Step 1 — rebuild the catalog map from the 9/14 map, today's draft list, and
// the baseline template cues.
//
// The Overlays catalog holds two kinds of live cue:
//   * DRAFTS   — authored cues; `activeRevision` non-null means published.
//   * TEMPLATES— baseline cues that ship with the system. They are published
//                and live, but they are not drafts, so they never appear in the
//                drafts export. They are supplied separately.
//
// Rules:
//   * every 9/14 entry that has a cueId is looked up by id, TEMPLATES first
//       - a template id                -> status "published", source "template"
//       - a draft with activeRevision  -> status "published"
//       - a draft without one          -> status "unpublished" (converter treats as unmapped)
//       - neither                      -> keep only when the entry is an alias entry or the
//                                         id looks like `names:<collection>:<NN>`; otherwise
//                                         drop it and list it in the notes
//   * every published draft whose name is not already a key is added
//   * every template whose name is not already a key is added
//   * where a name exists in BOTH the templates and the drafts, the 9/14 map's
//     own name -> cueId choice wins. Those choices collapsed duplicates on
//     purpose and must not be second-guessed here.
//   * aliasOf / newButton flags from the 9/14 map are preserved

import fs from 'node:fs'
import path from 'node:path'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]

const OLD = args.old
const DRAFTS = args.drafts
const TEMPLATES = args.templates
const OUT = args.out
const NOTES = args.notes
if (!OLD || !DRAFTS || !OUT) {
  console.error('usage: refresh-catalog.mjs --old <map.json> --drafts <drafts.json> [--templates <templates.json>] --out <map.json> [--notes <notes.json>]')
  process.exit(2)
}

const oldMap = JSON.parse(fs.readFileSync(OLD, 'utf8'))
const drafts = JSON.parse(fs.readFileSync(DRAFTS, 'utf8'))

/** Templates file: either `{templates: {id: name}}` or a bare `{id: name}` map. */
const templates = new Map()
if (TEMPLATES) {
  const raw = JSON.parse(fs.readFileSync(TEMPLATES, 'utf8'))
  const table = raw.templates ?? raw
  for (const [id, name] of Object.entries(table)) {
    if (typeof name === 'string') templates.set(id, name)
  }
}

const NAMES_ID = /^names:[^:]+:\d+$/
const norm = (s) => String(s ?? '').trim().toLowerCase()

const byId = new Map()
for (const d of drafts) byId.set(d.id, d)

const notes = {
  generated: new Date().toISOString(),
  oldEntries: Object.keys(oldMap).length,
  draftsTotal: drafts.length,
  draftsPublished: drafts.filter((d) => d.activeRevision).length,
  templatesTotal: templates.size,
  published: [],
  publishedFromTemplate: [],
  unpublished: [],
  idsNotFound: [],
  keptDespiteMissingId: [],
  addedFromDrafts: [],
  addedFromTemplates: [],
  nameInBothKeptFrom0914: [],
}

const next = {}

for (const [name, entryRaw] of Object.entries(oldMap)) {
  const entry = typeof entryRaw === 'string' ? { cueId: entryRaw } : { ...entryRaw }
  const cueId = entry.cueId
  if (!cueId) continue

  if (templates.has(cueId)) {
    entry.status = 'published'
    entry.source = 'template'
    entry.templateName = templates.get(cueId)
    next[name] = entry
    notes.published.push(name)
    notes.publishedFromTemplate.push({ name, cueId, templateName: templates.get(cueId) })
    continue
  }

  const draft = byId.get(cueId)
  if (draft && draft.activeRevision) {
    entry.status = 'published'
    entry.draftName = draft.name
    next[name] = entry
    notes.published.push(name)
    continue
  }
  if (draft) {
    entry.status = 'unpublished'
    entry.draftName = draft.name
    next[name] = entry
    notes.unpublished.push({ name, cueId, draftName: draft.name })
    continue
  }

  const keep = !!entry.aliasOf || NAMES_ID.test(cueId)
  notes.idsNotFound.push({ name, cueId, aliasOf: entry.aliasOf ?? null, kept: keep, oldStatus: entryRaw?.status ?? null })
  if (keep) {
    entry.status = 'id-not-found'
    next[name] = entry
    notes.keptDespiteMissingId.push(name)
  }
}

// Which names exist in both places? Recorded so the reader can see the 9/14
// choice was kept on purpose rather than by accident.
const templateNames = new Set([...templates.values()].map(norm))
const draftNames = new Set(drafts.filter((d) => d.activeRevision).map((d) => norm(d.name)))
for (const n of templateNames) {
  if (draftNames.has(n)) {
    const key = Object.keys(next).find((k) => norm(k) === n)
    if (key) notes.nameInBothKeptFrom0914.push({ name: key, cueId: next[key].cueId, source: next[key].source ?? 'draft' })
  }
}

const existing = new Set(Object.keys(next).map(norm))

// Add every published draft whose exact name is not already a key.
for (const d of drafts) {
  if (!d.activeRevision) continue
  if (existing.has(norm(d.name))) continue
  next[d.name] = { cueId: d.id, status: 'published', source: 'drafts-2026-09-22', draftName: d.name }
  existing.add(norm(d.name))
  notes.addedFromDrafts.push(d.name)
}

// Add every template whose exact name is not already a key.
for (const [id, name] of templates) {
  if (existing.has(norm(name))) continue
  next[name] = { cueId: id, status: 'published', source: 'template', templateName: name }
  existing.add(norm(name))
  notes.addedFromTemplates.push(name)
}

// Coverage: does the map now name every live cue, draft or template?
const liveIds = new Map()
for (const d of drafts) if (d.activeRevision) liveIds.set(d.id, d.name)
for (const [id, name] of templates) liveIds.set(id, name)
const mappedIds = new Set(Object.values(next).filter((e) => e.status === 'published').map((e) => e.cueId))
notes.publishedCuesCovered = [...liveIds.keys()].filter((id) => mappedIds.has(id)).length
notes.publishedCuesTotal = liveIds.size
notes.publishedCuesMissing = [...liveIds.entries()].filter(([id]) => !mappedIds.has(id)).map(([, n]) => n)
notes.newEntryCount = Object.keys(next).length

const sorted = {}
for (const k of Object.keys(next).sort((a, b) => a.localeCompare(b))) sorted[k] = next[k]

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2))
if (NOTES) fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2))

console.log(`old entries            ${notes.oldEntries}`)
console.log(`published              ${notes.published.length} (of which templates ${notes.publishedFromTemplate.length})`)
console.log(`unpublished            ${notes.unpublished.length}`)
console.log(`ids not found          ${notes.idsNotFound.length} (kept ${notes.keptDespiteMissingId.length})`)
console.log(`added from drafts      ${notes.addedFromDrafts.length}`)
console.log(`added from templates   ${notes.addedFromTemplates.length}`)
console.log(`name in both, 9/14 won ${notes.nameInBothKeptFrom0914.length}`)
console.log(`new map entries        ${notes.newEntryCount}`)
console.log(`live cues covered      ${notes.publishedCuesCovered}/${notes.publishedCuesTotal}`)
if (notes.publishedCuesMissing.length) console.log(`  not named by the map: ${notes.publishedCuesMissing.join(', ')}`)
