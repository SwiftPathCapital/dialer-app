import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, unauthorized, forbidden } from '@/lib/caller'

const ADMIN_COLUMNS = 'id, name, email, sip_username, sip_password, extension, did, status, voicemail_greeting_url, can_view_all_leads, hidden_features, is_platform_admin, tenant_id, updated_at'
// Teammates see each other's names and status, never softphone credentials.
const AGENT_COLUMNS = 'id, name, email, extension, status, tenant_id'

// What each kind of caller may change. role, tenant_id, is_platform_admin and email are
// never editable here — those go through the Clients page / Supabase Auth.
const SELF_FIELDS = ['status']
const ADMIN_FIELDS = ['name', 'status', 'extension', 'did', 'sip_username', 'sip_password', 'can_view_all_leads', 'hidden_features', 'voicemail_greeting_url']
const STATUSES = ['available', 'busy', 'offline']

export async function GET() {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const db = createServerClient()
  const { data, error } = await db
    .from('agents')
    .select(isAdmin(caller) ? ADMIN_COLUMNS : AGENT_COLUMNS)
    .eq('tenant_id', caller.tenantId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Creates a softphone-only agent row (no login) in the admin's own tenant.
export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('agents')
    .insert({
      name: body.name,
      email: body.email,
      sip_username: body.sip_username,
      sip_password: body.sip_password,
      extension: body.extension || null,
      tenant_id: caller.tenantId,
    })
    .select(ADMIN_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const { id, ...requested } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const self = id === caller.id
  const allowed = isAdmin(caller) ? ADMIN_FIELDS : self ? SELF_FIELDS : []
  if (!allowed.length) return forbidden()

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(requested)) {
    if (!allowed.includes(k)) return forbidden(`You can't change ${k}.`)
    updates[k] = v
  }
  if ('status' in updates && !STATUSES.includes(updates.status as string)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
  }

  const db = createServerClient()
  let query = db.from('agents').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (!caller.isPlatformAdmin) query = query.eq('tenant_id', caller.tenantId)
  const { data, error } = await query.select(isAdmin(caller) ? ADMIN_COLUMNS : AGENT_COLUMNS).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === caller.id) return NextResponse.json({ error: 'You can\'t delete your own login.' }, { status: 400 })

  const db = createServerClient()
  let query = db.from('agents').delete().eq('id', id)
  if (!caller.isPlatformAdmin) query = query.eq('tenant_id', caller.tenantId)
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
