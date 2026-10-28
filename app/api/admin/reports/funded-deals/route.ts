import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getAgentTenantId } from '@/lib/supabase'
import { fetchFundedDeals, TEMPLATE_COLUMNS } from '@/lib/reports'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent_id')
  const range = searchParams.get('range') || 'today'
  const filterAgentId = searchParams.get('filter_agent_id') || undefined
  if (!agentId) return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agentId)
  if (!tenantId) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })

  try {
    const rows = await fetchFundedDeals(db, tenantId, { range, filter_agent_id: filterAgentId })
    return NextResponse.json({ columns: TEMPLATE_COLUMNS.funded_deals, rows })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 })
  }
}
