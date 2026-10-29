import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getCaller, unauthorized } from '@/lib/caller'
import { fetchFundedDeals, TEMPLATE_COLUMNS } from '@/lib/reports'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || 'today'
  const filterAgentId = searchParams.get('filter_agent_id') || undefined
  const caller = await getCaller()
  if (!caller) return unauthorized()
  const tenantId = caller.tenantId
  const db = createServerClient()

  try {
    const rows = await fetchFundedDeals(db, tenantId, { range, filter_agent_id: filterAgentId })
    return NextResponse.json({ columns: TEMPLATE_COLUMNS.funded_deals, rows })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 500 })
  }
}
