// Full-deck export delivery (R-C4, full scope only): the .companionconfig bytes for a stored deck, and
// the signed short-lived link that fetches them from app/api/companion/deck. The link names the deck
// version and the sha256 of the exact bytes the agent validated, so a download can never be a different
// deck than the one that was checked: if the deck changed since, the link is refused and a new one is
// asked for. The deck itself holds connection labels only (no config, no secrets), so the file does too.
import crypto from 'node:crypto'
import type { CompanionDeck, DeckWorkspace } from './model.ts'
import { encodeCompanionConfig, renderDeck } from './render.ts'

/** How long an export link works. */
export const EXPORT_LINK_MS = 15 * 60 * 1000
export const EXPORT_ROUTE = '/api/companion/deck'

export type ExportClaims = { w: DeckWorkspace; v: number; scope: 'full'; sha: string; exp: number }

type KeyEnvironment = {COMPANION_EXPORT_KEY?: string; RELAY_SECRET?: string; CONTROL_KEY?: string; [key: string]: string | undefined}

/**
 * The signing key. A dedicated COMPANION_EXPORT_KEY (32+ characters) wins; otherwise a key derived, with a
 * purpose label, from the deployment's relay secret or control key, so no existing secret is ever used
 * as-is and a link can never be replayed against anything else. Null when none is configured.
 */
export function exportSigningKey(env: KeyEnvironment = process.env): Buffer | null {
  const own = env.COMPANION_EXPORT_KEY?.trim()
  if (own && own.length >= 32) return Buffer.from(own, 'utf8')
  const base = env.RELAY_SECRET || env.CONTROL_KEY
  if (!base) return null
  return crypto.createHmac('sha256', base).update('companion-deck-export/v1').digest()
}

const mac = (key: Buffer, payload: string) => crypto.createHmac('sha256', key).update(payload).digest('base64url')

export function signExport(claims: ExportClaims, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${payload}.${mac(key, payload)}`
}

/** The claims of a genuine, unexpired link; null for anything else. */
export function verifyExport(token: string, key: Buffer, now: number): ExportClaims | null {
  if (typeof token !== 'string' || token.length > 1024) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = Buffer.from(mac(key, payload)), actual = Buffer.from(signature)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ExportClaims
    if (!claims || claims.scope !== 'full' || !['crc', 'tbi'].includes(claims.w) || !Number.isInteger(claims.v) || typeof claims.sha !== 'string' || typeof claims.exp !== 'number') return null
    return claims.exp > now ? claims : null
  } catch { return null }
}

export const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex')

/** The full export of a deck: the exact .companionconfig bytes and what they hold. */
export function fullExport(deck: CompanionDeck) {
  const exported = renderDeck(deck)
  const bytes = encodeCompanionConfig(exported)
  const connections = Object.values(exported.instances).map((c) => ({ label: String(c.label), moduleId: String(c.moduleId) })).sort((a, b) => a.label.localeCompare(b.label))
  return { exported, bytes, sha256: sha256(bytes), connections }
}

export function exportFileName(workspace: DeckWorkspace, version: number, now: number) {
  return `${workspace}-companion-deck-v${version}-${new Date(now).toISOString().slice(0, 10)}.companionconfig`
}
