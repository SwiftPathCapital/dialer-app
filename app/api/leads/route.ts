import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyLeadFilters(db: any, query: any, opts: {
  agentId: string | null
  phone: string
  search: string
  tenantId: string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any> {
  const { agentId, phone, search, tenantId } = opts

  if (tenantId) query = query.eq('tenant_id', tenantId)

  if (phone) {
    query = query.ilike('phone', `%${phone}%`)
  } else if (search) {
    // A plain contact search (e.g. picking an existing customer for a new moisture
    // mapping project) — intentionally skips the dialer-queue-eligibility filters
    // below (DNC, cooldown, assignment, enabled sources) since those describe "who's
    // next to call," not "does this contact exist." A DNC'd or already-called contact
    // should still be findable by name/phone.
    query = query.or(`company_name.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`)
  } else {
    if (agentId) {
      // Agents with can_view_all_leads see the full pool; others only their
      // assigned leads plus unassigned ones.
      const { data: agentRow } = await db
        .from('agents')
        .select('can_view_all_leads')
        .eq('id', agentId)
        .single()

      if (!agentRow?.can_view_all_leads) {
        query = query.or(`assigned_to.eq.${agentId},assigned_to.is.null`)
      }

      // Filter by enabled lead sources when loading the dialer queue
      let sourcesQuery = db.from('lead_sources').select('name').eq('enabled', true)
      if (tenantId) sourcesQuery = sourcesQuery.eq('tenant_id', tenantId)
      const { data: sourceRows } = await sourcesQuery

      const activeSources = (sourceRows ?? []).map((r: { name: string }) => r.name)

      if (activeSources.length > 0) {
        query = query.in('lead_type', activeSources)
      }

      // Exclude leads called in the last 8 hours from the dialer queue
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
      query = query.or(`last_called_at.is.null,last_called_at.lt.${eightHoursAgo}`)

      // Permanently exclude leads that should never be called again
      query = query.not('status', 'in', '("DNC","Not Interested","Wrong Number","App Received","Docs Received","Pending App & Docs","Deal Funded")')
    }
  }

  return query
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const phone = searchParams.get('phone') || ''
  const search = searchParams.get('search') || ''
  const limit = parseInt(searchParams.get('limit') || '100')
  const countOnly = searchParams.get('count') === '1'

  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null
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
  const body = await req.json()
  const { id, ...updates } = body
  const db = createServerClient()
  const { error } = await db.from('leads').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const tenantId = body.agent_id ? await getAgentTenantId(db, body.agent_id) : null

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
      assigned_to:    body.agent_id       || null,
      created_at:     new Date().toISOString(),
      ...(tenantId ? { tenant_id: tenantId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
