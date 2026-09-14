// Redeeming a pairing code is the one request this module makes without a
// credential: it trades a short single-use code for a durable device token that
// every later request carries as a bearer. A refusal must leave the connection
// exactly as it was, so this function only reports; it never writes.

export const PAIRING_CODE = /^\d{6}$/
const TOKEN = /^[\x21-\x7e]{8,400}$/
const UNSAFE_TEXT = /[\u0000-\u001f\u007f]/g

export type PairingResult =
  | { outcome: 'idle' }
  | { outcome: 'paired'; token: string; name: string; kind: string }
  | { outcome: 'refused'; message: string }

export interface RedeemOptions {
  baseUrl: string
  code: unknown
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

/** Operators paste codes with spaces or a dash; both are cosmetic. */
export function normalizePairingCode(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/[\s-]+/g, '') : ''
}

export async function redeemPairingCode(options: RedeemOptions): Promise<PairingResult> {
  const code = normalizePairingCode(options.code)
  if (!code) return { outcome: 'idle' }
  if (!PAIRING_CODE.test(code)) return { outcome: 'refused', message: 'Pairing code must be six digits' }
  const fetchImpl = options.fetch ?? globalThis.fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000)
  try {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, '')}/api/pairing/redeem`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code }),
    })
    const body = await readJson(response)
    if (!response.ok) return { outcome: 'refused', message: refusalMessage(body, response.status) }
    return parseRedeemed(body) ?? { outcome: 'refused', message: 'The pairing response could not be read' }
  } catch {
    return { outcome: 'refused', message: 'The pairing request failed' }
  } finally {
    clearTimeout(timeout)
  }
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json() } catch { return null }
}

function refusalMessage(body: unknown, status: number): string {
  const error = isRecord(body) ? body.error : null
  const text = typeof error === 'string' ? safeText(error, 200) : ''
  return text || `The pairing code was refused (${status})`
}

function parseRedeemed(body: unknown): PairingResult | null {
  if (!isRecord(body) || typeof body.token !== 'string' || !TOKEN.test(body.token)) return null
  return {
    outcome: 'paired',
    token: body.token,
    name: typeof body.name === 'string' ? safeText(body.name, 80) : '',
    kind: typeof body.kind === 'string' ? safeText(body.kind, 32) : '',
  }
}

function safeText(value: string, max: number): string {
  return value.replace(UNSAFE_TEXT, ' ').trim().slice(0, max)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
