import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

// Deterministic per-agent shuffle so no two agents start on the same lead.
// Uses the agent's UUID as a seed → same agent always gets the same order,
// different agents always get a different order.
function agentSeed(agentId: string): number {
  let h = 0
  for (let i = 0; i < agentId.length; i++) h = Math.imul(31, h) + agentId.charCodeAt(i) | 0
  return h >>> 0
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed | 1
  const rand = () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const phone = searchParams.get('phone') || ''
  const search = searchParams.get('search') || ''
  const limit = parseInt(searchParams.get('limit') || '100')

  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  let query = db
    .from('leads')
    .select('id, name, first_name, last_name, phone, company_name, email, state, city, status, lead_type, lead_type_label, assigned_to, created_at, revenue, monthly_deposit, requested_amount, tib, fico, employee_size, why_funds, last_called_at, lead_tags(tags(id, name, color))')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  if (phone) {
    query = query.ilike('phone', `%${phone}%`)
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

      const activeSources = (sourceRows ?? []).map(r => r.name)

      if (activeSources.length > 0) {
        query = query.in('lead_type', activeSources)
      }

      // Exclude leads called in the last 8 hours from the dialer queue
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
      query = query.or(`last_called_at.is.null,last_called_at.lt.${eightHoursAgo}`)

      // Permanently exclude leads that should never be called again
      query = query.not('status', 'in', '("DNC","Not Interested","Wrong Number","App Received","Docs Received","Pending App & Docs","Deal Funded")')
    }
    if (search) {
      query = query.or(`company_name.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the lead_tags(tags(...)) join into a plain tags[] array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flattened = (data ?? []).map((row: any) => {
    const { lead_tags, ...rest } = row
    return { ...rest, tags: (lead_tags ?? []).map((lt: any) => lt.tags).filter(Boolean) }
  })

  // Shuffle the dialer queue per agent so they don't all start on the same lead
  const result = (agentId && !phone && !search)
    ? seededShuffle(flattened, agentSeed(agentId))
    : flattened

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
