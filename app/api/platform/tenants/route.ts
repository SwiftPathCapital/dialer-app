import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller } from '@/lib/caller'

// Decided by the signed-in caller (proxy also blocks non-super-admins from /api/platform).
async function requirePlatformAdmin() {
  return !!(await getCaller())?.isPlatformAdmin
}

export async function GET() {
  const db = createServerClient()
  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: tenants, error } = await db
    .from('tenants')
    .select('id, name, slug, created_at, hidden_features')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tenants?.length) return NextResponse.json([])

  const { data: agents } = await db.from('agents').select('id, tenant_id')
  const countByTenant = new Map<string, number>()
  for (const a of agents ?? []) {
    countByTenant.set(a.tenant_id, (countByTenant.get(a.tenant_id) ?? 0) + 1)
  }

  return NextResponse.json(
    tenants.map(t => ({ ...t, agent_count: countByTenant.get(t.id) ?? 0 }))
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, admin_name, admin_email, admin_password } = body

  const db = createServerClient()
  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!name?.trim() || !admin_name?.trim() || !admin_email?.trim() || !admin_password?.trim()) {
    return NextResponse.json({ error: 'name, admin_name, admin_email, and admin_password are required' }, { status: 400 })
  }
  if (admin_password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .insert({ name: name.trim(), slug })
    .select()
    .single()
  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })

  // Real Supabase Auth account via the Admin API — this route runs on Railway, which has
  // normal network access, so (unlike a sandboxed dev tool) this is the fully-supported path.
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email: admin_email.trim(),
    password: admin_password,
    email_confirm: true,
  })
  if (authError || !authData?.user) {
    // Roll back the tenant so a failed signup doesn't leave an orphaned tenant row behind.
    await db.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json({ error: authError?.message || 'Could not create the admin login' }, { status: 500 })
  }

  const { data: newAgent, error: agentError } = await db
    .from('agents')
    .insert({
      id: authData.user.id,
      name: admin_name.trim(),
      email: admin_email.trim(),
      role: 'admin',
      tenant_id: tenant.id,
      status: 'offline',
    })
    .select()
    .single()

  if (agentError) {
    await db.auth.admin.deleteUser(authData.user.id)
    await db.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json({ error: agentError.message }, { status: 500 })
  }

  return NextResponse.json({ tenant, admin: newAgent })
}

export async function PATCH(req: NextRequest) {
  const { tenant_id, hidden_features } = await req.json()

  const db = createServerClient()
  if (!(await requirePlatformAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!tenant_id || !Array.isArray(hidden_features)) {
    return NextResponse.json({ error: 'tenant_id and hidden_features are required' }, { status: 400 })
  }

  const { error } = await db.from('tenants').update({ hidden_features }).eq('id', tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
