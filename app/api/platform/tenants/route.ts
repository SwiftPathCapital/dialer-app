import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// This is the one place in the app that gets a real server-side authorization check rather
// than trusting the client — creating a tenant + its first login is a much higher-stakes
// action than viewing your own data, so it's worth the one exception.
async function requirePlatformAdmin(db: ReturnType<typeof createServerClient>, agentId: string | null) {
  if (!agentId) return false
  const { data } = await db.from('agents').select('is_platform_admin').eq('id', agentId).single()
  return !!data?.is_platform_admin
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  if (!(await requirePlatformAdmin(db, agentId))) {
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
  const { agent_id, name, admin_name, admin_email, admin_password } = body

  const db = createServerClient()
  if (!(await requirePlatformAdmin(db, agent_id))) {
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
  const { agent_id, tenant_id, hidden_features } = await req.json()

  const db = createServerClient()
  if (!(await requirePlatformAdmin(db, agent_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!tenant_id || !Array.isArray(hidden_features)) {
    return NextResponse.json({ error: 'tenant_id and hidden_features are required' }, { status: 400 })
  }

  const { error } = await db.from('tenants').update({ hidden_features }).eq('id', tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
