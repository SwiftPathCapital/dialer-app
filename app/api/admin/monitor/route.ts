import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const db = createServerClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [agentsRes, activeCallsRes, todayCallsRes, membershipsRes] = await Promise.all([
    db.from('agents').select('id, name, email, status').order('name'),
    db.from('dialer_calls')
      .select('agent_id, group_id, direction, from_number, to_number, status, started_at, telnyx_call_control_id')
      .in('status', ['initiated', 'ringing', 'active'])
      .gte('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .order('started_at', { ascending: false }),
    db.from('dialer_calls')
      .select('agent_id')
      .gte('started_at', today.toISOString()),
    db.from('inbound_group_members').select('agent_id, group_id'),
  ])

  const agents = agentsRes.data || []
  const activeCalls = activeCallsRes.data || []
  const todayCalls = todayCallsRes.data || []
  const memberships: { agent_id: string; group_id: string }[] = membershipsRes.data || []

  // Group calls (agent_id is null, group_id is set) — ringing all members simultaneously
  const groupCalls = activeCalls.filter(c => !c.agent_id && c.group_id)

  const result = agents.map(agent => {
    // Direct call attributed to this agent
    let activeCall = activeCalls.find(c => c.agent_id === agent.id) ?? null

    // Fall back: group call ringing/active for a group this agent belongs to
    if (!activeCall) {
      const agentGroupIds = memberships.filter(m => m.agent_id === agent.id).map(m => m.group_id)
      const groupCall = groupCalls.find(c => agentGroupIds.includes(c.group_id!)) ?? null
      activeCall = groupCall
    }

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
