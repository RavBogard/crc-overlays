import { describe, expect, it } from 'vitest'
import { parsePanelName } from '../src/panel.js'
import { connectionLabel, overlayVariables } from '../src/variables.js'

describe('published multipart panel names', () => {
  it('reads the panel and the total from the published convention', () => {
    expect(parsePanelName('Mah Tovu — 01 of 03')).toEqual({ name: 'Mah Tovu', panel: '01', count: '03' })
  })

  it('keeps the published zero padding rather than renumbering', () => {
    expect(parsePanelName('Barechu — 007 of 012')).toEqual({ name: 'Barechu', panel: '007', count: '012' })
  })

  it('reads the last panel of a set', () => {
    expect(parsePanelName('Hashkivenu — 03 of 03')).toEqual({ name: 'Hashkivenu', panel: '03', count: '03' })
  })

  it('keeps an em dash that belongs to the name itself', () => {
    expect(parsePanelName('Modeh Ani — Bottom — 02 of 04')).toEqual({ name: 'Modeh Ani — Bottom', panel: '02', count: '04' })
  })

  it('does not match a hyphen', () => {
    expect(parsePanelName('Mah Tovu - 01 of 03')).toBeNull()
  })

  it('does not match an en dash', () => {
    expect(parsePanelName('Mah Tovu – 01 of 03')).toBeNull()
  })

  it('does not match without the spaces around the em dash', () => {
    expect(parsePanelName('Mah Tovu—01 of 03')).toBeNull()
  })

  it('does not match a single-part graphic', () => {
    expect(parsePanelName('Mah Tovu')).toBeNull()
  })

  it('does not match when the panel number exceeds the total', () => {
    expect(parsePanelName('Mah Tovu — 04 of 03')).toBeNull()
  })

  it('does not match a zero panel number', () => {
    expect(parsePanelName('Mah Tovu — 00 of 03')).toBeNull()
  })

  it('does not match when the name is missing', () => {
    expect(parsePanelName(' — 01 of 03')).toBeNull()
  })

  it('does not match a non-string', () => {
    expect(parsePanelName(null)).toBeNull()
    expect(parsePanelName(3)).toBeNull()
  })
})

describe('variable derivation', () => {
  it('publishes the panel position of the rendered graphic', () => {
    const variables = overlayVariables({ requestedName: 'Mah Tovu — 01 of 03', currentName: 'Mah Tovu — 01 of 03', revision: 7, connection: 'Connected' })
    expect(variables).toEqual({
      requested_cue: 'Mah Tovu — 01 of 03', requested_name: 'Mah Tovu — 01 of 03', current_name: 'Mah Tovu — 01 of 03',
      current_panel: '01', panel_count: '03', connection: 'Connected', revision: 7, renderer_status: 'Rendered',
    })
  })

  it('leaves the panel variables blank when the name does not match', () => {
    const variables = overlayVariables({ requestedName: 'Barechu', currentName: 'Barechu', revision: 2, connection: 'Connected' })
    expect(variables.current_panel).toBe('')
    expect(variables.panel_count).toBe('')
  })

  it('leaves the current graphic blank while nothing is confirmed rendered', () => {
    const variables = overlayVariables({ requestedName: 'Barechu', currentName: '', revision: 2, connection: 'Reconnecting' })
    expect(variables.current_name).toBe('')
    expect(variables.requested_name).toBe('Barechu')
    expect(variables.renderer_status).toBe('Requested')
  })

  it('reuses the grace window: unhealthy inside it reads as Reconnecting', () => {
    expect(connectionLabel(true, false)).toBe('Connected')
    expect(connectionLabel(false, false)).toBe('Reconnecting')
    expect(connectionLabel(false, true)).toBe('Disconnected')
  })
})
