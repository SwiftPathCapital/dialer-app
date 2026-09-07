import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'

function rangeStart(range: string): string {
  const now = new Date()
  if (range === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString()
  }
  if (range === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
  if (range === 'month') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }
  return '1970-01-01T00:00:00.000Z'
}

const APP_DISPOS = ['App Received', 'App Signed']
const FUNDED_DISPOS = ['Deal Funded']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || 'today'
  const detail = searchParams.get('detail') // 'all' | 'inbound' | 'outbound' | 'apps' | 'funded'
  const agentId = searchParams.get('agent_id')
  const db = createServerClient()
  const tenantId = agentId ? await getAgentTenantId(db, agentId) : null

  // Exclude ghost rows created by old Dialpad double-POST bug (null telnyx_call_control_id)
  let baseQuery = db
    .from('dialer_calls')
    .select('direction, disposition, status, from_number, to_number, started_at, duration_seconds, agents(id, name)')
    .gte('started_at', rangeStart(range))
    .not('telnyx_call_control_id', 'is', null)
  if (tenantId) baseQuery = baseQuery.eq('tenant_id', tenantId)

  const { data: calls } = await baseQuery
  if (!calls) return NextResponse.json({ error: 'Query failed' }, { status: 500 })

  // If detail requested, return filtered call list instead of aggregate
  if (detail) {
    let subset = calls as typeof calls
    if (detail === 'inbound') subset = calls.filter(c => c.direction === 'inbound')
    else if (detail === 'outbound') subset = calls.filter(c => c.direction === 'outbound')
    else if (detail === 'apps') subset = calls.filter(c => c.disposition && APP_DISPOS.includes(c.disposition))
    else if (detail === 'funded') subset = calls.filter(c => c.disposition && FUNDED_DISPOS.includes(c.disposition))
    return NextResponse.json(subset.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()))
  }

  const tally = (subset: typeof calls) => {
    const counts: Record<string, number> = {}
    for (const c of subset) {
      if (!c.disposition) continue
      counts[c.disposition] = (counts[c.disposition] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([disposition, count]) => ({ disposition, count }))
  }

  const inbound = calls.filter(c => c.direction === 'inbound')
  const outbound = calls.filter(c => c.direction === 'outbound')
  const apps = calls.filter(c => c.disposition && APP_DISPOS.includes(c.disposition))
  const funded = calls.filter(c => c.disposition && FUNDED_DISPOS.includes(c.disposition))

  return NextResponse.json({
    range,
    totals: {
      all: calls.length,
      inbound: inbound.length,
      outbound: outbound.length,
      apps: apps.length,
      funded: funded.length,
    },
    byDisposition: {
      all: tally(calls),
      inbound: tally(inbound),
      outbound: tally(outbound),
    },
  })
}
