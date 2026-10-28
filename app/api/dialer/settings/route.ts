import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getDialerSettings, validateSettingsPatch, PLATFORM_ONLY_FIELDS, TENANT_ADMIN_FIELDS } from '@/lib/dialerSettings'
import { resolveTargetTenant } from '@/lib/dialerAccess'
import { getConfigValue } from '@/lib/telnyx'

// GET: any agent can read their own tenant's flags (the Softphone needs them); admins also
// get the tenant's inbound groups for the callback-routing picker.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const db = createServerClient()
  const target = await resolveTargetTenant(db, searchParams.get('agent_id'), searchParams.get('tenant_id'), { requireAdmin: false })
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status })

  const settings = await getDialerSettings(db, target.tenantId)
  const isAdmin = target.actor.is_platform_admin || (target.actor.role === 'admin' && target.actor.tenant_id === target.tenantId)

  let groups: { id: string; name: string }[] = []
  let predictiveReady = false
  if (isAdmin) {
    const { data } = await db.from('inbound_groups').select('id, name').eq('tenant_id', target.tenantId).order('name')
    groups = data ?? []
    predictiveReady = !!(await getConfigValue('telnyx_call_control_connection_id'))
  }

  return NextResponse.json({ settings, groups, isAdmin, isPlatformAdmin: target.actor.is_platform_admin, predictiveReady })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { agent_id, tenant_id, ...patch } = body as Record<string, unknown>
  const db = createServerClient()
  const target = await resolveTargetTenant(db, agent_id as string, tenant_id as string, { requireAdmin: true })
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status })

  const allowed: readonly string[] = target.actor.is_platform_admin
    ? [...PLATFORM_ONLY_FIELDS, ...TENANT_ADMIN_FIELDS]
    : TENANT_ADMIN_FIELDS
  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) {
      return NextResponse.json({ error: (PLATFORM_ONLY_FIELDS as readonly string[]).includes(k) ? 'Only your account manager can change add-ons' : `Unknown setting: ${k}` }, { status: 403 })
    }
    updates[k] = v
  }
  const invalid = validateSettingsPatch(updates)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  if (typeof updates.business_name === 'string') updates.business_name = updates.business_name.trim() || null
  if (updates.callback_group_id) {
    const { data: group } = await db.from('inbound_groups').select('id').eq('id', updates.callback_group_id as string).eq('tenant_id', target.tenantId).maybeSingle()
    if (!group) return NextResponse.json({ error: 'That group belongs to a different account' }, { status: 400 })
  }

  const { error } = await db
    .from('dialer_tenant_settings')
    .upsert({ tenant_id: target.tenantId, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: await getDialerSettings(db, target.tenantId) })
}
