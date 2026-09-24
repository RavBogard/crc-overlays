import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CrcOverlaysInstance from '../src/main.js'
// @ts-expect-error plain ES module script without type declarations
import { buildDefinitions, DEFINITIONS_PATH, formatDefinitions } from '../scripts/write-definitions.mjs'

describe('definitions.json', () => {
  it('is what this module source registers (run npm run build to regenerate)', async () => {
    const committed = readFileSync(DEFINITIONS_PATH as string, 'utf8')
    expect(committed).toBe((formatDefinitions as (d: unknown) => string)(await (buildDefinitions as (c: unknown) => Promise<unknown>)(CrcOverlaysInstance)))
  })

  it('names the cue option on every cue action and feedback', () => {
    const defs = JSON.parse(readFileSync(DEFINITIONS_PATH as string, 'utf8')) as { actions: Record<string, { options: { id: string }[] }>; feedbacks: Record<string, { options: { id: string }[] }> }
    for (const id of ['show_cue', 'toggle_cue', 'animate_out']) expect(defs.actions[id]?.options.map(o => o.id)).toEqual(['cue'])
    for (const id of ['requested', 'rendered', 'slot_empty']) expect(defs.feedbacks[id]?.options.map(o => o.id)).toEqual(['cue'])
  })
})
