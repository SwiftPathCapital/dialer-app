import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, isAdmin, agentInTenant, unauthorized, forbidden } from '@/lib/caller'
import { applyLeadFilters } from '@/lib/leadQueue'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const caller = await getCaller()
  if (!caller) return unauthorized()
  // agent_id switches on "dialer queue" mode; the queue is always the signed-in agent's own.
  const agentId = searchParams.get('agent_id') ? caller.id : null
  const phone = searchParams.get('phone') || ''
  const search = searchParams.get('search') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '100') || 100, 1000)
  const countOnly = searchParams.get('count') === '1'

  const db = createServerClient()
  const tenantId = caller.tenantId
  const filterOpts = { agentId, phone, search, tenantId }

  if (countOnly) {
    const countQuery = await applyLeadFilters(db, db.from('leads').select('id', { count: 'exact', head: true }), filterOpts)
    const { count, error } = await countQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ total: count ?? 0 })
  }

  let query = db
    .from('leads')
    .select('id, name, first_name, last_name, phone, company_name, email, state, city, status, lead_type, lead_type_label, assigned_to, created_at, revenue, monthly_deposit, requested_amount, tib, fico, employee_size, why_funds, last_called_at, lead_tags(tags(id, name, color))')
    .limit(limit)

  // Dialer queue: never-called leads first, then whichever eligible lead has gone
  // longest without a call — so a fresh load works through new leads before recycling
  // old ones, instead of always the same newest-by-creation slice.
  query = (agentId && !phone && !search)
    ? query.order('last_called_at', { ascending: true, nullsFirst: true }).order('created_at', { ascending: true })
    : query.order('created_at', { ascending: false })

  query = await applyLeadFilters(db, query, filterOpts)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the lead_tags(tags(...)) join into a plain tags[] array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (data ?? []).map((row: any) => {
    const { lead_tags, ...rest } = row
    return { ...rest, tags: (lead_tags ?? []).map((lt: any) => lt.tags).filter(Boolean) }
  })

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const body = await req.json()
  const { id, ...updates } = body
  delete updates.tenant_id
  delete updates.created_at
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const db = createServerClient()

  // Reassigning a lead is an admin action, and only to someone in the same account.
  if ('assigned_to' in updates && updates.assigned_to !== null) {
    if (!isAdmin(caller)) return forbidden()
    if (!(await agentInTenant(db, updates.assigned_to, caller.tenantId))) return forbidden('That agent is not in this account.')
  }

  const { data, error } = await db.from('leads').update(updates).eq('id', id).eq('tenant_id', caller.tenantId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const body = await req.json()
  const db = createServerClient()

  const { data, error } = await db
    .from('leads')
    .insert({
      phone:          body.phone          || null,
      first_name:     body.first_name     || null,
      last_name:      body.last_name      || null,
      company_name:   body.company_name   || null,
      email:          body.email          || null,
      lead_type_label:body.lead_source    || null,
      lead_type:      body.lead_source    || null,
      why_funds:      body.notes          || null,
      status:         'New',
      assigned_to:    caller.id,
      created_at:     new Date().toISOString(),
      tenant_id:      caller.tenantId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
