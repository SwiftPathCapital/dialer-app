import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [agentsRes, activeCallsRes, todayCallsRes] = await Promise.all([
    db.from('agents').select('id, name, email, status').order('name'),
    db.from('dialer_calls')
      .select('agent_id, group_id, direction, from_number, to_number, status, started_at, telnyx_call_control_id')
      .in('status', ['initiated', 'ringing', 'active'])
      .order('started_at', { ascending: false }),
    db.from('dialer_calls')
      .select('agent_id')
      .gte('started_at', today.toISOString()),
  ])

  const agents = agentsRes.data || []
  const activeCalls = activeCallsRes.data || []
  const todayCalls = todayCallsRes.data || []

  const result = agents.map(agent => {
    const activeCall = activeCalls.find(c => c.agent_id === agent.id) ?? null
    return {
      ...agent,
      activeCall: activeCall
        ? {
            direction: activeCall.direction,
            remoteNumber: activeCall.direction === 'inbound' ? activeCall.from_number : activeCall.to_number,
            status: activeCall.status,
            started_at: activeCall.started_at,
            telnyx_call_control_id: activeCall.telnyx_call_control_id,
          }
        : null,
      callsToday: todayCalls.filter(c => c.agent_id === agent.id).length,
    }
  })

  return NextResponse.json(result)
}
