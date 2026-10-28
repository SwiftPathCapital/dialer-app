import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { resolveTargetTenant } from '@/lib/dialerAccess'
import { tenantAbandonStats, HEARTBEAT_STALE_MS } from '@/lib/predictive/engine'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const db = createServerClient()
  const target = await resolveTargetTenant(db, searchParams.get('agent_id'), searchParams.get('tenant_id'), { requireAdmin: true })
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status })

  const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString()
  const [stats, { data: sessions }] = await Promise.all([
    tenantAbandonStats(db, target.tenantId),
    db.from('dialer_agent_sessions').select('status').eq('tenant_id', target.tenantId).neq('status', 'ended').gte('last_heartbeat_at', staleCutoff),
  ])
  return NextResponse.json({
    ...stats,
    readyAgents: (sessions ?? []).filter(s => s.status === 'ready').length,
    onCall: (sessions ?? []).filter(s => s.status === 'on_call').length,
  })
}
