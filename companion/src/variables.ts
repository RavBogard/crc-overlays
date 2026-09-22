// `current_*` describe what a graphics browser reports rendered; `requested_*`
// describe what the API was asked for. They differ whenever a request has not
// settled yet, which is exactly the moment an operator wants to see both.

import { parsePanelName } from './panel.js'

export type ConnectionLabel = 'Connected' | 'Reconnecting' | 'Disconnected'

export interface OverlayVariables {
  requested_cue: string
  requested_cue_id: string
  revision: number
  renderer_status: string
  current_name: string
  current_panel: string
  panel_count: string
  connection: string
  requested_name: string
  bug: string
  bug_page: string
  // The resting logo. `logo` is the preference the operator set; `logo_state` adds whether
  // something else is currently holding the mark back. Neither is a rendered report — the site
  // decides visibility from the graphic actually on its stage, and no variable here sees that.
  logo: string
  logo_state: string
}

/**
 * `healthy` is the raw condition; `disconnected` is that condition after the
 * 3 s grace window, so a sub-second reconnect reads as Reconnecting, never as
 * Disconnected.
 */
export function connectionLabel(healthy: boolean, disconnected: boolean): ConnectionLabel {
  if (healthy) return 'Connected'
  return disconnected ? 'Disconnected' : 'Reconnecting'
}

export interface VariableInput {
  /** The requested graphic's catalog name, or the cleared label when nothing is requested. */
  requestedName: string
  /** The requested graphic's catalog id, blank when nothing is requested. */
  requestedCueId?: string
  /** The rendered graphic's catalog name, blank while nothing is confirmed rendered. */
  currentName: string
  revision: number
  connection: ConnectionLabel
  /** Whether the live state carries a scan card. A snapshot without one is Off. */
  bugOn?: boolean
  logoOn?: boolean
  logoState?: string
  /** The page beside the scan card, blank whenever there is none. */
  bugPage?: string
}

export function overlayVariables(input: VariableInput): OverlayVariables {
  const panel = parsePanelName(input.currentName)
  return {
    // `requested_cue` has held the cue's NAME since 1.3.0 and buttons depend on it, so it
    // keeps that value for compatibility; `requested_cue_id` is the id it was named after.
    requested_cue: input.requestedName,
    requested_cue_id: input.requestedCueId ?? '',
    requested_name: input.requestedName,
    current_name: input.currentName,
    current_panel: panel?.panel ?? '',
    panel_count: panel?.count ?? '',
    connection: input.connection,
    revision: input.revision,
    bug: input.bugOn ? 'On' : 'Off',
    logo: input.logoOn ? 'On' : 'Off',
    logo_state: input.logoState ?? 'Off',
    bug_page: input.bugPage ?? '',
    renderer_status: input.connection === 'Disconnected' ? 'Disconnected' : input.currentName ? 'Rendered' : 'Requested',
  }
}
