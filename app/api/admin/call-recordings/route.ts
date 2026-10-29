import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getAgentTenantId, NO_TENANT } from '@/lib/caller'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const minDuration = parseInt(searchParams.get('min_duration') || '0')
  const maxDuration = searchParams.get('max_duration') ? parseInt(searchParams.get('max_duration')!) : null
  const agentId = searchParams.get('agent_id')

  const db = createServerClient()
  const tenantId = await getAgentTenantId(db, agentId)

  let query = db
    .from('dialer_calls')
    .select('id, direction, from_number, to_number, duration_seconds, started_at, recording_url, agents(id, name)')
    .not('recording_url', 'is', null)
    .order('started_at', { ascending: false })
    .limit(500)

  query = query.eq('tenant_id', tenantId ?? NO_TENANT)
  if (minDuration > 0) query = query.gte('duration_seconds', minDuration)
  if (maxDuration !== null) query = query.lte('duration_seconds', maxDuration)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
