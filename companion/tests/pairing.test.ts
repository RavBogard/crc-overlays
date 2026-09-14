import { describe, expect, it, vi } from 'vitest'
import { normalizePairingCode, redeemPairingCode } from '../src/pairing.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const token = 'cd_abcdefghijkl.mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ'

describe('pairing code redemption', () => {
  it('posts the code to the redeem route and returns the credential', async () => {
    let request: { url: string; method?: string; body: unknown; contentType: string | null } | null = null
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      request = { url: String(url), method: init?.method, body: JSON.parse(String(init?.body)), contentType: new Headers(init?.headers).get('Content-Type') }
      return json({ token, name: 'Sanctuary PC', kind: 'companion' })
    })
    const result = await redeemPairingCode({ baseUrl: 'https://example.test/', code: '123456', fetch: fetchMock })
    expect(request).toEqual({ url: 'https://example.test/api/pairing/redeem', method: 'POST', body: { code: '123456' }, contentType: 'application/json' })
    expect(result).toEqual({ outcome: 'paired', token, name: 'Sanctuary PC', kind: 'companion' })
  })

  it('accepts the 201 the redeem route answers with', async () => {
    const fetchMock = vi.fn(async () => json({ token, name: 'Sanctuary PC', kind: 'companion' }, 201))
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '123456', fetch: fetchMock }))
      .resolves.toEqual({ outcome: 'paired', token, name: 'Sanctuary PC', kind: 'companion' })
  })

  it('sends no request at all when no code is entered', async () => {
    const fetchMock = vi.fn(async () => json({}))
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '', fetch: fetchMock })).resolves.toEqual({ outcome: 'idle' })
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: undefined, fetch: fetchMock })).resolves.toEqual({ outcome: 'idle' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes spacing before sending', async () => {
    expect(normalizePairingCode(' 123 456 ')).toBe('123456')
    expect(normalizePairingCode('123-456')).toBe('123456')
    let sent: unknown = null
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return json({ token, name: '', kind: 'companion' }) })
    await redeemPairingCode({ baseUrl: 'https://example.test', code: '123 456', fetch: fetchMock })
    expect(sent).toEqual({ code: '123456' })
  })

  it('refuses a code that is not six digits without sending it', async () => {
    const fetchMock = vi.fn(async () => json({}))
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '12345', fetch: fetchMock })).resolves.toEqual({ outcome: 'refused', message: 'Pairing code must be six digits' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the server refusal message from a 400', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'That pairing code has expired' }, 400))
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '123456', fetch: fetchMock }))
      .resolves.toEqual({ outcome: 'refused', message: 'That pairing code has expired' })
  })

  it('refuses with the status when the refusal carries no message', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 429 }))
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '123456', fetch: fetchMock }))
      .resolves.toEqual({ outcome: 'refused', message: 'The pairing code was refused (429)' })
  })

  it('refuses a response without a usable token', async () => {
    const fetchMock = vi.fn(async () => json({ name: 'Sanctuary PC', kind: 'companion' }))
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '123456', fetch: fetchMock }))
      .resolves.toEqual({ outcome: 'refused', message: 'The pairing response could not be read' })
  })

  it('refuses when the request itself fails', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network down') })
    await expect(redeemPairingCode({ baseUrl: 'https://example.test', code: '123456', fetch: fetchMock }))
      .resolves.toEqual({ outcome: 'refused', message: 'The pairing request failed' })
  })
})
