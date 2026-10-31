import { getConfigValue } from './telnyx'

export class TelnyxError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

// Thin wrapper over the Telnyx v2 REST API using the key stored in app_config.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function telnyxRequest(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const apiKey = (await getConfigValue('telnyx_api_key')) || process.env.TELNYX_API_KEY
  if (!apiKey) throw new TelnyxError('Telnyx API key is not configured (Admin → Config).', 500)

  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || `HTTP ${res.status}`
    throw new TelnyxError(`Telnyx ${method} ${path} failed: ${detail}`, res.status)
  }
  return json
}

export function encodeClientState(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
}

export function decodeClientState(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) } catch { return null }
}
