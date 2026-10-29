import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { resolveTargetTenant } from '@/lib/dialerAccess'
import { getDialerSettings } from '@/lib/dialerSettings'
import { chooseCallerId, type CallerIdRow } from '@/lib/localPresence'
import { QUEUE_EXCLUDED_STATUSES } from '@/lib/leadQueue'
import { normalizeState } from '@/lib/callingHours'

const COLUMNS = 'id, phone_number, area_code, state, label, enabled, sms_enabled, callback_mode, callback_group_id, created_at'

// GET: the tenant's local presence numbers plus a coverage summary — how many of the
// tenant's dialable leads would get an area-code match, a same-state number, or neither.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const db = createServerClient()
  const target = await resolveTargetTenant(searchParams.get('tenant_id'), { requireAdmin: true })
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status })

  const { data: numbers, error } = await db
    .from('dialer_caller_ids')
    .select(COLUMNS)
    .eq('tenant_id', target.tenantId)
    .order('state', { ascending: true, nullsFirst: false })
    .order('phone_number')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Page through leads — PostgREST caps a single response at 1,000 rows.
  const coverage = { area_code: 0, state: 0, none: 0, total: 0 }
  const enabled = (numbers ?? []).filter(n => n.enabled) as CallerIdRow[]
  const PAGE = 1000
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data: leads } = await db
      .from('leads')
      .select('phone, state')
      .eq('tenant_id', target.tenantId)
      .not('status', 'in', `(${QUEUE_EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)
      .not('phone', 'is', null)
      .range(from, from + PAGE - 1)
    if (!leads?.length) break
    for (const l of leads) {
      coverage[chooseCallerId(enabled, l.phone, l.state).match]++
      coverage.total++
    }
    if (leads.length < PAGE) break
  }

  return NextResponse.json({ numbers: numbers ?? [], coverage })
}

export async function PATCH(req: NextRequest) {
  const { agent_id: _ignored, tenant_id, id, ...patch } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const db = createServerClient()
  const target = await resolveTargetTenant(tenant_id, { requireAdmin: true })
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })
    updates.enabled = patch.enabled
  }
  if ('label' in patch) updates.label = typeof patch.label === 'string' && patch.label.trim() ? patch.label.trim().slice(0, 80) : null
  if ('state' in patch) {
    const st = patch.state ? normalizeState(patch.state) : null
    if (patch.state && !st) return NextResponse.json({ error: 'Unknown state' }, { status: 400 })
    updates.state = st
  }
  if ('sms_enabled' in patch) {
    if (typeof patch.sms_enabled !== 'boolean') return NextResponse.json({ error: 'sms_enabled must be true or false' }, { status: 400 })
    if (patch.sms_enabled && !(await getDialerSettings(db, target.tenantId)).local_presence_sms_enabled) {
      return NextResponse.json({ error: 'Texting from local numbers is an add-on — ask your account manager to turn it on.' }, { status: 403 })
    }
    updates.sms_enabled = patch.sms_enabled
  }
  if ('callback_mode' in patch) {
    if (patch.callback_mode !== null && !['last_agent', 'group'].includes(patch.callback_mode)) {
      return NextResponse.json({ error: 'callback_mode must be last_agent, group, or null (use the account default)' }, { status: 400 })
    }
    updates.callback_mode = patch.callback_mode
  }
  if ('callback_group_id' in patch) {
    if (patch.callback_group_id) {
      const { data: group } = await db.from('inbound_groups').select('id').eq('id', patch.callback_group_id).eq('tenant_id', target.tenantId).maybeSingle()
      if (!group) return NextResponse.json({ error: 'That group belongs to a different account' }, { status: 400 })
    }
    updates.callback_group_id = patch.callback_group_id || null
  }

  const { data, error } = await db
    .from('dialer_caller_ids')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', target.tenantId)
    .select(COLUMNS)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Number not found' }, { status: 404 })
  return NextResponse.json(data)
}
