import { createServerClient } from './supabase'
import { getConfigValue } from './telnyx'

// Email goes out through Resend (https://resend.com) from each client's OWN domain.
// One Resend account serves the platform (API key = app_config `resend_api_key`, set by the
// platform admin in Admin → Config); each client's domain is added to it from the Clients
// page, and mail for a client only sends once that client's domain is verified in DNS.
// Everything provider-specific lives in this file.

const RESEND_API = 'https://api.resend.com'

export class EmailError extends Error {
  constructor(message: string, readonly status = 500) { super(message) }
}

export interface DnsRecord {
  record: string // what it's for: SPF, DKIM, MX, …
  name: string
  type: string
  value: string
  ttl?: string | number
  priority?: number
  status?: string
}

export interface ProviderDomain {
  id: string
  name: string
  status: string
  records: DnsRecord[]
}

export interface EmailSender {
  id: string
  tenant_id: string
  domain: string
  from_name: string
  from_local: string
  reply_to: string | null
  provider_domain_id: string | null
  status: string
  dns_records: DnsRecord[]
  last_checked_at: string | null
  verified_at: string | null
}

export const SENDER_COLUMNS = 'id, tenant_id, domain, from_name, from_local, reply_to, provider_domain_id, status, dns_records, last_checked_at, verified_at'

async function apiKey(): Promise<string> {
  const key = await getConfigValue('resend_api_key')
  if (!key) throw new EmailError('Email isn\'t set up yet: add the Resend API key in Admin → Config.', 409)
  return key
}

async function resend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${RESEND_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await apiKey()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null)
  if (!res) throw new EmailError('Could not reach the email service. Try again.', 502)
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Email service error (${res.status})`
    throw new EmailError(String(msg), res.status >= 500 ? 502 : 400)
  }
  return data as T
}

function toProviderDomain(d: { id: string; name: string; status?: string; records?: DnsRecord[] }): ProviderDomain {
  return {
    id: d.id,
    name: d.name,
    status: d.status || 'not_started',
    records: (d.records ?? []).map(r => ({ record: r.record, name: r.name, type: r.type, value: r.value, ttl: r.ttl, priority: r.priority, status: r.status })),
  }
}

export async function createProviderDomain(name: string): Promise<ProviderDomain> {
  return toProviderDomain(await resend('POST', '/domains', { name }))
}

export async function getProviderDomain(id: string): Promise<ProviderDomain> {
  return toProviderDomain(await resend('GET', `/domains/${encodeURIComponent(id)}`))
}

// Asks the provider to re-check DNS now (it also re-checks on its own for a while).
export async function verifyProviderDomain(id: string): Promise<void> {
  await resend('POST', `/domains/${encodeURIComponent(id)}/verify`)
}

export async function deleteProviderDomain(id: string): Promise<void> {
  await resend('DELETE', `/domains/${encodeURIComponent(id)}`)
}

export async function getEmailSender(tenantId: string): Promise<EmailSender | null> {
  const db = createServerClient()
  const { data } = await db.from('dialer_email_senders').select(SENDER_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  return (data as EmailSender | null) ?? null
}

// True when this client can send email right now: the platform key is set and the client's
// own domain is verified. Lets callers offer email only when it will work.
export async function isEmailConfigured(tenantId: string): Promise<boolean> {
  const [key, sender] = await Promise.all([getConfigValue('resend_api_key'), getEmailSender(tenantId)])
  return !!key && sender?.status === 'verified'
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

// Plain text → simple HTML (escaped, line breaks kept, bare links clickable).
export function textToHtml(text: string): string {
  const escaped = escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}">${url}</a>`)
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\r?\n/g, '<br>')}</div>`
}

// Display names may not carry characters that break the From header.
function headerSafe(s: string): string {
  return s.replace(/["\\\r\n<>]/g, '').trim()
}

interface SendEmailParams {
  tenantId: string
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string | null
}

// Sends from the client's verified domain, e.g. "Sunlight Contractors <hello@sunlight.com>".
// Throws EmailError when the client's email isn't ready, so callers can catch and log.
export async function sendEmail({ tenantId, to, subject, text, html, replyTo }: SendEmailParams): Promise<{ id: string | null }> {
  const sender = await getEmailSender(tenantId)
  if (!sender) throw new EmailError('This account has no email domain set up yet.', 409)
  if (sender.status !== 'verified') throw new EmailError(`This account's email domain (${sender.domain}) isn't verified yet.`, 409)
  const from = `${headerSafe(sender.from_name) || sender.domain} <${sender.from_local}@${sender.domain}>`
  const reply = replyTo || sender.reply_to
  const data = await resend<{ id?: string }>('POST', '/emails', {
    from,
    to: [to],
    subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 250),
    text,
    html: html ?? textToHtml(text),
    ...(reply ? { reply_to: reply } : {}),
  })
  return { id: data?.id ?? null }
}
