import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const { id, disposition, notes } = await req.json()
  const db = createServerClient()
  const { error } = await db
    .from('dialer_calls')
    .update({ disposition: disposition ?? null, notes: notes ?? null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id') || ''
  const requesterId = searchParams.get('requester_id') || ''
  const limit = parseInt(searchParams.get('limit') || '200')

  const db = createServerClient()
  const tenantId = requesterId ? await getAgentTenantId(db, requesterId) : null

  // When filtering by agent, also include inbound group calls for their groups
  let groupIds: string[] = []
  if (agentId) {
    const { data: memberships } = await db
      .from('inbound_group_members')
      .select('group_id')
      .eq('agent_id', agentId)
    groupIds = memberships?.map((m: { group_id: string }) => m.group_id) ?? []
  }

  let query = db
    .from('dialer_calls')
    .select('id, direction, from_number, to_number, status, disposition, notes, duration_seconds, started_at, agent_id, group_id, agents(id, name, email)')
    .not('telnyx_call_control_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (tenantId) query = query.eq('tenant_id', tenantId)

  if (agentId && groupIds.length > 0) {
    query = query.or(`agent_id.eq.${agentId},group_id.in.(${groupIds.join(',')})`)
  } else if (agentId) {
    query = query.eq('agent_id', agentId)
  }

  const { data: calls, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!calls || calls.length === 0) return NextResponse.json([])

  // ── Enrich with lead name by matching phone digits ─────────────────────────
  // Extract the unique "remote" number for each call (the non-agent side)
  const uniqueDigits = [
    ...new Set(
      calls.map(c => {
        const raw = c.direction === 'inbound' ? c.from_number : c.to_number
        return (raw || '').replace(/\D/g, '')
      }).filter(d => d.length >= 7)
    ),
  ]

  let leadsByDigits = new Map<string, { id: string; display: string }>()

  if (uniqueDigits.length > 0) {
    // One query with OR-ILIKE for all numbers in this batch
    const orFilter = uniqueDigits.map(d => `phone.ilike.%${d}%`).join(',')
    let leadsQuery = db
      .from('leads')
      .select('id, first_name, last_name, name, company_name, phone')
      .or(orFilter)
    if (tenantId) leadsQuery = leadsQuery.eq('tenant_id', tenantId)
    const { data: leads } = await leadsQuery

    for (const lead of leads || []) {
      const d = (lead.phone || '').replace(/\D/g, '')
      if (!d) continue
      const display =
        lead.company_name ||
        [lead.first_name, lead.last_name].filter(Boolean).join(' ') ||
        lead.name ||
        ''
      if (display) leadsByDigits.set(d, { id: lead.id, display })
    }
  }

  const enriched = calls.map(c => {
    const digits = (c.direction === 'inbound' ? c.from_number : c.to_number || '').replace(/\D/g, '')
    const lead = leadsByDigits.get(digits)
    return {
      ...c,
      lead_name: lead?.display ?? null,
      lead_id: lead?.id ?? null,
    }
  })

  return NextResponse.json(enriched)
}
