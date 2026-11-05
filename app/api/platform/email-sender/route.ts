import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getActor } from '@/lib/authz'
import { getConfigValue } from '@/lib/telnyx'
import {
  EmailError, SENDER_COLUMNS, createProviderDomain, getProviderDomain, verifyProviderDomain, deleteProviderDomain,
  type EmailSender, type ProviderDomain,
} from '@/lib/email'

// Platform admin only: every client's sending domain lives in the one platform Resend
// account, so adding or removing a client's domain is the account manager's job.

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const LOCAL_RE = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
function bad(error: string, status = 400) { return NextResponse.json({ error }, { status }) }
function emailErr(err: unknown) {
  if (err instanceof EmailError) return bad(err.message, err.status)
  console.error('[email-sender]', err)
  return bad('Something went wrong talking to the email service.', 500)
}

function cleanDomain(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
}

function cleanSettings(b: Record<string, unknown>): { from_name: string; from_local: string; reply_to: string | null } | string {
  const from_name = String(b.from_name ?? '').replace(/["\\\r\n<>]/g, '').trim()
  const from_local = String(b.from_local ?? '').trim().toLowerCase()
  const reply_to = String(b.reply_to ?? '').trim() || null
  if (!from_name || from_name.length > 80) return 'Enter a sender name (up to 80 characters), e.g. the business name.'
  if (!LOCAL_RE.test(from_local) || from_local.length > 64) return 'Enter the part before the @, e.g. "hello" or "contracts".'
  if (reply_to && (!EMAIL_RE.test(reply_to) || reply_to.length > 254)) return 'Reply-to must be an email address.'
  return { from_name, from_local, reply_to }
}

async function saveProviderState(db: ReturnType<typeof createServerClient>, sender: EmailSender, d: ProviderDomain): Promise<EmailSender> {
  const now = new Date().toISOString()
  const patch = {
    status: d.status,
    dns_records: d.records,
    last_checked_at: now,
    updated_at: now,
    verified_at: d.status === 'verified' ? (sender.verified_at || now) : null,
  }
  const { data } = await db.from('dialer_email_senders').update(patch).eq('id', sender.id).eq('tenant_id', sender.tenant_id).select(SENDER_COLUMNS).maybeSingle()
  return (data as EmailSender | null) ?? { ...sender, ...patch }
}

async function loadSender(db: ReturnType<typeof createServerClient>, tenantId: string): Promise<EmailSender | null> {
  const { data } = await db.from('dialer_email_senders').select(SENDER_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  return (data as EmailSender | null) ?? null
}

async function tenantExists(db: ReturnType<typeof createServerClient>, tenantId: string): Promise<boolean> {
  if (!tenantId) return false
  const { data } = await db.from('tenants').select('id').eq('id', tenantId).maybeSingle()
  return !!data
}

export async function GET(req: NextRequest) {
  const actor = await getActor()
  if (!actor?.is_platform_admin) return forbidden()
  const tenantId = new URL(req.url).searchParams.get('tenant_id') || ''
  const db = createServerClient()
  if (!(await tenantExists(db, tenantId))) return bad('Unknown client', 404)

  const apiKeySet = !!(await getConfigValue('resend_api_key'))
  let sender = await loadSender(db, tenantId)
  let refreshError: string | null = null
  // Not verified yet: pick up the latest DNS status from the provider.
  if (sender?.provider_domain_id && sender.status !== 'verified' && apiKeySet) {
    try {
      sender = await saveProviderState(db, sender, await getProviderDomain(sender.provider_domain_id))
    } catch (err) {
      refreshError = err instanceof Error ? err.message : 'Could not check the domain status.'
    }
  }
  return NextResponse.json({ sender, api_key_set: apiKeySet, refresh_error: refreshError })
}

// Add a client's sending domain.
export async function POST(req: NextRequest) {
  const actor = await getActor()
  if (!actor?.is_platform_admin) return forbidden()
  const b = await req.json().catch(() => ({}))
  const tenantId = String(b.tenant_id ?? '')
  const db = createServerClient()
  if (!(await tenantExists(db, tenantId))) return bad('Unknown client', 404)

  const domain = cleanDomain(b.domain)
  if (!DOMAIN_RE.test(domain) || domain.length > 253) return bad('Enter a domain like sunlightcontractors.com (no https://, no email address).')
  const settings = cleanSettings(b)
  if (typeof settings === 'string') return bad(settings)

  const existing = await loadSender(db, tenantId)
  if (existing) return bad(`This client already sends from ${existing.domain}. Remove it first to switch domains.`, 409)
  const { data: taken } = await db.from('dialer_email_senders').select('tenant_id').eq('domain', domain).maybeSingle()
  if (taken) return bad('Another client already uses that domain.', 409)

  let provider: ProviderDomain
  try {
    provider = await createProviderDomain(domain)
  } catch (err) {
    return emailErr(err)
  }

  const now = new Date().toISOString()
  const { data, error } = await db.from('dialer_email_senders').insert({
    tenant_id: tenantId,
    domain,
    ...settings,
    provider: 'resend',
    provider_domain_id: provider.id,
    status: provider.status,
    dns_records: provider.records,
    last_checked_at: now,
    verified_at: provider.status === 'verified' ? now : null,
  }).select(SENDER_COLUMNS).single()
  if (error) {
    // Don't leave an orphan domain in the provider account.
    await deleteProviderDomain(provider.id).catch(() => {})
    return bad(error.message, 500)
  }
  return NextResponse.json({ sender: data })
}

// { tenant_id, action: 'verify' } re-checks DNS now; { tenant_id, action: 'update', from_name, from_local, reply_to } edits the sender.
export async function PATCH(req: NextRequest) {
  const actor = await getActor()
  if (!actor?.is_platform_admin) return forbidden()
  const b = await req.json().catch(() => ({}))
  const tenantId = String(b.tenant_id ?? '')
  const db = createServerClient()
  const sender = await loadSender(db, tenantId)
  if (!sender) return bad('This client has no email domain yet.', 404)

  if (b.action === 'verify') {
    if (!sender.provider_domain_id) return bad('This domain was never added to the email service. Remove it and add it again.', 409)
    try {
      await verifyProviderDomain(sender.provider_domain_id)
      return NextResponse.json({ sender: await saveProviderState(db, sender, await getProviderDomain(sender.provider_domain_id)) })
    } catch (err) {
      return emailErr(err)
    }
  }

  if (b.action === 'update') {
    const settings = cleanSettings(b)
    if (typeof settings === 'string') return bad(settings)
    const { data, error } = await db.from('dialer_email_senders')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', sender.id).eq('tenant_id', tenantId)
      .select(SENDER_COLUMNS).single()
    if (error) return bad(error.message, 500)
    return NextResponse.json({ sender: data })
  }

  return bad('Unknown action')
}

// Remove a client's domain (from the provider too). Email stops for that client.
export async function DELETE(req: NextRequest) {
  const actor = await getActor()
  if (!actor?.is_platform_admin) return forbidden()
  const tenantId = new URL(req.url).searchParams.get('tenant_id') || ''
  const db = createServerClient()
  const sender = await loadSender(db, tenantId)
  if (!sender) return NextResponse.json({ ok: true })

  if (sender.provider_domain_id) {
    try {
      await deleteProviderDomain(sender.provider_domain_id)
    } catch (err) {
      // Already gone at the provider is fine; anything else, keep the row so it isn't orphaned.
      if (!(err instanceof EmailError && /not.?found/i.test(err.message))) return emailErr(err)
    }
  }
  const { error } = await db.from('dialer_email_senders').delete().eq('id', sender.id).eq('tenant_id', tenantId)
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}
