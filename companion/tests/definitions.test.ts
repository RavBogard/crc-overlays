import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CrcOverlaysInstance from '../src/main.js'
// @ts-expect-error plain ES module script without type declarations
import { buildDefinitions, DEFINITIONS_PATH, definitionsPathFor, formatDefinitions } from '../scripts/write-definitions.mjs'

describe('definitions/<version>.json', () => {
  it('keeps the newest package as a copy of definitions.json, and 1.7.0 for the decks that still ask for it', () => {
    const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    const pathFor = definitionsPathFor as (version: string) => string
    const current = JSON.parse(read(DEFINITIONS_PATH as string)) as { version: string }
    expect(read(pathFor(current.version))).toBe(read(DEFINITIONS_PATH as string))
    const released = JSON.parse(read(pathFor('1.7.0'))) as { version: string; feedbacks: Record<string, unknown> }
    expect(released.version).toBe('1.7.0')
    expect(released.feedbacks.last_source_agent).toBeUndefined()
    expect(() => pathFor('../x')).toThrow()
  })
})

describe('definitions.json', () => {
  it('describes the packaged module, and the source still registers all of it (run npm run package to regenerate)', async () => {
    // The file is the released contract a deck is validated against; source may add definitions
    // before the next package (they reach decks only once packaged), but never drop or change one.
    type Defs = { moduleId: string; actions: Record<string, unknown>; feedbacks: Record<string, unknown> }
    const committed = JSON.parse(readFileSync(DEFINITIONS_PATH as string, 'utf8')) as Defs
    const source = JSON.parse((formatDefinitions as (d: unknown) => string)(await (buildDefinitions as (c: unknown) => Promise<unknown>)(CrcOverlaysInstance))) as Defs
    expect(source.moduleId).toBe(committed.moduleId)
    for (const kind of ['actions', 'feedbacks'] as const) for (const [id, def] of Object.entries(committed[kind])) expect(source[kind][id], `${kind} ${id}`).toEqual(def)
  })

  it('names the cue option on every cue action and feedback', () => {
    const defs = JSON.parse(readFileSync(DEFINITIONS_PATH as string, 'utf8')) as { actions: Record<string, { options: { id: string }[] }>; feedbacks: Record<string, { options: { id: string }[] }> }
    for (const id of ['show_cue', 'toggle_cue', 'animate_out']) expect(defs.actions[id]?.options.map(o => o.id)).toEqual(['cue'])
    for (const id of ['requested', 'rendered', 'slot_empty']) expect(defs.feedbacks[id]?.options.map(o => o.id)).toEqual(['cue'])
  })
})
