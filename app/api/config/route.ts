import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

// Telnyx and app_url are one set for the whole platform: webhooks and server code read
// them by key alone (`.eq('key', …).single()`), so a second row for another tenant would
// break every reader. Only platform admins may change them, and they're updated in place.
const PLATFORM_KEYS = ['telnyx_api_key', 'telnyx_public_key', 'telnyx_sip_connection_id', 'app_url']
// Mailbox settings belong to each account.
const TENANT_KEYS = [
  'spacemail_email', 'spacemail_password',
  'spacemail_imap_host', 'spacemail_imap_port',
  'spacemail_smtp_host', 'spacemail_smtp_port',
]
const ALLOWED_KEYS = [...PLATFORM_KEYS, ...TENANT_KEYS]

export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const db = createServerClient()

  const [platform, tenant] = await Promise.all([
    db.from('app_config').select('key, value, updated_at').in('key', PLATFORM_KEYS),
    db.from('app_config').select('key, value, updated_at').in('key', TENANT_KEYS).eq('tenant_id', caller.tenantId),
  ])
  const error = platform.error || tenant.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const data = [...(platform.data ?? []), ...(tenant.data ?? [])]

  // Return a map of key → { isSet, updated_at } — never expose raw values to client
  const result: Record<string, { isSet: boolean; updated_at: string | null }> = {}
  for (const key of ALLOWED_KEYS) {
    const row = data.find(r => r.key === key)
    result[key] = { isSet: !!(row?.value), updated_at: row?.updated_at ?? null }
  }

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const body: Record<string, string> = await req.json()
  const db = createServerClient()
  const now = new Date().toISOString()

  const updates = Object.entries(body)
    .filter(([key]) => ALLOWED_KEYS.includes(key))
    .filter(([, value]) => value !== undefined)
  if (updates.length === 0) return NextResponse.json({ ok: true })

  const platformUpdates = updates.filter(([key]) => PLATFORM_KEYS.includes(key))
  if (platformUpdates.length && !caller.isPlatformAdmin) {
    return forbidden('Only the platform admin can change Telnyx settings.')
  }

  for (const [key, value] of platformUpdates) {
    const { data: existing, error } = await db.from('app_config').update({ value: value || null, updated_at: now }).eq('key', key).select('key')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!existing?.length) {
      const { error: insErr } = await db.from('app_config').insert({ key, value: value || null, updated_at: now, tenant_id: caller.tenantId })
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  const tenantRows = updates
    .filter(([key]) => TENANT_KEYS.includes(key))
    .map(([key, value]) => ({ key, value: value || null, updated_at: now, tenant_id: caller.tenantId }))
  if (tenantRows.length) {
    // app_config's primary key is (tenant_id, key).
    const { error } = await db.from('app_config').upsert(tenantRows, { onConflict: 'tenant_id,key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
