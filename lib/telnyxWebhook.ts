import crypto from 'crypto'
import { getConfigValue } from './telnyx'

// DER prefix for an Ed25519 SubjectPublicKeyInfo; Telnyx publishes the raw 32-byte key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const MAX_SKEW_SECONDS = 300

export function parseTelnyxPublicKey(value: string | null | undefined): crypto.KeyObject | null {
  if (!value) return null
  try {
    const raw = Buffer.from(value.trim(), 'base64')
    if (raw.length !== 32) return null
    return crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

// Telnyx signs `${timestamp}|${raw body}` with Ed25519 and sends the signature (base64) in
// telnyx-signature-ed25519 and the Unix timestamp in telnyx-timestamp.
export function verifyWithKey(key: crypto.KeyObject, rawBody: string, signature: string | null, timestamp: string | null, nowSeconds = Date.now() / 1000): boolean {
  if (!signature || !timestamp) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) return false
  try {
    return crypto.verify(null, Buffer.from(`${timestamp}|${rawBody}`), key, Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}

export async function verifyTelnyxRequest(rawBody: string, headers: Headers): Promise<boolean> {
  const key = parseTelnyxPublicKey(await getConfigValue('telnyx_public_key'))
  if (!key) return false
  return verifyWithKey(key, rawBody, headers.get('telnyx-signature-ed25519'), headers.get('telnyx-timestamp'))
}
